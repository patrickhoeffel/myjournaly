import { useEffect, useRef, useState } from "react";
import {
  Box,
  CircularProgress,
  Divider,
  FormControl,
  IconButton,
  InputLabel,
  List,
  ListItemButton,
  ListItemText,
  MenuItem,
  Select,
  TextField,
  Typography,
} from "@mui/material";
import {
  Chat as ChatIcon,
  Close,
  Send,
  Add,
  Delete,
  NoteAdd,
} from "@mui/icons-material";
import { Tooltip } from "@mui/material";
import ReactMarkdown from "react-markdown";
import { apiFetch } from "../lib/api";
import { auth } from "../lib/firebase";
import { emitDataUpdated } from "../lib/eventBus";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8080";

interface Agent {
  id: string;
  name: string;
  description: string;
}

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface Conversation {
  id: string;
  title: string;
  agent_id: string;
  updated_at: string;
}

interface JournalChatProps {
  /** Pass the current journal entry context to the chat */
  entryTitle?: string;
  entryText?: string;
  onClose: () => void;
  onCopyToJournal?: (text: string) => void;
}

export default function JournalChat({ onClose, onCopyToJournal }: JournalChatProps) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgent, setSelectedAgentState] = useState("");
  const setSelectedAgent = (id: string) => {
    setSelectedAgentState(id);
    if (id) {
      apiFetch("/users/me/data/system_preference/preferred_agent", {
        method: "PUT",
        body: JSON.stringify({ value: id }),
      }).catch(() => {});
    }
  };
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvIdState] = useState<string | null>(
    () => sessionStorage.getItem("journal_chat_conv_id")
  );
  const setActiveConvId = (id: string | null) => {
    setActiveConvIdState(id);
    if (id) {
      sessionStorage.setItem("journal_chat_conv_id", id);
    } else {
      sessionStorage.removeItem("journal_chat_conv_id");
    }
  };
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Load agents on mount, and restore active conversation if one was saved
  useEffect(() => {
    const init = async () => {
      try {
        const [data, pref] = await Promise.all([
          apiFetch("/chat/agents"),
          apiFetch("/users/me/data/system_preference/preferred_agent").catch(() => null),
        ]);
        setAgents(data);
        const preferredId = pref?.value;
        const validPreferred = preferredId && data.some((a: Agent) => a.id === preferredId);
        if (validPreferred) {
          setSelectedAgentState(preferredId);
        } else if (data.length > 0) {
          setSelectedAgent(data[0].id);
        }
      } catch {
        setAgents([]);
      }

      // Restore previous conversation
      const savedConvId = sessionStorage.getItem("journal_chat_conv_id");
      if (savedConvId) {
        try {
          const data = await apiFetch(`/chat/conversations/${savedConvId}`);
          setMessages(data.messages || []);
          setActiveConvIdState(savedConvId);
          if (data.agent_id) setSelectedAgentState(data.agent_id);
        } catch {
          // Conversation no longer exists — clear it
          sessionStorage.removeItem("journal_chat_conv_id");
          setActiveConvIdState(null);
        }
      }
    };
    init();
  }, []);

  const loadConversations = async () => {
    try {
      const data = await apiFetch("/chat/conversations");
      setConversations(data);
    } catch {
      setConversations([]);
    }
  };

  const loadConversation = async (convId: string) => {
    try {
      const data = await apiFetch(`/chat/conversations/${convId}`);
      setMessages(data.messages || []);
      setActiveConvId(convId);
      setSelectedAgent(data.agent_id);
      setShowHistory(false);
    } catch {
      // ignore
    }
  };

  const startNewConversation = () => {
    setActiveConvIdState(null);
    sessionStorage.removeItem("journal_chat_conv_id");
    setMessages([]);
    setShowHistory(false);
  };

  const handleSend = async () => {
    if (!input.trim() || !selectedAgent || streaming) return;

    const userMessage = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setStreaming(true);

    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`${API_BASE}/api/v1/chat/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          message: userMessage,
          agent_id: selectedAgent,
          conversation_id: activeConvId,
        }),
      });

      if (!res.ok) throw new Error("Chat request failed");

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let assistantContent = "";

      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });

        const convIdMatch = chunk.match(/\[\[CONV_ID:(.+?)\]\]/);
        if (convIdMatch) {
          setActiveConvId(convIdMatch[1]);
          const cleanChunk = chunk.replace(/\n?\[\[CONV_ID:.+?\]\]/, "");
          if (cleanChunk) {
            assistantContent += cleanChunk;
            setMessages((prev) => {
              const updated = [...prev];
              updated[updated.length - 1] = { role: "assistant", content: assistantContent };
              return updated;
            });
          }
        } else {
          assistantContent += chunk;
          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = { role: "assistant", content: assistantContent };
            return updated;
          });
        }
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Sorry, something went wrong. Please try again." },
      ]);
    } finally {
      setStreaming(false);
      emitDataUpdated();
    }
  };

  const handleDeleteConversation = async (convId: string) => {
    try {
      await apiFetch(`/chat/conversations/${convId}`, { method: "DELETE" });
      setConversations((prev) => prev.filter((c) => c.id !== convId));
      if (activeConvId === convId) startNewConversation();
    } catch {
      // ignore
    }
  };

  const toggleHistory = () => {
    if (!showHistory) loadConversations();
    setShowHistory(!showHistory);
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%", minWidth: 0 }}>
      {/* Header */}
      <Box
        sx={{
          px: 1.5,
          py: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: 1,
          borderColor: "divider",
        }}
      >
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          Chat
        </Typography>
        <Box sx={{ display: "flex", gap: 0.25 }}>
          <IconButton size="small" onClick={toggleHistory} title="History">
            <ChatIcon sx={{ fontSize: 18 }} />
          </IconButton>
          <IconButton size="small" onClick={startNewConversation} title="New chat">
            <Add sx={{ fontSize: 18 }} />
          </IconButton>
          <IconButton size="small" onClick={onClose} title="Close">
            <Close sx={{ fontSize: 18 }} />
          </IconButton>
        </Box>
      </Box>

      {showHistory ? (
        <Box sx={{ flexGrow: 1, overflow: "auto" }}>
          <List dense>
            {conversations.map((conv) => (
              <ListItemButton
                key={conv.id}
                selected={conv.id === activeConvId}
                onClick={() => loadConversation(conv.id)}
              >
                <ListItemText
                  primary={conv.title}
                  secondary={new Date(conv.updated_at).toLocaleDateString()}
                  primaryTypographyProps={{ noWrap: true, fontSize: "0.85rem" }}
                />
                <IconButton
                  size="small"
                  onClick={(e) => { e.stopPropagation(); handleDeleteConversation(conv.id); }}
                >
                  <Delete sx={{ fontSize: 16 }} />
                </IconButton>
              </ListItemButton>
            ))}
            {conversations.length === 0 && (
              <Typography variant="body2" color="text.secondary" sx={{ p: 2, textAlign: "center" }}>
                No conversations yet
              </Typography>
            )}
          </List>
        </Box>
      ) : (
        <>
          {/* Agent selector */}
          {agents.length > 0 && (
            <Box sx={{ px: 1.5, py: 1 }}>
              <FormControl size="small" fullWidth>
                <InputLabel>Agent</InputLabel>
                <Select
                  label="Agent"
                  value={selectedAgent}
                  onChange={(e) => setSelectedAgent(e.target.value)}
                  disabled={!!activeConvId}
                >
                  {agents.map((a) => (
                    <MenuItem key={a.id} value={a.id}>{a.name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>
          )}

          {agents.length === 0 && (
            <Box sx={{ p: 2 }}>
              <Typography variant="body2" color="text.secondary">
                No agents configured.
              </Typography>
            </Box>
          )}

          <Divider />

          {/* Messages */}
          <Box
            sx={{
              flexGrow: 1,
              overflowY: "auto",
              overflowX: "hidden",
              p: 1.5,
              display: "flex",
              flexDirection: "column",
              gap: 1,
            }}
          >
            {messages.length === 0 && (
              <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center", mt: 4 }}>
                Ask a question about your journal entry...
              </Typography>
            )}
            {messages.map((msg, i) => (
              <Box
                key={i}
                sx={{
                  alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
                  maxWidth: "90%",
                  position: "relative",
                  "&:hover .copy-to-journal": { opacity: 1 },
                }}
              >
                <Box
                  data-msg-index={i}
                  sx={{
                    px: 1.5,
                    py: 0.75,
                    borderRadius: 2,
                    bgcolor: msg.role === "user" ? "primary.main" : "action.hover",
                    color: msg.role === "user" ? "primary.contrastText" : "text.primary",
                    wordBreak: "break-word",
                    fontSize: "0.85rem",
                    lineHeight: 1.5,
                    ...(msg.role === "user" ? { whiteSpace: "pre-wrap" } : {
                      "& p": { m: 0, mb: 0.75, "&:last-child": { mb: 0 } },
                      "& ul, & ol": { m: 0, mb: 0.75, pl: 2.5, "&:last-child": { mb: 0 } },
                      "& li": { mb: 0.25 },
                      "& strong": { fontWeight: 600 },
                      "& em": { fontStyle: "italic" },
                      "& code": { bgcolor: "rgba(0,0,0,0.06)", px: 0.5, borderRadius: 0.5, fontFamily: "monospace", fontSize: "0.8rem" },
                      "& pre": { bgcolor: "rgba(0,0,0,0.06)", p: 1, borderRadius: 1, overflow: "auto", mb: 0.75, "& code": { bgcolor: "transparent", p: 0 } },
                      "& blockquote": { borderLeft: "3px solid", borderColor: "divider", pl: 1.5, ml: 0, my: 0.75, color: "text.secondary", fontStyle: "italic" },
                      "& h1, & h2, & h3, & h4": { mt: 1, mb: 0.5, fontSize: "0.95rem", fontWeight: 700 },
                      "& hr": { border: "none", borderTop: "1px solid", borderColor: "divider", my: 1 },
                      "& a": { color: "primary.main", textDecoration: "underline" },
                    }),
                  }}
                >
                  {msg.role === "assistant" ? (
                    <>
                      {msg.content && <ReactMarkdown>{msg.content}</ReactMarkdown>}
                      {msg.content === "" && streaming && (
                        <CircularProgress size={14} sx={{ ml: 1 }} />
                      )}
                    </>
                  ) : (
                    msg.content
                  )}
                </Box>
                {onCopyToJournal && msg.content && (
                  <Tooltip title="Copy to journal entry" placement="left">
                    <IconButton
                      className="copy-to-journal"
                      size="small"
                      onClick={() => {
                        const sel = window.getSelection();
                        const msgEl = document.querySelector(`[data-msg-index="${i}"]`);
                        // Use selected text if the selection is within this message
                        if (sel && sel.toString().trim() && msgEl && sel.anchorNode && msgEl.contains(sel.anchorNode)) {
                          onCopyToJournal(sel.toString());
                        } else {
                          onCopyToJournal(msg.content);
                        }
                      }}
                      sx={{
                        position: "absolute",
                        top: 2,
                        right: -32,
                        opacity: 0,
                        transition: "opacity 0.15s",
                      }}
                    >
                      <NoteAdd sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Tooltip>
                )}
              </Box>
            ))}
            <div ref={messagesEndRef} />
          </Box>

          {/* Input */}
          <Box
            sx={{
              p: 1.5,
              borderTop: 1,
              borderColor: "divider",
              display: "flex",
              gap: 0.5,
            }}
          >
            <TextField
              size="small"
              fullWidth
              placeholder="Type a message..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              disabled={streaming || !selectedAgent}
              multiline
              maxRows={4}
            />
            <IconButton
              color="primary"
              onClick={handleSend}
              disabled={streaming || !input.trim() || !selectedAgent}
              size="small"
            >
              <Send fontSize="small" />
            </IconButton>
          </Box>
        </>
      )}
    </Box>
  );
}
