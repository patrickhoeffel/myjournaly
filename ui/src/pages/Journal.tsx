import { useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Snackbar,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  Add,
  AutoAwesome,
  Chat as ChatIcon,
  Delete,
  DriveFileMove,
  ExpandLess,
  ExpandMore,
  FormatBold,
  FormatItalic,
  FormatUnderlined,
  FormatStrikethrough,
  FormatListBulleted,
  FormatListNumbered,
  FormatQuote,
  Code,
  MenuBook,
  MoreVert,
  Redo,
  Undo,
  Title,
  Highlight,
  Link as LinkIcon,
} from "@mui/icons-material";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TiptapHighlight from "@tiptap/extension-highlight";
import TiptapLink from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { apiFetch } from "../lib/api";
import AssociationsPanel from "../components/AssociationsPanel";
import JournalChat from "../components/JournalChat";
import { AtMention, TagMention, extractMentions } from "../components/mentionConfig";

// ── Types ──

interface Shelf {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  order: number;
  is_default: boolean;
}

interface Notebook {
  id: string;
  shelf_id: string;
  name: string;
  icon: string | null;
  color: string | null;
  order: number;
  is_default: boolean;
}

interface JournalEntry {
  id: string;
  title: string;
  text: string;
  content: string;
  notebook_id: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
}

// ── Toolbar Button ──

function TBBtn({ active, onClick, title, children }: { active?: boolean; onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <Tooltip title={title}>
      <IconButton
        size="small"
        onClick={onClick}
        sx={{
          borderRadius: 1,
          bgcolor: active ? "action.selected" : "transparent",
          width: 32,
          height: 32,
        }}
      >
        {children}
      </IconButton>
    </Tooltip>
  );
}

// ── Editor Toolbar ──

function EditorToolbar({ editor }: { editor: ReturnType<typeof useEditor> }) {
  if (!editor) return null;

  const addLink = () => {
    const url = window.prompt("URL:");
    if (url) editor.chain().focus().setLink({ href: url }).run();
  };

  return (
    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.25, p: 0.5, borderBottom: "1px solid #e0e0e0" }}>
      <TBBtn title="Undo" onClick={() => editor.chain().focus().undo().run()}><Undo fontSize="small" /></TBBtn>
      <TBBtn title="Redo" onClick={() => editor.chain().focus().redo().run()}><Redo fontSize="small" /></TBBtn>
      <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
      <TBBtn title="Heading" active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}><Title fontSize="small" /></TBBtn>
      <TBBtn title="Bold" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}><FormatBold fontSize="small" /></TBBtn>
      <TBBtn title="Italic" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}><FormatItalic fontSize="small" /></TBBtn>
      <TBBtn title="Underline" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}><FormatUnderlined fontSize="small" /></TBBtn>
      <TBBtn title="Strikethrough" active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}><FormatStrikethrough fontSize="small" /></TBBtn>
      <TBBtn title="Highlight" active={editor.isActive("highlight")} onClick={() => editor.chain().focus().toggleHighlight().run()}><Highlight fontSize="small" /></TBBtn>
      <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
      <TBBtn title="Bullet List" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}><FormatListBulleted fontSize="small" /></TBBtn>
      <TBBtn title="Numbered List" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}><FormatListNumbered fontSize="small" /></TBBtn>
      <TBBtn title="Blockquote" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}><FormatQuote fontSize="small" /></TBBtn>
      <TBBtn title="Code Block" active={editor.isActive("codeBlock")} onClick={() => editor.chain().focus().toggleCodeBlock().run()}><Code fontSize="small" /></TBBtn>
      <TBBtn title="Link" active={editor.isActive("link")} onClick={addLink}><LinkIcon fontSize="small" /></TBBtn>
    </Box>
  );
}

// ── Main Component ──

export default function Journal() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get("entry"));
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: "", severity: "success" as "success" | "error" });

  // Shelf / Notebook state
  const [shelves, setShelves] = useState<Shelf[]>([]);
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [selectedNotebookId, setSelectedNotebookId] = useState<string | null>(null);
  const [expandedShelves, setExpandedShelves] = useState<Set<string>>(new Set());
  const [expandedNotebooks, setExpandedNotebooks] = useState<Set<string>>(new Set());
  const [shelfMenuAnchor, setShelfMenuAnchor] = useState<{ el: HTMLElement; shelfId: string } | null>(null);
  const [notebookMenuAnchor, setNotebookMenuAnchor] = useState<{ el: HTMLElement; notebookId: string } | null>(null);
  const [entryMenuAnchor, setEntryMenuAnchor] = useState<{ el: HTMLElement; entryId: string } | null>(null);
  const [renameDialog, setRenameDialog] = useState<{ type: "shelf" | "notebook"; id: string; name: string } | null>(null);
  const [newShelfDialog, setNewShelfDialog] = useState(false);
  const [newNotebookDialog, setNewNotebookDialog] = useState<string | null>(null); // shelf_id
  const [dialogName, setDialogName] = useState("");
  const [moveNotebookDialog, setMoveNotebookDialog] = useState<string | null>(null); // notebook id being moved
  const [moveEntryDialog, setMoveEntryDialog] = useState<string | null>(null); // entry id being moved

  // Counter to force-refresh LinkPickers after analyze
  const [linkRefreshKey, setLinkRefreshKey] = useState(0);

  // Chat panel state — restore from sessionStorage
  const [chatOpen, setChatOpen] = useState(() => sessionStorage.getItem("journal_chat_open") === "true");
  const [chatWidth, setChatWidth] = useState(() => {
    const stored = sessionStorage.getItem("journal_chat_width");
    return stored ? Number(stored) : 380;
  });
  const dragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleSplitterMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;

    const onMouseMove = (ev: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const newChatWidth = rect.right - ev.clientX;
      setChatWidth(Math.max(280, Math.min(newChatWidth, rect.width - 300)));
    };

    const onMouseUp = () => {
      dragging.current = false;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, []);

  // Persist selectedId to URL search param
  useEffect(() => {
    const current = searchParams.get("entry");
    if (selectedId && current !== selectedId) {
      setSearchParams({ entry: selectedId }, { replace: true });
    } else if (!selectedId && current) {
      setSearchParams({}, { replace: true });
    }
  }, [selectedId, searchParams, setSearchParams]);

  // Persist chat UI state to sessionStorage
  useEffect(() => {
    sessionStorage.setItem("journal_chat_open", String(chatOpen));
  }, [chatOpen]);

  useEffect(() => {
    sessionStorage.setItem("journal_chat_width", String(chatWidth));
  }, [chatWidth]);

  const notify = (message: string, severity: "success" | "error" = "success") =>
    setSnackbar({ open: true, message, severity });

  // Auto-save debounce
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const titleRef = useRef(title);
  titleRef.current = title;
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;
  const selectedNotebookIdRef = useRef(selectedNotebookId);
  selectedNotebookIdRef.current = selectedNotebookId;

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TiptapHighlight,
      TiptapLink.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder: "Start writing..." }),
      AtMention,
      TagMention,
    ],
    content: "",
    editorProps: {
      attributes: {
        class: "journal-editor",
      },
    },
    onUpdate: () => {
      scheduleSave();
    },
  });

  // Load shelves, notebooks, entries
  const load = useCallback(async () => {
    try {
      const [shelfData, notebookData, entryData] = await Promise.all([
        apiFetch("/shelves"),
        apiFetch("/notebooks"),
        apiFetch("/journal"),
      ]);
      setShelves(shelfData);
      setNotebooks(notebookData);
      setEntries(entryData);
      // Expand all shelves and notebooks by default
      setExpandedShelves(new Set(shelfData.map((s: Shelf) => s.id)));
      setExpandedNotebooks(new Set(notebookData.map((n: Notebook) => n.id)));
      // Auto-select default notebook if none selected
      if (!selectedNotebookId && notebookData.length > 0) {
        const defaultNb = notebookData.find((n: Notebook) => n.is_default) || notebookData[0];
        setSelectedNotebookId(defaultNb.id);
      }
    } catch {
      notify("Failed to load data", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Shelf/Notebook management
  const toggleShelf = (shelfId: string) => {
    setExpandedShelves((prev) => {
      const next = new Set(prev);
      if (next.has(shelfId)) next.delete(shelfId);
      else next.add(shelfId);
      return next;
    });
  };

  const toggleNotebook = (notebookId: string) => {
    setExpandedNotebooks((prev) => {
      const next = new Set(prev);
      if (next.has(notebookId)) next.delete(notebookId);
      else next.add(notebookId);
      return next;
    });
  };

  const handleCreateShelf = async () => {
    if (!dialogName.trim()) return;
    try {
      const created = await apiFetch("/shelves", {
        method: "POST",
        body: JSON.stringify({ name: dialogName.trim() }),
      });
      setShelves((prev) => [...prev, created]);
      setExpandedShelves((prev) => new Set([...prev, created.id]));
      setNewShelfDialog(false);
      setDialogName("");
    } catch {
      notify("Failed to create shelf", "error");
    }
  };

  const handleCreateNotebook = async () => {
    if (!dialogName.trim() || !newNotebookDialog) return;
    try {
      const created = await apiFetch("/notebooks", {
        method: "POST",
        body: JSON.stringify({ name: dialogName.trim(), shelf_id: newNotebookDialog }),
      });
      setNotebooks((prev) => [...prev, created]);
      setNewNotebookDialog(null);
      setDialogName("");
    } catch {
      notify("Failed to create notebook", "error");
    }
  };

  const handleRename = async () => {
    if (!renameDialog || !dialogName.trim()) return;
    const { type, id } = renameDialog;
    try {
      if (type === "shelf") {
        const shelf = shelves.find((s) => s.id === id);
        if (!shelf) return;
        const updated = await apiFetch(`/shelves/${id}`, {
          method: "PUT",
          body: JSON.stringify({ ...shelf, name: dialogName.trim() }),
        });
        setShelves((prev) => prev.map((s) => (s.id === id ? updated : s)));
      } else {
        const nb = notebooks.find((n) => n.id === id);
        if (!nb) return;
        const updated = await apiFetch(`/notebooks/${id}`, {
          method: "PUT",
          body: JSON.stringify({ ...nb, name: dialogName.trim() }),
        });
        setNotebooks((prev) => prev.map((n) => (n.id === id ? updated : n)));
      }
      setRenameDialog(null);
      setDialogName("");
    } catch {
      notify("Failed to rename", "error");
    }
  };

  const handleDeleteShelf = async (shelfId: string) => {
    try {
      await apiFetch(`/shelves/${shelfId}`, { method: "DELETE" });
      setShelves((prev) => prev.filter((s) => s.id !== shelfId));
      // Notebooks that were on this shelf got moved server-side; reload them
      const nbData = await apiFetch("/notebooks");
      setNotebooks(nbData);
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : "Failed to delete shelf", "error");
    }
    setShelfMenuAnchor(null);
  };

  const handleDeleteNotebook = async (notebookId: string) => {
    try {
      await apiFetch(`/notebooks/${notebookId}`, { method: "DELETE" });
      setNotebooks((prev) => prev.filter((n) => n.id !== notebookId));
      if (selectedNotebookId === notebookId) {
        const defaultNb = notebooks.find((n) => n.is_default);
        setSelectedNotebookId(defaultNb?.id || null);
      }
      // Entries that were in this notebook got moved server-side; reload
      const entryData = await apiFetch("/journal/");
      setEntries(entryData);
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : "Failed to delete notebook", "error");
    }
    setNotebookMenuAnchor(null);
  };

  const handleMoveNotebook = async (notebookId: string, targetShelfId: string) => {
    const nb = notebooks.find((n) => n.id === notebookId);
    if (!nb || nb.shelf_id === targetShelfId) return;
    try {
      const updated = await apiFetch(`/notebooks/${notebookId}`, {
        method: "PUT",
        body: JSON.stringify({ ...nb, shelf_id: targetShelfId }),
      });
      setNotebooks((prev) => prev.map((n) => (n.id === notebookId ? updated : n)));
      notify(`Moved "${nb.name}" to new shelf`);
    } catch {
      notify("Failed to move notebook", "error");
    }
    setMoveNotebookDialog(null);
  };

  const handleMoveEntry = async (entryId: string, targetNotebookId: string) => {
    const entry = entries.find((e) => e.id === entryId);
    if (!entry || entry.notebook_id === targetNotebookId) return;
    try {
      const updated = await apiFetch(`/journal/${entryId}`, {
        method: "PUT",
        body: JSON.stringify({ notebook_id: targetNotebookId }),
      });
      setEntries((prev) => prev.map((e) => (e.id === entryId ? updated : e)));
      // If moving the currently selected entry, update selected notebook
      if (entryId === selectedId) {
        setSelectedNotebookId(targetNotebookId);
        const nb = notebooks.find((n) => n.id === targetNotebookId);
        if (nb) {
          setExpandedShelves((prev) => new Set(prev).add(nb.shelf_id));
          setExpandedNotebooks((prev) => new Set(prev).add(targetNotebookId));
        }
      }
      notify(`Moved "${entry.title || "Untitled"}" to new notebook`);
    } catch {
      notify("Failed to move entry", "error");
    }
    setMoveEntryDialog(null);
  };

  // Restore selected entry when entries finish loading
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current || !editor || entries.length === 0) return;
    const entryId = searchParams.get("entry");
    const entry = entryId
      ? entries.find((e) => e.id === entryId)
      : entries[0];
    if (entry) {
      setSelectedId(entry.id);
      setTitle(entry.title);
      editor.commands.setContent(entry.content || entry.text || "");
      setLinkRefreshKey((k) => k + 1);
      restoredRef.current = true;
      // Sync selected notebook and expand its shelf
      if (entry.notebook_id) {
        setSelectedNotebookId(entry.notebook_id);
        const nb = notebooks.find((n) => n.id === entry.notebook_id);
        if (nb) {
          setExpandedShelves((prev) => new Set(prev).add(nb.shelf_id));
          setExpandedNotebooks((prev) => new Set(prev).add(nb.id));
        }
      }
    }
  }, [entries, editor, searchParams, notebooks]);

  // Select an entry
  const selectEntry = useCallback((entry: JournalEntry) => {
    setSelectedId(entry.id);
    setTitle(entry.title);
    editor?.commands.setContent(entry.content || entry.text || "");
    setLinkRefreshKey((k) => k + 1);
    // Sync selected notebook and expand its shelf
    if (entry.notebook_id) {
      setSelectedNotebookId(entry.notebook_id);
      const nb = notebooks.find((n) => n.id === entry.notebook_id);
      if (nb) {
        setExpandedShelves((prev) => new Set(prev).add(nb.shelf_id));
        setExpandedNotebooks((prev) => new Set(prev).add(nb.id));
      }
    }
  }, [editor, notebooks]);

  // New entry
  const handleNew = () => {
    setSelectedId(null);
    setTitle("");
    editor?.commands.setContent("");
    setLinkRefreshKey((k) => k + 1);
    editor?.commands.focus();
  };

  // Schedule a debounced auto-save (1 second)
  const performSaveRef = useRef<(silent: boolean) => Promise<void>>(undefined);
  const scheduleSave = useCallback(() => {
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      performSaveRef.current?.(true);
    }, 1000);
  }, []);

  // Sync inline mentions → association links
  const syncMentionLinks = async (entryId: string, entryTitle: string) => {
    const mentions = extractMentions(editor);
    if (mentions.length === 0) return;

    // Fetch existing links to avoid duplicates
    let existingLinks: { to_id: string; to_type: string }[] = [];
    try {
      existingLinks = await apiFetch(`/links?from_id=${entryId}`);
    } catch { /* ignore */ }

    const existingSet = new Set(existingLinks.map((l) => `${l.to_type}:${l.to_id}`));

    const typeMap: Record<string, string> = {
      person: "person",
      feeling: "feeling",
      belief: "belief",
      tag: "tag",
      loss: "loss",
    };

    const newLinks = mentions.filter(
      (m) => !existingSet.has(`${typeMap[m.mentionType]}:${m.id}`)
    );

    // Deduplicate within the new links themselves
    const seen = new Set<string>();
    const uniqueNew = newLinks.filter((m) => {
      const key = `${m.mentionType}:${m.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    await Promise.allSettled(
      uniqueNew.map((m) =>
        apiFetch("/links", {
          method: "POST",
          body: JSON.stringify({
            from_id: entryId,
            from_type: "journal_entry",
            from_name: entryTitle,
            to_id: m.id,
            to_type: typeMap[m.mentionType],
            to_name: m.label,
            link_type: "association",
          }),
        })
      )
    );

    if (uniqueNew.length > 0) {
      setLinkRefreshKey((k) => k + 1);
    }
  };

  // Core save logic — silent=true suppresses snackbar (used by auto-save)
  const savingRef = useRef(false);
  const performSave = async (silent: boolean) => {
    if (!editor || savingRef.current) return;
    const html = editor.getHTML();
    const plainText = editor.getText();
    const currentTitle = titleRef.current;
    const currentSelectedId = selectedIdRef.current;
    const currentNotebookId = selectedNotebookIdRef.current;
    if (!plainText.trim() && !currentTitle.trim()) return;

    savingRef.current = true;
    if (!silent) setSaving(true);
    try {
      const payload = {
        title: currentTitle || "Untitled",
        text: plainText,
        content: html,
        notebook_id: currentNotebookId,
      };

      if (currentSelectedId) {
        const updated = await apiFetch(`/journal/${currentSelectedId}`, {
          method: "PUT",
          body: JSON.stringify({ ...payload, updated_at: new Date().toISOString() }),
        });
        setEntries((prev) => prev.map((e) => (e.id === currentSelectedId ? updated : e)));
        await syncMentionLinks(currentSelectedId, currentTitle || "Untitled");
      } else {
        const created = await apiFetch("/journal", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setEntries((prev) => [created, ...prev]);
        setSelectedId(created.id);
        await syncMentionLinks(created.id, currentTitle || "Untitled");
        setLinkRefreshKey((k) => k + 1);
      }
      if (!silent) notify("Saved");
    } catch {
      if (!silent) notify("Failed to save", "error");
    } finally {
      savingRef.current = false;
      if (!silent) setSaving(false);
    }
  };
  performSaveRef.current = performSave;

  // Delete
  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await apiFetch(`/journal/${deleteConfirm}`, { method: "DELETE" });
      setEntries((prev) => prev.filter((e) => e.id !== deleteConfirm));
      if (selectedId === deleteConfirm) handleNew();
      notify("Entry deleted");
    } catch {
      notify("Failed to delete", "error");
    } finally {
      setDeleteConfirm(null);
    }
  };

  // LLM Analysis — creates links via API, then refreshes pickers
  const handleAnalyze = async () => {
    if (!editor || !selectedId) {
      if (!selectedId) notify("Save the entry first to run analysis", "error");
      return;
    }
    const plainText = editor.getText();
    if (!plainText.trim()) {
      notify("Write something first", "error");
      return;
    }
    setAnalyzing(true);
    try {
      const suggestions = await apiFetch("/journal/analyze", {
        method: "POST",
        body: JSON.stringify({ text: plainText }),
      });
      // Create links for each suggestion
      const linkPromises: Promise<unknown>[] = [];
      const makeLink = (toId: string, toType: string, toName: string) =>
        apiFetch("/links", {
          method: "POST",
          body: JSON.stringify({
            from_id: selectedId,
            from_type: "journal_entry",
            from_name: title || "Untitled",
            to_id: toId,
            to_type: toType,
            to_name: toName,
            link_type: "association",
          }),
        });
      for (const id of suggestions.person_ids || []) linkPromises.push(makeLink(id, "person", ""));
      for (const id of suggestions.feeling_ids || []) linkPromises.push(makeLink(id, "feeling", ""));
      for (const id of suggestions.belief_ids || []) linkPromises.push(makeLink(id, "belief", ""));
      await Promise.allSettled(linkPromises);
      setLinkRefreshKey((k) => k + 1);
      notify("Analysis complete — suggestions added");
    } catch {
      notify("Analysis failed", "error");
    } finally {
      setAnalyzing(false);
    }
  };

  // Format date for sidebar
  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", height: "80vh" }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ display: "flex", height: "calc(100vh - 112px)" }}>
      {/* Left sidebar: unified tree */}
      <Box sx={{ width: 280, borderRight: "1px solid #e0e0e0", display: "flex", flexDirection: "column" }}>
        {/* Header */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, px: 1.5, py: 1.5, borderBottom: "1px solid #e0e0e0" }}>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>Journal</Typography>
          <Tooltip title="New Shelf">
            <IconButton size="small" onClick={() => { setDialogName(""); setNewShelfDialog(true); }}>
              <Add fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>

        {/* Shelf > Notebook > Entry tree */}
        <Box sx={{ flexGrow: 1, overflow: "auto" }}>
          <List dense disablePadding>
            {shelves.map((shelf) => (
              <Box key={shelf.id}>
                {/* Shelf row */}
                <ListItemButton
                  onClick={() => toggleShelf(shelf.id)}
                  sx={{ py: 0.25, pl: 1 }}
                >
                  <ListItemIcon sx={{ minWidth: 22 }}>
                    {expandedShelves.has(shelf.id) ? <ExpandLess sx={{ fontSize: 16 }} /> : <ExpandMore sx={{ fontSize: 16 }} />}
                  </ListItemIcon>
                  <ListItemText
                    primary={shelf.name}
                    primaryTypographyProps={{ variant: "body2", fontWeight: 600, noWrap: true }}
                  />
                  <IconButton
                    size="small"
                    onClick={(e) => { e.stopPropagation(); setShelfMenuAnchor({ el: e.currentTarget, shelfId: shelf.id }); }}
                    sx={{ opacity: 0, ".MuiListItemButton-root:hover &": { opacity: 0.5 }, "&:hover": { opacity: 1 } }}
                  >
                    <MoreVert sx={{ fontSize: 14 }} />
                  </IconButton>
                </ListItemButton>

                {/* Notebooks under this shelf */}
                <Collapse in={expandedShelves.has(shelf.id)}>
                  <List dense disablePadding>
                    {notebooks
                      .filter((nb) => nb.shelf_id === shelf.id)
                      .map((nb) => {
                        const nbEntries = entries.filter((e) => e.notebook_id === nb.id);
                        const isExpanded = expandedNotebooks.has(nb.id);
                        return (
                          <Box key={nb.id}>
                            {/* Notebook row */}
                            <ListItemButton
                              onClick={() => toggleNotebook(nb.id)}
                              sx={{ py: 0.25, pl: 3.5 }}
                            >
                              <ListItemIcon sx={{ minWidth: 22 }}>
                                {nbEntries.length > 0
                                  ? (isExpanded ? <ExpandLess sx={{ fontSize: 14 }} /> : <ExpandMore sx={{ fontSize: 14 }} />)
                                  : <MenuBook sx={{ fontSize: 14, color: nb.color || "text.secondary" }} />
                                }
                              </ListItemIcon>
                              <ListItemText
                                primary={nb.name}
                                primaryTypographyProps={{
                                  variant: "body2",
                                  noWrap: true,
                                  fontWeight: nb.id === selectedNotebookId ? 600 : 400,
                                  fontSize: "0.85rem",
                                }}
                              />
                              <Tooltip title="New Entry">
                                <IconButton
                                  size="small"
                                  onClick={(e) => { e.stopPropagation(); setSelectedNotebookId(nb.id); handleNew(); }}
                                  sx={{ opacity: 0, ".MuiListItemButton-root:hover &": { opacity: 0.5 }, "&:hover": { opacity: 1 } }}
                                >
                                  <Add sx={{ fontSize: 14 }} />
                                </IconButton>
                              </Tooltip>
                              <IconButton
                                size="small"
                                onClick={(e) => { e.stopPropagation(); setNotebookMenuAnchor({ el: e.currentTarget, notebookId: nb.id }); }}
                                sx={{ opacity: 0, ".MuiListItemButton-root:hover &": { opacity: 0.5 }, "&:hover": { opacity: 1 } }}
                              >
                                <MoreVert sx={{ fontSize: 14 }} />
                              </IconButton>
                            </ListItemButton>

                            {/* Entries under this notebook */}
                            <Collapse in={isExpanded}>
                              <List dense disablePadding>
                                {nbEntries.map((entry) => (
                                  <ListItemButton
                                    key={entry.id}
                                    selected={entry.id === selectedId}
                                    onClick={() => selectEntry(entry)}
                                    sx={{ pl: 8, py: 0.1 }}
                                  >
                                    <ListItemText
                                      primary={entry.title || "Untitled"}
                                      secondary={fmtDate(entry.created_at)}
                                      primaryTypographyProps={{ noWrap: true, fontSize: "0.8rem", fontWeight: entry.id === selectedId ? 600 : 400 }}
                                      secondaryTypographyProps={{ variant: "caption", fontSize: "0.7rem" }}
                                    />
                                    <IconButton
                                      size="small"
                                      onClick={(e) => { e.stopPropagation(); setEntryMenuAnchor({ el: e.currentTarget, entryId: entry.id }); }}
                                      sx={{ opacity: 0, ".MuiListItemButton-root:hover &": { opacity: 0.5 }, "&:hover": { opacity: 1 } }}
                                    >
                                      <MoreVert sx={{ fontSize: 14 }} />
                                    </IconButton>
                                  </ListItemButton>
                                ))}
                              </List>
                            </Collapse>
                          </Box>
                        );
                      })}
                  </List>
                </Collapse>
              </Box>
            ))}
          </List>
        </Box>
      </Box>

      {/* Shelf context menu */}
      <Menu
        anchorEl={shelfMenuAnchor?.el}
        open={!!shelfMenuAnchor}
        onClose={() => setShelfMenuAnchor(null)}
      >
        <MenuItem onClick={() => {
          if (!shelfMenuAnchor) return;
          setDialogName("");
          setNewNotebookDialog(shelfMenuAnchor.shelfId);
          setShelfMenuAnchor(null);
        }}>
          Add Notebook
        </MenuItem>
        <MenuItem onClick={() => {
          if (!shelfMenuAnchor) return;
          const shelf = shelves.find((s) => s.id === shelfMenuAnchor.shelfId);
          setDialogName(shelf?.name || "");
          setRenameDialog({ type: "shelf", id: shelfMenuAnchor.shelfId, name: shelf?.name || "" });
          setShelfMenuAnchor(null);
        }}>
          Rename
        </MenuItem>
        {shelfMenuAnchor && !shelves.find((s) => s.id === shelfMenuAnchor.shelfId)?.is_default && (
          <MenuItem onClick={() => handleDeleteShelf(shelfMenuAnchor!.shelfId)} sx={{ color: "error.main" }}>
            Delete
          </MenuItem>
        )}
      </Menu>

      {/* Notebook context menu */}
      <Menu
        anchorEl={notebookMenuAnchor?.el}
        open={!!notebookMenuAnchor}
        onClose={() => setNotebookMenuAnchor(null)}
      >
        <MenuItem onClick={() => {
          if (!notebookMenuAnchor) return;
          setSelectedNotebookId(notebookMenuAnchor.notebookId);
          setNotebookMenuAnchor(null);
          handleNew();
        }}>
          New Note
        </MenuItem>
        <MenuItem onClick={() => {
          if (!notebookMenuAnchor) return;
          const nb = notebooks.find((n) => n.id === notebookMenuAnchor.notebookId);
          setDialogName(nb?.name || "");
          setRenameDialog({ type: "notebook", id: notebookMenuAnchor.notebookId, name: nb?.name || "" });
          setNotebookMenuAnchor(null);
        }}>
          Rename
        </MenuItem>
        {notebookMenuAnchor && shelves.length > 1 && (
          <MenuItem onClick={() => {
            setMoveNotebookDialog(notebookMenuAnchor!.notebookId);
            setNotebookMenuAnchor(null);
          }}>
            <DriveFileMove sx={{ fontSize: 16, mr: 1 }} /> Move to Shelf...
          </MenuItem>
        )}
        {notebookMenuAnchor && !notebooks.find((n) => n.id === notebookMenuAnchor.notebookId)?.is_default && (
          <MenuItem onClick={() => handleDeleteNotebook(notebookMenuAnchor!.notebookId)} sx={{ color: "error.main" }}>
            Delete
          </MenuItem>
        )}
      </Menu>

      {/* Entry context menu */}
      <Menu
        anchorEl={entryMenuAnchor?.el}
        open={!!entryMenuAnchor}
        onClose={() => setEntryMenuAnchor(null)}
      >
        {entryMenuAnchor && notebooks.length > 1 && (
          <MenuItem onClick={() => {
            setMoveEntryDialog(entryMenuAnchor!.entryId);
            setEntryMenuAnchor(null);
          }}>
            <DriveFileMove sx={{ fontSize: 16, mr: 1 }} /> Move to Notebook...
          </MenuItem>
        )}
        {entryMenuAnchor && (
          <MenuItem onClick={() => {
            setDeleteConfirm(entryMenuAnchor!.entryId);
            setEntryMenuAnchor(null);
          }} sx={{ color: "error.main" }}>
            Delete
          </MenuItem>
        )}
      </Menu>

      {/* Center: editor + chat */}
      <Box ref={containerRef} sx={{ flexGrow: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {/* Title + action bar */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, px: 2, py: 1, borderBottom: "1px solid #e0e0e0" }}>
          <TextField
            variant="standard"
            placeholder="Entry Title"
            value={title}
            onChange={(e) => { setTitle(e.target.value); scheduleSave(); }}
            onKeyDown={(e) => { if (e.key === "Tab" && !e.shiftKey) { e.preventDefault(); editor?.commands.focus(); } }}
            fullWidth
            InputProps={{ disableUnderline: true, sx: { fontSize: "1.2rem", fontWeight: 600 } }}
          />
          {saving && <CircularProgress size={16} sx={{ flexShrink: 0 }} />}
          <Button
            variant="outlined"
            size="small"
            startIcon={analyzing ? <CircularProgress size={16} /> : <AutoAwesome />}
            onClick={handleAnalyze}
            disabled={analyzing}
            sx={{ whiteSpace: "nowrap" }}
          >
            {analyzing ? "Analyzing..." : "Analyze"}
          </Button>
          {selectedId && (
            <Tooltip title="Delete entry">
              <IconButton size="small" color="error" onClick={() => setDeleteConfirm(selectedId)}>
                <Delete fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          <Tooltip title={chatOpen ? "Close chat" : "Open chat"}>
            <IconButton
              size="small"
              onClick={() => setChatOpen((v) => !v)}
              sx={{ bgcolor: chatOpen ? "action.selected" : undefined }}
            >
              <ChatIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>

        {/* Toolbar */}
        <EditorToolbar editor={editor} />

        {/* Editor + Chat horizontal layout */}
        <Box sx={{ flexGrow: 1, display: "flex", minHeight: 0 }}>
          {/* Editor column */}
          <Box sx={{ flexGrow: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
            {/* Editor body */}
            <Box
              onClick={(e) => {
                // Click in empty space below text → focus editor at end
                const target = e.target as HTMLElement;
                if (!target.closest(".ProseMirror")) {
                  editor?.commands.focus("end");
                }
              }}
              sx={{
                flexGrow: 1,
                overflowY: "auto",
                overflowX: "hidden",
                cursor: "text",
                px: 2,
                py: 1,
                "& .journal-editor": {
                  outline: "none",
                  minHeight: "100%",
                  wordBreak: "break-word",
                  fontSize: "0.95rem",
                  lineHeight: 1.7,
                  "& h2": { fontSize: "1.3rem", fontWeight: 600, mt: 2, mb: 1 },
                  "& p": { mt: 0, mb: 0.75 },
                  "& blockquote": {
                    borderLeft: "3px solid #ccc",
                    pl: 2,
                    ml: 0,
                    color: "text.secondary",
                    fontStyle: "italic",
                  },
                  "& ul, & ol": { pl: 3, my: 0.5 },
                  "& li": { mb: 0.25 },
                  "& li p": { m: 0 },
                  "& pre": {
                    bgcolor: "#f5f5f5",
                    p: 1.5,
                    borderRadius: 1,
                    fontFamily: "monospace",
                    fontSize: "0.85rem",
                    overflow: "auto",
                  },
                  "& mark": { bgcolor: "#fff3b0", borderRadius: "2px", px: 0.25 },
                  "& a": { color: "primary.main", textDecoration: "underline" },
                  "& .mention": {
                    borderRadius: "4px",
                    px: 0.5,
                    py: 0.125,
                    fontWeight: 500,
                    fontSize: "0.9em",
                    whiteSpace: "nowrap",
                  },
                  "& .mention-person": {
                    bgcolor: "#e3f2fd",
                    color: "#1565c0",
                  },
                  "& .mention-feeling": {
                    bgcolor: "#e8f5e9",
                    color: "#2e7d32",
                  },
                  "& .mention-belief": {
                    bgcolor: "#f3e5f5",
                    color: "#7b1fa2",
                  },
                  "& .mention-tag": {
                    bgcolor: "#f5f5f5",
                    color: "#616161",
                  },
                  "& .mention-loss": {
                    bgcolor: "#ede7f6",
                    color: "#5e35b1",
                  },
                  "& p.is-editor-empty:first-of-type::before": {
                    content: "attr(data-placeholder)",
                    color: "#aaa",
                    float: "left",
                    height: 0,
                    pointerEvents: "none",
                  },
                },
              }}
            >
              <EditorContent editor={editor} />
            </Box>

            {/* Associations panel */}
            <Box sx={{ borderTop: "1px solid #e0e0e0", maxHeight: 280, overflow: "auto" }}>
              <AssociationsPanel
                entityId={selectedId}
                entityType="journal_entry"
                entityName={title || "Untitled"}
                emptyMessage="Save the entry first to add associations."
                refreshKey={linkRefreshKey}
              />
            </Box>
          </Box>

          {/* Splitter + Chat panel */}
          {chatOpen && (
            <>
              <Box
                onMouseDown={handleSplitterMouseDown}
                sx={{
                  width: 6,
                  cursor: "col-resize",
                  bgcolor: "transparent",
                  borderLeft: 1,
                  borderColor: "divider",
                  "&:hover": { bgcolor: "action.hover" },
                  flexShrink: 0,
                }}
              />
              <Box sx={{ width: chatWidth, flexShrink: 0, borderLeft: 1, borderColor: "divider" }}>
                <JournalChat
                  entryTitle={title}
                  entryText={editor?.getText()}
                  onClose={() => setChatOpen(false)}
                  onCopyToJournal={(text) => {
                    if (!editor) return;
                    editor.chain().focus().insertContent(text).run();
                  }}
                />
              </Box>
            </>
          )}
        </Box>
      </Box>

      {/* Delete confirmation */}
      <Dialog open={deleteConfirm !== null} onClose={() => setDeleteConfirm(null)}>
        <DialogTitle>Delete Entry</DialogTitle>
        <DialogContent>
          <Typography>Are you sure you want to delete this journal entry? This cannot be undone.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirm(null)} sx={{ textTransform: "none" }}>Cancel</Button>
          <Button color="error" variant="contained" onClick={handleDelete} sx={{ textTransform: "none" }}>Delete</Button>
        </DialogActions>
      </Dialog>

      {/* New Shelf dialog */}
      <Dialog open={newShelfDialog} onClose={() => setNewShelfDialog(false)} disableRestoreFocus>
        <form onSubmit={(e) => { e.preventDefault(); handleCreateShelf(); }}>
          <DialogTitle>New Shelf</DialogTitle>
          <DialogContent>
            <TextField
              autoFocus
              fullWidth
              label="Shelf Name"
              value={dialogName}
              onChange={(e) => setDialogName(e.target.value)}
              sx={{ mt: 1 }}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setNewShelfDialog(false)} sx={{ textTransform: "none" }}>Cancel</Button>
            <Button type="submit" variant="contained" sx={{ textTransform: "none" }}>Create</Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* New Notebook dialog */}
      <Dialog open={newNotebookDialog !== null} onClose={() => setNewNotebookDialog(null)} disableRestoreFocus>
        <form onSubmit={(e) => { e.preventDefault(); handleCreateNotebook(); }}>
          <DialogTitle>New Notebook</DialogTitle>
          <DialogContent>
            <TextField
              autoFocus
              fullWidth
              label="Notebook Name"
              value={dialogName}
              onChange={(e) => setDialogName(e.target.value)}
              sx={{ mt: 1 }}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setNewNotebookDialog(null)} sx={{ textTransform: "none" }}>Cancel</Button>
            <Button type="submit" variant="contained" sx={{ textTransform: "none" }}>Create</Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Rename dialog */}
      <Dialog open={renameDialog !== null} onClose={() => setRenameDialog(null)} disableRestoreFocus>
        <form onSubmit={(e) => { e.preventDefault(); handleRename(); }}>
          <DialogTitle>Rename {renameDialog?.type === "shelf" ? "Shelf" : "Notebook"}</DialogTitle>
          <DialogContent>
            <TextField
              autoFocus
              fullWidth
              label="Name"
              value={dialogName}
              onChange={(e) => setDialogName(e.target.value)}
              sx={{ mt: 1 }}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setRenameDialog(null)} sx={{ textTransform: "none" }}>Cancel</Button>
            <Button type="submit" variant="contained" sx={{ textTransform: "none" }}>Save</Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Move Notebook to Shelf dialog */}
      <Dialog open={moveNotebookDialog !== null} onClose={() => setMoveNotebookDialog(null)}>
        <DialogTitle>Move Notebook to Shelf</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Choose a shelf for "{notebooks.find((n) => n.id === moveNotebookDialog)?.name}":
          </Typography>
          <List dense>
            {shelves
              .filter((s) => s.id !== notebooks.find((n) => n.id === moveNotebookDialog)?.shelf_id)
              .map((shelf) => (
                <ListItemButton
                  key={shelf.id}
                  onClick={() => handleMoveNotebook(moveNotebookDialog!, shelf.id)}
                >
                  <ListItemText primary={shelf.name} />
                </ListItemButton>
              ))}
          </List>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMoveNotebookDialog(null)} sx={{ textTransform: "none" }}>Cancel</Button>
        </DialogActions>
      </Dialog>

      {/* Move Entry to Notebook dialog */}
      <Dialog open={moveEntryDialog !== null} onClose={() => setMoveEntryDialog(null)}>
        <DialogTitle>Move Entry to Notebook</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Choose a notebook for "{entries.find((e) => e.id === moveEntryDialog)?.title || "Untitled"}":
          </Typography>
          <List dense>
            {shelves.map((shelf) => {
              const shelfNotebooks = notebooks
                .filter((n) => n.shelf_id === shelf.id && n.id !== entries.find((e) => e.id === moveEntryDialog)?.notebook_id);
              if (shelfNotebooks.length === 0) return null;
              return (
                <Box key={shelf.id}>
                  <Typography variant="caption" color="text.secondary" sx={{ px: 2, pt: 1, display: "block", fontWeight: 600 }}>
                    {shelf.name}
                  </Typography>
                  {shelfNotebooks.map((nb) => (
                    <ListItemButton
                      key={nb.id}
                      onClick={() => handleMoveEntry(moveEntryDialog!, nb.id)}
                      sx={{ pl: 3 }}
                    >
                      <ListItemIcon sx={{ minWidth: 28 }}>
                        <MenuBook sx={{ fontSize: 16, color: nb.color || "text.secondary" }} />
                      </ListItemIcon>
                      <ListItemText primary={nb.name} primaryTypographyProps={{ fontSize: "0.9rem" }} />
                    </ListItemButton>
                  ))}
                </Box>
              );
            })}
          </List>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMoveEntryDialog(null)} sx={{ textTransform: "none" }}>Cancel</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar((s) => ({ ...s, open: false }))}>
        <Alert severity={snackbar.severity} onClose={() => setSnackbar((s) => ({ ...s, open: false }))}>{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
}
