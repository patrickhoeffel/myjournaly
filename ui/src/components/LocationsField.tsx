import { useEffect, useState } from "react";
import { Box, Chip, Collapse, Link, Tooltip, Typography } from "@mui/material";
import { apiFetch } from "../lib/api";
import PlacesAutocompleteField, { type PickedPlace } from "./PlacesAutocompleteField";

interface LocationsFieldProps {
  value: PickedPlace[];
  onChange: (next: PickedPlace[]) => void;
}

// Module-scoped in-memory cache so opening multiple editors doesn't refetch.
// Sources from /places (the canonical Places catalog) so even aspirational
// places — added without yet being linked to an event/season — appear as
// one-click chips here.
interface PlaceRow {
  place_id: string;
  name: string;
  formatted_address: string;
  lat: number;
  lng: number;
  types: string[];
  updated_at?: string;
}
let recentsCache: PickedPlace[] | null = null;
let recentsPromise: Promise<PickedPlace[]> | null = null;
function loadRecents(): Promise<PickedPlace[]> {
  if (recentsCache) return Promise.resolve(recentsCache);
  if (!recentsPromise) {
    recentsPromise = apiFetch("/places")
      .then((data: PlaceRow[]) => {
        const mapped: PickedPlace[] = data.map((p) => ({
          provider: "google",
          place_id: p.place_id,
          name: p.name,
          formatted_address: p.formatted_address,
          lat: p.lat,
          lng: p.lng,
          types: p.types || [],
        }));
        // Most-recently-touched first (server returns alphabetical; sort here for relevance).
        mapped.sort((a, b) => {
          const ai = data.find((x) => x.place_id === a.place_id)?.updated_at || "";
          const bi = data.find((x) => x.place_id === b.place_id)?.updated_at || "";
          return bi.localeCompare(ai);
        });
        recentsCache = mapped;
        return mapped;
      })
      .catch(() => {
        recentsPromise = null;
        return [];
      });
  }
  return recentsPromise;
}

export default function LocationsField({ value, onChange }: LocationsFieldProps) {
  // The new PlaceAutocompleteElement owns its own input state. We force-remount
  // after each pick so the input clears for the next entry.
  const [pickerKey, setPickerKey] = useState(0);
  const [recents, setRecents] = useState<PickedPlace[]>(() => recentsCache || []);
  const [recentsOpen, setRecentsOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadRecents().then((data) => { if (!cancelled) setRecents(data); });
    return () => { cancelled = true; };
  }, []);

  const removeAt = (i: number) => {
    onChange(value.filter((_, idx) => idx !== i));
  };

  const append = (place: PickedPlace) => {
    if (!value.some((p) => p.place_id === place.place_id)) {
      onChange([...value, place]);
    }
    setPickerKey((k) => k + 1);
    // Optimistically promote this place into the recents cache so it shows up
    // on the next open without waiting for a refetch.
    recentsCache = [place, ...(recentsCache || []).filter((r) => r.place_id !== place.place_id)];
    setRecents(recentsCache);
  };

  const selectedIds = new Set(value.map((p) => p.place_id));
  const availableRecents = recents.filter((p) => !selectedIds.has(p.place_id));

  return (
    <Box>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ fontWeight: 600, display: "block", mb: 0.5 }}
      >
        Locations
      </Typography>
      {value.length > 0 && (
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mb: 1 }}>
          {value.map((p, i) => (
            <Chip
              key={p.place_id || i}
              label={p.name}
              size="small"
              variant="outlined"
              onDelete={() => removeAt(i)}
              title={p.formatted_address}
            />
          ))}
        </Box>
      )}
      {availableRecents.length > 0 && (
        <Box sx={{ mb: 1 }}>
          <Link
            component="button"
            type="button"
            underline="hover"
            onClick={() => setRecentsOpen((v) => !v)}
            sx={{ display: "block", mb: 0.5, fontSize: "0.75rem", color: "text.disabled" }}
          >
            {recentsOpen ? "Hide" : "Show"} {availableRecents.length} used before
          </Link>
          <Collapse in={recentsOpen} unmountOnExit>
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
              {availableRecents.map((p) => (
                <Tooltip key={p.place_id} title={p.formatted_address}>
                  <Chip
                    label={p.name}
                    size="small"
                    variant="outlined"
                    color="default"
                    onClick={() => append(p)}
                    sx={{ cursor: "pointer" }}
                  />
                </Tooltip>
              ))}
            </Box>
          </Collapse>
        </Box>
      )}
      <PlacesAutocompleteField
        key={pickerKey}
        label={value.length === 0 ? "Add location" : "Add another location"}
        placeholder="Start typing a place…"
        onPick={append}
      />
    </Box>
  );
}
