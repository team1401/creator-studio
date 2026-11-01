import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import http from 'node:http';
import https from 'node:https';

async function fixture(externalOrigin = '') {
  const dir = mkdtempSync(join(process.env.TMPDIR || process.cwd(), 'studio-review-'));
  let password = randomBytes(32).toString('hex'), child, base;
  const writePassword = () => writeFileSync(join(dir, 'password'), password, {mode:0o600});
  writePassword();
  async function start() {
    child = spawn(process.execPath, ['server.mjs'], {env:{...process.env, STUDIO_DATA:dir, PORT:'0', STUDIO_EXTERNAL_ORIGIN:externalOrigin}, stdio:['ignore','pipe','pipe']});
    base = await new Promise((resolve,reject) => {
      let log = ''; const timer = setTimeout(() => reject(Error('startup timeout')),5000);
      child.stdout.on('data', d => { log += d; const m = log.match(/http:\/\/127.0.0.1:\d+/); if(m){clearTimeout(timer);resolve(m[0]);} });
      child.on('exit', () => {clearTimeout(timer);reject(Error('startup failed'));});
    });
  }
  async function stop(){if(child && child.exitCode === null){const p=once(child,'exit');child.kill('SIGTERM');await p;}}
  await start();
  return {dir, get base(){return base;}, get password(){return password;}, start, stop,
    rotate(){password=randomBytes(32).toString('hex');writePassword();},
    async close(){await stop();rmSync(dir,{recursive:true,force:true});}};
}
async function login(f){const r=await fetch(f.base+'/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password:f.password})}); assert.equal(r.status,200);return {cookie:r.headers.get('set-cookie').split(';')[0], 'x-csrf-token':(await r.json()).csrf};}

test('completed material scope edits reopen and archive evidence; no-op edits preserve completion', async()=>{
 const f=await fixture();try{
 const auth=await login(f);
 async function req(path,method='GET',body){const r=await fetch(f.base+path,{method,headers:{...auth,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});assert.ok(r.ok);return r.json();}
 const j=await req('/api/jobs','POST',{title:'Draft A',instructions:'Read A',next_step:'Review A'});
 const path='/api/jobs/'+j.id;
 const evidence='https://example.test/old-evidence '+ 'x'.repeat(5000);
 await req(path,'PATCH',{status:'manual_complete',output_notes:evidence});
 assert.equal((await req(path,'PATCH',{instructions:'Read A'})).status,'manual_complete');
 for(const edit of [{instructions:'Read B'},{title:'Draft B'},{next_step:'Review B'}]){
  const updated=await req(path,'PATCH',{...edit,status:'manual_complete',output_notes:evidence});
  assert.equal(updated.status,'awaiting_manual');assert.equal(updated.output_notes,'');
  await req(path,'PATCH',{status:'manual_complete',output_notes:evidence});
 }
 const project=await req('/api/projects','POST',{title:'Other project'});
 assert.equal((await req(path,'PATCH',{project_id:project.id})).status,'awaiting_manual');
 const entries=(await req('/api/audit')).filter(x=>x.event==='reopen:jobs');
 assert.equal(entries.length,4);assert.equal(JSON.parse(entries[0].detail).output_notes,evidence);
 }finally{await f.close();}
});

test('real restart preserves normal sessions and password rotation revokes old cookies',async()=>{
 const f=await fixture();try{
 const auth=await login(f);
 const oldPassword=f.password;
 await f.stop();await f.start();
 assert.equal((await fetch(f.base+'/api/session',{headers:auth})).status,200);
 await f.stop();f.rotate();await f.start();
 assert.equal((await fetch(f.base+'/api/session',{headers:auth})).status,401);
 assert.equal((await fetch(f.base+'/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password:oldPassword})})).status,401);
 const fresh=await login(f);assert.equal((await fetch(f.base+'/api/session',{headers:fresh})).status,200);
 }finally{await f.close();}
});

test('explicit HTTPS origin via loopback TLS proxy, exact Host/Origin and Secure cookie',async()=>{
 const origin='https://studio.private.test';const f=await fixture(origin);let proxy;
 try{
 execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',join(f.dir,'key.pem'),'-out',join(f.dir,'cert.pem'),'-days','1','-subj','/CN=studio.private.test','-addext','subjectAltName=DNS:studio.private.test'],{stdio:'ignore'});
 proxy=https.createServer({key:readFileSync(join(f.dir,'key.pem')),cert:readFileSync(join(f.dir,'cert.pem'))},(req,res)=>{
  const upstream=http.request(f.base+req.url,{method:req.method,headers:req.headers},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res);});req.pipe(upstream);
 });proxy.listen(0,'127.0.0.1');await once(proxy,'listening');
 function request(path,headers={},body){return new Promise((resolve,reject)=>{
  const req=https.request({host:'127.0.0.1',port:proxy.address().port,servername:'studio.private.test',ca:readFileSync(join(f.dir,'cert.pem')),path,method:body?'POST':'GET',headers:{host:'studio.private.test',...headers}},r=>{let text='';r.on('data',d=>text+=d);r.on('end',()=>resolve({status:r.statusCode,headers:r.headers,text}));});req.on('error',reject);req.end(body);
 });}
 assert.equal((await request('/health')).status,200);
 assert.equal((await request('/health',{host:'unknown.test'})).status,403);
 for(const bad of ['https://evil.test','null','http://studio.private.test','https://studio.private.test:444'])assert.equal((await request('/health',{origin:bad})).status,403);
 assert.equal((await request('/health',{host:'unknown.test','x-forwarded-host':'studio.private.test','x-forwarded-proto':'https',origin})).status,403);
 assert.equal((await request('/api/session',{origin})).status,401);
 const r=await request('/api/login',{origin,'content-type':'application/json'},JSON.stringify({password:f.password}));assert.equal(r.status,200);
 const cookie=r.headers['set-cookie'][0];assert.match(cookie,/; Secure/);assert.match(cookie,/HttpOnly/);assert.match(cookie,/SameSite=Strict/);
 assert.equal((await request('/api/session',{origin,cookie:cookie.split(';')[0]})).status,200);
 assert.equal((await fetch(f.base+'/health')).status,403);
 }finally{if(proxy){proxy.closeAllConnections();await new Promise(r=>proxy.close(r));}await f.close();}
});
