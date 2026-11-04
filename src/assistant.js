// Reply assistant, dynamic checklist and lead brief.
// Pure functions only: no DOM, no network. Texts come from `configuration` rows;
// the defaults below only supply tags (states / temperatures) and training notes
// for rows that have no `meta` yet. Everything here is a DRAFT until management
// sets `meta.approved = true` on a row.
import { STAGES, OUTCOMES, ACTIONS, QA, GRADES, QUALIFICATIONS } from "./domain.js";

export const REPLY_STATES = {
  s1: "استفسار أول",
  s2: "سؤال سعر",
  s3: "مهتمة وتسأل تفاصيل",
  s4: "محتاجة تفكر / بعدين",
  s5: "لا ترد",
  s6: "اعتراض",
  s7: "جاهزة للحجز",
  s8: "تأكيد الحجز",
  s9: "لم تحضر",
  s10: "رفض / إعادة تنشيط",
  s11: "بعد الزيارة",
};

// Training notes ("ليه الرد ده؟") per state, from the management draft.
export const STATE_WHY = {
  s1: "سرعة الرد في أول ٥–١٠ دقائق أهم من طول الرسالة. اسألي سؤالًا واحدًا فقط: عرض الحجز لو جاهزة، أو فهم المشكلة لو لسه.",
  s2: "نوضّح القيمة والوضوح من غير ذكر رقم غير معتمد، ونرجع فورًا لخطوة تالية (التقييم).",
  s3: "نعطي معلومة واحدة معتمدة، ثم نفتح خطوة الحجز بحسب درجة استعدادها.",
  s4: "من غير ضغط، لكن نخرج بإذن لموعد متابعة محدد.",
  s5: "أقصى ٣ محاولات بفواصل متزايدة، ثم إغلاق مهذب.",
  s6: "كل رد = تعاطف + معلومة صغيرة + سؤال لخطوة تالية.",
  s7: "نثبّت الموعد ونؤكد وسيلة التواصل قبل ما الحماس يهدأ.",
  s8: "التذكير قبل الموعد بيقلل الغياب، واللوكيشن في نفس اليوم.",
  s9: "افتقاد من غير لوم، ثم عرض موعد بديل.",
  s10: "مرة واحدة فقط بعد ٣٠ يومًا، ولا نرسل لمن طلبت التوقف.",
  s11: "الشكر والاطمئنان بعد الزيارة بيبني الثقة، ثم متابعة حسب خطة الطبيبة.",
};

// Tags for rows created before the tag feature (ids from supabase/seed.sql).
// A row's own `meta` always wins over these defaults.
export const DEFAULT_TAGS = {
  script_welcome: { states: ["s1"] },
  script_fixed_price: { states: ["s2"] },
  script_variable_price: { states: ["s2"] },
  script_discovery: { states: ["s3"] },
  script_trust: { states: ["s3"] },
  script_booking: { states: ["s7"] },
  script_followup: { states: ["s5"] },
  script_confirmation: { states: ["s8"] },
  script_noshow: { states: ["s9"] },
  script_think: { states: ["s4"] },
  script_noanswer: { states: ["s5"] },
  obj_price: { states: ["s6"], objections: ["obj_price"] },
  obj_think: { states: ["s6", "s4"], objections: ["obj_think"] },
  obj_result: { states: ["s6"], objections: ["obj_result"] },
  obj_fear: { states: ["s6"], objections: ["obj_fear"] },
  obj_time: { states: ["s6"], objections: ["obj_time"] },
  obj_location: { states: ["s6"], objections: ["obj_location"] },
  obj_family: { states: ["s6"], objections: ["obj_family"] },
  obj_unknown: { states: ["s6"], objections: ["obj_unknown"] },
  obj_other: { states: ["s6"], objections: ["obj_other"] },
};

const list = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string") : []);

export function tagsOf(row) {
  const base = DEFAULT_TAGS[row.id] || {};
  const m = row.meta && typeof row.meta === "object" ? row.meta : {};
  return {
    states: list(m.states).length ? list(m.states) : list(base.states),
    temps: list(m.temps).length ? list(m.temps) : list(base.temps),
    stages: list(m.stages).length ? list(m.stages) : list(base.stages),
    objections: list(m.objections).length
      ? list(m.objections)
      : list(base.objections),
    why: typeof m.why === "string" && m.why.trim() ? m.why.trim() : "",
    approved: m.approved === true,
  };
}

// Journey stage in the vocabulary of the management document, derived from the
// current model (lifecycle + independent qualification + booking milestone).
export function journeyStage(l) {
  if (l.stage === "lost") return "lost";
  if (l.stage === "attended") return "attended";
  if (l.stage === "no_show") return "no_show";
  if (l.stage === "booked") return "booked";
  if (l.stage === "new") return "new";
  if (l.booking_offered_at) return "booking_offered";
  if (l.qualification === "qualified") return "qualified";
  if (l.qualification === "not_qualified") return "unqualified";
  return l.stage === "follow_up" ? "follow_up" : "discovery";
}

export const JOURNEY_LABELS = {
  new: "استفسار جديد",
  discovery: "فهم الاحتياج",
  qualified: "مؤهلة",
  booking_offered: "عُرض عليها الحجز",
  follow_up: "متابعة",
  booked: "محجوزة",
  no_show: "لم تحضر",
  attended: "حضرت",
  unqualified: "غير مؤهلة",
  lost: "مفقودة",
};

// Starting point for the reply chips; the employee can pick another state.
export function defaultReplyState(l, tempInfo = {}) {
  if (l.stage === "lost") return "s10";
  if (l.stage === "attended") return "s11";
  if (l.stage === "no_show") return "s9";
  if (l.stage === "booked") return "s8";
  if (!l.first_response_at) return "s1";
  if (l.last_outcome === "refused") return "s10";
  if (l.last_outcome === "no_answer") return "s5";
  if (l.last_outcome === "later") return "s4";
  if (l.objection_id) return "s6";
  if (tempInfo.temp === "hot" && l.booking_offered_at) return "s7";
  return "s3";
}

// Replies for stage x temperature x state. A null temperature (not assessed)
// returns every variant so the employee sees each tone, labelled by its tag.
export function pickReplies(rows, { state, temp = null, objectionId = null }) {
  const out = [];
  for (const r of rows || []) {
    if (!r.active || !["script", "objection"].includes(r.category)) continue;
    const t = tagsOf(r);
    if (!t.states.includes(state)) continue;
    if (state === "s6" && objectionId && t.objections.length)
      if (!t.objections.includes(objectionId)) continue;
    if (temp && t.temps.length && !t.temps.includes(temp)) continue;
    out.push({
      id: r.id,
      label: r.label,
      body: r.body || "",
      why: t.why || STATE_WHY[state] || "",
      temps: t.temps,
      approved: t.approved,
      exact: Boolean(temp && t.temps.includes(temp)),
      order: r.sort_order ?? 0,
    });
  }
  return out.sort(
    (a, b) => Number(b.exact) - Number(a.exact) || a.order - b.order,
  );
}

// Fill {placeholders} we really know. Anything else stays visible as a
// missing field so nobody sends an unapproved price, time or address.
export function fillTemplate(body, vars = {}) {
  const missing = new Set();
  const text = String(body ?? "").replace(/\{([^{}]+)\}/g, (m, key) => {
    const v = vars[key.trim()];
    if (v === undefined || v === null || String(v).trim() === "") {
      missing.add(key.trim());
      return m;
    }
    return String(v);
  });
  return { text, missing: [...missing] };
}

// ---------------------------------------------------------------------------
// Dynamic checklist: base + stage layer + temperature/state layer.
// Every item may link to one of the eight QA criteria (domain.QA keys).
// ---------------------------------------------------------------------------
const item = (id, label, layer, qa = null, why = "") => ({
  id,
  label,
  layer,
  qa,
  why,
});

export function buildChecklist(lead, tempInfo = {}, opts = {}) {
  const stage = journeyStage(lead);
  const items = [
    item("base_sla", "الرد في أسرع وقت (المستهدف المذكور ٥ دقائق)", "base", "response", "سرعة الرد أهم من طول الرسالة."),
    item("base_greeting", "تحية باسم العميلة", "base", "greeting"),
    item("base_source", "تسجيل المصدر والخدمة", "base"),
  ];
  const stageItems = {
    new: [item("st_discovery_q", "سؤال اكتشاف واحد", "stage", "discovery", "سؤال واحد واضح أفضل من عدة أسئلة.")],
    discovery: [item("st_need", "كتابة ملخص الاحتياج", "stage", "understanding", "مطلوب قبل التأهيل وعرض الحجز.")],
    qualified: [item("st_need", "كتابة ملخص الاحتياج (مطلوب قبل عرض الحجز)", "stage", "understanding")],
    booking_offered: [item("st_two_slots", "عرض موعدين محددين", "stage", "booking", "الاختيار بين موعدين أسهل من سؤال مفتوح.")],
    follow_up: [item("st_followup_ref", "ربط المتابعة بما قالته العميلة سابقًا", "stage", "understanding")],
    booked: [
      item("st_confirm", "تأكيد الحجز", "stage", "follow_up"),
      item("st_reminder", "إرسال تذكير قبل الموعد", "stage"),
    ],
    no_show: [],
    attended: [item("st_after_visit", "متابعة بعد الزيارة", "stage", "follow_up")],
    unqualified: [item("st_reason", "توضيح سبب عدم التأهيل في الملاحظة", "stage")],
    lost: [item("st_lost_reason", "تسجيل سبب الفقد", "stage")],
  }[stage];
  items.push(...stageItems);
  const temp = tempInfo.temp;
  if (stage === "no_show") {
    items.push(
      item("ns_miss", "رسالة افتقاد (بدون لوم)", "state", "trust"),
      item("ns_rebook", "عرض إعادة الحجز", "state", "booking"),
    );
  } else if (tempInfo.state === "reactivation") {
    items.push(item("re_once", "رسالة إعادة تنشيط مرة واحدة فقط (لمن لم تطلب التوقف)", "state"));
  } else if (temp === "hot") {
    items.push(
      item("hot_slot", "عرض موعد محدد الآن", "temp", "booking"),
      item("hot_contact", "تأكيد وسيلة التواصل", "temp"),
      item("hot_location", "إرسال اللوكيشن", "temp"),
    );
  } else if (temp === "warm") {
    items.push(
      item("warm_need", "فهم الاحتياج", "temp", "understanding"),
      item("warm_trust", "طمأنة وبناء ثقة", "temp", "trust"),
      item("warm_followup", "تحديد موعد متابعة", "temp", "follow_up"),
    );
  } else if (temp === "cold") {
    const attempt = Math.min((opts.followUpCount || 0) + 1, 3);
    items.push(
      item("cold_short", "رسالة قصيرة غير ضاغطة", "temp"),
      item("cold_attempt", `تحديد محاولة المتابعة التالية (${attempt}/3)`, "temp", "follow_up"),
    );
    if ((opts.followUpCount || 0) >= 3)
      items.push(item("cold_close", "إغلاق مهذب بعد المحاولة الثالثة", "temp"));
  }
  if (lead.objection_id) {
    items.push(
      item("obj_handled", `عالجت الاعتراض: ${opts.objectionLabel || "غير محدد"}`, "state", "objection", "اعتراض غير معالج يمنع الحرارة العالية."),
    );
  }
  if (!["lost", "attended"].includes(lead.stage))
    items.push(item("end_next", "حددت الخطوة التالية وتاريخها", "end", "follow_up"));
  return items;
}

// A saved tick-list belongs to one checklist situation. After a new contact the
// situation changes, so a fresh list starts and the old one stays in history.
export function checklistKey(lead, tempInfo = {}, contactCount = 0) {
  return [journeyStage(lead), tempInfo.temp || "none", tempInfo.state || "-", lead.objection_id ? "obj" : "no-obj", contactCount].join("|");
}

export function checklistProgress(items, done = {}) {
  const total = items.length;
  const complete = items.filter((i) => done[i.id] === true).length;
  const byQa = {};
  for (const [k, title, weight] of QA) {
    const linked = items.filter((i) => i.qa === k);
    if (linked.length)
      byQa[k] = {
        title,
        weight,
        total: linked.length,
        done: linked.filter((i) => done[i.id] === true).length,
      };
  }
  return { total, complete, byQa };
}

// Latest saved checklist for the current situation, from activities.details.
export function savedChecklist(activities, leadId, key) {
  let best = null;
  for (const a of activities || []) {
    if (a.lead_id !== leadId || a.kind !== "checklist") continue;
    if (a.details?.key !== key) continue;
    const at = Date.parse(a.created_at);
    if (!best || at > best.at) best = { at, done: a.details.done || {} };
  }
  return best ? best.done : {};
}

// ---------------------------------------------------------------------------
// Lead brief shown above the lead file. Derived only from stored data.
// lookup: { label(id), person(id) }
// ---------------------------------------------------------------------------
export function leadBrief(lead, { activities = [], appointments = [], lookup, contact }) {
  const lc = contact || null;
  const next = appointments
    .filter(
      (a) =>
        a.lead_id === lead.id && ["scheduled", "confirmed"].includes(a.status),
    )
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))[0];
  return {
    name: lead.name,
    source: lookup.label(lead.source_id),
    service: lookup.label(lead.service_id),
    stage: STAGES[lead.stage],
    qualification: QUALIFICATIONS[lead.qualification] || QUALIFICATIONS.unknown,
    owner: lookup.person(lead.owner_id),
    need: lead.need || "",
    objection: lead.objection_id ? lookup.label(lead.objection_id) : "",
    lastContact: lc
      ? {
          at: lc.at,
          outcome: OUTCOMES[lc.outcome] || "",
          summary: lc.summary || "",
        }
      : null,
    followUps: lead.follow_up_count || 0,
    nextAction: ACTIONS[lead.next_action] || "",
    nextAt: lead.next_at || null,
    nextAppointment: next
      ? { starts_at: next.starts_at, status: next.status }
      : null,
    grade: GRADES[lead.grade] || "",
  };
}

// Plain-language reasons for the computed temperature (training mode).
export const REASON_LABELS = {
  asked_booking: "سألت عن الحجز أو الموعد",
  offered_and_interested: "عُرض عليها الحجز أو في متابعة، وآخر تواصل كان باهتمام",
  interested_last_24h: "ردّت باهتمام خلال آخر ٢٤ ساعة",
  hot_source: "مصدرها ترشيح أو زيارة مباشرة",
  objection_blocks_hot: "في اعتراض لم يُعالج بعد، فلا تُحسب جاهزة للحجز",
  engaged: "مهتمة أو تم إرسال معلومات لها",
  replied_last_3_days: "كان في تواصل خلال آخر ٣ أيام",
  objection_still_talking: "عندها اعتراض لكنها ما زالت تتحاور",
  outcome_no_answer: "آخر تواصل: لا ترد",
  outcome_later: "طلبت تواصلًا لاحقًا",
  refused: "رفضت",
  quiet_72h: "لا تواصل منذ ٧٢ ساعة أو أكثر، فانخفضت الدرجة",
  stale_7d: "عمر الملف أكثر من ٧ أيام بدون حجز",
  closed_lost: "ملف مفقود (يُعامل كإعادة تنشيط)",
  attended: "حضرت الزيارة",
  appointment_set: "لديها موعد قائم (مسار ما قبل الزيارة)",
};
