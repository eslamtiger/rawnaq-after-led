import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeContact,
  contactValid,
  cairoDay,
  cairoISO,
  localInput,
  qaScore,
  metrics,
  queue,
  priority,
  safeCSV,
  followupBucket,
  appointmentMatches,
  STAGES,
  QUALIFICATIONS,
  GRADES,
} from "../src/domain.js";
test("Egyptian numbers normalize and duplicate safely", () => {
  assert.equal(normalizeContact("٠١٠ ١٢٣٤ ٥٦٧٨"), "+201012345678");
  assert.equal(normalizeContact("00201012345678"), "+201012345678");
  assert.ok(contactValid("@client_1"));
  assert.ok(!contactValid("bad phone"));
});
test("Cairo wall times round trip in summer and winter", () => {
  for (const w of ["2026-11-04T11:30", "2026-07-04T11:30"])
    assert.equal(localInput(cairoISO(w)), w);
  assert.equal(cairoDay("2026-11-03T23:15:00Z"), "2026-11-04");
});
test("QA excludes non applicable, never gives healthy zero for no data", () => {
  assert.equal(qaScore({}), null);
  assert.equal(qaScore({ response: 5, greeting: 10, booking: null }), 75);
  assert.throws(() => qaScore({ booking: 16 }));
});
test("Cohort rates, future visits, cancellations and historic booked deduplication", () => {
  const now = Date.parse("2026-11-04T12:00Z");
  const ls = [
    {
      id: "1",
      received_at: "2026-11-01T12:00Z",
      first_response_at: "2026-11-01T12:05Z",
      first_booked_at: "2026-11-02T10:00Z",
      qualified_at: "2026-11-01T12:05Z",
    },
    { id: "2", received_at: "2026-11-01T12:00Z" },
  ];
  const m = metrics(
    ls,
    [
      { lead_id: "1", starts_at: "2026-11-02T12:00Z", status: "no_show" },
      { lead_id: "1", starts_at: "2026-11-03T12:00Z", status: "attended" },
      { lead_id: "1", starts_at: "2026-11-05T12:00Z", status: "scheduled" },
      { lead_id: "1", starts_at: "2026-11-03T12:00Z", status: "cancelled" },
      { lead_id: "other", starts_at: "2026-11-03T12:00Z", status: "attended" },
    ],
    now,
  );
  assert.equal(m.booked, 1);
  assert.equal(m.dueAppointments, 2);
  assert.equal(m.attended, 1);
  assert.equal(m.response, 5);
  assert.equal(metrics([], []).response, null);
});
test("Queue excludes closed leads and prioritizes unanswered then older tasks", () => {
  const now = Date.parse("2026-11-04T12:00Z");
  const rows = [
    { id: "closed", stage: "lost" },
    {
      id: "today",
      stage: "follow_up",
      first_response_at: "2026-11-01T10:00Z",
      next_at: "2026-11-04T11:00Z",
    },
    {
      id: "overdue",
      stage: "follow_up",
      first_response_at: "2026-11-01T10:00Z",
      next_at: "2026-11-02T11:00Z",
    },
    { id: "new", stage: "new", next_at: "2026-11-04T11:00Z" },
  ];
  assert.deepEqual(
    queue(rows, now).map((x) => x.id),
    ["new", "overdue", "today"],
  );
});
test("Export escapes spreadsheet formula injection", () => {
  const csv = safeCSV([['=IMPORTXML("bad")', "+20101", "normal"]]);
  assert.ok(csv.includes("'=IMPORTXML"));
  assert.ok(csv.includes("'+20101"));
});

test("Reject impossible calendar values and classify same-day overdue", () => {
  for (const v of [
    "2027-02-30T12:00",
    "2027-04-31T12:00",
    "2027-13-01T12:00",
    "2027-01-01T25:00",
  ])
    assert.throws(() => cairoISO(v));
  assert.ok(cairoISO("2028-02-29T12:00"));
  const now = Date.parse("2026-11-04T08:00:00Z");
  const lead = {
    stage: "contacted",
    first_response_at: "2026-11-04T06:00:00Z",
    next_at: "2026-11-04T07:00:00Z",
  };
  assert.equal(priority(lead, now), 1);
});

test("V02 independent concepts, timestamp queues and appointment buckets", () => {
  assert.deepEqual(Object.keys(STAGES), [
    "new",
    "active",
    "follow_up",
    "booked",
    "no_show",
    "attended",
    "lost",
  ]);
  assert.deepEqual(Object.keys(QUALIFICATIONS), [
    "unknown",
    "qualified",
    "not_qualified",
  ]);
  assert.deepEqual(Object.keys(GRADES), ["hot", "warm", "cold"]);
  const now = Date.parse("2026-11-04T08:00Z");
  assert.equal(
    followupBucket({ stage: "follow_up", next_at: "2026-11-04T07:00Z" }, now),
    "overdue",
  );
  assert.equal(
    followupBucket({ stage: "follow_up", next_at: "2026-11-04T09:00Z" }, now),
    "today",
  );
  assert.equal(
    followupBucket({ stage: "follow_up", next_at: "2026-11-05T07:00Z" }, now),
    "upcoming",
  );
  assert.equal(
    followupBucket({ stage: "lost", next_at: "2026-11-04T07:00Z" }, now),
    null,
  );
  assert.ok(
    appointmentMatches(
      { starts_at: "2026-11-05T07:00Z", status: "scheduled" },
      "upcoming",
      now,
    ),
  );
  assert.ok(
    !appointmentMatches(
      { starts_at: "2026-11-05T07:00Z", status: "rescheduled" },
      "upcoming",
      now,
    ),
  );
  const m = metrics(
    [{ id: "a", first_booked_at: "2026-11-01T12:00Z" }],
    [
      { lead_id: "a", status: "attended" },
      { lead_id: "a", status: "attended" },
      { lead_id: "a", status: "no_show" },
    ],
    now,
  );
  assert.equal(m.attended, 1);
  assert.equal(m.booked, 1);
  assert.equal(m.noShow, 1);
});

import { servicePrice, periodRange, journey, serviceStats } from "../src/domain.js";

test("servicePrice reads only valid numbers", () => {
  assert.equal(servicePrice({ meta: { price: 1500 } }), 1500);
  assert.equal(servicePrice({ meta: { price: "1500" } }), null);
  assert.equal(servicePrice({ meta: {} }), null);
  assert.equal(servicePrice({ meta: { price: -1 } }), null);
});

test("periodRange uses Cairo calendar days", () => {
  const now = Date.parse("2026-11-05T03:30:00Z"); // 05:30 Cairo
  const [a] = periodRange("today", now);
  assert.equal(new Date(a).toISOString(), "2026-11-04T22:00:00.000Z");
  const [m] = periodRange("month", now);
  assert.equal(new Date(m).toISOString(), "2026-10-31T22:00:00.000Z");
  assert.deepEqual(periodRange("all", now), [-Infinity, Infinity]);
});

test("journey counts unique leads per step and finds the biggest drop", () => {
  const leads = [
    { id: "a", received_at: "2026-11-04T10:00:00Z", first_response_at: "2026-11-04T10:05:00Z", booking_offered_at: "2026-11-04T11:00:00Z", first_booked_at: "2026-11-04T12:00:00Z" },
    { id: "b", received_at: "2026-11-04T10:00:00Z", first_response_at: "2026-11-04T10:05:00Z" },
    { id: "c", received_at: "2026-11-04T10:00:00Z" },
    { id: "d", received_at: "2026-11-04T10:00:00Z" },
  ];
  const appts = [{ lead_id: "a", status: "attended", starts_at: "2026-11-05T10:00:00Z" }];
  const j = journey(leads, appts, [-Infinity, Infinity]);
  assert.deepEqual(j.steps.map((s) => s[2]), [4, 2, 1, 1, 1]);
  assert.equal(j.worst.key, "replied");
});

test("serviceStats estimates revenue only where a price exists", () => {
  const now = Date.parse("2026-11-05T00:00:00Z");
  const services = [
    { id: "s1", label: "أ", meta: { price: 1000 } },
    { id: "s2", label: "ب", meta: {} },
  ];
  const leads = [
    { id: "a", service_id: "s1", received_at: "2026-11-01T00:00:00Z", first_booked_at: "2026-11-02T00:00:00Z" },
    { id: "b", service_id: "s1", received_at: "2026-11-01T00:00:00Z", first_booked_at: "2026-11-02T00:00:00Z" },
    { id: "c", service_id: "s2", received_at: "2026-11-01T00:00:00Z", first_booked_at: "2026-11-02T00:00:00Z" },
  ];
  const appts = [
    { lead_id: "a", status: "attended", starts_at: "2026-11-03T00:00:00Z" },
    { lead_id: "b", status: "confirmed", starts_at: "2026-11-06T00:00:00Z" },
    { lead_id: "c", status: "attended", starts_at: "2026-11-03T00:00:00Z" },
  ];
  const s = serviceStats(leads, appts, services, [-Infinity, Infinity], now);
  const s1 = s.rows.find((r) => r.id === "s1"), s2 = s.rows.find((r) => r.id === "s2");
  assert.equal(s1.revenue, 1000);
  assert.equal(s1.pipeline, 1000);
  assert.equal(s2.revenue, null);
  assert.equal(s.total.revenue, 1000);
  assert.equal(s.total.missingPrices, 1);
});
