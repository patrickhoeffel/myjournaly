import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
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

interface Playbook {
  id: string;
  name: string;
  description: string;
  system_prompt: string;
  agent_id: string | null;
  is_active: boolean;
  created_at: string;
}

interface Agent {
  id: string;
  name: string;
}

const emptyPlaybook = { name: "", description: "", system_prompt: "", agent_id: "" as string | null, is_active: true };

export default function Playbooks() {
  const [playbooks, setPlaybooks] = useState<Playbook[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyPlaybook);
  const [snackbar, setSnackbar] = useState({ open: false, message: "", severity: "success" as "success" | "error" });

  const load = async () => {
    setLoading(true);
    try {
      const [pbData, agentData] = await Promise.all([
        apiFetch("/admin/playbooks"),
        apiFetch("/admin/agents"),
      ]);
      setPlaybooks(pbData);
      setAgents(agentData);
    } catch {
      setSnackbar({ open: true, message: "Failed to load playbooks", severity: "error" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyPlaybook);
    setDialogOpen(true);
  };

  const openEdit = (pb: Playbook) => {
    setEditingId(pb.id);
    setForm({ name: pb.name, description: pb.description, system_prompt: pb.system_prompt, agent_id: pb.agent_id || "", is_active: pb.is_active });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const payload = { ...form, agent_id: form.agent_id || null };
    try {
      if (editingId) {
        await apiFetch(`/admin/playbooks/${editingId}`, { method: "PUT", body: JSON.stringify(payload) });
        setSnackbar({ open: true, message: "Playbook updated", severity: "success" });
      } else {
        await apiFetch("/admin/playbooks", { method: "POST", body: JSON.stringify(payload) });
        setSnackbar({ open: true, message: "Playbook created", severity: "success" });
      }
      setDialogOpen(false);
      load();
    } catch {
      setSnackbar({ open: true, message: "Failed to save playbook", severity: "error" });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this playbook?")) return;
    try {
      await apiFetch(`/admin/playbooks/${id}`, { method: "DELETE" });
      setPlaybooks((prev) => prev.filter((p) => p.id !== id));
      setSnackbar({ open: true, message: "Playbook deleted", severity: "success" });
    } catch {
      setSnackbar({ open: true, message: "Failed to delete playbook", severity: "error" });
    }
  };

  const agentName = (id: string | null) => agents.find((a) => a.id === id)?.name || "—";

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 3 }}>
        <Typography variant="h4">Playbooks</Typography>
        <Box sx={{ display: "flex", gap: 1 }}>
          <Button variant="contained" startIcon={<Add />} onClick={openCreate}>New Playbook</Button>
          <Tooltip title="Refresh"><IconButton onClick={load}><Refresh /></IconButton></Tooltip>
        </Box>
      </Box>

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", mt: 4 }}><CircularProgress /></Box>
      ) : playbooks.length === 0 ? (
        <Alert severity="info">No playbooks yet. Create one to get started.</Alert>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Description</TableCell>
                <TableCell>Agent</TableCell>
                <TableCell>Active</TableCell>
                <TableCell>Created</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {playbooks.map((pb) => (
                <TableRow key={pb.id} hover>
                  <TableCell><Typography fontWeight={500}>{pb.name}</Typography></TableCell>
                  <TableCell>{pb.description}</TableCell>
                  <TableCell>{agentName(pb.agent_id)}</TableCell>
                  <TableCell>{pb.is_active ? "Yes" : "No"}</TableCell>
                  <TableCell>{new Date(pb.created_at).toLocaleDateString()}</TableCell>
                  <TableCell align="right">
                    <Tooltip title="Edit"><IconButton size="small" onClick={() => openEdit(pb)}><Edit /></IconButton></Tooltip>
                    <Tooltip title="Delete"><IconButton size="small" color="error" onClick={() => handleDelete(pb.id)}><Delete /></IconButton></Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>{editingId ? "Edit Playbook" : "New Playbook"}</DialogTitle>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
          <TextField label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} fullWidth />
          <TextField label="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} fullWidth multiline rows={2} />
          <FormControl fullWidth>
            <InputLabel>Agent (optional)</InputLabel>
            <Select label="Agent (optional)" value={form.agent_id || ""} onChange={(e) => setForm({ ...form, agent_id: e.target.value || null })}>
              <MenuItem value="">None</MenuItem>
              {agents.map((a) => <MenuItem key={a.id} value={a.id}>{a.name}</MenuItem>)}
            </Select>
          </FormControl>
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
