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

type Anchor =
  | "today"
  | "start_of_week"
  | "start_of_month"
  | "start_of_year"
  | "birth_date"
  | "earliest_event"
  | "latest_event"
  | "all_time";

type Unit = "days" | "weeks" | "months" | "years";

const ANCHOR_OPTIONS: { value: Anchor; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "start_of_week", label: "Start of week" },
  { value: "start_of_month", label: "Start of month" },
  { value: "start_of_year", label: "Start of year" },
  { value: "birth_date", label: "Birth date" },
  { value: "earliest_event", label: "Earliest event" },
  { value: "latest_event", label: "Latest event" },
  { value: "all_time", label: "All time (special)" },
];

const UNIT_OPTIONS: { value: Unit; label: string }[] = [
  { value: "days", label: "Days" },
  { value: "weeks", label: "Weeks" },
  { value: "months", label: "Months" },
  { value: "years", label: "Years" },
];

interface ZoomPreset {
  id: string;
  label: string;
  anchor: Anchor;
  offset_value: number;
  offset_unit: Unit;
  duration_value: number;
  duration_unit: Unit;
  order: number;
}

const emptyPresetForm = {
  label: "",
  anchor: "today" as Anchor,
  offset_value: 0,
  offset_unit: "days" as Unit,
  duration_value: 1,
  duration_unit: "days" as Unit,
  order: 0,
};

const anchorLabel = (a: Anchor) => ANCHOR_OPTIONS.find((o) => o.value === a)?.label || a;

interface TimelineType {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  is_active: boolean;
  order: number;
  created_at: string;
}

const emptyForm = {
  name: "",
  description: "",
  icon: "",
  color: "#1976d2",
  is_active: true,
  order: 0,
};

export default function Timelines() {
  const [types, setTypes] = useState<TimelineType[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [snackbar, setSnackbar] = useState({ open: false, message: "", severity: "success" as "success" | "error" });

  // ── Zoom presets state ──
  const [presets, setPresets] = useState<ZoomPreset[]>([]);
  const [presetsLoading, setPresetsLoading] = useState(true);
  const [presetDialogOpen, setPresetDialogOpen] = useState(false);
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
  const [presetForm, setPresetForm] = useState(emptyPresetForm);

  const load = async () => {
    setLoading(true);
    try {
      const data = await apiFetch("/admin/timeline-types");
      setTypes(data);
    } catch {
      setSnackbar({ open: true, message: "Failed to load timeline types", severity: "error" });
    } finally {
      setLoading(false);
    }
  };

  const loadPresets = async () => {
    setPresetsLoading(true);
    try {
      const data = await apiFetch("/timeline-zoom-presets");
      setPresets(data);
    } catch {
      setSnackbar({ open: true, message: "Failed to load zoom presets", severity: "error" });
    } finally {
      setPresetsLoading(false);
    }
  };

  useEffect(() => { load(); loadPresets(); }, []);

  const openCreatePreset = () => {
    setEditingPresetId(null);
    setPresetForm({ ...emptyPresetForm, order: presets.length });
    setPresetDialogOpen(true);
  };

  const openEditPreset = (p: ZoomPreset) => {
    setEditingPresetId(p.id);
    setPresetForm({
      label: p.label,
      anchor: p.anchor,
      offset_value: p.offset_value,
      offset_unit: p.offset_unit,
      duration_value: p.duration_value,
      duration_unit: p.duration_unit,
      order: p.order,
    });
    setPresetDialogOpen(true);
  };

  const handleSavePreset = async () => {
    try {
      if (editingPresetId) {
        await apiFetch(`/admin/timeline-zoom-presets/${editingPresetId}`, {
          method: "PUT",
          body: JSON.stringify(presetForm),
        });
      } else {
        await apiFetch("/admin/timeline-zoom-presets", {
          method: "POST",
          body: JSON.stringify(presetForm),
        });
      }
      setPresetDialogOpen(false);
      setSnackbar({ open: true, message: editingPresetId ? "Preset updated" : "Preset created", severity: "success" });
      loadPresets();
    } catch {
      setSnackbar({ open: true, message: "Failed to save preset", severity: "error" });
    }
  };

  const handleDeletePreset = async (id: string) => {
    if (!confirm("Delete this zoom preset?")) return;
    try {
      await apiFetch(`/admin/timeline-zoom-presets/${id}`, { method: "DELETE" });
      setPresets((prev) => prev.filter((p) => p.id !== id));
      setSnackbar({ open: true, message: "Preset deleted", severity: "success" });
    } catch {
      setSnackbar({ open: true, message: "Failed to delete preset", severity: "error" });
    }
  };

  const summarizePreset = (p: ZoomPreset) => {
    if (p.anchor === "all_time") return "Spans birth → today";
    const offset = p.offset_value === 0 ? "" : `${p.offset_value > 0 ? "+" : ""}${p.offset_value} ${p.offset_unit}`;
    const duration = `${p.duration_value} ${p.duration_unit}`;
    return [`from ${anchorLabel(p.anchor)}`, offset, `for ${duration}`].filter(Boolean).join(" · ");
  };

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...emptyForm, order: types.length });
    setDialogOpen(true);
  };

  const openEdit = (t: TimelineType) => {
    setEditingId(t.id);
    setForm({
      name: t.name,
      description: t.description || "",
      icon: t.icon || "",
      color: t.color || "#1976d2",
      is_active: t.is_active,
      order: t.order,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const payload = {
      ...form,
      description: form.description || null,
      icon: form.icon || null,
      color: form.color || null,
    };
    try {
      if (editingId) {
        await apiFetch(`/admin/timeline-types/${editingId}`, { method: "PUT", body: JSON.stringify(payload) });
      } else {
        await apiFetch("/admin/timeline-types", { method: "POST", body: JSON.stringify(payload) });
      }
      setDialogOpen(false);
      setSnackbar({ open: true, message: editingId ? "Type updated" : "Type created", severity: "success" });
      load();
    } catch {
      setSnackbar({ open: true, message: "Failed to save", severity: "error" });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this timeline type?")) return;
    try {
      await apiFetch(`/admin/timeline-types/${id}`, { method: "DELETE" });
      setTypes((prev) => prev.filter((t) => t.id !== id));
      setSnackbar({ open: true, message: "Type deleted", severity: "success" });
    } catch {
      setSnackbar({ open: true, message: "Failed to delete", severity: "error" });
    }
  };

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 3 }}>
        <Typography variant="h4">Timelines</Typography>
        <Box sx={{ display: "flex", gap: 1 }}>
          <Button variant="contained" startIcon={<Add />} onClick={openCreate}>New Type</Button>
          <Tooltip title="Refresh"><IconButton onClick={load}><Refresh /></IconButton></Tooltip>
        </Box>
      </Box>

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", mt: 4 }}><CircularProgress /></Box>
      ) : types.length === 0 ? (
        <Alert severity="info">No timeline types yet.</Alert>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell width={60}>Order</TableCell>
                <TableCell>Name</TableCell>
                <TableCell>Description</TableCell>
                <TableCell>Color</TableCell>
                <TableCell>Icon</TableCell>
                <TableCell>Active</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {types.map((t) => (
                <TableRow key={t.id} hover sx={{ cursor: "pointer" }} onDoubleClick={() => openEdit(t)}>
                  <TableCell>{t.order}</TableCell>
                  <TableCell><Typography fontWeight={500}>{t.name}</Typography></TableCell>
                  <TableCell>{t.description || "—"}</TableCell>
                  <TableCell>
                    {t.color && (
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <Box sx={{ width: 20, height: 20, borderRadius: 1, bgcolor: t.color, border: "1px solid #ccc" }} />
                        <Typography variant="caption">{t.color}</Typography>
                      </Box>
                    )}
                  </TableCell>
                  <TableCell>{t.icon || "—"}</TableCell>
                  <TableCell>{t.is_active ? "Yes" : "No"}</TableCell>
                  <TableCell align="right">
                    <Tooltip title="Edit"><IconButton size="small" onClick={() => openEdit(t)}><Edit /></IconButton></Tooltip>
                    <Tooltip title="Delete"><IconButton size="small" color="error" onClick={() => handleDelete(t.id)}><Delete /></IconButton></Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* ── Zoom Presets section ── */}
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mt: 6, mb: 3 }}>
        <Typography variant="h5">Zoom Presets</Typography>
        <Box sx={{ display: "flex", gap: 1 }}>
          <Button variant="contained" startIcon={<Add />} onClick={openCreatePreset}>New Preset</Button>
          <Tooltip title="Refresh"><IconButton onClick={loadPresets}><Refresh /></IconButton></Tooltip>
        </Box>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Presets appear in the user-facing Timeline page as a "Zoom To" dropdown. Defaults are seeded automatically on first load.
      </Typography>

      {presetsLoading ? (
        <Box sx={{ display: "flex", justifyContent: "center", mt: 4 }}><CircularProgress /></Box>
      ) : presets.length === 0 ? (
        <Alert severity="info">No zoom presets yet.</Alert>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell width={60}>Order</TableCell>
                <TableCell>Label</TableCell>
                <TableCell>Window</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {presets.map((p) => (
                <TableRow key={p.id} hover sx={{ cursor: "pointer" }} onDoubleClick={() => openEditPreset(p)}>
                  <TableCell>{p.order}</TableCell>
                  <TableCell><Typography fontWeight={500}>{p.label}</Typography></TableCell>
                  <TableCell><Typography variant="body2" color="text.secondary">{summarizePreset(p)}</Typography></TableCell>
                  <TableCell align="right">
                    <Tooltip title="Edit"><IconButton size="small" onClick={() => openEditPreset(p)}><Edit /></IconButton></Tooltip>
                    <Tooltip title="Delete"><IconButton size="small" color="error" onClick={() => handleDeletePreset(p.id)}><Delete /></IconButton></Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Dialog open={presetDialogOpen} onClose={() => setPresetDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingPresetId ? "Edit Zoom Preset" : "New Zoom Preset"}</DialogTitle>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <TextField
            label="Label"
            sx={{ mt: 1 }}
            value={presetForm.label}
            onChange={(e) => setPresetForm({ ...presetForm, label: e.target.value })}
            fullWidth
            autoFocus
          />
          <FormControl fullWidth>
            <InputLabel>Anchor</InputLabel>
            <Select
              label="Anchor"
              value={presetForm.anchor}
              onChange={(e) => setPresetForm({ ...presetForm, anchor: e.target.value as Anchor })}
            >
              {ANCHOR_OPTIONS.map((o) => (
                <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
              ))}
            </Select>
          </FormControl>
          {presetForm.anchor !== "all_time" && (
            <>
              <Box sx={{ display: "flex", gap: 2 }}>
                <TextField
                  label="Offset"
                  type="number"
                  value={presetForm.offset_value}
                  onChange={(e) => setPresetForm({ ...presetForm, offset_value: parseInt(e.target.value) || 0 })}
                  sx={{ width: 120 }}
                  helperText="Can be negative"
                />
                <FormControl sx={{ minWidth: 140 }}>
                  <InputLabel>Offset unit</InputLabel>
                  <Select
                    label="Offset unit"
                    value={presetForm.offset_unit}
                    onChange={(e) => setPresetForm({ ...presetForm, offset_unit: e.target.value as Unit })}
                  >
                    {UNIT_OPTIONS.map((u) => (
                      <MenuItem key={u.value} value={u.value}>{u.label}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Box>
              <Box sx={{ display: "flex", gap: 2 }}>
                <TextField
                  label="Duration"
                  type="number"
                  value={presetForm.duration_value}
                  onChange={(e) => setPresetForm({ ...presetForm, duration_value: parseInt(e.target.value) || 0 })}
                  sx={{ width: 120 }}
                  inputProps={{ min: 1 }}
                />
                <FormControl sx={{ minWidth: 140 }}>
                  <InputLabel>Duration unit</InputLabel>
                  <Select
                    label="Duration unit"
                    value={presetForm.duration_unit}
                    onChange={(e) => setPresetForm({ ...presetForm, duration_unit: e.target.value as Unit })}
                  >
                    {UNIT_OPTIONS.map((u) => (
                      <MenuItem key={u.value} value={u.value}>{u.label}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Box>
            </>
          )}
          <TextField
            label="Order"
            type="number"
            value={presetForm.order}
            onChange={(e) => setPresetForm({ ...presetForm, order: parseInt(e.target.value) || 0 })}
            sx={{ width: 120 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPresetDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSavePreset} disabled={!presetForm.label}>Save</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingId ? "Edit Timeline Type" : "New Timeline Type"}</DialogTitle>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <TextField label="Name" sx={{ mt: 1 }} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} fullWidth />
          <TextField label="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} fullWidth multiline rows={2} />
          <Box sx={{ display: "flex", gap: 2 }}>
            <TextField label="Icon (identifier)" value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} fullWidth />
            <TextField label="Order" type="number" value={form.order} onChange={(e) => setForm({ ...form, order: parseInt(e.target.value) || 0 })} sx={{ width: 100 }} />
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
            <TextField
              label="Color"
              type="color"
              value={form.color}
              onChange={(e) => setForm({ ...form, color: e.target.value })}
              sx={{ width: 120 }}
              InputProps={{ sx: { height: 56 } }}
            />
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Switch checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
              <Typography>Active</Typography>
            </Box>
          </Box>
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
