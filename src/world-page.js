import { loadWorldData, mapColor, snapshot, valueAt } from "./world-data.js?v=10d4";

const fmt = (n, digits = 0) => Number.isFinite(n) ? new Intl.NumberFormat("es-ES", { maximumFractionDigits:digits }).format(n) : "No disponible";
const dateLabel = value => new Intl.DateTimeFormat("es-ES", { day:"2-digit", month:"2-digit", year:"numeric", timeZone:"UTC" }).format(new Date(`${value}T00:00:00Z`));
const escape = value => String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
const svgNS = "http://www.w3.org/2000/svg";
let chosen = { date:"2020-03-30", perMillion:false, focus:"ESP", compare:["Spain","Italy","France","US","China"], search:"" };

export function worldMarkup() {
  return `<header class="topbar"><span>OUTBREAK LAB <b>/</b> EXPANSIÓN MUNDIAL</span><span class="status-pill"><i></i> LABORATORIO EDUCATIVO</span></header>
  <section class="world-heading"><div class="eyebrow"><span></span> SERIE HISTÓRICA · 197 PAÍSES Y ENTIDADES</div><h1>Expansión mundial</h1><p>Explora cómo evolucionaron los casos confirmados de COVID-19 por países. Elige una fecha y un indicador, consulta países en el mapa y compara su recorrido histórico.</p></section>
  <section class="panel world-controls"><div class="world-control-date"><span class="control-caption">FECHA HISTÓRICA</span><div class="date-actions"><button class="secondary-button" data-world="start" aria-label="Ir a la primera fecha">|← Inicio</button><button class="secondary-button" data-world="prev" aria-label="Día anterior">←</button><input id="world-date" type="date" aria-label="Fecha histórica"><button class="secondary-button" data-world="next" aria-label="Día siguiente">→</button><button class="secondary-button" data-world="end" aria-label="Ir a la última fecha">Final →|</button></div><small>22/01/2020 — 09/03/2023</small></div><fieldset class="world-metric"><legend class="control-caption">INDICADOR</legend><label><input type="radio" name="world-metric" value="absolute" checked> Casos acumulados</label><label><input type="radio" name="world-metric" value="million"> Por millón de habitantes</label></fieldset></section>
  <div id="world-loading" class="panel world-loading">Preparando el mapa histórico local…</div>
  <section id="world-content" hidden>
    <div id="world-kpis" class="metric-grid world-kpis"></div>
    <div class="world-layout"><article class="panel world-map-panel"><div class="panel-head"><div><span class="eyebrow">MAPA HISTÓRICO</span><h2>Casos confirmados por país</h2></div><span id="world-date-heading" class="unit-chip"></span></div><p id="world-map-caption" class="caption"></p><div class="world-map-frame"><svg id="world-map" viewBox="0 0 960 500" role="img" aria-label="Mapa mundial histórico interactivo"><rect width="960" height="500" fill="#0b0f12"/><g id="world-map-content"></g></svg><div class="map-zoom"><button data-zoom="in" aria-label="Acercar">+</button><button data-zoom="out" aria-label="Alejar">−</button><button data-zoom="reset" aria-label="Restablecer vista">↺</button></div></div><div id="world-legend" class="world-legend"></div><p class="caption">Pulsa o toca un país para seleccionarlo. Arrastra para desplazarte y usa la rueda, los botones o el gesto de pellizcar para acercar.</p></article>
      <aside class="panel world-country-panel"><span class="eyebrow">PAÍS SELECCIONADO</span><label class="world-search-label" for="world-search">Buscar un país</label><div class="world-search-row"><input id="world-search" list="world-country-options" placeholder="Escribe un país…"><datalist id="world-country-options"></datalist><button id="world-search-button" class="primary-button">Ver</button></div><div id="world-country-detail"></div></aside></div>
    <section class="panel world-compare-panel"><div class="panel-head"><div><span class="eyebrow">EVOLUCIÓN HISTÓRICA</span><h2>Comparar países</h2></div><span class="unit-chip" id="world-chart-unit"></span></div><div class="world-search-row compare-search"><label class="sr-only" for="world-compare-search">Añadir un país a la comparación</label><input id="world-compare-search" list="world-country-options" placeholder="Añadir país a la comparación"><button id="world-add-compare" class="secondary-button">Añadir país</button></div><div id="world-comparison-chips" class="world-comparison-chips"></div><div id="world-comparison-chart"></div><p class="caption">Las diferencias describen registros comunicados; por sí solas no explican sus causas. Cobertura y notificación pueden variar entre países.</p></section>
    <section class="panel world-ranking"><div class="panel-head"><div><span class="eyebrow">FECHA SELECCIONADA</span><h2>Países con mayor valor</h2></div><span class="unit-chip">20 PRIMEROS</span></div><div id="world-ranking-table"></div></section>
    <details class="panel world-notes"><summary>Fuente, preparación y límites de interpretación</summary><div class="world-notes-content"><p>Los casos confirmados acumulados proceden de Johns Hopkins CSSE. Se suman los registros provinciales o territoriales por entidad y fecha, con las mismas cuatro exclusiones de la versión Python. El histórico termina el 9 de marzo de 2023; no son cifras actuales.</p><p>Casos por millón = casos acumulados ÷ población estimada de Natural Earth (2019) × 1.000.000. Sin población válida, la tasa queda como «No disponible» y el país se representa en gris. Cero casos observados se dibuja en azul.</p><p>La escala cromática usa ln(1+x)/ln(1+M), con paleta interpolada de azul a ámbar. Fronteras de Natural Earth, escala 1:110m, dominio público; la serie JHU se distribuye con atribución CC BY 4.0.</p><p>La serie depende de reportes históricos, puede contener revisiones retrospectivas y no armoniza la cobertura entre países. La población de 2019 es una estimación, no un denominador epidemiológico común. Algunos microestados no son distinguibles en esta escala, pero siguen disponibles en el buscador y el ranking.</p></div></details>
  </section>`;
}

function pathForGeometry(geometry) {
  const paths=[];
  const polygons=geometry.type==="Polygon"?[geometry.coordinates]:geometry.coordinates;
  for(const polygon of polygons) for(const ring of polygon){
    if(!ring.length)continue;
    const point=([lon,lat])=>`${((lon+180)/360*960).toFixed(2)} ${((90-lat)/180*500).toFixed(2)}`;
    paths.push(`M${point(ring[0])}${ring.slice(1).map(p=>`L${point(p)}`).join("")}Z`);
  }
  return paths.join("");
}

function createSvg(tag, attrs={}) { const item=document.createElementNS(svgNS,tag); for(const [key,value] of Object.entries(attrs))item.setAttribute(key,value); return item; }

function lineChart(container, series, unit, selectedDate) {
  if(!series.length){container.innerHTML='<div class="chart-empty">Añade países para comparar su evolución.</div>';return;}
  const W=900,H=320,p={l:72,r:18,t:18,b:48};
  const points=series.flatMap(s=>s.points.filter(v=>v.value!=null));
  if(!points.length){container.innerHTML='<div class="chart-empty">No hay valores calculables en esta unidad.</div>';return;}
  const max=Math.max(...points.map(v=>v.value),1),x=i=>p.l+i/(1142)*(W-p.l-p.r),y=v=>H-p.b-v/max*(H-p.t-p.b);
  const ticks=[0,.25,.5,.75,1];
  const grid=ticks.map(t=>`<line class="grid" x1="${p.l}" x2="${W-p.r}" y1="${y(t*max)}" y2="${y(t*max)}"/><text class="axis-label" x="${p.l-8}" y="${y(t*max)+4}" text-anchor="end">${escape(fmt(t*max,unit==="por millón"?0:0))}</text>`).join("");
  const lines=series.map(s=>{const valid=s.points.filter(v=>v.value!=null);const d=valid.map((v,i)=>`${i?"L":"M"}${x(i)},${y(v.value)}`).join(" ");return `<path class="world-series" stroke="${s.color}" d="${d}"/><circle cx="${x(0)}" cy="${y(valid[0]?.value||0)}" r="2.5" fill="${s.color}"/>`;}).join("");
  const selectedIndex=series[0].points.findIndex(v=>v.date===selectedDate);
  const cursor=selectedIndex>=0?`<line class="world-date-cursor" x1="${x(selectedIndex)}" x2="${x(selectedIndex)}" y1="${p.t}" y2="${H-p.b}"/>`:"";
  container.innerHTML=`<div class="chart-scroll"><svg class="world-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Comparación histórica en ${escape(unit)}">${grid}${cursor}${lines}<line class="axis" x1="${p.l}" x2="${W-p.r}" y1="${H-p.b}" y2="${H-p.b}"/><text class="axis-label" x="${p.l}" y="${H-15}">22/01/2020</text><text class="axis-label" x="${W-p.r}" y="${H-15}" text-anchor="end">09/03/2023</text></svg></div><div class="legend">${series.map(s=>`<span><i style="--series-color:${s.color}"></i>${escape(s.entity.name)}</span>`).join("")}</div>`;
}

export async function mountWorld(container) {
  const loading=container.querySelector("#world-loading"), content=container.querySelector("#world-content");
  try {
    const world=await loadWorldData();
    if(!container.isConnected || !content)return;
    if(!world.dates.includes(chosen.date))chosen.date="2020-03-30";
    const dateInput=container.querySelector("#world-date"), search=container.querySelector("#world-search"), compareInput=container.querySelector("#world-compare-search");
    const svg=container.querySelector("#world-map"), group=container.querySelector("#world-map-content");
    const entityByName=new Map(world.entities.flatMap((e,i)=>[[e.name.toLocaleLowerCase("es"),i],[e.sourceName.toLocaleLowerCase("es"),i]]));
    const entityBySource=new Map(world.entities.map((entity,index)=>[entity.sourceName,index]));
    const isoEntities=world.byIso;
    const colors=["#65b9ff","#bd9aff","#ffc36e","#52dfc0","#ff7d91","#9bc27c","#71d3d3","#e68bff"];
    const isoColor=new Map();
    let transform={scale:1,x:0,y:0}, pointers=new Map(), dragStart=null, pinchStart=null;
    const clampedTransform=()=>{transform.scale=Math.max(1,Math.min(8,transform.scale));const w=960*(transform.scale-1)/2;const h=500*(transform.scale-1)/2;transform.x=Math.max(-w,Math.min(w,transform.x));transform.y=Math.max(-h,Math.min(h,transform.y));group.setAttribute("transform",`translate(${transform.x} ${transform.y}) scale(${transform.scale})`);};
    const toMapPoint=(clientX,clientY)=>{const rect=svg.getBoundingClientRect();return{x:(clientX-rect.left)/rect.width*960,y:(clientY-rect.top)/rect.height*500};};
    const zoomAround=(x,y,factor)=>{const next=Math.max(1,Math.min(8,transform.scale*factor));const anchorX=(x-transform.x)/transform.scale,anchorY=(y-transform.y)/transform.scale;transform={scale:next,x:x-next*anchorX,y:y-next*anchorY};clampedTransform();};
    dateInput.min=world.dates[0];dateInput.max=world.dates.at(-1);dateInput.value=chosen.date;
    container.querySelector("#world-country-options").innerHTML=world.entities.map(e=>`<option value="${escape(e.name)}"></option>`).join("");
    if(!Number.isInteger(chosen.focus)||!world.entities[chosen.focus]) chosen.focus=entityByName.get("españa") ?? world.entities.findIndex(e=>e.sourceName==="Spain");
    chosen.compare=[...new Set(chosen.compare.filter(name=>entityBySource.has(name)))];
    if(!chosen.compare.length)chosen.compare=["Spain","Italy","France","US","China"];
    for(const feature of world.boundaries.features){
      const path=createSvg("path",{d:pathForGeometry(feature.geometry),class:"world-country",fill:"#1f262a","fill-rule":"evenodd","tabindex":"0",role:"button","data-iso":feature.properties.iso,"aria-label":feature.properties.name});
      const title=createSvg("title");path.append(title);
      path.addEventListener("click",()=>{const index=isoEntities.get(feature.properties.iso);if(index!==undefined){chosen.focus=index;update();}});
      path.addEventListener("keydown",event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();path.dispatchEvent(new Event("click"));}});
      group.append(path);
    }
    svg.addEventListener("wheel",event=>{event.preventDefault();const point=toMapPoint(event.clientX,event.clientY);zoomAround(point.x,point.y,event.deltaY<0?1.2:1/1.2);},{passive:false});
    svg.addEventListener("pointerdown",event=>{const point=toMapPoint(event.clientX,event.clientY);pointers.set(event.pointerId,point);svg.setPointerCapture(event.pointerId);if(pointers.size===1)dragStart={id:event.pointerId,point,tx:transform.x,ty:transform.y};if(pointers.size===2){const [a,b]=[...pointers.values()];const midpoint={x:(a.x+b.x)/2,y:(a.y+b.y)/2};pinchStart={distance:Math.hypot(a.x-b.x,a.y-b.y),scale:transform.scale,anchorX:(midpoint.x-transform.x)/transform.scale,anchorY:(midpoint.y-transform.y)/transform.scale};dragStart=null;}});
    svg.addEventListener("pointermove",event=>{if(!pointers.has(event.pointerId))return;pointers.set(event.pointerId,toMapPoint(event.clientX,event.clientY));if(pinchStart&&pointers.size>=2){const [a,b]=[...pointers.values()];const midpoint={x:(a.x+b.x)/2,y:(a.y+b.y)/2};transform.scale=pinchStart.scale*Math.hypot(a.x-b.x,a.y-b.y)/Math.max(1,pinchStart.distance);transform.x=midpoint.x-transform.scale*pinchStart.anchorX;transform.y=midpoint.y-transform.scale*pinchStart.anchorY;clampedTransform();}else if(dragStart){const current=pointers.get(dragStart.id);transform.x=dragStart.tx+current.x-dragStart.point.x;transform.y=dragStart.ty+current.y-dragStart.point.y;clampedTransform();}});
    const releasePointer=event=>{pointers.delete(event.pointerId);pinchStart=null;dragStart=null;if(pointers.size===1){const [id,point]=[...pointers.entries()][0];dragStart={id,point,tx:transform.x,ty:transform.y};}};
    svg.addEventListener("pointerup",releasePointer);svg.addEventListener("pointercancel",releasePointer);
    container.querySelectorAll("[data-zoom]").forEach(button=>button.addEventListener("click",()=>{const mode=button.dataset.zoom;if(mode==="reset"){transform={scale:1,x:0,y:0};clampedTransform();}else{const center={x:480,y:250};zoomAround(center.x,center.y,mode==="in"?1.45:1/1.45);}}));
    container.querySelectorAll("[data-world]").forEach(button=>button.addEventListener("click",()=>{const idx=world.dates.indexOf(chosen.date),action=button.dataset.world;chosen.date=world.dates[action==="start"?0:action==="end"?world.dates.length-1:Math.max(0,Math.min(world.dates.length-1,idx+(action==="prev"?-1:1)))];update();}));
    dateInput.addEventListener("change",()=>{if(world.dates.includes(dateInput.value)){chosen.date=dateInput.value;update();}});
    container.querySelectorAll('[name="world-metric"]').forEach(radio=>{radio.checked=(chosen.perMillion?"million":"absolute")===radio.value;radio.addEventListener("change",()=>{chosen.perMillion=radio.value==="million";update();});});
    const resolveName=value=>entityByName.get(value.trim().toLocaleLowerCase("es"));
    container.querySelector("#world-search-button").addEventListener("click",()=>{const index=resolveName(search.value);if(index===undefined){search.setCustomValidity("Elige un país de la lista.");search.reportValidity();return;}search.setCustomValidity("");chosen.focus=index;update();});
    search.addEventListener("keydown",event=>{if(event.key==="Enter"){event.preventDefault();container.querySelector("#world-search-button").click();}});
    container.querySelector("#world-add-compare").addEventListener("click",()=>{const index=resolveName(compareInput.value);if(index===undefined){compareInput.setCustomValidity("Elige un país de la lista.");compareInput.reportValidity();return;}compareInput.setCustomValidity("");const sourceName=world.entities[index].sourceName;if(!chosen.compare.includes(sourceName))chosen.compare.push(sourceName);compareInput.value="";update();});
    const update=()=>{
      dateInput.value=chosen.date;loading.hidden=true;content.hidden=false;
      const dateIndex=world.dates.indexOf(chosen.date),snap=snapshot(world,dateIndex,chosen.perMillion),unit=chosen.perMillion?"casos por millón de habitantes":"personas";
      container.querySelector("#world-date-heading").textContent=dateLabel(chosen.date);
      container.querySelector("#world-map-caption").textContent=chosen.perMillion?"Casos por millón de habitantes · denominador: población estimada de 2019.":"Casos confirmados acumulados comunicados por Johns Hopkins CSSE.";
      container.querySelectorAll("[data-iso]").forEach(path=>{const iso=path.dataset.iso,index=world.byIso.get(iso),value=index===undefined?null:valueAt(world,index,dateIndex,chosen.perMillion),cases=index===undefined?null:valueAt(world,index,dateIndex);path.setAttribute("fill",mapColor(value,snap.maximum));path.classList.toggle("selected-country",index===chosen.focus);const name=path.getAttribute("aria-label");path.querySelector("title").textContent=value===null?`${name} · Sin dato${chosen.perMillion?"; población no disponible":""}`:`${name} · ${dateLabel(chosen.date)} · ${fmt(value,chosen.perMillion?2:0)} ${unit} · ${fmt(cases)} casos acumulados`;});
      const top=snap.top;container.querySelector("#world-kpis").innerHTML=`<article class="metric-card"><span>FECHA CONSULTADA</span><strong>${dateLabel(chosen.date)}</strong><small>Histórico · 22/01/2020–09/03/2023</small></article><article class="metric-card"><span>PAÍSES CON VALOR</span><strong>${snap.withData}</strong><small>De 197 países y entidades de la serie</small></article><article class="metric-card accent-metric"><span>MAYOR VALOR · ${escape(top?.entity.name||"No disponible")}</span><strong>${fmt(top?.value,chosen.perMillion?2:0)}</strong><small>${unit}</small></article><article class="metric-card"><span>FUENTE</span><strong>JHU CSSE</strong><small>Serie histórica · fecha final 09/03/2023</small></article>`;
      container.querySelector("#world-legend").innerHTML=`<span class="legend-ramp-label">${chosen.perMillion?"Casos por millón de habitantes":"Casos acumulados · personas"}</span><div class="legend-ramp"><i></i><div><span>0</span><span>${fmt(Math.sqrt(1+snap.maximum)-1,chosen.perMillion?2:0)}<small> punto medio log.</small></span><span>${fmt(snap.maximum,chosen.perMillion?2:0)}</span></div></div><div class="legend-status"><span><i class="legend-zero"></i>${snap.maximum===0?"Todos los valores calculables son cero":"0 casos · azul"}</span><span><i class="legend-nodata"></i>${chosen.perMillion?"Sin población válida · gris":"Sin registro o polígono sin dato · gris"}</span></div>`;
      container.querySelector("#world-country-detail").innerHTML=detailMarkup(world,chosen.focus,dateIndex,chosen.perMillion);
      container.querySelector("#world-chart-unit").textContent=unit.toUpperCase();
      const compareIndices=chosen.compare.map(name=>entityBySource.get(name)).filter(i=>i!==undefined),compareSeries=compareIndices.map((index,colorIndex)=>({entity:world.entities[index],color:colors[colorIndex%colors.length],points:world.dates.map((date,day)=>({date,value:valueAt(world,index,day,chosen.perMillion)}))}));
      lineChart(container.querySelector("#world-comparison-chart"),compareSeries,chosen.perMillion?"por millón":"personas",chosen.date);
      container.querySelector("#world-comparison-chips").innerHTML=chosen.compare.map((sourceName,i)=>{const index=entityBySource.get(sourceName);return `<button class="world-chip" data-remove-country="${escape(sourceName)}" style="--series-color:${colors[i%colors.length]}">${escape(world.entities[index]?.name||sourceName)} <b aria-label="Quitar">×</b></button>`;}).join("");
      container.querySelectorAll("[data-remove-country]").forEach(button=>button.addEventListener("click",()=>{chosen.compare=chosen.compare.filter(item=>item!==button.dataset.removeCountry);update();}));
      const ranking=[...snap.values].sort((a,b)=>(b.value??-1)-(a.value??-1)).slice(0,20);
      container.querySelector("#world-ranking-table").innerHTML=`<div class="table-scroll"><table><thead><tr><th>#</th><th>País</th><th>Casos acumulados</th><th>${chosen.perMillion?"Casos por millón":"Valor del mapa"}</th></tr></thead><tbody>${ranking.map((item,index)=>`<tr><td>${index+1}</td><td>${escape(item.entity.name)}</td><td>${fmt(item.cases)}</td><td>${fmt(item.value,chosen.perMillion?2:0)}</td></tr>`).join("")}</tbody></table></div>`;
      container.querySelectorAll("[data-world]").forEach(button=>{const idx=world.dates.indexOf(chosen.date);button.disabled=(button.dataset.world==="prev"&&idx===0)||(button.dataset.world==="next"&&idx===world.dates.length-1)||(button.dataset.world==="start"&&idx===0)||(button.dataset.world==="end"&&idx===world.dates.length-1);});
    };
    update();
  } catch(error) {
    if(loading)loading.innerHTML=`<h2>No se pudo cargar el mapa histórico</h2><p>${escape(error.message)}</p><p>Comprueba que los archivos locales de <code>data/world/</code> estén disponibles y vuelve a abrir la página.</p>`;
  }
}

function detailMarkup(world,index,dateIndex,perMillion) {
  const e=world.entities[index],cases=valueAt(world,index,dateIndex),rate=valueAt(world,index,dateIndex,true),unit=perMillion?"casos por millón de habitantes":"personas";
  const history=world.dates.map((date,i)=>({date,value:valueAt(world,index,i,perMillion)})).filter(item=>item.value!==null);
  const max=Math.max(1,...history.map(item=>item.value)),W=420,H=150,p={l:48,r:10,t:10,b:30};
  const path=history.map((item,i)=>`${i?"L":"M"}${p.l+i/Math.max(1,history.length-1)*(W-p.l-p.r)},${H-p.b-item.value/max*(H-p.t-p.b)}`).join(" ");
  return `<h2>${escape(e.name)}</h2><p class="world-country-source">Nombre de la fuente: ${escape(e.sourceName)} · ${dateLabel(world.dates[dateIndex])}</p><div class="world-country-stats"><div><span>CASOS ACUMULADOS</span><b>${fmt(cases)}</b></div><div><span>CASOS POR MILLÓN</span><b>${fmt(rate,2)}</b></div></div>${perMillion&&rate===null?'<p class="world-missing-note">La población estimada no está disponible; no se calcula una tasa.</p>':''}<p class="caption">Fuente: Johns Hopkins CSSE. Valor del mapa: ${fmt(perMillion?rate:cases,perMillion?2:0)} ${unit}.</p><div class="world-selected-chart"><span class="control-caption">EVOLUCIÓN COMPLETA</span><div class="chart-scroll"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Evolución histórica de ${escape(e.name)}"><line class="grid" x1="${p.l}" x2="${W-p.r}" y1="${H-p.b}" y2="${H-p.b}"/><path class="world-series" stroke="#52dfc0" d="${path}"/><text class="axis-label" x="${p.l}" y="${H-8}">ENE 2020</text><text class="axis-label" x="${W-p.r}" y="${H-8}" text-anchor="end">MAR 2023</text></svg></div></div>`;
}
