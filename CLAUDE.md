Read the README.md in this folder for instructions. Subfolders also have README.md, once there are subfolders.

## Tech stack

- **Frontend:** TypeScript + React
- **Database:** Postgres

Don't introduce a different language, framework, or database without an explicit instruction — see "How to work here" below.

## Linear workflow

Ticketing lives in Linear, team **Riistareitit** (`RII`), repo synced via the Linear↔GitHub integration to `mko3000/riistareitit` (confirmed working — opening a PR with `RII-N` in it links and drives issue status automatically).

### Backlog structure

- Two projects split scope: **MVP** (core features — track import, map display, sighting/kill logging, base Finnish UI) and **Post-MVP** (accounts, hunting parties, area borders, filtering, fog of war, English i18n). Work MVP issues before Post-MVP ones.
- Multi-part features are **epics with sub-issues** — e.g. `RII-2` "Import track data in common formats" has one sub-issue per format (GPX, KML, Google Fit, Apple, JSON, plus a research spike for anything else); `RII-4` "Add bird sightings and kills" has one sub-issue per piece of that flow (data model, species picker, tap-to-add UX, edit, delete). **Pick up sub-issues, not epics** — an epic is a tracker for its children, not directly actionable work. An epic with no sub-issues (e.g. `RII-3` "Show imported track on map") is directly actionable.
- Labels: `Feature` (all current issues), `Bug` (defects found later), `Improvement` (refinements to shipped features).
- A couple of Post-MVP issues (`RII-9` Admin user role, `RII-10` Hunting parties) are intentionally underspecified placeholders — read their description for the open question and get it resolved (ask, don't assume) before implementing.

### Issue lifecycle

1. Pick an unstarted issue (`Backlog`/`Todo`) from **MVP** first, unless told otherwise.
2. Move it to `In Progress` when you start.
3. Branch using the name Linear suggests for the issue (its `gitBranchName`, e.g. `mikopaajanen/rii-25-import-gpx-format`) so the GitHub integration matches the PR to the issue automatically.
4. Follow the spec-first workflow below, implement, commit referencing `RII-N`.
5. Open a PR with `RII-N` in the title and the Agent report block filled in (see below). Let the Linear↔GitHub integration move status on PR open/merge rather than hand-flipping it once a PR exists.
6. If an issue turns out obsolete or wrong, set it to `Canceled` — there's no delete via the MCP tools, and cancel (not a silent `Done`) is the correct cleanup path for anything that wasn't actually completed as scoped.

## Specification workflow (mandatory)

`docs/SPEC.md` is the source of truth for the riistareitit app. Before making any change:

1. **Read `docs/SPEC.md`** — understand the current state of the system.
2. **If it doesn't exist yet, create it first.** Draft it from the current code, or from the feature list given in the issue if the codebase is still empty. Don't skip straight to code on a repo with no spec.
3. **Update `docs/SPEC.md` first** — if your change affects behaviour, data structures, API contracts, screen flows, env vars, or the DB schema, edit the spec before writing code.
4. **Commit spec updates alongside code** — the spec and code must stay in sync.

This applies to all changes: features, bug fixes, refactors, and config changes. The spec must be detailed enough to rebuild the full codebase from scratch.

---

## Automated agent guidance (Claude Code / GitHub Actions)

The rules below apply in addition to the specification workflow above. The spec-first
workflow is mandatory for automated changes too: read (or create) `docs/SPEC.md` first,
update it before writing code, and commit spec changes alongside code.

### How to work here

- Match existing code style and patterns. Read neighbouring files before writing new ones; do not introduce new libraries, frameworks, or patterns without a clear reason stated in the PR.
- Keep changes scoped to the issue. Do not opportunistically refactor unrelated code in the same PR.
- Write or update tests for any behavioural change. If you cannot run the tests, say so explicitly.
- **Testing conventions** (`RII-36`; full setup in `docs/SPEC.md` §3 "Testing"):
  - Frontend: `npm test` at the repo root; tests next to the code as `src/**/*.test.ts`. Logic only (parsers, formatting, API client) — no component tests for now.
  - Server: `npm test` in `server/`; route tests in `server/test/*.test.ts` using `app.inject()` against the `riistareitit_test` database (needs the local Docker Postgres running). Tests must never use the dev database or read/write `server/.env` — the setup refuses any database not named `*_test`.
  - Test data is small and synthetic. **Never** put real exported location data (e.g. anything from `data_import/`) in a test or fixture. A throwaway local check against real files is fine if it is deleted and not committed.
  - A PR that changes behaviour includes tests for it. Run lint, build/typecheck and tests for every side you touched before pushing.
  - "Tests pass" in an Agent report means the **CI run on the PR** passed (GitHub Actions, `.github/workflows/ci.yml`), not just a local run. If CI hasn't finished or failed, say so.
- Conventional commit messages. Reference the Linear issue ID (`RII-N`) in both the commit message and the PR title/body — Linear's status automation only recognizes its own IDs, not GitHub's issue numbers, so a PR without `RII-N` in it won't move the ticket.
- **Code in English, UI in Finnish** (Miko, 2026-09-25). Identifiers, comments, commit messages, DB values that code matches against (e.g. `species.key`) — all English. Anything a user actually sees — labels, button text, `species.name_fi`, error messages shown in the UI — Finnish, per `RII-7`. Don't pick a Finnish word for a code-facing identifier just because the domain concept is Finnish (e.g. a species' `key` is `'capercaillie'`, not `'metso'` — `name_fi` is where `'Metso'` belongs).

### Hard boundaries — do NOT touch without an explicit human instruction in the issue

- **Auth / accounts / sessions / tokens / secrets handling**, if and when these exist.
- **Location / route / sighting data** — this app stores where a real person has physically been. Treat it like PII: don't change how it's stored, retained, exported, or shared without explicit instruction.
- **Database migrations** that drop or rename columns/tables, or that are non-reversible.
- **Billed third-party API usage** (e.g. Mapbox, or any paid map/geocoding service) — don't change call patterns, caching, or rate limits in ways that could spike cost.
- **CI/CD, deploy config, secrets, environment variables.**

If an issue seems to require touching one of these, STOP and instead post a comment describing what you would change and why, and ask for explicit human confirmation. Do not open a code PR for it.

### Required PR self-report

Every PR you open MUST include this block in the description, filled in honestly:

```
## Agent report
- **What I changed:** <concise summary>
- **Why this addresses the issue:** <reasoning>
- **What I assumed:** <assumptions made because the issue was underspecified>
- **What I could NOT verify:** <tests not run, environments not reachable, edge cases unchecked>
- **Confidence:** <low | medium | high> — <one line justification>
- **Suggested reviewer focus:** <where a human should look hardest>
```

If confidence is low, say so plainly. A low-confidence honest PR is more useful than a confident wrong one.

### Don'ts

- Never commit secrets, API keys, tokens, or `.env` contents.
- Never push directly to `main`. Always open a PR from a feature branch.
- Never merge your own PR.
- Do not weaken or delete existing tests to make CI pass.
