'use strict';
const $=id=>document.getElementById(id);
let snapshot={mode:'empty',devices:[],interfaces:[],gateways:[]};
let lastComparison=null;
const safeArr=x=>Array.isArray(x)?x:[];
const text=(tag,value,cls)=>{const e=document.createElement(tag);e.textContent=String(value??'');if(cls)e.className=cls;return e};
function empty(container,msg){container.replaceChildren(text('div',msg,'empty'))}
function item(title,detail,right,ok=true){const el=document.createElement('div');el.className='item';const left=document.createElement('div');left.append(text('strong',title),text('small',detail));el.append(left,text('span',right,'state'+(ok?'':' bad')));return el}
function render(){
 const ds=safeArr(snapshot.devices),ifs=safeArr(snapshot.interfaces),gs=safeArr(snapshot.gateways);
 $('deviceCount').textContent=ds.length; $('interfaceCount').textContent=ifs.length;$('gatewayCount').textContent=gs.filter(g=>g.reachable).length+' / '+gs.length;
 $('lastCapture').textContent=snapshot.collectedAt?new Date(snapshot.collectedAt).toLocaleString('es-ES',{dateStyle:'short',timeStyle:'short'}):'—';
 $('computerLabel').textContent=snapshot.computer||'Sin identificar';
 $('sourceLabel').textContent=snapshot.mode==='live'?'Datos reales de Windows':'Sin datos recopilados';
 $('notice').textContent=snapshot.mode==='live'?'Captura real de Windows. '+(snapshot.notes||'La lista no constituye un inventario completo.'):snapshot.message||'No hay datos todavía. Pulsa Actualizar diagnóstico desde Windows.';
 const gateways=$('gatewayList');gateways.replaceChildren();if(!gs.length)empty(gateways,'Ninguna puerta de enlace detectada');else gs.forEach(g=>gateways.append(item(g.ip,'Comprobación ICMP',g.reachable?'RESPONDE'+(Number.isFinite(g.latencyMs)?' · '+g.latencyMs+' ms':''):'SIN RESPUESTA',g.reachable)));
 const interfaces=$('interfaceList');interfaces.replaceChildren();if(!ifs.length)empty(interfaces,'Sin interfaces IPv4');else ifs.forEach(i=>interfaces.append(item(i.name,i.ip+' · DNS: '+safeArr(i.dns).join(', '),'GW '+(i.gateway||'—'))));
 renderDevices();renderRouter();renderMap(ds);renderChanges();renderMonitor();renderTraffic();if(window.NETWATCH_PRO)window.NETWATCH_PRO.render(snapshot);if(window.NETWATCH_ANALYTICS)window.NETWATCH_ANALYTICS.render(snapshot);
}
function renderDevices(){const q=$('searchDevices').value.trim().toLowerCase();const ds=safeArr(snapshot.devices).filter(d=>[d.ip,d.mac,d.state,d.interface,d.hostname,d.source].some(x=>String(x||'').toLowerCase().includes(q)));const body=$('devicesBody');body.replaceChildren();if(!ds.length){const tr=document.createElement('tr');const td=text('td','Sin coincidencias');td.colSpan=6;tr.append(td);body.append(tr)}else ds.forEach(d=>{const tr=document.createElement('tr');[d.ip,d.hostname||'—',d.mac||'—',d.state,d.interface,d.source||'Caché Windows'].forEach(v=>tr.append(text('td',v)));body.append(tr)})}
function renderMap(devices){
 const root=$('networkMap');root.replaceChildren();
 if(!devices.length)return empty(root,'Ningún dispositivo observado');
 const list=devices.slice(0,8);
 list.forEach(d=>root.append(item(d.ip||'IP desconocida',(d.hostname||d.interface||'Sin nombre')+' · '+(d.source||'Caché Windows'),'OBSERVADO')));
 if(devices.length>8)root.append(text('div',`Y ${devices.length-8} dispositivos más en el mapa profesional.`, 'map-more-list'));
 const btn=text('button','Abrir mapa profesional →','btn primary');btn.type='button';btn.addEventListener('click',()=>document.querySelector('[data-view="map"]').click());root.append(btn);
 if(window.NetwatchMap)NetwatchMap.render(devices);
}
function identity(d){return String(d.ip||'')+'|'+String(d.interface||'')}
function allHistoryEntries(){try{const entries=JSON.parse(localStorage.getItem('netwatch404-history-v2')||'[]');return Array.isArray(entries)?entries.filter(e=>e&&typeof e==='object'):[]}catch{return []}}
function historyEntries(){return allHistoryEntries().filter(e=>e.computer===snapshot.computer)}
function saveHistory(){
 if(snapshot.mode!=='live'||!snapshot.collectedAt)return;
 try{
  const entries=historyEntries();
  if(entries.some(e=>e.collectedAt===snapshot.collectedAt&&e.computer===snapshot.computer)){lastComparison=entries.length>1?compareSnapshots(entries[0],entries[1]):null;return}
  const current={collectedAt:snapshot.collectedAt,computer:snapshot.computer,deviceCount:safeArr(snapshot.devices).length,interfaceCount:safeArr(snapshot.interfaces).length,traffic:safeArr(snapshot.traffic).map(t=>({name:t.name,receivedBytes:t.receivedBytes,sentBytes:t.sentBytes})),devices:safeArr(snapshot.devices).map(d=>({ip:d.ip,mac:d.mac,interface:d.interface,state:d.state})),gateways:safeArr(snapshot.gateways).map(g=>({ip:g.ip,reachable:Boolean(g.reachable),latencyMs:g.latencyMs??null}))};
  lastComparison=entries.length?compareSnapshots(current,entries[0]):null;if(lastComparison)recordIncidents(lastComparison,current);
  entries.unshift(current);const foreign=allHistoryEntries().filter(e=>e.computer!==snapshot.computer);localStorage.setItem('netwatch404-history-v2',JSON.stringify([...entries.slice(0,30),...foreign].slice(0,120)));
 }catch(e){$('notice').textContent+=' Historial no disponible en este navegador.'}
}
function compareSnapshots(current,previous){
 const old=new Map(safeArr(previous.devices).map(d=>[identity(d),d]));
 const now=new Map(safeArr(current.devices).map(d=>[identity(d),d]));
 const changedMac=[...now.values()].filter(d=>old.has(identity(d))&&String(old.get(identity(d)).mac||'').toLowerCase()!==String(d.mac||'').toLowerCase()).map(d=>({ip:d.ip,interface:d.interface,from:old.get(identity(d)).mac,to:d.mac}));
 const added=[...now.values()].filter(d=>!old.has(identity(d)));
 const missing=[...old.values()].filter(d=>!now.has(identity(d)));
 const priorGateway=new Map(safeArr(previous.gateways).map(g=>[g.ip,g]));
 const changedGateways=safeArr(current.gateways).filter(g=>priorGateway.has(g.ip)&&Boolean(priorGateway.get(g.ip).reachable)!==Boolean(g.reachable));
 return {added,missing,changedMac,changedGateways,from:previous.collectedAt,to:current.collectedAt};
}
function renderChanges(){
 const target=$('changeSummary');target.replaceChildren();
 if(!lastComparison)return empty(target,'Se necesitan al menos dos capturas reales distintas para comparar.');
 const c=lastComparison;
 if(!c.added.length&&!c.missing.length&&!(c.changedMac||[]).length&&!c.changedGateways.length)return empty(target,'Sin cambios observados respecto a la captura anterior.');
 c.added.slice(0,12).forEach(d=>target.append(item('NUEVO VECINO OBSERVADO',d.ip+' · '+(d.mac||'Sin MAC'), 'NUEVO')));
 c.missing.slice(0,12).forEach(d=>target.append(item('VECINO YA NO OBSERVADO',d.ip+' · '+(d.mac||'Sin MAC'), 'AUSENTE',false)));
 (c.changedMac||[]).slice(0,12).forEach(d=>target.append(item('CAMBIO DE MAC OBSERVADO',d.ip+' · '+(d.from||'—')+' → '+(d.to||'—'),'CAMBIO',false)));
 c.changedGateways.forEach(g=>target.append(item('CAMBIO RESPUESTA GATEWAY',g.ip,g.reachable?'RESPONDE':'SIN ICMP',g.reachable)));
 const hidden=Math.max(0,c.added.length-12)+Math.max(0,c.missing.length-12)+Math.max(0,(c.changedMac||[]).length-12);
 if(hidden>0)target.append(text('div',hidden+' cambios adicionales; exporta la captura para consultar el inventario completo.','empty'));
}
function renderHistory(){const list=$('historyList');list.replaceChildren();let entries=[];entries=historyEntries();if(!Array.isArray(entries)||!entries.length)return empty(list,'No existen capturas guardadas en este navegador');entries.forEach(e=>list.append(item(new Date(e.collectedAt).toLocaleString('es-ES'),(e.computer||'Equipo')+' · '+e.interfaceCount+' interfaces',e.deviceCount+' vecinos')));['compareNew','compareOld'].forEach((id)=>{const sel=$(id),old=sel.value;sel.replaceChildren();entries.forEach((e,i)=>{const o=document.createElement('option');o.value=String(i);o.textContent=new Date(e.collectedAt).toLocaleString('es-ES');sel.append(o)});sel.value=old&&Number(old)<entries.length?old:(id==='compareOld'&&entries.length>1?'1':'0')})}
async function load(){try{const res=await fetch('/api/status',{cache:'no-store'});if(!res.ok)throw Error('HTTP '+res.status);const incoming=await res.json();if(!incoming||typeof incoming!=='object'||!['live','empty'].includes(incoming.mode)|| (incoming.mode==='live' && (!Array.isArray(incoming.devices)||!Array.isArray(incoming.interfaces)||!Array.isArray(incoming.gateways)||!incoming.collectedAt)))throw Error('Formato de datos no válido');snapshot=incoming;renderScanInterfaces();saveHistory();render();renderHistory();renderIncidents()}catch(e){snapshot={mode:'empty',message:'Sin conexión con el servidor local. Inicia INICIAR_NETWATCH.bat.',devices:[],interfaces:[],gateways:[]};render()}}
function renderScanInterfaces(){
 const select=$('scanInterface'); if(!select)return;
 const original=select.value;
 select.replaceChildren(new Option('Automática (ruta preferente)',''));
 safeArr(snapshot.interfaces).filter(i=>i.gateway&&/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(i.ip||'')&&Number(i.prefix)>=24&&Number(i.prefix)<=30).forEach(i=>{
   select.add(new Option(`${i.name} — ${i.ip}/${i.prefix} · GW ${i.gateway}`,i.name));
 });
 if([...select.options].some(o=>o.value===original))select.value=original;
}
async function refreshDiagnostic(){const btn=$('refreshBtn');if(btn.disabled)return; btn.disabled=true;btn.textContent='Recopilando…';try{const res=await fetch('/api/refresh',{method:'POST',headers:{'Content-Type':'text/plain'},body:''});const data=await res.json();if(!res.ok)throw Error(data.error||'No se pudo recopilar');await load()}catch(e){$('notice').textContent='Error: '+e.message}finally{btn.disabled=false;btn.textContent='↻ Actualizar diagnóstico'}}
$('refreshBtn').addEventListener('click',refreshDiagnostic);
$('discoverBtn').addEventListener('click',async()=>{
 const chosen=$('scanInterface').selectedOptions[0]?.textContent||'Ruta preferente';
 if(!$('discoverBtn').disabled && confirm('Red: '+chosen+'. Se enviará un ping por dirección a un máximo de 253 IP de la subred /24 a /30. Solo redes propias o autorizadas. ¿Continuar?')){
  const btn=$('discoverBtn');btn.disabled=true;btn.textContent='⌁ Explorando (hasta 90 s)…';
  try{
   const res=await fetch('/api/discover?interface='+encodeURIComponent($('scanInterface').value),{method:'POST',headers:{'Content-Type':'text/plain'},body:''});
   const response=await res.json();if(!res.ok)throw Error(response.error||'No se pudo explorar la red');
   await load();$('notice').textContent='Exploración finalizada. '+(snapshot.scan?.scope||'')+' · '+(snapshot.scan?.tested||0)+' IP probadas, '+(snapshot.scan?.replies||0)+' respuestas ICMP, '+(snapshot.scan?.arp||0)+' entradas con MAC. La lista no es exhaustiva; los vecinos de caché no están confirmados en línea. '+(snapshot.scan?.explanation||'');
  }catch(e){$('notice').textContent='Error al explorar: '+e.message}
  finally{btn.disabled=false;btn.textContent='⌁ Explorar mi subred'}
 }
});

$('exportBtn').addEventListener('click',()=>{if(snapshot.mode!=='live'){alert('Recopila datos primero para exportarlos.');return}const blob=new Blob([JSON.stringify(snapshot,null,2)],{type:'application/json'});const a=document.createElement('a');const url=URL.createObjectURL(blob);a.href=url;a.download='netwatch404-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)});
$('searchDevices').addEventListener('input',renderDevices);
$('csvBtn').addEventListener('click',()=>{if(snapshot.mode!=='live'){alert('Recopila datos primero.');return}const rows=[['IP','Nombre DNS','MAC','Estado','Interfaz','Fuente'],...safeArr(snapshot.devices).map(d=>[d.ip,d.hostname||'',d.mac,d.state,d.interface,d.source||'Caché Windows'])];const csv='\uFEFF'+rows.map(r=>r.map(v=>'"'+String(v??'').replace(/^[=+@\-\t\r]/,v=>String.fromCharCode(39)+v).replace(/"/g,'""')+'"').join(';')).join('\r\n');downloadFile(csv,'netwatch404-inventario.csv','text/csv;charset=utf-8')});
function downloadFile(data,name,type){const url=URL.createObjectURL(new Blob([data],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
const configKey='netwatch404-alert-config-v3';
function alertConfig(){try{return {...{added:true,missing:true,gateway:true,threshold:100},...JSON.parse(localStorage.getItem(configKey)||'{}')}}catch{return {added:true,missing:true,gateway:true,threshold:100}}}
function restoreConfig(){const c=alertConfig();$('alertNew').checked=Boolean(c.added);$('alertMissing').checked=Boolean(c.missing);$('alertGateway').checked=Boolean(c.gateway);$('latencyThreshold').value=c.threshold}
$('saveAlertBtn').addEventListener('click',()=>{const threshold=Number($('latencyThreshold').value);if(!Number.isInteger(threshold)||threshold<1||threshold>10000){alert('Introduce un umbral entre 1 y 10000 ms');return}const c={added:$('alertNew').checked,missing:$('alertMissing').checked,gateway:$('alertGateway').checked,threshold};try{localStorage.setItem(configKey,JSON.stringify(c));renderMonitor();$('saveAlertBtn').textContent='✓ Guardado';setTimeout(()=>$('saveAlertBtn').textContent='Guardar configuración',1200)}catch{alert('No se puede guardar en este navegador')}});
function renderMonitor(){const chart=$('latencyChart'),legend=$('latencyLegend'),list=$('alertsList');chart.replaceChildren();legend.replaceChildren();list.replaceChildren();const entries=historyEntries().slice().reverse();const gateways=[...new Set(entries.flatMap(e=>safeArr(e.gateways).map(g=>g.ip)))].slice(0,6);if(entries.length<2||!gateways.length){empty(chart,'Se necesitan al menos dos capturas con gateways');}else{const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 720 270');svg.setAttribute('aria-hidden','true');const values=entries.flatMap(e=>safeArr(e.gateways).map(g=>g.reachable&&Number.isFinite(g.latencyMs)?g.latencyMs:null)).filter(v=>v!==null);const max=Math.max(20,alertConfig().threshold,...values);const add=(tag,attrs)=>{const el=document.createElementNS(ns,tag);Object.entries(attrs).forEach(([k,v])=>el.setAttribute(k,v));svg.append(el);return el};[0,.25,.5,.75,1].forEach(t=>{add('line',{x1:38,y1:230-190*t,x2:700,y2:230-190*t,class:'gridline'});const lbl=add('text',{x:2,y:234-190*t,class:'axislabel'});lbl.textContent=Math.round(max*t)+' ms'});const colors=['#5ee1bd','#f6ae65','#90adff','#e78fdc','#ffffff','#e26f7b'];gateways.forEach((ip,i)=>{let segment=[];function flush(){if(segment.length){add('polyline',{points:segment.join(' '),fill:'none',stroke:colors[i], 'stroke-width':'3','stroke-linejoin':'round'});segment=[]}}entries.forEach((e,j)=>{const g=safeArr(e.gateways).find(g=>g.ip===ip);if(!g?.reachable||!Number.isFinite(g.latencyMs)){flush();return}segment.push((38+662*j/Math.max(1,entries.length-1))+','+(230-190*g.latencyMs/max))});flush();const label=text('span',ip);label.style.borderLeft='3px solid '+colors[i];legend.append(label)});chart.append(svg)}
 const c=alertConfig(),cmp=lastComparison;if(cmp){if(c.added&&cmp.added.length)list.append(item('Vecinos nuevos observados',cmp.added.length+' entradas', 'AVISO'));if(c.missing&&cmp.missing.length)list.append(item('Vecinos ya no observados',cmp.missing.length+' entradas; no implica caída','AVISO',false));(cmp.changedMac||[]).forEach(d=>list.append(item('Cambio de MAC observado',d.ip+' · '+(d.from||'—')+' → '+(d.to||'—'),'CAMBIO',false)));if(c.gateway)cmp.changedGateways.forEach(g=>list.append(item('Cambio de gateway',g.ip,g.reachable?'RESPONDE':'SIN ICMP',g.reachable)))}safeArr(snapshot.gateways).filter(g=>g.reachable&&Number.isFinite(g.latencyMs)&&g.latencyMs>c.threshold).forEach(g=>list.append(item('Umbral de latencia superado',g.ip+' · '+g.latencyMs+' ms','ALTA',false)));if(!list.children.length)empty(list,'No hay alertas con las reglas actuales.');}
$('compareBtn').addEventListener('click',()=>{const entries=historyEntries(),a=Number($('compareNew').value),b=Number($('compareOld').value);if(a===b||!entries[a]||!entries[b]){alert('Selecciona dos capturas diferentes');return}if(entries[a].computer!==entries[b].computer){alert('No se pueden comparar capturas de equipos diferentes');return}const current=new Date(entries[a].collectedAt)>new Date(entries[b].collectedAt)?entries[a]:entries[b],prior=current===entries[a]?entries[b]:entries[a];lastComparison=compareSnapshots(current,prior);renderChanges();renderMonitor();document.querySelector('[data-view="overview"]').click()});
restoreConfig();
$('clearHistoryBtn').addEventListener('click',()=>{if(!confirm('¿Borrar las capturas históricas guardadas en este navegador?'))return;try{localStorage.removeItem('netwatch404-history-v2')}catch(e){alert('No se puede borrar el historial: '+e.message);return}lastComparison=null;renderChanges();renderHistory();renderMonitor()});
document.querySelectorAll('[data-view]').forEach(btn=>btn.addEventListener('click',()=>{document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b===btn));document.querySelectorAll('.view').forEach(el=>el.classList.add('hidden'));$(btn.dataset.view+'View').classList.remove('hidden');$('pageTitle').innerHTML=({'overview':'NETWORK ANALYTICS','devices':'Dispositivos <span>observados.</span>','map':'Mapa <span>profesional.</span>','router':'Router <span>vs. NETWATCH.</span>','interfaces':'Interfaces <span>de red.</span>','traffic':'Tráfico y <span>conexiones.</span>','history':'Historial <span>de capturas.</span>','monitor':'Monitorización <span>histórica.</span>','incidents':'Registro <span>de incidencias.</span>'})[btn.dataset.view]}));
load();

// Phase 4: polling is opt-in, session-scoped and pauses when document is hidden.
let refreshTimer=null;
const intervalValues=[30,60,120,300];
function updatePolling(){
 if(refreshTimer!==null){clearInterval(refreshTimer);refreshTimer=null}
 const enabled=$('autoRefresh').checked, seconds=Number($('refreshInterval').value);
 if(!intervalValues.includes(seconds)){$('autoRefresh').checked=false;return}
 if(enabled&&!document.hidden){refreshTimer=setInterval(()=>{if(!document.hidden)refreshDiagnostic()},seconds*1000)}
 $('autoStatus').textContent=!enabled?'Actualización automática desactivada':document.hidden?'En pausa: pestaña oculta':`Activa cada ${seconds} s · solo mientras esta pestaña permanezca visible`;
}
$('autoRefresh').addEventListener('change',updatePolling);
$('refreshInterval').addEventListener('change',updatePolling);
document.addEventListener('visibilitychange',updatePolling);
window.addEventListener('pagehide',()=>{if(refreshTimer!==null)clearInterval(refreshTimer)});
// Incident journal: store evidence, deduplicate each capture, never label stale ARP neighbors as offline.
const incidentKey='netwatch404-incidents-v4';
function incidents(){try{const x=JSON.parse(localStorage.getItem(incidentKey)||'[]');return Array.isArray(x)?x:[]}catch{return []}}
function recordIncidents(c,current){
 const config=alertConfig(),newItems=[],time=current.collectedAt;
 if(config.added)c.added.forEach(d=>newItems.push({time,kind:'Nuevo vecino observado',detail:d.ip+' · '+(d.mac||'MAC desconocida')}));
 if(config.missing)c.missing.forEach(d=>newItems.push({time,kind:'Vecino ausente de caché',detail:d.ip+' · No acredita desconexión'}));
 (c.changedMac||[]).forEach(d=>newItems.push({time,kind:'Cambio de MAC observado',detail:d.ip+' · '+(d.from||'—')+' → '+(d.to||'—')}));
 if(config.gateway)c.changedGateways.forEach(g=>newItems.push({time,kind:'Respuesta ICMP modificada',detail:g.ip+' · '+(g.reachable?'Responde':'Sin respuesta')}));
 safeArr(current.gateways).filter(g=>g.reachable&&Number.isFinite(g.latencyMs)&&g.latencyMs>config.threshold).forEach(g=>newItems.push({time,kind:'Latencia elevada',detail:g.ip+' · '+g.latencyMs+' ms'}));
 if(!newItems.length)return;
 try{const existing=incidents(),ids=new Set(existing.map(e=>[e.time,e.kind,e.detail].join('|')));const novel=newItems.filter(e=>!ids.has([e.time,e.kind,e.detail].join('|')));localStorage.setItem(incidentKey,JSON.stringify([...novel,...existing].slice(0,500)))}catch(e){console.warn('No se pudo guardar el registro',e)}
}
function renderIncidents(){const el=$('incidentsList');el.replaceChildren();const data=incidents();if(!data.length)return empty(el,'Sin incidencias registradas');data.forEach(e=>el.append(item(e.kind,(new Date(e.time).toLocaleString('es-ES'))+' · '+e.detail,'OBSERVADO',false)))}
$('clearIncidentsBtn').addEventListener('click',()=>{if(!confirm('¿Borrar todas las incidencias guardadas en este navegador?'))return;try{localStorage.removeItem(incidentKey)}catch(e){alert('No se pueden borrar las incidencias: '+e.message);return}renderIncidents()});
function csvCell(v){return '"'+String(v??'').replace(/^[=+@\-\t\r]/,()=>"'").replace(/"/g,'""')+'"'}
$('incidentsCsvBtn').addEventListener('click',()=>{const data=incidents();if(!data.length){alert('No hay incidencias para exportar');return}const rows=[['Fecha','Tipo','Detalle'],...data.map(e=>[e.time,e.kind,e.detail])];downloadFile('\uFEFF'+rows.map(r=>r.map(csvCell).join(';')).join('\r\n'),'netwatch404-incidencias.csv','text/csv;charset=utf-8')});
$('reportBtn').addEventListener('click',()=>{
 if(snapshot.mode!=='live'){alert('Recopila un diagnóstico antes de generar el informe');return}
 const escapeHtml=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const rows=safeArr(snapshot.devices).map(d=>'<tr>'+[d.ip,d.hostname||'',d.mac,d.state,d.interface,d.source||'Caché Windows'].map(v=>'<td>'+escapeHtml(v)+'</td>').join('')+'</tr>').join('');
 const gRows=safeArr(snapshot.gateways).map(g=>'<tr>'+[g.ip,g.reachable?'Responde':'Sin respuesta',Number.isFinite(g.latencyMs)?g.latencyMs+' ms':'Sin medida'].map(v=>'<td>'+escapeHtml(v)+'</td>').join('')+'</tr>').join('');
 const doc='<!doctype html><html lang="es"><meta charset="utf-8"><title>Informe NETWATCH 404</title><style>body{font:14px system-ui;max-width:980px;margin:38px auto;color:#182333}h1{border-bottom:3px solid #168f80;padding-bottom:15px}table{border-collapse:collapse;width:100%;margin-bottom:30px}td,th{border:1px solid #d9e0e6;padding:8px;text-align:left}th{background:#edf4f4}small{color:#566}</style><h1>NETWATCH 404 · Informe técnico</h1><p><b>Equipo:</b> '+escapeHtml(snapshot.computer)+' · <b>Captura:</b> '+escapeHtml(snapshot.collectedAt)+'</p><p>Diagnóstico local de solo lectura. Los vecinos proceden de la caché de Windows; su ausencia no confirma desconexión. El mapa no es topología física verificada.</p><h2>Puertas de enlace</h2><table><thead><tr><th>IP</th><th>ICMP</th><th>Latencia</th></tr></thead><tbody>'+gRows+'</tbody></table><h2>Vecinos observados ('+safeArr(snapshot.devices).length+')</h2><table><thead><tr><th>IP</th><th>Nombre DNS</th><th>MAC</th><th>Estado</th><th>Interfaz</th><th>Fuente</th></tr></thead><tbody>'+rows+'</tbody></table><small>Generado localmente · Usar Imprimir → Guardar como PDF en el navegador.</small></html>';
 downloadFile(doc,'netwatch404-informe.html','text/html;charset=utf-8');
});
renderIncidents();updatePolling();

// Lectura de contadores y conexiones locales: datos Windows, no topología descubierta.
function renderTraffic(){
 const root=$('trafficList');if(!root)return;root.replaceChildren();
 const rows=safeArr(snapshot.traffic),conns=safeArr(snapshot.connections);
 const fmt=n=>Number.isFinite(Number(n))?(Number(n)/1048576).toLocaleString('es-ES',{maximumFractionDigits:1})+' MiB':'—';
 if(!rows.length)empty(root,'Sin contadores accesibles en esta captura');
 rows.forEach(r=>root.append(item(r.name||'Adaptador', 'Recibidos: '+fmt(r.receivedBytes)+' · Enviados: '+fmt(r.sentBytes), 'Errores: '+(Number(r.receivedErrors||0)+Number(r.sentErrors||0)))));
 const query=($('searchConnections')?.value||'').trim().toLowerCase();
 const table=$('connectionsBody');table.replaceChildren();
 const selected=conns.filter(c=>[c.local,c.remote,c.process,c.pid].some(x=>String(x??'').toLowerCase().includes(query)));
 if(!selected.length){const tr=document.createElement('tr'),td=text('td','Sin conexiones coincidentes');td.colSpan=4;tr.append(td);table.append(tr)}
 selected.forEach(c=>{const tr=document.createElement('tr');[c.process,c.pid,c.local,c.remote].forEach(v=>tr.append(text('td',v)));table.append(tr)});
}
$('searchConnections').addEventListener('input',renderTraffic);

// Comparación local con una lista exportada por el router. No activa exploraciones adicionales.
const routerKey='netwatch404-router-inventory-v1';
let routerInventory=[];
try{const stored=JSON.parse(localStorage.getItem(routerKey)||'[]');if(Array.isArray(stored))routerInventory=stored.filter(r=>r&&RouterCompare.validIp(r.ip)).slice(0,4096)}catch{}
function routerRows(){return RouterCompare.compare(routerInventory,safeArr(snapshot.devices))}
function renderRouter(){const body=$('routerBody');if(!body)return;body.replaceChildren();$('routerStats').replaceChildren();if(!routerInventory.length){const tr=document.createElement('tr'),td=text('td','Importa una lista del router para comparar');td.colSpan=5;tr.append(td);body.append(tr);return}const rows=routerRows();const onlyRouter=rows.filter(r=>r.status==='Solo router').length,onlyNW=rows.filter(r=>r.status==='Solo NETWATCH').length,conflicts=rows.filter(r=>r.status==='MAC distinta').length;for(const v of ['Router: '+routerInventory.length,'Solo router: '+onlyRouter,'Solo NETWATCH: '+onlyNW,'Conflictos MAC: '+conflicts])$('routerStats').append(text('span',v,'chip'));for(const r of rows){const tr=document.createElement('tr');[r.ip,r.name||'—',r.mac||'—',r.status,r.detail].forEach(v=>tr.append(text('td',v)));body.append(tr)}}
function saveRouter(rows){routerInventory=rows;try{localStorage.setItem(routerKey,JSON.stringify(rows));$('routerNotice').textContent='Importados '+rows.length+' dispositivos del router. Comparación actualizada.'}catch{$('routerNotice').textContent='Comparación activa, pero el navegador no permitió guardar la lista.'}renderRouter()}
$('routerFile').addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;try{if(file.size>2*1024*1024)throw Error('Archivo superior a 2 MB');const raw=await file.text();saveRouter(RouterCompare.parse(raw))}catch(err){$('routerNotice').textContent='Error de importación: '+err.message}finally{e.target.value=''}});
$('routerPasteBtn').addEventListener('click',()=>{try{saveRouter(RouterCompare.parse($('routerPaste').value))}catch(e){$('routerNotice').textContent='Error: '+e.message}});
$('routerClearBtn').addEventListener('click',()=>{if(!confirm('¿Borrar la lista importada del router de este navegador?'))return;try{localStorage.removeItem(routerKey)}catch{}routerInventory=[];$('routerNotice').textContent='Inventario del router borrado.';renderRouter()});
$('routerExportBtn').addEventListener('click',()=>{if(!routerInventory.length){alert('Importa primero una lista del router');return}const rows=[['IP','Nombre','MAC','Comparación','Observación'],...routerRows().map(r=>[r.ip,r.name,r.mac,r.status,r.detail])];const csv='\uFEFF'+rows.map(row=>row.map(v=>'"'+String(v??'').replace(/^[=+@\-\t\r]/,"'").replace(/"/g,'""')+'"').join(';')).join('\r\n');downloadFile(csv,'netwatch404-comparacion-router.csv','text/csv;charset=utf-8')});
renderRouter();

// Fase 12: seguimiento opcional en el servidor; separado del temporizador de la pestaña.
let backendMonitor=null;
async function monitorStatus(){
 try{
  const response=await fetch('/api/monitor',{cache:'no-store'});
  if(!response.ok)throw Error('HTTP '+response.status);
  backendMonitor=await response.json();
  $('backgroundStatus').textContent=(backendMonitor.enabled?'ACTIVO':'DETENIDO')+' · '+backendMonitor.interval+' s · últimas capturas: '+backendMonitor.samples.length+(backendMonitor.lastError?' · ERROR: '+backendMonitor.lastError:'');
  $('backgroundInterval').value=String(backendMonitor.interval);
  const target=$('backgroundEvents');target.replaceChildren();
  if(!backendMonitor.events.length)empty(target,'Sin cambios registrados por el monitor local.');
  else backendMonitor.events.slice(-20).reverse().forEach(e=>target.append(item(e.type,e.target+' · '+e.detail,new Date(e.at).toLocaleTimeString('es-ES'))));
 }catch(e){$('backgroundStatus').textContent='Monitor local no disponible: '+e.message}
}
async function monitorSwitch(enabled){
 const interval=$('backgroundInterval').value;
 if(enabled&&!confirm('Se realizarán diagnósticos pasivos periódicos mientras NETWATCH esté abierto, incluso sin navegador. ¿Activar?'))return;
 for(const id of ['backgroundStart','backgroundStop'])$(id).disabled=true;
 try{
  const response=await fetch('/api/monitor?enabled='+(enabled?'1':'0')+'&interval='+encodeURIComponent(interval),{method:'POST',body:''});
  const result=await response.json();if(!response.ok)throw Error(result.error||'No se pudo cambiar el monitor');
 }catch(e){$('backgroundStatus').textContent='Error: '+e.message}
 finally{for(const id of ['backgroundStart','backgroundStop'])$(id).disabled=false;await monitorStatus()}
}
$('backgroundStart').addEventListener('click',()=>monitorSwitch(true));
$('backgroundStop').addEventListener('click',()=>monitorSwitch(false));
$('backgroundExport').addEventListener('click',()=>{
 if(!backendMonitor)return alert('No hay información de monitorización');
 downloadFile(JSON.stringify({events:backendMonitor.events,samples:backendMonitor.samples},null,2),'netwatch-monitor-eventos.json','application/json');
});
monitorStatus();setInterval(()=>{if(!document.hidden)monitorStatus()},10000);
