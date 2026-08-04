import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  InputLabel,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Select,
  TextField,
  Typography,
  Snackbar,
  Alert,
  Divider,
  Chip,
} from "@mui/material";
import { Add, ArrowBack, Delete, Edit, Phone, Email, Google } from "@mui/icons-material";
import { apiFetch } from "../lib/api";
import AssociationsPanel from "../components/AssociationsPanel";

interface Person {
  id: string;
  first_name: string;
  last_name: string | null;
  date_of_birth: string | null;
  email: string | null;
  phone: string | null;
  relationship: string;
  notes: string | null;
}

const RELATIONSHIP_OPTIONS = [
  { value: "family", label: "Family" },
  { value: "friend", label: "Friend" },
  { value: "spouse", label: "Spouse" },
  { value: "partner", label: "Partner" },
  { value: "colleague", label: "Colleague" },
  { value: "mentor", label: "Mentor" },
  { value: "therapist", label: "Therapist" },
  { value: "pastor", label: "Pastor" },
  { value: "acquaintance", label: "Acquaintance" },
  { value: "other", label: "Other" },
];

interface GoogleContact {
  resource_name: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
}

const REDIRECT_URI = `${window.location.origin}/people`;

const emptyForm = {
  first_name: "",
  last_name: "",
  date_of_birth: "",
  email: "",
  phone: "",
  relationship: "other",
  notes: "",
};

export default function People() {
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogMode, setDialogMode] = useState<"add" | "edit" | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [searchParams] = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get("person"));
  const [snackbar, setSnackbar] = useState({ open: false, message: "", severity: "success" as "success" | "error" });
  const [importOpen, setImportOpen] = useState(false);
  const [googleContacts, setGoogleContacts] = useState<GoogleContact[]>([]);
  const [selectedImports, setSelectedImports] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);

  const notify = (message: string, severity: "success" | "error" = "success") =>
    setSnackbar({ open: true, message, severity });

  // Handle Google OAuth callback code in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (!code) return;
    // Clean URL
    window.history.replaceState({}, "", window.location.pathname);
    // Exchange code for contacts
    setImporting(true);
    apiFetch("/google/contacts/import", {
      method: "POST",
      body: JSON.stringify({ code, redirect_uri: REDIRECT_URI }),
    })
      .then((data) => {
        setGoogleContacts(data.contacts);
        setSelectedImports(new Set(data.contacts.map((c: GoogleContact) => c.resource_name)));
        setImportOpen(true);
      })
      .catch(() => notify("Failed to fetch Google contacts", "error"))
      .finally(() => setImporting(false));
  }, []);

  const startGoogleImport = async () => {
    try {
      const data = await apiFetch(`/google/auth-url?redirect_uri=${encodeURIComponent(REDIRECT_URI)}`);
      window.location.href = data.url;
    } catch {
      notify("Google import not available", "error");
    }
  };

  const handleSaveImports = async () => {
    const toSave = googleContacts.filter((c) => selectedImports.has(c.resource_name));
    if (toSave.length === 0) return;
    try {
      await apiFetch("/google/contacts/save", {
        method: "POST",
        body: JSON.stringify({ contacts: toSave }),
      });
      setImportOpen(false);
      notify(`Imported ${toSave.length} contacts`);
      load();
    } catch {
      notify("Failed to save contacts", "error");
    }
  };

  const toggleImport = (resourceName: string) => {
    setSelectedImports((prev) => {
      const next = new Set(prev);
      if (next.has(resourceName)) next.delete(resourceName);
      else next.add(resourceName);
      return next;
    });
  };

  const load = useCallback(async () => {
    try {
      const data = await apiFetch("/people");
      setPeople(data);
    } catch {
      notify("Failed to load people", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    try {
      await apiFetch("/people", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          last_name: form.last_name || null,
          date_of_birth: form.date_of_birth || null,
          email: form.email || null,
          phone: form.phone || null,
          notes: form.notes || null,
        }),
      });
      setDialogMode(null);
      notify("Person added");
      load();
    } catch {
      notify("Failed to add person", "error");
    }
  };

  const handleUpdate = async () => {
    if (!editId) return;
    try {
      await apiFetch(`/people/${editId}`, {
        method: "PUT",
        body: JSON.stringify({
          ...form,
          last_name: form.last_name || null,
          date_of_birth: form.date_of_birth || null,
          email: form.email || null,
          phone: form.phone || null,
          notes: form.notes || null,
        }),
      });
      setDialogMode(null);
      notify("Person updated");
      load();
    } catch {
      notify("Failed to update person", "error");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiFetch(`/people/${id}`, { method: "DELETE" });
      if (selectedId === id) setSelectedId(null);
      notify("Person deleted");
      load();
    } catch {
      notify("Failed to delete person", "error");
    }
  };

  const openEdit = (p: Person) => {
    setEditId(p.id);
    setForm({
      first_name: p.first_name,
      last_name: p.last_name || "",
      date_of_birth: p.date_of_birth || "",
      email: p.email || "",
      phone: p.phone || "",
      relationship: p.relationship,
      notes: p.notes || "",
    });
    setDialogMode("edit");
  };

  const selected = people.find((p) => p.id === selectedId);
  const selectedName = selected ? `${selected.first_name}${selected.last_name ? ` ${selected.last_name}` : ""}` : "";

  // Group people alphabetically by last name (or first if no last)
  const grouped = people.reduce<Record<string, Person[]>>((acc, p) => {
    const letter = ((p.last_name || p.first_name)[0] || "?").toUpperCase();
    (acc[letter] ||= []).push(p);
    return acc;
  }, {});
  const sortedLetters = Object.keys(grouped).sort();

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", height: "80vh" }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ display: "flex", height: "calc(100vh - 112px)" }}>
      {/* Left: Address book list */}
      <Box
        sx={{
          width: { xs: "100%", md: 360 },
          borderRight: { md: "1px solid #e0e0e0" },
          display: { xs: selectedId ? "none" : "flex", md: "flex" },
          flexDirection: "column",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, px: 2, py: 1.5, borderBottom: "1px solid #e0e0e0" }}>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>People</Typography>
          <Button
            size="small"
            variant="outlined"
            startIcon={<Google />}
            onClick={startGoogleImport}
            disabled={importing}
          >
            {importing ? "Importing..." : "Import"}
          </Button>
          <Button
            size="small"
            variant="outlined"
            startIcon={<Add />}
            onClick={() => {
              setForm(emptyForm);
              setDialogMode("add");
            }}
          >
            Add
          </Button>
        </Box>
        <Box sx={{ flexGrow: 1, overflow: "auto" }}>
          {sortedLetters.length === 0 ? (
            <Typography color="text.secondary" sx={{ p: 3, textAlign: "center" }}>
              No people yet. Add someone to get started.
            </Typography>
          ) : (
            <List dense disablePadding>
              {sortedLetters.map((letter) => (
                <Box key={letter}>
                  <Typography
                    variant="caption"
                    sx={{ px: 2, pt: 1.5, pb: 0.5, display: "block", fontWeight: 700, color: "text.secondary" }}
                  >
                    {letter}
                  </Typography>
                  {grouped[letter].map((p) => (
                    <ListItemButton
                      key={p.id}
                      selected={p.id === selectedId}
                      onClick={() => setSelectedId(p.id)}
                      sx={{ px: 2 }}
                    >
                      <ListItemText
                        primary={`${p.first_name}${p.last_name ? ` ${p.last_name}` : ""}`}
                        secondary={RELATIONSHIP_OPTIONS.find((r) => r.value === p.relationship)?.label || p.relationship}
                      />
                    </ListItemButton>
                  ))}
                </Box>
              ))}
            </List>
          )}
        </Box>
      </Box>

      {/* Right: Detail panel */}
      <Box
        sx={{
          flexGrow: 1,
          overflow: "auto",
          p: { xs: 2, md: 3 },
          display: { xs: selectedId ? "block" : "none", md: "block" },
        }}
      >
        {selected ? (
          <>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
              <IconButton
                size="small"
                onClick={() => setSelectedId(null)}
                title="Back to list"
                sx={{ display: { xs: "inline-flex", md: "none" }, mr: 0.5 }}
              >
                <ArrowBack fontSize="small" />
              </IconButton>
              <Typography variant="h5" sx={{ flexGrow: 1 }}>
                {selected.first_name}{selected.last_name ? ` ${selected.last_name}` : ""}
              </Typography>
              <IconButton size="small" onClick={() => openEdit(selected)} title="Edit">
                <Edit fontSize="small" />
              </IconButton>
              <IconButton size="small" onClick={() => handleDelete(selected.id)} title="Delete" color="error">
                <Delete fontSize="small" />
              </IconButton>
            </Box>

            <Chip
              label={RELATIONSHIP_OPTIONS.find((r) => r.value === selected.relationship)?.label || selected.relationship}
              size="small"
              sx={{ mb: 2 }}
            />

            {selected.email && (
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
                <Email fontSize="small" color="action" />
                <Typography variant="body2">{selected.email}</Typography>
              </Box>
            )}
            {selected.phone && (
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
                <Phone fontSize="small" color="action" />
                <Typography variant="body2">{selected.phone}</Typography>
              </Box>
            )}

            {selected.notes && (
              <>
                <Divider sx={{ my: 2 }} />
                <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: "pre-wrap" }}>
                  {selected.notes}
                </Typography>
              </>
            )}

            <Divider sx={{ my: 2 }} />

            <AssociationsPanel
              entityId={selected.id}
              entityType="person"
              entityName={selectedName}
              showPeoplePicker={false}
            />
          </>
        ) : (
          <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100%" }}>
            <Typography color="text.secondary">
              Select a person to see their details, or add someone new.
            </Typography>
          </Box>
        )}
      </Box>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogMode !== null} onClose={() => setDialogMode(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{dialogMode === "edit" ? "Edit Person" : "Add Person"}</DialogTitle>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <Box sx={{ display: "flex", gap: 2, mt: 1 }}>
            <TextField
              label="First Name"
              value={form.first_name}
              onChange={(e) => setForm({ ...form, first_name: e.target.value })}
              fullWidth
              autoFocus
            />
            <TextField
              label="Last Name"
              value={form.last_name}
              onChange={(e) => setForm({ ...form, last_name: e.target.value })}
              fullWidth
            />
          </Box>
          <FormControl fullWidth>
            <InputLabel>Relationship</InputLabel>
            <Select
              label="Relationship"
              value={form.relationship}
              onChange={(e) => setForm({ ...form, relationship: e.target.value })}
            >
              {RELATIONSHIP_OPTIONS.map((r) => (
                <MenuItem key={r.value} value={r.value}>{r.label}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            label="Date of Birth"
            type="date"
            value={form.date_of_birth}
            onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })}
            fullWidth
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            label="Email"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            fullWidth
          />
          <TextField
            label="Phone"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            fullWidth
          />
          <TextField
            label="Notes"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            fullWidth
            multiline
            minRows={2}
            maxRows={4}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogMode(null)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={dialogMode === "edit" ? handleUpdate : handleCreate}
            disabled={!form.first_name}
          >
            {dialogMode === "edit" ? "Save" : "Add"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Google Import Dialog */}
      <Dialog open={importOpen} onClose={() => setImportOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Import Google Contacts</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            {googleContacts.length} contacts found. Select which to import.
          </Typography>
          <Box sx={{ display: "flex", gap: 1, mb: 1 }}>
            <Button size="small" onClick={() => setSelectedImports(new Set(googleContacts.map((c) => c.resource_name)))}>
              Select All
            </Button>
            <Button size="small" onClick={() => setSelectedImports(new Set())}>
              Select None
            </Button>
          </Box>
          <List dense sx={{ maxHeight: 400, overflow: "auto" }}>
            {googleContacts.map((c) => (
              <ListItem key={c.resource_name} disablePadding>
                <ListItemButton onClick={() => toggleImport(c.resource_name)} dense>
                  <ListItemIcon sx={{ minWidth: 36 }}>
                    <Checkbox
                      edge="start"
                      checked={selectedImports.has(c.resource_name)}
                      disableRipple
                      size="small"
                    />
                  </ListItemIcon>
                  <ListItemText
                    primary={`${c.first_name}${c.last_name ? ` ${c.last_name}` : ""}`}
                    secondary={[c.email, c.phone].filter(Boolean).join(" · ") || undefined}
                  />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setImportOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSaveImports}
            disabled={selectedImports.size === 0}
          >
            Import {selectedImports.size} Contact{selectedImports.size !== 1 ? "s" : ""}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar((s) => ({ ...s, open: false }))}>
        <Alert severity={snackbar.severity} onClose={() => setSnackbar((s) => ({ ...s, open: false }))}>{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
}
