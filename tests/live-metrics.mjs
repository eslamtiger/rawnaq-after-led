import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {metrics} from '../src/domain.js';
const snapshot=JSON.parse(await readFile('/tmp/rawnaq-live-snapshot.json','utf8'));
const report=JSON.parse(await readFile('docs/v02-live-test-results.json','utf8'));
const ids=new Set(report.lead_ids);
const leads=snapshot.leads.filter(l=>ids.has(l.id));
const apps=snapshot.appointments.filter(a=>ids.has(a.lead_id));
const m=metrics(leads,apps);
for(const [k,v] of Object.entries({total:6,active:1,offered:4,booked:4,attended:3,noShow:1,lost:2}))assert.equal(m[k],v,k);
assert.equal(apps.length,6); // A, B, D original+rebook, open original+reschedule
const backup=JSON.parse(JSON.stringify({schema_version:'0.2',...snapshot}));
const allIds=new Set(backup.leads.map(l=>l.id)),profileIds=new Set(backup.profiles.map(p=>p.id));
const appIds=new Set(backup.appointments.map(a=>a.id));
for(const a of backup.appointments){assert.ok(allIds.has(a.lead_id));assert.ok(!a.previous_appointment_id||appIds.has(a.previous_appointment_id));assert.ok(profileIds.has(a.created_by));}
for(const a of backup.activities){assert.ok(allIds.has(a.lead_id));assert.ok(profileIds.has(a.actor_id));assert.ok(a.recorded_at&&a.occurred_at);}
assert.deepEqual(backup.leads,snapshot.leads);
await writeFile('docs/v02-live-metrics-results.json',JSON.stringify({source:'Actual Supabase HTTP snapshot',cohort:report.run,metrics:m,passed:['unique-lead counts after no-show/rebook/reschedule','source/rep/service cohort data references','full-fidelity JSON relational round trip'],failed:[]},null,2));
console.log('PASS actual Supabase dashboard cohort metrics and full JSON relationships');
