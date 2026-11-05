# RAWNAQ V0.2 checkpoint — 2026-11-04

Continue the existing branch `fix/rawnaq-v0-2-core-pilot`; do not rebuild or switch to browser-local storage.

Implemented source: independent lifecycle/qualification/temperature; booking-offered milestone; NO_SHOW and recovery; Supabase persistence; strict Cairo dates and concurrency; structured activity timeline; preserved notes/linked appointments; operational queues/views; dashboard; conditional forms; identity correction; full JSON export; minimum text readability.

Actual acceptance has passed in Supabase project `uucdnakounzqeqwkzfel`: see `v02-live-test-results.json`, `v02-access-test-results.json` and `v02-live-metrics-results.json`. These are actual HTTPS tests using two independent anonymous identities, explicitly enrolled for 48 hours. No service-role browser key, open enrollment or disabled RLS. Local full suite: 20 passed.

Canonical migration files include all applied V0.2 changes; original initial-file/server-version mapping is documented in README. New migrations were applied only after rechecking zero operational leads/appointments/activities. Synthetic QA records now exist; do not assume the database is empty again. Keep history and migration records intact.

Existing QA deployment to preserve: `https://rawnaq-sales-demo-lt6ppvzdx-eslamba7r1991-8820.vercel.app`. New Preview deployment must identify this branch's exact Git commit and use actual Supabase. Deployment status and URL are verified through Vercel and the final delivery message, not inferred from a local build.

Preview-only anonymous QA flag never grants membership. New anonymous identities see an access-request state until explicitly enrolled with an expiry. Production password Auth/authorization need separate QA before real customer data.

Known security-advisor notices: intentional membership-checked authenticated SECURITY DEFINER RPCs; temporary anonymous policy notices; pre-existing disabled leaked-password protection. Do not claim a production security clearance.

---
# V0.3 checkpoint — 2026-11-05 (branch `feat/rawnaq-v0-3-reply-assistant`, not yet deployed)

Built on the existing JS + Vite + Supabase system; nothing rebuilt; `202611040001_initial.sql` untouched.

Done in source: new sources (`src_phone`, `src_website_form`, `src_landing_page`) as `configuration` rows in `seed.sql` (leads reference sources through `leads.source_id` → `configuration.id`, so no schema change); «متابعات اليوم» as first screen (overdue first, list/Kanban toggle); mobile bottom navigation, floating add button, fast add form (name, contact, source); pure `computeTemperature`/`effectiveTemperature` in `domain.js` (manual override = existing `grade`, empty = auto); `src/assistant.js` (brief, reply picking by state × temperature × objection, template filling, dynamic checklist linked to the eight QA criteria); training mode flag (UI preference only); 24 reply drafts in `seed.sql` labelled «مسودة» until `meta.approved`; tags editable in Settings.

Needs the user to apply: migration `20261105000001_reply_assistant_meta_and_checklist.sql` (additive: `save_configuration` stores `meta`; new `record_checklist` RPC) and the new seed rows. Until then replies use code-default tags and checklist ticks stay local with a toast.

NOT done: public intake endpoint (waiting for architecture choice: Vercel Function vs Supabase Edge Function; security design to be shown first).
Pre-launch (unchanged, outside this work): first admin account, close public/anonymous sign-up, link Vercel to GitHub or custom domain, live login test. The intake default owner needs the first admin account.

## V0.4–0.9 (2026-11-05) — تجربة الموظف كتطبيق + لوحة الإدارة + الأسعار

### اللي اتعمل
- **وضع التواصل (3 خطوات):** ابدئي (اتصال/واتساب + رد افتتاحي + بنود البداية) ← العميلة قالت إيه؟ (اختيارات تغيّر الرد فورًا) ← النتيجة (اختيارات + موعد بضغطة + ملخص تلقائي). الحفظ يرجع لـ«اليوم» على العميلة التالية. نفس RPCs (`record_contact` ثم `record_checklist`).
- **إضافة عميلة:** المصدر والخدمة اختيارات (chips) بدل قوائم، وبعد الحفظ يفتح وضع التواصل على العميلة الجديدة.
- **شريط سفلي كالتطبيقات:** اليوم / العميلات / + جديدة (في المنتصف) / المتابعات / المزيد.
- **لوحة الإدارة من جديد:** فترة (النهارده/7/30/الشهر/الكل)، محتاج انتباه دلوقتي، رحلة العميلات مع أكبر نقطة خسارة، الخدمات (استفسار/حجز/حضور/قيمة الحضور بالسعر المسجّل/حجوزات جاية)، المصادر، الفريق، أسباب الخسارة.
- **الخدمات والأسعار (إدارة فقط):** `configuration.meta.price` و`price_note`. ترحيل `20261105060000_service_prices.sql` (مطبّق على Supabase): `save_configuration` يقبل مفاتيح السعر للخدمات فقط ويدمجها مع الـmeta القديمة. لا أسعار مختلقة؛ الأسعار تدخلها الإدارة/الكاشير.
- **وضع العرض التجريبي:** اختيار اسم بدون كلمة سر (سارة/أحمد/منى/كريم/مديرة المركز=أدمن) عبر `join_qa_workspace(p_person)` (ترحيل `20261105040000_qa_persona_picker.sql`، مطبّق). يقفل تلقائيًا مع `setting_qa_open_access` (أقصى 49 ساعة). حماية Vercel مقفولة والمشروع منشور على production مع `VITE_QA_ANONYMOUS=true`.
- **بيانات عرض:** 16 عميلة تجريبية بأسماء مصرية وأرقام وهمية (+2010000001xx)، والبيانات القديمة اتأرشفت (lost/lost_other) لأن الحذف احتاج موافقة لم تصل.

### قبل الإطلاق الفعلي (لازم)
- إلغاء `VITE_QA_ANONYMOUS` من production، وقفل `setting_qa_open_access`، وإزالة دالة `join_qa_workspace()` القديمة بدون معاملات.
- مسح البيانات التجريبية والمؤرشفة، وإنشاء حسابات حقيقية + أول أدمن، وإعادة حماية/تسجيل الدخول.
