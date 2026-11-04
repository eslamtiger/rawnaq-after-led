# RAWNAQ After-Lead Sales — V0.2 Core Pilot

Incremental correction of the existing RAWNAQ application. Branch: `fix/rawnaq-v0-2-core-pilot`. No replacement product or browser CRM adapter.

The operational source of truth is Supabase project `uucdnakounzqeqwkzfel`. Leads, next actions, activities, appointments, QA and configuration are fetched from PostgreSQL. RLS remains enabled; direct client writes are revoked. Only explicitly enrolled RAWNAQ team members share the workspace. Anonymous QA identities require expiring enrollment; anonymous sign-in alone has no data access.

**Synthetic QA data only. Production Auth/authorization require a separate QA round before real customer data.**

## Run and build

Node 22.12+ (Preview uses Node 24), pinned dependencies and lockfile:

```sh
npm ci
npm run check
npm test
npm run build
npm run dev
```

Copy `.env.example` to an untracked local environment file and configure the Supabase URL and publishable key. Never use a service-role key in the client. Production QA-anonymous flag defaults false. Preview may set `VITE_QA_ANONYMOUS=true`, the user-approved QA opening can provision temporary sales membership automatically until 2026-11-06 19:58 Cairo. Outside an explicitly activated QA-only window, enrollment stays closed. Permanent accounts use the existing Supabase password login and profiles/RLS model.

Apply the committed SQL migrations in order, then seed configuration once from `supabase/seed.sql`. The original source migration `202611040001_initial.sql` corresponds to the server history entry `20261104001445 rawnaq_initial`; preserve that historical mapping when baselining an existing project. Do not rerun initial schema creation against the live database.

## Pilot behavior

- Lifecycle: NEW, ACTIVE, FOLLOW_UP, BOOKED, NO_SHOW, ATTENDED, LOST.
- Independent qualification: UNKNOWN, QUALIFIED, NOT_QUALIFIED.
- Independent temperature: HOT, WARM, COLD; nullable until assessed.
- Booking Offered is an independent timestamp/event.
- Rebooking and rescheduling preserve old appointments, original notes, distinct outcome notes and linked history.
- Progressive forms require only relevant fields. Atomic RPCs reject invalid dates/states, duplicates and missing/stale revisions.
- Cairo operational queues and appointment views; actual Supabase dashboard counts unique leads for conversion metrics.
- Lead identity/acquisition corrections retain audit history. Admin full JSON backup retains relational IDs; management CSV is separate.
- Network/database failure displays a retry/error state and never creates an empty local workspace.

See [V02_CONTRACT.md](docs/V02_CONTRACT.md) for exact validation, metric and security semantics. Database/API codes retain the repository's lowercase convention.

## Verification

`npm test` includes historical V0.1 migration regression, V0.2 full migration-chain/database workflows, strict dates, counts, queue boundaries and DOM/form tests. These isolated tests supplement, and do not replace, actual Supabase acceptance.

Actual acceptance scripts:

- `tests/supabase-live.py`: A–E workflows, two independent anonymous sessions, shared relational reads, cross-session edits, history/notes, invalid operations.
- `tests/supabase-access.py`: unprovisioned anonymous, unauthenticated and direct-write rejection.
- `tests/supabase-snapshot.py` then `node tests/live-metrics.mjs`: actual-data dashboard cohort and JSON relationships.

Session JSON files and key-file inputs are local test credentials, never committed. The live workflow script supports session/key path environment overrides. Live tests create visibly synthetic QA records. Test reports under `docs/v02-*-results.json` record actual results, without tokens.

Deploy only a new Preview after acceptance. Do not promote or replace the existing QA deployment before review. Use the recorded commit and pinned source/lockfile, with configuration in environment variables. The final deployment report identifies any Git-integration fallback and the exact deployed source commit.
