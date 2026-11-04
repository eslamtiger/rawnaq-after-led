# V0.2 acceptance evidence

The authoritative actual-data reports are `v02-live-test-results.json`, `v02-access-test-results.json`, and `v02-live-metrics-results.json` in this directory. Tests use publishable-key HTTPS requests with separate real Supabase anonymous identities and explicit expiring membership, never a service-role client or localStorage adapter.

Completed A–E: first successful response, independent qualification, booking milestone, follow-up/lost, no-response follow-up/lost, appointment attendance, no-show and linked rebooking. Fresh reads from both identities match leads/activities/appointments, including next actions; a second-identity edit is visible in a new first-identity read.

Negative tests cover missing/stale revision, duplicate corrected contact, impossible calendar date, future inquiry, contact before inquiry, completed first-response task, missing follow-up date, BOOKED without appointment and past appointment. Rescheduling and blank result notes preserve original/history notes. Independent access tests reject an unprovisioned anonymous account, unauthenticated access and direct table writes. Expired QA membership is tested in the complete local migration chain.

Actual-data dashboard cohort: 6 unique leads, 4 ever booked, 3 attended, 1 ever no-show, 2 lost, 1 active; 6 appointment records after no-show/rebook and reschedule. JSON round-trip preserves lead/appointment/activity/profile relationships.

`npm test`: 20 tests passed, zero failed. Includes historical V0.1 regression (explicitly labelled), V0.2 migration-chain workflow tests, calendar/DST, metrics/queue and DOM conditional-form tests. Those isolated tests are not presented as live acceptance.

Known intentional boundaries: synthetic data only; production authorization, integrations and redesign remain outside this QA release. Expiring anonymous enrollment is not a production login model. Security advisors retain intentional authenticated SECURITY DEFINER RPC warnings, temporary-anonymous policy warnings, and pre-existing disabled leaked-password protection. These must not be reported as a clean production security audit.

Preview verification and exact commit are recorded separately after deployment. The original QA deployment is preserved.
