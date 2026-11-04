import json,pathlib,urllib.request,concurrent.futures
key=pathlib.Path('/tmp/rawnaq-public-key').read_text().strip();s=json.loads(pathlib.Path('/tmp/rawnaq-qa-session-a.json').read_text())
def read(table):
 r=urllib.request.Request('https://uucdnakounzqeqwkzfel.supabase.co/rest/v1/'+table+'?select=*&order=id',headers={'apikey':key,'Authorization':'Bearer '+s['access_token']})
 with urllib.request.urlopen(r,timeout=40) as f:return table,json.load(f)
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:data=dict(pool.map(read,['leads','appointments','activities','profiles','configuration','qa_reviews']))
pathlib.Path('/tmp/rawnaq-live-snapshot.json').write_text(json.dumps(data))
print('Actual Supabase snapshot saved; no credentials included')
