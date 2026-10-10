"""Pruebas de monitorización sin ejecutar PowerShell ni tocar redes."""
import importlib.util, json, subprocess, sys, time, urllib.request, urllib.error
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

ROOT=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('nwserver',ROOT/'server.py')
mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
with TemporaryDirectory() as d:
    with patch.object(mod,'MONITOR_FILE',Path(d)/'monitor.json'):
        mod.MONITOR['samples']=[];mod.MONITOR['events']=[]
        a={'mode':'live','computer':'TESTPC','collectedAt':'2026-10-10T10:00:00+02:00','devices':[{'ip':'192.168.1.10','mac':'aa','interface':'WiFi'}],'gateways':[{'ip':'192.168.1.1','reachable':True,'latencyMs':4}],'interfaces':[]}
        mod.monitor_record(a)
        b=json.loads(json.dumps(a));b['collectedAt']='2026-10-10T10:01:00+02:00';b['devices'][0]['mac']='bb';b['devices'].append({'ip':'192.168.1.20','mac':'cc','interface':'WiFi'});b['gateways'][0]['reachable']=False
        mod.monitor_record(b)
        kinds={x['type'] for x in mod.MONITOR['events']}
        assert {'mac_cambiada','vecino_nuevo','gateway_icmp'}<=kinds,kinds
        assert len(mod.MONITOR['samples'])==2 and mod.MONITOR_FILE.exists()
        print('PASS monitor events and persistence')

p=subprocess.Popen([sys.executable,'server.py'],cwd=ROOT,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
try:
    for i in range(50):
        try:
            urllib.request.urlopen('http://127.0.0.1:8765/api/monitor',timeout=1);break
        except Exception:time.sleep(.1)
    def call(path,method='GET',origin='http://127.0.0.1:8765'):
        headers={'Origin':origin} if method=='POST' else {}
        req=urllib.request.Request('http://127.0.0.1:8765'+path,data=b'' if method=='POST' else None,method=method,headers=headers)
        try:
            with urllib.request.urlopen(req,timeout=3) as r:return r.status,json.loads(r.read())
        except urllib.error.HTTPError as e:return e.code,json.loads(e.read())
    assert call('/api/monitor')[0]==200
    assert call('/api/monitor?enabled=1&interval=60','POST')[0]==501 # non-Windows
    assert call('/api/monitor?enabled=0&interval=60','POST')[0]==200
    assert call('/api/monitor?enabled=1&interval=3','POST')[0]==400
    assert call('/api/monitor?enabled=0&interval=60','POST','http://evil.test')[0]==403
    assert call('/api/monitor?enabled=0&interval=60')[0]==200
    print('PASS monitor API 6 checks')
finally:
    p.terminate();p.wait(timeout=5)
