"""NETWATCH 404 local-only read-only network dashboard."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlsplit, parse_qs
import json, subprocess, sys, threading, time, webbrowser
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parent
DATA = ROOT / 'data' / 'status.json'
COLLECTOR = ROOT / 'collector.ps1'
LOCK = threading.Lock()
PUBLIC_FILES = {'/', '/index.html', '/app.js', '/router_compare.js', '/map_view.js', '/style.css', '/futurista.css', '/futurista.js', '/analytics.css', '/analytics.js'}
ALLOWED_HOSTS = {'127.0.0.1:8765', 'localhost:8765'}

def validate_capture(payload):
    """Validate the minimal public contract before reporting successful collection."""
    if not isinstance(payload, dict) or payload.get('mode') != 'live':
        raise ValueError('El diagnóstico debe estar en modo live.')
    if not isinstance(payload.get('computer'), str) or not payload['computer'].strip():
        raise ValueError('Falta el identificador del equipo.')
    if not all(isinstance(payload.get(k), list) for k in ('devices', 'interfaces', 'gateways')):
        raise ValueError('Estructura incorrecta del diagnóstico.')
    if any(not isinstance(x, dict) for k in ('devices','interfaces','gateways') for x in payload[k]):
        raise ValueError('Las entradas deben ser objetos.')
    for optional in ('traffic', 'connections'):
        if optional in payload and (not isinstance(payload[optional], list) or any(not isinstance(x, dict) for x in payload[optional])):
            raise ValueError('Datos de tráfico o conexiones incorrectos.')
    stamp = payload.get('collectedAt')
    if not isinstance(stamp, str):
        raise ValueError('Falta fecha de captura.')
    captured = datetime.fromisoformat(stamp.replace('Z', '+00:00'))
    if captured.tzinfo is None:
        raise ValueError('Fecha de captura sin zona horaria.')
    return captured


# Monitor local opcional: vive mientras el proceso servidor está abierto.
# No sondea subredes ni abre puertos; ejecuta únicamente la captura pasiva.
MONITOR_FILE = ROOT / 'data' / 'monitor.json'
MONITOR_GUARD = threading.RLock()
MONITOR = {'enabled': False, 'interval': 60, 'next': None, 'lastError': '', 'lastRun': None, 'events': [], 'samples': []}

def monitor_load():
    try:
        saved = json.loads(MONITOR_FILE.read_text(encoding='utf-8'))
        if isinstance(saved, dict):
            events = saved.get('events', [])
            samples = saved.get('samples', [])
            MONITOR['events'] = [x for x in events if isinstance(x, dict) and isinstance(x.get('type'), str)][-500:] if isinstance(events, list) else []
            MONITOR['samples'] = [x for x in samples if isinstance(x, dict) and isinstance(x.get('computer'), str) and isinstance(x.get('devices'), list) and isinstance(x.get('gateways'), list) and all(isinstance(d, dict) and all(k in d for k in ('ip','mac','interface')) for d in x['devices']) and all(isinstance(g, dict) and all(k in g for k in ('ip','reachable')) for g in x['gateways'])][-120:] if isinstance(samples, list) else []
    except (OSError, ValueError, TypeError):
        pass

def monitor_save():
    MONITOR_FILE.parent.mkdir(parents=True, exist_ok=True)
    temp = MONITOR_FILE.with_suffix('.tmp')
    temp.write_text(json.dumps({'events': MONITOR['events'][-500:], 'samples': MONITOR['samples'][-120:]}, ensure_ascii=False), encoding='utf-8')
    temp.replace(MONITOR_FILE)

def monitor_record(payload):
    sample = {'at':payload['collectedAt'], 'computer':payload['computer'],
              'devices':[{'ip':d.get('ip',''), 'mac':d.get('mac',''), 'interface':d.get('interface','')} for d in payload['devices']],
              'gateways':[{'ip':g.get('ip',''), 'reachable':bool(g.get('reachable')), 'latencyMs':g.get('latencyMs')} for g in payload['gateways']]}
    with MONITOR_GUARD:
        prior = next((x for x in reversed(MONITOR['samples']) if x.get('computer') == sample['computer']), None)
        events = []
        if prior:
            old = {(x['interface'],x['ip']):x for x in prior['devices']}
            now = {(x['interface'],x['ip']):x for x in sample['devices']}
            for k,x in now.items():
                if k not in old: events.append(('vecino_nuevo', x['ip'], 'Vecino observado; no demuestra conexión nueva'))
                elif x['mac'] and old[k]['mac'] and x['mac'].lower()!=old[k]['mac'].lower():
                    events.append(('mac_cambiada', x['ip'], 'MAC observada distinta'))
            for k,x in old.items():
                if k not in now: events.append(('vecino_ausente', x['ip'], 'No aparece en caché; no demuestra desconexión'))
            prior_gw={g['ip']:g for g in prior['gateways']}
            for g in sample['gateways']:
                if g['ip'] in prior_gw and g['reachable']!=prior_gw[g['ip']]['reachable']:
                    events.append(('gateway_icmp',g['ip'],'Cambio de respuesta ICMP'))
        MONITOR['events'].extend({'at':sample['at'],'computer':sample['computer'],'type':kind,'target':target,'detail':detail} for kind,target,detail in events[:100])
        MONITOR['events']=MONITOR['events'][-500:]
        MONITOR['samples'].append(sample)
        MONITOR['samples']=MONITOR['samples'][-120:]
        MONITOR['lastRun']=sample['at']
        monitor_save()

def monitor_loop():
    while True:
        time.sleep(1)
        with MONITOR_GUARD:
            due = MONITOR['enabled'] and MONITOR['next'] is not None and time.monotonic() >= MONITOR['next']
            if due: MONITOR['next'] = time.monotonic() + MONITOR['interval']
        if not due or sys.platform != 'win32' or not LOCK.acquire(blocking=False):
            continue
        try:
            before=DATA.stat().st_mtime_ns if DATA.exists() else None
            start=time.time()
            result=subprocess.run(['powershell.exe','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',str(COLLECTOR)],cwd=str(ROOT),capture_output=True,text=True,timeout=100,creationflags=0x08000000)
            if result.returncode or not DATA.exists() or DATA.stat().st_mtime_ns==before:
                raise ValueError('El recolector no produjo una captura válida')
            payload=json.loads(DATA.read_text(encoding='utf-8-sig'))
            stamp=validate_capture(payload).timestamp()
            if stamp < start-5 or stamp > time.time()+5: raise ValueError('Fecha de captura desactualizada')
            monitor_record(payload)
            with MONITOR_GUARD: MONITOR['lastError']=''
        except (OSError, ValueError, subprocess.TimeoutExpired, TypeError, OverflowError) as exc:
            with MONITOR_GUARD: MONITOR['lastError']='No se pudo completar la captura; revisa PowerShell y los permisos locales.'
        finally:
            LOCK.release()

monitor_load()

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def allowed_host(self):
        return self.headers.get('Host', '') in ALLOWED_HOSTS

    def do_GET(self):
        if not self.allowed_host():
            return self.json_response(403, {'error':'Host no autorizado'})
        route = urlsplit(self.path).path
        if route == '/api/monitor':
            with MONITOR_GUARD:
                return self.json_response(200, {k:v for k,v in MONITOR.items() if k!='next'})
        if route == '/api/status':
            if not DATA.exists():
                return self.json_response(200, {'mode':'empty','devices':[],'message':'Pulsa Actualizar diagnóstico para recopilar datos.'})
            try:
                return self.json_response(200, json.loads(DATA.read_text(encoding='utf-8-sig')))
            except (OSError, ValueError):
                return self.json_response(500, {'error':'No se puede leer el diagnóstico.'})
        if route not in PUBLIC_FILES:
            self.send_error(404)
            return
        return super().do_GET()

    def do_POST(self):
        if not self.allowed_host():
            return self.json_response(403, {'error':'Host no autorizado'})
        if urlsplit(self.path).path not in ('/api/refresh','/api/discover','/api/monitor'):
            return self.json_response(404, {'error':'Ruta no encontrada'})
        origin = self.headers.get('Origin','')
        host = self.headers.get('Host','')
        if origin != 'http://' + host:
            return self.json_response(403, {'error':'Origen no autorizado'})
        if self.headers.get('Transfer-Encoding') or self.headers.get('Content-Length','0') != '0':
            return self.json_response(400, {'error':'Cuerpo no permitido'})
        if urlsplit(self.path).path == '/api/monitor':
            params = parse_qs(urlsplit(self.path).query)
            if set(params) != {'enabled','interval'} or any(len(v)!=1 for v in params.values()):
                return self.json_response(400, {'error':'Configuración incorrecta'})
            enabled=params['enabled'][0]
            interval=params['interval'][0]
            if enabled not in ('0','1') or interval not in ('30','60','120','300'):
                return self.json_response(400, {'error':'Intervalo no permitido'})
            if enabled=='1' and sys.platform!='win32':
                return self.json_response(501, {'error':'La monitorización requiere Windows'})
            with MONITOR_GUARD:
                MONITOR['enabled']=enabled=='1'
                MONITOR['interval']=int(interval)
                MONITOR['next']=time.monotonic() if enabled=='1' else None
            return self.json_response(200, {'ok':True, 'enabled':enabled=='1'})
        if not LOCK.acquire(blocking=False):
            return self.json_response(429, {'error':'Diagnóstico en curso'})
        try:
            if sys.platform != 'win32':
                return self.json_response(501, {'error':'La recopilación real requiere Windows.'})
            started_at = time.time()
            before = DATA.stat().st_mtime_ns if DATA.exists() else None
            command = ['powershell.exe','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',str(COLLECTOR)]
            if urlsplit(self.path).path == '/api/discover':
                params = parse_qs(urlsplit(self.path).query, keep_blank_values=True)
                if set(params) - {'interface'} or len(params.get('interface', [])) > 1:
                    return self.json_response(400, {'error':'Parámetros no autorizados'})
                interface = params.get('interface', [''])[0]
                if len(interface) > 128 or any(ord(c) < 32 for c in interface):
                    return self.json_response(400, {'error':'Nombre de interfaz no válido'})
                command.append('-Discover')
                if interface:
                    command.extend(['-InterfaceAlias', interface])
            result = subprocess.run(command,
                                    cwd=str(ROOT),capture_output=True,text=True,timeout=100, creationflags=0x08000000)
            if result.returncode:
                return self.json_response(500, {'error':'Falló la recopilación. Comprueba permisos y PowerShell; consulta la consola local para más detalles.'})
            try:
                if not DATA.exists() or DATA.stat().st_mtime_ns == before:
                    raise ValueError('El recolector no generó una captura nueva.')
                payload = json.loads(DATA.read_text(encoding='utf-8-sig'))
                # A changed file timestamp is not sufficient: its captured time must
                # also belong to this invocation, not a stale or copied snapshot.
                captured = validate_capture(payload)
                if captured.timestamp() < started_at - 5 or captured.timestamp() > time.time() + 5:
                    raise ValueError('La fecha de captura no corresponde a esta ejecución.')
            except (OSError, ValueError, TypeError, OverflowError) as exc:
                return self.json_response(500, {'error':'La captura generada no es válida o está desactualizada.'})
            return self.json_response(200, {'ok':True})
        except subprocess.TimeoutExpired:
            return self.json_response(504, {'error':'La recopilación agotó el tiempo límite.'})
        except OSError:
            return self.json_response(500, {'error':'No se pudo iniciar PowerShell.'})
        finally:
            LOCK.release()

    def json_response(self, status, payload):
        data=json.dumps(payload,ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type','application/json; charset=utf-8')
        self.send_header('Content-Length',str(len(data)))
        self.end_headers()
        try:
            self.wfile.write(data)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def end_headers(self):
        self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'")
        self.send_header('Cache-Control','no-store')
        self.send_header('X-Frame-Options','DENY')
        self.send_header('Referrer-Policy','no-referrer')
        super().end_headers()

    def log_message(self,fmt,*args):
        print('[NETWATCH] '+fmt%args)

if __name__=='__main__':
    server=ThreadingHTTPServer(('127.0.0.1',8765),Handler)
    threading.Thread(target=monitor_loop, daemon=True).start()
    print('NETWATCH 404: http://127.0.0.1:8765')
    threading.Timer(1.0,lambda:webbrowser.open('http://127.0.0.1:8765')).start()
    try: server.serve_forever()
    except KeyboardInterrupt: pass
    finally: server.server_close()
