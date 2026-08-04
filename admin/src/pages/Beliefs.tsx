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
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { Add, Delete, Edit, Refresh } from "@mui/icons-material";
import { apiFetch } from "../lib/api";

interface DefaultBelief {
  id: string;
  category: string;
  name: string;
  description: string;
  valence: string;
  sort_order: number;
}

const CATEGORY_LABELS: Record<string, string> = {
  self: "Beliefs about Myself",
  god: "Beliefs about God",
  others: "Beliefs about Others",
  world: "Beliefs about the World",
};

const CATEGORY_ORDER = ["self", "god", "others", "world"];

const emptyForm = { category: "self", name: "", description: "", valence: "positive", sort_order: 0 };

export default function Beliefs() {
  const [beliefs, setBeliefs] = useState<DefaultBelief[]>([]);
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
      const data = await apiFetch("/admin/beliefs");
      setBeliefs(data);
    } catch {
      notify("Failed to load beliefs", "error");
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (b: DefaultBelief) => {
    setEditingId(b.id);
    setForm({ category: b.category, name: b.name, description: b.description, valence: b.valence, sort_order: b.sort_order });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    try {
      if (editingId) {
        await apiFetch(`/admin/beliefs/${editingId}`, { method: "PUT", body: JSON.stringify(form) });
        notify("Belief updated");
      } else {
        await apiFetch("/admin/beliefs", { method: "POST", body: JSON.stringify(form) });
        notify("Belief created");
      }
      setDialogOpen(false);
      load();
    } catch {
      notify("Failed to save belief", "error");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiFetch(`/admin/beliefs/${id}`, { method: "DELETE" });
      notify("Belief deleted");
      load();
    } catch {
      notify("Failed to delete belief", "error");
    }
  };

  const handleSeed = async () => {
    try {
      const result = await apiFetch("/admin/beliefs/seed", { method: "POST" });
      notify(`Seeded ${result.seeded} beliefs`);
      load();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to seed";
      notify(msg, "error");
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", mt: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  const grouped = CATEGORY_ORDER.map((cat) => ({
    category: cat,
    label: CATEGORY_LABELS[cat],
    items: beliefs.filter((b) => b.category === cat),
  }));

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 3 }}>
        <Typography variant="h5">Default Beliefs</Typography>
        <Box sx={{ flexGrow: 1 }} />
        {beliefs.length === 0 && (
          <Button variant="outlined" onClick={handleSeed}>
            Seed Defaults
          </Button>
        )}
        <Button variant="contained" startIcon={<Add />} onClick={openAdd}>
          Add Belief
        </Button>
        <Tooltip title="Refresh">
          <IconButton onClick={load}><Refresh /></IconButton>
        </Tooltip>
      </Box>

      {grouped.map(({ category, label, items }) => (
        <Box key={category} sx={{ mb: 4 }}>
          <Typography variant="h6" sx={{ mb: 1 }}>
            {label} ({items.length})
          </Typography>
          <TableContainer component={Paper}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Description</TableCell>
                  <TableCell>Valence</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {items.map((b) => (
                  <TableRow key={b.id} hover>
                    <TableCell sx={{ fontWeight: 500 }}>{b.name}</TableCell>
                    <TableCell sx={{ color: "text.secondary", maxWidth: 400 }}>{b.description}</TableCell>
                    <TableCell>
                      <Chip
                        label={b.valence}
                        size="small"
                        color={b.valence === "positive" ? "success" : undefined}
                        variant="outlined"
                        sx={b.valence === "negative" ? { color: "#6A1B9A", borderColor: "rgba(106,27,154,0.5)" } : {}}
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip title="Edit"><IconButton size="small" onClick={() => openEdit(b)}><Edit fontSize="small" /></IconButton></Tooltip>
                      <Tooltip title="Delete"><IconButton size="small" color="error" onClick={() => handleDelete(b.id)}><Delete fontSize="small" /></IconButton></Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
                {items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} sx={{ color: "text.secondary", textAlign: "center" }}>
                      No beliefs in this category
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      ))}

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingId ? "Edit Belief" : "Add Belief"}</DialogTitle>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <FormControl fullWidth sx={{ mt: 1 }}>
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
          <TextField
            label="Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            fullWidth
          />
          <TextField
            label="Description"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            fullWidth
            multiline
            rows={2}
          />
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
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={!form.name}>
            {editingId ? "Save" : "Add"}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar((s) => ({ ...s, open: false }))}>
        <Alert severity={snackbar.severity} onClose={() => setSnackbar((s) => ({ ...s, open: false }))}>{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
}
