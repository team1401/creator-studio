import json,subprocess,hashlib,socket
from pathlib import Path
b=Path(__file__).parent
def ssh(c):return subprocess.check_output(['ssh','root@100.108.186.69',c],text=True)
before=json.loads(ssh('cat /mnt/fastssd/AppData/creator-studio-stage/production-before/containers.json'))
after=json.loads(ssh('docker inspect $(docker ps -aq)'))
old={v['Name']:v for v in before};new={v['Name']:v for v in after}
for name,v in old.items():
 n=new[name]
 for k in ['Id','Config','HostConfig']:
  assert n[k]==v[k],(name,k)
 assert n['State']['StartedAt']==v['State']['StartedAt'] and n['State']['Status']==v['State']['Status'],name
 assert sorted(n['Mounts'],key=lambda x:x['Destination'])==sorted(v['Mounts'],key=lambda x:x['Destination']),name
assert set(new)-set(old)=={'/creator-studio'}
assert ssh('diff -qr /mnt/fastssd/AppData/creator-studio-stage/production-before/templates-user /boot/config/plugins/dockerMan/templates-user || true').strip()=='Only in /boot/config/plugins/dockerMan/templates-user: my-creator-studio.xml'
oldauto=ssh('cat /mnt/fastssd/AppData/creator-studio-stage/production-before/autostart')
newauto=ssh('cat /var/lib/docker/unraid-autostart');assert newauto==oldauto+'creator-studio 0\n'
serve=json.loads(ssh('tailscale serve status --json'));before_serve=json.loads((b/'production-serve-before.json').read_text())
for k,v in before_serve.items():
 for sk,sv in v.items():assert serve[k][sk]==sv
assert not serve.get('AllowFunnel')
source=json.loads((b/'production-source-manifest.json').read_text())
for f in ['server.mjs','public/app.js']:
 h=ssh('docker exec creator-studio sha256sum /app/'+f).split()[0];assert h==source[f]
try:
 socket.create_connection(('100.108.186.69',4180),timeout=3).close();raise AssertionError('backend exposed')
except (ConnectionRefusedError,TimeoutError):pass
container=new['/creator-studio'];assert container['Config']['Labels']['net.unraid.docker.managed']=='dockerman'
cache=json.loads(ssh('cat /usr/local/emhttp/state/plugins/dynamix.docker.manager/docker.json'))
# Validate native cache discovery without dumping unrelated metadata.
assert 'creator-studio' in json.dumps(cache)
result={'url':'https://strix.tail4532cc.ts.net:9443','image':container['Image'],'container_id':container['Id'],'native_managed':True,'native_cache_discovered':True,'autostart':True,'unrelated_containers_unchanged':len(old),'unrelated_templates_unchanged':True,'existing_serve_8443_unchanged':True,'funnel':False,'backend_remote_denied':True,'runtime_source_hashes_match':True,'source_manifest_sha256':hashlib.sha256((b/'production-source-manifest.json').read_bytes()).hexdigest(),'state':container['State']['Status']}
(b/'production-inventory.json').write_text(json.dumps(result,indent=2));print(json.dumps(result,indent=2))
