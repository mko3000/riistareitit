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
  (`RII-26`). Tile provider for the base layer is currently OpenStreetMap's standard
  tiles (`{s}.tile.openstreetmap.org`) — free, no API key, no cost implications; this
  is a placeholder, not the final look. Topographic/satellite tile providers are
  **still undecided** — this is a billed-API hard boundary per `CLAUDE.md`, needs
  explicit sign-off before `RII-6` implements the layer toggle (candidates: MML avoin
  data for Finnish topo maps, a paid provider for satellite).
- **Styling:** deliberately minimal — a handful of plain CSS rules to make the map
  container fill the viewport (`src/index.css`), no design system or component
  library. Revisit once the app has more than one screen/feature worth styling.
- **Hosting/deployment:** not yet decided.

These are now the actual choices in the repo, not just proposals — update this section
again if a later ticket changes any of them (e.g. adding routing, picking the backend
framework).

## 4. Data model (Postgres)

Schema covers both MVP and Post-MVP so foreign keys don't need to be retrofitted later.
Tables marked **(Post-MVP)** are not required until their feature ships, but the
nullable FKs they'd need are noted on the MVP tables now.

```sql
-- (Post-MVP: RII-8, RII-9) — users and roles
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT UNIQUE NOT NULL,
  display_name  TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'member', -- 'member' | 'admin'
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- (Post-MVP: RII-10) — hunting parties
CREATE TABLE hunting_parties (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  created_by  UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE hunting_party_members (
  party_id  UUID NOT NULL REFERENCES hunting_parties(id) ON DELETE CASCADE,
  user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (party_id, user_id)
);

-- MVP: RII-2, RII-3 — imported walking routes
CREATE TABLE tracks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT,
  source_format   TEXT NOT NULL, -- 'gpx' | 'kml' | 'google_fit' | 'apple' | 'json'
  owner_user_id   UUID REFERENCES users(id),      -- null until Post-MVP auth ships
  party_id        UUID REFERENCES hunting_parties(id), -- null until Post-MVP parties ship
  imported_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  recorded_date   DATE -- date the walk happened, from the source file if present
);

CREATE TABLE track_points (
  id          BIGSERIAL PRIMARY KEY,
  track_id    UUID NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  sequence    INTEGER NOT NULL,      -- order within the track
  lat         DOUBLE PRECISION NOT NULL,
  lng         DOUBLE PRECISION NOT NULL,
  elevation_m DOUBLE PRECISION,
  recorded_at TIMESTAMPTZ           -- may be null if source has no per-point timestamps
);
CREATE INDEX ON track_points (track_id, sequence);

-- MVP: RII-4, RII-5, RII-21 — species reference list
CREATE TABLE species (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key       TEXT UNIQUE NOT NULL,   -- e.g. 'metso'
  name_fi   TEXT NOT NULL,
  name_en   TEXT,                   -- filled in for RII-14 (English toggle)
  icon      TEXT NOT NULL,          -- icon identifier/asset reference
  is_preset BOOLEAN NOT NULL DEFAULT true
);
-- Seed rows (minimum required by RII-21): metso, teeri, pyy, riekko.

-- MVP: RII-4, RII-20, RII-22, RII-23, RII-24 — sightings and kills
CREATE TABLE sightings (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lat               DOUBLE PRECISION NOT NULL,
  lng               DOUBLE PRECISION NOT NULL,
  species_id        UUID REFERENCES species(id),
  custom_species    TEXT,              -- set instead of species_id for free-text species
  kind              TEXT NOT NULL DEFAULT 'sighting', -- 'sighting' | 'kill'
  notes             TEXT,
  person_display    TEXT NOT NULL DEFAULT 'unknown',  -- free text; adjustable per RII-4
  person_user_id    UUID REFERENCES users(id),         -- set when attributable to an account
  observed_date     DATE NOT NULL,
  observed_time     TIME,
  track_id          UUID REFERENCES tracks(id),  -- the walk this was logged during, if any
  party_id          UUID REFERENCES hunting_parties(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (species_id IS NOT NULL OR custom_species IS NOT NULL),
  CHECK (kind IN ('sighting', 'kill'))
);
CREATE INDEX ON sightings (observed_date);
CREATE INDEX ON sightings (party_id);

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
- `sightings.person_display` + `person_user_id` implement the "defaults to the adder,
  or 'unknown', but adjustable to log on behalf of someone else" requirement (RII-4):
  `person_display` is always shown; `person_user_id` is set only when it actually
  corresponds to an account.
- Only `lat`/`lng`, `species_id`-or-`custom_species`, and `observed_date` are `NOT NULL`
  on `sightings` — every other field can be filled in later (RII-23).
- Fog of war (RII-13, Post-MVP) is computed from `track_points` coverage + `sightings`
  density at render/query time, not stored as its own table — revisit if that proves
  too slow at scale.

## 5. Track import (RII-2 and sub-issues)

Every supported format is parsed into one common in-memory shape before it touches the
database:

```ts
type ImportedTrack = {
  points: Array<{ lat: number; lng: number; elevationM?: number; recordedAt?: string }>;
  recordedDate?: string; // ISO date, best-effort from the source file
};
```

- **GPX** (`RII-25`) — standard `<trkpt lat lon><ele><time>` parsing.
- **KML** (`RII-15`) — `<coordinates>` in a `<LineString>`; KML has no native per-point
  timestamp, so `recordedAt` may be absent.
- **Google Fit** (`RII-16`) — format needs confirming (Google Takeout export) before
  implementation; treat as a research spike first.
- **Apple** (`RII-17`) — format needs confirming (Health export XML vs. GPX from a
  third-party app) before implementation; treat as a research spike first.
- **JSON** (`RII-18`) — our own schema, essentially `ImportedTrack` serialized directly;
  exact field names to be finalized when implemented, but should round-trip losslessly.
- Malformed or unsupported files must fail with a user-visible error, never a crash or
  a silently-empty track.

## 6. Map (RII-3, RII-5, RII-6)

- Base layers: topographic and satellite, user-toggleable. Both must render tracks and
  sighting/kill markers identically on top.
- Tracks render as polylines.
- Each sighting/kill renders as a marker: icon = species (`species.icon`), color =
  sighting vs. kill. Custom (non-preset) species get a fallback icon.
- Walked-but-empty areas must be visually distinguishable from unwalked areas — this
  is the MVP's core value proposition (see §1), not a Post-MVP nicety. Post-MVP's "fog
  of war" is the fuller version of this; the MVP baseline is "you can see the tracks".

## 7. Localization (RII-7, RII-14)

- Finnish is the default and only language for MVP. All UI strings and the seeded
  species list are authored in Finnish first.
- UI strings must be externalized (i18n keys, not inline literals) from the start even
  though English isn't wired up until Post-MVP — retrofitting this later is expensive.
- Species translation (Post-MVP): `species.name_en` holds the English common name for
  preset species. User-entered custom species are **not** translated (no reliable way
  to translate free text) — the toggle only affects UI chrome and preset species names.

## 8. Auth, parties, areas, filtering, fog of war (Post-MVP)

Deferred — see Linear issues `RII-8` through `RII-14` for current requirements and
open questions. Expand this section with concrete API/schema detail before starting
each one; don't let it stay a stub once work begins.

## 9. Open questions / assumptions to confirm

- ~~Backend web framework~~ — resolved: Fastify (`RII-27`).
- ~~ORM/migration tool~~ — resolved: Prisma, pinned to 6.x for Node 20 compatibility
  (`RII-27`).
- Map tile provider for topo + satellite layers, and its cost implications (hard
  boundary per `CLAUDE.md` — needs explicit sign-off). The current OSM standard-tile
  base layer (`RII-26`) is a free placeholder, not a resolution of this question.
- Hosting/deployment target.
- Admin role's actual capabilities (`RII-9`).
- Hunting party invite flow: open-add vs. accept-required (`RII-10`).
- Fog of war: which overlay variant ships, or both (`RII-13`).
