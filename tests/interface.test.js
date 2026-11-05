// Isolated DOM tests. Test data and API doubles are never bundled into the application.
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { Window } from "happy-dom";
import * as domain from "../src/domain.js";
const tick = () => new Promise((r) => setTimeout(r, 10));
test("Arabic interface: navigation, empty data, profile and validated save forms", async () => {
  const w = new Window({ url: "http://localhost/#today" });
  w.document.documentElement.lang = "ar";
  w.document.documentElement.dir = "rtl";
  w.document.body.innerHTML = '<div id="app"></div><div id="toast"></div>';
  w.HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  w.HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
  const own = "00000000-0000-4000-a000-000000000001";
  const fixture = {
    profiles: [
      { id: own, display_name: "موظفة اختبار", role: "admin", active: true },
    ],
    leads: [],
    appointments: [],
    activities: [],
    qa: [],
    config: [
      {
        id: "src_meta",
        category: "source",
        label: "إعلانات ميتا",
        active: true,
      },
      {
        id: "service_4plus",
        category: "service",
        label: "فور بلس",
        active: true,
      },
      {
        id: "service_unknown",
        category: "service",
        label: "لم يتحدد بعد",
        active: true,
      },
    ],
  };
  const calls = [];
  let authHandler;
  const context = vm.createContext({
    console,
    document: w.document,
    window: w,
    location: w.location,
    navigator: w.navigator,
    FormData: w.FormData,
    Blob: w.Blob,
    URL: w.URL,
    setTimeout,
    clearTimeout,
    setInterval: () => 0,
    Date,
    Intl,
    Boolean,
    Error,
    ...domain,
    configured: true,
    qaAnonymous: false,
    db: {
      auth: {
        onAuthStateChange(cb) {
          authHandler = cb;
        },
        signOut: async () => ({ error: null }),
      },
    },
    rpc: async (name, args) => {
      calls.push([name, args]);
      if (name === "join_qa_workspace") {
        fixture.profiles.push({
          id: own,
          display_name: "تجربة رونق",
          role: "rep",
          active: true,
        });
      }
      if (name === "add_lead") {
        fixture.leads.push({
          id: "lead_test",
          ...args.p,
          stage: "new",
          grade: null,
          qualification: "unknown",
          revision: 1,
          created_at: new Date().toISOString(),
        });
        return "lead_test";
      }
    },
    loadWorkspace: async () => fixture,
    arabicError: (e) => e.message,
  });
  let source = await readFile(
    new URL("../src/app.js", import.meta.url),
    "utf8",
  );
  source = source.replace(/^import[\s\S]*?;\n/gm, "");
  vm.runInContext(source, context);
  authHandler("SIGNED_IN", { user: { id: own } });
  await tick();
  await tick();
  assert.ok(w.document.body.textContent.includes("يوم جديد، واهتمام مستمر"));
  assert.ok(w.document.querySelector("aside.sidebar"));
  assert.equal(w.document.querySelectorAll(".stat").length, 4);
  const click = (sel) => {
    const el = w.document.querySelector(sel);
    assert.ok(el, sel);
    el.click();
  };
  click('[data-page="dashboard"]');
  assert.ok(w.document.body.textContent.includes("لوحة المتابعة"));
  assert.ok(w.document.body.textContent.includes("—"));
  click('[data-page="leads"]');
  click('[data-act="add"]');
  let form = w.document.querySelector("#modal-form");
  const fill = (n, v) => (form.querySelector(`[name="${n}"]`).value = v);
  fill("name", "عميلة اختبار");
  fill("contact", "01012345678");
  fill("source_id", "src_meta");
  fill("owner_id", own);
  fill("service_id", "service_4plus");
  form.dispatchEvent(new w.Event("submit", { cancelable: true }));
  await tick();
  await tick();
  assert.equal(calls[0][0], "add_lead");
  assert.equal(calls[0][1].p.contact, "+201012345678");
  assert.ok(w.document.body.textContent.includes("سجّلت تواصل"));
  assert.ok(w.document.body.textContent.includes("عميلة اختبار"));

  click('[data-act="edit"]');
  form = w.document.querySelector("#modal-form");
  assert.deepEqual(
    [...form.querySelector("#stage").options].map((o) => o.value),
    ["active", "follow_up", "lost"],
  );
  assert.equal(form.querySelector("#qualification").value, "unknown");
  assert.equal(form.querySelector("#grade").value, "");
  form.querySelector("#stage").value = "lost";
  form.querySelector("#stage").dispatchEvent(new w.Event("change"));
  assert.equal(form.querySelector("#next_at").disabled, true);
  assert.equal(form.querySelector("#lost_reason_id").required, true);
  form.querySelector("#stage").value = "follow_up";
  form.querySelector("#stage").dispatchEvent(new w.Event("change"));
  assert.equal(form.querySelector("#next_at").required, true);
  form.querySelector("[data-close]").click();
  click('[data-act="identity"]');
  assert.ok(w.document.querySelector("#modal-form #contact"));
  w.document.querySelector("[data-close]").click();
  click('[data-act="contact"]');
  form = w.document.querySelector("#modal-form");
  assert.ok(form.querySelector('[name="first_reply"]'));
  assert.ok(form.querySelector('[name="next_at"]'));
  fill("body", "اختبار تواصل");
  form.dispatchEvent(new w.Event("submit", { cancelable: true }));
  await tick();
  await tick();
  assert.equal(calls[1][0], "record_contact");
  assert.equal(calls[1][1].expected, 1);
  click('[data-page="settings"]');
  assert.ok(w.document.body.textContent.includes("فريق العمل"));
  fixture.profiles = [];
  authHandler("SIGNED_IN", { user: { id: own } });
  await tick();
  await tick();
  assert.ok(w.document.body.textContent.includes(own));
  assert.ok(!w.document.body.textContent.includes("${esc("));
  context.qaAnonymous = true;
  authHandler("SIGNED_IN", { user: { id: own, is_anonymous: true } });
  await tick();
  await tick();
  assert.ok(calls.some(([name]) => name === "join_qa_workspace"));
  assert.ok(w.document.querySelector("aside.sidebar"));
  assert.ok(!w.document.body.textContent.includes("الحساب يحتاج تصريح"));
  await w.happyDOM.close();
});
