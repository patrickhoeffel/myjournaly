"""Photo → event association scoring.

The heart of the "magic" photo-linking feature: given a photo (a moment in
time, sometimes with a GPS fix) and a set of events (each a point or a span in
time, sometimes with pinned locations), decide which events the photo most
likely belongs to, and how confident we are.

This module is deliberately PURE — it takes plain dataclasses (not Firestore
docs or pydantic models) and returns plain dataclasses. That keeps the scoring
logic:
  * unit-testable with synthetic data (no Firestore, no credentials), and
  * decoupled from the Photo/Event models (which are under active development).

The I/O — loading real photos/events and writing Link records — lives elsewhere
(the dry-run script today; the association engine later). This module never
touches the database.

See docs/photo-associations.md for the design rationale.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Iterable

# ── Tunable parameters ─────────────────────────────────────────────────────
# These are the knobs the dry run exists to calibrate. Start conservative.

AUTO_THRESHOLD = 0.80      # confidence at/above which a link would be applied silently
SUGGEST_THRESHOLD = 0.50   # confidence at/above which a link would be proposed to the user

TIME_TAU_HOURS = 12.0      # exponential falloff constant for time OUTSIDE an event's range
GEO_STRONG_METERS = 150.0  # within this distance of a pinned place → full geo score
GEO_ZERO_METERS = 15000.0  # beyond this distance → geo score of 0

EARTH_RADIUS_M = 6_371_000.0


# ── Inputs / outputs ───────────────────────────────────────────────────────


@dataclass(frozen=True)
class PhotoPoint:
    """The only bits of a photo the scorer cares about."""

    id: str
    taken_at: datetime | None
    lat: float | None = None
    lng: float | None = None
    caption: str | None = None


@dataclass(frozen=True)
class EventSpan:
    """The only bits of an event the scorer cares about.

    `places` is a tuple of (lat, lng) pairs — an event can be pinned to more
    than one location, and we score against the nearest.
    """

    id: str
    title: str
    began_at: datetime | None
    ended_at: datetime | None
    kind: str | None = None  # "moment" | "span" | "ongoing"
    places: tuple[tuple[float, float], ...] = ()


@dataclass(frozen=True)
class Candidate:
    """A scored photo↔event pairing the engine would (or wouldn't) act on."""

    photo_id: str
    event_id: str
    event_title: str
    time_score: float
    geo_score: float | None      # None when the pair can't be scored on geo
    confidence: float
    tier: str                    # "auto" | "proposed" | "none"
    signal: str                  # "time+geo" | "time" | "geo"


# ── Geometry & time helpers ────────────────────────────────────────────────


def haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Great-circle distance between two lat/lng points, in metres."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_RADIUS_M * math.asin(min(1.0, math.sqrt(a)))


def _as_utc(dt: datetime | None) -> datetime | None:
    """Normalize to a timezone-aware UTC datetime.

    Photo `taken_at` preserves the camera's offset; event dates are often naive
    (date-only). Treat naive values as UTC so the two can be compared without
    raising — precise enough for calibration, and documented as a known
    simplification in the design doc.
    """
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


# ── Individual signals ─────────────────────────────────────────────────────


def time_score(
    taken_at: datetime | None,
    began_at: datetime | None,
    ended_at: datetime | None,
    kind: str | None = None,  # reserved: lets us widen/tighten falloff per kind later
) -> float:
    """1.0 when the photo falls inside the event's time range, decaying
    exponentially the further outside it lands. A moment event (began==ended)
    is just a zero-width range, so the same falloff applies on both sides."""
    p = _as_utc(taken_at)
    start = _as_utc(began_at)
    if p is None or start is None:
        return 0.0
    end = _as_utc(ended_at) or start
    if end < start:
        start, end = end, start
    if start <= p <= end:
        return 1.0
    gap_hours = ((start - p) if p < start else (p - end)).total_seconds() / 3600.0
    return math.exp(-gap_hours / TIME_TAU_HOURS)


def geo_score(
    lat: float | None,
    lng: float | None,
    places: Iterable[tuple[float, float]],
) -> float | None:
    """Score by distance to the NEAREST pinned place. Returns None (not 0.0)
    when the pair simply can't be judged on location — the photo has no GPS or
    the event has no pinned place. None and 0.0 mean different things: "unknown"
    vs "known to be far away."""
    places = tuple(places)
    if lat is None or lng is None or not places:
        return None
    nearest = min(haversine_m(lat, lng, pl_lat, pl_lng) for pl_lat, pl_lng in places)
    if nearest <= GEO_STRONG_METERS:
        return 1.0
    if nearest >= GEO_ZERO_METERS:
        return 0.0
    span = GEO_ZERO_METERS - GEO_STRONG_METERS
    return max(0.0, 1.0 - (nearest - GEO_STRONG_METERS) / span)


# ── Combination & classification ───────────────────────────────────────────


def combine(time_s: float, geo_s: float | None) -> float:
    """Fuse the time and geo signals into a single confidence.

    Design intent (see doc; calibrated against real data):
      * Time is the primary signal. A photo squarely inside an event's span
        reaches AUTO on time alone, with or without GPS.
      * Geo is CORROBORATION ONLY — it can lift a plausible time match, but it
        never penalizes one. Events are pinned to a single point while real
        activity (a getaway) spreads across miles, so "far from the pin" is a
        weak signal for "wrong event"; subtracting for it mislabels ordinary
        trip photos.
      * Geo can't manufacture a match on its own. Location repeats (home); time
        doesn't. So when the time signal is below the suggest floor, geo is
        ignored entirely — a same-place/wrong-time photo simply drops out.
    """
    if geo_s is None or time_s < SUGGEST_THRESHOLD:
        return time_s
    # Geo lifts within the remaining headroom — additive, bounded, saturating.
    # At time_s == 1.0 the boost is 0 (already maxed), so geo can only ever help.
    return min(1.0, time_s + 0.30 * geo_s * (1.0 - time_s))


def tier_for(confidence: float) -> str:
    if confidence >= AUTO_THRESHOLD:
        return "auto"
    if confidence >= SUGGEST_THRESHOLD:
        return "proposed"
    return "none"


def signal_for(time_s: float, geo_s: float | None) -> str:
    has_geo = geo_s is not None and geo_s >= 0.5
    has_time = time_s >= 0.5
    if has_geo and has_time:
        return "time+geo"
    if has_geo:
        return "geo"
    return "time"


def score_photo(photo: PhotoPoint, events: Iterable[EventSpan], *, limit: int = 3) -> list[Candidate]:
    """Score one photo against every event, returning the best `limit`
    candidates (tier != "none") sorted by confidence, highest first."""
    candidates: list[Candidate] = []
    for ev in events:
        t = time_score(photo.taken_at, ev.began_at, ev.ended_at, ev.kind)
        g = geo_score(photo.lat, photo.lng, ev.places)
        conf = combine(t, g)
        tier = tier_for(conf)
        if tier == "none":
            continue
        candidates.append(
            Candidate(
                photo_id=photo.id,
                event_id=ev.id,
                event_title=ev.title,
                time_score=round(t, 3),
                geo_score=(round(g, 3) if g is not None else None),
                confidence=round(conf, 3),
                tier=tier,
                signal=signal_for(t, g),
            )
        )
    candidates.sort(key=lambda c: c.confidence, reverse=True)
    return candidates[:limit]
