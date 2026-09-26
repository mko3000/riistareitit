# riistareitit
Sovellus, mihin voi lisätä metsästysseurueen kävelydatat exportattuna google fitistä ja applelta yms. ja merkitä lintuhavainnot ja kaadot. Näyttää myös metsästysalueiden rajat (listasta voi pistää päälle ja pois). Fog of war ois siisti. Käytetään siihen, että voi myöhemmin katsoa, mitkä alueet on käyty ja missä on näkynyt lintuja.

## Development

- **Frontend** (repo root): `npm install`, then `npm run dev` — a Vite dev server with the map page. Copy `.env.example` to `.env` if you're running the backend somewhere other than `http://localhost:3001` (that's the default, so this is optional for a normal local setup).
- **Tests**: `npm test` in the repo root (frontend unit tests) and in `server/` (API route tests against a separate `riistareitit_test` database — see [`server/README.md`](server/README.md)). CI runs both on every pull request.
- **Backend** (`server/`): see [`server/README.md`](server/README.md) for setup (needs a local Postgres, started via `docker compose up -d`). Run both dev servers side by side to use sign-up/login — the frontend doesn't do anything backend-related until you do.

Full architecture and data model: [`docs/SPEC.md`](docs/SPEC.md).
