import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
test("V0.2 migration, shared team, complete lifecycle, notes and rejected operations", async () => {
  const pg = new PGlite();
  await pg.exec(
    `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,is_anonymous boolean default false);create function auth.uid()returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;`,
  );
  await pg.exec(
    (
      await readFile("supabase/migrations/202611040001_initial.sql", "utf8")
    ).replace("create extension if not exists pgcrypto;", ""),
  );
  for (const file of (await readdir("supabase/migrations"))
    .sort()
    .filter((f) => f.endsWith(".sql") && !f.endsWith("_initial.sql")))
    await pg.exec(await readFile("supabase/migrations/" + file, "utf8"));
  await pg.exec(await readFile("supabase/seed.sql", "utf8"));
  const a = "00000000-0000-4000-a000-000000000001",
    b = "00000000-0000-4000-a000-000000000002",
    outsider = "00000000-0000-4000-a000-000000000003";
  await pg.query(
    `insert into auth.users(id,is_anonymous) values($1,true),($2,true),($3,true)`,
    [a, b, outsider],
  );
  await pg.query(
    `insert into profiles(id,display_name,role,qa_expires_at) values($1,'QA A','rep',now()+interval '1 day'),($2,'QA B','rep',now()+interval '1 day')`,
    [a, b],
  );
  const actor = async (id) => {
    await pg.exec("reset role");
    await pg.query(`select set_config('request.jwt.claim.sub',$1,false)`, [id]);
    await pg.exec("set role authenticated");
  };
  const rpc = async (name, args) => {
    const vals = Object.values(args).map((v) =>
      v && typeof v === "object" ? JSON.stringify(v) : v,
    );
    return (
      await pg.query(
        `select public.${name}(${Object.keys(args)
          .map((k, i) => `${k}=>$${i + 1}`)
          .join(",")}) result`,
        vals,
      )
    ).rows[0].result;
  };
  const get = async (id) =>
    (await pg.query("select * from leads where id=$1", [id])).rows[0];
  await actor(a);
  const add = async (n) =>
    rpc("add_lead", {
      p: {
        name: "QA " + n,
        contact: "@qa_" + n,
        owner_id: a,
        source_id: "src_meta",
        service_id: "service_4plus",
        received_at: new Date(Date.now() - 60000).toISOString(),
        next_at: new Date().toISOString(),
      },
    });
  const contact = async (id, no = false) =>
    rpc("record_contact", {
      lid: id,
      expected: (await get(id)).revision,
      p: {
        contact_at: new Date().toISOString(),
        first_reply: !no,
        outcome: no ? "no_answer" : "interested",
        body: "QA contact",
        next_action: "discovery",
        next_at: new Date().toISOString(),
      },
    });
  const update = async (id, stage, extra = {}) =>
    rpc("update_lead", {
      lid: id,
      expected: (await get(id)).revision,
      p: {
        owner_id: a,
        stage,
        qualification: "qualified",
        grade: "warm",
        need: "QA assessed",
        next_action: "follow_up",
        next_at: new Date().toISOString(),
        ...extra,
      },
    });
  const book = async (id) =>
    rpc("book_appointment", {
      lid: id,
      expected: (await get(id)).revision,
      p: {
        starts_at: new Date(Date.now() + 20).toISOString(),
        note: "Original booking",
      },
    });
  const result = async (id, aid, status, note = "") => {
    await new Promise((r) => setTimeout(r, 30));
    return rpc("set_appointment", {
      aid,
      expected: (await get(id)).revision,
      p: { status, note, next_at: new Date().toISOString() },
    });
  };
  const ids = [];
  for (const flow of ["A", "B", "C", "D", "E"]) {
    const id = await add(flow);
    ids.push(id);
    assert.equal((await get(id)).grade, null);
    assert.equal((await get(id)).qualification, "unknown");
    await contact(id);
    assert.equal((await get(id)).stage, "active");
    if (flow === "E") await contact(id, true);
    if (["B", "C", "E"].includes(flow)) await update(id, "follow_up");
    else await update(id, "active");
    if (["C", "E"].includes(flow)) {
      await assert.rejects(update(id, "lost"), /غير صالح/);
      await update(id, "lost", {
        lost_reason_id: "lost_noanswer",
        next_action: null,
        next_at: null,
      });
      continue;
    }
    const before = (await get(id)).stage;
    await rpc("offer_booking", { lid: id, expected: (await get(id)).revision });
    assert.equal((await get(id)).stage, before);
    const aid = await book(id);
    if (flow === "D") {
      await result(id, aid, "no_show", "No show note");
      assert.equal((await get(id)).stage, "no_show");
      const newAid = await book(id);
      await result(id, newAid, "attended", "Attendance note");
      const apps = (
        await pg.query(
          "select * from appointments where lead_id=$1 order by created_at",
          [id],
        )
      ).rows;
      assert.equal(apps.length, 2);
      assert.equal(apps[0].note, "Original booking");
      assert.equal(apps[0].no_show_note, "No show note");
      assert.equal(apps[1].previous_appointment_id, aid);
    } else await result(id, aid, "attended");
    assert.equal((await get(id)).stage, "attended");
  }
  await actor(b);
  assert.equal((await pg.query("select * from leads")).rows.length, 5);
  assert.ok(
    (await pg.query("select * from activities")).rows.some(
      (r) => r.details.field === "qualification",
    ),
  );
  assert.equal((await pg.query("select * from appointments")).rows.length, 4);
  await rpc("correct_lead", {
    lid: ids[0],
    expected: (await get(ids[0])).revision,
    p: {
      name: "Corrected",
      contact: "@qa_A",
      source_id: "src_meta",
      service_id: "service_4plus",
      campaign: "QA reference",
    },
  });
  await assert.rejects(
    rpc("correct_lead", { lid: ids[0], expected: null, p: {} }),
    /revision_conflict/,
  );
  await assert.rejects(
    rpc("correct_lead", { lid: ids[0], expected: 1, p: {} }),
    /revision_conflict/,
  );
  await actor(a);
  assert.equal((await get(ids[0])).name, "Corrected");
  await assert.rejects(add("A"), /unique|duplicate/);
  await assert.rejects(
    pg.query("update leads set name=$1 where id=$2", ["Bypass", ids[0]]),
    /permission denied/,
  );
  await actor(outsider);
  assert.equal((await pg.query("select * from leads")).rows.length, 0);
  await assert.rejects(add("OUT"), /مصرح/);
  await pg.exec("reset role");
  await pg.query(
    "update profiles set qa_expires_at=now()-interval '1 second' where id=$1",
    [a],
  );
  await actor(a);
  assert.equal((await pg.query("select * from leads")).rows.length, 0);
  await assert.rejects(add("EXPIRED"), /مصرح/);
  await actor(outsider);
  await assert.rejects(rpc("join_qa_workspace", {}), /انتهت فترة/);
  await pg.exec("reset role");
  await pg.exec(
    `insert into configuration(id,category,label,meta)values('setting_qa_open_access','setting','QA',jsonb_build_object('qa_only',true,'enabled_until',now()+interval '1 hour'));`,
  );
  await actor(outsider);
  await rpc("join_qa_workspace", {});
  const joined = (
    await pg.query("select * from profiles where id=$1", [outsider])
  ).rows[0];
  assert.equal(joined.role, "rep");
  assert.ok(joined.qa_expires_at);
  assert.equal((await pg.query("select * from leads")).rows.length, 5);
  await assert.rejects(
    rpc("manage_member", {
      uid: outsider,
      p: { role: "admin", display_name: "QA" },
    }),
    /متاح.*فقط/,
  );
  await pg.exec("reset role");
  await pg.exec(
    `update configuration set meta=jsonb_build_object('qa_only',true,'enabled_until',now()-interval '1 second') where id='setting_qa_open_access';`,
  );
  await actor(outsider);
  await assert.rejects(rpc("join_qa_workspace", {}), /انتهت فترة/);
  await pg.exec("set role anon");
  await assert.rejects(rpc("join_qa_workspace", {}), /permission denied/);
  await pg.close();
});
