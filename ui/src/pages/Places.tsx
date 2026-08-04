import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
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
  Divider,
  IconButton,
  InputAdornment,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Slider,
  Snackbar,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { Add, ArrowBack, ArrowRightAlt, Clear, DateRange, Delete, FiberManualRecord, LinearScale, Map as MapIcon, Place as PlaceIcon, Search } from "@mui/icons-material";
import { apiFetch } from "../lib/api";
import PlacesAutocompleteField, { type PickedPlace } from "../components/PlacesAutocompleteField";
import PlacesMap from "../components/PlacesMap";
import EventJournal from "../components/EventJournal";
import AssociationsPanel from "../components/AssociationsPanel";

interface Place {
  id: string;
  user_id: string;
  provider: "google";
  place_id: string;
  name: string;
  formatted_address: string;
  lat: number;
  lng: number;
  types: string[];
  notes: string | null;
  photo_url: string | null;
  created_at: string;
  updated_at: string;
}

interface LinkedEventRef {
  id: string;
  title: string;
  began_at: string;
  ended_at: string | null;
  kind: "moment" | "span" | "ongoing" | null;
  category: string | null;
}

interface LinkedSeasonRef {
  id: string;
  title: string;
  start_date: string;
  end_date: string | null;
}

interface References {
  events: LinkedEventRef[];
  seasons: LinkedSeasonRef[];
}

const eventKindOf = (e: LinkedEventRef): "moment" | "span" | "ongoing" => {
  if (e.kind) return e.kind;
  if (e.ended_at && e.ended_at.slice(0, 10) !== e.began_at.slice(0, 10)) return "span";
  return "moment";
};

const KIND_ICON = {
  moment: FiberManualRecord,
  span: LinearScale,
  ongoing: ArrowRightAlt,
};

const formatDate = (iso: string) => {
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso;
  }
};

export default function Places() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get("place"));
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addKey, setAddKey] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [mapVisible, setMapVisible] = useState(false);
  const [mapSizePct, setMapSizePct] = useState(40);
  const [snackbar, setSnackbar] = useState({ open: false, message: "", severity: "success" as "success" | "error" });

  const notify = (message: string, severity: "success" | "error" = "success") =>
    setSnackbar({ open: true, message, severity });

  const load = useCallback(async () => {
    try {
      const data: Place[] = await apiFetch("/places");
      setPlaces(data);
    } catch {
      notify("Failed to load places", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async (picked: PickedPlace) => {
    try {
      const created: Place = await apiFetch("/places", {
        method: "POST",
        body: JSON.stringify({
          provider: "google",
          place_id: picked.place_id,
          name: picked.name,
          formatted_address: picked.formatted_address,
          lat: picked.lat,
          lng: picked.lng,
          types: picked.types,
        }),
      });
      setPlaces((prev) => {
        // If the place already existed, server returns the existing doc — dedupe by id
        if (prev.some((p) => p.id === created.id)) return prev;
        return [...prev, created].sort((a, b) => a.name.localeCompare(b.name));
      });
      setSelectedId(created.id);
      setAddDialogOpen(false);
      setAddKey((k) => k + 1);
      notify("Place added");
    } catch {
      notify("Failed to add place", "error");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Remove this place from your places list? Linked events and seasons keep their location data.")) return;
    try {
      await apiFetch(`/places/${id}`, { method: "DELETE" });
      setPlaces((prev) => prev.filter((p) => p.id !== id));
      if (selectedId === id) setSelectedId(null);
      notify("Place removed");
    } catch {
      notify("Failed to remove place", "error");
    }
  };

  const selected = places.find((p) => p.id === selectedId) || null;

  const searchLower = searchQuery.trim().toLowerCase();
  const filteredPlaces = searchLower
    ? places.filter(
        (p) =>
          p.name.toLowerCase().includes(searchLower) ||
          p.formatted_address.toLowerCase().includes(searchLower),
      )
    : places;

  // Group alphabetically by first letter of name.
  const grouped = filteredPlaces.reduce<Record<string, Place[]>>((acc, p) => {
    const letter = ((p.name || "?")[0] || "?").toUpperCase();
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
      {/* Left: list */}
      <Box
        sx={{
          width: { xs: "100%", md: 360 },
          borderRight: { md: "1px solid #e0e0e0" },
          display: { xs: selectedId ? "none" : "flex", md: "flex" },
          flexDirection: "column",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, px: 2, py: 1.5, borderBottom: "1px solid #e0e0e0" }}>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>Places</Typography>
          <Tooltip title={mapVisible ? "Hide map" : "Show map"}>
            <IconButton
              size="small"
              onClick={() => setMapVisible((v) => !v)}
              color={mapVisible ? "primary" : "default"}
            >
              <MapIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Button size="small" variant="outlined" startIcon={<Add />} onClick={() => setAddDialogOpen(true)}>
            Add
          </Button>
        </Box>
        <Box sx={{ px: 2, py: 1, borderBottom: "1px solid #f0f0f0" }}>
          <TextField
            size="small"
            fullWidth
            placeholder="Search places…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <Search fontSize="small" />
                  </InputAdornment>
                ),
                endAdornment: searchQuery ? (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => setSearchQuery("")} edge="end">
                      <Clear fontSize="small" />
                    </IconButton>
                  </InputAdornment>
                ) : null,
              },
            }}
          />
        </Box>
        <Box sx={{ flexGrow: 1, overflow: "auto" }}>
          {sortedLetters.length === 0 ? (
            <Typography color="text.secondary" sx={{ p: 3, textAlign: "center" }}>
              {searchQuery
                ? "No places match that search."
                : "No places yet. Add somewhere meaningful to you."}
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
                      <ListItemIcon sx={{ minWidth: 32 }}>
                        <PlaceIcon fontSize="small" color="action" />
                      </ListItemIcon>
                      <ListItemText
                        primary={p.name}
                        secondary={p.formatted_address}
                        slotProps={{ secondary: { sx: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } } }}
                      />
                    </ListItemButton>
                  ))}
                </Box>
              ))}
            </List>
          )}
        </Box>
      </Box>

      {/* Right area: detail panel + optional map */}
      <Box
        sx={{
          flexGrow: 1,
          display: { xs: selectedId || mapVisible ? "flex" : "none", md: "flex" },
          flexDirection: "row",
          minWidth: 0,
        }}
      >
        <Box
          sx={{
            flexBasis: mapVisible ? `${100 - mapSizePct}%` : "100%",
            flexGrow: mapVisible ? 0 : 1,
            overflow: "auto",
            p: { xs: 2, md: 3 },
            minWidth: 240,
          }}
        >
          {selected ? (
            <PlaceDetail
              key={selected.id}
              place={selected}
              onSaved={(updated) => setPlaces((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))}
              onDelete={() => handleDelete(selected.id)}
              onBack={() => setSelectedId(null)}
              onJumpToEvent={(id) => navigate(`/events?event=${id}`)}
              onJumpToSeason={(id) => navigate(`/events?season=${id}`)}
            />
          ) : (
            <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100%" }}>
              <Typography color="text.secondary">
                {mapVisible
                  ? "Click a pin on the map or pick a place from the list."
                  : "Select a place to see its details, or add one."}
              </Typography>
            </Box>
          )}
        </Box>
        {mapVisible && (
          <Box
            sx={{
              flexBasis: `${mapSizePct}%`,
              flexGrow: 0,
              flexShrink: 0,
              borderLeft: 1,
              borderColor: "divider",
              minWidth: 240,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <Box sx={{ px: 2, py: 1, borderBottom: "1px solid #f0f0f0", display: "flex", alignItems: "center", gap: 1 }}>
              <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                Map width
              </Typography>
              <Slider
                size="small"
                min={20}
                max={70}
                value={mapSizePct}
                onChange={(_e, v) => setMapSizePct(Array.isArray(v) ? v[0] : v)}
                aria-label="Map width"
                sx={{ flexGrow: 1, mx: 1 }}
              />
            </Box>
            <Box sx={{ flexGrow: 1, minHeight: 0 }}>
              <PlacesMap
                places={filteredPlaces.map((p) => ({
                  id: p.id,
                  place_id: p.place_id,
                  name: p.name,
                  formatted_address: p.formatted_address,
                  lat: p.lat,
                  lng: p.lng,
                }))}
                selectedId={selectedId}
                onSelect={(id) => setSelectedId(id)}
              />
            </Box>
          </Box>
        )}
      </Box>

      <Dialog open={addDialogOpen} onClose={() => setAddDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Add Place</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Start typing a place — pick a result to add it. Past, present, or aspirational.
          </Typography>
          <PlacesAutocompleteField
            key={addKey}
            label="Place"
            placeholder="Search for a place…"
            onPick={handleAdd}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddDialogOpen(false)}>Cancel</Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar((s) => ({ ...s, open: false }))}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}

// ── Detail subcomponent ──

interface PlaceDetailProps {
  place: Place;
  onSaved: (updated: Place) => void;
  onDelete: () => void;
  onBack: () => void;
  onJumpToEvent: (id: string) => void;
  onJumpToSeason: (id: string) => void;
}

function PlaceDetail({ place, onSaved, onDelete, onBack, onJumpToEvent, onJumpToSeason }: PlaceDetailProps) {
  type FormState = { name: string; notes: string };
  const [form, setForm] = useState<FormState>({ name: place.name, notes: place.notes || "" });
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [refs, setRefs] = useState<References>({ events: [], seasons: [] });
  const dirtyRef = useRef(false);
  const formRef = useRef(form);
  const placeRef = useRef(place);
  const onSavedRef = useRef(onSaved);

  formRef.current = form;
  placeRef.current = place;
  useEffect(() => { onSavedRef.current = onSaved; }, [onSaved]);

  // Load references for this place.
  useEffect(() => {
    let cancelled = false;
    apiFetch(`/places/${place.id}/references`)
      .then((data: References) => { if (!cancelled) setRefs(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [place.id]);

  const save = async () => {
    if (!dirtyRef.current) return;
    setStatus("saving");
    try {
      const updated: Place = await apiFetch(`/places/${placeRef.current.id}`, {
        method: "PUT",
        body: JSON.stringify({
          ...placeRef.current,
          name: formRef.current.name,
          notes: formRef.current.notes || null,
        }),
      });
      dirtyRef.current = false;
      setStatus("saved");
      onSavedRef.current(updated);
    } catch {
      setStatus("error");
    }
  };

  useEffect(() => {
    if (!dirtyRef.current) return;
    const id = setTimeout(() => { void save(); }, 800);
    return () => clearTimeout(id);
  }, [form]);

  useEffect(() => () => {
    if (!dirtyRef.current) return;
    apiFetch(`/places/${placeRef.current.id}`, {
      method: "PUT",
      body: JSON.stringify({
        ...placeRef.current,
        name: formRef.current.name,
        notes: formRef.current.notes || null,
      }),
    }).catch(() => {});
  }, []);

  const update = (patch: Partial<FormState>) => {
    setForm((prev) => ({ ...prev, ...patch }));
    dirtyRef.current = true;
    setStatus("idle");
  };

  const statusText =
    status === "saving" ? "Saving…" :
    status === "saved" ? "Saved" :
    status === "error" ? "Save failed" :
    dirtyRef.current ? "Editing…" : "";

  const mapsHref = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.formatted_address)}&query_place_id=${place.place_id}`;

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
        <IconButton
          size="small"
          onClick={onBack}
          sx={{ display: { xs: "inline-flex", md: "none" } }}
          title="Back to list"
        >
          <ArrowBack fontSize="small" />
        </IconButton>
        <Box sx={{ flexGrow: 1 }} />
        <Typography
          variant="caption"
          color={status === "error" ? "error.main" : "text.secondary"}
          sx={{ minHeight: 16 }}
        >
          {statusText}
        </Typography>
        <Tooltip title="Remove place">
          <IconButton size="small" color="error" onClick={onDelete}>
            <Delete fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      <TextField
        variant="standard"
        fullWidth
        value={form.name}
        onChange={(e) => update({ name: e.target.value })}
        slotProps={{ input: { sx: { fontSize: "1.5rem", fontWeight: 700 } } }}
        sx={{ mb: 1 }}
      />
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        <a href={mapsHref} target="_blank" rel="noopener noreferrer" style={{ color: "inherit" }}>
          {place.formatted_address}
        </a>
      </Typography>

      <TextField
        label="Notes about this place"
        value={form.notes}
        onChange={(e) => update({ notes: e.target.value })}
        fullWidth
        multiline
        minRows={2}
        maxRows={8}
        placeholder="Why does this place matter? What does it mean to you?"
        sx={{ mb: 3 }}
      />

      {(refs.events.length > 0 || refs.seasons.length > 0) && (
        <>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>Linked here</Typography>
          <List dense disablePadding sx={{ mb: 2 }}>
            {refs.events.map((e) => {
              const kind = eventKindOf(e);
              const KindIcon = KIND_ICON[kind];
              return (
                <ListItemButton key={`event-${e.id}`} onClick={() => onJumpToEvent(e.id)} sx={{ borderRadius: 1 }}>
                  <ListItemIcon sx={{ minWidth: 32 }} title={kind}>
                    <KindIcon fontSize="small" color="action" />
                  </ListItemIcon>
                  <ListItemText
                    primary={e.title}
                    secondary={
                      <>
                        {kind === "ongoing" ? "since " : ""}
                        {formatDate(e.began_at)}
                        {e.ended_at && e.ended_at.slice(0, 10) !== e.began_at.slice(0, 10) ? ` – ${formatDate(e.ended_at)}` : ""}
                      </>
                    }
                  />
                </ListItemButton>
              );
            })}
            {refs.seasons.map((s) => (
              <ListItemButton key={`season-${s.id}`} onClick={() => onJumpToSeason(s.id)} sx={{ borderRadius: 1 }}>
                <ListItemIcon sx={{ minWidth: 32 }} title="Season">
                  <DateRange fontSize="small" color="action" />
                </ListItemIcon>
                <ListItemText
                  primary={s.title}
                  secondary={
                    s.end_date
                      ? `${formatDate(s.start_date)} – ${formatDate(s.end_date)}`
                      : `since ${formatDate(s.start_date)}`
                  }
                />
              </ListItemButton>
            ))}
          </List>
        </>
      )}

      <Box sx={{ mt: 2 }}>
        <EventJournal
          eventId={place.id}
          eventTitle={place.name}
          entityType="place"
        />
      </Box>

      <Divider sx={{ my: 3 }} />

      <AssociationsPanel
        entityId={place.id}
        entityType="place"
        entityName={place.name}
      />

      <Box sx={{ display: "flex", gap: 0.5, mt: 2, flexWrap: "wrap" }}>
        {place.types?.slice(0, 6).map((t) => (
          <Chip key={t} size="small" variant="outlined" label={t.replace(/_/g, " ")} />
        ))}
      </Box>
    </Box>
  );
}
