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
} from "./domain.js";
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
  refreshTimer;
const nav = [
  ["today", "اليوم", "sun"],
  ["leads", "العميلات المحتملات", "users"],
  ["followups", "المتابعات", "clock"],
  ["appointments", "الحجوزات", "calendar"],
  ["dashboard", "لوحة المتابعة", "chart"],
  ["scripts", "دليل التواصل", "book"],
  ["qa", "الجودة والتدريب", "check"],
  ["settings", "الإعدادات", "settings"],
];
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
  root.innerHTML = `<main class="auth"><section class="auth-story"><div class="wordmark">رونق<span>RAWNAQ</span></div><div><div class="eyebrow">كل استفسار يستحق اهتمام</div><h1>متابعة أوضح.<br>تجربة أرقى.</h1><p>من أول رسالة، لحد الحجز والحضور.<br>خطوة واضحة لكل عميلة، في مكان واحد.</p></div><small>نظام متابعة العميلات · الإصدار ٠٫٢</small></section><section class="auth-form"><div class="auth-box"><span class="eyebrow">أهلًا بيكي في رونق</span><h2>دخول فريق العمل</h2><p>استخدمي حسابك المخصص لمتابعة العميلات.</p>${!configured ? `<div class="notice"><strong>تجهيز الاتصال لم يكتمل</strong><p>قاعدة البيانات وتسجيل الدخول لم يتم ربطهما بهذه النسخة بعد. لا يمكن تسجيل أو حفظ بيانات عميلات حتى اكتمال الربط.</p></div>` : `<form id="login-form">${field("email", "البريد الإلكتروني", input("email", "email", "", true, 'dir="ltr" autocomplete="username"'))}${field("password", "كلمة المرور", input("password", "password", "", true, 'dir="ltr" autocomplete="current-password" minlength="8"'))}<div class="form-error" role="alert"></div><button class="primary full" type="submit">تسجيل الدخول ${icon("arrow")}</button></form>`}<div class="auth-note">الدخول مخصص لحسابات الفريق المصرح لها.<br>لو محتاجة حساب، تواصلي مع إدارة المركز.</div></div></section></main>`;
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
async function refresh() {
  if (loading) return;
  loading = true;
  try {
    data = await loadWorkspace();
    me = data.profiles.find((p) => p.id === session.user.id && p.active);
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
  root.innerHTML = `<div class="workspace"><aside class="sidebar"><a class="wordmark" href="#today">رونق<span>RAWNAQ</span></a><div class="sidebar-caption">متابعة العميلات</div><nav aria-label="التنقل الرئيسي">${nav.map(([id, title, i]) => `<button data-page="${id}" class="nav-item ${page === id ? "active" : ""}" ${page === id ? 'aria-current="page"' : ""}>${icon(i)}<span>${title}</span>${id === "today" ? `<b>${number(queue(data.leads).length)}</b>` : ""}</button>`).join("")}</nav><div class="sidebar-bottom"><span class="avatar">${esc(me.display_name.charAt(0))}</span><div><strong>${esc(me.display_name)}</strong><small>${me.role === "admin" ? "إدارة المركز" : "موظفة المبيعات"}</small></div><button class="icon-button" data-act="logout" aria-label="تسجيل الخروج">${icon("logout")}</button></div></aside><div class="main"><header class="topbar"><div class="breadcrumb">رونق <span>/</span> ${nav.find((n) => n[0] === page)?.[1]}</div><div class="top-actions"><span class="connection"><i></i> متصل</span><button class="icon-button" data-act="refresh" aria-label="تحديث البيانات">${icon("refresh")}</button></div></header><main class="content">${selected ? profileView() : pageView()}</main><footer>توقيت القاهرة · ${session.user.is_anonymous ? "اختبار QA مؤقت — بيانات وهمية فقط · " : ""}البيانات حسب صلاحيات حسابك <span>رونق — متابعة باهتمام</span></footer></div></div><dialog id="modal" aria-labelledby="modal-title"></dialog>`;
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
  if (page === "scripts") return scripts();
  if (page === "qa") return quality();
  return settings();
}
function today() {
  const m = metrics(data.leads, data.appointments),
    todayApps = data.appointments.filter(
      (a) => cairoDay(a.starts_at) === cairoDay() && a.status !== "cancelled",
    ),
    q = queue(data.leads);
  return `${heading(formatDate(new Date(), false), `يوم جديد، واهتمام مستمر`, `${esc(me.display_name)}، دي الخطوات اللي محتاجة متابعتك النهارده.`, addButton())}<section class="stats">${stat("استفسارات بدون رد", number(m.unanswered), "تحتاج أول تواصل", m.unanswered ? "urgent" : "")}${stat("متابعات اليوم", number(m.today), "كل عميلة بخطوة واضحة")}${stat("متابعات متأخرة", number(m.overdue), "موعدها عدى؛ يشمل النهارده", m.overdue ? "urgent" : "")}${stat("حجوزات اليوم", number(todayApps.length), "راجعي التأكيد والحضور", "highlight")}</section><div class="today-grid"><section class="panel"><div class="panel-head"><div><h2>أولوية المتابعة</h2><p>الاستفسارات الجديدة، ثم المتأخر، ثم الجاهزات للحجز</p></div><span class="count">${number(q.length)}</span></div>${
    q.length
      ? q
          .slice(0, 10)
          .map((l) => leadRow(l, true))
          .join("")
      : blank(
          "كل الخطوات تحت المتابعة",
          "لا توجد مهام عاجلة ظاهرة حاليًا. راجعي قائمة العميلات عند الحاجة.",
        )
  }<button class="text-button panel-link" data-page="followups">كل المتابعات ${icon("arrow")}</button></section><aside class="side-stack"><section class="panel appointment-mini"><div class="panel-head"><h2>مواعيد النهارده</h2>${icon("calendar")}</div>${
    todayApps.length
      ? todayApps
          .slice(0, 5)
          .map(
            (a) =>
              `<button class="appointment-item" data-open="${a.lead_id}"><span class="time">${new Intl.DateTimeFormat("ar-EG", { timeZone: "Africa/Cairo", timeStyle: "short" }).format(new Date(a.starts_at))}</span><div><strong>${esc(data.leads.find((l) => l.id === a.lead_id)?.name)}</strong><small>${APPOINTMENTS[a.status]}</small></div>${icon("arrow")}</button>`,
          )
          .join("")
      : blank("لا توجد مواعيد اليوم", "الحجوزات المسجلة هتظهر هنا تلقائيًا.")
  }</section><section class="tip"><div class="tip-label">من دليل رونق ${icon("book")}</div><h3>ابدئي بالفهم، قبل عرض الحجز.</h3><p>«إيه الهدف اللي تحبي توصلي له؟»</p><button class="text-button" data-page="scripts">افتحي دليل التواصل ${icon("arrow")}</button></section></aside></div>`;
}
function leadRow(l, compact = false) {
  const p = priority(l),
    late =
      l.next_at &&
      Date.parse(l.next_at) < Date.now() &&
      !TERMINAL.includes(l.stage);
  return `<button class="lead-row ${compact ? "compact" : ""}" data-open="${l.id}"><span class="avatar pale">${esc(l.name.charAt(0))}</span><div class="lead-main"><div><strong>${esc(l.name)}</strong>${badge(l)}</div><small>${esc(label(l.service_id))} · ${esc(person(l.owner_id))}</small></div><div class="next ${late ? "late" : ""}"><strong>${!l.first_response_at && !TERMINAL.includes(l.stage) ? "في انتظار أول رد" : ACTIONS[l.next_action] || "الملف مغلق"}</strong><small>${l.next_at ? formatDate(l.next_at) : "—"}</small></div>${compact && p === 0 ? '<span class="dot urgent-dot"></span>' : icon("arrow")}</button>`;
}
function filters(includeDate = false) {
  return `<div class="filters"><label class="search">${icon("search")}<input name="search" id="search" aria-label="بحث بالاسم أو رقم التواصل" placeholder="ابحثي بالاسم أو رقم التواصل" value="${esc(search)}"></label><select id="filter-stage" aria-label="تصفية حسب الحالة">${options(STAGES, filterStage, "كل الحالات")}</select>${me.role === "admin" ? `<select id="filter-owner" aria-label="تصفية حسب الموظفة">${options(Object.fromEntries(data.profiles.map((p) => [p.id, p.display_name])), filterOwner, "كل الموظفات")}</select>` : ""}<select id="filter-source" aria-label="تصفية حسب المصدر">${configOptions("source", filterSource, "كل المصادر")}</select>${includeDate ? `<label class="date-filter">من ${input("range-from", "date", rangeFrom)}</label><label class="date-filter">إلى ${input("range-to", "date", rangeTo)}</label>` : ""}</div>`;
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
      .filter((a) => a.lead_id === l.id)
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)),
    closed = TERMINAL.includes(l.stage);
  return `<button class="text-button back" data-act="back">→ رجوع للقائمة</button>${heading("ملف العميلة", esc(l.name), `${esc(label(l.service_id))} · ${esc(label(l.source_id))}`, badge(l))}<div class="profile-grid"><section class="profile-main"><section class="panel"><div class="panel-head"><h2>الخطوة القادمة</h2>${!closed ? `<button class="text-button" data-act="edit">تحديث البيانات</button>` : ""}</div><div class="action-box ${l.next_at && Date.parse(l.next_at) < Date.now() ? "overdue" : ""}"><div>${icon("clock")}<h3>${ACTIONS[l.next_action] || "الملف مغلق"}</h3></div><p>${l.next_at ? formatDate(l.next_at) : "لا توجد متابعة مفتوحة"}</p><small>${esc(l.need) || "ملخص الاحتياج لم يُسجل بعد."}</small></div><div class="profile-actions">${closed ? '<button class="primary" data-act="reopen">إعادة فتح الملف</button>' : `<button class="primary" data-act="contact">تسجيل تواصل</button><button data-act="edit">تحديث الحالة</button><button data-act="book">${icon("calendar")} ${l.stage === "no_show" ? "إعادة الحجز" : "تثبيت حجز"}</button>${l.stage === "no_show" ? `<button data-act="recover-followup">متابعة</button><button data-act="recover-lost">إغلاق كـ Lost</button>` : ""}${!l.booking_offered_at ? `<button data-act="offer">تم عرض الحجز</button>` : `<span class="badge">عُرض الحجز ${formatDate(l.booking_offered_at)}</span>`}`}</div></section><section class="panel"><div class="panel-head"><h2>الحجوزات</h2><span class="count">${number(apps.length)}</span></div>${
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
  }</section><section class="panel"><div class="panel-head"><h2>تاريخ المتابعة</h2><span class="count">${number(history.length)}</span></div><ol class="timeline">${history.map((a) => `<li><div class="timeline-dot"></div><div><strong>${esc(a.body)}</strong><p>${esc(person(a.actor_id))} · ${formatDate(a.created_at)}</p>${activityDetails(a)}${a.details.outcome ? `<span class="badge">${OUTCOMES[a.details.outcome] || ""}</span>` : ""}${a.details.stage ? `<small>الحالة: ${STAGES[a.details.previous_stage]} ← ${STAGES[a.details.stage]}</small>` : ""}${a.details.status ? `<small>الحجز: ${APPOINTMENTS[a.details.status]}</small>` : ""}${a.details.starts_at ? `<small>${formatDate(a.details.starts_at)}</small>` : ""}${a.details.note ? `<small>${esc(a.details.note)}</small>` : ""}${a.details.contact_at ? `<small>وقت التواصل: ${formatDate(a.details.contact_at)}</small>` : ""}</div></li>`).join("")}</ol></section></section><aside class="side-stack"><section class="panel profile-info"><div class="panel-head"><h2>بيانات العميلة</h2><button data-act="identity">تصحيح البيانات</button></div><dl><dt>رقم / معرف التواصل</dt><dd><bdi dir="ltr">${esc(l.contact)}</bdi></dd><dt>الموظفة المسؤولة</dt><dd>${esc(person(l.owner_id))}</dd><dt>حالة العميلة</dt><dd>${STAGES[l.stage]}</dd><dt>التأهيل</dt><dd>${QUALIFICATIONS[l.qualification]}</dd><dt>درجة الاهتمام</dt><dd>${GRADES[l.grade] || "لم يُقيّم"}</dd><dt>تاريخ الاستفسار</dt><dd>${formatDate(l.received_at)}</dd><dt>أول رد</dt><dd>${l.first_response_at ? formatDate(l.first_response_at) : "لم يُسجل"}</dd><dt>الحملة</dt><dd>${esc(l.campaign) || "غير محددة"}</dd><dt>الاعتراض الرئيسي</dt><dd>${esc(label(l.objection_id))}</dd><dt>عدد المتابعات المسجلة</dt><dd>${number(l.follow_up_count)}</dd>${l.lost_reason_id ? `<dt>سبب الفقد</dt><dd>${esc(label(l.lost_reason_id))}</dd>` : ""}<dt>آخر ملاحظة</dt><dd>${esc(l.note) || "لا توجد"}</dd></dl></section><section class="tip"><div class="tip-label">قبل التواصل</div><p>${esc(configs("script").find((s) => s.id === (l.objection_id ? "script_think" : "script_followup"))?.body || "راجعي تاريخ العميلة قبل المتابعة.")}</p><button class="text-button" data-page="scripts">دليل التواصل ${icon("arrow")}</button></section></aside></div>`;
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
function dashboard() {
  const leads = filtered(),
    m = metrics(leads, data.appointments),
    stages = [
      ["الاستفسارات", m.total],
      ["تم الرد", m.replied],
      ["تم التأهيل", m.qualified],
      ["تم عرض الحجز", m.offered],
      ["تم الحجز مرة على الأقل", m.booked],
    ];
  return `${heading("قرارات مبنية على بيانات", "لوحة المتابعة", "المؤشرات مرتبطة بتاريخ وصول الاستفسار، وبتشمل المراحل المسجلة تاريخيًا.", `<button data-act="export">تصدير التقرير</button><button data-act="backup">نسخة كاملة JSON</button>`)}${filters(true)}<section class="stats dashboard-stats">${stat("العميلات النشطات", number(m.active), "عميلات غير مغلقات")}${stat("عُرض الحجز", number(m.offered), "عميلات فريدات")}${stat("حجزن", number(m.booked), "عميلات حجزن مرة على الأقل")}${stat("حضرن", number(m.attended), "عميلات فريدات")}${stat("الحضور من الحجز", percent(m.attended, m.booked), "عميلات حضرن ÷ عميلات حجزن")}${stat("لم يحضرن", number(m.noShow), "عميلات لديهن غياب تاريخي، يشمل من أعدن الحجز")}${stat("مفقودات", number(m.lost))}${stat("متابعات اليوم", number(m.today), "متبقي اليوم؛ المتأخر منفصل")}${stat("متابعات متأخرة", number(m.overdue))}${stat("إجمالي العميلات", number(m.total), "داخل النطاق المختار")}${stat("نسبة الرد", percent(m.replied, m.total), `${number(m.replied)} تم الرد عليهن`)}${stat("متوسط أول رد", m.response === null ? "—" : number(m.response) + " د", "زمن فعلي، يشمل خارج ساعات العمل")}${stat("التحويل إلى حجز", percent(m.booked, m.total), `${number(m.booked)} عميلة حجزت`, "highlight")}${stat("مواعيد بدون نتيجة", number(m.unrecorded), "مواعيد مرّ وقتها ولم يُسجل حضورها")}</section><div class="analytics-grid"><section class="panel"><div class="panel-head"><h2>مسار التحويل</h2></div><div class="funnel">${stages.map(([s, n], i) => `<div class="funnel-item"><div><span>${s}</span><strong>${number(n)}</strong></div><progress max="${m.total || 1}" value="${n}" aria-label="${s}"></progress><small>${percent(n, m.total)} من الإجمالي${i > 0 ? " · " + percent(n, stages[i - 1][1]) + " من السابقة" : ""}</small></div>`).join("")}</div></section><section class="panel"><div class="panel-head"><h2>أسباب الفقد</h2></div>${configs(
    "lost_reason",
  )
    .map((c) => {
      const n = leads.filter(
        (l) => l.stage === "lost" && l.lost_reason_id === c.id,
      ).length;
      return `<div class="reason"><span>${esc(c.label)}</span><strong>${number(n)}</strong></div>`;
    })
    .join(
      "",
    )}</section></div><section class="panel"><div class="panel-head"><h2>الأداء حسب المصدر</h2></div><div class="table-wrap"><table><thead><tr><th>المصدر</th><th>العميلات</th><th>حجزن</th><th>التحويل</th></tr></thead><tbody>${configs(
    "source",
  )
    .map((c) => {
      const ls = leads.filter((l) => l.source_id === c.id),
        b = ls.filter((l) => l.first_booked_at).length;
      return `<tr><td>${esc(c.label)}</td><td>${number(ls.length)}</td><td>${number(b)}</td><td>${percent(b, ls.length)}</td></tr>`;
    })
    .join("")}</tbody></table></div></section>${
    me.role === "admin"
      ? `<section class="panel"><div class="panel-head"><h2>أداء فريق المبيعات</h2></div><div class="table-wrap"><table><thead><tr><th>الموظفة الحالية</th><th>العميلات</th><th>حجزن</th><th>التحويل</th><th>متوسط الرد</th><th>متأخر</th><th>متوسط الجودة</th></tr></thead><tbody>${data.profiles
          .map((p) => {
            const ls = leads.filter((l) => l.owner_id === p.id),
              v = metrics(ls, data.appointments),
              ids = new Set(ls.map((l) => l.id)),
              reviews = data.qa.filter(
                (q) => q.rep_id === p.id && ids.has(q.lead_id),
              );
            return `<tr><td>${esc(p.display_name)}</td><td>${number(v.total)}</td><td>${number(v.booked)}</td><td>${percent(v.booked, v.total)}</td><td>${v.response === null ? "—" : number(v.response) + " د"}</td><td>${number(v.overdue)}</td><td>${reviews.length ? number(reviews.reduce((s, q) => s + Number(q.score), 0) / reviews.length) + "٪" : "—"}</td></tr>`;
          })
          .join(
            "",
          )}</tbody></table></div><p class="panel-note">الإسناد للموظفة الحالية. سجل النشاط يحتفظ بمن نفّذ كل خطوة؛ المؤشرات ليست تقييمًا منفردًا للموظفة.</p></section>`
      : ""
  } ${performanceTable(leads, "service_id", configs("service"), "الأداء حسب الخدمة")}<p class="footnote">النسبة بدون بيانات تظهر «—». مؤشرات الحجز والحضور والغياب تحسب عميلات فريدات؛ قد تظهر العميلة في الغياب والحضور بعد إعادة الحجز. المواعيد بدون نتيجة تحسب مواعيد. إعادة الحجز لا تضاعف عدد العميلات اللاتي حجزن.</p>`;
}
function scripts() {
  return `${heading("محادثات بفهم واهتمام", "دليل التواصل", "قوالب مساعدة. عدّلي التفاصيل حسب كلام العميلة واستخدمي معلومات المركز المعتمدة فقط.")}<div class="notice subtle">لا تشخيص طبي، لا ضمان نتائج، ولا أسعار أو خصومات غير معتمدة. اختيارات المواعيد تُعرض بعد مراجعة الإتاحة.</div><h2 class="section-title">قوالب المحادثة</h2><div class="script-grid">${configs(
    "script",
  )
    .map(
      (c) =>
        `<article class="panel script"><div class="script-top">${icon("book")}<h3>${esc(c.label)}</h3></div><p>${esc(c.body)}</p><button data-copy="${c.id}">نسخ النص</button></article>`,
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
  const dialog = document.querySelector("#modal");
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
  openModal(
    "إضافة عميلة جديدة",
    field(
      "name",
      "اسم العميلة",
      input("name", "text", "", true, 'maxlength="120" autocomplete="off"'),
    ) +
      field(
        "contact",
        "رقم / معرف التواصل",
        input(
          "contact",
          "text",
          "",
          true,
          'dir="ltr" maxlength="160" placeholder="01xxxxxxxxx أو @username"',
        ),
      ) +
      field(
        "owner_id",
        "موظفة المبيعات",
        select("owner_id", peopleOptions(me.id)),
      ) +
      field(
        "source_id",
        "مصدر الاستفسار",
        select("source_id", configOptions("source", "", "اختاري المصدر")),
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
      ),
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
  openModal(
    "تسجيل تواصل",
    field(
      "contact_at",
      "وقت التواصل الفعلي — القاهرة",
      input("contact_at", "datetime-local", localInput(), true),
    ) +
      field(
        "outcome",
        "نتيجة التواصل",
        select("outcome", options(OUTCOMES, "interested")),
      ) +
      `<label class="checkbox wide"><input type="checkbox" name="first_reply" ${l.first_response_at ? "disabled" : ""}> ده أول رد من الفريق على استفسار العميلة ${l.first_response_at ? "(مسجل بالفعل)" : ""}</label><label class="checkbox wide"><input type="checkbox" name="is_follow_up"> التواصل ده متابعة بعد تواصل سابق</label>` +
      field(
        "body",
        "ملخص التواصل",
        `<textarea id="body" name="body" required maxlength="3000" rows="4" placeholder="سجلي ما اتقال والخطوة المتفق عليها"></textarea>`,
        true,
      ) +
      nextFields({
        ...l,
        next_action: l.first_response_at ? l.next_action : "discovery",
      }),
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
        `<select id="grade" name="grade">${options(GRADES, l.grade, "لم يُقيّم")}</select>`,
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
function configModal(id) {
  const c = data.config.find((c) => c.id === id);
  openModal(
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
      ),
    (f) =>
      rpc("save_configuration", { p: { ...f, active: f.active === "true" } }),
  );
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
function go(target) {
  page = target;
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
function bind() {
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
  document.querySelectorAll("[data-act]").forEach(
    (b) =>
      (b.onclick = async () => {
        const l = data.leads.find((l) => l.id === selected);
        try {
          switch (b.dataset.act) {
            case "logout": {
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
  if (nav.some((n) => n[0] === p) && p !== page) {
    page = p;
    selected = null;
    if (me) render();
  }
});
async function init() {
  page = nav.some((n) => n[0] === location.hash.slice(1))
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
      if (v === null) return "غير محدد";
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
