'use strict';
/* NETWATCH 404 map: interfaces are visual groupings, NOT discovered physical links. */
(function(global){
 const NS='http://www.w3.org/2000/svg';
 const byId=id=>document.getElementById(id);
 const unique=x=>[...new Set(x)];
 const esc=v=>String(v??'');
 const make=(tag,attrs={},label)=>{const e=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,String(v));if(label!==undefined)e.textContent=esc(label);return e};
 function groups(devices){const buckets=new Map();for(const d of devices){const key=esc(d.interface||'Interfaz desconocida');if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(d)}return [...buckets].sort((a,b)=>a[0].localeCompare(b[0]));}
 function matches(d,q){return [d.ip,d.hostname,d.mac,d.interface,d.source,d.state].some(v=>esc(v).toLowerCase().includes(q.toLowerCase()));}
 function layout(devices){const g=groups(devices);let y=28;const nodes=[],frames=[];const cols=4,w=190,h=72,gap=18,left=32;
  for(const [name,ds] of g){const rows=Math.ceil(ds.length/cols),height=Math.max(116,64+rows*(h+gap));frames.push({name,count:ds.length,x:18,y,w:cols*(w+gap)+14,h:height});ds.forEach((d,i)=>nodes.push({device:d,x:left+(i%cols)*(w+gap),y:y+53+Math.floor(i/cols)*(h+gap),w,h}));y+=height+18;}
  return {nodes,frames,width:Math.max(900,cols*(w+gap)+54),height:Math.max(370,y+20)};
 }
 let state={devices:[],scale:1,x:0,y:0,fitW:900,fitH:500,drag:null,selected:null};
 function draw(){const host=byId('proNetworkMap');if(!host)return;host.replaceChildren();const map=layout(state.devices),svg=make('svg',{viewBox:`${state.x} ${state.y} ${state.fitW/state.scale} ${state.fitH/state.scale}`,role:'group','aria-label':'Dispositivos observados agrupados por interfaz'});state.svg=svg;
  for(const f of map.frames){svg.append(make('rect',{x:f.x,y:f.y,width:f.w,height:f.h,rx:15,class:'group-frame'}));svg.append(make('text',{x:f.x+16,y:f.y+29,class:'group-title'},`${f.name} · ${f.count}`));}
  const query=(byId('mapSearch')?.value||'').trim();
  for(const n of map.nodes){const d=n.device,group=make('g',{class:'map-node'+(query&&!matches(d,query)?' muted':'')+(query&&matches(d,query)?' match':''),tabindex:0,role:'button','aria-label':`Detalles de ${esc(d.ip)}, ${esc(d.interface)}`});group.append(make('rect',{x:n.x,y:n.y,width:n.w,height:n.h}));group.append(make('text',{x:n.x+12,y:n.y+26},esc(d.ip||'IP desconocida').slice(0,28)));group.append(make('text',{x:n.x+12,y:n.y+48,class:'sub'},esc(d.hostname||d.source||'Sin nombre DNS').slice(0,27)));
   const choose=()=>{state.selected=d;const detail=byId('mapDetail');detail.replaceChildren();const title=document.createElement('strong');title.textContent=d.ip||'Dispositivo';detail.append(title);for(const [k,v] of [['Nombre DNS',d.hostname],['MAC',d.mac],['Interfaz',d.interface],['Fuente',d.source],['Estado informado',d.state]]){const line=document.createElement('div');line.textContent=k+': '+(v||'No disponible');detail.append(line);}};
   group.addEventListener('click',choose);group.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();choose();}});svg.append(group);
  }
  host.append(svg);
  svg.addEventListener('wheel',e=>{e.preventDefault();zoom(e.deltaY<0?1.2:1/1.2,e.offsetX,e.offsetY)},{passive:false});
  svg.addEventListener('pointerdown',e=>{if(e.button!==0||e.target.closest('.map-node'))return;state.drag={px:e.clientX,py:e.clientY,x:state.x,y:state.y};svg.classList.add('dragging');svg.setPointerCapture(e.pointerId)});
  svg.addEventListener('pointermove',e=>{if(!state.drag)return;const bounds=svg.getBoundingClientRect();state.x=state.drag.x-(e.clientX-state.drag.px)/bounds.width*(state.fitW/state.scale);state.y=state.drag.y-(e.clientY-state.drag.py)/bounds.height*(state.fitH/state.scale);updateView()});
  svg.addEventListener('pointerup',()=>{state.drag=null;svg.classList.remove('dragging')});svg.addEventListener('pointercancel',()=>{state.drag=null;svg.classList.remove('dragging')});
 }
 function updateView(){if(state.svg)state.svg.setAttribute('viewBox',`${state.x} ${state.y} ${state.fitW/state.scale} ${state.fitH/state.scale}`)}
 function fit(){const l=layout(state.devices);state.scale=1;state.x=0;state.y=0;state.fitW=l.width;state.fitH=l.height;updateView();}
 function zoom(mult){const old=state.scale;state.scale=Math.max(.45,Math.min(4,old*mult));const ow=state.fitW/old,oh=state.fitH/old,nw=state.fitW/state.scale,nh=state.fitH/state.scale;state.x+=(ow-nw)/2;state.y+=(oh-nh)/2;updateView();}
 function render(devices){const current=Array.isArray(devices)?devices:[];state.devices=current;const sel=byId('mapInterface');if(!sel)return;const wanted=sel.value;const names=unique(current.map(d=>esc(d.interface||'Interfaz desconocida'))).sort();sel.replaceChildren();const any=document.createElement('option');any.value='';any.textContent='Todas las interfaces';sel.append(any);for(const n of names){const opt=document.createElement('option');opt.value=n;opt.textContent=n;sel.append(opt)}sel.value=names.includes(wanted)?wanted:'';updateFiltered();}
 function updateFiltered(){const list=Array.isArray(global.NetwatchMap.all)?global.NetwatchMap.all:state.devices;const chosen=byId('mapInterface').value;state.devices=list.filter(d=>!chosen||esc(d.interface||'Interfaz desconocida')===chosen);byId('mapCount').textContent=state.devices.length+' de '+list.length+' dispositivos';draw();fit();}
 let bound=false;
 function setup(){if(bound||!byId('mapInterface'))return;bound=true;byId('mapInterface').addEventListener('change',updateFiltered);byId('mapSearch').addEventListener('input',draw);byId('mapZoomIn').addEventListener('click',()=>zoom(1.25));byId('mapZoomOut').addEventListener('click',()=>zoom(.8));byId('mapReset').addEventListener('click',fit);}
 const api={all:[],render(devices){setup();api.all=Array.isArray(devices)?devices:[];render(api.all)},groups,layout,matches};global.NetwatchMap=api;
 if(typeof module!=='undefined'&&module.exports)module.exports={groups,layout,matches};
})(typeof window!=='undefined'?window:globalThis);
