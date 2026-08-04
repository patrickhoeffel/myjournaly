import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Box,
  CircularProgress,
  Divider,
  FormControl,
  IconButton,
  InputLabel,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Select,
  Typography,
  Snackbar,
  Alert,
} from "@mui/material";
import { Add, ArrowRightAlt, DateRange, FiberManualRecord, LinearScale } from "@mui/icons-material";
import type { SvgIconComponent } from "@mui/icons-material";
import { apiFetch } from "../lib/api";
import AssociationsPanel from "../components/AssociationsPanel";
import EventDialog, { emptyEventForm, type EventFormData } from "../components/EventDialog";
import EventEditor from "../components/EventEditor";
import EventJournal from "../components/EventJournal";
import SeasonEditor, { type EditableSeason } from "../components/SeasonEditor";

type EventKind = "moment" | "span" | "ongoing";

interface EventLocationPlace {
  provider: "google";
  place_id: string;
  name: string;
  formatted_address: string;
  lat: number;
  lng: number;
  types: string[];
}

interface Event {
  id: string;
  title: string;
  description: string | null;
  category: string;
  began_at: string;
  ended_at: string | null;
  kind: EventKind | null;
  location: string | null;
  location_places: EventLocationPlace[];
}

const getEventKind = (e: Event): EventKind => {
  if (e.kind) return e.kind;
  // Legacy data (no explicit kind stored). Derive from dates, defaulting to
  // "moment" since most events are point-in-time. Genuine ongoing events
  // will need to be re-saved to store the kind explicitly.
  if (e.ended_at && e.ended_at.slice(0, 10) !== e.began_at.slice(0, 10)) return "span";
  return "moment";
};

const KIND_META: Record<EventKind, { label: string; icon: SvgIconComponent }> = {
  moment: { label: "Moment", icon: FiberManualRecord },
  span: { label: "While", icon: LinearScale },
  ongoing: { label: "Ongoing", icon: ArrowRightAlt },
};

const CATEGORY_OPTIONS = [
  { value: "professional", label: "Professional" },
  { value: "relationship", label: "Relationship" },
  { value: "family", label: "Family" },
  { value: "educational", label: "Educational" },
  { value: "medical", label: "Medical" },
  { value: "spiritual", label: "Spiritual" },
  { value: "personal", label: "Personal" },
  { value: "financial", label: "Financial" },
  { value: "other", label: "Other" },
];

type SelectedKind = "event" | "season";

interface SelectedRef {
  kind: SelectedKind;
  id: string;
}

export default function Events() {
  const [events, setEvents] = useState<Event[]>([]);
  const [seasons, setSeasons] = useState<EditableSeason[]>([]);
  const [loading, setLoading] = useState(true);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [form, setForm] = useState<EventFormData>(emptyEventForm);
  const [searchParams] = useSearchParams();
  const initialEventParam = searchParams.get("event");
  const initialSeasonParam = searchParams.get("season");
  const [selectedRef, setSelectedRef] = useState<SelectedRef | null>(
    initialEventParam
      ? { kind: "event", id: initialEventParam }
      : initialSeasonParam
        ? { kind: "season", id: initialSeasonParam }
        : null,
  );
  const [categoryFilter, setCategoryFilter] = useState("");
  const [snackbar, setSnackbar] = useState({ open: false, message: "", severity: "success" as "success" | "error" });

  const notify = (message: string, severity: "success" | "error" = "success") =>
    setSnackbar({ open: true, message, severity });

  const loadEvents = useCallback(async () => {
    try {
      const url = categoryFilter ? `/events?category=${categoryFilter}` : "/events";
      const [eventData, seasonData] = await Promise.all([
        apiFetch(url),
        apiFetch("/timeline/seasons"),
      ]);
      setEvents(eventData);
      setSeasons(seasonData);
    } catch {
      notify("Failed to load events", "error");
    } finally {
      setLoading(false);
    }
  }, [categoryFilter]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const buildPayload = (f: EventFormData) => {
    const began_at = f.time ? `${f.date}T${f.time}` : f.date;
    let ended_at: string | null = null;
    if (f.kind === "span" && f.endDate) ended_at = f.endDate;
    if (f.kind === "moment") ended_at = began_at;
    return {
      user_id: "",
      title: f.title,
      description: f.description || null,
      category: f.category,
      location: f.location || null,
      location_places: f.locationPlaces,
      began_at,
      ended_at,
      kind: f.kind,
    };
  };

  const handleCreate = async () => {
    try {
      const created = await apiFetch("/events", {
        method: "POST",
        body: JSON.stringify(buildPayload(form)),
      });
      setEvents((prev) => [...prev, created]);
      setSelectedRef({ kind: "event", id: created.id });
      setAddDialogOpen(false);
      setForm(emptyEventForm);
      notify("Event created");
    } catch {
      notify("Failed to create event", "error");
    }
  };

  const handleDeleteEvent = async (id: string) => {
    try {
      await apiFetch(`/events/${id}`, { method: "DELETE" });
      setEvents((prev) => prev.filter((e) => e.id !== id));
      if (selectedRef?.kind === "event" && selectedRef.id === id) setSelectedRef(null);
      notify("Event deleted");
    } catch {
      notify("Failed to delete event", "error");
    }
  };

  const handleDeleteSeason = async (id: string) => {
    try {
      await apiFetch(`/timeline/seasons/${id}`, { method: "DELETE" });
      setSeasons((prev) => prev.filter((s) => s.id !== id));
      if (selectedRef?.kind === "season" && selectedRef.id === id) setSelectedRef(null);
      notify("Season deleted");
    } catch {
      notify("Failed to delete season", "error");
    }
  };

  const selectedEvent = selectedRef?.kind === "event"
    ? events.find((e) => e.id === selectedRef.id) ?? null
    : null;
  const selectedSeason = selectedRef?.kind === "season"
    ? seasons.find((s) => s.id === selectedRef.id) ?? null
    : null;
  const hasSelection = !!(selectedEvent || selectedSeason);

  // Merge events and seasons into a single list sorted newest-first.
  type Entry =
    | { kind: "event"; id: string; date: string; event: Event }
    | { kind: "season"; id: string; date: string; season: EditableSeason };
  const entries: Entry[] = [
    ...events
      .filter((e) => !categoryFilter || e.category === categoryFilter)
      .map<Entry>((e) => ({ kind: "event", id: e.id, date: e.began_at, event: e })),
    // Seasons are not filtered by category since they don't carry one
    ...(categoryFilter
      ? []
      : seasons.map<Entry>((s) => ({ kind: "season", id: s.id, date: s.start_date, season: s }))),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString();
    } catch {
      return iso;
    }
  };

  return (
    <Box sx={{ display: "flex", height: "100%" }}>
      {/* Left: Event + Season list */}
      <Box
        sx={{
          width: { xs: "100%", md: 360 },
          borderRight: { md: 1 },
          borderColor: "divider",
          display: { xs: hasSelection ? "none" : "flex", md: "flex" },
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <Box sx={{ p: 2, display: "flex", alignItems: "center", gap: 1 }}>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>Events</Typography>
          <IconButton
            color="primary"
            onClick={() => {
              setForm({ ...emptyEventForm, date: new Date().toISOString().split("T")[0] });
              setAddDialogOpen(true);
            }}
            title="Add event"
          >
            <Add />
          </IconButton>
        </Box>

        <Box sx={{ px: 2, pb: 1 }}>
          <FormControl fullWidth size="small">
            <InputLabel>Category</InputLabel>
            <Select
              label="Category"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              <MenuItem value="">All</MenuItem>
              {CATEGORY_OPTIONS.map((c) => (
                <MenuItem key={c.value} value={c.value}>{c.label}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>

        <Box sx={{ overflow: "auto", flexGrow: 1 }}>
          {loading ? (
            <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
              <CircularProgress />
            </Box>
          ) : entries.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
              No events yet. Add one to get started.
            </Typography>
          ) : (
            <List disablePadding>
              {entries.map((entry) => {
                if (entry.kind === "event") {
                  const e = entry.event;
                  const kind = getEventKind(e);
                  const KindIcon = KIND_META[kind].icon;
                  const isSelected = selectedRef?.kind === "event" && selectedRef.id === e.id;
                  return (
                    <ListItemButton
                      key={`event-${e.id}`}
                      selected={isSelected}
                      onClick={() => setSelectedRef({ kind: "event", id: e.id })}
                    >
                      <ListItemIcon sx={{ minWidth: 32 }} title={KIND_META[kind].label}>
                        <KindIcon fontSize="small" color="action" />
                      </ListItemIcon>
                      <ListItemText
                        primary={e.title}
                        secondary={
                          <>
                            {kind === "ongoing" ? "since " : ""}
                            {formatDate(e.began_at)}
                            {e.ended_at && e.ended_at.slice(0, 10) !== e.began_at.slice(0, 10)
                              ? ` – ${formatDate(e.ended_at)}`
                              : ""}
                            {" · "}
                            {CATEGORY_OPTIONS.find((c) => c.value === e.category)?.label || e.category}
                          </>
                        }
                      />
                    </ListItemButton>
                  );
                }
                const s = entry.season;
                const isSelected = selectedRef?.kind === "season" && selectedRef.id === s.id;
                return (
                  <ListItemButton
                    key={`season-${s.id}`}
                    selected={isSelected}
                    onClick={() => setSelectedRef({ kind: "season", id: s.id })}
                  >
                    <ListItemIcon sx={{ minWidth: 32 }} title="Season">
                      <DateRange fontSize="small" color="action" />
                    </ListItemIcon>
                    <ListItemText
                      primary={s.title}
                      secondary={
                        <>
                          {s.end_date
                            ? `${formatDate(s.start_date)} – ${formatDate(s.end_date)}`
                            : `since ${formatDate(s.start_date)}`}
                          {" · Season"}
                        </>
                      }
                    />
                  </ListItemButton>
                );
              })}
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
          display: { xs: hasSelection ? "block" : "none", md: "block" },
        }}
      >
        {selectedEvent ? (
          <>
            <EventEditor
              key={selectedEvent.id}
              event={selectedEvent}
              onSaved={(updated) =>
                setEvents((prev) => prev.map((e) => (e.id === updated.id ? { ...e, ...updated } : e)))
              }
              onDelete={() => handleDeleteEvent(selectedEvent.id)}
              onBack={() => setSelectedRef(null)}
            />

            <Box sx={{ mt: 2 }}>
              <EventJournal eventId={selectedEvent.id} eventTitle={selectedEvent.title} />
            </Box>

            <Divider sx={{ my: 3 }} />

            <AssociationsPanel
              entityId={selectedEvent.id}
              entityType="event"
              entityName={selectedEvent.title}
            />
          </>
        ) : selectedSeason ? (
          <>
            <SeasonEditor
              key={selectedSeason.id}
              season={selectedSeason}
              onSaved={(updated) =>
                setSeasons((prev) => prev.map((s) => (s.id === updated.id ? { ...s, ...updated } : s)))
              }
              onDelete={() => handleDeleteSeason(selectedSeason.id)}
              onBack={() => setSelectedRef(null)}
            />

            <Box sx={{ mt: 2 }}>
              <EventJournal
                eventId={selectedSeason.id}
                eventTitle={selectedSeason.title}
                entityType="season"
              />
            </Box>

            <Divider sx={{ my: 3 }} />

            <AssociationsPanel
              entityId={selectedSeason.id}
              entityType="season"
              entityName={selectedSeason.title}
            />
          </>
        ) : (
          <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100%" }}>
            <Typography color="text.secondary">
              Select an event or season to see its details, or add a new one.
            </Typography>
          </Box>
        )}
      </Box>

      {/* Add Event Dialog — edits happen inline below the title */}
      <EventDialog
        open={addDialogOpen}
        mode="add"
        form={form}
        onChange={setForm}
        onSave={handleCreate}
        onClose={() => setAddDialogOpen(false)}
      />

      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          severity={snackbar.severity}
          onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
