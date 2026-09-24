# riistareitit — server

The backend API. Node.js + TypeScript, [Fastify](https://fastify.dev/), Postgres via
[Prisma](https://www.prisma.io/). See `docs/SPEC.md` at the repo root for the full data
model and architecture context — this README only covers running it locally.

## First-time setup

From the repo root:

```sh
docker compose up -d          # starts local Postgres on localhost:5433
                               # (add `sudo` if your user can't reach the Docker
                               # daemon socket — some machines lock this down)
cd server
cp .env.example .env          # defaults already match docker-compose.yml
npm install
npm run prisma:migrate        # applies migrations (none yet beyond the initial no-op)
```

Port 5433, not Postgres's usual 5432: on machines that already run a native/system
Postgres on 5432, the container needs a different host port to avoid a bind conflict.
If 5433 is also taken on your machine, change both `docker-compose.yml`'s port mapping
and `DATABASE_URL` in your `.env` to whatever's free.

## Day to day

```sh
npm run dev                   # starts the API with auto-reload, http://localhost:3001
```

Check it's actually talking to the database:

```sh
curl http://localhost:3001/health
# {"status":"ok","db":"connected"}
```

## Other scripts

- `npm run build` / `npm run start` — compile and run the production build.
- `npm run lint` — ESLint.
- `npm run prisma:generate` — regenerate the Prisma client after editing `prisma/schema.prisma`.
- `npm run prisma:migrate` — create and apply a new migration in development.
- `npm run prisma:deploy` — apply existing migrations without generating a new one (CI/prod).

## Environment variables

See `.env.example` for the full list. `DATABASE_URL` must match whatever Postgres
`docker-compose.yml` (or your own instance) is actually running.
