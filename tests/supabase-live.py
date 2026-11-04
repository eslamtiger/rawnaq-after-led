"""Actual Supabase acceptance. Requires two separately authenticated session JSON files.
No service key, localStorage or adapter. Writes clearly labelled synthetic QA records.
Run: python tests/supabase-live.py (key and session paths can be overridden via env).
"""
import os,json,time,uuid,urllib.request,urllib.error,datetime,pathlib,concurrent.futures
URL=os.getenv('RAWNAQ_SUPABASE_URL','https://uucdnakounzqeqwkzfel.supabase.co')
KEY=pathlib.Path(os.getenv('RAWNAQ_KEY_FILE','/tmp/rawnaq-public-key')).read_text().strip()
paths=[pathlib.Path(os.getenv('RAWNAQ_SESSION_'+x,'/tmp/rawnaq-qa-session-'+x.lower()+'.json')) for x in ['A','B']]
sessions=[json.loads(p.read_text()) for p in paths]
run=uuid.uuid4().hex[:8]; results=[]; ids=[]
def now(delta=0):return (datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(seconds=delta)).isoformat()
def req(path,body=None,session=0,method=None,token=True):
 headers={'apikey':KEY,'Content-Type':'application/json'}
 if token:headers['Authorization']='Bearer '+sessions[session]['access_token']
 r=urllib.request.Request(URL+path,data=json.dumps(body).encode() if body is not None else None,headers=headers,method=method)
 try:
  with urllib.request.urlopen(r,timeout=40) as f:return json.loads(f.read() or 'null')
 except urllib.error.HTTPError as e:
  error=json.loads(e.read());raise RuntimeError(str(e.code)+' '+error.get('message',error.get('msg',error.get('error_description','HTTP error'))))
def passed(name):results.append(name);print('PASS '+name,flush=True)
for i,p in enumerate(paths):
 s=req('/auth/v1/token?grant_type=refresh_token',{'refresh_token':sessions[i]['refresh_token']},session=i,token=False)
 assert s['user']['is_anonymous'];sessions[i]=s;p.write_text(json.dumps(s));p.chmod(0o600)
assert sessions[0]['user']['id']!=sessions[1]['user']['id'];passed('two independent anonymous identities')
def rows(table,i=0):return req('/rest/v1/'+table+'?select=*&order=id',session=i)
def lead(lid,i=0):return next(x for x in rows('leads',i) if x['id']==lid)
def rpc(name,args,i=0):return req('/rest/v1/rpc/'+name,args,session=i)
def reject(name,args,label,i=0):
 try:rpc(name,args,i)
 except RuntimeError as e:
  assert str(e).startswith(('400 ','409 ')), 'Unexpected failure instead of validation: '+str(e)
  passed(label);return
 raise AssertionError('Accepted invalid operation: '+label)
def update(lid,stage,extra=None):
 l=lead(lid);p={k:l[k] for k in ['owner_id','grade','qualification','need','objection_id','note']};p.update(stage=stage,next_action='follow_up',next_at=now(3600));p.update(extra or {});rpc('update_lead',{'lid':lid,'expected':l['revision'],'p':p})
def contact(lid,no=False):
 rpc('record_contact',{'lid':lid,'expected':lead(lid)['revision'],'p':{'contact_at':now(),'first_reply':not no,'outcome':'no_answer' if no else 'interested','body':'QA synthetic contact '+run,'next_action':'discovery','next_at':now(3600)}})
def offer(lid):rpc('offer_booking',{'lid':lid,'expected':lead(lid)['revision']})
def book(lid):return rpc('book_appointment',{'lid':lid,'expected':lead(lid)['revision'],'p':{'starts_at':now(60),'note':'QA Original booking '+run}})
def result(lid,aid,st,note=''):
 l=lead(lid)
 app=next(a for a in rows('appointments') if a['id']==aid)
 remaining=(datetime.datetime.fromisoformat(app['starts_at'])-datetime.datetime.now(datetime.timezone.utc)).total_seconds()
 if remaining>0:time.sleep(min(remaining+0.2,59))
 rpc('set_appointment',{'aid':aid,'expected':l['revision'],'p':{'status':st,'note':note,'next_at':now(3600)}})
def run_flow(flow):
 lid=rpc('add_lead',{'p':{'name':'QA V02 '+flow+' '+run,'contact':'@qa_'+run+'_'+flow.lower(),'owner_id':sessions[0]['user']['id'],'source_id':'src_meta','service_id':'service_4plus','received_at':now(-3600),'next_at':now(3600)}});ids.append(lid)
 l=lead(lid);assert l['stage']=='new' and l['qualification']=='unknown' and l['grade'] is None
 contact(lid);assert lead(lid)['stage']=='active'
 if flow=='E':contact(lid,True)
 stage='follow_up' if flow in 'BCE' else 'active'
 update(lid,stage,{'qualification':'qualified','grade':'warm','need':'QA assessed synthetic need'})
 if flow in 'CE':
  reject('update_lead',{'lid':lid,'expected':lead(lid)['revision'],'p':{'stage':'lost','qualification':'qualified','owner_id':sessions[0]['user']['id'],'need':'QA'}},'Flow '+flow+' rejects missing lost reason')
  update(lid,'lost',{'lost_reason_id':'lost_noanswer','next_action':None,'next_at':None});assert lead(lid)['stage']=='lost'
 else:
  offer(lid);assert lead(lid)['stage']==stage
  aid=book(lid);assert lead(lid)['stage']=='booked'
  if flow=='D':
   result(lid,aid,'no_show','QA No-show note');assert lead(lid)['stage']=='no_show'
   newaid=book(lid);assert lead(lid)['stage']=='booked'
   result(lid,newaid,'attended','QA Attendance note')
   apps=[x for x in rows('appointments') if x['lead_id']==lid];assert len(apps)==2
   old=next(x for x in apps if x['id']==aid);new=next(x for x in apps if x['id']==newaid)
   assert old['status']=='no_show' and old['no_show_note']=='QA No-show note' and old['note']=='QA Original booking '+run
   assert new['previous_appointment_id']==aid and new['attendance_note']=='QA Attendance note'
  else:
   # A blank confirmation must never erase original booking notes.
   rpc('set_appointment',{'aid':aid,'expected':lead(lid)['revision'],'p':{'status':'confirmed','note':''}})
   result(lid,aid,'attended')
   assert next(x for x in rows('appointments') if x['id']==aid)['note']=='QA Original booking '+run
  assert lead(lid)['stage']=='attended'
 passed('Supabase Flow '+flow)
with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
 list(pool.map(run_flow,'ABCDE'))
# Fresh network reads from independent sessions; compare whole relational workspace.
ids.sort(key=lambda id:lead(id)['contact'])
for table in ['leads','activities','appointments']:
 a=rows(table,0);b=rows(table,1);assert a==b;assert a;passed('Session A/B identical persisted '+table)
l=lead(ids[0],1)
rpc('correct_lead',{'lid':ids[0],'expected':l['revision'],'p':{'name':'QA corrected '+run,'contact':l['contact'],'source_id':l['source_id'],'service_id':l['service_id'],'campaign':'QA correction '+run}},1)
assert lead(ids[0],0)['campaign']=='QA correction '+run;passed('Session B update visible in refreshed Session A')
l=lead(ids[0]);reject('correct_lead',{'lid':l['id'],'expected':None,'p':{}},'missing revision rejected');reject('correct_lead',{'lid':l['id'],'expected':1,'p':{}},'stale revision rejected')
reject('correct_lead',{'lid':l['id'],'expected':l['revision'],'p':{'name':l['name'],'contact':lead(ids[1])['contact'],'source_id':l['source_id'],'service_id':l['service_id']}},'duplicate corrected contact rejected')
base={'name':'QA invalid','contact':'@qa_invalid_'+run,'owner_id':sessions[0]['user']['id'],'source_id':'src_meta','service_id':'service_4plus','received_at':'2027-02-30T12:00:00Z','next_at':now(3600)}
reject('add_lead',{'p':base},'impossible calendar date rejected by PostgreSQL')
reject('add_lead',{'p':{**base,'received_at':now(86400)}},'future received date rejected')
# Additional open lead tests exercise follow-ups and rescheduling.
lid=rpc('add_lead',{'p':{**base,'name':'QA open '+run,'contact':'@qa_open_'+run,'received_at':now(-3600),'next_at':now(-30)}});ids.append(lid)
reject('record_contact',{'lid':lid,'expected':1,'p':{'contact_at':now(),'first_reply':True,'outcome':'interested','body':'QA','next_action':'first_reply','next_at':now(3600)}},'completed first response cannot remain outstanding')
reject('record_contact',{'lid':lid,'expected':1,'p':{'contact_at':now(-7200),'first_reply':True,'outcome':'interested','body':'QA','next_action':'discovery','next_at':now(3600)}},'contact before inquiry rejected')
contact(lid)
reject('update_lead',{'lid':lid,'expected':lead(lid)['revision'],'p':{'stage':'follow_up','owner_id':sessions[0]['user']['id'],'qualification':'unknown','next_action':'follow_up'}},'follow-up missing date rejected')
reject('update_lead',{'lid':lid,'expected':lead(lid)['revision'],'p':{'stage':'booked','owner_id':sessions[0]['user']['id'],'qualification':'unknown','next_at':now(3600),'next_action':'confirm'}},'BOOKED without appointment rejected')
update(lid,'follow_up',{'qualification':'qualified','need':'QA reschedule','next_at':now(-30)});offer(lid)
reject('book_appointment',{'lid':lid,'expected':lead(lid)['revision'],'p':{'starts_at':now(-60)}},'past appointment rejected')
aid=rpc('book_appointment',{'lid':lid,'expected':lead(lid)['revision'],'p':{'starts_at':now(86400),'note':'QA preserved original'}})
newaid=rpc('reschedule_appointment',{'aid':aid,'expected':lead(lid)['revision'],'p':{'starts_at':now(172800),'note':'QA reschedule reason'}})
apps=[a for a in rows('appointments') if a['lead_id']==lid];old=next(a for a in apps if a['id']==aid);new=next(a for a in apps if a['id']==newaid)
assert old['status']=='rescheduled' and old['note']=='QA preserved original' and old['reschedule_note']=='QA reschedule reason' and new['note']=='QA preserved original' and new['previous_appointment_id']==aid;passed('reschedule preserves original and linked history')
acts=[a for a in rows('activities') if a['lead_id'] in ids];assert any(a['details'].get('field')=='qualification' and a['details'].get('old')=='unknown' for a in acts);assert any(a['kind']=='booking_offered' for a in acts);assert any(a['kind']=='rebooked' for a in acts);passed('structured activities and milestones')
for table in ['leads','activities','appointments']:assert rows(table,0)==rows(table,1)
passed('final two-session relational persistence including next actions')
report={'run':run,'lead_ids':ids,'passed':results,'failed':[],'mode':'actual Supabase HTTPS / two independent anonymous tokens','timestamp':now()}
pathlib.Path('/tmp/rawnaq-live-cohort.json').write_text(json.dumps({'leads':[l for l in rows('leads') if l['id'] in ids],'appointments':[a for a in rows('appointments') if a['lead_id'] in ids]}))
pathlib.Path('docs/v02-live-test-results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print('LIVE_ACCEPTANCE_PASSED',flush=True)
