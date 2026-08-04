import { forwardRef, useEffect, useImperativeHandle, useRef, useCallback } from "react";
import * as d3 from "d3";

export interface TimelineVizHandle {
  zoomTo: (start: Date, end: Date) => void;
}

// ── Types ──

export interface TimelineType {
  id: string;
  name: string;
  color: string | null;
  order: number;
}

export interface UserTimelineLine {
  id: string;
  timeline_type_id: string;
  label: string;
  color: string;
  start_date: string | null;
  end_date: string | null;
  visible: boolean;
  events_visible: boolean;
  order: number;
}

export interface MapLocation {
  provider: "google";
  place_id: string;
  name: string;
  formatted_address: string;
  lat: number;
  lng: number;
  types: string[];
}

export type EventKind = "moment" | "span" | "ongoing";

export interface TimelineEvent {
  id: string;
  user_timeline_id: string;
  title: string;
  event_date: string;
  ended_at?: string | null;
  kind?: EventKind | null;
  location_places?: MapLocation[];
}

/** Resolve an event's span kind, inferring from dates when `kind` is absent (legacy data). */
function resolveEventKind(ev: TimelineEvent): EventKind {
  if (ev.kind === "moment" || ev.kind === "span" || ev.kind === "ongoing") return ev.kind;
  if (ev.ended_at && ev.ended_at.slice(0, 10) !== ev.event_date.slice(0, 10)) return "span";
  return "moment";
}

export interface TimelineSeason {
  id: string;
  user_timeline_id: string;
  title: string;
  start_date: string;
  end_date: string | null;
  description?: string | null;
  location_places?: MapLocation[];
}

export interface TimelinePhoto {
  id: string;
  url: string;
  thumbnail_url?: string | null;
  taken_at: string; // ISO
  caption?: string | null;
  gps_lat?: number | null;
  gps_lng?: number | null;
}

interface TimelineVizProps {
  lines: UserTimelineLine[];
  events: TimelineEvent[];
  seasons: TimelineSeason[];
  photos?: TimelinePhoto[];
  showPhotos?: boolean;
  birthDate: string; // ISO date string
  onToggleVisible: (lineId: string, visible: boolean) => void;
  onToggleEventsVisible: (lineId: string, visible: boolean) => void;
  onEditEvent?: (event: TimelineEvent) => void;
  onEditSeason?: (season: TimelineSeason) => void;
  onEditLine?: (line: UserTimelineLine) => void;
  onClickEvent?: (event: TimelineEvent, clientX: number, clientY: number) => void;
  onClickSeason?: (season: TimelineSeason, clientX: number, clientY: number) => void;
  onClickPhoto?: (photo: TimelinePhoto, clientX: number, clientY: number) => void;
  onClickPhotoCluster?: (photos: TimelinePhoto[], clientX: number, clientY: number) => void;
  selectedEventId?: string | null;
  selectedSeasonId?: string | null;
}

const SIDEBAR_MIN_WIDTH = 40;
const SIDEBAR_PADDING = 68; // checkbox + eye icon + margins + left/right padding
const SIDEBAR_LEFT_PAD = 12;
const EVENT_TOP_PCT = 0.30;
const LINE_SPACING = 28;
const LINES_MIN_PAD = 20; // padding above first line + below last line
const FLAG_CIRCLE_R = 4;

const PHOTO_BAND_HEIGHT = 56; // px reserved at the top when photos are shown
const PHOTO_THUMB_SIZE = 40;
const PHOTO_THUMB_GAP = 4;

const TimelineViz = forwardRef<TimelineVizHandle, TimelineVizProps>(function TimelineViz({
  lines,
  events,
  seasons,
  photos,
  showPhotos,
  birthDate,
  onToggleVisible,
  onToggleEventsVisible,
  onEditEvent,
  onEditSeason,
  onEditLine,
  onClickEvent,
  onClickSeason,
  onClickPhoto,
  onClickPhotoCluster,
  selectedEventId,
  selectedSeasonId,
}, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const overlayRef = useRef<d3.Selection<SVGRectElement, unknown, null, undefined> | null>(null);
  const xScaleRef = useRef<d3.ScaleTime<number, number> | null>(null);
  const chartWidthRef = useRef<number>(0);

  const draw = useCallback(() => {
    const container = containerRef.current;
    const svgEl = svgRef.current;
    if (!container || !svgEl) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    const svg = d3.select(svgEl);
    svg.selectAll("*").remove();
    svg.attr("width", width).attr("height", height);

    // Measure longest label to size sidebar
    const measurer = svg.append("text").attr("font-size", 12).attr("font-weight", 500).attr("visibility", "hidden");
    let maxLabelWidth = 0;
    lines.forEach((l) => {
      measurer.text(l.label.length > 18 ? l.label.slice(0, 17) + "..." : l.label);
      const w = measurer.node()?.getComputedTextLength() || 0;
      if (w > maxLabelWidth) maxLabelWidth = w;
    });
    measurer.remove();

    const sidebarWidth = Math.max(SIDEBAR_MIN_WIDTH, Math.ceil(maxLabelWidth + SIDEBAR_PADDING));
    const CHART_PADDING = 20;
    const chartWidth = Math.max(0, width - sidebarWidth - CHART_PADDING * 2);

    const birth = d3.timeParse("%Y-%m-%d")(birthDate) || new Date(1990, 0, 1);
    const today = new Date();
    // Right-bound the domain a bit past today so forward-looking presets ("Next Week")
    // can map without clipping.
    const futurePad = new Date(today.getTime() + 365 * 24 * 60 * 60 * 1000);

    const xScale = d3.scaleTime().domain([birth, futurePad]).range([0, chartWidth]);
    xScaleRef.current = xScale;
    chartWidthRef.current = chartWidth;

    // Section boundaries — lines section grows with visible line count
    const photosBandActive = !!(showPhotos && photos && photos.length > 0);
    const photosBandTop = 0;
    const photosBandHeight = photosBandActive ? PHOTO_BAND_HEIGHT : 0;
    const photosBandBottom = photosBandTop + photosBandHeight;
    const eventsH = photosBandBottom + (height - photosBandBottom) * EVENT_TOP_PCT;
    const linesY = eventsH;
    const visibleLineCount = lines.filter((l) => l.visible).length;
    const linesH = Math.max(visibleLineCount * LINE_SPACING + LINES_MIN_PAD, height * 0.15);
    const seasonY = linesY + linesH;

    // ── Sidebar (fixed, not zoomable) ──
    const sidebar = svg.append("g").attr("class", "sidebar");

    // Background
    sidebar
      .append("rect")
      .attr("width", sidebarWidth)
      .attr("height", height)
      .attr("fill", "#fafafa")
      .attr("stroke", "#e0e0e0");

    const visibleLines = lines.filter((l) => l.visible);

    // Sidebar label for the photos band
    if (photosBandActive) {
      sidebar
        .append("text")
        .attr("x", SIDEBAR_LEFT_PAD)
        .attr("y", photosBandTop + photosBandHeight / 2 + 4)
        .attr("fill", "#666")
        .attr("font-size", 11)
        .attr("font-weight", 600)
        .text("Photos");
    }

    visibleLines.forEach((line, i) => {
      const y = linesY + 16 + i * LINE_SPACING;
      const g = sidebar.append("g").attr("transform", `translate(${SIDEBAR_LEFT_PAD}, ${y})`);

      // Checkbox (visibility toggle)
      const checkSize = 14;
      g.append("rect")
        .attr("width", checkSize)
        .attr("height", checkSize)
        .attr("rx", 2)
        .attr("fill", line.visible ? line.color : "#fff")
        .attr("stroke", line.color)
        .attr("stroke-width", 1.5)
        .attr("cursor", "pointer")
        .on("click", () => onToggleVisible(line.id, !line.visible));

      if (line.visible) {
        g.append("text")
          .attr("x", checkSize / 2)
          .attr("y", checkSize - 2)
          .attr("text-anchor", "middle")
          .attr("fill", "#fff")
          .attr("font-size", 11)
          .attr("font-weight", "bold")
          .attr("pointer-events", "none")
          .text("\u2713");
      }

      // Eye icon (events visibility toggle)
      const eyeX = checkSize + 8;
      g.append("text")
        .attr("x", eyeX)
        .attr("y", checkSize - 2)
        .attr("fill", line.events_visible ? line.color : "#bbb")
        .attr("font-size", 13)
        .attr("cursor", "pointer")
        .text(line.events_visible ? "\uD83D\uDC41" : "\u25CB")
        .on("click", () => onToggleEventsVisible(line.id, !line.events_visible));

      // Label
      g.append("text")
        .attr("x", eyeX + 22)
        .attr("y", checkSize - 2)
        .attr("fill", line.color)
        .attr("font-size", 12)
        .attr("font-weight", 500)
        .attr("cursor", "pointer")
        .text(line.label.length > 18 ? line.label.slice(0, 17) + "..." : line.label)
        .on("dblclick", () => onEditLine?.(line));
    });

    // Also show hidden lines in sidebar (dimmed, just checkbox)
    const hiddenLines = lines.filter((l) => !l.visible);
    const hiddenStartY = linesY + 16 + visibleLines.length * LINE_SPACING + 10;
    hiddenLines.forEach((line, i) => {
      const y = hiddenStartY + i * LINE_SPACING;
      const g = sidebar.append("g").attr("transform", `translate(${SIDEBAR_LEFT_PAD}, ${y})`);

      const checkSize = 14;
      g.append("rect")
        .attr("width", checkSize)
        .attr("height", checkSize)
        .attr("rx", 2)
        .attr("fill", "#fff")
        .attr("stroke", "#ccc")
        .attr("stroke-width", 1)
        .attr("cursor", "pointer")
        .on("click", () => onToggleVisible(line.id, true));

      g.append("text")
        .attr("x", checkSize + 30)
        .attr("y", checkSize - 2)
        .attr("fill", "#bbb")
        .attr("font-size", 12)
        .text(line.label.length > 18 ? line.label.slice(0, 17) + "..." : line.label);
    });

    // ── Chart area (zoomable) ──
    svg
      .append("defs")
      .append("clipPath")
      .attr("id", "chart-clip")
      .append("rect")
      .attr("x", 0)
      .attr("y", 0)
      .attr("width", chartWidth)
      .attr("height", height);

    const chartArea = svg
      .append("g")
      .attr("transform", `translate(${sidebarWidth + CHART_PADDING}, 0)`)
      .attr("clip-path", "url(#chart-clip)");

    // Section dividers
    chartArea
      .append("line")
      .attr("x1", 0).attr("x2", chartWidth)
      .attr("y1", linesY).attr("y2", linesY)
      .attr("stroke", "#e0e0e0").attr("stroke-dasharray", "4,4");

    chartArea
      .append("line")
      .attr("x1", 0).attr("x2", chartWidth)
      .attr("y1", seasonY).attr("y2", seasonY)
      .attr("stroke", "#e0e0e0").attr("stroke-dasharray", "4,4");

    // Divider under the photos band (only if the band is active)
    if (photosBandActive) {
      chartArea
        .append("line")
        .attr("x1", 0).attr("x2", chartWidth)
        .attr("y1", photosBandBottom).attr("y2", photosBandBottom)
        .attr("stroke", "#e0e0e0").attr("stroke-dasharray", "4,4");
    }

    // Overlay for zoom — must be BEFORE content so content elements receive dblclick
    const overlay = chartArea
      .append("rect")
      .attr("width", chartWidth)
      .attr("height", height)
      .attr("fill", "transparent")
      .attr("cursor", "grab");

    const content = chartArea.append("g").attr("class", "zoomable");

    function renderContent(transform: d3.ZoomTransform) {
      content.selectAll("*").remove();

      const newX = transform.rescaleX(xScale);

      // ── Time axis at bottom of lines section ──
      const axisG = content
        .append("g")
        .attr("transform", `translate(0, ${seasonY - 2})`);

      const axisFn = d3
        .axisBottom(newX)
        .ticks(Math.max(4, Math.floor(chartWidth / 120)))
        .tickSizeOuter(0);

      axisG.call(axisFn);
      axisG.selectAll("text").attr("fill", "#666").attr("font-size", 10);
      axisG.selectAll("line").attr("stroke", "#ccc");
      axisG.select(".domain").attr("stroke", "#ccc");

      // ── Photos band (top strip) ────────────────────────────────────
      if (photosBandActive && photos) {
        interface PhotoPos { photo: TimelinePhoto; x: number; }
        const positioned: PhotoPos[] = [];
        photos.forEach((p) => {
          const d = new Date(p.taken_at);
          if (isNaN(d.getTime())) return;
          const x = newX(d);
          if (x < -PHOTO_THUMB_SIZE || x > chartWidth + PHOTO_THUMB_SIZE) return;
          positioned.push({ photo: p, x });
        });
        positioned.sort((a, b) => a.x - b.x);

        // Cluster: any run of thumbs whose left edges are closer than the thumb+gap width become one bubble.
        interface Cluster { xCenter: number; items: PhotoPos[]; }
        const clusters: Cluster[] = [];
        const step = PHOTO_THUMB_SIZE + PHOTO_THUMB_GAP;
        positioned.forEach((pp) => {
          const last = clusters[clusters.length - 1];
          if (last && pp.x - last.items[last.items.length - 1].x < step) {
            last.items.push(pp);
            last.xCenter = last.items.reduce((s, i) => s + i.x, 0) / last.items.length;
          } else {
            clusters.push({ xCenter: pp.x, items: [pp] });
          }
        });

        const bandCenter = photosBandTop + photosBandHeight / 2;
        const halfThumb = PHOTO_THUMB_SIZE / 2;

        clusters.forEach((c) => {
          const g = content.append("g").attr("class", "photo-thumb").style("cursor", "pointer");
          const cx = c.xCenter;
          const cy = bandCenter;
          if (c.items.length === 1) {
            const p = c.items[0].photo;
            const src = p.thumbnail_url || p.url;
            g.append("clipPath")
              .attr("id", `photo-clip-${p.id}`)
              .append("rect")
              .attr("x", cx - halfThumb)
              .attr("y", cy - halfThumb)
              .attr("width", PHOTO_THUMB_SIZE)
              .attr("height", PHOTO_THUMB_SIZE)
              .attr("rx", 4);
            g.append("image")
              .attr("href", src)
              .attr("x", cx - halfThumb)
              .attr("y", cy - halfThumb)
              .attr("width", PHOTO_THUMB_SIZE)
              .attr("height", PHOTO_THUMB_SIZE)
              .attr("preserveAspectRatio", "xMidYMid slice")
              .attr("clip-path", `url(#photo-clip-${p.id})`);
            g.append("rect")
              .attr("x", cx - halfThumb)
              .attr("y", cy - halfThumb)
              .attr("width", PHOTO_THUMB_SIZE)
              .attr("height", PHOTO_THUMB_SIZE)
              .attr("rx", 4)
              .attr("fill", "none")
              .attr("stroke", "#fff")
              .attr("stroke-width", 1.5);
            g.on("click", (event: MouseEvent) => {
              event.stopPropagation();
              onClickPhoto?.(p, event.clientX, event.clientY);
            });
          } else {
            // Cluster bubble: show first photo as background + count badge
            const p = c.items[0].photo;
            const src = p.thumbnail_url || p.url;
            g.append("clipPath")
              .attr("id", `photo-cluster-clip-${cx}`)
              .append("rect")
              .attr("x", cx - halfThumb)
              .attr("y", cy - halfThumb)
              .attr("width", PHOTO_THUMB_SIZE)
              .attr("height", PHOTO_THUMB_SIZE)
              .attr("rx", 4);
            g.append("image")
              .attr("href", src)
              .attr("x", cx - halfThumb)
              .attr("y", cy - halfThumb)
              .attr("width", PHOTO_THUMB_SIZE)
              .attr("height", PHOTO_THUMB_SIZE)
              .attr("preserveAspectRatio", "xMidYMid slice")
              .attr("clip-path", `url(#photo-cluster-clip-${cx})`)
              .attr("opacity", 0.6);
            g.append("rect")
              .attr("x", cx - halfThumb)
              .attr("y", cy - halfThumb)
              .attr("width", PHOTO_THUMB_SIZE)
              .attr("height", PHOTO_THUMB_SIZE)
              .attr("rx", 4)
              .attr("fill", "rgba(0,0,0,0.35)");
            g.append("text")
              .attr("x", cx)
              .attr("y", cy + 5)
              .attr("text-anchor", "middle")
              .attr("fill", "#fff")
              .attr("font-size", 14)
              .attr("font-weight", 700)
              .attr("pointer-events", "none")
              .text(`+${c.items.length}`);
            g.on("click", (event: MouseEvent) => {
              event.stopPropagation();
              onClickPhotoCluster?.(c.items.map((i) => i.photo), event.clientX, event.clientY);
            });
          }
        });
      }

      // Which timeline-line is "selected" by virtue of containing the selected event or season?
      const activeLineId = (() => {
        if (selectedEventId) {
          const ev = events.find((e) => e.id === selectedEventId);
          if (ev) return ev.user_timeline_id;
        }
        if (selectedSeasonId) {
          const s = seasons.find((s) => s.id === selectedSeasonId);
          if (s) return s.user_timeline_id;
        }
        return null;
      })();

      // ── Horizontal lines ──
      visibleLines.forEach((line, i) => {
        const y = linesY + 16 + i * LINE_SPACING;
        const lineStart = line.start_date ? d3.timeParse("%Y-%m-%d")(line.start_date) || birth : birth;
        const lineEnd = line.end_date ? d3.timeParse("%Y-%m-%d")(line.end_date) || today : today;
        const isActive = line.id === activeLineId;
        content
          .append("line")
          .attr("x1", newX(lineStart))
          .attr("x2", newX(lineEnd))
          .attr("y1", y)
          .attr("y2", y)
          .attr("stroke", line.color)
          .attr("stroke-width", isActive ? 3.5 : 2)
          .attr("opacity", isActive ? 1 : 0.7);
      });

      // ── Point-in-time events (top section) ──
      const eventBoxHeight = 22;
      const eventBoxGap = 4;

      // Pass 1: collect moment boxes. Spans/ongoing render below (with seasons).
      interface EvBox { ev: typeof events[0]; line: typeof visibleLines[0]; lineY: number; x: number; label: string; w: number; boxX: number; boxY: number; }
      const evBoxes: EvBox[] = [];

      visibleLines.forEach((line, i) => {
        if (!line.events_visible) return;
        const lineY = linesY + 16 + i * LINE_SPACING;
        events
          .filter((e) => e.user_timeline_id === line.id)
          .forEach((ev) => {
            if (resolveEventKind(ev) !== "moment") return; // spans/ongoing render in the bottom section
            const d = d3.timeParse("%Y-%m-%d")(ev.event_date.slice(0, 10));
            if (!d) return;
            const x = newX(d);
            if (x < 0 || x > chartWidth) return;
            const label = ev.title.length > 20 ? ev.title.slice(0, 19) + "..." : ev.title;
            const w = label.length * 6 + 16;
            evBoxes.push({ ev, line, lineY, x, label, w, boxX: x, boxY: eventsH - 28 });
          });
      });

      // Sort by x so we process left-to-right
      evBoxes.sort((a, b) => a.x - b.x);

      // Pass 2: bump overlapping boxes upward, re-check after each bump
      for (let i = 0; i < evBoxes.length; i++) {
        let bumped = true;
        while (bumped) {
          bumped = false;
          for (let j = 0; j < evBoxes.length; j++) {
            if (j === i) continue;
            const a = evBoxes[j], b = evBoxes[i];
            const overlapX = a.boxX + a.w > b.boxX && b.boxX + b.w > a.boxX;
            const overlapY = a.boxY + eventBoxHeight + eventBoxGap > b.boxY && b.boxY + eventBoxHeight + eventBoxGap > a.boxY;
            if (overlapX && overlapY) {
              b.boxY = a.boxY - eventBoxHeight - eventBoxGap;
              bumped = true;
            }
          }
        }
      }

      // Pass 3: render connectors first (behind), then boxes on top
      evBoxes.forEach(({ ev, line, lineY, x, boxY }) => {
        const isSelected = ev.id === selectedEventId;
        const connector = content
          .append("line")
          .attr("x1", x).attr("x2", x)
          .attr("y1", boxY + eventBoxHeight).attr("y2", lineY)
          .attr("stroke", line.color)
          .attr("stroke-width", isSelected ? 2 : 1)
          .attr("opacity", isSelected ? 1 : 0.5);
        if (!isSelected) connector.attr("stroke-dasharray", "2,2");

        content
          .append("circle")
          .attr("cx", x)
          .attr("cy", lineY)
          .attr("r", isSelected ? FLAG_CIRCLE_R + 2 : FLAG_CIRCLE_R)
          .attr("fill", line.color);
      });

      // Boxes + labels on top
      evBoxes.forEach(({ ev, line, label, w, boxX, boxY }) => {
        const isSelected = ev.id === selectedEventId;
        // Click vs dblclick disambiguation — a short delay before firing the
        // single-click handler, cancelled if a dblclick lands first.
        let pendingClick: ReturnType<typeof setTimeout> | null = null;
        const handleClick = (e: MouseEvent) => {
          e.stopPropagation();
          if (pendingClick) {
            clearTimeout(pendingClick);
            pendingClick = null;
            return;
          }
          const x = e.clientX;
          const y = e.clientY;
          pendingClick = setTimeout(() => {
            pendingClick = null;
            onClickEvent?.(ev, x, y);
          }, 220);
        };
        const handleDblClick = (e: MouseEvent) => {
          e.stopPropagation();
          if (pendingClick) {
            clearTimeout(pendingClick);
            pendingClick = null;
          }
          onEditEvent?.(ev);
        };

        content
          .append("rect")
          .attr("x", boxX)
          .attr("y", boxY)
          .attr("width", w)
          .attr("height", eventBoxHeight)
          .attr("rx", 4)
          .attr("fill", isSelected ? `${line.color}1A` : "#fff")
          .attr("stroke", line.color)
          .attr("stroke-width", isSelected ? 2.25 : 1)
          .attr("cursor", "pointer")
          .on("click", handleClick)
          .on("dblclick", handleDblClick);

        content
          .append("text")
          .attr("x", boxX + 8)
          .attr("y", boxY + eventBoxHeight / 2 + 4)
          .attr("fill", line.color)
          .attr("font-size", 10)
          .attr("font-weight", isSelected ? 700 : 500)
          .attr("pointer-events", "none")
          .text(label);
      });

      // ── Bottom section: ranged items (seasons + span/ongoing events) ──
      // Both render as a bar on the line with a label box below, deconflicted together.
      const rangedBoxHeight = 24;
      const rangedBoxPadding = 6;
      const rangedTopOffset = 18;
      const BAR_HEIGHT = 8;

      interface RangedBox {
        kind: "season" | "event";
        id: string;
        title: string;
        season?: typeof seasons[0];
        event?: typeof events[0];
        line: typeof visibleLines[0];
        lineY: number;
        barX: number;
        barW: number;
        connectorX: number;
        boxY: number;
        textLen: number;
      }
      const rangedBoxes: RangedBox[] = [];

      visibleLines.forEach((line, i) => {
        if (!line.events_visible) return;
        const lineY = linesY + 16 + i * LINE_SPACING;
        const boxY0 = seasonY + rangedTopOffset;

        // Seasons
        seasons
          .filter((s) => s.user_timeline_id === line.id)
          .forEach((s) => {
            const startD = d3.timeParse("%Y-%m-%d")(s.start_date);
            if (!startD) return;
            const endD = s.end_date ? d3.timeParse("%Y-%m-%d")(s.end_date) : today;
            if (!endD) return;
            const x1 = newX(startD), x2 = newX(endD);
            if (x2 < 0 || x1 > chartWidth) return;
            rangedBoxes.push({
              kind: "season", id: s.id, title: s.title, season: s, line, lineY,
              barX: Math.max(x1, 0), barW: Math.min(Math.max(x2 - x1, 2), chartWidth),
              connectorX: Math.max(x1, 0), boxY: boxY0, textLen: s.title.length * 6.5 + 16,
            });
          });

        // Span / ongoing events (moments render in the top section)
        events
          .filter((e) => e.user_timeline_id === line.id)
          .forEach((ev) => {
            const kind = resolveEventKind(ev);
            if (kind === "moment") return;
            const startD = d3.timeParse("%Y-%m-%d")(ev.event_date.slice(0, 10));
            if (!startD) return;
            const endD = kind === "ongoing"
              ? today
              : (ev.ended_at ? d3.timeParse("%Y-%m-%d")(ev.ended_at.slice(0, 10)) : null);
            if (!endD) return;
            const x1 = newX(startD), x2 = newX(endD);
            if (x2 < 0 || x1 > chartWidth) return;
            rangedBoxes.push({
              kind: "event", id: ev.id, title: ev.title, event: ev, line, lineY,
              barX: Math.max(x1, 0), barW: Math.min(Math.max(x2 - x1, 2), chartWidth),
              connectorX: Math.max(x1, 0), boxY: boxY0, textLen: ev.title.length * 6.5 + 16,
            });
          });
      });

      // Sort by X then deconflict: bump down when boxes overlap, re-check after each bump
      rangedBoxes.sort((a, b) => a.connectorX - b.connectorX);
      for (let i = 0; i < rangedBoxes.length; i++) {
        let bumped = true;
        while (bumped) {
          bumped = false;
          for (let j = 0; j < rangedBoxes.length; j++) {
            if (j === i) continue;
            const a = rangedBoxes[j], b = rangedBoxes[i];
            const overlapX = a.connectorX + a.textLen > b.connectorX && b.connectorX + b.textLen > a.connectorX;
            const overlapY = a.boxY + rangedBoxHeight + rangedBoxPadding > b.boxY && b.boxY + rangedBoxHeight + rangedBoxPadding > a.boxY;
            if (overlapX && overlapY) {
              b.boxY = a.boxY + rangedBoxHeight + rangedBoxPadding;
              bumped = true;
            }
          }
        }
      }

      const isRangedSelected = (b: RangedBox) =>
        b.kind === "season" ? b.id === selectedSeasonId : b.id === selectedEventId;

      // Render bars + connectors first
      rangedBoxes.forEach((b) => {
        const { line, lineY, barX, barW, connectorX, boxY, kind } = b;
        const isSelected = isRangedSelected(b);
        // Span/ongoing events read slightly stronger than seasons (background chapters).
        const fillOpacity = kind === "event" ? (isSelected ? 0.8 : 0.5) : (isSelected ? 0.7 : 0.35);
        content.append("rect")
          .attr("x", barX).attr("y", lineY - BAR_HEIGHT / 2)
          .attr("width", barW).attr("height", BAR_HEIGHT)
          .attr("rx", 3).attr("fill", line.color).attr("opacity", fillOpacity);
        content.append("rect")
          .attr("x", barX).attr("y", lineY - BAR_HEIGHT / 2)
          .attr("width", barW).attr("height", BAR_HEIGHT)
          .attr("rx", 3).attr("fill", "none").attr("stroke", line.color)
          .attr("stroke-width", isSelected ? 2 : 1);
        const connector = content.append("line")
          .attr("x1", connectorX).attr("x2", connectorX)
          .attr("y1", lineY + BAR_HEIGHT / 2).attr("y2", boxY)
          .attr("stroke", line.color)
          .attr("stroke-width", isSelected ? 2 : 1)
          .attr("opacity", isSelected ? 1 : 0.5);
        if (!isSelected) connector.attr("stroke-dasharray", "3,2");
      });

      // Render boxes + labels on top
      rangedBoxes.forEach((b) => {
        const { line, connectorX, boxY, textLen, title, kind, season, event } = b;
        const isSelected = isRangedSelected(b);
        let pendingClick: ReturnType<typeof setTimeout> | null = null;
        const onBoxClick = (e: MouseEvent) => {
          e.stopPropagation();
          if (pendingClick) {
            clearTimeout(pendingClick);
            pendingClick = null;
            return;
          }
          const x = e.clientX;
          const y = e.clientY;
          pendingClick = setTimeout(() => {
            pendingClick = null;
            if (kind === "season" && season) onClickSeason?.(season, x, y);
            else if (kind === "event" && event) onClickEvent?.(event, x, y);
          }, 220);
        };
        const onBoxDblClick = (e: MouseEvent) => {
          e.stopPropagation();
          if (pendingClick) {
            clearTimeout(pendingClick);
            pendingClick = null;
          }
          if (kind === "season" && season) onEditSeason?.(season);
          else if (kind === "event" && event) onEditEvent?.(event);
        };

        content.append("rect")
          .attr("x", connectorX).attr("y", boxY)
          .attr("width", textLen).attr("height", rangedBoxHeight)
          .attr("rx", 4)
          .attr("fill", isSelected ? `${line.color}1A` : "#fff")
          .attr("stroke", line.color)
          .attr("stroke-width", isSelected ? 2.25 : 1)
          .attr("cursor", "pointer")
          .on("click", onBoxClick)
          .on("dblclick", onBoxDblClick);
        content.append("text")
          .attr("x", connectorX + 8).attr("y", boxY + rangedBoxHeight / 2 + 4)
          .attr("fill", line.color).attr("font-size", 11)
          .attr("font-weight", isSelected ? 700 : 500)
          .attr("pointer-events", "none").text(title);
      });
    }

    // ── Zoom behavior ──
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 200])
      .translateExtent([
        [0, 0],
        [chartWidth, height],
      ])
      .extent([
        [0, 0],
        [chartWidth, height],
      ])
      .on("zoom", (event) => {
        renderContent(event.transform);
      });

    zoomRef.current = zoom;
    overlayRef.current = overlay;

    overlay.call(zoom as any).on("dblclick.zoom", null);

    // Initial render
    renderContent(d3.zoomIdentity);
  }, [lines, events, seasons, birthDate, onToggleVisible, onToggleEventsVisible, onEditEvent, onEditSeason, onEditLine, onClickEvent, onClickSeason, selectedEventId, selectedSeasonId]);

  useEffect(() => {
    draw();
    const handleResize = () => draw();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [draw]);

  useImperativeHandle(ref, () => ({
    zoomTo: (start: Date, end: Date) => {
      const xScale = xScaleRef.current;
      const zoom = zoomRef.current;
      const overlay = overlayRef.current;
      const chartWidth = chartWidthRef.current;
      if (!xScale || !zoom || !overlay || !chartWidth) return;
      const [domainStart, domainEnd] = xScale.domain();
      const s = start < domainStart ? domainStart : start > domainEnd ? domainEnd : start;
      const e = end < domainStart ? domainStart : end > domainEnd ? domainEnd : end;
      const x0 = xScale(s);
      const x1 = xScale(e);
      const span = x1 - x0;
      if (span <= 0) return;
      const k = chartWidth / span;
      const tx = -x0 * k;
      const t = d3.zoomIdentity.translate(tx, 0).scale(k);
      overlay.transition().duration(450).call(zoom.transform as any, t);
    },
  }), []);

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "100%", overflow: "hidden", position: "relative" }}
    >
      <svg ref={svgRef} style={{ display: "block" }} />
    </div>
  );
});

export default TimelineViz;
