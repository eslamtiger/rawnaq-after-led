import test from "node:test";
import assert from "node:assert/strict";
import {
  computeTemperature,
  effectiveTemperature,
  lastContactOf,
} from "../src/domain.js";
import {
  journeyStage,
  defaultReplyState,
  pickReplies,
  fillTemplate,
  buildChecklist,
  checklistKey,
  checklistProgress,
  savedChecklist,
  leadBrief,
  tagsOf,
  REPLY_STATES,
} from "../src/assistant.js";
import { QA } from "../src/domain.js";

const now = Date.parse("2026-11-10T12:00:00Z");
const hoursAgo = (h) => new Date(now - h * 3600000).toISOString();
const base = (o = {}) => ({
  id: "L1",
  stage: "active",
  qualification: "unknown",
  received_at: hoursAgo(30),
  first_response_at: hoursAgo(29),
  source_id: "src_meta",
  last_outcome: null,
  grade: null,
  ...o,
});
const contact = (h, outcome) => ({ at: now - h * 3600000, outcome });

test("Temperature: hot needs interest plus an offered booking or fresh interest", () => {
  const r = computeTemperature(
    base({ booking_offered_at: hoursAgo(5), last_outcome: "interested" }),
    { lastContact: contact(5, "interested") },
    now,
  );
  assert.equal(r.temp, "hot");
  assert.ok(r.reasons.includes("offered_and_interested"));
  const fresh = computeTemperature(
    base({ last_outcome: "interested" }),
    { lastContact: contact(10, "interested") },
    now,
  );
  assert.equal(fresh.temp, "hot");
  assert.ok(fresh.reasons.includes("interested_last_24h"));
});

test("Temperature: referral and walk-in sources start hot", () => {
  for (const source_id of ["src_referral", "src_walkin"]) {
    const r = computeTemperature(
      base({ source_id, stage: "new", first_response_at: null }),
      {},
      now,
    );
    assert.equal(r.temp, "hot");
  }
});

test("Temperature: an objection blocks hot but keeps an engaged lead warm", () => {
  const r = computeTemperature(
    base({
      objection_id: "obj_price",
      booking_offered_at: hoursAgo(5),
      last_outcome: "interested",
    }),
    { lastContact: contact(5, "interested") },
    now,
  );
  assert.equal(r.temp, "warm");
  assert.ok(r.reasons.includes("objection_blocks_hot"));
});

test("Temperature: information or a reply within 3 days is warm", () => {
  const info = computeTemperature(
    base({ last_outcome: "information" }),
    { lastContact: contact(40, "information") },
    now,
  );
  assert.equal(info.temp, "warm");
});

test("Temperature: no_answer, later and refused are cold", () => {
  for (const o of ["no_answer", "later"]) {
    const r = computeTemperature(
      base({ last_outcome: o }),
      { lastContact: contact(2, o) },
      now,
    );
    assert.equal(r.temp, "cold");
  }
  const refused = computeTemperature(base({ last_outcome: "refused" }), {}, now);
  assert.equal(refused.temp, "cold");
  assert.equal(refused.state, "reactivation");
});

test("Temperature: 72 hours of silence lowers one level", () => {
  const hot = computeTemperature(
    base({ booking_offered_at: hoursAgo(90), last_outcome: "interested" }),
    { lastContact: contact(80, "interested") },
    now,
  );
  assert.equal(hot.temp, "warm");
  assert.ok(hot.reasons.includes("quiet_72h"));
  const warm = computeTemperature(
    base({ last_outcome: "information", received_at: hoursAgo(120) }),
    { lastContact: contact(80, "information") },
    now,
  );
  assert.equal(warm.temp, "cold");
});

test("Temperature: leads older than 7 days that never booked are cold", () => {
  const r = computeTemperature(
    base({
      received_at: hoursAgo(24 * 9),
      last_outcome: "interested",
      booking_offered_at: hoursAgo(5),
    }),
    { lastContact: contact(5, "interested") },
    now,
  );
  assert.equal(r.temp, "cold");
  assert.ok(r.reasons.includes("stale_7d"));
  const booked = computeTemperature(
    base({
      received_at: hoursAgo(24 * 9),
      first_booked_at: hoursAgo(24 * 5),
      last_outcome: "interested",
    }),
    { lastContact: contact(5, "interested") },
    now,
  );
  assert.notEqual(booked.reasons.includes("stale_7d"), true);
});

test("Temperature: an active appointment leaves the system (pre-visit); lost is reactivation", () => {
  const booked = computeTemperature(
    base({ stage: "booked" }),
    { appointments: [{ lead_id: "L1", status: "confirmed" }] },
    now,
  );
  assert.equal(booked.temp, null);
  assert.equal(booked.state, "previsit");
  const lost = computeTemperature(base({ stage: "lost" }), {}, now);
  assert.equal(lost.temp, "cold");
  assert.equal(lost.state, "reactivation");
  const attended = computeTemperature(base({ stage: "attended" }), {}, now);
  assert.equal(attended.temp, null);
  assert.equal(attended.state, "after_visit");
});

test("Temperature: no signal on a fresh lead stays unassessed, never invented", () => {
  const r = computeTemperature(
    base({ stage: "new", first_response_at: null, received_at: hoursAgo(1) }),
    {},
    now,
  );
  assert.equal(r.temp, null);
});

test("Temperature: manual override wins, empty means automatic", () => {
  const lead = base({
    last_outcome: "no_answer",
    grade: "hot",
  });
  const eff = effectiveTemperature(lead, { lastContact: contact(2, "no_answer") }, now);
  assert.equal(eff.temp, "hot");
  assert.equal(eff.mode, "manual");
  assert.equal(eff.suggested, "cold");
  const auto = effectiveTemperature({ ...lead, grade: null }, { lastContact: contact(2, "no_answer") }, now);
  assert.equal(auto.temp, "cold");
  assert.equal(auto.mode, "auto");
  const junk = effectiveTemperature({ ...lead, grade: "bogus" }, {}, now);
  assert.equal(junk.mode, "auto");
});

test("lastContactOf picks the newest contact activity of that lead only", () => {
  const acts = [
    { lead_id: "L1", kind: "contact", body: "old", created_at: hoursAgo(50), details: { contact_at: hoursAgo(50), outcome: "later" } },
    { lead_id: "L1", kind: "contact", body: "new", created_at: hoursAgo(3), details: { contact_at: hoursAgo(4), outcome: "interested", first_reply: true } },
    { lead_id: "L1", kind: "field_changed", body: "x", created_at: hoursAgo(1), details: {} },
    { lead_id: "L2", kind: "contact", body: "other", created_at: hoursAgo(0), details: { outcome: "refused" } },
  ];
  const c = lastContactOf(acts, "L1");
  assert.equal(c.summary, "new");
  assert.equal(c.first_reply, true);
  assert.equal(c.count, 2);
  assert.equal(c.first_reply, true);
  assert.equal(lastContactOf([], "L1"), null);
});

test("Journey stage maps the current model to the document's vocabulary", () => {
  assert.equal(journeyStage({ stage: "new" }), "new");
  assert.equal(journeyStage({ stage: "active", qualification: "unknown" }), "discovery");
  assert.equal(journeyStage({ stage: "active", qualification: "qualified" }), "qualified");
  assert.equal(journeyStage({ stage: "follow_up", qualification: "qualified", booking_offered_at: "x" }), "booking_offered");
  assert.equal(journeyStage({ stage: "follow_up", qualification: "unknown" }), "follow_up");
  assert.equal(journeyStage({ stage: "active", qualification: "not_qualified" }), "unqualified");
  assert.equal(journeyStage({ stage: "no_show" }), "no_show");
});

test("Default reply state follows the lead's situation", () => {
  assert.equal(defaultReplyState({ stage: "new" }), "s1");
  assert.equal(defaultReplyState({ stage: "booked", first_response_at: "x" }), "s8");
  assert.equal(defaultReplyState({ stage: "no_show" }), "s9");
  assert.equal(defaultReplyState({ stage: "lost" }), "s10");
  assert.equal(defaultReplyState({ stage: "attended" }), "s11");
  assert.equal(defaultReplyState({ stage: "active", first_response_at: "x", last_outcome: "no_answer" }), "s5");
  assert.equal(defaultReplyState({ stage: "active", first_response_at: "x", last_outcome: "later" }), "s4");
  assert.equal(defaultReplyState({ stage: "active", first_response_at: "x", objection_id: "obj_price", last_outcome: "interested" }), "s6");
  assert.equal(defaultReplyState({ stage: "active", first_response_at: "x", booking_offered_at: "y", last_outcome: "interested" }, { temp: "hot" }), "s7");
  assert.ok(Object.keys(REPLY_STATES).includes(defaultReplyState({ stage: "active", first_response_at: "x" })));
});

const rows = [
  { id: "r_hot", category: "script", label: "ساخن", body: "a", active: true, sort_order: 2, meta: { states: ["s1"], temps: ["hot"], why: "سبب", approved: true } },
  { id: "r_cold", category: "script", label: "بارد", body: "b", active: true, sort_order: 1, meta: { states: ["s1"], temps: ["cold"] } },
  { id: "r_any", category: "script", label: "عام", body: "c", active: true, sort_order: 3, meta: { states: ["s1"] } },
  { id: "r_off", category: "script", label: "موقوف", body: "d", active: false, meta: { states: ["s1"] } },
  { id: "script_think", category: "script", label: "تفكر", body: "e", active: true, sort_order: 4, meta: {} },
  { id: "obj_price", category: "objection", label: "السعر", body: "f", active: true, sort_order: 1, meta: {} },
  { id: "obj_fear", category: "objection", label: "القلق", body: "g", active: true, sort_order: 2, meta: {} },
  { id: "src_meta", category: "source", label: "ميتا", active: true, meta: { states: ["s1"] } },
];

test("Replies are filtered by state and temperature; exact temperature first", () => {
  const hot = pickReplies(rows, { state: "s1", temp: "hot" });
  assert.deepEqual(hot.map((r) => r.id), ["r_hot", "r_any"]);
  assert.equal(hot[0].approved, true);
  assert.equal(hot[0].why, "سبب");
  assert.equal(hot[1].approved, false);
  const unassessed = pickReplies(rows, { state: "s1", temp: null });
  assert.deepEqual(unassessed.map((r) => r.id).sort(), ["r_any", "r_cold", "r_hot"]);
});

test("Rows without meta use default tags; inactive rows and other categories never appear", () => {
  assert.deepEqual(pickReplies(rows, { state: "s4", temp: null }).map((r) => r.id), ["script_think"]);
  assert.ok(!pickReplies(rows, { state: "s1", temp: null }).some((r) => r.id === "r_off" || r.id === "src_meta"));
  assert.ok(tagsOf({ id: "script_welcome" }).states.includes("s1"));
});

test("Objection replies narrow to the lead's own objection", () => {
  const all = pickReplies(rows, { state: "s6" });
  assert.deepEqual(all.map((r) => r.id), ["obj_price", "obj_fear"]);
  const one = pickReplies(rows, { state: "s6", objectionId: "obj_fear" });
  assert.deepEqual(one.map((r) => r.id), ["obj_fear"]);
});

test("Every reply carries a training note, falling back to the state note", () => {
  const r = pickReplies(rows, { state: "s6", objectionId: "obj_price" })[0];
  assert.ok(r.why.length > 10);
});

test("Templates fill only known fields; unapproved details stay visible", () => {
  const out = fillTemplate("أهلًا {الاسم}، {الخدمة} بسعر {سعر_معتمد} و{مواعيد_متاحة}", { الاسم: "منى", الخدمة: "فور بلس", سعر_معتمد: "" });
  assert.equal(out.text, "أهلًا منى، فور بلس بسعر {سعر_معتمد} و{مواعيد_متاحة}");
  assert.deepEqual(out.missing, ["سعر_معتمد", "مواعيد_متاحة"]);
  assert.deepEqual(fillTemplate("بدون متغيرات", {}).missing, []);
  assert.equal(fillTemplate(null, {}).text, "");
});

test("Checklist is layered: base + stage + temperature, ends with next step", () => {
  const lead = base({ stage: "active", qualification: "qualified", booking_offered_at: hoursAgo(3), last_outcome: "interested" });
  const items = buildChecklist(lead, { temp: "hot" });
  const ids = items.map((i) => i.id);
  assert.deepEqual(ids.slice(0, 3), ["base_sla", "base_greeting", "base_source"]);
  assert.ok(ids.includes("st_two_slots"));
  assert.ok(ids.includes("hot_slot"));
  assert.equal(ids.at(-1), "end_next");
  assert.equal(new Set(ids).size, ids.length);
});

test("Checklist reacts to temperature, objection, no-show and closed leads", () => {
  const cold = buildChecklist(base({ follow_up_count: 3 }), { temp: "cold" }, { followUpCount: 3 });
  assert.ok(cold.some((i) => i.id === "cold_close"));
  assert.ok(cold.find((i) => i.id === "cold_attempt").label.includes("3/3"));
  const objection = buildChecklist(base({ objection_id: "obj_fear" }), { temp: "warm" }, { objectionLabel: "القلق" });
  assert.ok(objection.find((i) => i.id === "obj_handled").label.includes("القلق"));
  const noObjection = buildChecklist(base(), { temp: "warm" });
  assert.ok(!noObjection.some((i) => i.id === "obj_handled"));
  const noShow = buildChecklist(base({ stage: "no_show" }), { temp: null });
  assert.ok(noShow.some((i) => i.id === "ns_miss") && noShow.some((i) => i.id === "ns_rebook"));
  const closed = buildChecklist(base({ stage: "lost" }), { temp: "cold", state: "reactivation" });
  assert.ok(!closed.some((i) => i.id === "end_next"));
});

test("Checklist items link to the eight QA criteria only", () => {
  const keys = new Set(QA.map(([k]) => k));
  const all = [
    ...buildChecklist(base({ objection_id: "obj_price" }), { temp: "hot" }),
    ...buildChecklist(base({ stage: "booked" }), { temp: null }),
    ...buildChecklist(base({ stage: "new" }), { temp: "warm" }),
  ];
  for (const i of all) if (i.qa) assert.ok(keys.has(i.qa), i.id);
  const prog = checklistProgress(
    buildChecklist(base(), { temp: "warm" }),
    { base_sla: true, base_greeting: true },
  );
  assert.equal(prog.complete, 2);
  assert.equal(prog.byQa.response.done, 1);
  assert.equal(prog.byQa.greeting.total, 1);
});

test("Saved ticks apply only to the same situation; a new contact starts fresh", () => {
  const lead = base();
  const k1 = checklistKey(lead, { temp: "warm" }, 1);
  const k2 = checklistKey(lead, { temp: "warm" }, 2);
  assert.notEqual(k1, k2);
  const acts = [
    { lead_id: "L1", kind: "checklist", created_at: hoursAgo(5), details: { key: k1, done: { base_sla: true } } },
    { lead_id: "L1", kind: "checklist", created_at: hoursAgo(2), details: { key: k1, done: { base_sla: true, base_greeting: true } } },
    { lead_id: "L2", kind: "checklist", created_at: hoursAgo(1), details: { key: k1, done: { x: true } } },
  ];
  assert.deepEqual(savedChecklist(acts, "L1", k1), { base_sla: true, base_greeting: true });
  assert.deepEqual(savedChecklist(acts, "L1", k2), {});
});

test("Lead brief contains every required field from stored data only", () => {
  const lead = base({ name: "منى", service_id: "service_4plus", owner_id: "U1", need: "احتياج", objection_id: "obj_time", follow_up_count: 2, next_action: "follow_up", next_at: hoursAgo(-5), stage: "follow_up" });
  const lookup = { label: (id) => "L:" + id, person: (id) => "P:" + id };
  const b = leadBrief(lead, {
    appointments: [
      { lead_id: "L1", status: "scheduled", starts_at: "2026-11-12T10:00:00Z" },
      { lead_id: "L1", status: "cancelled", starts_at: "2026-11-11T10:00:00Z" },
      { lead_id: "L9", status: "scheduled", starts_at: "2026-11-11T08:00:00Z" },
    ],
    lookup,
    contact: { at: now, outcome: "interested", summary: "ملخص" },
  });
  assert.equal(b.name, "منى");
  assert.equal(b.source, "L:src_meta");
  assert.equal(b.service, "L:service_4plus");
  assert.equal(b.owner, "P:U1");
  assert.equal(b.objection, "L:obj_time");
  assert.equal(b.followUps, 2);
  assert.equal(b.lastContact.summary, "ملخص");
  assert.equal(b.lastContact.outcome, "مازالت مهتمة");
  assert.equal(b.nextAppointment.starts_at, "2026-11-12T10:00:00Z");
  assert.equal(b.nextAction, "متابعة");
  const empty = leadBrief(base({ stage: "new" }), { lookup });
  assert.equal(empty.lastContact, null);
  assert.equal(empty.nextAppointment, null);
});
