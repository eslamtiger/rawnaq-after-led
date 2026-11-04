import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const ADMIN = "00000000-0000-4000-a000-000000000001",
  REP = "00000000-0000-4000-a000-000000000002",
  OTHER = "00000000-0000-4000-a000-000000000003",
  OUTSIDER = "00000000-0000-4000-a000-000000000004";
test("PostgreSQL core workflow, RLS, validation, concurrency and audit", async (t) => {
  const pg = new PGlite();
  await pg.exec(
    `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid()returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to authenticated,anon;grant execute on function auth.uid()to authenticated,anon;`,
  );
  let migration = await readFile(
    new URL("../supabase/migrations/202611040001_initial.sql", import.meta.url),
    "utf8",
  );
  await pg.exec(
    migration.replace("create extension if not exists pgcrypto;", ""),
  );
  await pg.exec(
    await readFile(new URL("../supabase/seed.sql", import.meta.url), "utf8"),
  );
  await pg.query("insert into auth.users(id)values($1),($2),($3),($4)", [
    ADMIN,
    REP,
    OTHER,
    OUTSIDER,
  ]);
  await pg.query(
    `insert into public.profiles(id,display_name,role)values($1,'إدارة اختبار','admin'),($2,'موظفة اختبار','rep'),($3,'موظفة أخرى','rep')`,
    [ADMIN, REP, OTHER],
  );
  const actor = async (id, role = "authenticated") => {
    await pg.exec("reset role");
    await pg.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    await pg.exec("set role " + role);
  };
  const call = async (name, params) => {
    const entries = Object.entries(params);
    const q = await pg.query(
      `select public.${name}(${entries.map(([k], i) => `${k} => $${i + 1}`).join(",")}) as result`,
      entries.map(([, v]) => (typeof v === "object" ? JSON.stringify(v) : v)),
    );
    return q.rows[0].result;
  };
  const lead = async (id) =>
    (await pg.query("select * from public.leads where id=$1", [id])).rows[0];
  await actor(REP);
  const payload = {
    name: "عميلة اختبار فقط",
    contact: "٠١٠ ١٢٣٤ ٥٦٧٨",
    owner_id: REP,
    source_id: "src_meta",
    service_id: "service_4plus",
    received_at: new Date(Date.now() - 3600000).toISOString(),
    next_at: new Date().toISOString(),
  };
  const lid = await call("add_lead", { p: payload });
  await t.test(
    "New lead requires ownership, action, date and no fabricated first reply",
    async () => {
      const l = await lead(lid);
      assert.equal(l.contact, "+201012345678");
      assert.equal(l.stage, "new");
      assert.equal(l.next_action, "first_reply");
      assert.equal(l.first_response_at, null);
      await assert.rejects(
        call("add_lead", { p: { ...payload, contact: "+201012345678" } }),
        /unique|duplicate/,
      );
      await assert.rejects(
        call("add_lead", { p: { ...payload, contact: "bad input" } }),
        /صالح/,
      );
      await assert.rejects(
        call("add_lead", {
          p: { ...payload, contact: "01112345678", owner_id: OTHER },
        }),
        /إسناد/,
      );
    },
  );
  await t.test(
    "Other employees, unapproved users and anonymous cannot read or write",
    async () => {
      await actor(OTHER);
      assert.equal(
        (await pg.query("select * from public.leads")).rows.length,
        0,
      );
      await assert.rejects(
        call("record_contact", { lid, expected: 1, p: {} }),
        /مسموح/,
      );
      await actor(OUTSIDER);
      assert.equal(
        (await pg.query("select * from public.configuration")).rows.length,
        0,
      );
      await assert.rejects(call("add_lead", { p: payload }), /مصرح/);
      await actor("", "anon");
      await assert.rejects(
        pg.query("select * from public.leads"),
        /permission denied/,
      );
      await assert.rejects(
        call("add_lead", { p: payload }),
        /permission denied/,
      );
      await actor(REP);
      await assert.rejects(
        pg.query("update public.leads set stage='attended' where id=$1", [lid]),
        /permission denied/,
      );
      await assert.rejects(
        call("require_lead", { lid, expected: 1 }),
        /permission denied/,
      );
    },
  );
  await t.test(
    "Reply, qualification, offer and conflict protection",
    async () => {
      await call("record_contact", {
        lid,
        expected: 1,
        p: {
          first_reply: true,
          is_follow_up: false,
          contact_at: new Date(Date.now() - 1800000).toISOString(),
          outcome: "interested",
          body: "تواصل اختبار",
          next_action: "discovery",
          next_at: new Date().toISOString(),
        },
      });
      let l = await lead(lid);
      assert.equal(l.stage, "contacted");
      assert.ok(l.first_response_at);
      await assert.rejects(
        call("update_lead", { lid, expected: 1, p: {} }),
        /revision_conflict/,
      );
      await assert.rejects(
        call("book_appointment", {
          lid,
          expected: 2,
          p: { starts_at: new Date(Date.now() + 86400000).toISOString() },
        }),
        /التأهيل/,
      );
      const p = {
        owner_id: REP,
        grade: "hot",
        need: "هدف اختبار",
        next_action: "offer_booking",
        next_at: new Date().toISOString(),
      };
      await call("update_lead", {
        lid,
        expected: 2,
        p: { ...p, stage: "qualified" },
      });
      await call("update_lead", {
        lid,
        expected: 3,
        p: { ...p, stage: "booking_offered" },
      });
      l = await lead(lid);
      assert.ok(l.qualified_at);
      assert.ok(l.booking_offered_at);
    },
  );
  let aid;
  await t.test(
    "Booking confirmation, invalid future attendance and one active appointment",
    async () => {
      aid = await call("book_appointment", {
        lid,
        expected: 4,
        p: { starts_at: new Date(Date.now() + 86400000).toISOString() },
      });
      assert.equal((await lead(lid)).stage, "booked");
      await assert.rejects(
        call("book_appointment", {
          lid,
          expected: 5,
          p: { starts_at: new Date(Date.now() + 172800000).toISOString() },
        }),
        /unique|duplicate/,
      );
      await assert.rejects(
        call("set_appointment", {
          aid,
          expected: 5,
          p: { status: "attended" },
        }),
        /قبل الموعد/,
      );
      await call("set_appointment", {
        aid,
        expected: 5,
        p: { status: "confirmed" },
      });
      assert.equal((await lead(lid)).next_action, "attendance");
    },
  );
  await t.test(
    "No-show recovery, rebooking and attendance preserve history",
    async () => {
      await pg.exec("reset role");
      await pg.query(
        "update public.appointments set starts_at=now()-interval '1 hour' where id=$1",
        [aid],
      );
      await actor(REP);
      await call("set_appointment", {
        aid,
        expected: 6,
        p: { status: "no_show", next_at: new Date().toISOString() },
      });
      let l = await lead(lid);
      assert.equal(l.stage, "follow_up");
      assert.equal(l.next_action, "recovery");
      const first = l.first_booked_at;
      const second = await call("book_appointment", {
        lid,
        expected: 7,
        p: { starts_at: new Date(Date.now() + 86400000).toISOString() },
      });
      await pg.exec("reset role");
      await pg.query(
        "update public.appointments set starts_at=now()-interval '1 hour' where id=$1",
        [second],
      );
      await actor(REP);
      await call("set_appointment", {
        aid: second,
        expected: 8,
        p: { status: "attended" },
      });
      l = await lead(lid);
      assert.equal(l.stage, "attended");
      assert.equal(l.next_at, null);
      assert.equal(l.first_booked_at.getTime(), first.getTime());
      assert.equal(
        (
          await pg.query("select * from public.appointments where lead_id=$1", [
            lid,
          ])
        ).rows.length,
        2,
      );
      assert.ok(
        (
          await pg.query("select * from public.activities where lead_id=$1", [
            lid,
          ])
        ).rows.length >= 8,
      );
    },
  );
  await t.test(
    "Lost requires reason, closed follow-up blocked, reopen restores action",
    async () => {
      await call("reopen_lead", {
        lid,
        expected: 9,
        p: { note: "اهتمام جديد للاختبار", next_at: new Date().toISOString() },
      });
      await assert.rejects(
        call("update_lead", {
          lid,
          expected: 10,
          p: { owner_id: REP, stage: "lost", grade: "cold" },
        }),
        /اختيار/,
      );
      await call("update_lead", {
        lid,
        expected: 10,
        p: {
          owner_id: REP,
          stage: "lost",
          grade: "cold",
          lost_reason_id: "lost_timing",
        },
      });
      assert.equal((await lead(lid)).next_at, null);
      await assert.rejects(
        call("record_contact", { lid, expected: 11, p: {} }),
        /مغلق/,
      );
    },
  );
  await t.test(
    "Admin QA handles non applicable and rejects invalid scores and unauthorized reviewers",
    async () => {
      await assert.rejects(
        call("save_qa", { lid, p: { scores: { response: 5 } } }),
        /للإدارة/,
      );
      await actor(ADMIN);
      await call("save_qa", {
        lid,
        p: {
          scores: { response: 5, greeting: 10, booking: null },
          note: "اختبار",
        },
      });
      assert.equal(
        Number(
          (await pg.query("select score from public.qa_reviews")).rows[0].score,
        ),
        75,
      );
      await assert.rejects(
        call("save_qa", { lid, p: { scores: { response: 11 } } }),
        /النطاق/,
      );
      await assert.rejects(
        call("save_qa", { lid, p: { scores: {} } }),
        /معيار/,
      );
    },
  );
  await pg.close();
});
