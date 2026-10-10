import subprocess,time,urllib.request,urllib.error,json,os
from pathlib import Path
root=str(Path(__file__).resolve().parent)
p=subprocess.Popen([__import__('sys').executable,'server.py'],cwd=root,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
try:
 for _ in range(50):
  try: urllib.request.urlopen('http://127.0.0.1:8765/api/status',timeout=1);break
  except Exception: time.sleep(.1)
 def request(path,method='GET',headers=None,data=None):
  req=urllib.request.Request('http://127.0.0.1:8765'+path,headers=headers or {},method=method,data=data)
  try:
   with urllib.request.urlopen(req,timeout=5) as r: return r.status,r.read(),dict(r.headers)
  except urllib.error.HTTPError as e: return e.code,e.read(),dict(e.headers)
 checks=[]
 for path,expected in [('/',200),('/index.html',200),('/app.js',200),('/router_compare.js',200),('/map_view.js',200),('/style.css',200),('/api/status',200),('/collector.ps1',404),('/server.py',404),('/README.md',404),('/data/status.json',404),('/.gitignore',404),('/api/nothing',404)]:
  code,body,headers=request(path);checks.append((path,code,expected));assert code==expected,(path,code)
  assert 'Content-Security-Policy' in headers
 code,_,_=request('/api/status',headers={'Host':'evil.test'});assert code==403
 code,_,_=request('/api/refresh',method='POST',data=b'',headers={'Host':'evil.test','Origin':'http://127.0.0.1:8765'});assert code==403
 code,_,_=request('/api/refresh',method='POST',data=b'',headers={'Origin':'http://evil.test'});assert code==403
 code,_,_=request('/api/refresh',method='POST',data=b'',headers={'Origin':'http://127.0.0.1:8765'});assert code==501 # Linux only
 code,_,_=request('/api/refresh',method='POST',data=b'',headers={'Origin':'http://localhost:8765'});assert code==403 # mismatched Host/Origin
 code,_,_=request('/api/refresh',method='POST',data=b'junk',headers={'Origin':'http://127.0.0.1:8765'});assert code==400
 print('PASS',len(checks)+6,'HTTP/security checks')
 print(checks)
finally:
 p.terminate();p.wait(timeout=5)
