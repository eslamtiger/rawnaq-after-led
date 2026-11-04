"""Live authorization checks; no privileged credentials."""
import json,urllib.request,urllib.error,pathlib,datetime,uuid
url='https://uucdnakounzqeqwkzfel.supabase.co';key=pathlib.Path('/tmp/rawnaq-public-key').read_text().strip();a=json.loads(pathlib.Path('/tmp/rawnaq-qa-session-a.json').read_text())
def call(path,token=None,body=None,method=None):
 h={'apikey':key,'Content-Type':'application/json'}
 if token:h['Authorization']='Bearer '+token
 try:
  with urllib.request.urlopen(urllib.request.Request(url+path,headers=h,data=json.dumps(body).encode() if body is not None else None,method=method),timeout=40) as f:return f.status,json.loads(f.read() or 'null')
 except urllib.error.HTTPError as e:return e.code,json.loads(e.read())
code,s=call('/auth/v1/signup',body={});assert code==200 and s['user']['is_anonymous']
for table in ['leads','activities','appointments','profiles','configuration','qa_reviews']:
 code,rows=call('/rest/v1/'+table+'?select=*',s['access_token']);assert code==200 and rows==[];print('PASS unprovisioned anonymous identity cannot read '+table,flush=True)
code,error=call('/rest/v1/rpc/add_lead',s['access_token'],{'p':{'name':'QA prohibited','owner_id':s['user']['id'],'contact':'@qa_forbidden','received_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'source_id':'src_meta','service_id':'service_4plus'}});assert code==400 and 'غير مصرح' in error['message'];print('PASS unprovisioned anonymous identity cannot write',flush=True)
code,error=call('/rest/v1/leads',a['access_token'],{'name':'QA forbidden direct write'},'POST');assert code in (401,403) and 'permission denied' in error['message'];print('PASS provisioned identity cannot bypass RPC validation with direct write',flush=True)
code,error=call('/rest/v1/leads?select=*');assert code in (401,403);print('PASS unauthenticated access denied',flush=True)
pathlib.Path('docs/v02-access-test-results.json').write_text(json.dumps({'passed':9,'failed':0,'test':'actual Supabase HTTPS with enrolled and unprovisioned anonymous users; no service key'},indent=2))
