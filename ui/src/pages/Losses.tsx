import { useEffect, useState, useCallback } from "react";
import {
  Alert,
  Box,
  Button,
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
import { Add, Close, RestartAlt } from "@mui/icons-material";
import { apiFetch } from "../lib/api";
import DegreePicker from "../components/DegreePicker";

interface UserLoss {
  id: string;
  name: string;
  category: string | null;
  degree: number | null;
  note: string | null;
  occurred_on: string | null;
  is_default: boolean;
  sort_order: number;
}

const LOSS_COLOR = "#7E57C2"; // soft purple — gentle, not alarming

export default function Losses() {
  const [losses, setLosses] = useState<UserLoss[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ name: "" });
  const [snackbar, setSnackbar] = useState({ open: false, message: "", severity: "success" as "success" | "error" });

  const notify = (message: string, severity: "success" | "error" = "success") =>
    setSnackbar({ open: true, message, severity });

  const load = useCallback(async () => {
    try {
      const data = await apiFetch("/losses");
      setLosses(data);
    } catch {
      notify("Failed to load losses", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    if (!form.name.trim()) return;
    try {
      await apiFetch("/losses", {
        method: "POST",
        body: JSON.stringify({ name: form.name.trim(), sort_order: 99 }),
      });
      setAddOpen(false);
      setForm({ name: "" });
      notify("Loss added");
      load();
    } catch {
      notify("Failed to add loss", "error");
    }
  };

  const handleRemove = async (id: string) => {
    try {
      await apiFetch(`/losses/${id}`, { method: "DELETE" });
      setLosses((prev) => prev.filter((l) => l.id !== id));
      notify("Loss removed");
    } catch {
      notify("Failed to remove loss", "error");
    }
  };

  const handleReset = async () => {
    if (!confirm("Reset your losses list to the defaults? Your custom losses and degree settings will be lost.")) return;
    try {
      const data = await apiFetch("/losses/reset", { method: "POST" });
      setLosses(data);
      notify("Reset to defaults");
    } catch {
      notify("Failed to reset", "error");
    }
  };

  const updateField = async (loss: UserLoss, patch: Partial<UserLoss>) => {
    setLosses((prev) => prev.map((l) => (l.id === loss.id ? { ...l, ...patch } : l)));
    try {
      await apiFetch(`/losses/${loss.id}`, { method: "PUT", body: JSON.stringify(patch) });
    } catch {
      notify("Failed to save change", "error");
      load();
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", height: "80vh" }}>
        <CircularProgress />
      </Box>
    );
  }

  const sorted = [...losses].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <Box sx={{ maxWidth: 900, mx: "auto" }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
        <Typography variant="h5">My Losses</Typography>
        <Box sx={{ display: "flex", gap: 1 }}>
          <Button size="small" variant="outlined" startIcon={<RestartAlt />} onClick={handleReset}>
            Reset
          </Button>
          <Button size="small" variant="outlined" startIcon={<Add />} onClick={() => setAddOpen(true)}>
            Add
          </Button>
        </Box>
      </Box>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Losses are things we may have lost or never had. Mark the ones that resonate, and set a Degree (1–5) for how much weight each carries for you. Take your time.
      </Typography>

      {losses.length === 0 ? (
        <Alert severity="info">
          No losses yet. Click "Reset" to load the starter list, or add your own.
        </Alert>
      ) : (
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 1 }}>
          {sorted.map((l) => (
            <Box
              key={l.id}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1.5,
                px: 1.5,
                py: 1,
                border: "1px solid",
                borderColor: "divider",
                borderRadius: 1,
                bgcolor: l.degree ? `${LOSS_COLOR}0D` : "transparent",
              }}
            >
              <Typography sx={{ flex: 1, color: l.degree ? LOSS_COLOR : "text.primary", fontWeight: l.degree ? 500 : 400 }}>
                {l.name}
              </Typography>
              <DegreePicker
                value={l.degree}
                onChange={(next) => updateField(l, { degree: next })}
                color={LOSS_COLOR}
                title="How much weight does this loss carry? (1–5)"
              />
              <Tooltip title="Remove from my list">
                <IconButton size="small" onClick={() => handleRemove(l.id)} sx={{ color: "text.disabled" }}>
                  <Close fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
          ))}
        </Box>
      )}

      <Dialog open={addOpen} onClose={() => setAddOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Add a Loss</DialogTitle>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
          <TextField
            label="Name"
            value={form.name}
            onChange={(e) => setForm({ name: e.target.value })}
            fullWidth
            autoFocus
            sx={{ mt: 1 }}
            onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddOpen(false)} sx={{ textTransform: "none" }}>Cancel</Button>
          <Button variant="contained" onClick={handleAdd} disabled={!form.name.trim()} sx={{ textTransform: "none" }}>Add</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar((s) => ({ ...s, open: false }))}>
        <Alert severity={snackbar.severity} onClose={() => setSnackbar((s) => ({ ...s, open: false }))}>{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
}
