# RAWNAQ V0.2 pilot contract

Operational persistence is Supabase PostgreSQL. `src/api.js` reads all six tables and calls atomic validated RPCs. There is no browser CRM adapter, localStorage data or offline empty-workspace fallback. sessionStorage contains authentication only. A load failure replaces the workspace with an Arabic retry state; failed mutations never show success.

## Independent concepts

API/database codes follow the repository's lowercase convention; business labels are NEW, ACTIVE, FOLLOW_UP, BOOKED, NO_SHOW, ATTENDED, LOST. Qualification is UNKNOWN / QUALIFIED / NOT_QUALIFIED. Temperature is HOT / WARM / COLD, nullable until assessed. `qualified_at` is historical, not current qualification. Booking Offered is solely `booking_offered_at`, recorded by `offer_booking`, without changing lifecycle.

## Validation boundary

The authoritative contract is the migrated RPCs, table constraints and `v02_validate_lead`. The UI uses these same operations, progressive required fields, and strict `cairoISO` component validation before timestamp conversion. PostgreSQL rejects impossible calendar timestamps independently. Invalid operations are never silently normalized.

- Inquiry time is required and cannot be future; contact must be between inquiry and now.
- A successful first response must advance beyond `first_reply`; `no_answer` cannot count as first successful response.
- Open leads require an allowed next action and timestamp. FOLLOW_UP must have both.
- BOOKED can only be reached through an actual future appointment. Attendance/no-show cannot be recorded before appointment time, or twice.
- LOST needs an active configured reason and clears irrelevant follow-up fields. ATTENDED does not need follow-up dates.
- QUALIFIED requires an assessed need. Qualification and temperature never double as lifecycle stages.
- Lead mutations lock the row and reject null, invalid or stale expected revision. All operational writes run atomically.
- Contacts are normalized consistently, then constrained unique, including identity corrections.
- Business display/filter dates use Africa/Cairo, including DST. Canonical timestamps are timestamptz/UTC.

## History

Appointments have immutable original `note`, separate reschedule/no-show/attendance/rebooking notes, outcome note and a stable `previous_appointment_id`. Rescheduling closes the old appointment as `rescheduled` and inserts a replacement. Rebooking a no-show inserts a new appointment, preserving the no-show row. Blank notes never erase prior notes.

Activities retain actor, type, lead ID, `recorded_at` (generated from created_at), occurred_at and JSON details. Field changes include old/new values. Contact events record outcome, contact time and next action/date; milestone, booking, rebooking, reschedule and outcome events preserve relevant IDs and notes. Clients have no UPDATE/DELETE grants on history.

## Shared access and temporary QA

All explicitly enrolled, active RAWNAQ members share the team workspace. This is the approved two-employee access model, not public visibility. RLS stays enabled on every operational table. The anon role has no data grants. Anonymous authentication alone confers no membership. Anonymous QA profiles also require a future `qa_expires_at`; test memberships expire after 48 hours. No public enrollment/admin creation path exists. Direct client writes are revoked; membership/admin checks remain inside RPCs. Owner reassignment, configuration, QA review and team administration remain admin-only.

`VITE_QA_ANONYMOUS=true` is a Preview-only login mechanism. Production defaults false and retains Supabase password authentication. Anonymous QA is not the final production authorization model. No real customer data is authorized until production Auth/RLS has separate QA approval.

## Metrics and operational views

Dashboard values come from Supabase records in the selected received-date/source/owner/lifecycle cohort. Total, active (all nonterminal), offered, booked at least once, attended at least once, ever no-show and lost count unique leads. Lead→booking = unique booked / total; booking→attendance = unique attended / unique booked. Repeated appointments and status changes do not inflate these counts. A recovered client may appear in both historical no-show and attendance metrics. Appointments without a result count appointments, explicitly labelled. Rep performance uses current ownership, not attribution to each historical actor. Source/service performance and lost reasons use actual configuration references.

Overdue means next_at < now, including earlier today. Today means remaining actions today in Cairo; Upcoming means later days. The buckets do not overlap. Appointment Today/Upcoming/Past and status views use actual timestamps; Upcoming excludes cancelled/rescheduled/outcome rows. Upcoming sorts soonest first; Past sorts newest first.

## Export and reproducibility

Admin full JSON export includes schema version, export time, timezone, leads, appointments, activities, QA reviews, profiles and configuration with stable IDs/relationships. This is separate from the management CSV. It excludes authentication credentials and is not an Auth-user backup. Auth accounts need independent provisioning when restoring to another Supabase project. No restore UI is included.

Source and lockfile are committed to the existing V0.2 branch. Public connection values and the Preview QA flag are deployment environment variables; no service-role credentials are used in frontend or acceptance tests. The tested Preview must identify its Git commit; the old QA deployment must remain unchanged.

Anonymous QA tabs use separate Auth storage/broadcast keys so concurrent tabs retain independent identities across refresh. This does not change operational Supabase storage or production authentication.
