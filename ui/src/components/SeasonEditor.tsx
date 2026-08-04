import { useEffect, useRef, useState } from "react";
import {
  Box,
  IconButton,
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

type SeasonKind = "span" | "ongoing";

interface SeasonLocationPlace {
  provider: "google";
  place_id: string;
  name: string;
  formatted_address: string;
  lat: number;
  lng: number;
  types: string[];
}

export interface EditableSeason {
  id: string;
  user_timeline_id: string;
  title: string;
  description: string | null;
  start_date: string;
  end_date: string | null;
  location_places: SeasonLocationPlace[];
}

interface FormState {
  title: string;
  start_date: string;
  end_date: string;
  kind: SeasonKind;
  description: string;
  locationPlaces: PickedPlace[];
}

function seasonToForm(s: EditableSeason): FormState {
  return {
    title: s.title,
    start_date: s.start_date,
    end_date: s.end_date || "",
    kind: s.end_date ? "span" : "ongoing",
    description: s.description || "",
    locationPlaces: (s.location_places as PickedPlace[] | undefined) || [],
  };
}

function formToPayload(f: FormState, s: EditableSeason) {
  return {
    user_timeline_id: s.user_timeline_id,
    title: f.title,
    description: f.description || null,
    start_date: f.start_date,
    end_date: f.kind === "ongoing" ? null : (f.end_date || null),
    location_places: f.locationPlaces,
  };
}

interface SeasonEditorProps {
  season: EditableSeason;
  onSaved: (updated: EditableSeason) => void;
  onDelete: () => void;
  onBack?: () => void;
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

export default function SeasonEditor({ season, onSaved, onDelete, onBack }: SeasonEditorProps) {
  const [form, setForm] = useState<FormState>(() => seasonToForm(season));
  const [status, setStatus] = useState<SaveStatus>("idle");
  const dirtyRef = useRef(false);
  const formRef = useRef(form);
  const seasonRef = useRef(season);
  const onSavedRef = useRef(onSaved);

  formRef.current = form;
  seasonRef.current = season;
  useEffect(() => { onSavedRef.current = onSaved; }, [onSaved]);

  const save = async () => {
    if (!dirtyRef.current) return;
    setStatus("saving");
    try {
      const updated = await apiFetch(`/timeline/seasons/${seasonRef.current.id}`, {
        method: "PUT",
        body: JSON.stringify(formToPayload(formRef.current, seasonRef.current)),
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

  useEffect(() => {
    return () => {
      if (!dirtyRef.current) return;
      apiFetch(`/timeline/seasons/${seasonRef.current.id}`, {
        method: "PUT",
        body: JSON.stringify(formToPayload(formRef.current, seasonRef.current)),
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
        <Tooltip title="Delete season">
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
          label="Start date"
          type="date"
          size="small"
          value={form.start_date}
          onChange={(e) => update({ start_date: e.target.value })}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <ToggleButtonGroup
          value={form.kind}
          exclusive
          onChange={(_e, val: SeasonKind | null) => { if (val) update({ kind: val }); }}
          size="small"
        >
          <ToggleButton value="span">While</ToggleButton>
          <ToggleButton value="ongoing">Ongoing</ToggleButton>
        </ToggleButtonGroup>
        {form.kind === "span" && (
          <TextField
            label="End date"
            type="date"
            size="small"
            value={form.end_date}
            onChange={(e) => update({ end_date: e.target.value })}
            slotProps={{ inputLabel: { shrink: true } }}
          />
        )}
      </Box>

      <Box sx={{ mb: 2 }}>
        <LocationsField
          value={form.locationPlaces}
          onChange={(places) => update({ locationPlaces: places })}
        />
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
