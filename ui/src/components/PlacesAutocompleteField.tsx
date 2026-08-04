import { useEffect, useRef, useState } from "react";
import { Box, Typography } from "@mui/material";
import { setOptions, importLibrary } from "@googlemaps/js-api-loader";

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

let placesPromise: Promise<google.maps.PlacesLibrary> | null = null;
function loadPlacesLibrary(): Promise<google.maps.PlacesLibrary> {
  if (!placesPromise) {
    if (!API_KEY) {
      return Promise.reject(new Error("VITE_GOOGLE_MAPS_API_KEY is not set"));
    }
    setOptions({ key: API_KEY, v: "weekly" });
    placesPromise = importLibrary("places");
  }
  return placesPromise;
}

export interface PickedPlace {
  provider: "google";
  place_id: string;
  name: string;
  formatted_address: string;
  lat: number;
  lng: number;
  types: string[];
}

interface PlacesAutocompleteFieldProps {
  onPick: (place: PickedPlace) => void;
  label?: string;
  placeholder?: string;
  helperText?: string;
}

export default function PlacesAutocompleteField({
  onPick,
  label,
  placeholder,
  helperText,
}: PlacesAutocompleteFieldProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onPickRef = useRef(onPick);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    onPickRef.current = onPick;
  }, [onPick]);

  useEffect(() => {
    let cancelled = false;
    let element: HTMLElement | null = null;

    loadPlacesLibrary()
      .then((placesLib) => {
        if (cancelled || !containerRef.current) return;
        // PlaceAutocompleteElement: Google's new web-component autocomplete
        // (legacy google.maps.places.Autocomplete is blocked for projects
        // created after 2025-03-01).
        const PaeCtor = (placesLib as unknown as { PlaceAutocompleteElement: new () => HTMLElement })
          .PlaceAutocompleteElement;
        const el = new PaeCtor();
        if (placeholder) el.setAttribute("placeholder", placeholder);
        el.style.width = "100%";
        containerRef.current.appendChild(el);
        element = el;

        el.addEventListener("gmp-select", async (raw: Event) => {
          // The event has a `placePrediction` property (per Google docs);
          // be defensive in case it lands under .detail in some envs.
          const ev = raw as unknown as {
            placePrediction?: { toPlace: () => unknown; text?: { text?: string } };
            detail?: { placePrediction?: { toPlace: () => unknown; text?: { text?: string } } };
          };
          const prediction = ev.placePrediction ?? ev.detail?.placePrediction;
          if (!prediction) return;
          try {
            const place = prediction.toPlace() as {
              id?: string;
              displayName?: string;
              formattedAddress?: string;
              location?: { lat: () => number; lng: () => number };
              types?: string[];
              fetchFields: (opts: { fields: string[] }) => Promise<void>;
            };
            await place.fetchFields({
              fields: ["displayName", "formattedAddress", "location", "types", "id"],
            });
            onPickRef.current({
              provider: "google",
              place_id: place.id || "",
              name: place.displayName || prediction.text?.text || "",
              formatted_address: place.formattedAddress || "",
              lat: place.location?.lat() ?? 0,
              lng: place.location?.lng() ?? 0,
              types: place.types || [],
            });
          } catch (e) {
            console.error("Place fetch failed", e);
          }
        });
      })
      .catch((e: unknown) => {
        setLoadError(e instanceof Error ? e.message : "Failed to load Maps API");
      });

    return () => {
      cancelled = true;
      if (element) element.remove();
    };
  }, [placeholder]);

  return (
    <Box>
      {label && (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: "block", mb: 0.5, fontWeight: 600 }}
        >
          {label}
        </Typography>
      )}
      <Box ref={containerRef} sx={{ width: "100%" }} />
      {(loadError || helperText) && (
        <Typography
          variant="caption"
          color={loadError ? "error.main" : "text.secondary"}
          sx={{ display: "block", mt: 0.5 }}
        >
          {loadError || helperText}
        </Typography>
      )}
    </Box>
  );
}
