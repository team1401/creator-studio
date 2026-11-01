# Adapted from independent reviewer probe; expected repaired outcomes asserted.
import os, json, secrets, subprocess, tempfile, http.client, hashlib
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parents[1]
results={}
with tempfile.TemporaryDirectory(prefix='review-data-',dir=os.environ['TMPDIR']) as d:
    password=secrets.token_urlsafe(32)
    Path(d,'password').write_text(password); os.chmod(Path(d,'password'),0o600)
    env={**os.environ,'STUDIO_DATA':d,'PORT':'0'}
    server=subprocess.Popen(['node','server.mjs'],cwd=ROOT,env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
    try:
        base=server.stdout.readline().strip().split(' at ')[-1]; port=int(base.rsplit(':',1)[1]); host=f'127.0.0.1:{port}'
        def request(path,method='GET',body=None,headers=None):
            c=http.client.HTTPConnection('127.0.0.1',port,timeout=10)
            c.request(method,path,json.dumps(body) if body is not None else None,headers or {})
            r=c.getresponse(); data=r.read(); out=(r.status,dict(r.getheaders()),data); c.close(); return out
        for h in ['evil.example', '192.168.1.5:4180','localhost:'+str(port)]:
            status,_,_=request('/health',headers={'Host':h}); assert status==403; results['host '+h]=status
        status,headers,data=request('/api/login','POST',{'password':password},{'Origin':'http://'+host,'Content-Type':'application/json'})
        assert status==200
        cookie=headers['set-cookie'].split(';')[0]; csrf=json.loads(data)['csrf']; auth={'Cookie':cookie,'X-CSRF-Token':csrf,'Content-Type':'application/json'}
        results['cookie_flags']={k:k in headers['set-cookie'] for k in ['HttpOnly','SameSite=Strict','Secure']}
        for origin in ['null','https://evil.example','http://127.0.0.1:1','https://'+host]:
            status,_,_=request('/api/characters','POST',{'name':'blocked'},{**auth,'Origin':origin}); assert status==403; results['origin '+origin]=status
        for path in ['/api/session','/api/audit','/app.js','/data/password','/api/assets']:
            status,_,_=request(path); assert status==401; results['anonymous '+path]=status
        status,_,_=request('/api/characters','POST',{'name':'blocked'},{**auth,'X-CSRF-Token':'bad'}); assert status==403
        results['bad_csrf']=status
        # Real mobile DOM: explicit safety language and instructions, no external navigation.
        with sync_playwright() as p:
            browser=p.chromium.launch(headless=True)
            page=browser.new_page(viewport={'width':320,'height':740})
            page.goto(base); page.get_by_label('Studio password').fill(password); page.get_by_role('button',name='Open your studio').click()
            expect(page.get_by_role('button',name='Choose your first character')).to_be_visible()
            expect(page.get_by_text('START WITH ONE CHARACTER',exact=True)).to_be_visible()
            expect(page.get_by_text('No agent is running from this app.',exact=False)).to_be_visible()
            texts={}
            for section in ['Studio overview','Agent handoffs','Services & tools','Needs you']:
                page.get_by_role('link',name=section,exact=False).first.click(); page.wait_for_timeout(100)
                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'),section
                texts[section]=page.locator('#view').inner_text()
            assert 'does not send or run a task' in texts['Agent handoffs']
            assert texts['Services & tools'].count('Not connected')==3
            assert 'not a live check' in texts['Services & tools']
            results['mobile_320_DOM']=texts
            browser.close()
        # Completion must not silently cover revised task instructions.
        status,_,data=request('/api/jobs','POST',{'title':'TEST ONLY completion scope','instructions':'Review draft A'},auth)
        assert status==201
        job=json.loads(data)
        status,_,_=request('/api/jobs/'+job['id'],'PATCH',{'status':'manual_complete','output_notes':'Reviewed draft A'},auth)
        assert status==200
        status,_,data=request('/api/jobs/'+job['id'],'PATCH',{'instructions':'Review different draft B'},auth)
        assert status==200
        results['completion_after_changed_instructions']=json.loads(data)
        assert json.loads(data)['status']=='awaiting_manual'
        assert json.loads(data)['output_notes']==''
        # Regression: password rotation must revoke the old session.
        server.terminate(); server.wait(timeout=10)
        Path(d,'password').write_text(secrets.token_urlsafe(32))
        server=subprocess.Popen(['node','server.mjs'],cwd=ROOT,env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
        port=int(server.stdout.readline().strip().rsplit(':',1)[1])
        status,_,_=request('/api/session',headers={'Cookie':cookie}); assert status==401
        results['old_session_after_password_rotation']=status
    finally:
        server.terminate(); server.wait(timeout=10)
(ROOT/'verification'/'independent-regression-results.json').write_text(json.dumps(results,indent=2))
print(json.dumps(results,indent=2))
