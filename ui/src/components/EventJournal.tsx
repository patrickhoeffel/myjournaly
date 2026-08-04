import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Button,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  Add,
  ChevronLeft,
  ChevronRight,
  OpenInNew,
} from "@mui/icons-material";
import { apiFetch } from "../lib/api";

interface JournalEntry {
  id: string;
  title: string;
  text: string;
  content: string;
  created_at: string;
  updated_at: string;
}

interface LinkRecord {
  id: string;
  from_id: string;
  from_type: string;
  to_id: string;
  to_type: string;
}

interface EventJournalProps {
  eventId: string;
  eventTitle: string;
  /** Backend entity type these journal entries are linked to. Defaults to "event"
   *  but can also be "season" so the same composer works for both. */
  entityType?: string;
}

const DRAWER_WIDTH = 240;
const DRAWER_COLLAPSED_WIDTH = 32;

export default function EventJournal({ eventId, eventTitle, entityType = "event" }: EventJournalProps) {
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);

  const loadEntries = useCallback(async () => {
    if (!eventId) return;
    try {
      const links: LinkRecord[] = await apiFetch(`/links?entity_id=${eventId}`);
      const entryIds = links
        .filter((l) => l.from_type === "journal_entry" || l.to_type === "journal_entry")
        .map((l) => (l.from_type === "journal_entry" ? l.from_id : l.to_id));
      const unique = Array.from(new Set(entryIds));
      const loaded = await Promise.all(
        unique.map((id) =>
          apiFetch(`/journal/${id}`).catch(() => null),
        ),
      );
      const valid = (loaded.filter(Boolean) as JournalEntry[]).sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
      setEntries(valid);
    } catch {
      setEntries([]);
    }
  }, [eventId]);

  // Reset state when event changes
  useEffect(() => {
    setActiveId(null);
    setTitle("");
    setContent("");
    setDirty(false);
    setLastSavedAt(null);
    loadEntries();
  }, [eventId, loadEntries]);

  const confirmDiscard = useCallback(() => {
    if (!dirty) return true;
    return window.confirm("You have unsaved changes. Discard them?");
  }, [dirty]);

  const startNewEntry = () => {
    if (!confirmDiscard()) return;
    setActiveId(null);
    setTitle("");
    setContent("");
    setDirty(false);
  };

  const selectEntry = async (id: string) => {
    if (id === activeId) return;
    if (!confirmDiscard()) return;
    const entry = entries.find((e) => e.id === id);
    if (!entry) return;
    setActiveId(id);
    setTitle(entry.title || "");
    setContent(entry.text || "");
    setDirty(false);
  };

  const handleSave = async () => {
    if (!eventId) return;
    if (!title.trim() && !content.trim()) return;
    setSaving(true);
    try {
      if (activeId) {
        await apiFetch(`/journal/${activeId}`, {
          method: "PUT",
          body: JSON.stringify({ title, text: content, content }),
        });
      } else {
        const created: JournalEntry = await apiFetch("/journal", {
          method: "POST",
          body: JSON.stringify({ title, text: content, content }),
        });
        await apiFetch("/links", {
          method: "POST",
          body: JSON.stringify({
            from_id: created.id,
            from_type: "journal_entry",
            from_name: created.title || "Untitled",
            to_id: eventId,
            to_type: entityType,
            to_name: eventTitle,
            link_type: "association",
          }),
        });
        setActiveId(created.id);
      }
      setDirty(false);
      setLastSavedAt(Date.now());
      await loadEntries();
    } finally {
      setSaving(false);
    }
  };

  const activeEntry = useMemo(
    () => entries.find((e) => e.id === activeId) || null,
    [entries, activeId],
  );

  const canSave = (title.trim().length > 0 || content.trim().length > 0) && dirty && !saving;

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString();
    } catch {
      return iso;
    }
  };

  const previewOf = (e: JournalEntry) => {
    const txt = (e.text || "").trim();
    if (!txt) return "";
    return txt.length > 80 ? `${txt.slice(0, 80)}…` : txt;
  };

  const savedRecently = lastSavedAt && Date.now() - lastSavedAt < 3000;

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: { xs: "column", md: "row" },
        border: 1,
        borderColor: "divider",
        borderRadius: 1,
        overflow: "hidden",
        minHeight: 320,
      }}
    >
      {/* Drawer */}
      <Box
        sx={{
          width: { xs: "100%", md: drawerOpen ? DRAWER_WIDTH : DRAWER_COLLAPSED_WIDTH },
          maxHeight: { xs: drawerOpen ? 220 : "auto", md: "none" },
          flexShrink: 0,
          borderRight: { md: 1 },
          borderBottom: { xs: 1, md: 0 },
          borderColor: "divider",
          display: "flex",
          flexDirection: "column",
          transition: "width 0.2s ease",
          bgcolor: "background.default",
        }}
      >
        {drawerOpen ? (
          <>
            <Box
              sx={{
                px: 1.5,
                py: 1,
                display: "flex",
                alignItems: "center",
                gap: 0.5,
                borderBottom: 1,
                borderColor: "divider",
              }}
            >
              <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>
                Entries ({entries.length})
              </Typography>
              <Tooltip title="New entry">
                <IconButton size="small" onClick={startNewEntry}>
                  <Add fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Collapse">
                <IconButton size="small" onClick={() => setDrawerOpen(false)}>
                  <ChevronLeft fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
            <Box sx={{ overflowY: "auto", flexGrow: 1 }}>
              {entries.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
                  No entries yet. Start typing on the right.
                </Typography>
              ) : (
                <List dense disablePadding>
                  {entries.map((e) => (
                    <ListItemButton
                      key={e.id}
                      selected={e.id === activeId}
                      onClick={() => selectEntry(e.id)}
                      sx={{ alignItems: "flex-start", py: 1 }}
                    >
                      <ListItemText
                        primary={e.title || "Untitled"}
                        secondary={
                          <>
                            <Typography variant="caption" color="text.secondary" component="span">
                              {formatDate(e.created_at)}
                            </Typography>
                            {previewOf(e) && (
                              <Typography
                                variant="body2"
                                color="text.secondary"
                                sx={{ display: "block", mt: 0.25 }}
                              >
                                {previewOf(e)}
                              </Typography>
                            )}
                          </>
                        }
                        slotProps={{ primary: { variant: "body2", fontWeight: 600 } }}
                      />
                    </ListItemButton>
                  ))}
                </List>
              )}
            </Box>
          </>
        ) : (
          <Tooltip title={`${entries.length} entries — expand`}>
            <IconButton
              size="small"
              onClick={() => setDrawerOpen(true)}
              sx={{ borderRadius: 0, height: "100%", width: "100%" }}
            >
              <ChevronRight fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Box>

      {/* Editor */}
      <Box sx={{ flexGrow: 1, display: "flex", flexDirection: "column", p: 2, gap: 1.5 }}>
        <TextField
          placeholder={activeId ? "Title" : `New entry about “${eventTitle}”`}
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setDirty(true);
          }}
          variant="standard"
          fullWidth
          slotProps={{ input: { sx: { fontSize: "1.1rem", fontWeight: 600 } } }}
        />
        <TextField
          placeholder="Just start typing…"
          value={content}
          onChange={(e) => {
            setContent(e.target.value);
            setDirty(true);
          }}
          fullWidth
          multiline
          minRows={6}
          maxRows={16}
          variant="outlined"
        />
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Typography variant="caption" color="text.secondary" sx={{ flexGrow: 1 }}>
            {dirty
              ? "Unsaved changes"
              : savedRecently
                ? "Saved"
                : activeEntry
                  ? `Last updated ${formatDate(activeEntry.updated_at)}`
                  : "Auto-linked to this event when saved"}
          </Typography>
          {activeId && (
            <Tooltip title="Open in Journal">
              <IconButton size="small" onClick={() => navigate(`/journal?entry=${activeId}`)}>
                <OpenInNew fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          <Button
            variant="contained"
            size="small"
            onClick={handleSave}
            disabled={!canSave}
          >
            {activeId ? "Save" : "Save Entry"}
          </Button>
        </Box>
      </Box>
    </Box>
  );
}
