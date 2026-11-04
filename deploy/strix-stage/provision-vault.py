import subprocess,json,os,base64,secrets,hashlib
from pathlib import Path
bw='/opt/homebrew/bin/bw'
def run(a,**kw):
 r=subprocess.run(a,capture_output=True,text=True,timeout=90,**kw)
 if r.returncode: raise RuntimeError('private subprocess failed: '+a[0])
 return r.stdout
master=run(['security','find-generic-password','-w','-a','helix','-s','HERMES_BITWARDEN_MASTER_PASSWORD','/Users/helix/Library/Keychains/login.keychain-db']).strip()
env=dict(os.environ,BW_PASSWORD=master)
session=run([bw,'unlock','--passwordenv','BW_PASSWORD','--raw'],env=env,stdin=subprocess.DEVNULL).strip()
env.pop('BW_PASSWORD');env['BW_SESSION']=session
org='d43ffb16-4c21-4114-b2b0-b3f201130854';col='d33556a6-4f13-43dd-aff8-b3f201130871'
assert any(x['id']==org and x['name']=='Airstream AI' for x in json.loads(run([bw,'list','organizations'],env=env,stdin=subprocess.DEVNULL)))
assert any(x['id']==col and x['name']=='Helix' for x in json.loads(run([bw,'list','collections'],env=env,stdin=subprocess.DEVNULL)))
existing=json.loads(run([bw,'list','items','--search','CreatorStudio'],env=env,stdin=subprocess.DEVNULL))
assert len(existing)<=1
password=existing[0]['login']['password'] if existing else secrets.token_urlsafe(48)
item={'type':1,'name':'CreatorStudio','organizationId':org,'collectionIds':[col],'notes':'Private Creator Studio on Strix. Password-only login; no username is required. Native Unraid managed application.','login':{'username':'','password':password,'uris':[{'match':0,'uri':'https://<tailscale-host>:9443'}]}}
saved=existing[0] if existing else json.loads(run([bw,'create','item'],env=env,input=base64.b64encode(json.dumps(item).encode()).decode()))
actual=json.loads(run([bw,'get','item',saved['id']],env=env,stdin=subprocess.DEVNULL))
assert actual['organizationId']==org and col in actual['collectionIds'] and actual['login']['uris']==item['login']['uris']
assert hashlib.sha256(actual['login']['password'].encode()).digest()==hashlib.sha256(password.encode()).digest()
f=Path('/Users/helix/.hermes/.studio-production-password');f.touch(mode=0o600,exist_ok=False);f.write_text(actual['login']['password'])
assert hashlib.sha256(f.read_bytes()).digest()==hashlib.sha256(actual['login']['password'].encode()).digest()
print(json.dumps({'id':actual['id'],'name':actual['name'],'organizationId':org,'collectionIds':[col],'uri':item['login']['uris'][0]['uri'],'password_file_matches_saved_vault':True,'password_only':True}))
