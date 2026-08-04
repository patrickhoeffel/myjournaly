import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Paper,
  Snackbar,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
  CircularProgress,
} from "@mui/material";
import { Add, Edit, Delete, Refresh } from "@mui/icons-material";
import { apiFetch } from "../lib/api";

interface Guardrail {
  id: string;
  name: string;
  content: string;
  is_active: boolean;
  created_at: string;
}

const emptyGuardrail = { name: "", content: "", is_active: true };

export default function Guardrails() {
  const [guardrails, setGuardrails] = useState<Guardrail[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyGuardrail);
  const [snackbar, setSnackbar] = useState({ open: false, message: "", severity: "success" as "success" | "error" });

  const load = async () => {
    setLoading(true);
    try {
      const data = await apiFetch("/admin/guardrails");
      setGuardrails(data);
    } catch {
      setSnackbar({ open: true, message: "Failed to load guardrails", severity: "error" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyGuardrail);
    setDialogOpen(true);
  };

  const openEdit = (g: Guardrail) => {
    setEditingId(g.id);
    setForm({ name: g.name, content: g.content, is_active: g.is_active });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    try {
      if (editingId) {
        await apiFetch(`/admin/guardrails/${editingId}`, { method: "PUT", body: JSON.stringify(form) });
        setSnackbar({ open: true, message: "Guardrail updated", severity: "success" });
      } else {
        await apiFetch("/admin/guardrails", { method: "POST", body: JSON.stringify(form) });
        setSnackbar({ open: true, message: "Guardrail created", severity: "success" });
      }
      setDialogOpen(false);
      load();
    } catch {
      setSnackbar({ open: true, message: "Failed to save guardrail", severity: "error" });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this guardrail?")) return;
    try {
      await apiFetch(`/admin/guardrails/${id}`, { method: "DELETE" });
      setGuardrails((prev) => prev.filter((g) => g.id !== id));
      setSnackbar({ open: true, message: "Guardrail deleted", severity: "success" });
    } catch {
      setSnackbar({ open: true, message: "Failed to delete guardrail", severity: "error" });
    }
  };

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 3 }}>
        <Typography variant="h4">Guardrails</Typography>
        <Box sx={{ display: "flex", gap: 1 }}>
          <Button variant="contained" startIcon={<Add />} onClick={openCreate}>New Guardrail</Button>
          <Tooltip title="Refresh"><IconButton onClick={load}><Refresh /></IconButton></Tooltip>
        </Box>
      </Box>

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", mt: 4 }}><CircularProgress /></Box>
      ) : guardrails.length === 0 ? (
        <Alert severity="info">No guardrails yet. Create one to define safety rules for all conversations.</Alert>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Content Preview</TableCell>
                <TableCell>Active</TableCell>
                <TableCell>Created</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {guardrails.map((g) => (
                <TableRow key={g.id} hover>
                  <TableCell><Typography fontWeight={500}>{g.name}</Typography></TableCell>
                  <TableCell sx={{ maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {g.content}
                  </TableCell>
                  <TableCell>{g.is_active ? "Yes" : "No"}</TableCell>
                  <TableCell>{new Date(g.created_at).toLocaleDateString()}</TableCell>
                  <TableCell align="right">
                    <Tooltip title="Edit"><IconButton size="small" onClick={() => openEdit(g)}><Edit /></IconButton></Tooltip>
                    <Tooltip title="Delete"><IconButton size="small" color="error" onClick={() => handleDelete(g.id)}><Delete /></IconButton></Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>{editingId ? "Edit Guardrail" : "New Guardrail"}</DialogTitle>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
          <TextField label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} fullWidth />
          <TextField
            label="Guardrail Content"
            value={form.content}
            onChange={(e) => setForm({ ...form, content: e.target.value })}
            fullWidth
            multiline
            rows={10}
            helperText="This text is injected into every conversation as a safety instruction."
          />
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Switch checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
            <Typography>Active</Typography>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={!form.name || !form.content}>Save</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar((s) => ({ ...s, open: false }))}>
        <Alert severity={snackbar.severity} onClose={() => setSnackbar((s) => ({ ...s, open: false }))}>{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
}
