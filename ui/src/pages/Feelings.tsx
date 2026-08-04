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
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Snackbar,
  TextField,
  Typography,
} from "@mui/material";
import { Add, RestartAlt } from "@mui/icons-material";
import { apiFetch } from "../lib/api";
import { useUserSettings } from "../lib/UserSettingsContext";
import ColorPalette from "../components/ColorPalette";
import DegreePicker from "../components/DegreePicker";

interface UserFeeling {
  id: string;
  name: string;
  valence: "positive" | "negative";
  sort_order: number;
  is_default: boolean;
  degree: number | null;
}

export default function Feelings() {
  const [feelings, setFeelings] = useState<UserFeeling[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ name: "", valence: "positive" as "positive" | "negative" });
  const [snackbar, setSnackbar] = useState({ open: false, message: "", severity: "success" as "success" | "error" });
  const { feelingsPosColor: posColor, feelingsNegColor: negColor, setFeelingsPosColor: setPosColor, setFeelingsNegColor: setNegColor } = useUserSettings();

  const notify = (message: string, severity: "success" | "error" = "success") =>
    setSnackbar({ open: true, message, severity });

  const load = useCallback(async () => {
    try {
      const data = await apiFetch("/feelings");
      setFeelings(data);
    } catch {
      notify("Failed to load feelings", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    if (!form.name.trim()) return;
    try {
      await apiFetch("/feelings", {
        method: "POST",
        body: JSON.stringify({ name: form.name.trim(), valence: form.valence, sort_order: 99 }),
      });
      setAddOpen(false);
      setForm({ name: "", valence: "positive" });
      notify("Feeling added");
      load();
    } catch {
      notify("Failed to add feeling", "error");
    }
  };

  const updateDegree = async (f: UserFeeling, next: number | null) => {
    setFeelings((prev) => prev.map((x) => (x.id === f.id ? { ...x, degree: next } : x)));
    try {
      await apiFetch(`/feelings/${f.id}`, { method: "PUT", body: JSON.stringify({ degree: next }) });
    } catch {
      notify("Failed to save degree", "error");
      load();
    }
  };

  const handleRemove = async (id: string) => {
    try {
      await apiFetch(`/feelings/${id}`, { method: "DELETE" });
      setFeelings((prev) => prev.filter((f) => f.id !== id));
      notify("Feeling removed");
    } catch {
      notify("Failed to remove feeling", "error");
    }
  };

  const handleReset = async () => {
    if (!confirm("Reset your feelings list to the defaults? Your custom feelings will be removed.")) return;
    try {
      const data = await apiFetch("/feelings/reset", { method: "POST" });
      setFeelings(data);
      notify("Reset to defaults");
    } catch {
      notify("Failed to reset", "error");
    }
  };

  const positive = feelings.filter((f) => f.valence === "positive").sort((a, b) => a.name.localeCompare(b.name));
  const negative = feelings.filter((f) => f.valence === "negative").sort((a, b) => a.name.localeCompare(b.name));

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
        <Typography variant="h5">My Feelings</Typography>
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
        These are the feelings available when journaling. Remove any that don't resonate, or add your own.
      </Typography>

      {feelings.length === 0 ? (
        <Alert severity="info">
          No feelings yet. Click "Reset" to load the defaults, or add your own.
        </Alert>
      ) : (
        <Box sx={{ display: "flex", gap: 4 }}>
          {/* Positive */}
          <Box sx={{ flex: 1 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, color: posColor }}>
                Positive ({positive.length})
              </Typography>
              <ColorPalette value={posColor} onChange={setPosColor} title="Choose positive color" />
            </Box>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
              {positive.map((f) => (
                <Box key={f.id} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <Chip
                    label={f.name}
                    onDelete={() => handleRemove(f.id)}
                    sx={{
                      bgcolor: f.is_default ? "transparent" : posColor,
                      color: f.is_default ? posColor : "#fff",
                      border: "1px solid",
                      borderColor: posColor,
                      "& .MuiChip-deleteIcon": { color: f.is_default ? posColor : "rgba(255,255,255,0.7)" },
                      "&:hover": { bgcolor: posColor, color: "#fff", "& .MuiChip-deleteIcon": { color: "rgba(255,255,255,0.7)" } },
                    }}
                  />
                  <DegreePicker value={f.degree} onChange={(n) => updateDegree(f, n)} color={posColor} />
                </Box>
              ))}
            </Box>
          </Box>

          {/* Negative */}
          <Box sx={{ flex: 1 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, color: negColor }}>
                Negative ({negative.length})
              </Typography>
              <ColorPalette value={negColor} onChange={setNegColor} title="Choose negative color" />
            </Box>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
              {negative.map((f) => (
                <Box key={f.id} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <Chip
                    label={f.name}
                    onDelete={() => handleRemove(f.id)}
                    sx={{
                      bgcolor: f.is_default ? "transparent" : negColor,
                      color: f.is_default ? negColor : "#fff",
                      borderColor: negColor,
                      border: `1px solid ${negColor}`,
                      "& .MuiChip-deleteIcon": { color: f.is_default ? negColor : "rgba(255,255,255,0.7)", "&:hover": { color: f.is_default ? negColor : "#fff" } },
                      "&:hover": { bgcolor: negColor, color: "#fff", "& .MuiChip-deleteIcon": { color: "rgba(255,255,255,0.7)" } },
                    }}
                  />
                  <DegreePicker value={f.degree} onChange={(n) => updateDegree(f, n)} color={negColor} />
                </Box>
              ))}
            </Box>
          </Box>
        </Box>
      )}

      {/* Add Dialog */}
      <Dialog open={addOpen} onClose={() => setAddOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Add a Feeling</DialogTitle>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
          <TextField
            label="Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            fullWidth
            autoFocus
            sx={{ mt: 1 }}
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
          <Button onClick={() => setAddOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleAdd} disabled={!form.name.trim()}>Add</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar((s) => ({ ...s, open: false }))}>
        <Alert severity={snackbar.severity} onClose={() => setSnackbar((s) => ({ ...s, open: false }))}>{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
}
