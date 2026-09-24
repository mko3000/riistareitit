# riistareitit
Sovellus, mihin voi lisätä metsästysseurueen kävelydatat exportattuna google fitistä ja applelta yms. ja merkitä lintuhavainnot ja kaadot. Näyttää myös metsästysalueiden rajat (listasta voi pistää päälle ja pois). Fog of war ois siisti. Käytetään siihen, että voi myöhemmin katsoa, mitkä alueet on käyty ja missä on näkynyt lintuja.

## Development

- **Frontend** (repo root): `npm install`, then `npm run dev` — a Vite dev server with the map page.
- **Backend** (`server/`): see [`server/README.md`](server/README.md) for setup (needs a local Postgres, started via `docker compose up -d`).

Full architecture and data model: [`docs/SPEC.md`](docs/SPEC.md).
