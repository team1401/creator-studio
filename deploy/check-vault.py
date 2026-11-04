"""Read-only shared-vault readiness; never prints credentials."""
import ast,pathlib,sqlite3,re,subprocess,json,shlex
source=pathlib.Path('agent-zero-pilot/vault-provision.py').read_text()
tree=ast.parse(source)
remote=next(ast.literal_eval(n.value) for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='remote' for t in n.targets))
remote=remote.split("for item in p.get('items',[]):")[0]
remote+='''
for typ in ['organizations','collections']:
 r=run(['/opt/homebrew/bin/bw','list',typ],e)
 assert r.returncode==0
 items=json.loads(r.stdout)
 print(json.dumps({'kind':typ,'items':[{'id':v['id'],'name':v['name'],'organizationId':v.get('organizationId')} for v in items if v['name'] in ['Airstream AI','Helix']]}))
'''
c=sqlite3.connect('/home/helix/.hermes-minimal/state.db')
t=c.execute("select content from messages where id=104372 and session_id='20260921_065527_ebd12a' and role='user'").fetchone()[0]
m=re.fullmatch(r'The password for that is (\S+)\s*',t,re.I);assert m
r=subprocess.run(['ssh','-o','BatchMode=yes','helix@<mac-host>','/opt/homebrew/bin/python3 -c '+shlex.quote(remote)],input=json.dumps({'keychain_password':m[1]}),capture_output=True,text=True,timeout=120)
assert r.returncode==0, 'Vault readiness failed (secret output suppressed)'
pathlib.Path('creator-studio/deploy/strix-stage/vault-readiness.jsonl').write_text(r.stdout)
print(r.stdout)
