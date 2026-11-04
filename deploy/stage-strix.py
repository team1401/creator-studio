"""Allowlisted build staging only; does not create/start containers or Serve."""
import pathlib, subprocess, tarfile, io, json, hashlib
root=pathlib.Path(__file__).resolve().parents[1]
out=root/'deploy'/'strix-stage'; out.mkdir(exist_ok=True)
remote='/mnt/fastssd/AppData/creator-studio-stage'
ssh=['ssh','-o','BatchMode=yes','root@<agent-zero-host>']
def run(cmd,**kw): return subprocess.run(ssh+[cmd],check=True,capture_output=True,**kw).stdout
files=[root/'Dockerfile',root/'package.json',root/'server.mjs',*sorted((root/'public').rglob('*'))]
files=[p for p in files if p.is_file()]
manifest={str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
(out/'source-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
serve=json.loads(run('tailscale serve status --json'))
(out/'serve-before.json').write_text(json.dumps(serve,indent=2)+'\n')
(out/'containers-before.txt').write_bytes(run('docker inspect $(docker ps -aq) --format "{{.Name}} {{.Id}} {{.State.StartedAt}}"'))
buf=io.BytesIO()
with tarfile.open(fileobj=buf,mode='w') as tf:
 for p in files: tf.add(p,arcname=str(p.relative_to(root)))
run('test ! -e '+remote+' && mkdir -m 700 '+remote+' && mkdir '+remote+'/build && tar -xf - -C '+remote+'/build',input=buf.getvalue())
log=run('cd '+remote+'/build && docker build -t creator-studio:review-stage .',timeout=240)
(out/'build.log').write_bytes(log)
info=json.loads(run('docker image inspect creator-studio:review-stage'))[0]
(out/'image.json').write_text(json.dumps({k:info[k] for k in ['Id','Architecture','Os','Size']},indent=2)+'\n')
print(json.dumps({k:info[k] for k in ['Id','Architecture','Os','Size']}))
