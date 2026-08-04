import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Snackbar,
  TextField,
  Tooltip,
  Typography,
  CircularProgress,
} from "@mui/material";
import { Add, Refresh } from "@mui/icons-material";
import { apiFetch } from "../lib/api";

interface Feeling {
  id: string;
  name: string;
  valence: "positive" | "negative";
  sort_order: number;
}

const SEED_POSITIVE = [
  "Joyful", "Grateful", "Peaceful", "Hopeful", "Loved",
  "Content", "Confident", "Excited", "Proud", "Inspired",
  "Relieved", "Amused", "Compassionate", "Courageous", "Curious",
  "Energized", "Fulfilled", "Tender",
];

const SEED_NEGATIVE = [
  "Angry", "Anxious", "Sad", "Fearful", "Ashamed",
  "Guilty", "Lonely", "Frustrated", "Overwhelmed", "Jealous",
  "Resentful", "Disgusted", "Hopeless", "Insecure", "Numb",
  "Embarrassed", "Bitter", "Grieving",
];

const emptyForm = { name: "", valence: "positive" as "positive" | "negative", sort_order: 1 };

export default function Feelings() {
  const [feelings, setFeelings] = useState<Feeling[]>([]);
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
      const data = await apiFetch("/admin/feelings");
      setFeelings(data);
    } catch {
      notify("Failed to load feelings", "error");
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

  const openEdit = (f: Feeling) => {
    setEditingId(f.id);
    setForm({ name: f.name, valence: f.valence, sort_order: f.sort_order });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    try {
      if (editingId) {
        await apiFetch(`/admin/feelings/${editingId}`, { method: "PUT", body: JSON.stringify(form) });
        notify("Feeling updated");
      } else {
        await apiFetch("/admin/feelings", { method: "POST", body: JSON.stringify(form) });
        notify("Feeling created");
      }
      setDialogOpen(false);
      load();
    } catch {
      notify("Failed to save feeling", "error");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this feeling?")) return;
    try {
      await apiFetch(`/admin/feelings/${id}`, { method: "DELETE" });
      setFeelings((prev) => prev.filter((f) => f.id !== id));
      notify("Feeling deleted");
    } catch {
      notify("Failed to delete", "error");
    }
  };

  const handleSeedDefaults = async () => {
    if (!confirm("This will add the default starter feelings. Continue?")) return;
    try {
      const promises: Promise<unknown>[] = [];
      SEED_POSITIVE.forEach((name, i) => {
        promises.push(
          apiFetch("/admin/feelings", {
            method: "POST",
            body: JSON.stringify({ name, valence: "positive", sort_order: i + 1 }),
          })
        );
      });
      SEED_NEGATIVE.forEach((name, i) => {
        promises.push(
          apiFetch("/admin/feelings", {
            method: "POST",
            body: JSON.stringify({ name, valence: "negative", sort_order: i + 1 }),
          })
        );
      });
      await Promise.all(promises);
      notify(`Seeded ${SEED_POSITIVE.length + SEED_NEGATIVE.length} default feelings`);
      load();
    } catch {
      notify("Failed to seed defaults", "error");
    }
  };

  const positive = feelings.filter((f) => f.valence === "positive").sort((a, b) => a.name.localeCompare(b.name));
  const negative = feelings.filter((f) => f.valence === "negative").sort((a, b) => a.name.localeCompare(b.name));

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 3 }}>
        <Typography variant="h4">Feelings</Typography>
        <Box sx={{ display: "flex", gap: 1 }}>
          {feelings.length === 0 && !loading && (
            <Button variant="outlined" onClick={handleSeedDefaults}>Seed Defaults</Button>
          )}
          <Button variant="contained" startIcon={<Add />} onClick={openCreate}>Add Feeling</Button>
          <Tooltip title="Refresh"><IconButton onClick={load}><Refresh /></IconButton></Tooltip>
        </Box>
      </Box>

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", mt: 4 }}><CircularProgress /></Box>
      ) : feelings.length === 0 ? (
        <Alert severity="info">
          No feelings defined yet. Click "Seed Defaults" to create the starter lists, or add them one by one.
        </Alert>
      ) : (
        <Box sx={{ display: "flex", gap: 4 }}>
          {/* Positive */}
          <Box sx={{ flex: 1 }}>
            <Typography variant="h6" sx={{ mb: 1.5, color: "success.main" }}>
              Positive ({positive.length})
            </Typography>
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
              {positive.map((f) => (
                <Chip
                  key={f.id}
                  label={f.name}
                  onClick={() => openEdit(f)}
                  onDelete={() => handleDelete(f.id)}
                  sx={{
                    bgcolor: "transparent",
                    color: "success.main",
                    border: "1px solid",
                    borderColor: "success.main",
                    "& .MuiChip-deleteIcon": { color: "success.main" },
                    "&:hover": { bgcolor: "#1B5E20", color: "#fff", "& .MuiChip-deleteIcon": { color: "rgba(255,255,255,0.7)" } },
                  }}
                />
              ))}
            </Box>
          </Box>

          {/* Negative */}
          <Box sx={{ flex: 1 }}>
            <Typography variant="h6" sx={{ mb: 1.5, color: "#6A1B9A" }}>
              Negative ({negative.length})
            </Typography>
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
              {negative.map((f) => (
                <Chip
                  key={f.id}
                  label={f.name}
                  onClick={() => openEdit(f)}
                  onDelete={() => handleDelete(f.id)}
                  sx={{
                    color: "#6A1B9A",
                    borderColor: "#6A1B9A",
                    border: "1px solid #6A1B9A",
                    "& .MuiChip-deleteIcon": { color: "#6A1B9A" },
                    "&:hover": { bgcolor: "#6A1B9A", color: "#fff", "& .MuiChip-deleteIcon": { color: "rgba(255,255,255,0.7)" } },
                  }}
                />
              ))}
            </Box>
          </Box>
        </Box>
      )}

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{editingId ? "Edit Feeling" : "Add Feeling"}</DialogTitle>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 3 }}>
          <TextField
            label="Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            fullWidth
            autoFocus
            InputLabelProps={{ shrink: true }}
          />
          <FormControl fullWidth>
            <InputLabel>Valence</InputLabel>
            <Select
              label="Valence"
              value={form.valence}
              onChange={(e) => setForm({ ...form, valence: e.target.value as "positive" | "negative" })}
            >
              <MenuItem value="positive">Positive</MenuItem>
              <MenuItem value="negative">Negative</MenuItem>
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={!form.name}>Save</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar((s) => ({ ...s, open: false }))}>
        <Alert severity={snackbar.severity} onClose={() => setSnackbar((s) => ({ ...s, open: false }))}>{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
}
