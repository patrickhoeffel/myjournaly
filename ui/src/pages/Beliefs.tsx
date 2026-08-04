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

interface UserBelief {
  id: string;
  statement: string;
  source_description: string;
  category: string | null;
  valence: string | null;
  is_default: boolean;
  is_active: boolean;
  degree: number | null;
}

const CATEGORY_LABELS: Record<string, string> = {
  self: "Beliefs about Myself",
  god: "Beliefs about God",
  others: "Beliefs about Others",
  world: "Beliefs about the World",
};

const CATEGORY_ORDER = ["self", "god", "others", "world"];

export default function Beliefs() {
  const { beliefsPosColor: posColor, beliefsNegColor: negColor, setBeliefsPosColor: setPosColor, setBeliefsNegColor: setNegColor } = useUserSettings();
  const [beliefs, setBeliefs] = useState<UserBelief[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ statement: "", description: "", category: "self", valence: "positive" });
  const [snackbar, setSnackbar] = useState({ open: false, message: "", severity: "success" as "success" | "error" });

  const notify = (message: string, severity: "success" | "error" = "success") =>
    setSnackbar({ open: true, message, severity });

  const load = useCallback(async () => {
    try {
      const data = await apiFetch("/beliefs");
      setBeliefs(data);
    } catch {
      notify("Failed to load beliefs", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    if (!form.statement.trim()) return;
    try {
      await apiFetch("/beliefs", {
        method: "POST",
        body: JSON.stringify({
          user_id: "",
          statement: form.statement.trim(),
          source_description: form.description.trim(),
          category: form.category,
          valence: form.valence,
        }),
      });
      setAddOpen(false);
      setForm({ statement: "", description: "", category: "self", valence: "positive" });
      notify("Belief added");
      load();
    } catch {
      notify("Failed to add belief", "error");
    }
  };

  const handleRemove = async (id: string) => {
    try {
      await apiFetch(`/beliefs/${id}`, { method: "DELETE" });
      setBeliefs((prev) => prev.filter((b) => b.id !== id));
      notify("Belief removed");
    } catch {
      notify("Failed to remove belief", "error");
    }
  };

  const updateDegree = async (b: UserBelief, next: number | null) => {
    setBeliefs((prev) => prev.map((x) => (x.id === b.id ? { ...x, degree: next } : x)));
    try {
      await apiFetch(`/beliefs/${b.id}`, { method: "PUT", body: JSON.stringify({ degree: next }) });
    } catch {
      notify("Failed to save degree", "error");
      load();
    }
  };

  const handleReset = async () => {
    if (!confirm("Reset your beliefs to the defaults? Your custom beliefs will be removed.")) return;
    try {
      const data = await apiFetch("/beliefs/reset", { method: "POST" });
      setBeliefs(data);
      notify("Reset to defaults");
    } catch {
      notify("Failed to reset", "error");
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", height: "80vh" }}>
        <CircularProgress />
      </Box>
    );
  }

  const grouped = CATEGORY_ORDER.map((cat) => {
    const items = beliefs.filter((b) => b.category === cat);
    const positive = items.filter((b) => b.valence === "positive").sort((a, b) => a.statement.localeCompare(b.statement));
    const negative = items.filter((b) => b.valence === "negative").sort((a, b) => a.statement.localeCompare(b.statement));
    return { category: cat, label: CATEGORY_LABELS[cat], positive, negative };
  });

  return (
    <Box sx={{ maxWidth: 800, mx: "auto" }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 3 }}>
        <Typography variant="h5">My Beliefs</Typography>
        <Box sx={{ display: "flex", gap: 1 }}>
          <Button size="small" variant="outlined" startIcon={<RestartAlt />} onClick={handleReset}>
            Reset
          </Button>
          <Button size="small" variant="outlined" startIcon={<Add />} onClick={() => setAddOpen(true)}>
            Add
          </Button>
        </Box>
      </Box>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        These are beliefs you hold about yourself, God, others, and the world. Remove any that don't resonate, or add your own.
      </Typography>

      <Box sx={{ display: "flex", gap: 3, mb: 3 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
          <ColorPalette value={posColor} onChange={setPosColor} title="Choose positive color" />
          <Typography variant="caption" sx={{ fontWeight: 600, color: posColor }}>Positive</Typography>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
          <ColorPalette value={negColor} onChange={setNegColor} title="Choose negative color" />
          <Typography variant="caption" sx={{ fontWeight: 600, color: negColor }}>Negative</Typography>
        </Box>
      </Box>

      {beliefs.length === 0 ? (
        <Alert severity="info">
          No beliefs yet. Click "Reset" to load the defaults, or add your own.
        </Alert>
      ) : (
        grouped.map(({ category, label, positive, negative }) => (
          <Box key={category} sx={{ mb: 4 }}>
            <Typography variant="subtitle1" sx={{ mb: 1.5, fontWeight: 600 }}>
              {label}
            </Typography>
            <Box sx={{ display: "flex", gap: 4 }}>
              {/* Positive */}
              <Box sx={{ flex: 1 }}>
                <Typography variant="caption" sx={{ fontWeight: 600, color: posColor, mb: 0.5, display: "block" }}>
                  Positive ({positive.length})
                </Typography>
                <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
                  {positive.map((b) => (
                    <Box key={b.id} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <Chip
                        label={b.statement}
                        size="small"
                        onDelete={() => handleRemove(b.id)}
                        sx={{
                          bgcolor: b.is_default ? "transparent" : posColor,
                          color: b.is_default ? posColor : "#fff",
                          border: "1px solid",
                          borderColor: posColor,
                          "& .MuiChip-deleteIcon": { color: b.is_default ? posColor : "rgba(255,255,255,0.7)" },
                          "&:hover": { bgcolor: posColor, color: "#fff", "& .MuiChip-deleteIcon": { color: "rgba(255,255,255,0.7)" } },
                        }}
                      />
                      <DegreePicker value={b.degree} onChange={(n) => updateDegree(b, n)} color={posColor} size={8} />
                    </Box>
                  ))}
                  {positive.length === 0 && (
                    <Typography variant="caption" color="text.secondary">None</Typography>
                  )}
                </Box>
              </Box>

              {/* Negative */}
              <Box sx={{ flex: 1 }}>
                <Typography variant="caption" sx={{ fontWeight: 600, color: negColor, mb: 0.5, display: "block" }}>
                  Negative ({negative.length})
                </Typography>
                <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
                  {negative.map((b) => (
                    <Box key={b.id} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <Chip
                        label={b.statement}
                        size="small"
                        onDelete={() => handleRemove(b.id)}
                        sx={{
                          bgcolor: b.is_default ? "transparent" : negColor,
                          color: b.is_default ? negColor : "#fff",
                          borderColor: negColor,
                          border: `1px solid ${negColor}`,
                          "& .MuiChip-deleteIcon": { color: b.is_default ? negColor : "rgba(255,255,255,0.7)", "&:hover": { color: b.is_default ? "#4A148C" : "#fff" } },
                          "&:hover": { bgcolor: negColor, color: "#fff", "& .MuiChip-deleteIcon": { color: "rgba(255,255,255,0.7)" } },
                        }}
                      />
                      <DegreePicker value={b.degree} onChange={(n) => updateDegree(b, n)} color={negColor} size={8} />
                    </Box>
                  ))}
                  {negative.length === 0 && (
                    <Typography variant="caption" color="text.secondary">None</Typography>
                  )}
                </Box>
              </Box>
            </Box>
          </Box>
        ))
      )}

      {/* Add Dialog */}
      <Dialog open={addOpen} onClose={() => setAddOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Add a Belief</DialogTitle>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
          <TextField
            label="Belief"
            value={form.statement}
            onChange={(e) => setForm({ ...form, statement: e.target.value })}
            fullWidth
            autoFocus
            placeholder='e.g. "I am worthy of love"'
            sx={{ mt: 1 }}
          />
          <TextField
            label="Description (optional)"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            fullWidth
            multiline
            rows={2}
          />
          <FormControl fullWidth>
            <InputLabel>Category</InputLabel>
            <Select
              label="Category"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            >
              {CATEGORY_ORDER.map((cat) => (
                <MenuItem key={cat} value={cat}>{CATEGORY_LABELS[cat]}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl fullWidth>
            <InputLabel>Valence</InputLabel>
            <Select
              label="Valence"
              value={form.valence}
              onChange={(e) => setForm({ ...form, valence: e.target.value })}
            >
              <MenuItem value="positive">Positive</MenuItem>
              <MenuItem value="negative">Negative</MenuItem>
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleAdd} disabled={!form.statement.trim()}>Add</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar((s) => ({ ...s, open: false }))}>
        <Alert severity={snackbar.severity} onClose={() => setSnackbar((s) => ({ ...s, open: false }))}>{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
}
