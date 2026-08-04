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
import { Add, Refresh, Block } from "@mui/icons-material";
import { apiFetch } from "../lib/api";

interface AccessGrant {
  id: string;
  user_id: string;
  resource_id: string | null;
  group_id: string | null;
  access_level: string;
  begin_date: string;
  end_date: string | null;
  granted_at: string;
  granted_by: string | null;
  grant_justification: string | null;
  revoked_at: string | null;
  revoked_by: string | null;
  revoke_reason: string | null;
}

interface UserProfile {
  id: string;
  email: string;
  display_name: string;
}

interface Resource {
  id: string;
  title: string;
}

interface ResourceGroup {
  id: string;
  name: string;
}

const emptyForm = {
  user_id: "",
  resource_id: "",
  group_id: "",
  access_level: "view",
  begin_date: new Date().toISOString().split("T")[0],
  end_date: "",
  justification: "",
};

export default function ResourceAccess() {
  const [grants, setGrants] = useState<AccessGrant[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [groups, setGroups] = useState<ResourceGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [filterUser, setFilterUser] = useState("");
  const [snackbar, setSnackbar] = useState({ open: false, message: "", severity: "success" as "success" | "error" });

  const load = async () => {
    setLoading(true);
    try {
      const params = filterUser ? `?user_id=${filterUser}` : "";
      const [gData, uData, rData, grData] = await Promise.all([
        apiFetch(`/admin/resource-access${params}`),
        apiFetch("/admin/users"),
        apiFetch("/admin/resources"),
        apiFetch("/admin/resource-groups"),
      ]);
      setGrants(gData);
      setUsers(uData);
      setResources(rData);
      setGroups(grData);
    } catch {
      setSnackbar({ open: true, message: "Failed to load", severity: "error" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [filterUser]);

  const userName = (uid: string) => {
    const u = users.find((u) => u.id === uid);
    return u ? `${u.display_name} (${u.email})` : uid;
  };
  const resourceName = (rid: string | null) => rid ? (resources.find((r) => r.id === rid)?.title || rid) : "";
  const groupName = (gid: string | null) => gid ? (groups.find((g) => g.id === gid)?.name || gid) : "";

  const handleGrant = async () => {
    const payload = {
      user_id: form.user_id,
      resource_id: form.resource_id || null,
      group_id: form.group_id || null,
      access_level: form.access_level,
      begin_date: form.begin_date,
      end_date: form.end_date || null,
      justification: form.justification || null,
    };
    try {
      await apiFetch("/admin/resource-access", { method: "POST", body: JSON.stringify(payload) });
      setDialogOpen(false);
      setSnackbar({ open: true, message: "Access granted", severity: "success" });
      load();
    } catch {
      setSnackbar({ open: true, message: "Failed to grant access", severity: "error" });
    }
  };

  const handleRevoke = async (grantId: string) => {
    const reason = prompt("Reason for revoking access:");
    if (reason === null) return;
    try {
      await apiFetch(`/admin/resource-access/${grantId}/revoke`, {
        method: "PUT",
        body: JSON.stringify({ reason: reason || null }),
      });
      setSnackbar({ open: true, message: "Access revoked", severity: "success" });
      load();
    } catch {
      setSnackbar({ open: true, message: "Failed to revoke", severity: "error" });
    }
  };

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 3 }}>
        <Typography variant="h4">Resource Access</Typography>
        <Box sx={{ display: "flex", gap: 2, alignItems: "center" }}>
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel>Filter by User</InputLabel>
            <Select label="Filter by User" value={filterUser} onChange={(e) => setFilterUser(e.target.value)}>
              <MenuItem value="">All Users</MenuItem>
              {users.map((u) => <MenuItem key={u.id} value={u.id}>{u.display_name}</MenuItem>)}
            </Select>
          </FormControl>
          <Button variant="contained" startIcon={<Add />} onClick={() => { setForm(emptyForm); setDialogOpen(true); }}>
            Grant Access
          </Button>
          <Tooltip title="Refresh"><IconButton onClick={load}><Refresh /></IconButton></Tooltip>
        </Box>
      </Box>

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", mt: 4 }}><CircularProgress /></Box>
      ) : grants.length === 0 ? (
        <Alert severity="info">No access grants found.</Alert>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>User</TableCell>
                <TableCell>Resource / Group</TableCell>
                <TableCell>Level</TableCell>
                <TableCell>Dates</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {grants.map((g) => (
                <TableRow key={g.id} hover sx={g.revoked_at ? { opacity: 0.5 } : {}}>
                  <TableCell>{userName(g.user_id)}</TableCell>
                  <TableCell>
                    {g.resource_id && <Chip label={resourceName(g.resource_id)} size="small" />}
                    {g.group_id && <Chip label={`Group: ${groupName(g.group_id)}`} size="small" color="secondary" />}
                  </TableCell>
                  <TableCell><Chip label={g.access_level} size="small" /></TableCell>
                  <TableCell>
                    {g.begin_date}
                    {g.end_date ? ` — ${g.end_date}` : " — ongoing"}
                  </TableCell>
                  <TableCell>
                    {g.revoked_at ? (
                      <Chip label="Revoked" size="small" color="error" />
                    ) : (
                      <Chip label="Active" size="small" color="success" />
                    )}
                  </TableCell>
                  <TableCell align="right">
                    {!g.revoked_at && (
                      <Tooltip title="Revoke">
                        <IconButton size="small" color="error" onClick={() => handleRevoke(g.id)}>
                          <Block />
                        </IconButton>
                      </Tooltip>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Grant Resource Access</DialogTitle>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
          <FormControl fullWidth>
            <InputLabel>User</InputLabel>
            <Select label="User" value={form.user_id} onChange={(e) => setForm({ ...form, user_id: e.target.value })}>
              {users.map((u) => <MenuItem key={u.id} value={u.id}>{u.display_name} ({u.email})</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl fullWidth>
            <InputLabel>Resource (optional)</InputLabel>
            <Select label="Resource (optional)" value={form.resource_id} onChange={(e) => setForm({ ...form, resource_id: e.target.value })}>
              <MenuItem value="">None</MenuItem>
              {resources.map((r) => <MenuItem key={r.id} value={r.id}>{r.title}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl fullWidth>
            <InputLabel>Group (optional)</InputLabel>
            <Select label="Group (optional)" value={form.group_id} onChange={(e) => setForm({ ...form, group_id: e.target.value })}>
              <MenuItem value="">None</MenuItem>
              {groups.map((g) => <MenuItem key={g.id} value={g.id}>{g.name}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl fullWidth>
            <InputLabel>Access Level</InputLabel>
            <Select label="Access Level" value={form.access_level} onChange={(e) => setForm({ ...form, access_level: e.target.value })}>
              <MenuItem value="view">View</MenuItem>
              <MenuItem value="interact">Interact</MenuItem>
              <MenuItem value="full">Full</MenuItem>
            </Select>
          </FormControl>
          <Box sx={{ display: "flex", gap: 2 }}>
            <TextField label="Begin Date" type="date" value={form.begin_date} onChange={(e) => setForm({ ...form, begin_date: e.target.value })} fullWidth InputLabelProps={{ shrink: true }} />
            <TextField label="End Date" type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} fullWidth InputLabelProps={{ shrink: true }} />
          </Box>
          <TextField label="Justification" value={form.justification} onChange={(e) => setForm({ ...form, justification: e.target.value })} fullWidth multiline rows={2} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleGrant} disabled={!form.user_id || (!form.resource_id && !form.group_id)}>Grant</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar((s) => ({ ...s, open: false }))}>
        <Alert severity={snackbar.severity} onClose={() => setSnackbar((s) => ({ ...s, open: false }))}>{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
}
