import { useEffect, useRef, useState } from "react";
import { Box, Typography } from "@mui/material";
import { setOptions, importLibrary } from "@googlemaps/js-api-loader";

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

let mapsLibPromise: Promise<google.maps.MapsLibrary> | null = null;
let markerLibPromise: Promise<google.maps.MarkerLibrary> | null = null;
function loadMapLibs(): Promise<[google.maps.MapsLibrary, google.maps.MarkerLibrary]> {
  if (!API_KEY) return Promise.reject(new Error("VITE_GOOGLE_MAPS_API_KEY is not set"));
  setOptions({ key: API_KEY, v: "weekly" });
  if (!mapsLibPromise) mapsLibPromise = importLibrary("maps");
  if (!markerLibPromise) markerLibPromise = importLibrary("marker");
  return Promise.all([mapsLibPromise, markerLibPromise]);
}

export interface PlaceMarker {
  id: string;          // Firestore doc id (used by selection/click)
  place_id: string;    // Google's place id
  name: string;
  formatted_address: string;
  lat: number;
  lng: number;
}

interface PlacesMapProps {
  places: PlaceMarker[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const DOT_COLOR = "#1976d2";
const SELECTED_COLOR = "#d32f2f";

function buildDot(selected: boolean): HTMLDivElement {
  const dot = document.createElement("div");
  const size = selected ? 22 : 16;
  dot.style.width = `${size}px`;
  dot.style.height = `${size}px`;
  dot.style.borderRadius = "50%";
  dot.style.background = selected ? SELECTED_COLOR : DOT_COLOR;
  dot.style.border = "2px solid white";
  dot.style.boxShadow = "0 1px 4px rgba(0,0,0,0.4)";
  dot.style.transition = "transform 0.15s ease";
  if (selected) dot.style.transform = "scale(1.05)";
  return dot;
}

export default function PlacesMap({ places, selectedId, onSelect }: PlacesMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<Map<string, google.maps.marker.AdvancedMarkerElement>>(new Map());
  const onSelectRef = useRef(onSelect);
  const [loadError, setLoadError] = useState<string | null>(null);
  const hasFitRef = useRef(false);

  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);

  // Initialize map once.
  useEffect(() => {
    let cancelled = false;
    if (!containerRef.current) return;
    loadMapLibs()
      .then(([mapsLib]) => {
        if (cancelled || !containerRef.current) return;
        mapRef.current = new mapsLib.Map(containerRef.current, {
          center: { lat: 39.5, lng: -98.35 },
          zoom: 4,
          mapId: "DEMO_MAP_ID",
          gestureHandling: "greedy",
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: false,
        });
      })
      .catch((e: unknown) => {
        setLoadError(e instanceof Error ? e.message : "Failed to load Maps");
      });
    return () => { cancelled = true; };
  }, []);

  // Render/update markers when places change.
  useEffect(() => {
    let cancelled = false;
    Promise.all([mapsLibPromise, markerLibPromise]).then(([_mapsLib, markerLib]) => {
      if (cancelled || !mapRef.current || !markerLib) return;

      const seen = new Set<string>();
      for (const place of places) {
        seen.add(place.id);
        const existing = markersRef.current.get(place.id);
        if (existing) {
          existing.position = { lat: place.lat, lng: place.lng };
        } else {
          const marker = new markerLib.AdvancedMarkerElement({
            map: mapRef.current,
            position: { lat: place.lat, lng: place.lng },
            content: buildDot(place.id === selectedId),
            title: place.name,
          });
          marker.addListener("click", () => onSelectRef.current(place.id));
          markersRef.current.set(place.id, marker);
        }
      }
      // Remove markers no longer in the set
      for (const [id, marker] of markersRef.current.entries()) {
        if (!seen.has(id)) {
          marker.map = null;
          markersRef.current.delete(id);
        }
      }

      // Fit bounds on first render with content
      if (!hasFitRef.current && places.length > 0 && mapRef.current) {
        if (places.length === 1) {
          mapRef.current.setCenter({ lat: places[0].lat, lng: places[0].lng });
          mapRef.current.setZoom(11);
        } else {
          const bounds = new google.maps.LatLngBounds();
          for (const p of places) bounds.extend({ lat: p.lat, lng: p.lng });
          mapRef.current.fitBounds(bounds, 64);
        }
        hasFitRef.current = true;
      }
    });
    return () => { cancelled = true; };
  }, [places, selectedId]);

  // Update marker styles when selection changes (no fit/rebind).
  useEffect(() => {
    for (const [id, marker] of markersRef.current.entries()) {
      marker.content = buildDot(id === selectedId);
    }
    // Pan to the newly selected place (without changing zoom).
    if (selectedId && mapRef.current) {
      const sel = places.find((p) => p.id === selectedId);
      if (sel) mapRef.current.panTo({ lat: sel.lat, lng: sel.lng });
    }
  }, [selectedId, places]);

  return (
    <Box sx={{ width: "100%", height: "100%", position: "relative" }}>
      <Box ref={containerRef} sx={{ width: "100%", height: "100%" }} />
      {loadError && (
        <Box
          sx={{
            position: "absolute",
            top: 0, left: 0, right: 0, bottom: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            bgcolor: "background.paper",
          }}
        >
          <Typography color="error.main" variant="body2">{loadError}</Typography>
        </Box>
      )}
      {!loadError && places.length === 0 && (
        <Box
          sx={{
            position: "absolute",
            top: 0, left: 0, right: 0, bottom: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            pointerEvents: "none",
          }}
        >
          <Typography variant="body2" color="text.secondary">
            No places yet. Add somewhere meaningful.
          </Typography>
        </Box>
      )}
    </Box>
  );
}
