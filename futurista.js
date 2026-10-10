'use strict';
/* Visual layer only: uses Windows-captured values, never invents network topology or telemetry. */
(()=>{
 const themes=new Set(['cyber','blue','violet']);
 const $=id=>document.getElementById(id);
 const theme=$('proTheme'),motion=$('proMotion');
 function safeGet(key){try{return localStorage.getItem(key)}catch{return null}}
 function safeSet(key,value){try{localStorage.setItem(key,value)}catch{}}
 function setTheme(value){const v=themes.has(value)?value:'cyber';document.documentElement.dataset.theme=v;theme.value=v;safeSet('netwatch-v18-theme',v)}
 setTheme(safeGet('netwatch-v18-theme')||'cyber');
 theme.addEventListener('change',()=>setTheme(theme.value));
 const reduceMotion=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
 motion.checked=reduceMotion || safeGet('netwatch-v18-motion')==='reduce';
 function updateMotion(){document.documentElement.dataset.motion=motion.checked?'reduce':'full';safeSet('netwatch-v18-motion',motion.checked?'reduce':'full')}
 motion.addEventListener('change',updateMotion); updateMotion();
 const elt=(tag,cls,txt)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(txt!==undefined)e.textContent=String(txt);return e};
 const num=x=>Number.isFinite(Number(x))?Math.max(0,Number(x)):0;
 const fmt=x=>{const n=num(x);return n>=1073741824?(n/1073741824).toFixed(1)+' GiB':n>=1048576?(n/1048576).toFixed(1)+' MiB':n>=1024?(n/1024).toFixed(1)+' KiB':Math.round(n)+' B'};
 function render(s){
   const live=s.mode==='live';$('proLiveStatus').textContent=live?'● CAPTURA DE WINDOWS · '+(s.collectedAt?new Date(s.collectedAt).toLocaleTimeString('es-ES'):'ACTIVA'):'● EN ESPERA · SIN CAPTURA';
   $('proLiveStatus').dataset.live=String(live);
   $('proComputer').textContent='ESTACIÓN / '+(s.computer||'SIN IDENTIFICAR');
   const devices=Array.isArray(s.devices)?s.devices:[];
   const counts=new Map();for(const d of devices){let src=String(d.source||'Caché Windows');if(src.length>42)src=src.slice(0,42)+'…';counts.set(src,(counts.get(src)||0)+1)}
   const sources=$('proSources');sources.replaceChildren();
   if(!counts.size){sources.append(elt('div','pro-empty','Sin dispositivos observados. Ejecuta un diagnóstico para generar el gráfico.'))}
   else{
     const total=devices.length;const chart=elt('div','source-track');
     const colors=['var(--accent)','var(--accent2)','var(--violet)','var(--amber)','#92a2bd'];
     [...counts.entries()].sort((a,b)=>b[1]-a[1]).forEach(([key,value],i)=>{const color=colors[i%colors.length];const segment=elt('div','source-segment');segment.style.width=(value/total*100)+'%';segment.style.background=color;segment.title=key+': '+value;chart.append(segment)});
     sources.append(chart);
     [...counts.entries()].sort((a,b)=>b[1]-a[1]).forEach(([key,value],i)=>{const row=elt('div','source-row');const dot=elt('span','source-dot');dot.style.background=colors[i%colors.length];row.append(dot,elt('span','source-name',key),elt('strong','',`${value} / ${total}`));sources.append(row)});
   }
   const traffic=$('proTraffic');traffic.replaceChildren();const stats=Array.isArray(s.traffic)?s.traffic:[];
   if(!stats.length){traffic.append(elt('div','pro-empty','Sin contadores de tráfico en la captura actual.'))}
   else{
     const max=Math.max(1,...stats.flatMap(r=>[num(r.receivedBytes),num(r.sentBytes)]));
     stats.slice(0,8).forEach(r=>{
       const row=elt('div','traffic-bar-row');row.append(elt('div','bar-name',r.name||'Adaptador'));
       for(const [label,key,kind] of [['RX','receivedBytes','rx'],['TX','sentBytes','tx']]){
         const line=elt('div','bar-line');line.append(elt('span','bar-key',label));const track=elt('div','bar-track');const fill=elt('div','bar-fill '+kind);fill.style.width=(num(r[key])/max*100)+'%';track.append(fill);line.append(track,elt('span','bar-value',fmt(r[key])));row.append(line)
       }
       traffic.append(row)
     })
   }
 }
 window.NETWATCH_PRO={render};
})();
