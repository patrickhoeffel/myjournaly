# Automatic Photo Associations

**Status:** design + Phase 0 started (this branch)
**Goal:** When a user adds photos, they should *automatically* weave themselves
into the story — linked to the events and journal entries they belong to, and
even proposing new timeline chapters — with the human only ever confirming or
undoing, never doing the filing.

---

## Why this is mostly a scoring problem, not a plumbing problem

The data model is already built for this:

- **`Photo`** carries the two signals automation needs: `taken_at` (EXIF,
  timezone-preserved) and `gps_lat`/`gps_lng`, plus a free-form `exif` blob.
  Its docstring already anticipates linking "to other entities (events, people,
  places, journal entries) via the Links system."
- **`Link`** is a universal graph edge that already has exactly the fields an
  automated matcher wants: `link_strength`, `link_source` ("how did I arrive at
  this connection"), `link_source_confidence`, `valid_begin_date`/
  `valid_end_date`, and soft-delete. `PHOTO` is already a `LinkEntityType`.
- **`Event`** has a time range (`began_at`/`ended_at`/`kind`) *and* geo
  (`location_places[]` with lat/lng) — the two axes to match on.

So the graph edges, the API (`/links`), and the read-side hook
(`useEntityLinks`) already exist. The new work is: a **scoring engine**, a few
**triggers**, and **UX to confirm** — plus one small schema addition (below).

---

## Core model: a confidence-scored association engine

One pure function scores a photo against candidate events and yields, for each
plausible pairing, a **confidence** and a **provenance**. The engine then acts
by confidence tier:

| Combined confidence | Action | `Link.status` |
|---|---|---|
| ≥ `AUTO_THRESHOLD` (0.70) | Applied silently (visible + one-tap undo) | `auto` |
| ≥ `SUGGEST_THRESHOLD` (0.50) | Proposed for one-tap confirm | `proposed` |
| below | Dropped | — |

### Signals (cheap → deep)

1. **Time** — `photo.taken_at` vs an event's `[began_at, ended_at]`. Inside the
   range → 1.0; outside → exponential falloff over hours. Moment events are a
   zero-width range, so the same math covers them. **Works with no GPS at all**,
   which matters because screenshots and older photos often lack it.
2. **Geo** — haversine from the photo to the *nearest* pinned
   `location_place`. ≤150 m → 1.0; decays to 0 by ~15 km. Returns *unknown*
   (not 0) when either side lacks coordinates — "can't tell" ≠ "far away."
3. **Content (AI vision)** — Phase 3. Claude vision → scene/landmark/text →
   Place and semantic matches. Deferred deliberately.

### Combining them

- **Time-only is first-class:** a photo squarely inside an event's span reaches
  `auto` with no GPS (the honeymoon-photos case).
- **Geo agreeing** corroborates and can only help.
- **Geo disagreeing** (photo far from the pinned place) tempers confidence — but
  a strong time match keeps a loud voice, so *adding* a far GPS reading never
  sharply drops a confident time match; it just moves it from `auto` to
  `proposed` for a human glance.

The exact formula and all thresholds live in
[`api/app/services/associations.py`](../api/app/services/associations.py) and
are meant to be tuned — see the dry run below.

---

## What a photo→event `Link` contains

Every field already exists except `status`:

```
from_type = "photo",  from_id = <photo>,  from_name = caption or filename
to_type   = "event",  to_id   = <event>,  to_name   = event.title
link_type = "temporal"          # or "association" for geo/vision-driven
link_strength          = combined confidence (0–1)
link_source            = "auto:time+geo" | "auto:time" | "auto:geo" | "cluster" | "auto:vision"
link_source_confidence = combined confidence
valid_begin_date = valid_end_date = photo.taken_at   # a photo is a moment
status                 = auto | proposed             # ← the one new field
```

### The one schema addition: `Link.status`

`LinkStatus = confirmed | auto | proposed | rejected`, defaulting to
**`confirmed`** so every pre-existing and hand-made link reads as user-asserted
and nothing changes for existing data. The engine sets `auto`/`proposed`.
**`rejected` is a tombstone** — when a user dismisses a suggestion we keep the
link with `status=rejected` so the same pairing is never proposed again.
(Implemented on this branch.)

---

## "Maximally automatic": when it runs

- **On upload** — score the new photo against events/journal entries in a
  bounded time window around `taken_at` (a Firestore range query keeps the
  candidate set tiny). Auto-link or stage suggestions immediately.
- **On event create/edit** — re-scan photos in that event's time (and geo)
  window. Add "Honeymoon" as a *While* and the photos from those dates light up
  retroactively.
- **Backfill** — one idempotent pass over the existing photo library.
- **Idempotency** — always check for an existing photo→event link (any status)
  before writing, so re-runs never duplicate and never re-propose a rejection.

Compute lives in `app/services/associations.py` (pure) with I/O adapters around
it. The vision path (Phase 3) runs async so uploads stay fast.

---

## Creating timeline events *from* photos

For photos matching no existing event — the answer to "how do we create events
to connect to pictures," and the piece that ties into the **While** event type:

1. **Cluster orphan photos** by spatiotemporal gaps (a gap > ~6 h *or* > ~5 km
   starts a new cluster).
2. Each cluster becomes a **candidate event**: `kind="span"` (a *While*),
   spanning min→max `taken_at`, centered on the cluster's geo centroid.
3. **Suggest a title** by reverse-geocoding the centroid via Google Places
   (already integrated) + the date: *"24 photos, Jun 14–16, near Wailea — make
   this a While called 'Maui'?"*
4. **One tap** creates the event and links every cluster photo at once.

Photos don't just attach to the story — they can propose new chapters of it.

---

## The AI / vision layer (Phase 3 — handle gently)

Claude vision on each photo → a generated caption, detected scene/landmark
(→ Place matches), and a *gentle* mood read. Two guardrails, because this is a
healing/faith app handling emotional data:

- **Emotional inference stays gentle and user-confirmable** — never auto-assert
  a Feeling or Belief onto someone from a photo (see the project's
  "treat feelings and beliefs gently" principle).
- **No automatic face recognition of specific people initially** — privacy-heavy
  and error-prone. Auto-match places/scenes/time; make people-tagging *assisted*
  but user-driven. A deliberate values/consent decision.

---

## UX surfaces (where the magic shows up)

- A quiet **Suggestions tray** (badge on the photo band): "12 photos look like
  they belong to 4 events — review?" One-tap accept/dismiss.
- **Event & journal galleries** — the payoff: open an event, see its photos
  (reuse `AssociationsPanel` / `useEntityLinks`).
- **Lightbox "Appears in…"** — jump from a photo to its linked event/entry.

---

## Phased rollout

- **Phase 0 — plumbing (this branch).** `Link.status` field; pure scorer;
  read-only dry-run script to calibrate thresholds on real data.
- **Phase 1 — time+geo auto/suggest.** Wire the scorer to run on upload and on
  event-save; write `auto`/`proposed` links; Suggestions tray + event galleries.
- **Phase 2 — event genesis.** Cluster orphan photos → propose *While* events.
- **Phase 3 — vision.** Claude-powered captions, place/scene matching, gentle
  mood hints, assisted people-tagging. Async, confirmable.

---

## Open decisions (with current leanings)

1. **Auto-link silently vs always ask** → auto-link the high tier, propose the
   middle. Asking about everything kills the magic; the undo affordance makes
   silent-auto safe.
2. **`status` field vs encoding in `link_source`** → dedicated field (done); we
   must persist rejections cleanly.
3. **How eager is clustering→events** → conservative: propose only, never
   auto-create events, until trusted on real data.
4. **Vision in v1** → no. Time+geo alone feels magical for anyone who keeps
   events; add vision once the plumbing is proven.

---

## What's implemented on this branch (Phase 0)

- `Link.status` (`LinkStatus` enum) + it's mutable via `PUT /links/{id}`.
- [`app/services/associations.py`](../api/app/services/associations.py) — the
  pure, unit-testable scorer (`PhotoPoint`, `EventSpan`, `Candidate`,
  `score_photo`, and the tunable thresholds).
- [`scripts/dry_run_associations.py`](../api/scripts/dry_run_associations.py) —
  **read-only**; prints what *would* be linked and at what confidence:

  ```
  uv run python scripts/dry_run_associations.py [USER_ID]
  ```

  No links are written. Use it to calibrate the thresholds before Phase 1
  writes a single edge.
