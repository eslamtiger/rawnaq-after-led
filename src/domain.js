export const STAGES = {
  new: "جديدة",
  contacted: "تم الرد",
  qualified: "مؤهلة",
  booking_offered: "تم عرض الحجز",
  follow_up: "متابعة",
  booked: "تم الحجز",
  attended: "حضرت",
  unqualified: "غير مؤهلة",
  lost: "مفقودة",
};
export const GRADES = {
  hot: "جاهزة للحجز",
  warm: "مهتمة",
  cold: "اهتمام مبدئي",
  unqualified: "غير مؤهلة",
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
export const TERMINAL = ["lost", "unqualified", "attended"];
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
  if (year < 100 || calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day || calendar.getUTCHours() !== hour || calendar.getUTCMinutes() !== minute)
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
  if (
    l.next_at &&
    Date.parse(l.next_at) < now
  )
    return 1;
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
      !["cancelled"].includes(a.status) &&
      Date.parse(a.starts_at) <= now,
  );
  return {
    total: leads.length,
    replied: replied.length,
    response: times.length
      ? times.reduce((a, b) => a + b, 0) / times.length
      : null,
    qualified: leads.filter((l) => l.qualified_at).length,
    offered: leads.filter((l) => l.booking_offered_at).length,
    booked: leads.filter((l) => l.first_booked_at).length,
    attended: due.filter((a) => a.status === "attended").length,
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
        cairoDay(l.next_at) === cairoDay(now),
    ).length,
    overdue: leads.filter(
      (l) =>
        !TERMINAL.includes(l.stage) &&
        l.next_at &&
        Date.parse(l.next_at) < now &&
        cairoDay(l.next_at) !== cairoDay(now),
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
