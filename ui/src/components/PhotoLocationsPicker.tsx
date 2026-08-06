import { useEffect, useMemo, useState } from "react";
import { Box, Chip, CircularProgress, Tooltip, Typography } from "@mui/material";
import { AddLocationAlt } from "@mui/icons-material";
import { setOptions, importLibrary } from "@googlemaps/js-api-loader";
import { apiFetch } from "../lib/api";
import { useEntityLinks } from "./LinkPickers";
import PlacesAutocompleteField, { type PickedPlace } from "./PlacesAutocompleteField";

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

// Load the Places library once per session.
let placesPromise: Promise<google.maps.PlacesLibrary> | null = null;
function loadPlacesLibrary(): Promise<google.maps.PlacesLibrary> {
  if (!placesPromise) {
    if (!API_KEY) return Promise.reject(new Error("VITE_GOOGLE_MAPS_API_KEY is not set"));
    setOptions({ key: API_KEY, v: "weekly" });
    placesPromise = importLibrary("places");
  }
  return placesPromise;
}

interface PhotoLocationsPickerProps {
  photoId: string;
  photoName: string;
  gpsLat?: number | null;
  gpsLng?: number | null;
}

interface NearbyPlace {
  provider: "google";
  place_id: string;
  name: string;
  formatted_address: string;
  lat: number;
  lng: number;
  types: string[];
}

interface SavedPlace {
  id: string;
  place_id: string;
  name: string;
  formatted_address: string;
  lat: number;
  lng: number;
  types: string[];
}

// Small module-level cache so re-opening the lightbox is instant.
let savedPlacesCache: SavedPlace[] | null = null;
async function loadSavedPlaces(): Promise<SavedPlace[]> {
  if (savedPlacesCache) return savedPlacesCache;
  try {
    const data = await apiFetch("/places");
    savedPlacesCache = (data as SavedPlace[]).map((p) => ({
      id: p.id,
      place_id: p.place_id,
      name: p.name,
      formatted_address: p.formatted_address || "",
      lat: p.lat,
      lng: p.lng,
      types: p.types || [],
    }));
  } catch {
    savedPlacesCache = [];
  }
  return savedPlacesCache;
}

export default function PhotoLocationsPicker({ photoId, photoName, gpsLat, gpsLng }: PhotoLocationsPickerProps) {
  const { links, addLink, removeLink, reload } = useEntityLinks(photoId, "photo", photoName);
  const [nearby, setNearby] = useState<NearbyPlace[] | null>(null);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [nearbyError, setNearbyError] = useState<string | null>(null);
  const [savedPlaces, setSavedPlaces] = useState<SavedPlace[]>([]);

  useEffect(() => {
    loadSavedPlaces().then(setSavedPlaces);
  }, []);

  // Fetch nearby places whenever we have GPS.
  useEffect(() => {
    let cancelled = false;
    if (gpsLat == null || gpsLng == null) {
      setNearby(null);
      return;
    }
    setNearbyLoading(true);
    setNearbyError(null);
    (async () => {
      try {
        const placesLib = await loadPlacesLibrary();
        // The new Places API v2 exposes a static `searchNearby` on the Place class.
        const PlaceCtor = (placesLib as unknown as { Place: { searchNearby: (req: unknown) => Promise<{ places: unknown[] }> } }).Place;
        const req = {
          fields: ["id", "displayName", "formattedAddress", "location", "types"],
          locationRestriction: {
            center: { lat: gpsLat, lng: gpsLng },
            radius: 300,
          },
          maxResultCount: 10,
        };
        const { places } = await PlaceCtor.searchNearby(req);
        if (cancelled) return;
        const parsed: NearbyPlace[] = places.map((p: unknown) => {
          const pl = p as {
            id?: string;
            displayName?: string;
            formattedAddress?: string;
            location?: { lat: () => number; lng: () => number };
            types?: string[];
          };
          return {
            provider: "google",
            place_id: pl.id || "",
            name: pl.displayName || "",
            formatted_address: pl.formattedAddress || "",
            lat: pl.location?.lat() ?? 0,
            lng: pl.location?.lng() ?? 0,
            types: pl.types || [],
          };
        });
        setNearby(parsed);
      } catch (e) {
        if (!cancelled) setNearbyError(e instanceof Error ? e.message : "Failed to load nearby places");
      } finally {
        if (!cancelled) setNearbyLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [gpsLat, gpsLng]);

  const placeLinks = links.filter((l) => l.to_type === "place");
  const linkedPlaceIdsInternal = new Set(placeLinks.map((l) => l.to_id));

  // The place_id linked in Links is our internal Firestore doc id (place doc id).
  // To dedupe nearby suggestions against already-linked, we need to map back
  // through savedPlaces (which knows both internal id and Google place_id).
  const linkedGooglePlaceIds = useMemo(() => {
    const s = new Set<string>();
    savedPlaces.forEach((sp) => {
      if (linkedPlaceIdsInternal.has(sp.id)) s.add(sp.place_id);
    });
    return s;
  }, [savedPlaces, linkedPlaceIdsInternal]);

  const linkedChips = placeLinks.map((l) => {
    const sp = savedPlaces.find((s) => s.id === l.to_id);
    return { linkId: l.id, name: l.to_name || sp?.name || "Place", address: sp?.formatted_address };
  });

  const nearbyToShow = (nearby ?? []).filter((n) => !linkedGooglePlaceIds.has(n.place_id));

  /** Persist a Google-picked place to /places (idempotent by place_id) and link it to this photo. */
  const linkGooglePlace = async (g: PickedPlace | NearbyPlace) => {
    try {
      // POST /places is idempotent by (user_id, place_id); returns existing or new.
      const saved = await apiFetch("/places", {
        method: "POST",
        body: JSON.stringify({
          provider: g.provider,
          place_id: g.place_id,
          name: g.name,
          formatted_address: g.formatted_address,
          lat: g.lat,
          lng: g.lng,
          types: g.types,
        }),
      }) as SavedPlace;
      // Invalidate + refresh saved-places cache so future opens include it.
      savedPlacesCache = null;
      loadSavedPlaces().then(setSavedPlaces);
      await addLink(saved.id, "place", saved.name);
      reload();
    } catch (e) {
      console.error("Failed to link place", e);
    }
  };

  return (
    <Box>
      {/* Currently linked places */}
      {linkedChips.length > 0 && (
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mb: 1 }}>
          {linkedChips.map(({ linkId, name, address }) => (
            <Tooltip key={linkId} title={address || ""}>
              <Chip
                label={name}
                size="small"
                variant="outlined"
                color="primary"
                onDelete={() => removeLink(linkId)}
              />
            </Tooltip>
          ))}
        </Box>
      )}

      {/* Nearby suggestions (based on photo GPS) */}
      {(gpsLat != null && gpsLng != null) && (
        <Box sx={{ mb: 1 }}>
          <Typography variant="caption" sx={{ display: "block", mb: 0.5, color: "text.disabled" }}>
            {nearbyLoading ? "Finding nearby places…" : nearbyError ? nearbyError : nearbyToShow.length === 0 ? "No nearby suggestions" : "Nearby — click to link"}
          </Typography>
          {nearbyLoading && <CircularProgress size={14} />}
          {!nearbyLoading && nearbyToShow.length > 0 && (
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
              {nearbyToShow.map((n) => (
                <Tooltip key={n.place_id} title={n.formatted_address}>
                  <Chip
                    label={n.name}
                    size="small"
                    variant="outlined"
                    icon={<AddLocationAlt fontSize="small" />}
                    onClick={() => linkGooglePlace(n)}
                    sx={{ cursor: "pointer" }}
                  />
                </Tooltip>
              ))}
            </Box>
          )}
        </Box>
      )}

      {/* Search (Google Maps, biased to photo GPS if available) */}
      <PlacesAutocompleteField
        placeholder="Search Google Maps for a place…"
        locationBias={gpsLat != null && gpsLng != null ? { lat: gpsLat, lng: gpsLng, radiusMeters: 5000 } : undefined}
        onPick={linkGooglePlace}
      />
    </Box>
  );
}
