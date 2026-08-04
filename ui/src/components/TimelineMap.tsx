import { useEffect, useMemo, useRef, useState } from "react";
import { Box, Typography } from "@mui/material";
import { setOptions, importLibrary } from "@googlemaps/js-api-loader";
import type { TimelineEvent, TimelineSeason, UserTimelineLine } from "./TimelineViz";

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

interface PinEntry {
  type: "event" | "season";
  id: string;
  title: string;
  dateLabel: string;
  color: string;
}

interface Pin {
  place_id: string;
  name: string;
  formatted_address: string;
  lat: number;
  lng: number;
  entries: PinEntry[];
}

interface TimelineMapProps {
  events: TimelineEvent[];
  seasons: TimelineSeason[];
  lines: UserTimelineLine[];
  onSelectEvent?: (eventId: string) => void;
  onSelectSeason?: (seasonId: string) => void;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso;
  }
}

export default function TimelineMap({
  events,
  seasons,
  lines,
  onSelectEvent,
  onSelectSeason,
}: TimelineMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
  const onSelectEventRef = useRef(onSelectEvent);
  const onSelectSeasonRef = useRef(onSelectSeason);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => { onSelectEventRef.current = onSelectEvent; }, [onSelectEvent]);
  useEffect(() => { onSelectSeasonRef.current = onSelectSeason; }, [onSelectSeason]);

  // Aggregate events + seasons into one pin per unique place_id.
  const pins: Pin[] = useMemo(() => {
    const lineColor = new Map(lines.map((l) => [l.id, l.color] as const));
    const byPlace = new Map<string, Pin>();
    const upsert = (p: Pin["entries"][number], place: {
      place_id: string; name: string; formatted_address: string; lat: number; lng: number;
    }) => {
      const existing = byPlace.get(place.place_id);
      if (existing) {
        existing.entries.push(p);
      } else {
        byPlace.set(place.place_id, {
          place_id: place.place_id,
          name: place.name,
          formatted_address: place.formatted_address,
          lat: place.lat,
          lng: place.lng,
          entries: [p],
        });
      }
    };
    for (const ev of events) {
      for (const place of ev.location_places ?? []) {
        upsert(
          {
            type: "event",
            id: ev.id,
            title: ev.title,
            dateLabel: ev.ended_at && ev.ended_at.slice(0, 10) !== ev.event_date.slice(0, 10)
              ? `${formatDate(ev.event_date)} – ${formatDate(ev.ended_at)}`
              : formatDate(ev.event_date),
            color: lineColor.get(ev.user_timeline_id) || "#1976d2",
          },
          place,
        );
      }
    }
    for (const s of seasons) {
      for (const place of s.location_places ?? []) {
        upsert(
          {
            type: "season",
            id: s.id,
            title: s.title,
            dateLabel: s.end_date
              ? `${formatDate(s.start_date)} – ${formatDate(s.end_date)}`
              : `since ${formatDate(s.start_date)}`,
            color: lineColor.get(s.user_timeline_id) || "#1976d2",
          },
          place,
        );
      }
    }
    return Array.from(byPlace.values());
  }, [events, seasons, lines]);

  // Initialize the map once.
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
        infoWindowRef.current = new mapsLib.InfoWindow();
      })
      .catch((e: unknown) => {
        setLoadError(e instanceof Error ? e.message : "Failed to load Maps");
      });
    return () => { cancelled = true; };
  }, []);

  // Render markers whenever pins change.
  useEffect(() => {
    let cancelled = false;
    Promise.all([mapsLibPromise, markerLibPromise]).then(([mapsLib, markerLib]) => {
      if (cancelled || !mapRef.current || !mapsLib || !markerLib) return;
      // Clear previous markers.
      for (const m of markersRef.current) m.map = null;
      markersRef.current = [];

      if (pins.length === 0) return;

      const bounds = new google.maps.LatLngBounds();
      for (const pin of pins) {
        const dotColor = pin.entries[0]?.color || "#1976d2";
        const dot = document.createElement("div");
        dot.style.width = "16px";
        dot.style.height = "16px";
        dot.style.borderRadius = "50%";
        dot.style.background = dotColor;
        dot.style.border = "2px solid white";
        dot.style.boxShadow = "0 1px 4px rgba(0,0,0,0.4)";
        dot.title = pin.name;

        const marker = new markerLib.AdvancedMarkerElement({
          map: mapRef.current,
          position: { lat: pin.lat, lng: pin.lng },
          content: dot,
          title: pin.name,
        });

        marker.addListener("click", () => {
          if (!infoWindowRef.current || !mapRef.current) return;
          infoWindowRef.current.setContent(renderInfoHtml(pin));
          infoWindowRef.current.open({ map: mapRef.current, anchor: marker });
          // Wire up clicks on the rendered links — InfoWindow content is regular DOM
          // once it's open, so we can query and bind after a microtask.
          queueMicrotask(() => {
            document.querySelectorAll<HTMLElement>(`[data-tlmap-edit]`).forEach((el) => {
              el.onclick = (ev) => {
                ev.preventDefault();
                const id = el.getAttribute("data-tlmap-edit") || "";
                const kind = el.getAttribute("data-tlmap-kind");
                if (kind === "season") onSelectSeasonRef.current?.(id);
                else onSelectEventRef.current?.(id);
                infoWindowRef.current?.close();
              };
            });
          });
        });

        markersRef.current.push(marker);
        bounds.extend({ lat: pin.lat, lng: pin.lng });
      }

      if (pins.length === 1) {
        mapRef.current.setCenter({ lat: pins[0].lat, lng: pins[0].lng });
        mapRef.current.setZoom(11);
      } else {
        mapRef.current.fitBounds(bounds, 64);
      }
    });
    return () => { cancelled = true; };
  }, [pins]);

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
      {!loadError && pins.length === 0 && (
        <Box
          sx={{
            position: "absolute",
            top: 0, left: 0, right: 0, bottom: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            pointerEvents: "none",
          }}
        >
          <Typography variant="body2" color="text.secondary">
            No events or seasons with locations yet.
          </Typography>
        </Box>
      )}
    </Box>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c] as string));
}

function renderInfoHtml(pin: Pin): string {
  const header = `
    <div style="font-weight:700;font-size:0.95rem;margin-bottom:4px;">${escapeHtml(pin.name)}</div>
    <div style="font-size:0.75rem;color:#666;margin-bottom:8px;">${escapeHtml(pin.formatted_address)}</div>
  `;
  const items = pin.entries
    .map((e) => `
      <div style="display:flex;align-items:center;gap:6px;padding:3px 0;">
        <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${e.color};flex-shrink:0;"></span>
        <a href="#" data-tlmap-edit="${escapeHtml(e.id)}" data-tlmap-kind="${e.type}" style="color:#1976d2;text-decoration:none;font-size:0.85rem;">
          <strong>${escapeHtml(e.title)}</strong>
          <span style="color:#666;font-weight:normal;"> · ${escapeHtml(e.dateLabel)}</span>
        </a>
      </div>
    `)
    .join("");
  return `<div style="min-width:220px;max-width:320px;">${header}${items}</div>`;
}
