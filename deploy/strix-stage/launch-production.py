import subprocess,json,hashlib
from pathlib import Path
base=Path(__file__).parent
host='root@100.108.186.69'
def ssh(cmd):return subprocess.check_output(['ssh',host,cmd],text=True)
# Capture full unrelated profiles privately; public evidence only uses hashes.
private='/mnt/fastssd/AppData/creator-studio-stage/production-before'
ssh(f'umask 077; mkdir -p {private}; docker inspect $(docker ps -aq) > {private}/containers.json; cp -a /boot/config/plugins/dockerMan/templates-user {private}/; cp /var/lib/docker/unraid-autostart {private}/autostart; tailscale serve status --json > {private}/serve.json')
serve=json.loads(ssh('tailscale serve status --json'));(base/'production-serve-before.json').write_text(json.dumps(serve,indent=2))
assert '9443' not in serve.get('TCP',{})
assert not ssh("ss -lnt | egrep ':(4180|9443) ' || true").strip()
image=ssh('docker image inspect creator-studio:production-reviewed --format "{{.Id}}"').strip()
assert image=='sha256:78b91928ce6ffd265698feff7c36196b2053e004a79f4c9e50433f3c90c83b28'
xml=(base/'my-creator-studio.xml').read_text().replace('creator-studio:review-stage',image)
(base/'my-creator-studio-production.xml').write_text(xml)
subprocess.run(['scp',str(base/'my-creator-studio-production.xml'),host+':/boot/config/plugins/dockerMan/templates-user/my-creator-studio.xml'],check=True)
php=(base/'native-dry-run.php').read_text().replace('/mnt/fastssd/AppData/creator-studio-stage/my-creator-studio.xml','/boot/config/plugins/dockerMan/templates-user/my-creator-studio.xml')
(base/'native-production.php').write_text(php)
subprocess.run(['scp',str(base/'native-production.php'),host+':/mnt/fastssd/AppData/creator-studio-stage/native-production.php'],check=True)
command=json.loads(ssh('php /mnt/fastssd/AppData/creator-studio-stage/native-production.php'))
assert "--net='host'" in command[0] and 'net.unraid.docker.managed=dockerman' in command[0] and image in command[0]
(base/'production-native-command.json').write_text(json.dumps(command,indent=2))
print(ssh(command[0]))
print(ssh("docker start creator-studio; printf 'creator-studio 0\\n' >> /var/lib/docker/unraid-autostart"))
print(ssh('tailscale serve --bg --https=9443 http://127.0.0.1:4180'))
after=json.loads(ssh('tailscale serve status --json'))
for k,v in serve.items():
 for sk,sv in v.items():assert after[k][sk]==sv
assert after['Web']['strix.tail4532cc.ts.net:9443']['Handlers']['/']['Proxy']=='http://127.0.0.1:4180'
(base/'production-serve-after.json').write_text(json.dumps(after,indent=2))
print('Native launch and additive Serve verified')
