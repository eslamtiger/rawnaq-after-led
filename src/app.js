import "./style.css";
import {
  db,
  configured,
  rpc,
  loadWorkspace,
  arabicError,
  qaAnonymous,
} from "./api.js";
import {
  STAGES,
  QUALIFICATIONS,
  followupBucket,
  appointmentMatches,
  GRADES,
  OUTCOMES,
  ACTIONS,
  APPOINTMENTS,
  QA,
  TERMINAL,
  esc,
  normalizeContact,
  contactValid,
  cairoDay,
  formatDate,
  number,
  percent,
  localInput,
  cairoISO,
  priority,
  queue,
  metrics,
  qaScore,
  safeCSV,
  effectiveTemperature,
  lastContactsByLead,
  servicePrice,
  money,
  PERIODS,
  periodRange,
  journey,
  serviceStats,
} from "./domain.js";
import {
  REPLY_STATES,
  JOURNEY_LABELS,
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
  REASON_LABELS,
} from "./assistant.js";
const root = document.querySelector("#app");
let session = null,
  me = null,
  data = {
    leads: [],
    appointments: [],
    activities: [],
    profiles: [],
    config: [],
    qa: [],
  },
  page = "today",
  afterSave = null,
  flow = null,
  selected = null,
  search = "",
  filterStage = "",
  filterOwner = "",
  filterSource = "",
  rangeFrom = "",
  rangeTo = "",
  followupView = "overdue",
  appointmentView = "today",
  pageIndex = 0,
  loading = false,
  mutation = false,
  refreshTimer,
  todayView = "list",
  contacts = new Map(),
  replyChoice = {},
  localChecks = new Map(),
  training = readTraining();
const nav = [
  ["today", "متابعات اليوم", "sun"],
  ["leads", "العميلات المحتملات", "users"],
  ["followups", "المتابعات", "clock"],
  ["appointments", "الحجوزات", "calendar"],
  ["dashboard", "لوحة الإدارة", "chart"],
  ["services", "الخدمات والأسعار", "tag"],
  ["scripts", "دليل التواصل", "book"],
  ["qa", "الجودة والتدريب", "check"],
  ["settings", "الإعدادات", "settings"],
];
// Bottom bar (phones): the four daily screens plus a "more" page.
const bottomNav = [
  ["today", "اليوم", "sun"],
  ["leads", "العميلات", "users"],
  ["add", "جديدة", "plus"],
  ["followups", "المتابعات", "clock"],
  ["more", "المزيد", "menu"],
];
const folds = new Set(["replies"]);
// A collapsible section: the staff opens only what they need. State survives re-renders.
function fold(id, title, hint, inner) {
  return `<details class="fold" data-fold="${id}" ${folds.has(id) ? "open" : ""}><summary><span>${title}</span>${hint ? `<small>${hint}</small>` : ""}</summary><div class="fold-body">${inner}</div></details>`;
}
const routes = [...nav.map((n) => n[0]), "more"];
// UI preference only (never CRM data): training notes on/off for this browser.
function readTraining() {
  try {
    return localStorage.getItem("rawnaq-training") === "1";
  } catch {
    return false;
  }
}
function setTraining(on) {
  training = on;
  try {
    localStorage.setItem("rawnaq-training", on ? "1" : "0");
  } catch {
    /* preference simply is not remembered */
  }
}
const icons = {
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
  users:
    '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.9M15 3a4 4 0 0 1 0 8"/><circle cx="9" cy="7" r="4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  calendar:
    '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18m-12 5h2m3 0h2"/>',
  chart: '<path d="M4 3v18h17M8 16v-4m5 4V6m5 10V9"/>',
  book: '<path d="M12 6c-4-3-7-2-10-1v15c3-1 6-2 10 1 4-3 7-2 10-1V5c-3-1-6-2-10 1v15"/>',
  check: '<path d="m9 12 2 2 4-4"/><circle cx="12" cy="12" r="9"/>',
  settings:
    '<path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.5 5.5l2 2m9 9 2 2m-13 0 2-2m9-9 2-2"/><circle cx="12" cy="12" r="5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  arrow: '<path d="m14 7-5 5 5 5"/>',
  search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/>',
  logout: '<path d="M9 4H4v16h5m5-4 4-4-4-4m-6 4h10"/>',
  refresh:
    '<path d="M20 7v5h-5M4 17v-5h5M6 7a7 7 0 0 1 12-2l2 3M4 16l2 3a7 7 0 0 0 12-2"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  phone:
    '<path d="M5 3h4l2 5-3 2c2 4 2 4 6 6l2-3 5 2v4c0 4-8 1-12-3S1 3 5 3Z"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  board:
    '<rect x="3" y="4" width="5" height="16" rx="1"/><rect x="10" y="4" width="5" height="10" rx="1"/><rect x="17" y="4" width="4" height="13" rx="1"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/>',
  tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
};
const icon = (n) =>
  `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[n] || icons.check}</svg>`;
const label = (id) => data.config.find((c) => c.id === id)?.label || "غير محدد";
const person = (id) =>
  data.profiles.find((p) => p.id === id)?.display_name || "غير محدد";
const configs = (cat) =>
  data.config.filter((c) => c.category === cat && c.active);
const options = (obj, value, empty) =>
  `${empty ? `<option value="">${esc(empty)}</option>` : ""}${Object.entries(
    obj,
  )
    .map(
      ([k, v]) =>
        `<option value="${esc(k)}" ${k === value ? "selected" : ""}>${esc(v)}</option>`,
    )
    .join("")}`;
const configOptions = (cat, value, empty) =>
  options(
    Object.fromEntries(configs(cat).map((c) => [c.id, c.label])),
    value,
    empty,
  );
const peopleOptions = (value) =>
  options(
    Object.fromEntries(
      data.profiles
        .filter(
          (p) =>
            p.active &&
            (me.role === "admin" || p.id === me.id || p.id === value),
        )
        .map((p) => [p.id, p.display_name]),
    ),
    value,
  );
const badge = (l) =>
  `<span class="badge ${l.stage === "lost" ? "red" : l.stage === "attended" ? "green" : l.stage === "booked" ? "gold" : ""}">${STAGES[l.stage]}</span>`;
let apptsByLead = new Map();
function indexData() {
  contacts = lastContactsByLead(data.activities);
  apptsByLead = new Map();
  for (const a of data.appointments) {
    if (!apptsByLead.has(a.lead_id)) apptsByLead.set(a.lead_id, []);
    apptsByLead.get(a.lead_id).push(a);
  }
}
const tempOf = (l) =>
  effectiveTemperature(l, {
    lastContact: contacts.get(l.id) || null,
    appointments: apptsByLead.get(l.id) || [],
  });
const tempBadge = (l) => {
  const t = tempOf(l);
  if (t.state === "previsit")
    return '<span class="temp previsit">قبل الزيارة</span>';
  if (!t.temp) return "";
  return `<span class="temp ${t.temp}">${GRADES[t.temp]}${t.mode === "manual" ? " · يدوي" : ""}</span>`;
};
const field = (name, title, html, wide = false) =>
  `<label class="field ${wide ? "wide" : ""}" for="${name}"><span>${title}</span>${html}</label>`;
const input = (n, t = "text", v = "", req = false, extra = "") =>
  `<input id="${n}" name="${n}" type="${t}" value="${esc(v)}" ${req ? "required" : ""} ${["date", "datetime-local", "time", "email", "number"].includes(t) ? 'dir="ltr"' : ""} ${extra}>`;
const select = (n, opts) =>
  `<select id="${n}" name="${n}" required>${opts}</select>`;
function toast(s, error = false) {
  const t = document.querySelector("#toast");
  t.textContent = s;
  t.className = "show" + (error ? " error" : "");
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => (t.className = ""), 5000);
}
function blank(title, body, action = "") {
  return `<div class="empty"><div class="empty-icon">${icon("users")}</div><h3>${title}</h3><p>${body}</p>${action}</div>`;
}
function login() {
  root.innerHTML = `<main class="auth"><section class="auth-story"><div class="brand-logo"><img src="/brand/rawnaq-logo.png" alt="عيادات رونق للجلدية والتجميل والليزر" width="140" height="208"></div><div><div class="eyebrow">كل استفسار يستحق اهتمام</div><h1>متابعة أوضح.<br>تجربة أرقى.</h1><p>من أول رسالة، لحد الحجز والحضور.<br>خطوة واضحة لكل عميلة، في مكان واحد.</p></div><small>نظام متابعة العميلات · الإصدار ٠٫٢</small></section><section class="auth-form"><div class="auth-box"><span class="eyebrow">أهلًا بيكي في رونق</span><h2>دخول فريق العمل</h2><p>استخدمي حسابك المخصص لمتابعة العميلات.</p>${!configured ? `<div class="notice"><strong>تجهيز الاتصال لم يكتمل</strong><p>قاعدة البيانات وتسجيل الدخول لم يتم ربطهما بهذه النسخة بعد. لا يمكن تسجيل أو حفظ بيانات عميلات حتى اكتمال الربط.</p></div>` : `<form id="login-form">${field("email", "البريد الإلكتروني", input("email", "email", "", true, 'dir="ltr" autocomplete="username"'))}${field("password", "كلمة المرور", input("password", "password", "", true, 'dir="ltr" autocomplete="current-password" minlength="8"'))}<div class="form-error" role="alert"></div><button class="primary full" type="submit">تسجيل الدخول ${icon("arrow")}</button></form>`}<div class="auth-note">الدخول مخصص لحسابات الفريق المصرح لها.<br>لو محتاجة حساب، تواصلي مع إدارة المركز.</div></div></section></main>`;
  document
    .querySelector("#login-form")
    ?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = e.target,
        b = f.querySelector("button");
      b.disabled = true;
      b.textContent = "جاري تسجيل الدخول…";
      try {
        const { error } = await db.auth.signInWithPassword({
          email: f.email.value.trim(),
          password: f.password.value,
        });
        if (error) throw error;
      } catch (e) {
        f.querySelector(".form-error").textContent = arabicError(e);
        b.disabled = false;
        b.textContent = "تسجيل الدخول";
      }
    });
}
const PERSONAS = [
  ["سارة", "موظفة مبيعات"],
  ["أحمد", "موظف مبيعات"],
  ["منى", "موظفة مبيعات"],
  ["كريم", "موظف مبيعات"],
  ["مديرة المركز", "إدارة — كل الصلاحيات"],
];
function qaPersona() {
  try {
    return sessionStorage.getItem("rawnaq-persona") || "";
  } catch {
    return "";
  }
}
function personaPicker() {
  root.innerHTML = `<main class="auth"><section class="auth-story"><div class="brand-logo"><img src="/brand/rawnaq-logo.png" alt="عيادات رونق للجلدية والتجميل والليزر" width="140" height="208"></div><div><div class="eyebrow">نسخة تجريبية</div><h1>جرّبي النظام<br>زي يوم شغل حقيقي.</h1><p>اختاري اسمك وادخلي على طول. من غير كلمة سر.</p></div><small>بيانات تجريبية فقط</small></section><section class="auth-form"><div class="auth-box"><span class="eyebrow">أهلًا بيكي في رونق</span><h2>مين بتستخدمي النظام دلوقتي؟</h2><div class="persona-list">${PERSONAS.map(([n, r]) => `<button class="persona" data-persona="${esc(n)}"><span class="avatar">${esc(n.charAt(0))}</span><span><strong>${esc(n)}</strong><small>${esc(r)}</small></span></button>`).join("")}</div><div class="auth-note">الدخول التجريبي مؤقت، والبيانات هنا مش لعميلات حقيقيات.</div></div></section></main>`;
  root.querySelectorAll("[data-persona]").forEach(
    (b) =>
      (b.onclick = () => {
        try {
          sessionStorage.setItem("rawnaq-persona", b.dataset.persona);
        } catch {}
        root.innerHTML = '<main class="access"><p>جاري فتح مساحة رونق…</p></main>';
        refresh();
      }),
  );
}
async function refresh() {
  if (loading) return;
  loading = true;
  try {
    data = await loadWorkspace();
    me = data.profiles.find((p) => p.id === session.user.id && p.active);
    if (qaAnonymous && session.user.is_anonymous) {
      const persona = qaPersona();
      if (!persona) {
        personaPicker();
        return;
      }
      if (!me || me.display_name !== persona) {
        await rpc("join_qa_workspace", { p_person: persona });
        data = await loadWorkspace();
        me = data.profiles.find((p) => p.id === session.user.id && p.active);
      }
    }
    if (!me) {
      root.innerHTML = `<main class="access">${blank("الحساب يحتاج تصريح من الإدارة", "تم تسجيل الدخول، لكن الحساب غير مضاف لفريق رونق أو تم إيقافه. معرّف طلب التصريح: " + esc(session.user.id), '<button data-act="logout">تسجيل الخروج</button>')}</main>`;
      bind();
      return;
    }
    render();
  } catch (e) {
    root.innerHTML = `<main class="access">${blank("تعذر تحميل بيانات الفريق", arabicError(e), '<button data-act="refresh">إعادة المحاولة</button> <button data-act="logout">تسجيل الخروج</button>')}</main>`;
    bind();
  } finally {
    loading = false;
  }
}
function render() {
  indexData();
  root.innerHTML = `<div class="workspace ${flow && flow.lid === selected ? "in-flow" : ""}"><aside class="sidebar"><a class="brand-logo" href="#today" aria-label="عيادات رونق — الرئيسية"><img src="/brand/rawnaq-logo.png" alt="عيادات رونق للجلدية والتجميل والليزر" width="140" height="208"></a><div class="sidebar-caption">متابعة العميلات</div><nav aria-label="التنقل الرئيسي">${nav.map(([id, title, i]) => `<button data-page="${id}" class="nav-item ${page === id ? "active" : ""}" ${page === id ? 'aria-current="page"' : ""}>${icon(i)}<span>${title}</span>${id === "today" ? `<b>${number(queue(data.leads).length)}</b>` : ""}</button>`).join("")}</nav><div class="sidebar-bottom"><span class="avatar">${esc(me.display_name.charAt(0))}</span><div><strong>${esc(me.display_name)}</strong><small>${me.role === "admin" ? "إدارة المركز" : "موظفة المبيعات"}</small></div><button class="icon-button" data-act="logout" aria-label="${qaAnonymous ? "تغيير الشخص" : "تسجيل الخروج"}">${icon("logout")}</button></div></aside><div class="main"><header class="topbar"><div class="breadcrumb">رونق <span>/</span> ${nav.find((n) => n[0] === page)?.[1] ?? "المزيد"}</div><div class="top-actions"><span class="connection"><i></i> متصل</span><button class="icon-button" data-act="refresh" aria-label="تحديث البيانات">${icon("refresh")}</button></div></header><main class="content">${selected ? (flow && flow.lid === selected ? flowView() : profileView()) : pageView()}</main><footer>توقيت القاهرة · ${session.user.is_anonymous ? "اختبار QA مؤقت — بيانات وهمية فقط · " : ""}البيانات حسب صلاحيات حسابك <span>رونق — متابعة باهتمام</span></footer></div>${!selected && ["today", "leads", "followups"].includes(page) ? `<button class="fab" data-act="add" aria-label="تسجيل عميلة جديدة">${icon("plus")}<span>عميلة جديدة</span></button>` : ""}<nav class="bottom-nav" aria-label="التنقل السفلي">${bottomNav.map(([id, title, i]) => id === "add" ? `<button class="nav-add" data-act="add" aria-label="تسجيل عميلة جديدة"><span class="nav-add-dot">${icon(i)}</span><span>${title}</span></button>` : `<button data-page="${id}" class="${!selected && (page === id || (id === "more" && ["appointments", "dashboard", "services", "scripts", "qa", "settings"].includes(page))) ? "active" : ""}" ${page === id ? 'aria-current="page"' : ""}>${icon(i)}<span>${title}</span>${id === "today" && queue(data.leads).length ? `<b>${number(queue(data.leads).length)}</b>` : ""}</button>`).join("")}</nav></div><dialog id="modal" aria-labelledby="modal-title"></dialog>`;
  bind();
}
function heading(k, title, sub, action = "") {
  return `<div class="page-heading"><div><div class="eyebrow">${k}</div><h1>${title}</h1><p>${sub}</p></div>${action}</div>`;
}
const addButton = () =>
  `<button class="primary" data-act="add">${icon("plus")} إضافة عميلة</button>`;
function stat(title, value, sub = "", tone = "") {
  return `<article class="stat ${tone}"><div>${title}</div><strong>${value}</strong><small>${sub}</small></article>`;
}
function pageView() {
  if (page === "today") return today();
  if (page === "leads" || page === "followups") return leadList();
  if (page === "appointments") return appointmentsView();
  if (page === "dashboard") return dashboard();
  if (page === "services") return servicesPage();
  if (page === "scripts") return scripts();
  if (page === "qa") return quality();
  if (page === "more") return morePage();
  return settings();
}
function morePage() {
  const items = [
    ["followups", "المتابعات", "كل المتابعات: متأخر واليوم والقادم", "clock"],
    ["appointments", "الحجوزات", "المواعيد القادمة وتسجيل الحضور", "calendar"],
    ["dashboard", "لوحة الإدارة", "الخدمات والإيراد ورحلة العميلات", "chart"],
    ...(me.role === "admin" ? [["services", "الخدمات والأسعار", "سعر كل خدمة للوحة الإدارة", "tag"]] : []),
    ["scripts", "دليل التواصل", "القوالب والردود على الاعتراضات", "book"],
    ["qa", "الجودة والتدريب", "مراجعات التواصل ومعايير الجودة", "check"],
    ["settings", "الإعدادات", "المصادر والقوالب وفريق العمل", "settings"],
  ];
  return `${heading("كل الأقسام", "المزيد", "باقي أقسام رونق.")}<section class="panel more-list">${items.map(([id, t, s, i]) => `<button class="more-item" data-page="${id}">${icon(i)}<span><strong>${t}</strong><small>${s}</small></span>${icon("arrow")}</button>`).join("")}<label class="more-item switch-row"><span><strong>وضع التدريب</strong><small>يظهر سبب كل رد وخطوة. للموظفة الجديدة</small></span><input type="checkbox" data-training ${training ? "checked" : ""}></label><button class="more-item" data-act="logout">${icon("logout")}<span><strong>${qaAnonymous ? "تغيير الشخص" : "تسجيل الخروج"}</strong><small>${esc(me.display_name)}</small></span></button></section>`;
}
function byUrgency(now) {
  return (a, b) =>
    priority(a, now) - priority(b, now) ||
    (Date.parse(a.next_at) || Infinity) - (Date.parse(b.next_at) || Infinity);
}
function kanCard(l) {
  const late =
    l.next_at && Date.parse(l.next_at) < Date.now() && !TERMINAL.includes(l.stage);
  return `<button class="kan-card ${late ? "late" : ""}" data-open="${l.id}"><strong>${esc(l.name)}</strong>${tempBadge(l)}<small>${esc(label(l.service_id))} · ${esc(person(l.owner_id))}</small><span class="kan-next">${!l.first_response_at ? "في انتظار أول رد" : esc(ACTIONS[l.next_action] || "—")}${l.next_at ? " · " + formatDate(l.next_at) : ""}</span></button>`;
}
function kanban() {
  const now = Date.now();
  return `<div class="kanban" role="list" aria-label="عرض اللوحة حسب الحالة">${["new", "active", "follow_up", "booked", "no_show"]
    .map((st) => {
      const ls = data.leads.filter((l) => l.stage === st).sort(byUrgency(now));
      return `<section class="kan-col" role="listitem"><header><h3>${STAGES[st]}</h3><span class="count">${number(ls.length)}</span></header>${ls.length ? ls.slice(0, 30).map(kanCard).join("") : '<p class="kan-empty">لا توجد عميلات</p>'}${ls.length > 30 ? `<p class="kan-empty">و${number(ls.length - 30)} أخرى في قائمة العميلات</p>` : ""}</section>`;
    })
    .join("")}</div>`;
}
function reasonOf(l) {
  if (!l.first_response_at && !TERMINAL.includes(l.stage))
    return "استفسار بدون رد، الرد الأول أهم خطوة";
  const late = l.next_at && Date.parse(l.next_at) < Date.now();
  const what = ACTIONS[l.next_action] || "متابعة";
  return late
    ? `${what}: متأخرة`
    : `${what} ${l.next_at ? formatDate(l.next_at) : ""}`;
}
function today() {
  const now = Date.now(),
    m = metrics(data.leads, data.appointments, now),
    q = queue(data.leads, now),
    first = q[0],
    others = q.slice(1, 8),
    lateCount = m.overdue + m.unanswered;
  const hero = first
    ? `<section class="next-card ${priority(first, now) <= 1 ? "is-late" : ""}" aria-label="الخطوة الجاية"><span class="next-kicker">${priority(first, now) <= 1 ? "ابدئي بيها دلوقتي" : "الخطوة الجاية"}</span><h2>${esc(first.name)}</h2><p class="next-why">${esc(reasonOf(first))}</p><p class="next-meta">${esc(label(first.service_id))} · ${esc(label(first.source_id))}</p><button class="primary big" data-flow-start="${first.id}">ابدئي التواصل</button><button class="text-button" data-open="${first.id}">الملف كامل</button></section>`
    : `<section class="next-card calm"><h2>مفيش متابعات مستنياكي</h2><p class="next-why">كل المتابعات في وقتها. لو وصلك استفسار جديد، سجّليه من الزر الوردي.</p></section>`;
  const list = others.length
    ? `<section class="then"><h3>بعدها <span>${number(Math.max(q.length - 1, 0))}</span></h3>${others.map((l) => `<button class="then-row" data-flow-start="${l.id}"><span class="then-main"><strong>${esc(l.name)}</strong><small>${esc(reasonOf(l))}</small></span>${tempBadge(l)}${icon("arrow")}</button>`).join("")}${q.length > 8 ? `<button class="text-button panel-link" data-page="followups">كل المتابعات (${number(q.length)}) ${icon("arrow")}</button>` : ""}</section>`
    : "";
  const board =
    todayView === "kanban"
      ? kanban()
      : "";
  return `<div class="today-head"><div><h1>اليوم</h1><p class="today-counts">${lateCount ? `<span class="late-pill"><b>${number(lateCount)}</b> متأخرة</span>` : ""}<span>${number(m.today)} متابعة النهارده</span></p></div><button class="primary desktop-add" data-act="add">${icon("plus")} عميلة جديدة</button></div>${todayView === "kanban" ? board : hero + list}<div class="today-foot"><button class="text-button" data-today-view="${todayView === "kanban" ? "list" : "kanban"}">${todayView === "kanban" ? "رجوع للخطوة الجاية" : "عرض كل العميلات كلوحة"}</button></div>`;
}
function leadRow(l, compact = false) {
  const p = priority(l),
    late =
      l.next_at &&
      Date.parse(l.next_at) < Date.now() &&
      !TERMINAL.includes(l.stage);
  return `<button class="lead-row ${compact ? "compact" : ""}" data-open="${l.id}"><span class="avatar pale">${esc(l.name.charAt(0))}</span><div class="lead-main"><div><strong>${esc(l.name)}</strong>${badge(l)}${tempBadge(l)}</div><small>${esc(label(l.service_id))} · ${esc(label(l.source_id))} · ${esc(person(l.owner_id))}</small></div><div class="next ${late ? "late" : ""}"><strong>${!l.first_response_at && !TERMINAL.includes(l.stage) ? "في انتظار أول رد" : ACTIONS[l.next_action] || "الملف مغلق"}</strong><small>${l.next_at ? formatDate(l.next_at) : "—"}</small></div>${compact && p === 0 ? '<span class="dot urgent-dot"></span>' : icon("arrow")}</button>`;
}
function filters(includeDate = false) {
  return `<div class="filters"><label class="search">${icon("search")}<input name="search" id="search" aria-label="بحث بالاسم أو رقم التواصل" placeholder="ابحثي بالاسم أو رقم التواصل" value="${esc(search)}"></label><details class="filter-more" ${(filterStage || filterOwner || filterSource || rangeFrom || rangeTo) ? "open" : ""}><summary>تصفية النتائج</summary><div class="filter-grid"><select id="filter-stage" aria-label="تصفية حسب الحالة">${options(STAGES, filterStage, "كل الحالات")}</select>${me.role === "admin" ? `<select id="filter-owner" aria-label="تصفية حسب الموظفة">${options(Object.fromEntries(data.profiles.map((p) => [p.id, p.display_name])), filterOwner, "كل الموظفات")}</select>` : ""}<select id="filter-source" aria-label="تصفية حسب المصدر">${configOptions("source", filterSource, "كل المصادر")}</select>${includeDate ? `<label class="date-filter">من ${input("range-from", "date", rangeFrom)}</label><label class="date-filter">إلى ${input("range-to", "date", rangeTo)}</label>` : ""}</div></details></div>`;
}
function filtered() {
  const q = normalizeContact(search);
  return data.leads.filter(
    (l) =>
      (!q || normalizeContact(l.name).includes(q) || l.contact.includes(q)) &&
      (!filterStage || l.stage === filterStage) &&
      (!filterOwner || l.owner_id === filterOwner) &&
      (!filterSource || l.source_id === filterSource) &&
      (!rangeFrom || cairoDay(l.received_at) >= rangeFrom) &&
      (!rangeTo || cairoDay(l.received_at) <= rangeTo),
  );
}
function leadList() {
  let leads = filtered();
  if (page === "followups")
    leads = leads
      .filter((l) => followupBucket(l) === followupView)
      .sort(
        (a, b) =>
          priority(a) - priority(b) ||
          Date.parse(a.next_at) - Date.parse(b.next_at),
      );
  else
    leads.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  const pages = Math.max(1, Math.ceil(leads.length / 20));
  pageIndex = Math.min(pageIndex, pages - 1);
  return `${heading("كل التفاصيل في مكان واحد", page === "leads" ? "العميلات المحتملات" : "المتابعات", page === "leads" ? "ملف واحد لكل عميلة، وتاريخ واضح لكل خطوة." : "راجعي الموعد والخطوة القادمة قبل التواصل.", addButton())}${filters(true)}${page === "followups" ? viewTabs({ overdue: "متأخر", today: "اليوم", upcoming: "قادم" }, followupView, "queue") : ""}<section class="panel"><div class="panel-head"><h2>${page === "leads" ? "سجل العميلات" : "قائمة المتابعة"}</h2><span class="count">${number(leads.length)} عميلة</span></div>${
    leads.length
      ? `<div class="list-caption"><span>العميلة والاهتمام</span><span>الخطوة القادمة</span></div>${leads
          .slice(pageIndex * 20, pageIndex * 20 + 20)
          .map((l) => leadRow(l))
          .join(
            "",
          )}<div class="pagination"><button data-act="prev" ${pageIndex === 0 ? "disabled" : ""}>السابق</button><span>صفحة ${number(pageIndex + 1)} من ${number(pages)}</span><button data-act="next" ${pageIndex >= pages - 1 ? "disabled" : ""}>التالي</button></div>`
      : blank(
          "لا توجد عميلات مطابقة",
          "أضيفي أول عميلة أو غيّري خيارات البحث.",
          addButton(),
        )
  }</section>`;
}
function profileView() {
  const l = data.leads.find((x) => x.id === selected);
  if (!l) {
    selected = null;
    return pageView();
  }
  const apps = data.appointments
      .filter((a) => a.lead_id === l.id)
      .sort((a, b) => Date.parse(b.starts_at) - Date.parse(a.starts_at)),
    history = data.activities
      .filter((a) => a.lead_id === l.id && a.kind !== "checklist")
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)),
    closed = TERMINAL.includes(l.stage);
  const lateNow = l.next_at && Date.parse(l.next_at) < Date.now();
  const cs = checklistState(l);
  const lc = contacts.get(l.id);
  const lastLine = lc
    ? `${formatDate(lc.at)} · ${OUTCOMES[lc.outcome] || ""}${lc.summary ? " — " + esc(lc.summary) : ""}`
    : "لسه مفيش تواصل مسجل";
  const nextLine = closed
    ? "الملف مغلق"
    : `${ACTIONS[l.next_action] || "متابعة"} · ${l.next_at ? formatDate(l.next_at) : "من غير موعد"}`;
  const more = closed
    ? ""
    : `<details class="more-actions"><summary>إجراءات أخرى</summary><div class="profile-actions"><button data-act="edit">تحديث الحالة</button><button data-act="book">${icon("calendar")} ${l.stage === "no_show" ? "إعادة الحجز" : "تثبيت حجز"}</button>${l.stage === "no_show" ? `<button data-act="recover-followup">متابعة</button><button data-act="recover-lost">إغلاق كـ Lost</button>` : ""}${!l.booking_offered_at ? `<button data-act="offer">تم عرض الحجز</button>` : `<span class="badge">عُرض الحجز ${formatDate(l.booking_offered_at)}</span>`}</div></details>`;
  const detailsInner = `${fold("brief", "ملخص العميلة", "", briefHtml(l))}${fold("checklist", "قائمة المتابعة", `${number(cs.progress.complete)} من ${number(cs.progress.total)}`, checklistPanel(l))}${fold("bookings", "الحجوزات", number(apps.length), `<div class="fold-plain">${
    apps.length
      ? apps
          .map(
            (a) =>
              `<div class="booking-card"><div><strong>${formatDate(a.starts_at)}</strong><span class="badge ${a.status === "attended" ? "green" : "gold"}">${APPOINTMENTS[a.status]}</span></div><p>${esc(a.note) || "لا توجد ملاحظات حجز"}</p>${[
                ["reschedule_note", "تعديل الموعد"],
                ["no_show_note", "عدم الحضور"],
                ["attendance_note", "الحضور"],
                ["rebooking_note", "إعادة الحجز"],
              ]
                .filter(([k]) => a[k])
                .map(([k, title]) => `<p>${title}: ${esc(a[k])}</p>`)
                .join(
                  "",
                )}${["scheduled", "confirmed"].includes(a.status) ? `<button data-appointment="${a.id}">تسجيل نتيجة الحجز</button><button data-reschedule="${a.id}">تعديل الموعد</button>` : ""}</div>`,
          )
          .join("")
      : blank(
          "لم يتم تسجيل حجز",
          "بعد وضوح الاحتياج وعرض الحجز، ثبّتي الموعد المتفق عليه.",
        )
  }</div>`)}${fold("history", "تاريخ المتابعة", number(history.length), `<ol class="timeline">${history.map((a) => `<li><div class="timeline-dot"></div><div><strong>${esc(a.body)}</strong><p>${esc(person(a.actor_id))} · ${formatDate(a.created_at)}</p>${activityDetails(a)}${a.details.outcome ? `<span class="badge">${OUTCOMES[a.details.outcome] || ""}</span>` : ""}${a.details.stage ? `<small>الحالة: ${STAGES[a.details.previous_stage]} ← ${STAGES[a.details.stage]}</small>` : ""}${a.details.status ? `<small>الحجز: ${APPOINTMENTS[a.details.status]}</small>` : ""}${a.details.starts_at ? `<small>${formatDate(a.details.starts_at)}</small>` : ""}${a.details.note ? `<small>${esc(a.details.note)}</small>` : ""}${a.details.contact_at ? `<small>وقت التواصل: ${formatDate(a.details.contact_at)}</small>` : ""}</div></li>`).join("")}</ol>`)}${fold("info", "بيانات العميلة", "", `<div class="profile-info"><dl><dt>رقم / معرف التواصل</dt><dd><bdi dir="ltr">${esc(l.contact)}</bdi></dd><dt>الموظفة المسؤولة</dt><dd>${esc(person(l.owner_id))}</dd><dt>حالة العميلة</dt><dd>${STAGES[l.stage]}</dd><dt>التأهيل</dt><dd>${QUALIFICATIONS[l.qualification]}</dd><dt>درجة الاهتمام</dt><dd>${GRADES[l.grade] || "لم يُقيّم"}</dd><dt>تاريخ الاستفسار</dt><dd>${formatDate(l.received_at)}</dd><dt>أول رد</dt><dd>${l.first_response_at ? formatDate(l.first_response_at) : "لم يُسجل"}</dd><dt>الحملة</dt><dd>${esc(l.campaign) || "غير محددة"}</dd><dt>الاعتراض الرئيسي</dt><dd>${esc(label(l.objection_id))}</dd><dt>عدد المتابعات المسجلة</dt><dd>${number(l.follow_up_count)}</dd>${l.lost_reason_id ? `<dt>سبب الفقد</dt><dd>${esc(label(l.lost_reason_id))}</dd>` : ""}<dt>آخر ملاحظة</dt><dd>${esc(l.note) || "لا توجد"}</dd></dl><button data-act="identity">تصحيح البيانات</button></div>`)}`;
  return `<button class="text-button back" data-act="back">→ رجوع</button><div class="file-head"><div><h1>${esc(l.name)}</h1><p>${esc(label(l.service_id))} · ${esc(label(l.source_id))}</p></div>${tempBadge(l)}</div><section class="recap ${lateNow ? "is-late" : ""}"><dl><div><dt>آخر ما حصل</dt><dd>${lastLine}</dd></div><div><dt>الاحتياج</dt><dd>${esc(l.need) || "لسه ماتسجلش"}</dd></div></dl></section>${closed ? `<section class="step-card"><h2>الملف مغلق</h2><button class="primary big" data-act="reopen">إعادة فتح الملف</button></section>` : `<section class="step-card start-card"><p class="next-why">الجاي: ${nextLine}</p><button class="primary big" data-flow-start="${l.id}">ابدئي التواصل</button><button class="text-button" data-act="contact">تسجيل سريع من غير خطوات</button>${more}</section>`}<details class="fold-all" ${folds.has("all") ? "open" : ""} data-fold="all"><summary>تفاصيل أكتر <small>الخطوات والحجوزات والتاريخ</small></summary><div class="fold-all-body">${detailsInner}</div></details>`;
}
const LAYER_TITLES = {
  base: "الأساس",
  stage: "حسب المرحلة",
  temp: "حسب الحرارة",
  state: "حسب الحالة",
  end: "قبل ما تقفلي",
};
function briefHtml(l) {
  const t = tempOf(l),
    b = leadBrief(l, {
      appointments: data.appointments,
      lookup: { label, person },
      contact: contacts.get(l.id) || null,
    }),
    row = (k, v, wide = false) =>
      `<div class="${wide ? "wide" : ""}"><dt>${k}</dt><dd>${v}</dd></div>`,
    why =
      training && t.reasons.length
        ? `<p class="why"><b>${t.temp ? "ليه " + GRADES[t.temp] : "الحرارة"}؟</b> ${t.reasons.map((r) => esc(REASON_LABELS[r] || r)).join("، ")}${t.mode === "manual" ? ` · الدرجة معدّلة يدويًا${t.suggested ? ` والمحسوبة: ${GRADES[t.suggested]}` : ""}` : ""}</p>`
        : "";
  return `<section class="panel brief" aria-label="ملخص الملف"><div class="brief-head"><div><span class="eyebrow">ملخص سريع</span><h2>${esc(b.name)}</h2></div><div class="brief-tags">${tempBadge(l)}</div></div><dl class="brief-grid">${row("المصدر", esc(b.source))}${row("الخدمة", esc(b.service))}${row("المرحلة", `${esc(JOURNEY_LABELS[journeyStage(l)])} · ${esc(b.qualification)}`)}${row("الموظفة", esc(b.owner))}${row("الاحتياج", esc(b.need) || "لم يُسجل بعد", true)}${row("الاعتراض", esc(b.objection) || "لا يوجد")}${row("عدد المتابعات", number(b.followUps))}${row("آخر تواصل", b.lastContact ? `${formatDate(b.lastContact.at)} · ${esc(b.lastContact.outcome)}<small>${esc(b.lastContact.summary)}</small>` : "لم يُسجل تواصل", true)}${row("المتابعة الجاية", b.nextAt ? `${esc(b.nextAction)} · ${formatDate(b.nextAt)}` : "لا توجد")}${row("الموعد القادم", b.nextAppointment ? `${formatDate(b.nextAppointment.starts_at)} · ${APPOINTMENTS[b.nextAppointment.status]}` : "لا يوجد")}</dl>${why}</section>`;
}
function replyVars(l) {
  return {
    الاسم: String(l.name || "").trim().split(/\s+/)[0],
    الخدمة: l.service_id === "service_unknown" ? "" : label(l.service_id),
    الموظفة: me.display_name,
  };
}
function replyCard(r, vars) {
  const f = fillTemplate(r.body, vars);
  return `<article class="reply"><div class="reply-head"><strong>${esc(r.label)}</strong>${r.approved ? '<span class="badge green">معتمد</span>' : '<span class="badge draft">مسودة</span>'}${r.temps.length ? `<span class="reply-temps">${r.temps.map((x) => GRADES[x]).join(" / ")}</span>` : ""}</div><p class="reply-text" dir="auto">${esc(f.text)}</p>${f.missing.length ? `<p class="reply-missing">املي قبل الإرسال: ${f.missing.map((m) => esc(m.replaceAll("_", " "))).join("، ")}</p>` : ""}${training ? `<p class="reply-why"><b>ليه الرد ده؟</b> ${esc(r.why)}</p>` : ""}<button class="primary" data-reply-copy="${esc(r.id)}">${icon("copy")} نسخ الرد</button></article>`;
}
function repliesPanel(l) {
  const t = tempOf(l),
    state = replyChoice[l.id] || defaultReplyState(l, t),
    replies = pickReplies(data.config, {
      state,
      temp: t.temp,
      objectionId: state === "s6" ? l.objection_id : null,
    }),
    vars = replyVars(l);
  const [best, ...others] = replies;
  return `<section class="panel replies"><label class="state-pick"><span>العميلة بتقول إيه؟</span><select data-reply-select aria-label="حالة رد العميلة">${Object.entries(REPLY_STATES).map(([k, v]) => `<option value="${k}" ${k === state ? "selected" : ""}>${v}</option>`).join("")}</select></label>${best ? replyCard(best, vars) : blank("لا توجد ردود لهذه الحالة", "اختاري حالة أخرى، أو اطلبي من الإدارة إضافة قالب بوسم هذه الحالة من الإعدادات.")}${others.length ? `<details class="more-replies"><summary>ردود تانية لنفس الحالة (${number(others.length)})</summary>${others.map((r) => replyCard(r, vars)).join("")}</details>` : ""}</section>`;
}
function checklistState(l) {
  const t = tempOf(l),
    items = buildChecklist(l, t, {
      followUpCount: l.follow_up_count,
      objectionLabel: label(l.objection_id),
    }),
    key = checklistKey(l, t, contacts.get(l.id)?.count || 0),
    done =
      localChecks.get(l.id + "|" + key) ||
      savedChecklist(data.activities, l.id, key);
  return { items, key, done, progress: checklistProgress(items, done) };
}
function checklistPanel(l) {
  const { items, key, done, progress } = checklistState(l),
    qaTitle = Object.fromEntries(QA.map(([k, title]) => [k, title])),
    layers = ["base", "stage", "temp", "state", "end"].filter((x) =>
      items.some((i) => i.layer === x),
    ),
    coverage = Object.values(progress.byQa)
      .map((q) => `${esc(q.title)} ${number(q.done)}/${number(q.total)}`)
      .join(" · ");
  return `<section class="panel checklist"><div class="panel-head"><div><h2>قائمة المتابعة</h2><p>تتغير حسب المرحلة والحرارة وبعد كل تواصل.</p></div><span class="count" id="check-count">${number(progress.complete)} / ${number(progress.total)}</span></div>${layers
    .map(
      (layer) =>
        `<div class="check-group"><h3>${LAYER_TITLES[layer]}</h3>${items
          .filter((i) => i.layer === layer)
          .map(
            (i) =>
              `<label class="check-item"><input type="checkbox" data-check="${esc(i.id)}" data-key="${esc(key)}" ${done[i.id] === true ? "checked" : ""}><span>${esc(i.label)}${i.qa ? `<em class="qa-tag">${esc(qaTitle[i.qa])}</em>` : ""}${training && i.why ? `<small>${esc(i.why)}</small>` : ""}</span></label>`,
          )
          .join("")}</div>`,
    )
    .join(
      "",
    )}${training && coverage ? `<p class="qa-coverage"><b>ربط معايير الجودة:</b> ${coverage}</p>` : ""}</section>`;
}
function appointmentsView() {
  const ids = new Set(filtered().map((l) => l.id));
  const apps = data.appointments
    .filter((a) => ids.has(a.lead_id) && appointmentMatches(a, appointmentView))
    .sort((a, b) =>
      ["past", "attended", "no_show", "rescheduled"].includes(appointmentView)
        ? Date.parse(b.starts_at) - Date.parse(a.starts_at)
        : Date.parse(a.starts_at) - Date.parse(b.starts_at),
    );
  return `${heading("موعد واضح، وتجربة منظمة", "الحجوزات", "المواعيد المسجلة بالتوقيت المحلي للقاهرة. الإتاحة تُراجع مع المركز قبل التثبيت.")}${filters()}${viewTabs({ today: "اليوم", upcoming: "قادمة", past: "سابقة", booked: "محجوز", attended: "حضر", no_show: "لم يحضر", rescheduled: "أعيد تحديده", all: "الكل" }, appointmentView, "appointments")}<section class="panel"><div class="panel-head"><h2>كل الحجوزات</h2><span class="count">${number(apps.length)}</span></div>${
    apps.length
      ? `<div class="table-wrap"><table><thead><tr><th>العميلة</th><th>الموعد</th><th>الموظفة</th><th>حالة الحجز</th><th>الإجراء</th></tr></thead><tbody>${apps
          .map((a) => {
            const l = data.leads.find((l) => l.id === a.lead_id);
            return `<tr><td><button class="text-button" data-open="${l.id}">${esc(l.name)}</button></td><td>${formatDate(a.starts_at)}</td><td>${esc(person(l.owner_id))}</td><td><span class="badge">${APPOINTMENTS[a.status]}</span></td><td>${["scheduled", "confirmed"].includes(a.status) ? `<button data-appointment="${a.id}">تسجيل النتيجة</button>` : "تم التسجيل"}</td></tr>`;
          })
          .join("")}</tbody></table></div>`
      : blank(
          "لا توجد حجوزات",
          "الحجوزات الجديدة هتظهر هنا بعد تسجيلها من ملف العميلة.",
        )
  }</section>`;
}
let dashPeriod = "d30";
function bars(rows, max) {
  return rows
    .map(
      (r) =>
        `<li class="bar-row"><div class="bar-top"><span>${esc(r.label)}</span><strong>${r.value}</strong></div><i class="bar" style="width:${max ? Math.max(3, Math.round((r.n / max) * 100)) : 0}%"></i>${r.sub ? `<small>${r.sub}</small>` : ""}</li>`,
    )
    .join("");
}
function dashboard() {
  const now = Date.now(),
    range = periodRange(dashPeriod, now),
    j = journey(data.leads, data.appointments, range),
    ls = j.leads,
    period = metrics(ls, data.appointments, now),
    current = metrics(data.leads, data.appointments, now),
    svc = serviceStats(data.leads, data.appointments, configs("service"), range, now),
    admin = me.role === "admin";
  const chipsHtml = `<div class="chip-grid period" role="group" aria-label="الفترة">${Object.entries(PERIODS).map(([k, v]) => `<button type="button" class="chip ${k === dashPeriod ? "on" : ""}" data-dash-period="${k}" aria-pressed="${k === dashPeriod}">${v}</button>`).join("")}</div>`;
  const tile = (n, label, target, tone = "") =>
    `<button class="att-tile ${tone}" ${target ? `data-page="${target}"` : "disabled"}><strong>${n}</strong><span>${label}</span></button>`;
  const attention = `<section class="dash-block"><h2>محتاج انتباه دلوقتي</h2><div class="att-grid">${tile(number(current.unanswered), "استفسار من غير رد", "today", current.unanswered ? "alert" : "")}${tile(number(current.overdue), "متابعة متأخرة", "followups", current.overdue ? "alert" : "")}${tile(number(current.unrecorded), "ميعاد عدّى من غير تسجيل حضور", "appointments", current.unrecorded ? "warn" : "")}${tile(period.response === null ? "—" : number(Math.round(period.response)) + " د", "متوسط أول رد في الفترة", "")}</div></section>`;
  const first = j.steps[0][2];
  const journeyHtml = `<section class="dash-block"><h2>رحلة العميلات</h2><p class="dash-note">من أول استفسار لحد الحضور، للعميلات اللي وصلوا في الفترة دي.</p><ol class="journey">${j.steps
    .map(([k, label, n], i) => {
      const prev = i ? j.steps[i - 1][2] : null;
      const worst = j.worst && j.worst.key === k;
      return `<li class="${worst ? "worst" : ""}"><div class="j-top"><strong>${number(n)}</strong><span>${label}</span>${i ? `<em>${percent(n, prev)} من اللي قبلها</em>` : ""}</div><i class="bar" style="width:${first ? Math.max(3, Math.round((n / first) * 100)) : 0}%"></i>${worst ? `<small>أكبر نقطة بنخسر فيها عميلات</small>` : ""}</li>`;
    })
    .join("")}</ol></section>`;
  const svcRows = svc.rows
    .filter((r) => r.inquiries || r.attended || r.upcoming || r.price !== null)
    .sort((a, b) => (b.revenue || 0) - (a.revenue || 0) || b.inquiries - a.inquiries);
  const maxSvc = Math.max(1, ...svcRows.map((r) => (svc.total.revenue ? r.revenue || 0 : r.inquiries)));
  const services = `<section class="dash-block"><div class="dash-head-row"><h2>الخدمات</h2>${admin ? `<button class="text-button" data-page="services">الأسعار</button>` : ""}</div><div class="money-row"><div><span>قيمة الحضور في الفترة</span><strong>${money(svc.total.revenue)}</strong></div><div><span>حجوزات جاية</span><strong>${money(svc.total.pipeline)}</strong></div></div><p class="dash-note">محسوبة من السعر المسجّل لكل خدمة × عدد الحضور، مش من الكاشير.</p>${svc.total.missingPrices ? `<div class="price-warn"><span>${number(svc.total.missingPrices)} خدمة من غير سعر، فقيمتها مش محسوبة.</span>${admin ? `<button data-page="services">أضف الأسعار</button>` : ""}</div>` : ""}<ul class="svc-list">${svcRows
    .map(
      (r) =>
        `<li><div class="svc-top"><strong>${esc(r.label)}</strong><span>${r.price === null ? "من غير سعر" : money(r.price)}</span></div><div class="svc-nums"><span><b>${number(r.inquiries)}</b> استفسار</span><span><b>${number(r.booked)}</b> حجز</span><span><b>${number(r.attended)}</b> حضور</span><span class="svc-val">${money(r.revenue)}</span></div><i class="bar" style="width:${Math.max(3, Math.round(((svc.total.revenue ? r.revenue || 0 : r.inquiries) / maxSvc) * 100))}%"></i></li>`,
    )
    .join("") || `<li class="empty">مفيش بيانات خدمات في الفترة دي.</li>`}</ul></section>`;
  const srcRows = configs("source")
    .map((c) => {
      const x = ls.filter((l) => l.source_id === c.id);
      const b = x.filter((l) => l.first_booked_at).length;
      return { label: c.label, n: x.length, value: number(x.length), sub: x.length ? `${percent(b, x.length)} حجزوا` : "" };
    })
    .filter((r) => r.n)
    .sort((a, b) => b.n - a.n);
  const sources = `<section class="dash-block"><h2>منين بييجوا العميلات</h2><ul class="bar-list">${bars(srcRows, Math.max(1, ...srcRows.map((r) => r.n))) || `<li class="empty">مفيش استفسارات في الفترة دي.</li>`}</ul></section>`;
  const team = admin
    ? `<section class="dash-block"><h2>الفريق</h2><ul class="team-list">${data.profiles
        .filter((p) => p.active)
        .map((p) => {
          const mine = ls.filter((l) => l.owner_id === p.id),
            v = metrics(mine, data.appointments, now),
            open = metrics(data.leads.filter((l) => l.owner_id === p.id), data.appointments, now);
          return { p, v, open, n: mine.length };
        })
        .sort((a, b) => b.n - a.n)
        .map(
          ({ p, v, open }) =>
            `<li><span class="avatar">${esc(p.display_name.charAt(0))}</span><div><strong>${esc(p.display_name)}</strong><div class="team-nums"><span><b>${number(v.total)}</b> عميلة</span><span><b>${number(v.booked)}</b> حجز</span><span><b>${v.response === null ? "—" : number(Math.round(v.response)) + " د"}</b> أول رد</span><span class="${open.overdue ? "late" : ""}"><b>${number(open.overdue)}</b> متأخر</span></div></div></li>`,
        )
        .join("")}</ul><p class="dash-note">الأرقام للتدريب والمتابعة، مش تقييم فردي.</p></section>`
    : "";
  const lostRows = configs("lost_reason")
    .map((c) => {
      const n = ls.filter((l) => l.stage === "lost" && l.lost_reason_id === c.id).length;
      return { label: c.label, n, value: number(n) };
    })
    .filter((r) => r.n)
    .sort((a, b) => b.n - a.n);
  const lost = `<section class="dash-block"><h2>ليه خسرنا عميلات</h2><ul class="bar-list lost">${bars(lostRows, Math.max(1, ...lostRows.map((r) => r.n))) || `<li class="empty">مفيش ملفات اتقفلت في الفترة دي.</li>`}</ul></section>`;
  return `<div class="dash"><div class="dash-title"><h1>لوحة الإدارة</h1><p>${number(ls.length)} استفسار في ${PERIODS[dashPeriod]}</p></div>${chipsHtml}${attention}${journeyHtml}${services}${sources}${team}${lost}<div class="dash-actions"><button data-act="export">تصدير التقرير</button><button data-act="backup">نسخة كاملة JSON</button></div></div>`;
}
function servicesPage() {
  if (me.role !== "admin")
    return blank("للإدارة بس", "الأسعار بتتعدل من حساب الإدارة.");
  const rows = data.config.filter((c) => c.category === "service");
  return `<div class="dash"><div class="dash-title"><h1>الخدمات والأسعار</h1><p>السعر بيظهر للإدارة في اللوحة بس، ومش بيظهر في ردود الموظفين.</p></div><button class="primary big" data-service-add>${icon("plus")} خدمة جديدة</button><ul class="svc-admin">${rows
    .map(
      (c) =>
        `<li class="${c.active ? "" : "off"}"><div><strong>${esc(c.label)}</strong><span>${servicePrice(c) === null ? "من غير سعر" : money(servicePrice(c))}${c.meta?.price_note ? " · " + esc(c.meta.price_note) : ""}${c.active ? "" : " · موقوفة"}</span></div><button data-service="${esc(c.id)}">تعديل</button></li>`,
    )
    .join("")}</ul></div>`;
}
function serviceModal(id) {
  const c = data.config.find((x) => x.id === id && x.category === "service");
  const price = c ? servicePrice(c) : null;
  openModal(
    c ? "تعديل الخدمة" : "خدمة جديدة",
    field("label", "اسم الخدمة", input("label", "text", c?.label || "", true, 'maxlength="160"')) +
      field(
        "price",
        "السعر بالجنيه",
        input("price", "number", price === null ? "" : String(price), false, 'min="0" max="10000000" step="1" inputmode="numeric" placeholder="سيبه فاضي لو لسه مش محدد"'),
      ) +
      field("price_note", "ملاحظة على السعر (اختياري)", input("price_note", "text", c?.meta?.price_note || "", false, 'maxlength="120" placeholder="مثلاً: للجلسة الواحدة"')) +
      field("active", "الحالة", select("active", options({ true: "شغالة", false: "موقوفة" }, String(c?.active ?? true)))),
    (f) => {
      const raw = String(f.price ?? "").trim();
      const priceVal = raw === "" ? null : Number(raw);
      if (priceVal !== null && (!Number.isFinite(priceVal) || priceVal < 0))
        throw Error("السعر لازم يكون رقم");
      return rpc("save_configuration", {
        p: {
          id: c?.id || "service_" + Date.now().toString(36),
          category: "service",
          label: f.label,
          body: c?.body || "",
          active: f.active === "true",
          meta: { price: priceVal, price_note: (f.price_note || "").trim() },
        },
      });
    },
  );
}
function bindDash() {
  document.querySelectorAll("[data-dash-period]").forEach(
    (b) =>
      (b.onclick = () => {
        dashPeriod = b.dataset.dashPeriod;
        render();
      }),
  );
  document.querySelectorAll("[data-service]").forEach(
    (b) => (b.onclick = () => serviceModal(b.dataset.service)),
  );
  document.querySelectorAll("[data-service-add]").forEach(
    (b) => (b.onclick = () => serviceModal(null)),
  );
}
function scripts() {
  return `${heading("محادثات بفهم واهتمام", "دليل التواصل", "قوالب مساعدة. عدّلي التفاصيل حسب كلام العميلة واستخدمي معلومات المركز المعتمدة فقط.")}<div class="notice subtle">لا تشخيص طبي، لا ضمان نتائج، ولا أسعار أو خصومات غير معتمدة. اختيارات المواعيد تُعرض بعد مراجعة الإتاحة.</div><h2 class="section-title">قوالب المحادثة</h2><div class="script-grid">${configs(
    "script",
  )
    .map(
      (c) =>
        `<article class="panel script"><div class="script-top">${icon("book")}<h3>${esc(c.label)}</h3>${tagsOf(c).approved ? "" : '<span class="badge draft">مسودة</span>'}</div><p>${esc(c.body)}</p><button data-copy="${c.id}">نسخ النص</button></article>`,
    )
    .join(
      "",
    )}</div><h2 class="section-title">التعامل مع الاعتراضات</h2><div class="script-grid">${configs(
    "objection",
  )
    .map(
      (c) =>
        `<article class="panel script"><h3>${esc(c.label)}</h3><p>${esc(c.body)}</p><button data-copy="${c.id}">نسخ الرد</button></article>`,
    )
    .join("")}</div>`;
}
function quality() {
  return `${heading("تعلّم مستمر من المحادثات", "الجودة والتدريب", "الدرجات تُدخل بعد مراجعة تواصل حقيقي. المعيار غير المنطبق يُستبعد من إجمالي الوزن.", me.role === "admin" ? '<button class="primary" data-act="qa">إضافة مراجعة</button>' : "")}<section class="panel"><div class="panel-head"><h2>مراجعات الفريق</h2><span class="count">${number(data.qa.length)}</span></div>${
    data.qa.length
      ? `<div class="table-wrap"><table><thead><tr><th>التاريخ</th><th>العميلة</th><th>الموظفة وقت المراجعة</th><th>النتيجة</th><th>ملاحظات التدريب</th></tr></thead><tbody>${[
          ...data.qa,
        ]
          .reverse()
          .map(
            (q) =>
              `<tr><td>${formatDate(q.created_at)}</td><td><button class="text-button" data-open="${q.lead_id}">${esc(data.leads.find((l) => l.id === q.lead_id)?.name)}</button></td><td>${esc(person(q.rep_id))}</td><td>${number(q.score)}٪</td><td>${esc(q.note)}</td></tr>`,
          )
          .join("")}</tbody></table></div>`
      : blank(
          "لم تُسجل مراجعات بعد",
          "مراجعة قصيرة تساعدنا نفهم نقاط القوة وما يحتاج تدريبًا.",
        )
  }</section><div class="notice subtle">سرعة الرد ١٠ · الترحيب ١٠ · استكشاف الاحتياج ١٥ · فهم الاحتياج ١٥ · الثقة ١٠ · الاعتراض ١٥ · طلب الحجز ١٥ · المتابعة ١٠. النتيجة = مجموع الدرجات ÷ مجموع أوزان المعايير المنطبقة.</div>`;
}
function settings() {
  return `${heading("إعدادات فريق رونق", "الإعدادات", "مصادر الاستفسارات وقوالب التواصل وإدارة صلاحيات الفريق.")}<section class="panel"><div class="panel-head"><h2>فريق العمل</h2>${me.role === "admin" ? '<button data-act="member">إضافة / تحديث عضو</button>' : ""}</div><div class="table-wrap"><table><thead><tr><th>الاسم</th><th>الصلاحية</th><th>الحالة</th></tr></thead><tbody>${data.profiles.map((p) => `<tr><td>${esc(p.display_name)}</td><td>${p.role === "admin" ? "إدارة المركز" : "موظفة مبيعات"}</td><td>${p.active ? "مفعلة" : "موقوفة"}</td></tr>`).join("")}</tbody></table></div></section><h2 class="section-title">سياسات التشغيل</h2>${configs(
    "setting",
  )
    .map(
      (c) =>
        `<section class="notice"><strong>${esc(c.label)}</strong><p>${esc(c.body)}</p></section>`,
    )
    .join(
      "",
    )}<section class="panel"><div class="panel-head"><h2>القوائم والقوالب</h2>${me.role === "admin" ? '<button data-act="configuration">إضافة إعداد</button>' : ""}</div><div class="config-list">${data.config
    .filter((c) => c.category !== "setting")
    .map(
      (c) =>
        `<div><span><strong>${esc(c.label)}</strong><small>${{ source: "مصدر", service: "خدمة", objection: "اعتراض", lost_reason: "سبب فقد", script: "قالب تواصل" }[c.category]} · ${c.active ? "مفعل" : "غير مفعل"}</small></span>${me.role === "admin" ? `<button data-config="${c.id}">تعديل</button>` : ""}</div>`,
    )
    .join("")}</div></section>`;
}
function openModal(title, body, onSubmit) {
  const keep = afterSave;
  afterSave = null;
  const dialog = document.querySelector("#modal");
  afterSave = keep;
  dialog.innerHTML = `<form id="modal-form"><div class="modal-head"><h2 id="modal-title">${title}</h2><button class="icon-button" type="button" data-close aria-label="إغلاق">${icon("close")}</button></div><div class="form-grid">${body}</div><div class="form-error" role="alert"></div><div class="modal-footer"><button class="primary" type="submit">حفظ</button><button type="button" data-close>إلغاء</button></div></form>`;
  dialog.querySelectorAll("[data-close]").forEach(
    (b) =>
      (b.onclick = () => {
        if (!mutation) dialog.close();
      }),
  );
  dialog.oncancel = (e) => {
    if (mutation) e.preventDefault();
  };
  dialog.querySelector("form").onsubmit = async (e) => {
    e.preventDefault();
    if (mutation) return;
    mutation = true;
    const buttons = [...dialog.querySelectorAll("button")];
    buttons.forEach((b) => (b.disabled = true));
    const f = Object.fromEntries(new FormData(e.target));
    try {
      await onSubmit(f);
      dialog.close();
      toast("تم الحفظ بنجاح");
      await refresh();
      if (afterSave) {
        const next = afterSave;
        afterSave = null;
        next();
      }
    } catch (err) {
      dialog.querySelector(".form-error").textContent = arabicError(err);
      buttons.forEach((b) => (b.disabled = false));
    } finally {
      mutation = false;
    }
  };
  dialog.showModal();
  return dialog;
}
const nextFields = (l = {}) =>
  field(
    "next_action",
    "الخطوة التالية",
    select("next_action", options(ACTIONS, l.next_action || "follow_up")),
  ) +
  field(
    "next_at",
    "موعد المتابعة القادمة — القاهرة",
    input(
      "next_at",
      "datetime-local",
      localInput(l.next_at || new Date()),
      true,
    ),
  );
function addModal() {
  // Fast path: name, contact and source are all that is needed to save.
  // Everything else has a safe default and sits under "more details".
  openModal(
    "إضافة عميلة جديدة",
    field(
      "name",
      "اسم العميلة",
      input(
        "name",
        "text",
        "",
        true,
        'maxlength="120" autocomplete="off" autofocus',
      ),
    ) +
      field(
        "contact",
        "رقم / معرف التواصل",
        input(
          "contact",
          "text",
          "",
          true,
          'dir="ltr" inputmode="tel" maxlength="160" autocomplete="off" placeholder="01xxxxxxxxx أو @username"',
        ),
      ) +
      field(
        "source_id",
        "مصدر الاستفسار",
        select("source_id", configOptions("source", "", "اختاري المصدر")),
      ) +
      `<details class="wide more-fields"><summary>تفاصيل إضافية (اختياري)</summary><div class="form-grid">` +
      field(
        "owner_id",
        "موظفة المبيعات",
        select("owner_id", peopleOptions(me.id)),
      ) +
      field(
        "service_id",
        "الخدمة / الاهتمام",
        select("service_id", configOptions("service", "service_unknown")),
      ) +
      field(
        "received_at",
        "وقت وصول الاستفسار — القاهرة",
        input("received_at", "datetime-local", localInput(), true),
      ) +
      field(
        "campaign",
        "اسم الحملة إن وُجد",
        input("campaign", "text", "", false, 'maxlength="200"'),
      ) +
      field(
        "next_at",
        "موعد الرد الأول — القاهرة",
        input("next_at", "datetime-local", localInput(), true),
      ) +
      field(
        "need",
        "ملخص الاحتياج",
        `<textarea id="need" name="need" maxlength="3000" rows="3"></textarea>`,
        true,
      ) +
      field(
        "note",
        "ملاحظات",
        `<textarea id="note" name="note" maxlength="3000" rows="2"></textarea>`,
        true,
      ) +
      `</div></details>`,
    async (f) => {
      if (!contactValid(f.contact))
        throw Error("اكتبي رقم أو بريد أو معرف تواصل صالح");
      const contact = normalizeContact(f.contact);
      if (data.leads.some((l) => l.contact === contact))
        throw Error("رقم التواصل مسجل بالفعل. ابحثي عنه في قائمة العميلات.");
      selected = await rpc("add_lead", {
        p: {
          ...f,
          contact,
          received_at: cairoISO(f.received_at),
          next_at: cairoISO(f.next_at),
        },
      });
    },
  );
}
function contactModal(l) {
  afterSave = () => {
    go("today");
    toast("اتسجل. دي الخطوة اللي بعدها");
  };
  const firstBox = !l.first_response_at
    ? `<label class="checkbox wide"><input type="checkbox" name="first_reply" checked> ده أول رد من الفريق على استفسار العميلة</label>`
    : "";
  const dlg = openModal(
    "سجّلي اللي حصل",
    field(
      "outcome",
      "نتيجة التواصل",
      select("outcome", options(OUTCOMES, "interested")),
    ) +
      field(
        "body",
        "ملخص قصير",
        `<textarea id="body" name="body" required maxlength="3000" rows="3" placeholder="إيه اللي اتقال؟ وإيه المتفق عليه؟"></textarea>`,
        true,
      ) +
      firstBox +
      nextFields({
        ...l,
        next_action: l.first_response_at ? l.next_action : "discovery",
      }) +
      `<div class="quick-days wide" role="group" aria-label="اختصار موعد المتابعة"><button type="button" data-days="1">بكرة</button><button type="button" data-days="3">بعد ٣ أيام</button><button type="button" data-days="7">بعد أسبوع</button></div>` +
      `<details class="wide more-fields"><summary>تفاصيل تانية (الوقت: دلوقتي)</summary><div class="form-grid">` +
      field(
        "contact_at",
        "وقت التواصل الفعلي — القاهرة",
        input("contact_at", "datetime-local", localInput(), true),
      ) +
      (l.first_response_at
        ? `<label class="checkbox wide"><input type="checkbox" name="first_reply" disabled> الرد الأول مسجل بالفعل</label>`
        : "") +
      `<label class="checkbox wide"><input type="checkbox" name="is_follow_up"> التواصل ده متابعة بعد تواصل سابق</label></div></details>`,
    (f) =>
      rpc("record_contact", {
        lid: l.id,
        expected: l.revision,
        p: {
          ...f,
          contact_at: cairoISO(f.contact_at),
          first_reply: f.first_reply === "on",
          is_follow_up: f.is_follow_up === "on",
          next_at: cairoISO(f.next_at),
        },
      }),
  );
  dlg.querySelectorAll("[data-days]").forEach(
    (b) =>
      (b.onclick = () => {
        const t = localInput(Date.now() + Number(b.dataset.days) * 86400000);
        const el = dlg.querySelector("#next_at");
        if (el) el.value = t.slice(0, 11) + "11:00";
      }),
  );
}
function editModal(l, initialStage) {
  const allowed =
    l.stage === "booked"
      ? ["booked"]
      : l.stage === "no_show"
        ? ["no_show", "follow_up", "lost"]
        : ["active", "follow_up", "lost"];
  const d = openModal(
    "تحديث حالة العميلة",
    field(
      "owner_id",
      "الموظفة المسؤولة",
      select("owner_id", peopleOptions(l.owner_id)),
    ) +
      field(
        "stage",
        "حالة العميلة",
        select(
          "stage",
          options(
            Object.fromEntries(allowed.map((k) => [k, STAGES[k]])),
            initialStage || (l.stage === "new" ? "active" : l.stage),
          ),
        ),
      ) +
      field(
        "qualification",
        "التأهيل",
        select(
          "qualification",
          options(QUALIFICATIONS, l.qualification || "unknown"),
        ),
      ) +
      field(
        "grade",
        "درجة الاهتمام",
        `<select id="grade" name="grade">${options(GRADES, l.grade, "تلقائي — تُحسب من التواصل")}</select>`,
      ) +
      field(
        "objection_id",
        "الاعتراض الرئيسي",
        `<select id="objection_id" name="objection_id">${configOptions("objection", l.objection_id, "غير محدد")}</select>`,
      ) +
      field(
        "lost_reason_id",
        "سبب الفقد",
        `<select id="lost_reason_id" name="lost_reason_id">${configOptions("lost_reason", l.lost_reason_id, "اختاري السبب")}</select>`,
      ) +
      field(
        "need",
        "ملخص الاحتياج",
        `<textarea id="need" name="need">${esc(l.need)}</textarea>`,
        true,
      ) +
      nextFields(l) +
      field(
        "note",
        "ملاحظة",
        `<textarea id="note" name="note">${esc(l.note)}</textarea>`,
        true,
      ),
    (f) =>
      rpc("update_lead", {
        lid: l.id,
        expected: l.revision,
        p: {
          ...f,
          owner_id: f.owner_id || l.owner_id,
          next_at: f.next_at ? cairoISO(f.next_at) : null,
        },
      }),
  );
  if (me.role !== "admin") d.querySelector("#owner_id").disabled = true;
  const sync = () => {
    const lost = d.querySelector("#stage").value === "lost";
    for (const id of ["next_action", "next_at"]) {
      const el = d.querySelector("#" + id);
      el.disabled = lost;
      el.required = !lost;
      el.closest("label").hidden = lost;
    }
    const reason = d.querySelector("#lost_reason_id");
    reason.required = lost;
    reason.closest("label").hidden = !lost;
  };
  d.querySelector("#stage").onchange = sync;
  sync();
}
function identityModal(l) {
  openModal(
    "تصحيح بيانات العميلة",
    field("name", "الاسم", input("name", "text", l.name, true)) +
      field(
        "contact",
        "رقم التواصل",
        input("contact", "text", l.contact, true),
      ) +
      field(
        "source_id",
        "المصدر",
        select("source_id", configOptions("source", l.source_id)),
      ) +
      field(
        "service_id",
        "الخدمة",
        select("service_id", configOptions("service", l.service_id)),
      ) +
      field(
        "campaign",
        "الحملة / المرجع",
        input("campaign", "text", l.campaign),
      ),
    (f) => {
      if (!contactValid(f.contact)) throw Error("راجعي رقم التواصل");
      return rpc("correct_lead", {
        lid: l.id,
        expected: l.revision,
        p: { ...f, contact: normalizeContact(f.contact) },
      });
    },
  );
}
function rescheduleModal(id) {
  const a = data.appointments.find((a) => a.id === id),
    l = data.leads.find((l) => l.id === a.lead_id);
  openModal(
    "إعادة تحديد الموعد",
    field(
      "starts_at",
      "الموعد الجديد — القاهرة",
      input(
        "starts_at",
        "datetime-local",
        localInput(Date.now() + 86400000),
        true,
      ),
    ) +
      field(
        "note",
        "سبب التعديل",
        `<textarea id="note" name="note"></textarea>`,
        true,
      ),
    (f) =>
      rpc("reschedule_appointment", {
        aid: id,
        expected: l.revision,
        p: { ...f, starts_at: cairoISO(f.starts_at) },
      }),
  );
}
function bookModal(l) {
  if (
    !l.first_response_at ||
    l.qualification !== "qualified" ||
    !l.booking_offered_at
  ) {
    toast("سجلي الرد والتأهيل وعرض الحجز أولًا، ثم ثبّتي الموعد.", true);
    return;
  }
  openModal(
    "تثبيت حجز",
    `<div class="notice subtle wide">راجعي إتاحة الموعد مع المركز قبل الحفظ. النظام لا يعرض جدول الطبيبات أو الغرف.</div>` +
      field(
        "starts_at",
        "الموعد المتفق عليه — القاهرة",
        input(
          "starts_at",
          "datetime-local",
          localInput(Date.now() + 86400000),
          true,
        ),
      ) +
      field(
        "note",
        "ملاحظات الحجز",
        `<textarea id="note" name="note" maxlength="3000" rows="3"></textarea>`,
        true,
      ),
    (f) =>
      rpc("book_appointment", {
        lid: l.id,
        expected: l.revision,
        p: { ...f, starts_at: cairoISO(f.starts_at) },
      }),
  );
}
function appointmentModal(id) {
  const a = data.appointments.find((a) => a.id === id),
    l = data.leads.find((l) => l.id === a.lead_id);
  const d = openModal(
    "تسجيل نتيجة الحجز",
    `<p class="wide">${esc(l.name)} · ${formatDate(a.starts_at)}</p>` +
      field(
        "status",
        "نتيجة الحجز",
        select(
          "status",
          options(
            Object.fromEntries(
              ["confirmed", "attended", "no_show", "cancelled"].map((k) => [
                k,
                APPOINTMENTS[k],
              ]),
            ),
            "confirmed",
          ),
        ),
      ) +
      field(
        "next_at",
        "موعد التواصل البديل عند الغياب / الإلغاء",
        input("next_at", "datetime-local", localInput(), true),
      ) +
      field(
        "note",
        "ملاحظات",
        `<textarea id="note" name="note" maxlength="3000" rows="3"></textarea>`,
        true,
      ),
    (f) =>
      rpc("set_appointment", {
        aid: id,
        expected: l.revision,
        p: { ...f, next_at: f.next_at ? cairoISO(f.next_at) : null },
      }),
  );
  const sync = () => {
    const needed = ["no_show", "cancelled"].includes(
        d.querySelector("#status").value,
      ),
      el = d.querySelector("#next_at");
    el.disabled = !needed;
    el.required = needed;
    el.closest("label").hidden = !needed;
  };
  d.querySelector("#status").onchange = sync;
  sync();
}
function reopenModal(l) {
  openModal(
    "إعادة فتح الملف",
    field(
      "note",
      "سبب إعادة الفتح",
      `<textarea id="note" name="note" maxlength="3000" required rows="3"></textarea>`,
      true,
    ) +
      field(
        "next_at",
        "موعد الخطوة التالية — القاهرة",
        input("next_at", "datetime-local", localInput(), true),
      ),
    (f) =>
      rpc("reopen_lead", {
        lid: l.id,
        expected: l.revision,
        p: { ...f, next_at: cairoISO(f.next_at) },
      }),
  );
}
function qaModal() {
  if (!data.leads.length) {
    toast("أضيفي عميلة وسجلي التواصل قبل مراجعة الجودة.", true);
    return;
  }
  const d = openModal(
    "مراجعة جودة التواصل",
    field(
      "lead_id",
      "العميلة",
      select(
        "lead_id",
        options(Object.fromEntries(data.leads.map((l) => [l.id, l.name]))),
      ),
    ) +
      QA.map(([k, t, w]) =>
        field(
          k,
          `${t} — من ${number(w)}`,
          input(
            k,
            "number",
            "",
            false,
            `min="0" max="${w}" step="0.5" placeholder="فارغ = لا ينطبق"`,
          ),
        ),
      ).join("") +
      `<div class="qa-preview wide">النتيجة: <strong id="qa-score">—</strong></div>` +
      field(
        "note",
        "ملاحظة تدريب قابلة للتطبيق",
        `<textarea id="note" name="note" maxlength="3000" rows="3" required></textarea>`,
        true,
      ),
    (f) => {
      const scores = Object.fromEntries(
        QA.map(([k]) => [k, f[k] === "" ? null : Number(f[k])]),
      );
      if (qaScore(scores) === null)
        throw Error("أدخلي درجة معيار واحد على الأقل");
      return rpc("save_qa", { lid: f.lead_id, p: { scores, note: f.note } });
    },
  );
  d.querySelectorAll("input").forEach(
    (i) =>
      (i.oninput = () => {
        try {
          const score = qaScore(
            Object.fromEntries(new FormData(d.querySelector("form"))),
          );
          d.querySelector("#qa-score").textContent =
            score === null ? "—" : number(score) + "٪";
        } catch {
          d.querySelector("#qa-score").textContent = "راجعي الدرجات";
        }
      }),
  );
}
function memberModal() {
  openModal(
    "إضافة / تحديث عضو الفريق",
    `<div class="notice subtle wide">أنشئي حساب العضو أولًا داخل إدارة تسجيل الدخول، ثم انسخي معرّف الحساب هنا. لا يُنشئ هذا الإجراء حساب دخول أو يرسل دعوة.</div>` +
      field(
        "uid",
        "معرّف حساب العضو",
        input("uid", "text", "", true, 'dir="ltr" pattern="[a-fA-F0-9-]{36}"'),
      ) +
      field(
        "display_name",
        "اسم الموظفة",
        input("display_name", "text", "", true, 'maxlength="120"'),
      ) +
      field(
        "role",
        "الصلاحية",
        select(
          "role",
          options({ rep: "موظفة مبيعات", admin: "إدارة المركز" }, "rep"),
        ),
      ) +
      field(
        "active",
        "حالة الحساب",
        select("active", options({ true: "مفعل", false: "موقوف" }, "true")),
      ),
    (f) =>
      rpc("manage_member", {
        uid: f.uid,
        p: { ...f, active: f.active === "true" },
      }),
  );
}
const TAGGABLE = ["script", "objection"];
function configModal(id) {
  const c = data.config.find((c) => c.id === id);
  const tags = c ? tagsOf(c) : { states: [], temps: [], objections: [], why: "", approved: false };
  const checks = (prefix, entries, selected) =>
    entries
      .map(
        ([k, v]) =>
          `<label class="checkbox"><input type="checkbox" name="${prefix}${esc(k)}" ${selected.includes(k) ? "checked" : ""}> ${esc(v)}</label>`,
      )
      .join("");
  const d = openModal(
    c ? "تعديل إعداد" : "إضافة إعداد",
    field(
      "id",
      "رمز الإعداد",
      input(
        "id",
        "text",
        c?.id || "",
        true,
        `dir="ltr" pattern="[a-z0-9_]+" ${c ? "readonly" : ""}`,
      ),
    ) +
      field(
        "category",
        "نوع الإعداد",
        select(
          "category",
          options(
            {
              source: "مصدر",
              service: "خدمة",
              objection: "اعتراض",
              lost_reason: "سبب فقد",
              script: "قالب تواصل",
            },
            c?.category || "service",
          ),
        ),
      ) +
      field(
        "label",
        "الاسم الظاهر للفريق",
        input("label", "text", c?.label || "", true, 'maxlength="160"'),
      ) +
      field(
        "active",
        "حالة الإعداد",
        select(
          "active",
          options(
            { true: "مفعل", false: "غير مفعل" },
            String(c?.active ?? true),
          ),
        ),
      ) +
      field(
        "body",
        "النص / التفاصيل المعتمدة",
        `<textarea id="body" name="body" maxlength="5000" rows="5">${esc(c?.body || "")}</textarea>`,
        true,
      ) +
      `<fieldset class="wide tag-fields" id="tag-fields"><legend>وسوم ظهور الرد</legend><p>الرد يظهر في ملف العميلة للحالات والحرارة المحددة هنا.</p><div class="check-row"><b>حالة رد العميلة</b>${checks("st_", Object.entries(REPLY_STATES), tags.states)}</div><div class="check-row"><b>الحرارة</b>${checks("tp_", Object.entries(GRADES), tags.temps)}</div><div class="check-row"><b>الاعتراض</b>${checks("ob_", configs("objection").map((o) => [o.id, o.label]), tags.objections)}</div><label class="field wide"><span>ليه الرد ده؟ (للتدريب)</span><textarea id="why" name="why" maxlength="600" rows="2">${esc(tags.why)}</textarea></label><label class="checkbox wide"><input type="checkbox" name="approved" ${tags.approved ? "checked" : ""}> معتمد من الإدارة (بدون علامة «مسودة»)</label></fieldset>`,
    (f) => {
      const p = { ...f, active: f.active === "true" };
      for (const k of Object.keys(p))
        if (/^(st|tp|ob)_/.test(k) || k === "why" || k === "approved")
          delete p[k];
      if (TAGGABLE.includes(f.category)) {
        const pick = (prefix) =>
          Object.keys(f)
            .filter((k) => k.startsWith(prefix))
            .map((k) => k.slice(prefix.length));
        p.meta = {
          ...(c?.meta && typeof c.meta === "object" ? c.meta : {}),
          states: pick("st_"),
          temps: pick("tp_"),
          objections: pick("ob_"),
          why: (f.why || "").trim(),
          approved: f.approved === "on",
        };
      }
      return rpc("save_configuration", { p });
    },
  );
  const sync = () => {
    d.querySelector("#tag-fields").hidden = !TAGGABLE.includes(
      d.querySelector("#category").value,
    );
  };
  d.querySelector("#category").onchange = sync;
  sync();
}
function exportResults() {
  const ls = filtered(),
    csv = safeCSV([
      [
        "اسم العميلة",
        "المصدر",
        "الخدمة",
        "الموظفة",
        "الحالة",
        "تاريخ الاستفسار",
        "أول رد",
        "تاريخ أول حجز",
        "الخطوة التالية",
        "موعد المتابعة",
      ],
      ...ls.map((l) => [
        l.name,
        label(l.source_id),
        label(l.service_id),
        person(l.owner_id),
        STAGES[l.stage],
        formatDate(l.received_at),
        l.first_response_at ? formatDate(l.first_response_at) : "",
        l.first_booked_at ? formatDate(l.first_booked_at) : "",
        ACTIONS[l.next_action] || "",
        l.next_at ? formatDate(l.next_at) : "",
      ]),
    ]);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" }),
    url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = `rawnaq-${cairoDay()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast("تم تصدير النتائج الظاهرة حسب صلاحياتك");
}

// ---- Guided contact flow: one lead, three steps, mostly taps ----
const FLOW_STEPS = ["ابدئي", "العميلة قالت إيه؟", "النتيجة"];
const FLOW_DAYS = [
  ["2h", "بعد ساعتين"],
  ["1", "بكرة"],
  ["3", "بعد ٣ أيام"],
  ["7", "بعد أسبوع"],
  ["custom", "يوم تاني"],
];
const OUTCOME_DEFAULTS = {
  interested: "1",
  information: "1",
  later: "3",
  no_answer: "1",
  refused: "7",
};
function startFlow(id) {
  const l = data.leads.find((x) => x.id === id);
  if (!l) return;
  selected = id;
  if (TERMINAL.includes(l.stage)) {
    flow = null;
  } else {
    const cs = checklistState(l);
    flow = {
      lid: id,
      step: 0,
      state: replyChoice[id] || defaultReplyState(l, tempOf(l)),
      done: { ...cs.done },
      key: cs.key,
      outcome: "",
      next: "",
      days: "",
      custom: "",
      note: "",
    };
    replyChoice[id] = flow.state;
  }
  render();
  window.scrollTo(0, 0);
}
function contactLinks(l) {
  const raw = String(l.contact || "").replace(/[\s-]/g, "");
  let digits = raw.replace(/^\+/, "");
  if (/^01[0125]\d{8}$/.test(digits)) digits = "2" + digits;
  if (!/^\d{7,15}$/.test(digits)) return "";
  return `<div class="flow-contact"><a class="contact-btn" href="tel:+${digits}">${icon("phone")} اتصال</a><a class="contact-btn wa" href="https://wa.me/${digits}" target="_blank" rel="noopener">${icon("chat")} واتساب</a></div>`;
}
function flowChecks(l, layers) {
  const items = buildChecklist(l, tempOf(l), {
    followUpCount: l.follow_up_count,
    objectionLabel: label(l.objection_id),
  }).filter((i) => layers.includes(i.layer));
  if (!items.length) return "";
  return `<div class="flow-checks"><h3>علّمي اللي عملتيه</h3>${items
    .map(
      (i) =>
        `<button type="button" class="tick ${flow.done[i.id] ? "on" : ""}" data-flow-tick="${esc(i.id)}" aria-pressed="${!!flow.done[i.id]}"><span class="tick-box">${flow.done[i.id] ? icon("check") : ""}</span><span>${esc(i.label)}${training && i.why ? `<small>${esc(i.why)}</small>` : ""}</span></button>`,
    )
    .join("")}</div>`;
}
function chips(name, entries, current) {
  return `<div class="chip-grid" role="group">${entries
    .map(
      ([k, v]) =>
        `<button type="button" class="chip ${k === current ? "on" : ""}" data-flow-${name}="${esc(k)}" aria-pressed="${k === current}">${esc(v)}</button>`,
    )
    .join("")}</div>`;
}
function flowStates(l) {
  const hide = new Set();
  if (!["booked"].includes(l.stage)) hide.add("s8");
  if (l.stage !== "no_show") hide.add("s9");
  if (l.stage !== "attended") hide.add("s11");
  return Object.entries(REPLY_STATES).filter(
    ([k]) => !hide.has(k) || k === flow.state,
  );
}
function flowReply(l, state) {
  const t = tempOf(l),
    replies = pickReplies(data.config, {
      state,
      temp: t.temp,
      objectionId: state === "s6" ? l.objection_id : null,
    }),
    vars = replyVars(l);
  const [best, ...others] = replies;
  if (!best)
    return `<p class="flow-empty">مفيش رد جاهز للحالة دي لسه. اكتبي ردك بنفسك.</p>`;
  return `${replyCard(best, vars)}${others.length ? `<details class="more-replies"><summary>ردود تانية (${number(others.length)})</summary>${others.map((r) => replyCard(r, vars)).join("")}</details>` : ""}`;
}
function flowNextAt() {
  if (flow.days === "custom") return flow.custom;
  if (flow.days === "2h") return localInput(Date.now() + 2 * 3600e3);
  if (!flow.days) return "";
  const t = localInput(Date.now() + Number(flow.days) * 86400000);
  return t.slice(0, 11) + "11:00";
}
function flowSummary(l) {
  const parts = [];
  if (flow.outcome) parts.push(OUTCOMES[flow.outcome]);
  if (flow.state) parts.push("قالت: " + REPLY_STATES[flow.state]);
  if (flow.next) parts.push("الجاي: " + ACTIONS[flow.next]);
  return parts.join(" · ");
}
function flowView() {
  const l = data.leads.find((x) => x.id === flow.lid);
  if (!l) {
    flow = null;
    return pageView();
  }
  const firstReply = !l.first_response_at;
  const lc = contacts.get(l.id);
  const bar = `<div class="flow-progress" aria-label="خطوة ${number(flow.step + 1)} من ${number(FLOW_STEPS.length)}">${FLOW_STEPS.map((t, i) => `<span class="${i < flow.step ? "done" : i === flow.step ? "now" : ""}"></span>`).join("")}</div>`;
  const head = `<header class="flow-head"><button class="icon-button" data-flow-close aria-label="إغلاق">${icon("close")}</button><div class="flow-title"><strong>${esc(l.name)}</strong><small>${esc(label(l.service_id))} · ${esc(label(l.source_id))}</small></div>${tempBadge(l)}</header>${bar}<p class="flow-step-name"><span>خطوة ${number(flow.step + 1)} من ${number(FLOW_STEPS.length)}</span> ${FLOW_STEPS[flow.step]}</p>`;
  let body = "";
  if (flow.step === 0) {
    body = `${contactLinks(l)}<p class="flow-context">${lc ? `آخر مرة: ${formatDate(lc.at)} · ${esc(OUTCOMES[lc.outcome] || "")}${lc.summary ? " — " + esc(lc.summary) : ""}` : firstReply ? "أول تواصل معاها. الرد السريع أهم حاجة." : "مفيش تواصل مسجّل قبل كده."}</p><section class="flow-card"><h3>ابدئي بالرد ده</h3>${flowReply(l, flow.state)}</section>${flowChecks(l, ["base"])}`;
  } else if (flow.step === 1) {
    body = `<section class="flow-card"><h3>اختاري اللي العميلة قالته</h3>${chips("state", flowStates(l), flow.state)}</section><section class="flow-card"><h3>الرد المناسب</h3>${flowReply(l, flow.state)}</section>${flowChecks(l, ["stage", "temp", "state"])}`;
  } else {
    const actions = Object.entries(ACTIONS).filter(
      ([k]) => !(k === "first_reply" && firstReply && flow.outcome !== "no_answer") && k !== "attendance",
    );
    body = `<section class="flow-card"><h3>إيه اللي حصل؟</h3>${chips("outcome", Object.entries(OUTCOMES), flow.outcome)}</section>${
      flow.outcome
        ? `<section class="flow-card"><h3>الخطوة الجاية</h3>${chips("action", actions, flow.next)}</section><section class="flow-card"><h3>إمتى؟</h3>${chips("days", FLOW_DAYS, flow.days)}${flow.days === "custom" ? `<input class="flow-date" type="datetime-local" data-flow-custom value="${esc(flow.custom || localInput(Date.now() + 86400000))}">` : ""}</section><details class="flow-note" ${flow.note ? "open" : ""}><summary>إضافة ملاحظة (اختياري)</summary><textarea data-flow-note rows="3" maxlength="2000" placeholder="أي تفصيلة مهمة للمرة الجاية">${esc(flow.note)}</textarea></details><p class="flow-summary">${icon("check")} هيتسجل: ${esc(flowSummary(l))}${flowNextAt() ? " · " + esc(formatDate(cairoISO(flowNextAt()))) : ""}</p>`
        : ""
    }`;
  }
  const canSave = flow.outcome && flow.next && flowNextAt();
  const foot = `<footer class="flow-foot">${flow.step > 0 ? `<button data-flow-back>رجوع</button>` : `<button data-flow-skip>اتخطّي للنتيجة</button>`}${flow.step < FLOW_STEPS.length - 1 ? `<button class="primary" data-flow-next>التالي ${icon("arrow")}</button>` : `<button class="primary" data-flow-save ${canSave ? "" : "disabled"}>حفظ والعميلة اللي بعدها</button>`}</footer>`;
  return `<div class="flow">${head}<div class="flow-body">${body}</div>${foot}</div>`;
}
function setOutcome(l, o) {
  flow.outcome = o;
  const firstReply = !l.first_response_at;
  if (o === "no_answer") flow.next = firstReply ? "first_reply" : "follow_up";
  else if (firstReply) flow.next = "discovery";
  else if (o === "interested" && tempOf(l).temp === "hot") flow.next = "offer_booking";
  else if (o === "information") flow.next = "follow_up";
  else flow.next = l.next_action && l.next_action !== "first_reply" ? l.next_action : "follow_up";
  flow.days = o === "no_answer" && firstReply ? "2h" : OUTCOME_DEFAULTS[o];
  const endItem = "end_next";
  flow.done[endItem] = true;
}
async function saveFlow() {
  const l = data.leads.find((x) => x.id === flow.lid);
  if (!l || mutation) return;
  const nextAt = flowNextAt();
  if (!flow.outcome || !flow.next || !nextAt) return;
  const firstReply = !l.first_response_at && flow.outcome !== "no_answer";
  const body = [flowSummary(l), flow.note.trim()].filter(Boolean).join(" — ");
  const btn = document.querySelector("[data-flow-save]");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "جاري الحفظ…";
  }
  mutation = true;
  try {
    await rpc("record_contact", {
      lid: l.id,
      expected: l.revision,
      p: {
        outcome: flow.outcome,
        body,
        next_action: flow.next,
        next_at: cairoISO(nextAt),
        contact_at: cairoISO(localInput()),
        first_reply: firstReply,
        is_follow_up: !!contacts.get(l.id),
      },
    });
    try {
      await rpc("record_checklist", {
        lid: l.id,
        p: { key: flow.key, done: flow.done },
      });
    } catch {}
    flow = null;
    mutation = false;
    await refresh();
    go("today");
    toast("اتسجل ✓ ودي العميلة اللي بعدها");
  } catch (e) {
    mutation = false;
    toast(arabicError(e), true);
    if (btn) {
      btn.disabled = false;
      btn.textContent = "حفظ والعميلة اللي بعدها";
    }
  }
}
function bindFlow() {
  document.querySelectorAll("[data-flow-start]").forEach(
    (b) => (b.onclick = () => startFlow(b.dataset.flowStart)),
  );
  if (!flow) return;
  const l = data.leads.find((x) => x.id === flow.lid);
  if (!l) return;
  const repaint = (top = false) => {
    render();
    if (top) window.scrollTo(0, 0);
  };
  const on = (sel, fn) =>
    document.querySelectorAll(sel).forEach((b) => (b.onclick = () => fn(b)));
  on("[data-flow-close]", () => {
    flow = null;
    go("today");
  });
  on("[data-flow-next]", () => {
    flow.step = Math.min(flow.step + 1, FLOW_STEPS.length - 1);
    repaint(true);
  });
  on("[data-flow-back]", () => {
    flow.step = Math.max(flow.step - 1, 0);
    repaint(true);
  });
  on("[data-flow-skip]", () => {
    flow.step = FLOW_STEPS.length - 1;
    repaint(true);
  });
  on("[data-flow-tick]", (b) => {
    const k = b.dataset.flowTick;
    flow.done[k] = !flow.done[k];
    repaint();
  });
  on("[data-flow-state]", (b) => {
    flow.state = b.dataset.flowState;
    replyChoice[l.id] = flow.state;
    repaint();
  });
  on("[data-flow-outcome]", (b) => {
    setOutcome(l, b.dataset.flowOutcome);
    repaint();
  });
  on("[data-flow-action]", (b) => {
    flow.next = b.dataset.flowAction;
    repaint();
  });
  on("[data-flow-days]", (b) => {
    flow.days = b.dataset.flowDays;
    repaint();
  });
  on("[data-flow-save]", () => saveFlow());
  const c = document.querySelector("[data-flow-custom]");
  if (c)
    c.onchange = () => {
      flow.custom = c.value;
      repaint();
    };
  const n = document.querySelector("[data-flow-note]");
  if (n) n.oninput = () => (flow.note = n.value);
}
function go(target) {
  page = target;
  flow = null;
  selected = null;
  pageIndex = 0;
  search = "";
  filterStage = "";
  filterOwner = "";
  filterSource = "";
  rangeFrom = "";
  rangeTo = "";
  window.location.hash = target;
  render();
  window.scrollTo(0, 0);
}
let checkTimer;
function bind() {
  bindFlow();
  bindDash();
  document.querySelectorAll("details[data-fold]").forEach((d) =>
    d.addEventListener("toggle", () => {
      d.open ? folds.add(d.dataset.fold) : folds.delete(d.dataset.fold);
    }),
  );
  document.querySelectorAll("[data-queue]").forEach(
    (b) =>
      (b.onclick = () => {
        followupView = b.dataset.queue;
        pageIndex = 0;
        render();
      }),
  );
  document.querySelectorAll("[data-appointments]").forEach(
    (b) =>
      (b.onclick = () => {
        appointmentView = b.dataset.appointments;
        render();
      }),
  );
  document
    .querySelectorAll("[data-reschedule]")
    .forEach((b) => (b.onclick = () => rescheduleModal(b.dataset.reschedule)));
  document
    .querySelectorAll("[data-page]")
    .forEach((b) => (b.onclick = () => go(b.dataset.page)));
  document.querySelectorAll("[data-open]").forEach(
    (b) =>
      (b.onclick = () => {
        selected = b.dataset.open;
        render();
        window.scrollTo(0, 0);
      }),
  );
  document
    .querySelectorAll("[data-appointment]")
    .forEach(
      (b) => (b.onclick = () => appointmentModal(b.dataset.appointment)),
    );
  document
    .querySelectorAll("[data-config]")
    .forEach((b) => (b.onclick = () => configModal(b.dataset.config)));
  document.querySelectorAll("[data-copy]").forEach(
    (b) =>
      (b.onclick = async () => {
        try {
          await navigator.clipboard.writeText(
            data.config.find((c) => c.id === b.dataset.copy).body,
          );
          toast("تم نسخ النص. راجعي التفاصيل قبل الاستخدام.");
        } catch {
          toast("النسخ التلقائي غير متاح. حددي النص وانسخيه يدويًا.", true);
        }
      }),
  );
  document.querySelectorAll("[data-today-view]").forEach(
    (b) =>
      (b.onclick = () => {
        todayView = b.dataset.todayView;
        render();
      }),
  );
  document.querySelectorAll("[data-reply-select]").forEach(
    (el) =>
      (el.onchange = () => {
        replyChoice[selected] = el.value;
        render();
      }),
  );
  document.querySelectorAll("[data-reply-state]").forEach(
    (b) =>
      (b.onclick = () => {
        replyChoice[selected] = b.dataset.replyState;
        render();
      }),
  );
  document.querySelectorAll("[data-training]").forEach(
    (b) =>
      (b.onchange = () => {
        setTraining(b.checked);
        render();
      }),
  );
  document.querySelectorAll("[data-reply-copy]").forEach(
    (b) =>
      (b.onclick = async () => {
        const l = data.leads.find((x) => x.id === selected);
        if (!l) return;
        const t = tempOf(l),
          state = replyChoice[l.id] || defaultReplyState(l, t),
          r = pickReplies(data.config, {
            state,
            temp: t.temp,
            objectionId: state === "s6" ? l.objection_id : null,
          }).find((x) => x.id === b.dataset.replyCopy);
        if (!r) return;
        const f = fillTemplate(r.body, replyVars(l));
        try {
          await navigator.clipboard.writeText(f.text);
          toast(
            f.missing.length
              ? "تم النسخ. لسه محتاجة تملي: " +
                  f.missing.map((m) => m.replaceAll("_", " ")).join("، ")
              : "تم نسخ الرد. راجعيه قبل الإرسال.",
          );
        } catch {
          toast("النسخ التلقائي غير متاح. حددي النص وانسخيه يدويًا.", true);
        }
      }),
  );
  document.querySelectorAll("[data-check]").forEach(
    (box) =>
      (box.onchange = () => {
        const lid = selected,
          key = box.dataset.key,
          mapKey = lid + "|" + key,
          cur = {
            ...(localChecks.get(mapKey) ||
              savedChecklist(data.activities, lid, key)),
          };
        cur[box.dataset.check] = box.checked;
        localChecks.set(mapKey, cur);
        const total = document.querySelectorAll("[data-check]").length,
          doneCount = document.querySelectorAll("[data-check]:checked").length,
          counter = document.querySelector("#check-count");
        if (counter)
          counter.textContent = `${number(doneCount)} / ${number(total)}`;
        clearTimeout(checkTimer);
        checkTimer = setTimeout(async () => {
          try {
            await rpc("record_checklist", { lid, p: { key, done: cur } });
          } catch (e) {
            toast(
              /record_checklist|function/i.test(e?.message || "")
                ? "حفظ القائمة يحتاج تحديث قاعدة البيانات. التعديل ظاهر هنا فقط لحد ما تقفلي الصفحة."
                : arabicError(e),
              true,
            );
          }
        }, 800);
      }),
  );
  document.querySelectorAll("[data-act]").forEach(
    (b) =>
      (b.onclick = async () => {
        const l = data.leads.find((l) => l.id === selected);
        try {
          switch (b.dataset.act) {
            case "logout": {
              if (qaAnonymous && session?.user?.is_anonymous) {
                try {
                  sessionStorage.removeItem("rawnaq-persona");
                } catch {}
                selected = null;
                personaPicker();
                return;
              }
              const { error } = await db.auth.signOut();
              if (error) throw error;
              data = {
                leads: [],
                appointments: [],
                activities: [],
                profiles: [],
                config: [],
                qa: [],
              };
              me = null;
              selected = null;
              break;
            }
            case "refresh":
              await refresh();
              break;
            case "add":
              addModal();
              break;
            case "back":
              flow = null;
              selected = null;
              render();
              break;
            case "contact":
              contactModal(l);
              break;
            case "edit":
              editModal(l);
              break;
            case "recover-followup":
              editModal(l, "follow_up");
              break;
            case "recover-lost":
              editModal(l, "lost");
              break;
            case "identity":
              identityModal(l);
              break;
            case "offer":
              b.disabled = true;
              await rpc("offer_booking", { lid: l.id, expected: l.revision });
              await refresh();
              break;
            case "backup":
              await exportBackup();
              break;
            case "book":
              bookModal(l);
              break;
            case "reopen":
              reopenModal(l);
              break;
            case "prev":
              pageIndex--;
              render();
              break;
            case "next":
              pageIndex++;
              render();
              break;
            case "export":
              exportResults();
              break;
            case "qa":
              qaModal();
              break;
            case "member":
              memberModal();
              break;
            case "configuration":
              configModal();
              break;
          }
        } catch (e) {
          toast(arabicError(e), true);
        }
      }),
  );
  const s = document.querySelector("#search");
  if (s)
    s.oninput = (e) => {
      search = e.target.value;
      pageIndex = 0;
      const pos = e.target.selectionStart;
      render();
      const t = document.querySelector("#search");
      t.focus();
      t.setSelectionRange(pos, pos);
    };
  for (const [id, set] of [
    ["filter-stage", (v) => (filterStage = v)],
    ["filter-owner", (v) => (filterOwner = v)],
    ["filter-source", (v) => (filterSource = v)],
    ["range-from", (v) => (rangeFrom = v)],
    ["range-to", (v) => (rangeTo = v)],
  ]) {
    const el = document.getElementById(id);
    if (el)
      el.onchange = (e) => {
        set(e.target.value);
        pageIndex = 0;
        render();
      };
  }
}
window.addEventListener("hashchange", () => {
  const p = location.hash.slice(1);
  if (routes.includes(p) && p !== page) {
    page = p;
    selected = null;
    if (me) render();
  }
});
async function init() {
  page = routes.includes(location.hash.slice(1))
    ? location.hash.slice(1)
    : "today";
  if (!configured) {
    login();
    return;
  }
  root.innerHTML = '<main class="access"><p>جاري فتح مساحة رونق…</p></main>';
  db.auth.onAuthStateChange((event, s) => {
    session = s;
    if (event === "SIGNED_OUT") {
      me = null;
      selected = null;
      login();
    } else if (
      ["SIGNED_IN", "INITIAL_SESSION", "TOKEN_REFRESHED"].includes(event)
    ) {
      if (s)
        setTimeout(() => {
          if (!document.querySelector("dialog[open]")) refresh();
        }, 0);
      else if (qaAnonymous) {
        db.auth.signInAnonymously().then(({ error }) => {
          if (error) {
            login();
            toast(arabicError(error), true);
          }
        });
      } else login();
    }
  });
  setInterval(() => {
    if (
      session &&
      me &&
      !mutation &&
      !document.querySelector("dialog[open]") &&
      !document.querySelector("#search:focus")
    )
      refresh();
  }, 60000);
}
init();

function viewTabs(views, current, attribute) {
  return `<div class="filters" role="group">${Object.entries(views)
    .map(
      ([k, v]) =>
        `<button data-${attribute}="${k}" aria-pressed="${k === current}" class="${k === current ? "primary" : ""}">${v}</button>`,
    )
    .join("")}</div>`;
}
function activityDetails(a) {
  const d = a.details || {};
  if (d.field) {
    const translate = (v) => {
      if (v === null) return d.field === "grade" ? "تلقائي" : "غير محدد";
      if (d.field === "stage") return STAGES[v];
      if (d.field === "qualification") return QUALIFICATIONS[v];
      if (d.field === "grade") return GRADES[v];
      if (d.field === "owner_id") return person(v);
      if (d.field.endsWith("_id")) return label(v);
      if (d.field === "next_action") return ACTIONS[v];
      if (d.field === "next_at") return formatDate(v);
      return v;
    };
    return `<small>${esc(translate(d.old))} ← ${esc(translate(d.new))}</small>`;
  }
  return d.next_at
    ? `<small>المتابعة: ${esc(ACTIONS[d.next_action] || "")} · ${formatDate(d.next_at)}</small>`
    : "";
}
function performanceTable(leads, key, groups, title) {
  return `<section class="panel"><h2>${title}</h2><div class="table-wrap"><table><thead><tr><th>الفئة</th><th>العميلات</th><th>حجزن</th><th>حضرن</th><th>التحويل للحجز</th></tr></thead><tbody>${groups
    .map((g) => {
      const m = metrics(
        leads.filter((l) => l[key] === g.id),
        data.appointments,
      );
      return `<tr><td>${esc(g.label)}</td><td>${number(m.total)}</td><td>${number(m.booked)}</td><td>${number(m.attended)}</td><td>${percent(m.booked, m.total)}</td></tr>`;
    })
    .join("")}</tbody></table></div></section>`;
}
async function exportBackup() {
  const fresh = await loadWorkspace();
  if (me.role !== "admin") throw Error("النسخة الكاملة متاحة للإدارة فقط");
  const content = {
    schema_version: "0.2",
    exported_at: new Date().toISOString(),
    timezone: "Africa/Cairo",
    ...fresh,
  };
  const a = document.createElement("a");
  a.href = URL.createObjectURL(
    new Blob([JSON.stringify(content, null, 2)], { type: "application/json" }),
  );
  a.download = "rawnaq-v02-backup.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
