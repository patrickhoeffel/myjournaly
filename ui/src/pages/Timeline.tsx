import { useEffect, useRef, useState, useCallback } from "react";
import { onDataUpdated } from "../lib/eventBus";
import { resolveWindow, type ZoomPreset } from "../lib/timelineZoom";
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
  Popover,
  Select,
  Slider,
  Snackbar,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { Add, AddPhotoAlternate, Close, Map as MapIcon, PhotoLibrary, PushPin, PushPinOutlined, Refresh } from "@mui/icons-material";
import { apiFetch } from "../lib/api";
import EventDialog, { emptyEventForm, type EventFormData } from "../components/EventDialog";
import TimelineMap from "../components/TimelineMap";
import PhotoDropzone from "../components/PhotoDropzone";
import PhotoLightbox from "../components/PhotoLightbox";
import TimelineViz, {
  type TimelineType,
  type UserTimelineLine,
  type TimelineEvent,
  type TimelineSeason,
  type TimelinePhoto,
  type TimelineVizHandle,
} from "../components/TimelineViz";

type DialogMode = "line" | "event" | "edit-line" | "edit-event" | null;

const emptyLineForm = { timeline_type_id: "", label: "", color: "#1976d2", start_date: "", end_date: "" };

export default function Timeline() {
  const [types, setTypes] = useState<TimelineType[]>([]);
  const [lines, setLines] = useState<UserTimelineLine[]>([]);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [seasons, setSeasons] = useState<TimelineSeason[]>([]);
  const [loading, setLoading] = useState(true);
  const [birthDate, setBirthDate] = useState("1990-01-01");

  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [lineForm, setLineForm] = useState(emptyLineForm);
  const [eventForm, setEventForm] = useState<EventFormData>(emptyEventForm);
  const [editLineId, setEditLineId] = useState<string | null>(null);
  const [editEventId, setEditEventId] = useState<string | null>(null);
  const [editEntityKind, setEditEntityKind] = useState<"event" | "season">("event");
  const [snackbar, setSnackbar] = useState({ open: false, message: "", severity: "success" as "success" | "error" });

  const [zoomPresets, setZoomPresets] = useState<ZoomPreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState("");
  const vizRef = useRef<TimelineVizHandle | null>(null);

  const [mapVisible, setMapVisible] = useState(false);
  const [mapHeightPct, setMapHeightPct] = useState(35);

  // Photos
  const [photos, setPhotos] = useState<TimelinePhoto[]>([]);
  const [showPhotos, setShowPhotos] = useState(true);
  const [photoDropzoneOpen, setPhotoDropzoneOpen] = useState(false);
  const [lightboxPhotos, setLightboxPhotos] = useState<TimelinePhoto[] | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  const loadPhotos = useCallback(async () => {
    try {
      const data = await apiFetch("/photos");
      setPhotos(
        (data as Array<Record<string, unknown>>).map((p) => ({
          id: p.id as string,
          url: p.url as string,
          thumbnail_url: (p.thumbnail_url as string | null) ?? null,
          taken_at: (p.taken_at as string) || (p.created_at as string),
          caption: (p.caption as string | null) ?? null,
          gps_lat: (p.gps_lat as number | null) ?? null,
          gps_lng: (p.gps_lng as number | null) ?? null,
        })),
      );
    } catch {
      // silent
    }
  }, []);

  useEffect(() => { loadPhotos(); }, [loadPhotos]);

  const zoomToToday = useCallback(() => {
    const start = new Date();
    start.setHours(6, 0, 0, 0);
    const end = new Date();
    end.setHours(21, 0, 0, 0);
    vizRef.current?.zoomTo(start, end);
  }, []);

  interface EventSummary {
    id: string;
    title: string;
    description: string | null;
    category: string;
    began_at: string;
    ended_at: string | null;
    kind: "moment" | "span" | "ongoing" | null;
    location: string | null;
    location_places: {
      place_id: string;
      name: string;
      formatted_address: string;
      lat: number;
      lng: number;
    }[];
  }
  type TooltipState =
    | { kind: "event"; pos: { x: number; y: number }; eventId: string; loading: boolean; data: EventSummary | null }
    | { kind: "season"; pos: { x: number; y: number }; season: TimelineSeason };
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [tooltipPinned, setTooltipPinned] = useState(false);

  const handleEventClick = useCallback(async (ev: TimelineEvent, clientX: number, clientY: number) => {
    setTooltipPinned(false);
    setTooltip({ kind: "event", pos: { x: clientX, y: clientY }, eventId: ev.id, loading: true, data: null });
    try {
      const full = await apiFetch(`/events/${ev.id}`);
      setTooltip((prev) =>
        prev && prev.kind === "event" && prev.eventId === ev.id ? { ...prev, loading: false, data: full } : prev,
      );
    } catch {
      setTooltip(null);
    }
  }, []);

  const handleSeasonClick = useCallback((season: TimelineSeason, clientX: number, clientY: number) => {
    setTooltipPinned(false);
    setTooltip({ kind: "season", pos: { x: clientX, y: clientY }, season });
  }, []);

  const closeTooltip = () => {
    setTooltip(null);
    setTooltipPinned(false);
  };

  const summaryKind = (d: EventSummary): "moment" | "span" | "ongoing" => {
    if (d.kind) return d.kind;
    if (d.ended_at && d.ended_at.slice(0, 10) !== d.began_at.slice(0, 10)) return "span";
    return "moment";
  };

  const formatTooltipDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString();
    } catch {
      return iso;
    }
  };

  const tooltipColor = (() => {
    if (!tooltip) return null;
    const timelineId = tooltip.kind === "event"
      ? events.find((e) => e.id === tooltip.eventId)?.user_timeline_id
      : tooltip.season.user_timeline_id;
    if (!timelineId) return null;
    return lines.find((l) => l.id === timelineId)?.color ?? null;
  })();

  const notify = (message: string, severity: "success" | "error" = "success") =>
    setSnackbar({ open: true, message, severity });

  const refresh = useCallback(async () => {
    try {
      const data = await apiFetch("/timeline/full");
      setTypes(data.types);
      setLines(data.lines);
      setEvents(data.events);
      setSeasons(data.seasons);

      // Load birth date from user profile
      try {
        const profile = await apiFetch("/users/me");
        if (profile?.date_of_birth) setBirthDate(profile.date_of_birth);
      } catch {
        // profile not set yet, keep default
      }
    } catch {
      notify("Failed to load timeline data", "error");
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    await refresh();
    setLoading(false);
  }, [refresh]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    apiFetch("/timeline-zoom-presets")
      .then((data: ZoomPreset[]) => setZoomPresets(data))
      .catch(() => {});
  }, []);

  const applyZoomPreset = useCallback((presetId: string) => {
    setSelectedPresetId(presetId);
    const preset = zoomPresets.find((p) => p.id === presetId);
    if (!preset) return;
    const birth = new Date(birthDate + "T00:00:00");
    const eventDates = events
      .map((e) => (e.event_date ? new Date(e.event_date) : null))
      .filter((d): d is Date => d !== null && !isNaN(d.getTime()));
    const earliestEvent = eventDates.length ? new Date(Math.min(...eventDates.map((d) => d.getTime()))) : null;
    const latestEvent = eventDates.length ? new Date(Math.max(...eventDates.map((d) => d.getTime()))) : null;
    const { start, end } = resolveWindow(preset, { birthDate: birth, earliestEvent, latestEvent });
    vizRef.current?.zoomTo(start, end);
  }, [zoomPresets, birthDate, events]);

  // Auto-refresh when chat agent modifies data (no spinner)
  useEffect(() => {
    const unsub = onDataUpdated(() => refresh());
    return () => { unsub(); };
  }, [refresh]);

  // ── Line visibility toggles (optimistic update + persist) ──

  const handleToggleVisible = useCallback(
    async (lineId: string, visible: boolean) => {
      setLines((prev) => prev.map((l) => (l.id === lineId ? { ...l, visible } : l)));
      const line = lines.find((l) => l.id === lineId);
      if (line) {
        try {
          await apiFetch(`/timeline/lines/${lineId}`, {
            method: "PUT",
            body: JSON.stringify({ ...line, visible }),
          });
        } catch {
          // revert on failure
          setLines((prev) => prev.map((l) => (l.id === lineId ? { ...l, visible: !visible } : l)));
        }
      }
    },
    [lines],
  );

  const handleToggleEventsVisible = useCallback(
    async (lineId: string, events_visible: boolean) => {
      setLines((prev) => prev.map((l) => (l.id === lineId ? { ...l, events_visible } : l)));
      const line = lines.find((l) => l.id === lineId);
      if (line) {
        try {
          await apiFetch(`/timeline/lines/${lineId}`, {
            method: "PUT",
            body: JSON.stringify({ ...line, events_visible }),
          });
        } catch {
          setLines((prev) =>
            prev.map((l) => (l.id === lineId ? { ...l, events_visible: !events_visible } : l)),
          );
        }
      }
    },
    [lines],
  );

  // ── Create handlers ──

  const handleCreateLine = async () => {
    try {
      await apiFetch("/timeline/lines", {
        method: "POST",
        body: JSON.stringify({
          ...lineForm,
          start_date: lineForm.start_date || null,
          end_date: lineForm.end_date || null,
          visible: true,
          events_visible: true,
          order: lines.length,
        }),
      });
      setDialogMode(null);
      notify("Timeline added");
      load();
    } catch {
      notify("Failed to create timeline", "error");
    }
  };

  const buildEventPayload = (f: EventFormData) => {
    const began_at = f.time ? `${f.date}T${f.time}` : f.date;
    let ended_at: string | null = null;
    if (f.kind === "span" && f.endDate) ended_at = f.endDate;
    // ongoing: ended_at stays null
    // moment: ended_at = began_at
    if (f.kind === "moment") ended_at = began_at;
    return {
      user_timeline_id: f.timelineId || undefined,
      title: f.title,
      description: f.description || null,
      category: f.category,
      location: f.location || null,
      location_places: f.locationPlaces,
      began_at: began_at,
      ended_at: ended_at,
      kind: f.kind,
    };
  };

  const handleCreateEvent = async () => {
    try {
      await apiFetch("/timeline/events", {
        method: "POST",
        body: JSON.stringify(buildEventPayload(eventForm)),
      });
      setDialogMode(null);
      notify("Event added");
      load();
    } catch {
      notify("Failed to create event", "error");
    }
  };

  // ── Edit handlers ──

  const openEditLine = useCallback((line: UserTimelineLine) => {
    setEditLineId(line.id);
    setLineForm({
      timeline_type_id: line.timeline_type_id,
      label: line.label,
      color: line.color,
      start_date: line.start_date || "",
      end_date: line.end_date || "",
    });
    setDialogMode("edit-line");
  }, []);

  const handleUpdateLine = async () => {
    if (!editLineId) return;
    const line = lines.find((l) => l.id === editLineId);
    if (!line) return;
    try {
      await apiFetch(`/timeline/lines/${editLineId}`, {
        method: "PUT",
        body: JSON.stringify({
          ...line,
          ...lineForm,
          start_date: lineForm.start_date || null,
          end_date: lineForm.end_date || null,
        }),
      });
      setDialogMode(null);
      notify("Timeline updated");
      refresh();
    } catch {
      notify("Failed to update timeline", "error");
    }
  };

  const openEditEvent = useCallback(async (ev: TimelineEvent) => {
    setEditEventId(ev.id);
    setEditEntityKind("event");
    // Fetch full event to get ended_at, description, category, location
    try {
      const full = await apiFetch(`/events/${ev.id}`);
      const date = full.began_at?.slice(0, 10) || "";
      const time = full.began_at?.length > 10 ? full.began_at.slice(11, 16) : "";
      const endDate = full.ended_at?.slice(0, 10) || "";

      let kind: EventFormData["kind"];
      if (full.kind === "moment" || full.kind === "span" || full.kind === "ongoing") {
        kind = full.kind;
      } else if (full.ended_at && endDate > date) {
        kind = "span";
      } else {
        // Legacy data without kind: default to moment (matches Events page heuristic).
        kind = "moment";
      }

      setEventForm({
        ...emptyEventForm,
        timelineId: ev.user_timeline_id,
        title: full.title,
        description: full.description || "",
        category: full.category || "personal",
        location: full.location || "",
        locationPlaces: full.location_places || [],
        date,
        time,
        endDate: kind === "span" ? endDate : "",
        kind,
      });
    } catch {
      // Fallback to viz data if fetch fails
      const date = ev.event_date?.slice(0, 10) || "";
      const time = ev.event_date?.length > 10 ? ev.event_date.slice(11, 16) : "";
      setEventForm({
        ...emptyEventForm,
        timelineId: ev.user_timeline_id,
        title: ev.title,
        date,
        time,
        kind: "moment",
      });
    }
    setDialogMode("edit-event");
  }, []);

  const openEditSeason = useCallback((s: TimelineSeason) => {
    setEditEventId(s.id);
    setEditEntityKind("season");
    setEventForm({
      ...emptyEventForm,
      timelineId: s.user_timeline_id,
      title: s.title,
      description: s.description || "",
      date: s.start_date,
      endDate: s.end_date || "",
      kind: s.end_date ? "span" : "ongoing",
      locationPlaces: s.location_places || [],
    });
    setDialogMode("edit-event");
  }, []);

  const handleUpdateEvent = async () => {
    if (!editEventId) return;
    try {
      await apiFetch(`/timeline/events/${editEventId}`, {
        method: "PUT",
        body: JSON.stringify(buildEventPayload(eventForm)),
      });
      setDialogMode(null);
      notify("Event updated");
      refresh();
    } catch {
      notify("Failed to update event", "error");
    }
  };

  const handleUpdateSeason = async () => {
    if (!editEventId) return;
    try {
      await apiFetch(`/timeline/seasons/${editEventId}`, {
        method: "PUT",
        body: JSON.stringify({
          user_timeline_id: eventForm.timelineId,
          title: eventForm.title,
          description: eventForm.description || null,
          start_date: eventForm.date,
          end_date: eventForm.kind === "ongoing" ? null : (eventForm.endDate || null),
          location_places: eventForm.locationPlaces,
        }),
      });
      setDialogMode(null);
      notify("Season updated");
      refresh();
    } catch {
      notify("Failed to update season", "error");
    }
  };

  const handleEditSave = () => {
    if (editEntityKind === "season") return handleUpdateSeason();
    return handleUpdateEvent();
  };

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", height: "80vh" }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "calc(100vh - 80px)" }}>
      {/* Toolbar */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, px: 2, py: 1, borderBottom: "1px solid #e0e0e0" }}>
        <Typography variant="h6" sx={{ mr: 2 }}>My Timeline</Typography>
        <Button
          size="small"
          variant="outlined"
          startIcon={<Add />}
          onClick={() => {
            setLineForm(emptyLineForm);
            setDialogMode("line");
          }}
        >
          Add Line
        </Button>
        <Button
          size="small"
          variant="outlined"
          startIcon={<Add />}
          onClick={() => {
            setEventForm({ ...emptyEventForm, date: new Date().toISOString().split("T")[0] });
            setEditEventId(null);
            setDialogMode("event");
          }}
          disabled={lines.length === 0}
        >
          Add Event
        </Button>
        <Box sx={{ flexGrow: 1 }} />
        {zoomPresets.length > 0 && (
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>Zoom To</InputLabel>
            <Select
              label="Zoom To"
              value={selectedPresetId}
              onChange={(e) => applyZoomPreset(e.target.value)}
            >
              {zoomPresets.map((p) => (
                <MenuItem key={p.id} value={p.id}>{p.label}</MenuItem>
              ))}
            </Select>
          </FormControl>
        )}
        <Tooltip title="Zoom to today (daytime)">
          <Button size="small" variant="outlined" onClick={zoomToToday} sx={{ textTransform: "none" }}>
            Today
          </Button>
        </Tooltip>
        <Tooltip title="Upload photos">
          <IconButton size="small" onClick={() => setPhotoDropzoneOpen(true)}>
            <AddPhotoAlternate />
          </IconButton>
        </Tooltip>
        <Tooltip title={showPhotos ? "Hide photos band" : "Show photos band"}>
          <span>
            <IconButton
              size="small"
              onClick={() => setShowPhotos((v) => !v)}
              color={showPhotos ? "primary" : "default"}
              disabled={photos.length === 0}
            >
              <PhotoLibrary fontSize="small" sx={{ opacity: showPhotos ? 1 : 0.5 }} />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title={mapVisible ? "Hide map" : "Show map"}>
          <IconButton
            size="small"
            onClick={() => setMapVisible((v) => !v)}
            color={mapVisible ? "primary" : "default"}
          >
            <MapIcon />
          </IconButton>
        </Tooltip>
        {mapVisible && (
          <Box sx={{ width: 140, display: "flex", alignItems: "center", gap: 1 }}>
            <Typography variant="caption" color="text.secondary">Map</Typography>
            <Slider
              size="small"
              min={15}
              max={70}
              value={mapHeightPct}
              onChange={(_e, v) => setMapHeightPct(Array.isArray(v) ? v[0] : v)}
              aria-label="Map height"
            />
          </Box>
        )}
        <Tooltip title="Refresh">
          <IconButton size="small" onClick={load}><Refresh /></IconButton>
        </Tooltip>
      </Box>

      {/* Visualization area: timeline left, optional inline map right */}
      <Box sx={{ flexGrow: 1, display: "flex", flexDirection: "row", minHeight: 0, minWidth: 0 }}>
        <Box
          sx={{
            flexBasis: mapVisible ? `${100 - mapHeightPct}%` : "100%",
            flexGrow: mapVisible ? 0 : 1,
            position: "relative",
            overflow: "hidden",
            minWidth: 240,
          }}
        >
          {lines.length === 0 ? (
            <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100%" }}>
              <Typography color="text.secondary">
                Add a timeline to get started. Choose a type configured by your admin, give it a label, and start adding events and seasons.
              </Typography>
            </Box>
          ) : (
            <TimelineViz
              ref={vizRef}
              lines={lines}
              events={events}
              seasons={seasons}
              photos={photos}
              showPhotos={showPhotos}
              birthDate={birthDate}
              onToggleVisible={handleToggleVisible}
              onToggleEventsVisible={handleToggleEventsVisible}
              onEditEvent={openEditEvent}
              onEditSeason={openEditSeason}
              onEditLine={openEditLine}
              onClickEvent={handleEventClick}
              onClickSeason={handleSeasonClick}
              onClickPhoto={(p) => { setLightboxPhotos([p]); setLightboxIndex(0); }}
              onClickPhotoCluster={(ps) => { setLightboxPhotos(ps); setLightboxIndex(0); }}
              selectedEventId={tooltip?.kind === "event" ? tooltip.eventId : null}
              selectedSeasonId={tooltip?.kind === "season" ? tooltip.season.id : null}
            />
          )}
        </Box>
        {mapVisible && (
          <Box
            sx={{
              flexBasis: `${mapHeightPct}%`,
              flexGrow: 0,
              flexShrink: 0,
              borderLeft: 1,
              borderColor: "divider",
              minWidth: 240,
            }}
          >
            <TimelineMap
              events={events}
              seasons={seasons}
              lines={lines}
              onSelectEvent={(id) => {
                const ev = events.find((e) => e.id === id);
                if (ev) openEditEvent(ev);
              }}
              onSelectSeason={(id) => {
                const s = seasons.find((s) => s.id === id);
                if (s) openEditSeason(s);
              }}
            />
          </Box>
        )}
      </Box>

      {/* ── Add Line Dialog ── */}
      <Dialog open={dialogMode === "line"} onClose={() => setDialogMode(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Add Timeline</DialogTitle>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <FormControl fullWidth sx={{ mt: 1 }}>
            <InputLabel>Type</InputLabel>
            <Select
              label="Type"
              value={lineForm.timeline_type_id}
              onChange={(e) => {
                const t = types.find((t) => t.id === e.target.value);
                setLineForm({
                  ...lineForm,
                  timeline_type_id: e.target.value,
                  label: lineForm.label || t?.name || "",
                  color: t?.color || lineForm.color,
                });
              }}
            >
              {types.map((t) => (
                <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            label="Label"
            value={lineForm.label}
            onChange={(e) => setLineForm({ ...lineForm, label: e.target.value })}
            fullWidth
          />
          <Box sx={{ display: "flex", gap: 2 }}>
            <TextField
              label="Start Date"
              type="date"
              value={lineForm.start_date}
              onChange={(e) => setLineForm({ ...lineForm, start_date: e.target.value })}
              fullWidth
              InputLabelProps={{ shrink: true }}
              helperText="Leave empty for birth"
            />
            <TextField
              label="End Date"
              type="date"
              value={lineForm.end_date}
              onChange={(e) => setLineForm({ ...lineForm, end_date: e.target.value })}
              fullWidth
              InputLabelProps={{ shrink: true }}
              helperText="Leave empty for ongoing"
            />
          </Box>
          <TextField
            label="Color"
            type="color"
            value={lineForm.color}
            onChange={(e) => setLineForm({ ...lineForm, color: e.target.value })}
            sx={{ width: 120 }}
            InputProps={{ sx: { height: 48 } }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogMode(null)}>Cancel</Button>
          <Button variant="contained" onClick={handleCreateLine} disabled={!lineForm.timeline_type_id || !lineForm.label}>
            Add
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Edit Line Dialog ── */}
      <Dialog open={dialogMode === "edit-line"} onClose={() => setDialogMode(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Edit Timeline</DialogTitle>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <TextField
            label="Label"
            value={lineForm.label}
            onChange={(e) => setLineForm({ ...lineForm, label: e.target.value })}
            fullWidth
            sx={{ mt: 1 }}
          />
          <Box sx={{ display: "flex", gap: 2 }}>
            <TextField
              label="Start Date"
              type="date"
              value={lineForm.start_date}
              onChange={(e) => setLineForm({ ...lineForm, start_date: e.target.value })}
              fullWidth
              InputLabelProps={{ shrink: true }}
              helperText="Leave empty for birth"
            />
            <TextField
              label="End Date"
              type="date"
              value={lineForm.end_date}
              onChange={(e) => setLineForm({ ...lineForm, end_date: e.target.value })}
              fullWidth
              InputLabelProps={{ shrink: true }}
              helperText="Leave empty for ongoing"
            />
          </Box>
          <TextField
            label="Color"
            type="color"
            value={lineForm.color}
            onChange={(e) => setLineForm({ ...lineForm, color: e.target.value })}
            sx={{ width: 120 }}
            InputProps={{ sx: { height: 48 } }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogMode(null)}>Cancel</Button>
          <Button variant="contained" onClick={handleUpdateLine} disabled={!lineForm.label}>
            Save
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Unified Event Dialog (add + edit) ── */}
      <EventDialog
        open={dialogMode === "event" || dialogMode === "edit-event"}
        mode={dialogMode === "edit-event" ? "edit" : "add"}
        entity={dialogMode === "edit-event" ? editEntityKind : "event"}
        form={eventForm}
        onChange={setEventForm}
        onSave={dialogMode === "edit-event" ? handleEditSave : handleCreateEvent}
        onClose={() => setDialogMode(null)}
        timelineLines={lines.map((l) => ({ id: l.id, label: l.label }))}
        editId={editEventId}
        showDetails={dialogMode === "edit-event"}
      />

      <Popover
        open={!!tooltip}
        onClose={() => { if (!tooltipPinned) closeTooltip(); }}
        disableEscapeKeyDown={tooltipPinned}
        hideBackdrop={tooltipPinned}
        anchorReference="anchorPosition"
        anchorPosition={tooltip ? { top: tooltip.pos.y + 8, left: tooltip.pos.x + 8 } : undefined}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        slotProps={{
          paper: {
            sx: {
              p: 1.5,
              maxWidth: 320,
              pointerEvents: "auto",
              bgcolor: "background.paper",
              border: tooltipColor ? `1.5px solid ${tooltipColor}` : undefined,
            },
          },
          root: tooltipPinned ? { sx: { pointerEvents: "none" } } : undefined,
        }}
      >
        {tooltip && (
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 0.5, mx: -0.5, mt: -0.5 }}>
            <IconButton
              size="small"
              onClick={() => setTooltipPinned((p) => !p)}
              title={tooltipPinned ? "Unpin" : "Pin"}
              sx={{ color: tooltipColor || undefined }}
            >
              {tooltipPinned ? <PushPin fontSize="small" /> : <PushPinOutlined fontSize="small" />}
            </IconButton>
            <IconButton
              size="small"
              onClick={closeTooltip}
              title="Close"
            >
              <Close fontSize="small" />
            </IconButton>
          </Box>
        )}
        {tooltip?.kind === "event" && tooltip.loading && (
          <Typography variant="body2" color="text.secondary">Loading…</Typography>
        )}
        {tooltip?.kind === "season" && (() => {
          const s = tooltip.season;
          const dateLine = s.end_date
            ? `${formatTooltipDate(s.start_date)} – ${formatTooltipDate(s.end_date)}`
            : `since ${formatTooltipDate(s.start_date)}`;
          const handleEditSeasonFromTooltip = () => {
            closeTooltip();
            openEditSeason(s);
          };
          return (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
              <Typography variant="subtitle2" fontWeight={700}>{s.title}</Typography>
              <Typography
                variant="body2"
                fontWeight={700}
                sx={{ color: tooltipColor || "text.primary" }}
              >
                {dateLine}
              </Typography>
              {s.location_places && s.location_places.length > 0 && (
                <Box sx={{ display: "flex", flexDirection: "column", gap: 0.25 }}>
                  {s.location_places.map((p) => (
                    <Typography key={p.place_id} variant="caption" color="text.secondary">
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.formatted_address)}&query_place_id=${p.place_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: "inherit" }}
                      >
                        {p.formatted_address}
                      </a>
                    </Typography>
                  ))}
                </Box>
              )}
              {s.description && (
                <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", mt: 0.5 }}>
                  {s.description.length > 240 ? `${s.description.slice(0, 240)}…` : s.description}
                </Typography>
              )}
              <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 0.5 }}>
                <Button size="small" variant="outlined" onClick={handleEditSeasonFromTooltip}>Edit</Button>
              </Box>
            </Box>
          );
        })()}
        {tooltip?.kind === "event" && tooltip.data && (() => {
          const d = tooltip.data;
          const kind = summaryKind(d);
          const dateLine = (() => {
            if (kind === "span" && d.ended_at) {
              return `${formatTooltipDate(d.began_at)} – ${formatTooltipDate(d.ended_at)}`;
            }
            if (kind === "ongoing") return `since ${formatTooltipDate(d.began_at)}`;
            return formatTooltipDate(d.began_at);
          })();
          const handleEditFromTooltip = () => {
            const ev = events.find((e) => e.id === d.id);
            closeTooltip();
            if (ev) openEditEvent(ev);
          };
          return (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
              <Typography variant="subtitle2" fontWeight={700}>{d.title}</Typography>
              <Typography
                variant="body2"
                fontWeight={700}
                sx={{ color: tooltipColor || "text.primary" }}
              >
                {dateLine}
              </Typography>
              <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                <Chip size="small" label={d.category} />
                <Chip size="small" variant="outlined" label={kind === "span" ? "While" : kind.charAt(0).toUpperCase() + kind.slice(1)} />
              </Box>
              {d.location_places && d.location_places.length > 0 ? (
                <Box sx={{ display: "flex", flexDirection: "column", gap: 0.25 }}>
                  {d.location_places.map((p) => (
                    <Typography key={p.place_id} variant="caption" color="text.secondary">
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.formatted_address)}&query_place_id=${p.place_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: "inherit" }}
                      >
                        {p.formatted_address}
                      </a>
                    </Typography>
                  ))}
                </Box>
              ) : d.location ? (
                <Typography variant="caption" color="text.secondary">{d.location}</Typography>
              ) : null}
              {d.description && (
                <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", mt: 0.5 }}>
                  {d.description.length > 240 ? `${d.description.slice(0, 240)}…` : d.description}
                </Typography>
              )}
              <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 0.5 }}>
                <Button size="small" variant="outlined" onClick={handleEditFromTooltip}>Edit</Button>
              </Box>
            </Box>
          );
        })()}
      </Popover>

      <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar((s) => ({ ...s, open: false }))}>
        <Alert severity={snackbar.severity} onClose={() => setSnackbar((s) => ({ ...s, open: false }))}>{snackbar.message}</Alert>
      </Snackbar>

      <PhotoDropzone
        open={photoDropzoneOpen}
        onClose={() => setPhotoDropzoneOpen(false)}
        onUploaded={(count) => {
          if (count > 0) {
            loadPhotos();
            notify(`${count} photo${count === 1 ? "" : "s"} uploaded`);
          }
        }}
      />

      {lightboxPhotos && (
        <PhotoLightbox
          photos={lightboxPhotos}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxPhotos(null)}
        />
      )}
    </Box>
  );
}
