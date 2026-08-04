import { useEffect, useRef, useState } from "react";
import {
  Box,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  TextField,
  Typography,
  CircularProgress,
  Divider,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
} from "@mui/material";
import {
  Chat as ChatIcon,
  Close,
  Send,
  Add,
  Delete,
} from "@mui/icons-material";
import { apiFetch } from "../lib/api";
import { auth } from "../lib/firebase";
import { emitDataUpdated } from "../lib/eventBus";

const CHAT_WIDTH = 400;
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

interface ChatPanelProps {
  open: boolean;
  onClose: () => void;
}

export default function ChatPanel({ open, onClose }: ChatPanelProps) {
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
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
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

  // Load agents when panel opens
  useEffect(() => {
    if (!open) return;
    const loadAgents = async () => {
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
    };
    loadAgents();
  }, [open]);

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
    setActiveConvId(null);
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

      // Add empty assistant message to stream into
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });

        // Check for conversation ID marker
        const convIdMatch = chunk.match(/\[\[CONV_ID:(.+?)\]\]/);
        if (convIdMatch) {
          setActiveConvId(convIdMatch[1]);
          const cleanChunk = chunk.replace(/\n?\[\[CONV_ID:.+?\]\]/, "");
          if (cleanChunk) {
            assistantContent += cleanChunk;
            setMessages((prev) => {
              const updated = [...prev];
              updated[updated.length - 1] = {
                role: "assistant",
                content: assistantContent,
              };
              return updated;
            });
          }
        } else {
          assistantContent += chunk;
          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = {
              role: "assistant",
              content: assistantContent,
            };
            return updated;
          });
        }
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Sorry, something went wrong. Please try again.",
        },
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
    <>
      {/* Chat drawer */}
      <Drawer
        anchor="right"
        open={open}
        onClose={onClose}
        variant="persistent"
        sx={{
          "& .MuiDrawer-paper": {
            width: CHAT_WIDTH,
            boxSizing: "border-box",
          },
        }}
      >
        <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
          {/* Header */}
          <Box
            sx={{
              p: 2,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              borderBottom: 1,
              borderColor: "divider",
            }}
          >
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              Chat
            </Typography>
            <Box>
              <IconButton size="small" onClick={toggleHistory} title="History">
                <ChatIcon fontSize="small" />
              </IconButton>
              <IconButton
                size="small"
                onClick={startNewConversation}
                title="New chat"
              >
                <Add fontSize="small" />
              </IconButton>
              <IconButton
                size="small"
                onClick={() => onClose()}
                title="Close"
              >
                <Close fontSize="small" />
              </IconButton>
            </Box>
          </Box>

          {showHistory ? (
            /* Conversation history list */
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
                    />
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteConversation(conv.id);
                      }}
                    >
                      <Delete fontSize="small" />
                    </IconButton>
                  </ListItemButton>
                ))}
                {conversations.length === 0 && (
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ p: 2, textAlign: "center" }}
                  >
                    No conversations yet
                  </Typography>
                )}
              </List>
            </Box>
          ) : (
            <>
              {/* Agent selector */}
              {agents.length > 0 && (
                <Box sx={{ px: 2, py: 1 }}>
                  <FormControl size="small" fullWidth>
                    <InputLabel>Agent</InputLabel>
                    <Select
                      label="Agent"
                      value={selectedAgent}
                      onChange={(e) => setSelectedAgent(e.target.value)}
                      disabled={!!activeConvId}
                    >
                      {agents.map((a) => (
                        <MenuItem key={a.id} value={a.id}>
                          {a.name}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Box>
              )}

              {agents.length === 0 && (
                <Box sx={{ p: 2 }}>
                  <Typography variant="body2" color="text.secondary">
                    No agents configured. An admin needs to create one first.
                  </Typography>
                </Box>
              )}

              <Divider />

              {/* Messages */}
              <Box
                sx={{
                  flexGrow: 1,
                  overflow: "auto",
                  p: 2,
                  display: "flex",
                  flexDirection: "column",
                  gap: 1.5,
                }}
              >
                {messages.map((msg, i) => (
                  <Box
                    key={i}
                    sx={{
                      alignSelf:
                        msg.role === "user" ? "flex-end" : "flex-start",
                      maxWidth: "85%",
                    }}
                  >
                    <Box
                      sx={{
                        px: 2,
                        py: 1,
                        borderRadius: 2,
                        bgcolor:
                          msg.role === "user"
                            ? "primary.main"
                            : "grey.100",
                        color:
                          msg.role === "user"
                            ? "primary.contrastText"
                            : "text.primary",
                        whiteSpace: "pre-wrap",
                        fontSize: "0.9rem",
                        lineHeight: 1.5,
                      }}
                    >
                      {msg.content}
                      {msg.role === "assistant" &&
                        msg.content === "" &&
                        streaming && (
                          <CircularProgress size={16} sx={{ ml: 1 }} />
                        )}
                    </Box>
                  </Box>
                ))}
                <div ref={messagesEndRef} />
              </Box>

              {/* Input */}
              <Box
                sx={{
                  p: 2,
                  borderTop: 1,
                  borderColor: "divider",
                  display: "flex",
                  gap: 1,
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
                  disabled={!selectedAgent}
                  multiline
                  maxRows={4}
                />
                <IconButton
                  color="primary"
                  onClick={handleSend}
                  disabled={streaming || !input.trim() || !selectedAgent}
                >
                  <Send />
                </IconButton>
              </Box>
            </>
          )}
        </Box>
      </Drawer>
    </>
  );
}
