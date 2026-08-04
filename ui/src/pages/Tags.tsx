import { useEffect, useState, useCallback } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Snackbar,
  TextField,
  Typography,
} from "@mui/material";
import { Add } from "@mui/icons-material";
import { apiFetch } from "../lib/api";
import ColorPalette from "../components/ColorPalette";

interface Tag {
  id: string;
  name: string;
  color: string | null;
  is_default: boolean;
}

const DEFAULT_TAG_COLOR = "#1976d2";

export default function Tags() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [editTag, setEditTag] = useState<Tag | null>(null);
  const [form, setForm] = useState({ name: "", color: DEFAULT_TAG_COLOR });
  const [snackbar, setSnackbar] = useState({ open: false, message: "", severity: "success" as "success" | "error" });

  const notify = (message: string, severity: "success" | "error" = "success") =>
    setSnackbar({ open: true, message, severity });

  const load = useCallback(async () => {
    try {
      const data = await apiFetch("/tags");
      setTags(data);
    } catch {
      notify("Failed to load tags", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    if (!form.name.trim()) return;
    try {
      await apiFetch("/tags", {
        method: "POST",
        body: JSON.stringify({ name: form.name.trim(), color: form.color }),
      });
      setAddOpen(false);
      setForm({ name: "", color: DEFAULT_TAG_COLOR });
      notify("Tag added");
      load();
    } catch {
      notify("Failed to add tag", "error");
    }
  };

  const handleEdit = async () => {
    if (!editTag || !form.name.trim()) return;
    try {
      await apiFetch(`/tags/${editTag.id}`, {
        method: "PUT",
        body: JSON.stringify({ name: form.name.trim(), color: form.color }),
      });
      setEditTag(null);
      notify("Tag updated");
      load();
    } catch {
      notify("Failed to update tag", "error");
    }
  };

  const handleRemove = async (id: string) => {
    try {
      await apiFetch(`/tags/${id}`, { method: "DELETE" });
      setTags((prev) => prev.filter((t) => t.id !== id));
      notify("Tag removed");
    } catch {
      notify("Failed to remove tag", "error");
    }
  };

  const openEdit = (tag: Tag) => {
    setForm({ name: tag.name, color: tag.color || DEFAULT_TAG_COLOR });
    setEditTag(tag);
  };

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", height: "80vh" }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 800, mx: "auto" }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 3 }}>
        <Typography variant="h5">My Tags</Typography>
        <Button size="small" variant="outlined" startIcon={<Add />} onClick={() => { setForm({ name: "", color: DEFAULT_TAG_COLOR }); setAddOpen(true); }}>
          Add
        </Button>
      </Box>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Tags help you organize and categorize your journal entries and events. Click a tag to edit it.
      </Typography>

      {tags.length === 0 ? (
        <Alert severity="info">
          No tags yet. Click "Add" to create your first tag.
        </Alert>
      ) : (
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
          {tags.map((tag) => {
            const color = tag.color || DEFAULT_TAG_COLOR;
            return (
              <Chip
                key={tag.id}
                label={tag.name}
                onClick={() => openEdit(tag)}
                onDelete={() => handleRemove(tag.id)}
                sx={{
                  bgcolor: "transparent",
                  color,
                  border: "1px solid",
                  borderColor: color,
                  "& .MuiChip-deleteIcon": { color: `${color}80`, "&:hover": { color } },
                  "&:hover": { bgcolor: `${color} !important`, color: "#fff", "& .MuiChip-deleteIcon": { color: "rgba(255,255,255,0.7)" } },
                }}
              />
            );
          })}
        </Box>
      )}

      {/* Add Dialog */}
      <Dialog open={addOpen} onClose={() => setAddOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontSize: "1rem", fontWeight: 600 }}>Add a Tag</DialogTitle>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
          <TextField
            label="Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            fullWidth
            autoFocus
            slotProps={{ inputLabel: { shrink: true } }}
            size="small"
            sx={{ mt: 1 }}
          />
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Typography variant="body2" sx={{ fontSize: "0.875rem" }}>Color</Typography>
            <ColorPalette value={form.color} onChange={(c) => setForm({ ...form, color: c })} title="Choose tag color" />
            <Chip
              label={form.name || "Preview"}
              size="small"
              sx={{ bgcolor: form.color, color: "#fff", ml: 1, fontSize: "0.875rem" }}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddOpen(false)} sx={{ textTransform: "none" }}>Cancel</Button>
          <Button variant="contained" onClick={handleAdd} disabled={!form.name.trim()} sx={{ textTransform: "none" }}>Add</Button>
        </DialogActions>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editTag} onClose={() => setEditTag(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontSize: "1rem", fontWeight: 600 }}>Edit Tag</DialogTitle>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
          <TextField
            label="Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            fullWidth
            autoFocus
            slotProps={{ inputLabel: { shrink: true } }}
            size="small"
            sx={{ mt: 1 }}
          />
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Typography variant="body2" sx={{ fontSize: "0.875rem" }}>Color</Typography>
            <ColorPalette value={form.color} onChange={(c) => setForm({ ...form, color: c })} title="Choose tag color" />
            <Chip
              label={form.name || "Preview"}
              size="small"
              sx={{ bgcolor: form.color, color: "#fff", ml: 1, fontSize: "0.875rem" }}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditTag(null)} sx={{ textTransform: "none" }}>Cancel</Button>
          <Button variant="contained" onClick={handleEdit} disabled={!form.name.trim()} sx={{ textTransform: "none" }}>Save</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar((s) => ({ ...s, open: false }))}>
        <Alert severity={snackbar.severity} onClose={() => setSnackbar((s) => ({ ...s, open: false }))}>{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
}
