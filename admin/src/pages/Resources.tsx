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

interface Resource {
  id: string;
  title: string;
  resource_type: string;
  url: string | null;
  description: string | null;
  content: string | null;
  reference: string | null;
  author: string | null;
  group_ids: string[];
  tags: string[];
  is_active: boolean;
  created_at: string;
}

interface ResourceGroup {
  id: string;
  name: string;
}

const RESOURCE_TYPES = [
  "website", "course", "video", "podcast", "teaching",
  "bible_verse", "book", "article", "worksheet", "exercise",
  "question", "survey", "other",
];

const emptyForm = {
  title: "", resource_type: "other", url: "", description: "",
  content: "", reference: "", author: "", group_ids: [] as string[],
  tags: [] as string[], is_active: true,
};

export default function Resources() {
  const [resources, setResources] = useState<Resource[]>([]);
  const [groups, setGroups] = useState<ResourceGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [tagInput, setTagInput] = useState("");
  const [snackbar, setSnackbar] = useState({ open: false, message: "", severity: "success" as "success" | "error" });

  const load = async () => {
    setLoading(true);
    try {
      const [rData, gData] = await Promise.all([
        apiFetch("/admin/resources"),
        apiFetch("/admin/resource-groups"),
      ]);
      setResources(rData);
      setGroups(gData);
    } catch {
      setSnackbar({ open: true, message: "Failed to load resources", severity: "error" });
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

  const openEdit = (r: Resource) => {
    setEditingId(r.id);
    setForm({
      title: r.title, resource_type: r.resource_type,
      url: r.url || "", description: r.description || "",
      content: r.content || "", reference: r.reference || "",
      author: r.author || "", group_ids: r.group_ids || [],
      tags: r.tags || [], is_active: r.is_active,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const payload = {
      ...form,
      url: form.url || null,
      description: form.description || null,
      content: form.content || null,
      reference: form.reference || null,
      author: form.author || null,
    };
    try {
      if (editingId) {
        await apiFetch(`/admin/resources/${editingId}`, { method: "PUT", body: JSON.stringify(payload) });
        setSnackbar({ open: true, message: "Resource updated", severity: "success" });
      } else {
        await apiFetch("/admin/resources", { method: "POST", body: JSON.stringify(payload) });
        setSnackbar({ open: true, message: "Resource created", severity: "success" });
      }
      setDialogOpen(false);
      load();
    } catch {
      setSnackbar({ open: true, message: "Failed to save resource", severity: "error" });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this resource?")) return;
    try {
      await apiFetch(`/admin/resources/${id}`, { method: "DELETE" });
      setResources((prev) => prev.filter((r) => r.id !== id));
      setSnackbar({ open: true, message: "Resource deleted", severity: "success" });
    } catch {
      setSnackbar({ open: true, message: "Failed to delete", severity: "error" });
    }
  };

  const groupName = (id: string) => groups.find((g) => g.id === id)?.name || id;

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 3 }}>
        <Typography variant="h4">Resources</Typography>
        <Box sx={{ display: "flex", gap: 1 }}>
          <Button variant="contained" startIcon={<Add />} onClick={openCreate}>New Resource</Button>
          <Tooltip title="Refresh"><IconButton onClick={load}><Refresh /></IconButton></Tooltip>
        </Box>
      </Box>

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", mt: 4 }}><CircularProgress /></Box>
      ) : resources.length === 0 ? (
        <Alert severity="info">No resources yet.</Alert>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Title</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Groups</TableCell>
                <TableCell>Tags</TableCell>
                <TableCell>Active</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {resources.map((r) => (
                <TableRow key={r.id} hover>
                  <TableCell>
                    <Typography fontWeight={500}>{r.title}</Typography>
                    {r.author && <Typography variant="caption" color="text.secondary">{r.author}</Typography>}
                  </TableCell>
                  <TableCell><Chip label={r.resource_type} size="small" /></TableCell>
                  <TableCell>
                    {r.group_ids.map((gid) => (
                      <Chip key={gid} label={groupName(gid)} size="small" sx={{ mr: 0.5 }} />
                    ))}
                  </TableCell>
                  <TableCell>
                    {r.tags.map((t) => (
                      <Chip key={t} label={t} size="small" variant="outlined" sx={{ mr: 0.5 }} />
                    ))}
                  </TableCell>
                  <TableCell>{r.is_active ? "Yes" : "No"}</TableCell>
                  <TableCell align="right">
                    <Tooltip title="Edit"><IconButton size="small" onClick={() => openEdit(r)}><Edit /></IconButton></Tooltip>
                    <Tooltip title="Delete"><IconButton size="small" color="error" onClick={() => handleDelete(r.id)}><Delete /></IconButton></Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>{editingId ? "Edit Resource" : "New Resource"}</DialogTitle>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
          <TextField label="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} fullWidth />
          <Box sx={{ display: "flex", gap: 2 }}>
            <FormControl sx={{ minWidth: 160 }}>
              <InputLabel>Type</InputLabel>
              <Select label="Type" value={form.resource_type} onChange={(e) => setForm({ ...form, resource_type: e.target.value })}>
                {RESOURCE_TYPES.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
              </Select>
            </FormControl>
            <TextField label="Author" value={form.author} onChange={(e) => setForm({ ...form, author: e.target.value })} fullWidth />
          </Box>
          <TextField label="URL" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} fullWidth />
          <TextField label="Reference (e.g. John 3:16)" value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} fullWidth />
          <TextField label="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} fullWidth multiline rows={2} />
          <TextField label="Content (inline text for worksheets, etc.)" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} fullWidth multiline rows={4} />
          <FormControl fullWidth>
            <InputLabel>Groups</InputLabel>
            <Select
              label="Groups"
              multiple
              value={form.group_ids}
              onChange={(e) => setForm({ ...form, group_ids: e.target.value as string[] })}
              renderValue={(selected) => (
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                  {selected.map((id) => <Chip key={id} label={groupName(id)} size="small" />)}
                </Box>
              )}
            >
              {groups.map((g) => <MenuItem key={g.id} value={g.id}>{g.name}</MenuItem>)}
            </Select>
          </FormControl>
          <TextField
            label="Tags (press Enter to add)"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && tagInput.trim()) {
                e.preventDefault();
                if (!form.tags.includes(tagInput.trim())) {
                  setForm({ ...form, tags: [...form.tags, tagInput.trim()] });
                }
                setTagInput("");
              }
            }}
            fullWidth
            helperText={form.tags.length > 0 ? undefined : "Type a tag and press Enter"}
          />
          {form.tags.length > 0 && (
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
              {form.tags.map((t) => (
                <Chip key={t} label={t} size="small" onDelete={() => setForm({ ...form, tags: form.tags.filter((x) => x !== t) })} />
              ))}
            </Box>
          )}
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Switch checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
            <Typography>Active</Typography>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={!form.title}>Save</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar((s) => ({ ...s, open: false }))}>
        <Alert severity={snackbar.severity} onClose={() => setSnackbar((s) => ({ ...s, open: false }))}>{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
}
