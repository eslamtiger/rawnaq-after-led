export const STAGES = {
  new: "جديدة",
  active: "نشطة",
  follow_up: "متابعة",
  booked: "محجوزة",
  no_show: "لم تحضر",
  attended: "حضرت",
  lost: "مفقودة",
};
export const QUALIFICATIONS = {
  unknown: "لم يُقيّم",
  qualified: "مؤهلة",
  not_qualified: "غير مؤهلة",
};
export const GRADES = {
  hot: "جاهزة للحجز",
  warm: "مهتمة",
  cold: "اهتمام مبدئي",
};
export const OUTCOMES = {
  interested: "مازالت مهتمة",
  later: "تواصل لاحق",
  no_answer: "لا ترد",
  refused: "رفضت",
  information: "تم إرسال معلومات",
};
export const ACTIONS = {
  first_reply: "رد أول",
  discovery: "فهم الاحتياج",
  information: "إرسال معلومات",
  offer_booking: "عرض الحجز",
  follow_up: "متابعة",
  confirm: "تأكيد الحجز",
  attendance: "تسجيل الحضور",
  recovery: "ترتيب موعد بديل",
};
export const APPOINTMENTS = {
  scheduled: "بانتظار التأكيد",
  confirmed: "مؤكد",
  attended: "حضرت",
  no_show: "لم تحضر",
  cancelled: "ملغي",
  rescheduled: "أعيد تحديده",
};
export const QA = [
  ["response", "سرعة الرد", 10],
  ["greeting", "الترحيب", 10],
  ["discovery", "استكشاف الاحتياج", 15],
  ["understanding", "فهم الاحتياج", 15],
  ["trust", "بناء الثقة", 10],
  ["objection", "التعامل مع الاعتراض", 15],
  ["booking", "طلب الحجز", 15],
  ["follow_up", "المتابعة", 10],
];
export const TERMINAL = ["lost", "attended"];
export const esc = (s = "") =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function normalizeContact(v) {
  let s = String(v ?? "")
    .replace(/[٠-٩]/g, (n) => "٠١٢٣٤٥٦٧٨٩".indexOf(n))
    .replace(/[\s()-]/g, "");
  if (/^01[0125]\d{8}$/.test(s)) s = "+2" + s;
  if (/^0020/.test(s)) s = "+" + s.slice(2);
  return s.toLowerCase();
}
export function contactValid(v) {
  return /^(\+?\d{7,15}|[^\s@]+@[^\s@]+\.[^\s@]+|@[\p{L}\p{N}_.]{2,})$/u.test(
    normalizeContact(v),
  );
}
export const cairoDay = (v = new Date()) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(v));
export const formatDate = (v, withTime = true) =>
  v
    ? new Intl.DateTimeFormat("ar-EG", {
        timeZone: "Africa/Cairo",
        dateStyle: "medium",
        ...(withTime ? { timeStyle: "short" } : {}),
      }).format(new Date(v))
    : "غير محدد";
export const number = (v) =>
  new Intl.NumberFormat("ar-EG", { maximumFractionDigits: 1 }).format(v);
export const percent = (a, b) => (b ? number((a / b) * 100) + "٪" : "—");
export function localInput(v = new Date()) {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(v));
  const o = Object.fromEntries(p.map((x) => [x.type, x.value]));
  return `${o.year}-${o.month}-${o.day}T${o.hour}:${o.minute}`;
}
// Resolve Cairo wall time against IANA rules, including Egypt's daylight saving time.
export function cairoISO(wall) {
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(wall))
    throw Error("راجعي التاريخ والوقت");
  const [year, month, day, hour, minute] = wall.split(/[-T:]/).map(Number);
  const calendar = new Date(Date.UTC(year, month - 1, day, hour, minute));
  if (
    year < 100 ||
    calendar.getUTCFullYear() !== year ||
    calendar.getUTCMonth() !== month - 1 ||
    calendar.getUTCDate() !== day ||
    calendar.getUTCHours() !== hour ||
    calendar.getUTCMinutes() !== minute
  )
    throw Error("راجعي التاريخ والوقت");
  const target = Date.parse(wall + "Z");
  let guess = target;
  for (let i = 0; i < 4; i++) {
    const rendered = Date.parse(localInput(guess) + "Z");
    const delta = target - rendered;
    if (!delta) return new Date(guess).toISOString();
    guess += delta;
  }
  throw Error("الوقت غير صالح بتوقيت القاهرة");
}
export function priority(l, now = Date.now()) {
  if (TERMINAL.includes(l.stage)) return 99;
  if (!l.first_response_at) return 0;
  if (l.next_at && Date.parse(l.next_at) < now) return 1;
  if (l.grade === "hot" && !l.booking_offered_at) return 2;
  if (l.next_at && cairoDay(l.next_at) === cairoDay(now)) return 3;
  return 4;
}
export function queue(leads, now = Date.now()) {
  return leads
    .filter((l) => priority(l, now) < 4)
    .sort(
      (a, b) =>
        priority(a, now) - priority(b, now) ||
        Date.parse(a.next_at) - Date.parse(b.next_at),
    );
}
export function metrics(leads, appointments, now = Date.now()) {
  const ids = new Set(leads.map((l) => l.id));
  const replied = leads.filter((l) => l.first_response_at);
  const times = replied
    .map(
      (l) =>
        (Date.parse(l.first_response_at) - Date.parse(l.received_at)) / 60000,
    )
    .filter((v) => v >= 0);
  const due = appointments.filter(
    (a) =>
      ids.has(a.lead_id) &&
      !["cancelled", "rescheduled"].includes(a.status) &&
      Date.parse(a.starts_at) <= now,
  );
  return {
    total: leads.length,
    replied: replied.length,
    response: times.length
      ? times.reduce((a, b) => a + b, 0) / times.length
      : null,
    qualified: leads.filter((l) => l.qualification === "qualified").length,
    active: leads.filter((l) => !TERMINAL.includes(l.stage)).length,
    lost: leads.filter((l) => l.stage === "lost").length,
    noShow: new Set(
      appointments
        .filter((a) => ids.has(a.lead_id) && a.status === "no_show")
        .map((a) => a.lead_id),
    ).size,
    offered: leads.filter((l) => l.booking_offered_at).length,
    booked: leads.filter((l) => l.first_booked_at).length,
    attended: new Set(
      appointments
        .filter((a) => ids.has(a.lead_id) && a.status === "attended")
        .map((a) => a.lead_id),
    ).size,
    dueAppointments: due.length,
    unrecorded: due.filter((a) => ["scheduled", "confirmed"].includes(a.status))
      .length,
    unanswered: leads.filter(
      (l) => !l.first_response_at && !TERMINAL.includes(l.stage),
    ).length,
    today: leads.filter(
      (l) =>
        !TERMINAL.includes(l.stage) &&
        l.next_at &&
        Date.parse(l.next_at) >= now &&
        cairoDay(l.next_at) === cairoDay(now),
    ).length,
    overdue: leads.filter(
      (l) =>
        !TERMINAL.includes(l.stage) && l.next_at && Date.parse(l.next_at) < now,
    ).length,
  };
}
export function qaScore(scores) {
  let sum = 0,
    max = 0;
  for (const [k, , w] of QA) {
    if (scores[k] === null || scores[k] === undefined || scores[k] === "")
      continue;
    const v = Number(scores[k]);
    if (!Number.isFinite(v) || v < 0 || v > w) throw Error("درجة خارج النطاق");
    sum += v;
    max += w;
  }
  return max ? Math.round((sum / max) * 1000) / 10 : null;
}
export function safeCSV(rows) {
  return (
    "\ufeff" +
    rows
      .map((row) =>
        row
          .map(
            (v) =>
              '"' +
              String(v ?? "")
                .replace(/^[=+\-@\t\r]/, "'$&")
                .replaceAll('"', '""') +
              '"',
          )
          .join(","),
      )
      .join("\r\n")
  );
}

export function followupBucket(l, now = Date.now()) {
  if (TERMINAL.includes(l.stage) || !l.next_at) return null;
  if (Date.parse(l.next_at) < now) return "overdue";
  return cairoDay(l.next_at) === cairoDay(now) ? "today" : "upcoming";
}
export function appointmentMatches(a, view, now = Date.now()) {
  if (view === "today") return cairoDay(a.starts_at) === cairoDay(now);
  if (view === "upcoming")
    return (
      Date.parse(a.starts_at) > now &&
      ["scheduled", "confirmed"].includes(a.status)
    );
  if (view === "past") return Date.parse(a.starts_at) <= now;
  if (view === "booked") return ["scheduled", "confirmed"].includes(a.status);
  return view === "all" || a.status === view;
}

// ---------------------------------------------------------------------------
// Temperature (Hot / Warm / Cold). Pure and rule based; no AI, no I/O.
// Rules follow "ronaq-reply-library-and-dynamic-checklist.md" section 1.
// `lead.grade` is the staff member's manual override: null means automatic.
// ---------------------------------------------------------------------------
const HOUR = 3600000;
const DAY = 24 * HOUR;
export const HOT_SOURCES = ["src_referral", "src_walkin"];

// Latest logged contact per lead (plus how many were logged), one pass over the
// activities timeline. Returns Map(leadId -> { at, outcome, summary, first_reply, count }).
export function lastContactsByLead(activities) {
  const map = new Map();
  for (const a of activities || []) {
    if (a.kind !== "contact") continue;
    const at = Date.parse(a.details?.contact_at || a.created_at);
    if (!Number.isFinite(at)) continue;
    const prev = map.get(a.lead_id);
    const count = (prev?.count || 0) + 1;
    if (!prev || at > prev.at)
      map.set(a.lead_id, {
        at,
        outcome: a.details?.outcome || null,
        summary: a.body || "",
        first_reply: a.details?.first_reply === true,
        count,
      });
    else prev.count = count;
  }
  return map;
}
export const lastContactOf = (activities, leadId) =>
  lastContactsByLead(activities).get(leadId) || null;

// ctx: { lastContact, appointments, askedBooking }
// `askedBooking` is optional: the system does not record it yet, so callers
// leave it undefined and the "asked about booking" rule simply never fires.
// Returns { temp: "hot"|"warm"|"cold"|null, state, reasons[] }. `state` marks
// leads that left the temperature system: previsit | after_visit | reactivation.
export function computeTemperature(lead, ctx = {}, now = Date.now()) {
  const reasons = [];
  const result = (temp, state = null) => ({ temp, state, reasons });
  if (lead.stage === "lost") {
    reasons.push("closed_lost");
    return result("cold", "reactivation");
  }
  if (lead.stage === "attended") {
    reasons.push("attended");
    return result(null, "after_visit");
  }
  const hasAppointment = (ctx.appointments || []).some(
    (a) =>
      a.lead_id === lead.id && ["scheduled", "confirmed"].includes(a.status),
  );
  if (lead.stage === "booked" && hasAppointment) {
    reasons.push("appointment_set");
    return result(null, "previsit");
  }
  const contact = ctx.lastContact || null;
  const outcome = lead.last_outcome || contact?.outcome || null;
  if (outcome === "refused") {
    reasons.push("refused");
    return result("cold", "reactivation");
  }
  const received = Date.parse(lead.received_at);
  const anchor = Number.isFinite(contact?.at) ? contact.at : null;
  const quietHours = anchor === null ? 0 : (now - anchor) / HOUR;
  const ageDays = Number.isFinite(received) ? (now - received) / DAY : 0;
  const objection = Boolean(lead.objection_id);
  const engaged = outcome === "interested" || outcome === "information";
  const offered = Boolean(lead.booking_offered_at);
  let temp = null;
  if (outcome === "no_answer" || outcome === "later") {
    temp = "cold";
    reasons.push("outcome_" + outcome);
  } else {
    const hotSignals = [];
    if (ctx.askedBooking === true) hotSignals.push("asked_booking");
    if ((offered || lead.stage === "follow_up") && outcome === "interested")
      hotSignals.push("offered_and_interested");
    if (outcome === "interested" && anchor !== null && quietHours <= 24)
      hotSignals.push("interested_last_24h");
    if (HOT_SOURCES.includes(lead.source_id)) hotSignals.push("hot_source");
    if (hotSignals.length && !objection) {
      temp = "hot";
      reasons.push(...hotSignals);
    } else {
      if (hotSignals.length) reasons.push("objection_blocks_hot");
      if (engaged || (anchor !== null && quietHours <= 72)) {
        temp = "warm";
        reasons.push(engaged ? "engaged" : "replied_last_3_days");
        if (objection) reasons.push("objection_still_talking");
      } else if (objection && hotSignals.length) {
        temp = "warm";
        reasons.push("objection_still_talking");
      }
    }
  }
  // Silence lowers the temperature one level after 72 hours.
  if (anchor !== null && quietHours >= 72 && temp && temp !== "cold") {
    temp = temp === "hot" ? "warm" : "cold";
    reasons.push("quiet_72h");
  } else if (anchor !== null && quietHours >= 72 && temp === null) {
    temp = "cold";
    reasons.push("quiet_72h");
  }
  // Old leads that never booked are cold.
  if (ageDays > 7 && !lead.first_booked_at && temp !== "cold") {
    temp = "cold";
    reasons.push("stale_7d");
  }
  return result(temp);
}

// Effective temperature: the staff override wins; otherwise the computed one.
export function effectiveTemperature(lead, ctx = {}, now = Date.now()) {
  const computed = computeTemperature(lead, ctx, now);
  const manual = Object.hasOwn(GRADES, lead.grade) ? lead.grade : null;
  return {
    temp: manual || computed.temp,
    mode: manual ? "manual" : "auto",
    suggested: computed.temp,
    state: computed.state,
    reasons: computed.reasons,
  };
}

// ---- Services, prices and the management dashboard (pure, testable) ----
// A service price lives in configuration.meta.price (EGP). Missing = not set.
export function servicePrice(row) {
  const v = row?.meta?.price;
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;
}
export const money = (v) =>
  v === null || v === undefined
    ? "—"
    : new Intl.NumberFormat("ar-EG", { maximumFractionDigits: 0 }).format(v) +
      " ج.م";
export const PERIODS = {
  today: "النهارده",
  d7: "آخر ٧ أيام",
  d30: "آخر ٣٠ يوم",
  month: "الشهر ده",
  all: "الكل",
};
// [from, to) as epoch ms for a period, using Cairo calendar days.
export function periodRange(key, now = Date.now()) {
  const today = cairoDay(now);
  const startOf = (day) => Date.parse(cairoISO(day + "T00:00"));
  const end = now + 1;
  if (key === "today") return [startOf(today), end];
  if (key === "d7" || key === "d30") {
    const n = key === "d7" ? 6 : 29;
    return [startOf(cairoDay(now - n * 86400000)), end];
  }
  if (key === "month") return [startOf(today.slice(0, 8) + "01"), end];
  return [-Infinity, Infinity];
}
const inRange = (v, [a, b]) => {
  const t = Date.parse(v);
  return Number.isFinite(t) && t >= a && t < b;
};
// The lead journey for a period: leads by received_at; each step counts
// unique leads that ever reached it.
export function journey(leads, appointments, range) {
  const ls = leads.filter((l) => inRange(l.received_at, range));
  const ids = new Set(ls.map((l) => l.id));
  const attended = new Set(
    appointments
      .filter((a) => ids.has(a.lead_id) && a.status === "attended")
      .map((a) => a.lead_id),
  );
  const steps = [
    ["inquiries", "استفسارات", ls.length],
    ["replied", "اتردّ عليهم", ls.filter((l) => l.first_response_at).length],
    ["offered", "اتعرض عليهم حجز", ls.filter((l) => l.booking_offered_at || l.first_booked_at).length],
    ["booked", "حجزوا", ls.filter((l) => l.first_booked_at).length],
    ["attended", "حضروا", attended.size],
  ];
  let worst = null;
  steps.forEach((s, i) => {
    if (!i || !steps[i - 1][2]) return;
    const drop = 1 - s[2] / steps[i - 1][2];
    if (drop > 0 && (!worst || drop > worst.drop)) worst = { key: s[0], drop };
  });
  return { steps, worst, leads: ls };
}
// Per-service numbers. Revenue = attended appointments in range × listed
// price; upcoming = scheduled/confirmed appointments after now × price.
// These are estimates from the listed price, not cashier receipts.
export function serviceStats(leads, appointments, services, range, now = Date.now()) {
  const byId = new Map(leads.map((l) => [l.id, l]));
  const rows = services.map((s) => ({
    id: s.id,
    label: s.label,
    price: servicePrice(s),
    inquiries: 0,
    booked: 0,
    attended: 0,
    upcoming: 0,
  }));
  const idx = new Map(rows.map((r) => [r.id, r]));
  for (const l of leads) {
    const r = idx.get(l.service_id);
    if (!r) continue;
    if (inRange(l.received_at, range)) {
      r.inquiries++;
      if (l.first_booked_at) r.booked++;
    }
  }
  for (const a of appointments) {
    const l = byId.get(a.lead_id);
    const r = l && idx.get(l.service_id);
    if (!r) continue;
    if (a.status === "attended" && inRange(a.starts_at, range)) r.attended++;
    if (["scheduled", "confirmed"].includes(a.status) && Date.parse(a.starts_at) > now)
      r.upcoming++;
  }
  for (const r of rows) {
    r.revenue = r.price === null ? null : r.attended * r.price;
    r.pipeline = r.price === null ? null : r.upcoming * r.price;
  }
  const sum = (k) =>
    rows.reduce((t, r) => t + (r[k] === null ? 0 : r[k]), 0);
  return {
    rows,
    total: {
      inquiries: sum("inquiries"),
      booked: sum("booked"),
      attended: sum("attended"),
      revenue: sum("revenue"),
      pipeline: sum("pipeline"),
      missingPrices: rows.filter((r) => r.price === null && (r.attended || r.upcoming || r.inquiries)).length,
    },
  };
}
