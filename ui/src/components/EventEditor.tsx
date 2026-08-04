import { useEffect, useRef, useState } from "react";
import {
  Box,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/material";
import { ArrowBack, Delete } from "@mui/icons-material";
import { apiFetch } from "../lib/api";
import { type PickedPlace } from "./PlacesAutocompleteField";
import LocationsField from "./LocationsField";

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

export interface EditableEvent {
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

interface FormState {
  title: string;
  date: string;
  time: string;
  kind: EventKind;
  endDate: string;
  category: string;
  location: string;
  locationPlaces: PickedPlace[];
  description: string;
}

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

function eventToForm(e: EditableEvent): FormState {
  const beganDate = e.began_at ? e.began_at.slice(0, 10) : "";
  const beganTime = e.began_at && e.began_at.length > 10 ? e.began_at.slice(11, 16) : "";
  const endedDate = e.ended_at ? e.ended_at.slice(0, 10) : "";
  let kind: EventKind = "moment";
  if (e.kind === "moment" || e.kind === "span" || e.kind === "ongoing") kind = e.kind;
  else if (e.ended_at && endedDate > beganDate) kind = "span";
  return {
    title: e.title,
    date: beganDate,
    time: beganTime,
    kind,
    endDate: kind === "span" ? endedDate : "",
    category: e.category,
    location: e.location || "",
    locationPlaces: (e.location_places as PickedPlace[] | undefined) || [],
    description: e.description || "",
  };
}

function formToPayload(f: FormState) {
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
}

interface EventEditorProps {
  event: EditableEvent;
  onSaved: (updated: EditableEvent) => void;
  onDelete: () => void;
  onBack?: () => void;
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

export default function EventEditor({ event, onSaved, onDelete, onBack }: EventEditorProps) {
  const [form, setForm] = useState<FormState>(() => eventToForm(event));
  const [status, setStatus] = useState<SaveStatus>("idle");
  const dirtyRef = useRef(false);
  const formRef = useRef(form);
  const eventIdRef = useRef(event.id);
  const onSavedRef = useRef(onSaved);

  formRef.current = form;
  eventIdRef.current = event.id;
  useEffect(() => { onSavedRef.current = onSaved; }, [onSaved]);

  const save = async () => {
    if (!dirtyRef.current) return;
    setStatus("saving");
    try {
      const updated = await apiFetch(`/events/${eventIdRef.current}`, {
        method: "PUT",
        body: JSON.stringify(formToPayload(formRef.current)),
      });
      dirtyRef.current = false;
      setStatus("saved");
      onSavedRef.current(updated);
    } catch {
      setStatus("error");
    }
  };

  // Debounced auto-save
  useEffect(() => {
    if (!dirtyRef.current) return;
    const id = setTimeout(() => { void save(); }, 800);
    return () => clearTimeout(id);
  }, [form]);

  // Flush on unmount (e.g., switching events) — fire-and-forget
  useEffect(() => {
    return () => {
      if (!dirtyRef.current) return;
      apiFetch(`/events/${eventIdRef.current}`, {
        method: "PUT",
        body: JSON.stringify(formToPayload(formRef.current)),
      }).catch(() => {});
    };
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

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
        {onBack && (
          <IconButton
            size="small"
            onClick={onBack}
            sx={{ display: { xs: "inline-flex", md: "none" } }}
            title="Back to list"
          >
            <ArrowBack fontSize="small" />
          </IconButton>
        )}
        <Box sx={{ flexGrow: 1 }} />
        <Typography
          variant="caption"
          color={status === "error" ? "error.main" : "text.secondary"}
          sx={{ minHeight: 16 }}
        >
          {statusText}
        </Typography>
        <Tooltip title="Delete event">
          <IconButton size="small" color="error" onClick={onDelete}>
            <Delete fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      <TextField
        variant="standard"
        fullWidth
        value={form.title}
        onChange={(e) => update({ title: e.target.value })}
        placeholder="Title"
        slotProps={{ input: { sx: { fontSize: "1.5rem", fontWeight: 700 } } }}
        sx={{ mb: 2 }}
      />

      <Box sx={{ display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap", mb: 2 }}>
        <TextField
          label="Date"
          type="date"
          size="small"
          value={form.date}
          onChange={(e) => update({ date: e.target.value })}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <TextField
          label="Time"
          type="time"
          size="small"
          value={form.time}
          onChange={(e) => update({ time: e.target.value })}
          sx={{ width: 130 }}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <ToggleButtonGroup
          value={form.kind}
          exclusive
          onChange={(_e, val: EventKind | null) => { if (val) update({ kind: val }); }}
          size="small"
        >
          <ToggleButton value="moment">Moment</ToggleButton>
          <ToggleButton value="span">While</ToggleButton>
          <ToggleButton value="ongoing">Ongoing</ToggleButton>
        </ToggleButtonGroup>
        {form.kind === "span" && (
          <TextField
            label="End Date"
            type="date"
            size="small"
            value={form.endDate}
            onChange={(e) => update({ endDate: e.target.value })}
            slotProps={{ inputLabel: { shrink: true } }}
          />
        )}
      </Box>

      <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", mb: 2, alignItems: "flex-start" }}>
        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel>Category</InputLabel>
          <Select
            label="Category"
            value={form.category}
            onChange={(e) => update({ category: e.target.value })}
          >
            {CATEGORY_OPTIONS.map((c) => (
              <MenuItem key={c.value} value={c.value}>{c.label}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <Box sx={{ flexGrow: 1, minWidth: 240 }}>
          <LocationsField
            value={form.locationPlaces}
            onChange={(places) => update({ locationPlaces: places })}
          />
        </Box>
      </Box>

      <TextField
        label="Description"
        value={form.description}
        onChange={(e) => update({ description: e.target.value })}
        fullWidth
        multiline
        minRows={2}
        maxRows={6}
      />
    </Box>
  );
}
