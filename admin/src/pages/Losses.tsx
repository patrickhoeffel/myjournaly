import { useEffect, useState } from "react";
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
  IconButton,
  Snackbar,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { Add, Refresh } from "@mui/icons-material";
import { apiFetch } from "../lib/api";

interface Loss {
  id: string;
  name: string;
  category: string | null;
  description: string | null;
  sort_order: number;
}

const SEED_LOSSES = [
  "Opportunities", "Time", "Skills", "Safety", "Love", "Security", "Encouragement",
  "Support", "Comfort", "Experiences", "Enjoyment", "Childhood", "Wisdom", "Validation",
  "Happiness", "Freedom", "Joy", "Affirmation", "Carefree Feeling", "Possessions",
  "Ability to Express Emotions", "Acceptance", "Innocence", "Nurturing", "Virtue",
  "Health", "Employment", "Truth", "Satisfaction", "Choice", "Identity", "Justice",
  "Protection", "Femininity or Masculinity", "Faith", "Intimacy", "Purity", "Authority",
  "Confidence", "Trust", "Hope", "Self-Respect", "Relationship", "Mentorship",
  "Life Skills", "Affection", "Family", "Memories", "Contentment", "Sense of Self",
];

const emptyForm = { name: "", category: "", description: "", sort_order: 0 };

export default function Losses() {
  const [losses, setLosses] = useState<Loss[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [snackbar, setSnackbar] = useState({ open: false, message: "", severity: "success" as "success" | "error" });

  const notify = (message: string, severity: "success" | "error" = "success") =>
    setSnackbar({ open: true, message, severity });

  const load = async () => {
    setLoading(true);
    try {
      const data = await apiFetch("/admin/losses");
      setLosses(data);
    } catch {
      notify("Failed to load losses", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (l: Loss) => {
    setEditingId(l.id);
    setForm({ name: l.name, category: l.category ?? "", description: l.description ?? "", sort_order: l.sort_order });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    const payload = {
      name: form.name.trim(),
      category: form.category.trim() || null,
      description: form.description.trim() || null,
      sort_order: form.sort_order,
    };
    try {
      if (editingId) {
        await apiFetch(`/admin/losses/${editingId}`, { method: "PUT", body: JSON.stringify(payload) });
        notify("Loss updated");
      } else {
        await apiFetch("/admin/losses", { method: "POST", body: JSON.stringify(payload) });
        notify("Loss created");
      }
      setDialogOpen(false);
      load();
    } catch {
      notify("Failed to save loss", "error");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this loss from the catalog?")) return;
    try {
      await apiFetch(`/admin/losses/${id}`, { method: "DELETE" });
      setLosses((prev) => prev.filter((l) => l.id !== id));
      notify("Loss deleted");
    } catch {
      notify("Failed to delete", "error");
    }
  };

  const handleSeedDefaults = async () => {
    if (!confirm("Seed the catalog with the 50 starter losses?")) return;
    try {
      await Promise.all(
        SEED_LOSSES.map((name, i) =>
          apiFetch("/admin/losses", {
            method: "POST",
            body: JSON.stringify({ name, sort_order: i }),
          })
        )
      );
      notify(`Seeded ${SEED_LOSSES.length} starter losses`);
      load();
    } catch {
      notify("Failed to seed defaults", "error");
    }
  };

  const sorted = [...losses].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 3 }}>
        <Typography variant="h4">Losses</Typography>
        <Box sx={{ display: "flex", gap: 1 }}>
          {losses.length === 0 && !loading && (
            <Button variant="outlined" onClick={handleSeedDefaults}>Seed Defaults</Button>
          )}
          <Button variant="contained" startIcon={<Add />} onClick={openCreate}>Add Loss</Button>
          <Tooltip title="Refresh"><IconButton onClick={load}><Refresh /></IconButton></Tooltip>
        </Box>
      </Box>

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", mt: 4 }}><CircularProgress /></Box>
      ) : losses.length === 0 ? (
        <Alert severity="info">
          No losses defined yet. Click "Seed Defaults" to load the 50 starter losses, or add them one by one.
        </Alert>
      ) : (
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
          {sorted.map((l) => (
            <Chip
              key={l.id}
              label={l.name}
              onClick={() => openEdit(l)}
              onDelete={() => handleDelete(l.id)}
              sx={{
                bgcolor: "transparent",
                color: "#7E57C2",
                border: "1px solid #7E57C2",
                "& .MuiChip-deleteIcon": { color: "#7E57C2" },
                "&:hover": { bgcolor: "#7E57C2", color: "#fff", "& .MuiChip-deleteIcon": { color: "rgba(255,255,255,0.7)" } },
              }}
            />
          ))}
        </Box>
      )}

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{editingId ? "Edit Loss" : "Add Loss"}</DialogTitle>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 3 }}>
          <TextField
            label="Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            fullWidth
            autoFocus
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            label="Category (optional)"
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
            fullWidth
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            label="Description (optional)"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            fullWidth
            multiline
            rows={3}
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            label="Sort order"
            type="number"
            value={form.sort_order}
            onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })}
            fullWidth
            InputLabelProps={{ shrink: true }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)} sx={{ textTransform: "none" }}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={!form.name.trim()} sx={{ textTransform: "none" }}>Save</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar((s) => ({ ...s, open: false }))}>
        <Alert severity={snackbar.severity} onClose={() => setSnackbar((s) => ({ ...s, open: false }))}>{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
}
