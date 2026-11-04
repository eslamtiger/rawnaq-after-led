# RAWNAQ V0.2 checkpoint — 2026-11-04

Continue the existing branch `fix/rawnaq-v0-2-core-pilot`; do not rebuild or switch to browser-local storage.

Implemented source: independent lifecycle/qualification/temperature; booking-offered milestone; NO_SHOW and recovery; Supabase persistence; strict Cairo dates and concurrency; structured activity timeline; preserved notes/linked appointments; operational queues/views; dashboard; conditional forms; identity correction; full JSON export; minimum text readability.

Actual acceptance has passed in Supabase project `uucdnakounzqeqwkzfel`: see `v02-live-test-results.json`, `v02-access-test-results.json` and `v02-live-metrics-results.json`. These are actual HTTPS tests using two independent anonymous identities, explicitly enrolled for 48 hours. No service-role browser key, open enrollment or disabled RLS. Local full suite: 20 passed.

Canonical migration files include all applied V0.2 changes; original initial-file/server-version mapping is documented in README. New migrations were applied only after rechecking zero operational leads/appointments/activities. Synthetic QA records now exist; do not assume the database is empty again. Keep history and migration records intact.

Existing QA deployment to preserve: `https://rawnaq-sales-demo-lt6ppvzdx-eslamba7r1991-8820.vercel.app`. New Preview deployment must identify this branch's exact Git commit and use actual Supabase. Deployment status and URL are verified through Vercel and the final delivery message, not inferred from a local build.

Preview-only anonymous QA flag never grants membership. New anonymous identities see an access-request state until explicitly enrolled with an expiry. Production password Auth/authorization need separate QA before real customer data.

Known security-advisor notices: intentional membership-checked authenticated SECURITY DEFINER RPCs; temporary anonymous policy notices; pre-existing disabled leaked-password protection. Do not claim a production security clearance.
