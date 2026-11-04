import { createClient } from "@supabase/supabase-js";
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const configured = Boolean(url && key);
export const qaAnonymous = import.meta.env.VITE_QA_ANONYMOUS === "true";
// Supabase broadcasts Auth events by storageKey. QA tabs must not replace
// each other's anonymous identity. window.name survives refresh per tab;
// sessionStorage stores only that tab's authentication, never CRM records.
const qaStorageKey = qaAnonymous
  ? window.name.startsWith("rawnaq-qa-")
    ? window.name
    : (window.name = "rawnaq-qa-" + crypto.randomUUID())
  : null;
export const db = configured
  ? createClient(url, key, {
      auth: {
        storage: window.sessionStorage,
        ...(qaStorageKey ? { storageKey: qaStorageKey } : {}),
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;
export function arabicError(e) {
  const s = e?.message || "";
  if (s.includes("duplicate") || s.includes("unique"))
    return "رقم التواصل مسجل بالفعل. ابحثي عنه قبل إضافة عميلة جديدة.";
  if (s.includes("revision_conflict"))
    return "البيانات اتغيرت بواسطة موظفة أخرى. حدّثي الصفحة وراجعي آخر تعديل.";
  if (s.includes("Invalid login"))
    return "البريد الإلكتروني أو كلمة المرور غير صحيحة.";
  if (s.includes("Email not confirmed"))
    return "البريد الإلكتروني لم يتم تأكيده بعد.";
  if (s.includes("rate limit"))
    return "محاولات كثيرة. انتظري قليلًا ثم حاولي مرة أخرى.";
  if (s.includes("Failed to fetch"))
    return "تعذر الاتصال. تأكدي من الإنترنت وحاولي تاني.";
  if (/[\u0600-\u06ff]/.test(s)) return s;
  return "تعذر تنفيذ العملية. راجعي البيانات والصلاحيات وحاولي مرة أخرى.";
}
export async function rpc(name, args = {}) {
  const { data, error } = await db.rpc(name, args);
  if (error) throw error;
  return data;
}
async function all(table, order = "created_at") {
  let rows = [],
    from = 0;
  while (true) {
    const { data, error } = await db
      .from(table)
      .select("*")
      .order(order)
      .order("id")
      .range(from, from + 499);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 500) return rows;
    from += 500;
  }
}
export async function loadWorkspace() {
  const [leads, appointments, activities, profiles, config, qa] =
    await Promise.all([
      all("leads"),
      all("appointments"),
      all("activities"),
      all("profiles"),
      all("configuration", "sort_order"),
      all("qa_reviews"),
    ]);
  return { leads, appointments, activities, profiles, config, qa };
}
