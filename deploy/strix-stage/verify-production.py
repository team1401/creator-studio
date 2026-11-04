import subprocess,json,time,base64,tempfile,tarfile,os,hashlib,sqlite3
from pathlib import Path
import requests
B='https://<tailscale-host>:9443';H='root@<agent-zero-host>';base=Path(__file__).parent; evidence={}
def ssh(c):return subprocess.check_output(['ssh',H,c])
pw=Path('/home/helix/.hermes-minimal/cache/scratch/.studio-production-password').read_text()
s=requests.Session();s.headers['Origin']=B
r=s.get(B+'/login');assert r.status_code==200;evidence['trusted_TLS_login']=r.status_code
assert s.get(B+'/api/characters').status_code==401
for host in ['evil.test','127.0.0.1:4180']:
 r=requests.get(B+'/api/session',headers={'Host':host,'X-Forwarded-Host':'<tailscale-host>:9443','Forwarded':'host=<tailscale-host>:9443'},timeout=10);assert r.status_code in [400,403,404,421];evidence['host_'+host]=r.status_code
for origin in ['null','https://evil.test','https://<tailscale-host>:8443','http://<tailscale-host>:9443']:
 r=s.post(B+'/api/login',json={'password':'invalid'},headers={'Origin':origin});assert r.status_code==403
r=s.post(B+'/api/login',json={'password':pw});assert r.status_code==200
cookie=r.headers['Set-Cookie'];assert all(x in cookie for x in ['Secure','HttpOnly','SameSite=Strict']);s.headers['X-CSRF-Token']=r.json()['csrf']
assert s.get(B+'/').status_code==200
assert 'Desktop runtime repaired and native input verified;' in s.get(B+'/app.js').text
assert s.post(B+'/api/characters',json={'name':'TEST ONLY CSRF denial'},headers={'X-CSRF-Token':'bad'}).status_code==403
kinds=['characters','projects','actions','assets','jobs','services'];initial={k:len(s.get(B+'/api/'+k).json()) for k in kinds};assert all(initial[k]==0 for k in kinds if k!='services');evidence['initial_counts']=initial
created=[]
def create(k,obj):
 r=s.post(B+'/api/'+k,json=obj);assert r.status_code==201,(k,r.status_code,r.text);v=r.json();created.append((k,v['id']));return v
def patch(k,id,obj):
 r=s.patch(B+'/api/'+k+'/'+id,json=obj);assert r.status_code==200,r.text;return r.json()
c=create('characters',{'name':'TEST ONLY deployment verification','voice':'TEST ONLY','rules':'No external execution'})
p=create('projects',{'title':'TEST ONLY deployment verification','kind':'video','character_id':c['id'],'brief':'Temporary acceptance record'})
patch('projects',p['id'],{'stage':'script','script':'TEST ONLY draft'})
a=create('actions',{'title':'TEST ONLY editorial review','project_id':p['id'],'why':'Deployment acceptance only','instructions':'Verify notebook','next_step':'Clean own records'})
r=s.post(B+'/api/actions/'+a['id']+'/decision',json={'decision':'approved','note':'TEST ONLY acceptance, not spending authority'});assert r.status_code==200
u=create('assets',{'name':'TEST-ONLY-verification.txt','base64':base64.b64encode(b'TEST ONLY retained backup bytes').decode(),'project_id':p['id']})
v=create('assets',{'name':'TEST-ONLY-version2.txt','base64':base64.b64encode(b'TEST ONLY version two').decode(),'project_id':p['id'],'previous_id':u['id']});assert v['version']==2
j=create('jobs',{'title':'TEST ONLY manual handoff','project_id':p['id'],'instructions':'Verify only','next_step':'Clean own fixtures'})
patch('jobs',j['id'],{'status':'manual_complete','output_notes':'TEST ONLY actual acceptance result'})
x=patch('jobs',j['id'],{'instructions':'TEST ONLY revised manual scope'});assert x['status']=='awaiting_manual' and not x['output_notes']
counts={k:len(s.get(B+'/api/'+k).json()) for k in kinds}
# Consistent cold full appdata backup; only this NEW app is stopped.
ssh('docker stop creator-studio')
private=Path(tempfile.mkdtemp(prefix='studio-production-restore-',dir=os.environ['TMPDIR']));private.chmod(0o700)
archive=private/'appdata.tar';archive.write_bytes(ssh('tar -C /mnt/fastssd/AppData/creator-studio -cf - data secrets'));archive.chmod(0o600)
ssh('docker start creator-studio')
for i in range(30):
 try:
  if s.get(B+'/health').status_code==200:break
 except requests.RequestException:pass
 time.sleep(.5)
assert s.get(B+'/api/session').status_code==200
assert {k:len(s.get(B+'/api/'+k).json()) for k in kinds}==counts
assert s.get(B+'/api/assets/'+u['id']+'/download').content==b'TEST ONLY retained backup bytes'
with tarfile.open(archive) as t:t.extractall(private,filter='data')
for f in private.rglob('*'):
 if f.is_file():f.chmod(0o600)
env=dict(os.environ,STUDIO_DATA=str(private/'data'),STUDIO_PASSWORD_FILE=str(private/'secrets/password'),PORT='0',STUDIO_EXTERNAL_ORIGIN=B)
proc=subprocess.Popen(['node','server.mjs'],env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
try:
 import re
 line=proc.stdout.readline();local=re.search(r'http://127.0.0.1:\d+',line).group(0)
 rs=requests.Session();rs.headers.update({'Host':'<tailscale-host>:9443','Origin':B})
 lr=rs.post(local+'/api/login',json={'password':pw});assert lr.status_code==200
 rs.headers['Cookie']=lr.headers['Set-Cookie'].split(';')[0]
 assert {k:len(rs.get(local+'/api/'+k).json()) for k in kinds}==counts
 assert rs.get(local+'/api/assets/'+u['id']+'/download').content==b'TEST ONLY retained backup bytes'
 assert rs.get(local+'/api/assets/'+v['id']+'/download').content==b'TEST ONLY version two'
 dbs=list((private/'data').glob('*.sqlite*'));db=next(x for x in dbs if not str(x).endswith(('-wal','-shm')))
 con=sqlite3.connect(db);assert con.execute('pragma integrity_check').fetchone()[0]=='ok';con.close()
 evidence['full_backup_isolated_restore']={'passed':True,'counts':counts,'path':str(private),'login':True,'two_upload_versions':True,'integrity':'ok','production_replaced':False}
finally:proc.terminate();proc.wait(timeout=10)
for kind,id in reversed(created):
 r=s.delete(B+'/api/'+kind+'/'+id);assert r.status_code in [200,204],(kind,r.status_code,r.text)
assert {k:len(s.get(B+'/api/'+k).json()) for k in kinds}==initial
assert any('TEST ONLY' in json.dumps(x) for x in s.get(B+'/api/audit').json())
evidence.update({'CRUD_versions_approval_handoff_reopen':True,'restart_session_records_files_persist':True,'temporary_records_removed_audit_preserved':True,'secure_cookie':True,'authenticated_HTML_and_JS':True,'postdeploy_authenticated_browser':False})
assert s.post(B+'/api/logout',json={}).status_code==200
assert s.get(B+'/api/session').status_code==401
(base/'production-acceptance.json').write_text(json.dumps(evidence,indent=2));print(json.dumps(evidence,indent=2))
