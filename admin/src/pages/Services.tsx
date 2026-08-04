import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Collapse,
  IconButton,
  Snackbar,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  PlayArrow,
  Stop,
  RestartAlt,
  Refresh,
  OpenInNew,
  Science,
  CheckCircle,
  Cancel,
  Circle,
} from "@mui/icons-material";
import { apiFetch } from "../lib/api";

interface ServiceInfo {
  key: string;
  name: string;
  port: number;
  url: string;
  version: string;
  pid: number | null;
  started_at: string | null;
  healthy: boolean;
  running: boolean;
}

interface TestResult {
  name: string;
  passed: boolean;
  detail: string;
}

interface TestResults {
  service: string;
  tests: TestResult[];
  all_passed: boolean;
}

export default function Services() {
  const [services, setServices] = useState<ServiceInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const [testResults, setTestResults] = useState<Record<string, TestResults>>({});
  const [testOpen, setTestOpen] = useState<Record<string, boolean>>({});
  const [snackbar, setSnackbar] = useState({ open: false, message: "", severity: "success" as "success" | "error" });

  const load = async () => {
    setLoading(true);
    try {
      const data = await apiFetch("/admin/services");
      setServices(data);
    } catch {
      setSnackbar({ open: true, message: "Failed to load services", severity: "error" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleAction = async (key: string, action: "start" | "stop" | "restart") => {
    setActionLoading((prev) => ({ ...prev, [key]: true }));
    try {
      await apiFetch(`/admin/services/${key}/${action}`, { method: "POST" });
      setSnackbar({ open: true, message: `Service ${key} ${action}ed`, severity: "success" });
      // Refresh after a short delay to let service come up/down
      setTimeout(load, 2000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Action failed";
      setSnackbar({ open: true, message: msg, severity: "error" });
    } finally {
      setActionLoading((prev) => ({ ...prev, [key]: false }));
    }
  };

  const handleTest = async (key: string) => {
    setActionLoading((prev) => ({ ...prev, [`test-${key}`]: true }));
    setTestOpen((prev) => ({ ...prev, [key]: true }));
    try {
      const results = await apiFetch(`/admin/services/${key}/test`, { method: "POST" });
      setTestResults((prev) => ({ ...prev, [key]: results }));
    } catch {
      setSnackbar({ open: true, message: "Failed to run tests", severity: "error" });
    } finally {
      setActionLoading((prev) => ({ ...prev, [`test-${key}`]: false }));
    }
  };

  const statusColor = (svc: ServiceInfo): "success" | "error" | "warning" => {
    if (!svc.running) return "error";
    if (svc.healthy) return "success";
    return "warning";
  };

  const statusLabel = (svc: ServiceInfo): string => {
    if (!svc.running) return "Stopped";
    if (svc.healthy) return "Healthy";
    return "Unhealthy";
  };

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 3 }}>
        <Typography variant="h4">Services</Typography>
        <Tooltip title="Refresh"><IconButton onClick={load}><Refresh /></IconButton></Tooltip>
      </Box>

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", mt: 4 }}><CircularProgress /></Box>
      ) : services.length === 0 ? (
        <Alert severity="info">No services found.</Alert>
      ) : (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {services.map((svc) => (
            <Card key={svc.key} variant="outlined" sx={{ borderLeft: 4, borderLeftColor: `${statusColor(svc)}.main` }}>
              <CardContent>
                <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 2 }}>
                  {/* Left: identity & status */}
                  <Box sx={{ display: "flex", alignItems: "center", gap: 2, minWidth: 200 }}>
                    <Tooltip title={statusLabel(svc)}>
                      <Circle color={statusColor(svc)} sx={{ fontSize: 14 }} />
                    </Tooltip>
                    <Box>
                      <Typography variant="h6" sx={{ lineHeight: 1.2 }}>{svc.name}</Typography>
                      <Typography variant="caption" color="text.secondary">{svc.key}</Typography>
                    </Box>
                    <Chip label={`v${svc.version}`} size="small" variant="outlined" />
                  </Box>

                  {/* Right: action buttons */}
                  <Box sx={{ display: "flex", gap: 0.5 }}>
                    <Tooltip title="Start">
                      <span>
                        <IconButton
                          color="success"
                          disabled={svc.running || !!actionLoading[svc.key]}
                          onClick={() => handleAction(svc.key, "start")}
                          size="small"
                        >
                          <PlayArrow />
                        </IconButton>
                      </span>
                    </Tooltip>
                    <Tooltip title="Stop">
                      <span>
                        <IconButton
                          color="error"
                          disabled={!svc.running || !!actionLoading[svc.key]}
                          onClick={() => handleAction(svc.key, "stop")}
                          size="small"
                        >
                          <Stop />
                        </IconButton>
                      </span>
                    </Tooltip>
                    <Tooltip title="Restart">
                      <span>
                        <IconButton
                          color="primary"
                          disabled={!!actionLoading[svc.key]}
                          onClick={() => handleAction(svc.key, "restart")}
                          size="small"
                        >
                          {actionLoading[svc.key] ? <CircularProgress size={20} /> : <RestartAlt />}
                        </IconButton>
                      </span>
                    </Tooltip>
                    <Tooltip title="Run Tests">
                      <span>
                        <IconButton
                          color="secondary"
                          disabled={!!actionLoading[`test-${svc.key}`]}
                          onClick={() => handleTest(svc.key)}
                          size="small"
                        >
                          {actionLoading[`test-${svc.key}`] ? <CircularProgress size={20} /> : <Science />}
                        </IconButton>
                      </span>
                    </Tooltip>
                  </Box>
                </Box>

                {/* Details row */}
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 3, mt: 2 }}>
                  <DetailItem label="Port" value={String(svc.port)} />
                  <DetailItem label="PID" value={svc.pid ? String(svc.pid) : "--"} />
                  <DetailItem label="Started" value={svc.started_at || "--"} />
                  <Box>
                    <Typography variant="caption" color="text.secondary">URL</Typography>
                    <Typography
                      component="a"
                      href={svc.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      variant="body2"
                      sx={{ fontFamily: "monospace", fontSize: "0.8rem", color: "primary.main", textDecoration: "none", display: "flex", alignItems: "center", gap: 0.5, "&:hover": { textDecoration: "underline" } }}
                    >
                      {svc.url} <OpenInNew sx={{ fontSize: 14 }} />
                    </Typography>
                  </Box>
                </Box>

                {/* Test results */}
                <Collapse in={!!testOpen[svc.key] && !!testResults[svc.key]}>
                  <Box sx={{ mt: 2, p: 1.5, bgcolor: "grey.50", borderRadius: 1 }}>
                    <Typography variant="subtitle2" sx={{ mb: 1 }}>
                      Test Results
                      {testResults[svc.key] && (
                        testResults[svc.key].all_passed
                          ? <Chip label="PASS" color="success" size="small" sx={{ ml: 1 }} />
                          : <Chip label="FAIL" color="error" size="small" sx={{ ml: 1 }} />
                      )}
                    </Typography>
                    {testResults[svc.key]?.tests.map((t, i) => (
                      <Box key={i} sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
                        {t.passed ? <CheckCircle color="success" sx={{ fontSize: 16 }} /> : <Cancel color="error" sx={{ fontSize: 16 }} />}
                        <Typography variant="body2" fontWeight={500}>{t.name}</Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ fontFamily: "monospace", fontSize: "0.75rem" }}>
                          {t.detail}
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                </Collapse>
              </CardContent>
            </Card>
          ))}
        </Box>
      )}

      <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar((s) => ({ ...s, open: false }))}>
        <Alert severity={snackbar.severity} onClose={() => setSnackbar((s) => ({ ...s, open: false }))}>{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="body2" sx={{ fontFamily: "monospace", fontSize: "0.8rem" }}>{value}</Typography>
    </Box>
  );
}
