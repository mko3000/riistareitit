# riistareitit — Specification

Source of truth for the app's behaviour, data model, and contracts. Update this file
*before* writing code that changes any of it (see `CLAUDE.md`). The codebase is empty
as of this writing, so this draft is derived from the original feature list and the
Linear backlog (team `RII`, projects **MVP** and **Post-MVP**) rather than from code.

## 1. Purpose

A wildlife sighting tracker for hunters. Two things feed into one map:

1. **Walking routes**, imported from activity trackers (Google Fit, Apple, GPX/KML/JSON
   exports).
2. **Bird sightings and kills**, logged by tapping the map.

The point of combining them: a hunter can see not just *where birds were found*, but
*where they walked and found nothing* — coverage, not just hits.

## 2. Scope

- **MVP** (Linear project `MVP`): single-user, no login. Import tracks, show them on
  a map, log/edit/delete sightings and kills by tapping the map, species icons +
  sighting/kill color coding, topo/satellite map layers, Finnish UI.
- **Post-MVP** (Linear project `Post-MVP`): accounts/login, admin role, hunting
  parties, hunting area borders, date/party filtering, fog of war, English toggle.

Each feature below is tagged with its Linear issue ID(s). Treat this doc, not the
tickets, as the behavioural source of truth — tickets link back here once implemented.

## 3. Architecture

- **Frontend:** React 19 + TypeScript, SPA, built with Vite 8. Confirmed and
  implemented (`RII-26`) — plain root-level project (`package.json`, `src/`, `index.html`
  at repo root), no framework-level routing yet since there's only one page. No SSR;
  revisit if SEO or server rendering becomes a requirement.
- **Backend:** Node.js + TypeScript, REST API on **Fastify** 5. Confirmed and
  implemented (`RII-27`) as a separate project at `server/` (its own `package.json`,
  independent of the frontend at repo root — not an npm workspace, just two sibling
  projects). Ships with a single `/health` endpoint for now; real routes arrive with
  each feature (`RII-28`+ for accounts).
- **Database:** Postgres, via **Prisma** 6 (pinned to the 6.x line — Prisma 7's tooling
  currently needs Node 22+, and dev machines here are on Node 20). Confirmed and
  implemented (`RII-27`). Local development runs Postgres via `docker-compose.yml` at
  the repo root (`docker compose up -d`); see `server/README.md` for the full setup.
  `server/prisma/schema.prisma` intentionally has zero models as of `RII-27` — it's
  infra only. The first real table (`users`) lands in `RII-28`.
- **Map rendering:** Leaflet 1.9 via `react-leaflet` 5. Confirmed and implemented
  (`RII-26`). **Base map tiles** (decided with Miko 2026-09-30, `RII-6`): the National
  Land Survey of Finland's (**MML**) open map-image service (Karttakuvapalvelu, WMTS)
  for the topographic map (`maastokartta`) and aerial photos (`ortokuva`), **proxied
  through our server** so the API key never reaches the browser; OpenStreetMap's
  standard tiles kept as a third layer for outside Finland. See §6 "Base layers" and
  the "Map tiles API" section.
  - MML open service facts (checked 2026-09-30): free, CC BY 4.0 (source attribution
    required), personal API key required (created by Miko in MML's *Oma tili*;
    MML's terms make the key holder responsible for protecting it), Web Mercator
    (`WGS84_Pseudo-Mercator`) zoom 0–16, Finland only, no support or uptime guarantee,
    no fixed quota but "not intended for high-volume services" — MML may throttle a
    disruptive user. **No billing risk.** A paid subscription tier exists (from
    ~€247/yr) with guarantees; not needed now.
- **Styling:** deliberately minimal — a handful of plain CSS rules to make the map
  container fill the viewport (`src/index.css`), no design system or component
  library. Revisit once the app has more than one screen/feature worth styling.
- **Testing** (formalized in `RII-36`, decisions by Miko 2026-09-26). **Vitest** on
  both sides; conventions for contributors (humans and agents) are in `CLAUDE.md`.
  - **Frontend** (repo root, `npm test`): unit tests next to the code as `*.test.ts`,
    `jsdom` environment (pinned to 26.x: newer majors need Node 22+, dev machines are
    on Node 20) because the track parsers use the browser's `DOMParser`. Scope is
    **logic only** — parsers, formatting, the API client's error mapping (`fetch`
    stubbed). No component/React Testing Library tests for now: the UI is small and
    Leaflet-heavy (popups, portals, map events), where component tests are costly to
    write and brittle; UI is checked by hand in a browser. Revisit when the UI grows
    or a UI bug slips through that a test would have caught.
  - **Server** (`server/`, `npm test`): route tests in `server/test/*.test.ts` drive the
    real Fastify app in-process (`app.inject()`, no port) against a **real Postgres test
    database**, `riistareitit_test` — a second database in the same local Docker
    Postgres, never the dev one. `server/test/globalSetup.ts` points `DATABASE_URL` at
    it (overridable via `TEST_DATABASE_URL`), **refuses to run unless the database
    name ends in `_test`**, applies migrations (`prisma migrate deploy`, which also
    creates the database if missing) and seeds species once per run. Each test starts
    from empty `users`/`sessions`/`sightings`/`tracks` (truncated; `species` kept).
    Test files run one at a time (shared database). Tests never read or write
    `server/.env`. The app is built by `buildApp()` in `server/src/app.ts` (plugins,
    routes, error handler, `/health`); `src/index.ts` only builds it and listens.
    `npm run typecheck` type-checks `src/` and `test/` (Vitest doesn't); the build
    (`tsconfig.json`) still compiles `src/` only.
  - **CI** (`.github/workflows/ci.yml`, GitHub Actions): on every pull request (each
    push to it) and every push to `main`. Two jobs — *frontend*: `npm ci`, lint, build
    (incl. `tsc -b`), test; *server*: Postgres 16 service container, `npm ci`, lint,
    typecheck, build, test. Node 20, matching dev machines. Merging into `main` should
    require both jobs to pass — a GitHub branch-protection setting Miko enables by
    hand (not in the repo). No local git hooks: CI is the source of truth.
  - Test data is small and synthetic — never real exported location data.
- **Hosting/deployment:** not yet decided.

These are now the actual choices in the repo, not just proposals — update this section
again if a later ticket changes any of them (e.g. adding routing, picking the backend
framework).

## 4. Data model (Postgres)

Schema covers both MVP and Post-MVP so foreign keys don't need to be retrofitted later.
Tables marked **(Post-MVP)** are not required until their feature ships, but the
nullable FKs they'd need are noted on the MVP tables now.

```sql
-- Implemented in RII-28 (accounts moved into MVP scope, RII-8). Case-insensitive
-- email uniqueness is enforced at the application layer (lowercase before every
-- write/lookup) — see server/prisma/schema.prisma for the reasoning. `role` is
-- unused until RII-9 (admin role, still Post-MVP), always 'member' for now.
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT UNIQUE NOT NULL,
  display_name  TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'member', -- 'member' | 'admin'
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Implemented in RII-29. Not in the original schema draft — RII-29 needed a
-- session mechanism to fulfil "signed in immediately" after sign-up, ahead
-- of RII-30 (which was going to own it). Server-side session, not a
-- stateless signed cookie: the cookie holds only this row's id, so RII-30's
-- logout can delete the row for real revocation. See
-- server/src/session.ts for the create/cookie/read helpers.
CREATE TABLE sessions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX ON sessions (user_id);

-- (Post-MVP: RII-10) — hunting parties. Designed in RII-33 (§9 "Visibility and
-- hunting parties"). Tables implemented in RII-42 (migration
-- 20260930080527_add_hunting_parties, purely additive); no route uses them until
-- RII-43/RII-44. The role CHECK below lives in the migration SQL (Prisma
-- doesn't model CHECK constraints).
CREATE TABLE hunting_parties (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  invite_code  TEXT UNIQUE,  -- current join code (random, ~128 bits, URL-safe);
                             -- NULL = joining disabled; regenerating revokes the old one
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE hunting_party_members (
  party_id  UUID NOT NULL REFERENCES hunting_parties(id) ON DELETE CASCADE,
  user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role      TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
                                            -- party-level, unrelated to users.role
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (party_id, user_id)
);
CREATE INDEX ON hunting_party_members (user_id);

-- MVP: RII-2, RII-3 — imported walking routes. Implemented in RII-3.
CREATE TABLE tracks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL, -- from the file, else the file name (set by the client)
  source_format   TEXT NOT NULL, -- 'tcx' | 'gpx' | 'kml' | 'json' (the file format, not
                                 -- the app it came from: Google Fit exports are 'tcx')
  owner_user_id   UUID REFERENCES users(id) ON DELETE SET NULL, -- the logged-in uploader;
                                 -- import requires login. SET NULL mirrors sightings; what
                                 -- happens to a deleted account's tracks is an open RII-33
                                 -- question (no account deletion exists yet)
  party_id        UUID REFERENCES hunting_parties(id) ON DELETE SET NULL, -- RII-42;
                                 -- NULL = private to the owner (§9); not read by any
                                 -- route until RII-43
  imported_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  recorded_date   DATE, -- date the walk happened, from the source file if present
  segments        JSONB NOT NULL -- the whole track, see "Track geometry storage" below
);

-- Track geometry storage (RII-3, decided with Miko 2026-09-26): each track's
-- points live in tracks.segments as one JSONB value, not one row per point:
--   [ [ point, point, ... ], [ point, ... ] ]   -- array of segments; a new
--                                              -- segment starts after a recording
--                                              -- pause (joined when drawn only if
--                                              -- short, see §6 "Gap joining")
--   point = [lat, lng]                          -- always
--         | [lat, lng, elevationM]              -- trailing nulls trimmed
--         | [lat, lng, elevationM | null, recordedAtEpochMs]
-- Why: tracks are only ever written, read and deleted whole — never queried or
-- edited per point — so a row per point cost chunked multi-row inserts, a sort +
-- regroup on every read, and ~2x the storage, for query power nothing used. The
-- spatial queries that *will* be needed (fog of war RII-13, "tracks in this map
-- area") want per-track line geometry with a spatial index, which rows of points
-- don't give either; the planned path is PostGIS (a geometry column per track),
-- a one-off conversion from this JSON since tracks are immutable. PostGIS needs
-- explicit sign-off (new extension, raw SQL alongside Prisma).
-- Shipped first as a track_points table (migration 20260926103425_add_tracks),
-- converted in 20260926120000_store_track_segments_as_json: data copied into
-- tracks.segments, then track_points dropped.

-- MVP: RII-4, RII-5, RII-20, RII-22 — species reference list
CREATE TABLE species (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key       TEXT UNIQUE NOT NULL,   -- English identifier, e.g. 'capercaillie' — code
                                    -- matches against this; name_fi is what the UI shows
  name_fi   TEXT NOT NULL,
  name_en   TEXT,                   -- filled in for RII-14 (English toggle)
  icon      TEXT NOT NULL,          -- icon identifier/asset reference
  is_preset BOOLEAN NOT NULL DEFAULT true
);
-- Seed rows (RII-20's job, read by RII-22's species picker): metso, teeri, pyy, riekko.

-- MVP: RII-4, RII-20, RII-22, RII-23 — sightings and kills
CREATE TABLE sightings (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lat                 DOUBLE PRECISION NOT NULL,
  lng                 DOUBLE PRECISION NOT NULL,
  species_id          UUID REFERENCES species(id),
  custom_species      TEXT,              -- set instead of species_id for free-text species
  kind                TEXT NOT NULL DEFAULT 'sighting', -- 'sighting' | 'kill'
  notes               TEXT,
  person_display      TEXT NOT NULL DEFAULT 'unknown',  -- free text; who actually saw/killed it
  created_by_user_id  UUID REFERENCES users(id) ON DELETE SET NULL, -- who was logged in when this was added; null if added anonymously
  observed_date       DATE NOT NULL,
  observed_time       TIME,
  -- track_id is still only a target shape (not implemented): link a sighting to
  -- the walk it was made on. party_id was added by RII-42 once hunting_parties
  -- existed (RII-20 shipped without both rather than as dangling UUIDs).
  -- track_id            UUID REFERENCES tracks(id),
  party_id            UUID REFERENCES hunting_parties(id) ON DELETE SET NULL, -- RII-42;
                      -- NULL = private to its creator (§9); not read by any route until RII-43
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (species_id IS NOT NULL OR custom_species IS NOT NULL),
  CHECK (kind IN ('sighting', 'kill'))
);
CREATE INDEX ON sightings (observed_date);
CREATE INDEX ON sightings (party_id); -- RII-42 (also on tracks.party_id)

-- (Post-MVP: RII-11) — hunting area borders
CREATE TABLE hunting_areas (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  party_id        UUID REFERENCES hunting_parties(id),
  owner_user_id   UUID REFERENCES users(id),
  polygon_geojson JSONB NOT NULL, -- GeoJSON Polygon
  color           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Notes:
- `sightings.person_display` and `created_by_user_id` answer two different questions,
  deliberately kept independent (design discussion 2026-09-25, see `RII-20`):
  `person_display` is "who actually saw/killed it" — free text, always shown, may not
  correspond to any account (e.g. a hunting partner who doesn't use the app).
  `created_by_user_id` is "who was logged in when this row was added" — for
  accountability/audit and future permissions, and does **not** change based on what
  `person_display` says. If Miko is logged in and types "Pekka" into the person field,
  `created_by_user_id` still points at Miko's account; `person_display` says "Pekka".
  `ON DELETE SET NULL`, not `CASCADE`: deleting a user account must never delete the
  sighting data itself, only the "added by" attribution.
- Editing/deleting a sighting is currently unrestricted — any user (or anonymous
  visitor) can edit/delete any entry, not just its creator. Deliberate MVP choice for
  a small trusted hunting-party context; `created_by_user_id` exists so this can be
  locked down later without a schema change. **Since `RII-43`: creator only** (§9
  rule 4); the text above describes the MVP state before that.
- Only `lat`/`lng`, `species_id`-or-`custom_species`, and `observed_date` are `NOT NULL`
  on `sightings` — every other field can be filled in later (RII-23).
- **Visibility (since `RII-43`, design §9):** a logged-in user sees a sighting iff they
  created it or they're a member of its party (`party_id`). Logged-out visitors see
  none. Before `RII-43` every sighting was public — a deliberate MVP testing shortcut.
- Fog of war (RII-13, Post-MVP) is computed from track coverage (`tracks.segments`,
  likely via PostGIS — see "Track geometry storage") + `sightings` density at
  render/query time, not stored as its own table — revisit if that proves too slow
  at scale.

### Sightings API

- `GET /species` — lists all `species` rows. Not an explicit ticket requirement anywhere
  but required by one: the species-picker buttons (`RII-22`) have to read their options
  from somewhere. Implemented in `RII-22`.
- `GET /sightings` — lists all sightings, each joined with its `species` (`key`/`nameFi`/
  `icon`) if set. No filtering (see the visibility note above). Implemented in `RII-22`.
- `POST /sightings` — creates one. Body: `lat`, `lng`, one of `speciesKey`(matches
  `species.key`)/`customSpecies`, `kind` (defaults `"sighting"`), `personDisplay`
  (defaults to the session user's display name, or `"unknown"`), `observedDate`
  (defaults today), `observedTime` (optional, `"HH:MM"`). `400` with per-field
  `fieldErrors` on invalid input, same pattern as `/signup`. Implemented in `RII-22`.
- `observed_date`/`observed_time` round-trip as plain `"YYYY-MM-DD"`/`"HH:MM"` strings,
  not full ISO timestamps — formatted server-side with UTC getters specifically to avoid
  a local-timezone round-trip shifting the date/time depending on where the server runs.
  See `server/src/routes/sightings.ts`'s `formatDate`/`formatTime`.
- Marker rendering: originally a plain colored dot (`RII-22`), replaced by per-species
  icon map pins in `RII-5` — see §6 for the current marker design.
- `PATCH /sightings/:id` — updates one. Same body shape as `POST` plus `notes`. The edit
  form always sends every field together rather than a sparse diff, so despite the verb
  this behaves as a full replace of the editable fields, not true partial-update
  semantics — there's only one caller (the edit form) and it always has the complete
  current state to send back, so reconciling "omitted" vs. "cleared" wasn't worth
  building. `404` if the id doesn't exist. Implemented in `RII-23`; `lat`/`lng` were
  initially excluded (moving a marking was out of scope — see `RII-34` below) and added
  once that scope landed, by moving their validation into the same shared
  `parseCommonFields()` helper `POST` already used, rather than duplicating it.
- `DELETE /sightings/:id` — removes the row outright, no soft-delete. `404` if the id
  doesn't exist. Implemented in `RII-23`.
- **Access rules (since `RII-43`, §9 rules 1–4; shared helpers in
  `server/src/visibility.ts`):**
  - Every `/sightings` route requires login: `401 { error: 'not_logged_in' }`
    otherwise. `GET /species` stays public (reference data, no location).
  - `GET /sightings` returns only sightings the caller created or whose party they're
    a member of — filtered in the database query, never in the UI.
  - `POST`/`PATCH` accept `partyId`: one of the caller's party ids, or `null` for
    private. Omitted on `POST` → private; omitted on `PATCH` → unchanged (the edit
    form always sends it since the party picker, `RII-46`). A party the caller isn't
    in → `400 invalid_input` with `fieldErrors.partyId`.
  - `PATCH`/`DELETE /sightings/:id`: a sighting the caller can't see is `404` (same as
    nonexistent — its existence isn't revealed); one they can see but didn't create
    is `403 { error: 'forbidden' }`. Previously anyone could edit/delete anything.
  - Responses include `partyId` and `createdBy` (`{ id, displayName }` or `null`), so
    the UI can show the edit pencil only on your own sightings.
  - Legacy anonymous sightings (no creator, no party) are visible to no one until the
    `RII-47` script assigns them to an account.
- **Global error handler** (`server/src/index.ts`): added after `RII-22` manual testing
  hit a raw Prisma stack trace surfacing directly in the browser (a missing migration —
  Fastify's default error handler echoes the thrown error's own message verbatim).
  `app.setErrorHandler(...)` now returns a generic message for any unhandled error,
  logging the real one server-side. **Must be registered before the route plugins**,
  not after — confirmed the hard way that a handler set after `app.register(...)` calls
  doesn't propagate into their encapsulated context and silently does nothing.
- View/edit/delete UI (`src/sightings/SightingDetailPopup.tsx`) is a Leaflet `Popup`
  nested inside each marker, rather than manually tracking "which marker is open" —
  Leaflet opens/closes it natively on marker click. Tapping a marker doesn't also
  trigger the add-flow's map click handler: Leaflet stops that propagation itself.
  Shares its field UI with `RII-22`'s add form via `SightingFieldsFieldset.tsx`, adding
  a trash button. Delete confirmation is a plain `window.confirm()` — the ticket's own
  words, "a plain 'are you sure?' is enough," matched exactly what that native dialog
  already does.
- Notes was initially excluded from the add popup by design (kept the fast add-path
  minimal), then added there too on Miko's follow-up request 2026-09-25 — optional in
  both, so it doesn't slow down a quick add if left blank.
- **react-leaflet Popup content resizing:** react-leaflet renders a `Popup`'s children
  into Leaflet's content DOM via a React portal, bypassing Leaflet's own `setContent()`
  — which is what normally tells a popup to recalculate its wrapper size. Neither the
  add form nor the marker-detail popup resize their white background automatically when
  their content's size changes (e.g. view → edit mode, or "Other" species revealing a
  text input) without calling the underlying Leaflet popup's `.update()` manually.
  react-leaflet 5 has no `usePopup()` hook, so both popups pass a `ref` to their content
  and call `popupRef.current?.update()` in a dependency-less `useEffect` (i.e. every
  render). For per-marker popups, the ref has to live in a real component — a ref can't
  be created inside the `.map()` that renders them — hence `SightingMarker.tsx` existing
  as its own component rather than being inlined in `SightingsLayer.tsx`.
- **Coordinates are shown in the popup**, on Miko's follow-up request 2026-09-25: view
  mode as a plain read-only line, edit mode as the same text+pencil pattern the person
  field uses (`formatCoords()`, 5 decimals — plenty of precision for "did the pin end
  up roughly where I tapped"). The pencil next to the coordinates *is* the move
  trigger now — replaces the earlier standalone **Move** text button in
  `.edit-actions`, which is gone.
- **Move a marking's location** (`RII-34`): the coordinates row's pencil (edit mode)
  closes the popup (`popupRef.current?.close()`) and tells `SightingsLayer` "waiting for
  a tap for sighting X" (`movingSightingId`). The next map click delivers
  `{ sightingId, lat, lng }` as a one-shot `pendingMoveTarget`, filtered down to the matching `SightingMarker`,
  which reopens the popup (`popupRef.current?.openOn(map)`, needs `useMap()`) and stores
  the new coordinates as its own `stagedPosition` — not persisted until the existing
  **Save** button is pressed (staged, not immediate; see the ticket's own open question
  — this was the assumption made there). Every other in-progress field edit survives
  automatically: this whole close/reopen cycle never unmounts the `SightingDetailPopup`
  React component (Leaflet's `.close()`/`.openOn()` only hide/show the DOM; react-leaflet
  keeps the component instance alive throughout), so nothing needed to be explicitly
  carried across the move. Escape cancels "waiting for a tap" without changing anything
  — the popup has no visible cancel button during this phase since it's closed, hence
  the keyboard affordance and a small fixed banner ("Tap the map to move this marking
  (Esc to cancel)") shown while waiting.
  **`SightingMarker`'s `stagedPosition` (staged, or the saved position if no move is in
  progress) is the single source of truth for "where is this marking right now,"** read
  directly by `SightingDetailPopup` via a `currentPosition` prop for both the marker's
  visual position *and* the `PATCH` body on save. Went through two broken versions before
  landing here: first the marker didn't move at all until Save (zero feedback that a tap
  had registered — reported as "tapping doesn't do anything"); then, after fixing that
  by giving `SightingDetailPopup` its *own* separately-synced `lat`/`lng` copy, the two
  copies drifted apart — the marker visually moved but Save still sent the original,
  pre-move position (reported as "saving returns it to the old spot"). One prop, read
  directly at save time, removed the possibility of the two disagreeing at all.
  `stagedPosition` reverts on cancel — wired to both the Cancel button and the popup's
  `remove` event, so closing via Leaflet's own "×" reverts it too, not just the explicit
  Cancel button.
  Simplification worth knowing: clicking a *different* marker (not the map itself) while
  waiting doesn't cancel or register as the new location — Leaflet routes that click to
  the other marker's own popup instead, so the "waiting" state just stays pending until
  an actual bare-map tap occurs.

## 5. Track import (RII-2 and sub-issues)

Decided with Miko 2026-09-26:

- **Parsing happens in the browser**, not on the server. The raw file never leaves the
  user's device; only the normalized points are sent (and, once `RII-3` adds
  persistence, stored). The **original file is not stored** anywhere.
- **Elevation and per-point time are kept** whenever the source has them — they're
  stored, not just used for parsing.
- Every format is parsed into one common in-memory shape; the map and the API only
  ever see this shape, never a format-specific one. Adding a format = adding a parser.

```ts
// src/tracks/types.ts
type TrackPoint = {
  lat: number
  lng: number
  elevationM?: number
  recordedAt?: string // ISO 8601 UTC, e.g. "2026-09-18T12:39:14.357Z"
}

type ImportedTrack = {
  name?: string           // from the file if it has one; UI falls back to the file name
  sourceFormat: 'tcx' | 'gpx' | 'kml' | 'json'
  segments: TrackPoint[][] // ≥1 segment, each ≥1 point; gaps between segments are
                           // recording pauses — kept as-is in storage; only short
                           // ones are joined when drawn (§6 "Gap joining")
  recordedDate?: string    // "YYYY-MM-DD" of the first timestamped point, in the
                           // browser's local timezone (a walk at 01:00 Finnish time
                           // belongs to that Finnish date, not the previous UTC one)
}
```

### Parser rules (all formats)

- Implemented as pure functions `(fileText: string) => ImportedTrack` in
  `src/tracks/parsers/`, using the browser's `DOMParser` for XML formats; matched by
  element local name so namespace prefixes don't matter.
- Points without a valid position are skipped (not an error). Latitude must be in
  [-90, 90], longitude in [-180, 180], both finite. Invalid elevation or time on an
  otherwise valid point drops just that field.
- Empty segments are dropped. A file with **no valid points at all** fails with
  "Tiedostossa ei ole sijaintitietoja." — never a silently-empty track.
- Unparseable XML fails with "Tiedostoa ei voitu lukea – se ei ole kelvollinen
  <MUOTO>-tiedosto."
- Failures are thrown as `TrackParseError`, whose `message` is the Finnish,
  user-visible text; anything else thrown is a bug and shows a generic Finnish error.

### Formats

- **TCX** (`RII-16`, implemented) — Garmin Training Center XML. This is what **Google
  Fit's Takeout** export contains (`Fit/Activities/*.tcx`, one file per activity;
  about half have GPS, the rest are step-only and get the "no location data" error).
  Also covers Garmin exports. Every `<Track>` (inside each `<Lap>`, inside each
  `<Activity>`) becomes one segment — in Google Fit exports each lap is a stretch of
  movement and the gaps between laps are 2–8 minute pauses. Per `<Trackpoint>`:
  `<Position><LatitudeDegrees>/<LongitudeDegrees>`, `<AltitudeMeters>`, `<Time>`.
  Google Fit's older Takeout layout (`All Sessions` / `Kaikki harjoituskerrat` JSON)
  has no location data, and its `All Data` location dumps aren't split per walk —
  neither is supported.
- **GPX** (`RII-25`, implemented) — GPX 1.0 and 1.1. Tracks:
  `<trk>/<trkseg>/<trkpt lat lon><ele><time>`, each `<trkseg>` is a segment. Routes:
  `<rte>/<rtept>` (e.g. Sports Tracker's "-route.gpx" export — same points as its
  "-track.gpx", no times), each `<rte>` is a segment. **Routes are only used when the
  file has no track points** — a file carrying both would otherwise draw the same walk
  twice. Waypoints (`<wpt>`) and `<extensions>` (heart rate etc.) are ignored. Name:
  the first `<trk>`'s (or, for route-only files, `<rte>`'s) `<name>`, else
  `<metadata><name>`.
- **KML** (`RII-15`, implemented) — Sports Tracker exports this. Every `<LineString>`
  anywhere in the file (including inside `<MultiGeometry>`) is a segment:
  `<coordinates>` holds whitespace-separated "lng,lat[,ele]" tuples, no per-point
  time. Every `<gx:Track>` (including inside `<gx:MultiTrack>`, e.g. Google Earth /
  Google My Maps exports) is also a segment: `<gx:coord>` "lng lat [ele]" paired by
  index with `<when>` times. Points, polygons (`<LinearRing>`) and styles are ignored.
  Name: the first `<Placemark>` with a line's `<name>` — **not** `<Document><name>`,
  which is typically the exporting app's generic label ("Sports Tracker Route"), so
  the UI's file-name fallback is more useful. Zipped `.kmz` is not supported.
- **Apple** (`RII-17`) — probably no new parser: Apple Health's `export.zip` stores
  routes as GPX under `workout-routes/`. To confirm with a real export.
- **JSON** (`RII-18`) — our own schema, essentially `ImportedTrack` serialized directly;
  exact field names finalized when implemented, must round-trip losslessly.
- Format is chosen by **file extension** (`.tcx`, `.gpx`, `.kml`, `.json`,
  case-insensitive). Other extensions, or a format whose parser hasn't shipped yet,
  fail with "Tiedostomuotoa ei tueta (<tiedosto>). Tuetut muodot: <lista>."

### Import UI (`src/tracks/TrackImportControl.tsx`)

- A "Tuo reittejä" button in the top bar, next to the app name (moved there from the
  map's corner in `RII-40`). The import control itself still lives inside the map
  (it needs the map for previews and zooming to them) and renders just the button
  into a slot the top bar exposes, via a React portal. The result panel stays on the
  map, top-left below the zoom control.
- Opens the OS file picker with **multiple selection**. The `<input type="file">`
  deliberately has **no `accept` filter**: on Android and iOS, filters for extensions
  without a well-known MIME type (`.tcx`, `.gpx`, `.kml`) grey out exactly the files
  the user wants. Unsupported files are rejected per file after picking instead.
- Each picked file is parsed independently — one bad file doesn't block the others.
  A panel lists every file: its name, and either date + distance (km, of the line
  as drawn — see §6 "Gap joining") + point count, or its Finnish error message. Each row can be removed.
- Successfully parsed tracks are drawn on the map as a **preview** (dashed orange
  polylines, one polyline per segment) and the map fits to all previewed tracks.
- **Saving** (`RII-3`): each parsed row has a "Tallenna" button, and with more than
  one parsed row the panel also has "Tallenna kaikki" (saves every parsed, unsaved
  row, one request per track, in order). The saved name is the file's own track name,
  else the file name without its extension. Saving requires login: logged out, the save buttons are replaced by
  "Kirjaudu sisään tallentaaksesi reitit." A saved row disappears from the panel and
  its track moves from the dashed preview to the solid saved-tracks layer; a failed
  save keeps the row and shows the Finnish error under it. Unsaved previews are still
  local-only — a reload clears them.

### Tracks API (`RII-3`)

All three routes **require login** (`401` otherwise). **Visibility since `RII-43`**
(§9): a user sees a track iff they own it or they're a member of its party
(`party_id`) — same rule as sightings, filtered in the database query. (Until
`RII-43`, per Miko 2026-09-26, every logged-in user saw every track.)

- `GET /tracks` — every track the caller can see, newest `recorded_date` first (then newest import):
  `{ tracks: [{ id, name, sourceFormat, recordedDate, importedAt, owner: { id,
  displayName } | null, partyId, segments: [[[lat, lng], ...], ...] }] }`. Points are sent as
  compact `[lat, lng]` pairs — the map needs nothing else, and it keeps the payload
  ~4× smaller. Elevation/time are stored but not returned (no consumer yet). Returns
  all points of all tracks: fine at MVP scale (tens of tracks), will need viewport
  filtering and/or simplification before hundreds — noted, not built.
- `POST /tracks` — body is the `ImportedTrack` shape from §5 plus a required `name`:
  `{ name, sourceFormat, recordedDate?, partyId?, segments: TrackPoint[][] }`
  (`partyId`: one of the caller's parties or `null`/omitted = private; any other →
  `400 invalid_input`). Validated
  server-side even though the client already parsed it: name 1–200 chars,
  `sourceFormat` one of the four, `recordedDate` `"YYYY-MM-DD"` if present, ≥1
  non-empty segment, **≤ 200,000 points** total, each point's lat/lng in range and
  finite, `elevationM` finite if present, `recordedAt` a parseable timestamp if
  present. `400 { error: 'invalid_input', message }` otherwise (one message, not
  per-field — there's no form to attach field errors to), except too many points,
  which is `400 { error: 'too_many_points' }` so the UI can say the track is too big
  (as for a `413` from the body limit). Messages are English/developer-facing (§7). Owner = session user.
  Stored as one row, the points converted to the compact `segments` JSONB format
  (§4). Route-level `bodyLimit` of 25 MB (Fastify
  defaults to 1 MB; the largest real Google Fit export tested was ~30k points ≈ 3 MB
  of JSON). `201 { track }` in the same shape as a `GET` item.
- `PATCH /tracks/:id` `{ partyId }` (`RII-46`) — **owner only**; changes only which
  party sees the track (`partyId`: one of the owner's parties, or `null` = private;
  anything else → `400 invalid_input`). Same `404`/`403` rules as delete. Returns
  `{ track }` in the `GET` shape. The points themselves can't be edited.
- `DELETE /tracks/:id` — **owner only**: `403` for a track the caller can see (via a
  party) but doesn't own; `404` if it doesn't exist **or the caller can't see it**
  (since `RII-43`, existence isn't revealed). Sightings follow the same rule since
  `RII-43`.

### Map tiles API (`RII-6`)

- `GET /tiles/:layer/:z/:x/:y` — proxies one Web Mercator tile from MML's open WMTS.
  `layer` is `maastokartta` (PNG) or `ortokuva` (JPEG); `z` 0–16; `x`/`y` integers in
  `0 … 2^z − 1` (standard XYZ, same as Leaflet's `{z}/{x}/{y}`). Upstream URL:
  `https://avoin-karttakuva.maanmittauslaitos.fi/avoin/wmts/1.0.0/{layer}/default/WGS84_Pseudo-Mercator/{z}/{y}/{x}.{png|jpg}`
  (WMTS REST order is TileMatrix/TileRow/TileCol = z/y/x).
- The API key comes from the server env var **`MML_API_KEY`** (in `server/.env`,
  never committed; `server/.env.example` has an empty placeholder). It's sent to MML
  as HTTP Basic auth (key as username, empty password) — not in the URL, so it never
  lands in logs that record URLs. Without the variable set the route answers
  `503 { error: 'tiles_not_configured' }` and the rest of the server works normally.
- **Finland only:** tiles that don't intersect lat 58.8–70.3, lng 19.0–32.0 (MML's
  coverage plus margin) get `404` without calling MML — they'd be blank anyway.
- Responses pass through MML's body and `Content-Type`, with
  `Cache-Control: public, max-age=604800` (7 days — the maps change rarely) so a
  browser re-requests a tile at most weekly. No server-side tile cache yet.
- Errors: invalid layer/z/x/y → `400 invalid_tile`; MML `404` → `404`; MML rejecting
  the key (`401`/`403`) → `502 tiles_unavailable` and a server log line naming the key
  as the likely cause; other MML errors or a timeout (10 s) → `502 tiles_unavailable`.
- No login required, so the map works for logged-out visitors like before.
  That makes the route an open proxy to MML with our key for anyone who can reach
  the server — acceptable while the app isn't public. **Decided (Miko 2026-09-30):**
  require login for the MML layers before public deployment, logged-out visitors
  get OpenStreetMap — tracked in `RII-41`.
- Tests (`server/test/tiles.test.ts`) stub `fetch`, so they never call MML; the test
  config sets a fake `MML_API_KEY`.

## 6. Map (RII-3, RII-5, RII-6)

- **Base layers** (`RII-6`, `src/map/BaseLayers.tsx`): Leaflet's standard layers
  control (top-right corner) switches between three, names in Finnish:
  1. **Maastokartta** (default) — MML topographic map, via `/tiles/maastokartta/...`.
  2. **Ilmakuva** — MML aerial photos (`ortokuva`), via `/tiles/ortokuva/...`.
     (Aerial photos, not satellite — better resolution than satellite for Finland.)
  3. **OpenStreetMap** — direct from `tile.openstreetmap.org`, for outside Finland.
  MML layers: `maxNativeZoom` 16 (the open service's limit) with Leaflet upscaling to
  zoom 18 like OSM; `bounds` set to Finland's extent (same box as the server's, see
  "Map tiles API") so Leaflet never requests tiles outside it; attribution
  "© Maanmittauslaitos (CC BY 4.0)". The chosen layer is remembered per browser in
  `localStorage` (`riistareitit.baseLayer`), falling back to Maastokartta.
  Tracks (canvas renderer) and sighting/kill markers are separate panes above every
  base layer, so they render identically on all three.
- **Gap joining** (`RII-38`, `src/tracks/gapJoining.ts`): when a track is drawn,
  consecutive segments whose gap — straight-line distance from the last point of one
  to the first point of the next — is **≤ 500 m** (`MAX_JOINED_GAP_M`) are drawn as
  one continuous line; longer gaps are **not drawn at all** (no dotted connector —
  a straight line across kilometres nobody walked would misrepresent coverage, the
  app's core purpose). Rendering only: stored segments are unchanged, so the
  threshold can be tuned any time. Distance shown (import panel, track popup) is the
  length of the line as drawn, so joined gaps count and unjoined ones don't.
  Why 500 m (measured on Miko's Google Fit export, 2026-09-30, 1,501 gaps in 768
  walks with pauses): it joins 76% of gaps and makes 63% of those walks one
  continuous line (300 m: 66% / 52%; 1 km: 87% / 77% but many more km-long straight
  lines). No time limit on gaps for now.
- Tracks render as polylines, one per drawn run of joined segments
  (`src/tracks/TracksLayer.tsx`). Saved
  tracks: solid orange `#ea580c`, weight 4, drawn on a shared **canvas renderer**
  (many long polylines are much cheaper on one canvas than as SVG paths). Import
  previews: same orange, dashed. Orange keeps both clear of the blue/red sighting pins.
- Tapping a saved track opens a popup: name, date, distance, who imported it, and
  "Poista reitti" if it's your own (native `confirm()` first, as for sightings). A tap
  on a track therefore doesn't start adding a sighting — tap beside the line instead.
- Each sighting/kill renders as a marker: icon = species (`species.icon`), color =
  sighting vs. kill. Custom (non-preset) species get a fallback icon. Implemented in
  `RII-5`:
  - **Shape:** a teardrop map pin (40×52px, white border + drop shadow) whose
    bottom tip sits exactly on the marking's `lat`/`lng`; the popup opens above the
    pin's head. A white bird silhouette (~29px) fills the round head. Initially shipped
    as a 28px center-anchored round badge; changed to a pin with a bigger silhouette
    on Miko's request 2026-09-25 (easier to see the species, and a pin's tip is a more
    precise "here" than a badge's center).
  - **Color = kind**, on the pin's fill: blue `#2563eb` for sighting, red
    `#b00020` for kill (the app's existing link/error colors, unchanged from `RII-22`).
    Color is the only kind signal — the silhouette is identical for a sighting and a
    kill of the same species.
  - **Icon = species**, looked up by `species.icon` in a frontend registry
    (`src/sightings/speciesIcons.ts`), not by `species.key` — the DB column exists
    precisely so a species' icon can be reassigned without changing its identity.
    Registry ids today equal the preset keys (`capercaillie`, `black-grouse`,
    `hazel-grouse`, `willow-ptarmigan`), as seeded by `RII-20`. Icons are inline SVG
    path data in that module — no image assets, no icon library, no network requests.
    Each silhouette leans on the species' most recognizable trait: capercaillie's
    raised fanned tail, black grouse's lyre-shaped tail, hazel grouse's crest,
    willow ptarmigan's plump round body.
  - **Fallback:** a generic bird silhouette, used for custom (free-text) species and
    for any `species.icon` value the registry doesn't know (e.g. a species row added
    to the DB before its icon ships) — never a missing/broken marker.
  - Leaflet `divIcon`s are cached per (icon, kind) pair so re-renders (e.g. a staged
    `RII-34` move) reuse the same icon object instead of rebuilding marker DOM.
- Walked-but-empty areas must be visually distinguishable from unwalked areas — this
  is the MVP's core value proposition (see §1), not a Post-MVP nicety. Post-MVP's "fog
  of war" is the fuller version of this; the MVP baseline is "you can see the tracks".

## 7. Localization (RII-7, RII-14)

- Finnish is the default and only language for MVP. All UI strings and the seeded
  species list are authored in Finnish first.
- UI strings must be externalized (i18n keys, not inline literals) from the start even
  though English isn't wired up until Post-MVP — retrofitting this later is expensive.
  **Implemented in `RII-7`:**
  - Every user-visible string lives in **`src/i18n/fi.ts`**: one object grouped by
    feature (`common`, `auth`, `sightings`, `tracks`); strings with values in them are
    small functions (e.g. `t.tracks.pointCount(574)` → "574 pistettä"). Components
    import **`t` from `src/i18n`**, which is just `fi` for now. The English toggle
    (`RII-14`) adds `en.ts` with the same shape (typed against `Messages`, the type of
    `fi`) and picks between them in `src/i18n/index.ts` — no component changes.
    Deliberately no i18n library yet.
  - **The UI never shows the server's `message` text.** It picks its Finnish text by the
    response's `error` code (and, for `invalid_input`, by which fields are in
    `fieldErrors`) — see the mapping in `src/api.ts`. Server `message`s are English,
    developer-facing, for logs and debugging only. So auth/sightings/tracks routes don't
    need translating, and adding English later is a frontend-only change.
  - The sign-up password message hardcodes 8 characters, mirroring the server's
    `MIN_PASSWORD_LENGTH` — change both together.
  - `sightings.person_display` stores the sentinel `'unknown'` when nobody is named
    (code-facing, unchanged); the UI displays it as "Tuntematon".
  - Dates shown in the UI are Finnish `d.m.yyyy` (`src/tracks/format.ts`'s
    `formatFinnishDate`, shared). `<html lang="fi">`.
  - Not translated: the map tiles' OpenStreetMap attribution (license text), and
    anything the browser renders itself (native date picker, `confirm()` buttons).
- Species translation (Post-MVP): `species.name_en` holds the English common name for
  preset species. User-entered custom species are **not** translated (no reliable way
  to translate free text) — the toggle only affects UI chrome and preset species names.

## 8. Accounts (RII-8, moved into MVP) and remaining Post-MVP features

### Accounts API

Signing up and logging in themselves are open to anyone. **Since `RII-43`, seeing or
adding any sightings/tracks requires login** (§9 rule 1); before that login was
optional app-wide (`RII-8`) and only attributed data to a real name.

- `POST /signup` — `{ email, displayName, password }` → `201` with the created user
  (never includes `passwordHash`) and sets the session cookie (signed in immediately,
  no email verification step). `400` with `fieldErrors` per invalid field; `409`
  `email_taken` on a duplicate. Email is trimmed + lowercased before every
  write/lookup — see `RII-28`'s note on case-insensitive uniqueness.
  Implemented in `RII-29`.
- Session cookie: `session_id`, httpOnly, `SameSite=Lax`, `Secure` only when
  `NODE_ENV=production` (dev runs over plain http). Backed by the `sessions` table
  (§4) — a bearer-style opaque token, not a signed/stateless cookie, specifically so
  logout can revoke it server-side. See `server/src/session.ts`.
- `POST /login` — `{ email, password }` → `200` with the user + a fresh session cookie.
  Wrong password and unknown email both return the identical `401 invalid_credentials`
  response (don't reveal which was wrong). Implemented in `RII-30`.
- `POST /logout` — deletes only the *current* session's row (the one the request's
  cookie names), not every session belonging to the user — logging out doesn't sign
  you out of other devices/tabs. Always `204`, even if the cookie was already
  missing/invalid (idempotent). Implemented in `RII-30`.
- `GET /me` — `200` always, with `{ user: null }` when anonymous rather than `401`:
  being logged out is this endpoint's normal case (login is optional app-wide), not
  an error every page load has to branch on. Implemented in `RII-30`.
- **UI:** a persistent top bar (`src/auth/AuthBar.tsx`) owns all of this on the
  frontend — checks `/me` on mount, shows Log in/Sign up buttons (opening a small
  dropdown with the relevant form) when anonymous, or the display name + a Log out
  button when signed in. The page layout is now bar-on-top + map filling the rest of
  the viewport (`.app-shell`/`.top-nav`/`.map-area` in `src/index.css`), replacing
  `RII-26`'s original full-viewport-map-only layout. Implemented in `RII-31`; this
  is the epic's (`RII-8`) last piece.

### Still deferred (Post-MVP)

Hunting parties (designed in §9, built in `RII-10`), area borders, date/party
filtering, fog of war, admin role, English i18n — see Linear issues `RII-9` through
`RII-14` for current requirements and open questions. Expand this section with concrete API/schema detail before starting each
one; don't let it stay a stub once work begins.

## 9. Visibility and hunting parties (RII-33 design, RII-10)

**Status:** design decided with Miko 2026-09-30 (`RII-33`, signed off by merging PR
#66). Being built in `RII-10`'s sub-issues: tables (`RII-42`) ✅; **rules 1–4 enforced
in the API (`RII-43`)** ✅; **party management API and UI (`RII-44`, `RII-45`)** ✅;
**"Näkyy" picker (`RII-46`)** ✅ — only the one-off legacy-sightings script (`RII-47`)
remains.

### Rules

1. **Login required to see or add anything.** Logged-out visitors see an empty map
   (base layers only) and a prompt to log in. Anonymous sighting creation goes away:
   every sighting and track has a creator.
2. **Every sighting and track belongs to at most one party** (`party_id`), chosen by
   its creator when adding it: one of the creator's parties, or **"Vain minä"** (only
   me, `party_id = NULL`). The picker defaults to the creator's last choice
   (remembered per browser). Tracks: chosen in the import panel, one choice for the
   whole batch with a per-row override. Changeable later by the creator (edit), to
   another of their parties or to private.
3. **A user sees an item iff** they created it **or** they're currently a member of
   its party. Formally, for user `U`:
   `item.created_by = U OR item.party_id IN (parties U is a member of)`.
   - Membership in **several parties** is allowed; the map shows the union of all
     their parties' items plus their own private ones. The date/party filter
     (`RII-12`) narrows this down; there's no "active party" switch.
   - A user in **no party** sees only their own items.
   - **Tracks follow exactly the same rules as sightings** — a timestamped route is
     at least as sensitive (it often starts at someone's home).
   - Visibility is **per item**, never per area. Hunting areas (`RII-11`) are map
     overlays owned by a party (visible to its members), and **do not** grant
     visibility of items inside them.
4. **Only the creator edits or deletes an item.** Party admins can't edit or delete
   other members' items (possible later addition: "remove from party", which would
   make it private to its creator).
5. **Leaving or being removed from a party:** the member's items shared with that
   party **stay with the party** (still visible to its members — it's the party's
   shared history), and the member keeps seeing and managing their own items (rule 3,
   creator clause). They lose sight of everyone else's items in that party.
6. **Deleting a party** (admin only): its items aren't deleted; `party_id` becomes
   `NULL` (`ON DELETE SET NULL`), so each becomes private to its creator.
7. **Deleting a user account** (no such feature yet): out of scope; decide when
   account deletion is built (tracks/sightings currently `ON DELETE SET NULL` on the
   creator — an item without a creator and without a party would be visible to no
   one).
8. **App admin role (`RII-9`) grants no data visibility.** An app admin doesn't see
   parties' sightings or tracks by virtue of the role; what the role *can* do is still
   `RII-9`'s open question.

### Parties

- **Anyone logged in can create a party** and becomes its first **admin**
  (`hunting_party_members.role = 'admin'`). A party has a name (1–100 chars).
- **Joining by invite link/code:** each party has at most one current `invite_code`.
  An admin shares the link (e.g. over WhatsApp); a logged-in user who opens it sees
  the party's name and a "Liity" button, and joins as a `member`. Someone without an
  account signs up first, then continues to the same join screen. Admins can
  **regenerate** the code (old links stop working) or **disable** it. Codes are random
  (~128 bits) so they can't be guessed; they don't expire on their own.
- **Admins** can: rename the party, regenerate/disable the invite code, remove
  members, make another member admin, delete the party. **Members** can view the
  member list and leave.
- **The last admin can't leave** while other members remain — they make someone else
  admin first (or delete the party). The last member leaving deletes the party
  (rule 6 applies).

### Party API (`RII-44`, `server/src/routes/parties.ts`)

All routes require login (`401 not_logged_in`). A party you're not a member of
answers **`404`** everywhere — its existence isn't revealed. Messages are English and
developer-facing (§7); errors are told apart by `error` code.

- `GET /parties` → `{ parties: [{ id, name, myRole, memberCount }] }` — my parties,
  by name.
- `POST /parties` `{ name }` → `201 { party }` (detail shape below). The caller
  becomes `admin`, and an invite code is generated right away so the link can be
  shared immediately. Name: trimmed, 1–100 chars, else `400 invalid_input`.
- `GET /parties/:id` → `{ party: { id, name, myRole, inviteCode, members: [{ userId,
  displayName, role, joinedAt }] } }`. `inviteCode` is `null` for non-admins (and when
  joining is disabled). Members sorted admins first, then by name.
- `PATCH /parties/:id` `{ name }` → `{ party }` — admin only (`403 forbidden`).
- `DELETE /parties/:id` → `204` — admin only. Items in it become private (rule 6).
- `POST /parties/:id/invite-code` → `{ inviteCode }` — admin only; a fresh code
  replaces the old one (old links stop working). Codes: 16 random bytes
  (`crypto.randomBytes`), base64url — 22 characters, ~128 bits, not guessable.
- `DELETE /parties/:id/invite-code` → `204` — admin only; joining disabled.
- `GET /invites/:code` → `{ invite: { partyId, partyName, memberCount,
  alreadyMember } }` for the join screen; `404` for an unknown or disabled code.
- `POST /invites/:code/join` → `{ party }` (summary shape) — joins as `member`;
  idempotent (already a member → same response, role unchanged). `404` as above.
- `DELETE /parties/:id/members/:userId` → `204` — an admin removes anyone, or anyone
  removes **themselves** (= leave); otherwise `403`. **The last admin can't leave or be
  removed while other members remain** (`409 last_admin` — make someone else admin
  first). The last member leaving deletes the party (rule 6).
- `PATCH /parties/:id/members/:userId` `{ role: 'admin' | 'member' }` → `{ party }` —
  admin only. Demoting the last admin → `409 last_admin`. Any admin can promote or
  demote any member, including other admins.
- Membership changes run in a transaction, so two simultaneous "leave" requests can't
  both pass the last-admin check.

### UI

- **Parties menu (`RII-45`, `src/parties/`)**: a **"Porukat"** button in the top bar
  (logged in only) opens a panel under the bar, like the login dropdown:
  - List of my parties (name, my role, member count), a **"Uusi porukka"** form, and a
    **"Liity porukkaan"** field (added on Miko's request 2026-09-30 — clearer than only
    opening a link): paste either the invite **code** or the whole **link**; the code
    is extracted (`parseInviteInput` in `src/parties/inviteLink.ts`) and joined
    directly (`POST /invites/:code/join`), then the new party opens.
  - Opening a party shows its members and, by role:
    - **Admin:** rename; invite link with **Kopioi** (clipboard) and, where the
      browser supports it (phones), **Jaa** (the OS share sheet); the bare **code**
      shown too, with **Kopioi koodi**, for pasting into "Liity porukkaan"; **Uusi linkki**
      (regenerate, with `confirm()` since old links stop working) and **Poista linkki
      käytöstä** (disable); per member: make admin/member, remove; **Poista porukka**
      (with `confirm()`).
    - **Everyone:** **Poistu porukasta** (leave, with `confirm()`). The last admin
      sees the server's reason instead of leaving.
- **Join screen (`RII-45`)**: opening the app with **`?liity=<code>`** shows a dialog
  over the map with the party's name and member count and a **"Liity"** button.
  Logged out, it says to log in or create an account first (via the top bar) and
  then continues automatically. Joining (or closing the dialog) removes `?liity=`
  from the address bar (`history.replaceState`), so a reload doesn't reopen it.
  Unknown/disabled link → a Finnish error in the same dialog ("Kutsulinkki on
  vanhentunut tai virheellinen…"), also used by the "Liity porukkaan" field — not the
  generic "Porukkaa ei löytynyt".
- After joining, leaving, or deleting a party, the map's sightings and tracks reload
  (what you may see just changed).
- **"Näkyy" picker (`RII-46`, `src/parties/VisibilityPicker.tsx`)**: a select labelled
  "Näkyy" with **"Vain minä"** (private) plus my parties by name.
  - **Default** for new items: the last choice made in any picker, remembered per
    browser in `localStorage` (`riistareitit.visibility`: a party id or `private`).
    A remembered party I'm no longer in (left, removed, deleted) falls back to "Vain
    minä" — never silently to some other party.
  - **Add-sighting form:** the picker, sent as `partyId`.
  - **Edit mode of a sighting:** the picker, preselected with its current party; sent
    as `partyId`. If it's in a party I've since left, that party is kept as the
    selected option ("Porukka, josta olet poistunut") so saving other edits doesn't
    move it by accident.
  - **Import panel:** one picker at the top for the whole batch (default as above),
    plus a per-row picker that starts from the batch choice and can override it.
  - **Popups** (sighting view, saved track) show "Näkyy: <porukan nimi>" or "Näkyy:
    vain minä". Party names come from my own party list (`GET /parties`, reloaded on
    login and on membership changes); an item in a party I've left shows "porukka,
    josta olet poistunut".
  - **Saved track popup:** its owner gets the picker too, to move the track to another
    of their parties or make it private (`PATCH /tracks/:id`).
- All strings in `src/i18n/fi.ts`; panel and dialog fit a phone-width screen. The top
  bar wraps onto a second line on narrow screens instead of overflowing, and sits above
  Leaflet's own controls (`z-index` 1100) so its dropdowns aren't covered by the zoom or
  layers control.

### Migration of existing data

- Existing sightings and tracks get `party_id = NULL` — **private to their creator**.
- Existing sightings with **no creator** (added anonymously while that was allowed)
  would become visible to no one. A one-off, manually run script assigns them to a
  given user (Miko's account) — a script rather than a migration, because it names a
  specific account.

### Implementation order (sub-issues of `RII-10`)

1. Data model + migration: parties, members (with role), invite code; `party_id` on
   sightings and tracks; login-required for creating sightings.
2. Visibility enforcement in the sightings/tracks APIs (rule 3), creator-only
   edit/delete, `partyId` on create/edit — with server tests for every rule above.
3. Party management API (create, rename, delete, members, roles, invite codes, join).
4. UI: party menu + management, join-by-link screen.
5. UI: "Näkyy" picker in the add/edit sighting form and import panel; party shown in
   popups; logged-out empty-map state.
6. One-off script for anonymous legacy sightings.

## 10. Open questions / assumptions to confirm

- ~~Backend web framework~~ — resolved: Fastify (`RII-27`).
- ~~ORM/migration tool~~ — resolved: Prisma, pinned to 6.x for Node 20 compatibility
  (`RII-27`).
- ~~Map tile provider for topo + satellite layers~~ — resolved: MML open WMTS, proxied
  through the server (`RII-6`, §3, §6). Follow-up before deployment: require login
  for the tile proxy (`RII-41`, see "Map tiles API").
- Hosting/deployment target.
- Admin role's actual capabilities (`RII-9`).
- ~~Hunting party invite flow~~ — resolved: invite link/code (`RII-33`, §9).
- ~~Sighting/track visibility & privacy model~~ — resolved (`RII-33`, §9).
- Fog of war: which overlay variant ships, or both (`RII-13`).
