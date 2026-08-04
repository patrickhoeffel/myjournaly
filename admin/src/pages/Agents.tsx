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

interface Agent {
  id: string;
  name: string;
  description: string;
  system_prompt: string;
  is_active: boolean;
  created_at: string;
}

const emptyAgent = { name: "", description: "", system_prompt: "", is_active: true };

export default function Agents() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyAgent);
  const [snackbar, setSnackbar] = useState({ open: false, message: "", severity: "success" as "success" | "error" });

  const load = async () => {
    setLoading(true);
    try {
      const data = await apiFetch("/admin/agents");
      setAgents(data);
    } catch (err) {
      setSnackbar({ open: true, message: "Failed to load agents", severity: "error" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyAgent);
    setDialogOpen(true);
  };

  const openEdit = (agent: Agent) => {
    setEditingId(agent.id);
    setForm({ name: agent.name, description: agent.description, system_prompt: agent.system_prompt, is_active: agent.is_active });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    try {
      if (editingId) {
        await apiFetch(`/admin/agents/${editingId}`, { method: "PUT", body: JSON.stringify(form) });
        setSnackbar({ open: true, message: "Agent updated", severity: "success" });
      } else {
        await apiFetch("/admin/agents", { method: "POST", body: JSON.stringify(form) });
        setSnackbar({ open: true, message: "Agent created", severity: "success" });
      }
      setDialogOpen(false);
      load();
    } catch (err) {
      setSnackbar({ open: true, message: "Failed to save agent", severity: "error" });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this agent?")) return;
    try {
      await apiFetch(`/admin/agents/${id}`, { method: "DELETE" });
      setAgents((prev) => prev.filter((a) => a.id !== id));
      setSnackbar({ open: true, message: "Agent deleted", severity: "success" });
    } catch (err) {
      setSnackbar({ open: true, message: "Failed to delete agent", severity: "error" });
    }
  };

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 3 }}>
        <Typography variant="h4">Agents</Typography>
        <Box sx={{ display: "flex", gap: 1 }}>
          <Button variant="contained" startIcon={<Add />} onClick={openCreate}>New Agent</Button>
          <Tooltip title="Refresh"><IconButton onClick={load}><Refresh /></IconButton></Tooltip>
        </Box>
      </Box>

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", mt: 4 }}><CircularProgress /></Box>
      ) : agents.length === 0 ? (
        <Alert severity="info">No agents yet. Create one to get started.</Alert>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Description</TableCell>
                <TableCell>Active</TableCell>
                <TableCell>Created</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {agents.map((agent) => (
                <TableRow key={agent.id} hover>
                  <TableCell><Typography fontWeight={500}>{agent.name}</Typography></TableCell>
                  <TableCell>{agent.description}</TableCell>
                  <TableCell>{agent.is_active ? "Yes" : "No"}</TableCell>
                  <TableCell>{new Date(agent.created_at).toLocaleDateString()}</TableCell>
                  <TableCell align="right">
                    <Tooltip title="Edit"><IconButton size="small" onClick={() => openEdit(agent)}><Edit /></IconButton></Tooltip>
                    <Tooltip title="Delete"><IconButton size="small" color="error" onClick={() => handleDelete(agent.id)}><Delete /></IconButton></Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>{editingId ? "Edit Agent" : "New Agent"}</DialogTitle>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
          <TextField label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} fullWidth />
          <TextField label="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} fullWidth multiline rows={2} />
          <TextField label="System Prompt" value={form.system_prompt} onChange={(e) => setForm({ ...form, system_prompt: e.target.value })} fullWidth multiline rows={8} />
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Switch checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
            <Typography>Active</Typography>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={!form.name || !form.system_prompt}>Save</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar((s) => ({ ...s, open: false }))}>
        <Alert severity={snackbar.severity} onClose={() => setSnackbar((s) => ({ ...s, open: false }))}>{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
}
