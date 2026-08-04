import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Chip,
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
  Tooltip,
  Typography,
  CircularProgress,
} from "@mui/material";
import {
  CheckCircle,
  Cancel,
  Block,
  HourglassEmpty,
  Refresh,
  AdminPanelSettings,
  Person,
  Store,
} from "@mui/icons-material";
import { apiFetch } from "../lib/api";

interface UserProfile {
  id: string;
  firebase_uid: string;
  email: string;
  display_name: string;
  first_name: string | null;
  last_name: string | null;
  role: string;
  account_status: string;
  created_at: string;
}

const STATUS_COLORS: Record<string, "warning" | "success" | "error" | "default"> = {
  pending: "warning",
  approved: "success",
  rejected: "error",
  suspended: "default",
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  pending: <HourglassEmpty fontSize="small" />,
  approved: <CheckCircle fontSize="small" />,
  rejected: <Cancel fontSize="small" />,
  suspended: <Block fontSize="small" />,
};

const ROLE_COLORS: Record<string, "default" | "primary" | "secondary" | "info"> = {
  user: "default",
  provider: "secondary",
  admin: "info",
};

const ROLE_ICONS: Record<string, React.ReactNode> = {
  user: <Person fontSize="small" />,
  provider: <Store fontSize="small" />,
  admin: <AdminPanelSettings fontSize="small" />,
};

export default function Users() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [snackbar, setSnackbar] = useState({ open: false, message: "", severity: "success" as "success" | "error" });

  const loadUsers = async () => {
    setLoading(true);
    try {
      const params = filterStatus ? `?status=${filterStatus}` : "";
      const data = await apiFetch(`/admin/users${params}`);
      setUsers(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load users";
      setSnackbar({ open: true, message, severity: "error" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, [filterStatus]);

  const setStatus = async (userId: string, status: string) => {
    try {
      await apiFetch(`/admin/users/${userId}/status?status=${status}`, {
        method: "PUT",
      });
      setUsers((prev) =>
        prev.map((u) =>
          u.id === userId ? { ...u, account_status: status } : u
        )
      );
      setSnackbar({ open: true, message: `User status updated to ${status}`, severity: "success" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update status";
      setSnackbar({ open: true, message, severity: "error" });
    }
  };

  const setRole = async (userId: string, role: string) => {
    try {
      await apiFetch(`/admin/users/${userId}/role?role=${role}`, {
        method: "PUT",
      });
      setUsers((prev) =>
        prev.map((u) =>
          u.id === userId ? { ...u, role } : u
        )
      );
      setSnackbar({ open: true, message: `User role updated to ${role}`, severity: "success" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update role";
      setSnackbar({ open: true, message, severity: "error" });
    }
  };

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 3 }}>
        <Typography variant="h4">User Management</Typography>
        <Box sx={{ display: "flex", gap: 2, alignItems: "center" }}>
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>Filter Status</InputLabel>
            <Select
              label="Filter Status"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <MenuItem value="">All</MenuItem>
              <MenuItem value="pending">Pending</MenuItem>
              <MenuItem value="approved">Approved</MenuItem>
              <MenuItem value="rejected">Rejected</MenuItem>
              <MenuItem value="suspended">Suspended</MenuItem>
            </Select>
          </FormControl>
          <Tooltip title="Refresh">
            <IconButton onClick={loadUsers}>
              <Refresh />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", mt: 4 }}>
          <CircularProgress />
        </Box>
      ) : users.length === 0 ? (
        <Alert severity="info">No users found.</Alert>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Email</TableCell>
                <TableCell>Role</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Created</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id} hover>
                  <TableCell>
                    <Typography variant="body2" fontWeight={500}>
                      {user.display_name}
                    </Typography>
                    {user.first_name && (
                      <Typography variant="caption" color="text.secondary">
                        {user.first_name} {user.last_name}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>
                    <FormControl size="small" variant="standard" sx={{ minWidth: 100 }}>
                      <Select
                        value={user.role || "user"}
                        onChange={(e) => setRole(user.id!, e.target.value)}
                        renderValue={(value) => (
                          <Chip
                            icon={ROLE_ICONS[value] as React.ReactElement}
                            label={value}
                            color={ROLE_COLORS[value] || "default"}
                            size="small"
                          />
                        )}
                      >
                        <MenuItem value="user">
                          <Person fontSize="small" sx={{ mr: 1 }} /> User
                        </MenuItem>
                        <MenuItem value="provider">
                          <Store fontSize="small" sx={{ mr: 1 }} /> Provider
                        </MenuItem>
                        <MenuItem value="admin">
                          <AdminPanelSettings fontSize="small" sx={{ mr: 1 }} /> Admin
                        </MenuItem>
                      </Select>
                    </FormControl>
                  </TableCell>
                  <TableCell>
                    <Chip
                      icon={STATUS_ICONS[user.account_status] as React.ReactElement}
                      label={user.account_status}
                      color={STATUS_COLORS[user.account_status] || "default"}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>
                    {new Date(user.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell align="right">
                    {user.account_status !== "approved" && (
                      <Tooltip title="Approve">
                        <IconButton
                          color="success"
                          size="small"
                          onClick={() => setStatus(user.id!, "approved")}
                        >
                          <CheckCircle />
                        </IconButton>
                      </Tooltip>
                    )}
                    {user.account_status !== "rejected" && (
                      <Tooltip title="Reject">
                        <IconButton
                          color="error"
                          size="small"
                          onClick={() => setStatus(user.id!, "rejected")}
                        >
                          <Cancel />
                        </IconButton>
                      </Tooltip>
                    )}
                    {user.account_status !== "suspended" && (
                      <Tooltip title="Suspend">
                        <IconButton
                          size="small"
                          onClick={() => setStatus(user.id!, "suspended")}
                        >
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

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar((s) => ({ ...s, open: false }))}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
