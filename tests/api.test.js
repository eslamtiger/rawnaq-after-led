import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
const source = (
  await readFile(new URL("../src/api.js", import.meta.url), "utf8")
)
  .replace(/^import .*;\n/, "")
  .replaceAll("import.meta.env", "env")
  .replaceAll("export ", "");
function load(window, qa = true, error = null) {
  let settings;
  const context = vm.createContext({
    window,
    env: {
      VITE_SUPABASE_URL: "https://qa.supabase.co",
      VITE_SUPABASE_PUBLISHABLE_KEY: "publishable-test",
      VITE_QA_ANONYMOUS: String(qa),
    },
    crypto: { randomUUID: () => Math.random().toString(36).slice(2) },
    createClient: (url, key, options) => {
      settings = options;
      return {
        rpc: async () => ({ error }),
        from: () => ({
          select() {
            return this;
          },
          order() {
            return this;
          },
          async range() {
            return { data: [], error };
          },
        }),
      };
    },
  });
  vm.runInContext(source, context);
  return {
    settings,
    api: vm.runInContext("({loadWorkspace,rpc,configured})", context),
  };
}
test("QA Auth identities use separate broadcast channels and survive per-tab refresh", () => {
  const a = { name: "", sessionStorage: {} },
    b = { name: "", sessionStorage: {} };
  const aa = load(a),
    bb = load(b);
  assert.notEqual(aa.settings.auth.storageKey, bb.settings.auth.storageKey);
  assert.equal(load(a).settings.auth.storageKey, aa.settings.auth.storageKey);
  assert.equal(load(b).settings.auth.storageKey, bb.settings.auth.storageKey);
  assert.equal(
    load({ name: "", sessionStorage: {} }, false).settings.auth.storageKey,
    undefined,
  );
});
test("Persistence failures reject instead of returning an empty workspace or success", async () => {
  const failure = { message: "Database unavailable" };
  const { api } = load({ name: "", sessionStorage: {} }, false, failure);
  await assert.rejects(api.loadWorkspace(), (e) => e === failure);
  await assert.rejects(api.rpc("add_lead", {}), (e) => e === failure);
});
