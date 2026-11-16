import { loadCities, cityTrajectory, distributeCities, compareCityScenarios, cityValue, hypotheticalConnections } from "./world-cities.js?v=10d5";

const models = ["Lineal", "Cuadrático", "Exponencial"];
const colors = ["#52dfc0", "#8ca5ff", "#ffc36e", "#f28ca8", "#bd9aff", "#65b9ff", "#9bc27c", "#ff9e70", "#71d3d3", "#e68bff", "#d6d879", "#a6c4ff"];
const svgNS = "http://www.w3.org/2000/svg";
let geographyCache;
const ui = { modelA:"Cuadrático", origin:"Madrid", start:6, horizon:14, intensityA:40, activation:7, destinations:["Barcelona","Lisboa","París"], weights:{Barcelona:1,Lisboa:1,París:1}, focus:"Madrid", day:10, playing:false, compare:false, modelB:"Cuadrático", intensityB:60, interventionA:false, interventionADay:9, interventionAReduction:40, interventionB:false, interventionBDay:9, interventionBReduction:40, mapScenario:"A", zoom:1, panX:0, panY:0 };
let timer = null;
let timerTick = null;
let activeContainer = null;

const esc = value => String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
const fmt = (value, digits=2) => Number.isFinite(value) ? new Intl.NumberFormat("es-ES",{maximumFractionDigits:digits}).format(value) : "No disponible";
const dateFor = day => new Intl.DateTimeFormat("es-ES",{day:"2-digit",month:"2-digit",year:"numeric",timeZone:"UTC"}).format(new Date(Date.UTC(2020,2,1+day)));
const coord = city => `${(city.lon+180)/360*960},${(90-city.lat)/180*500}`;
const element = (tag, attrs={}) => { const node=document.createElementNS(svgNS,tag); for(const [name,value] of Object.entries(attrs))node.setAttribute(name,String(value)); return node; };

export function stopCityPlayback() {
  if (timer !== null) clearInterval(timer);
  timer = null; timerTick = null; ui.playing = false;
}

export function cityModeTabs(selected) {
  return `<nav class="world-mode-tabs" aria-label="Modo de expansión"><button data-world-mode="historical" class="${selected==="historical"?"active":""}">Casos históricos por países</button><button data-world-mode="cities" class="${selected==="cities"?"active":""}">Escenario hipotético por ciudades</button></nav>`;
}

export function cityMarkup() {
  const choices = models.map(name=>`<option>${name}</option>`).join("");
  return `<header class="topbar"><span>OUTBREAK LAB <b>/</b> SIMULADOR MUNDIAL POR CIUDADES</span><span class="status-pill"><i></i> LABORATORIO EDUCATIVO</span></header>
  <section class="world-heading"><div class="eyebrow"><span></span> ESCENARIO MATEMÁTICO HIPOTÉTICO</div><h1>Simulador de expansión por ciudades</h1><p>Crea un escenario matemático, elige dónde empieza y observa cómo se distribuye su evolución entre ciudades del mundo. Las conexiones muestran tu configuración, no rutas reales del virus.</p></section>
  <section class="panel city-controls-panel"><div class="panel-head"><div><span class="eyebrow">1 — CONFIGURA EL ESCENARIO</span><h2>Origen, destinos y función</h2></div><span class="unit-chip">HASTA EL DÍA 36</span></div>
    <div class="city-control-grid"><label class="control"><span>CIUDAD DE ORIGEN</span><select data-city-input="origin"></select></label><label class="control"><span>MODELO A</span><select data-city-input="modelA">${choices}</select></label><label class="control"><span>DÍA INICIAL</span><select data-city-input="start">${Array.from({length:36},(_,i)=>`<option value="${i}">Día ${i}</option>`).join("")}</select></label><label class="control"><span>HORIZONTE (DÍAS)</span><select data-city-input="horizon">${Array.from({length:36},(_,i)=>`<option value="${i+1}">${i+1} días</option>`).join("")}</select></label><label class="control"><span>INTENSIDAD A · <b data-show="intensityA"></b></span><input type="range" data-city-input="intensityA" min="0" max="100" step="5"></label><label class="control"><span>ACTIVACIÓN DE DESTINOS · DÍA <b data-show="activation"></b></span><input type="range" data-city-input="activation" min="0" max="36" step="1"></label></div>
    <section class="city-destination-section"><div><span class="eyebrow">2 — DESTINOS</span><p class="caption">Elige ciudades y ajusta sus pesos relativos. Un peso cero conserva la ciudad elegida, pero no dibuja ni recibe una conexión.</p></div><div id="city-destination-list" class="city-destination-list"></div></section>
    <details class="city-advanced"><summary>Intervención matemática opcional del escenario A</summary><div class="city-advanced-content"><label class="check-control"><input type="checkbox" data-city-input="interventionA"><span>Aplicar intervención hipotética en A</span></label><div class="city-control-grid"><label class="control"><span>DÍA DE INICIO</span><input type="range" data-city-input="interventionADay" min="0" max="36"><b data-show="interventionADay"></b></label><label class="control"><span>REDUCCIÓN HIPOTÉTICA</span><input type="range" data-city-input="interventionAReduction" min="0" max="90" step="5"><b data-show="interventionAReduction"></b>%</label></div></div></details>
    <label class="check-control city-compare-toggle"><input type="checkbox" data-city-input="compare"><span>Comparar con un segundo escenario (A/B)</span></label>
    <div id="city-b-controls" class="city-b-controls" hidden><div class="eyebrow">ESCENARIO B · MISMOS ORIGEN, DESTINOS Y PESOS</div><div class="city-control-grid"><label class="control"><span>MODELO B</span><select data-city-input="modelB">${choices}</select></label><label class="control"><span>INTENSIDAD B · <b data-show="intensityB"></b></span><input type="range" data-city-input="intensityB" min="0" max="100" step="5"></label><label class="check-control"><input type="checkbox" data-city-input="interventionB"><span>Aplicar intervención hipotética en B</span></label><label class="control"><span>DÍA DE INICIO</span><input type="range" data-city-input="interventionBDay" min="0" max="36"><b data-show="interventionBDay"></b></label><label class="control"><span>REDUCCIÓN HIPOTÉTICA</span><input type="range" data-city-input="interventionBReduction" min="0" max="90" step="5"><b data-show="interventionBReduction"></b>%</label></div><p class="caption city-ab-note">Se comparten origen, destinos, pesos, día inicial, horizonte y activación. Se comparan modelo, intensidad y, si la activas, la intervención. En el gráfico, A es turquesa y B ámbar; el selector del mapa elige cuál distribución muestra.</p><p class="caption">Si cambias de modelo, las funciones pueden tener valores iniciales distintos por sus coeficientes oficiales; no se fuerzan a coincidir.</p></div>
    <button class="secondary-button city-transfer-button" data-action="city-to-whatif">Abrir ¿Y si…? con el escenario mostrado</button>
  </section>
  <section class="city-timeline-panel panel"><div class="panel-head"><div><span class="eyebrow">3 — RECORRE EL TIEMPO</span><h2>Día <span id="city-current-day"></span> · <span id="city-current-date"></span></h2></div><span id="city-activation-state" class="unit-chip"></span></div><div class="city-timeline-controls"><button class="secondary-button" data-city-action="start">|← Inicio</button><button class="secondary-button" data-city-action="previous">← Día anterior</button><label class="control city-day-slider"><span>SELECCIONA UN DÍA</span><input type="range" data-city-input="day" min="0" max="36" step="1"></label><button class="secondary-button" data-city-action="next">Día siguiente →</button><button class="primary-button" data-city-action="play">▶ Reproducir</button><button class="secondary-button" data-city-action="end">Final →|</button></div></section>
  <div id="city-warning" class="notice strong-notice" hidden></div><section class="city-kpis metric-grid" id="city-kpis"></section>
  <div class="city-map-layout"><article class="panel city-map-panel"><div class="panel-head"><div><span class="eyebrow">4 — EXPLORA EL MAPA</span><h2>Conexiones matemáticas hipotéticas</h2></div><label class="control city-map-select"><span>ESCENARIO MOSTRADO</span><select data-city-input="mapScenario"><option value="A">Escenario A</option><option value="B">Escenario B</option></select></label></div><p class="caption">Las líneas aparecen desde la activación y representan destinos seleccionados, no rutas reales. Origen ámbar y destinos turquesa identifican tipos de punto; el selector elige los valores de A o B que se dibujan. En la curva, A es turquesa y B ámbar.</p><div class="city-map-legend"><span><i class="city-legend-origin"></i>Origen</span><span><i class="city-legend-destination"></i>Destinos</span><span><i class="city-legend-line"></i>Conexión hipotética · no es una ruta real</span><span>Tamaño del círculo: valor absoluto relativo a escala A/B compartida</span></div><div class="city-map-frame"><svg id="city-map" viewBox="0 0 960 500" role="img" aria-label="Mapa de escenario hipotético por ciudades"><rect width="960" height="500" fill="#0b0f12"/><g id="city-map-world"></g><g id="city-map-content"></g></svg><div class="map-zoom"><button data-city-zoom="in" aria-label="Acercar">+</button><button data-city-zoom="out" aria-label="Alejar">−</button><button data-city-zoom="reset" aria-label="Restablecer vista">↺</button></div></div><p class="caption">Selecciona o toca un punto para consultar la ciudad. Arrastra para desplazar y usa el zoom. La vista mundial es única y no repite continentes.</p></article><aside class="panel city-detail-panel"><span class="eyebrow">CIUDAD SELECCIONADA</span><label class="control"><span>CONSULTAR CIUDAD</span><select data-city-input="focus"></select></label><div id="city-detail"></div></aside></div>
  <section class="panel city-chart-panel"><div class="panel-head"><div><span class="eyebrow">EVOLUCIÓN DEL ESCENARIO</span><h2>Trayectoria de la ciudad seleccionada</h2></div><span class="unit-chip">UNIDADES HIPOTÉTICAS</span></div><div id="city-chart"></div></section>
  <section class="city-final-section" id="city-final-results"></section>
  <section class="panel city-table-panel"><div class="panel-head"><div><span class="eyebrow">DÍA SELECCIONADO</span><h2>Distribución y comprobación de totales</h2></div><span id="city-conservation-badge" class="unit-chip"></span></div><div id="city-table"></div><p class="caption">A cada día, la suma de los valores asignados a las ciudades debe igualar el valor de su función. Los cálculos usan precisión completa; la tabla solo redondea para mostrarlos.</p></section>
  <details class="panel city-method-notes"><summary>Supuestos, fórmula y límites del simulador</summary><div class="world-notes-content"><p><b>Solo el escenario:</b> las ciudades, puntos y conexiones no registran contagios reales, movilidad ni rutas de transmisión. La selección del origen no afirma que ese lugar fuera el origen real de la pandemia.</p><p>La función oficial produce un total <b>T(t)</b>. Se calcula el incremento <b>ΔT(t)=T(t)−T(t−1)</b>. Tras la activación, con intensidad <b>p</b> y pesos <b>wⱼ</b>, el origen recibe <b>(1−p/100)ΔT(t)</b> y cada destino <b>(p/100)ΔT(t)wⱼ/Σw</b>. El incremento inicial del horizonte queda en el origen. La suma diaria de reparto equivale al incremento y el total acumulado por ciudades equivale a la función.</p><p>Los modelos lineal y cuadrático pueden producir valores o incrementos negativos en parte del intervalo. Se conservan, se muestran con signo y se advierten; no se convierten a cero. La intervención aplica la regla del Laboratorio ¿Y si…? al mismo modelo oficial y no mide eficacia sanitaria.</p><p>Coordenadas Natural Earth de 12 ciudades. Escala mundial equirectangular con polígonos locales, sin tiles ni APIs comerciales. Horizonte permitido: días 0–36. A/B comparte origen, fechas, destinos y pesos; modelo, intensidad e intervención pueden variar. Diferencia = B−A; cambio porcentual = (B−A)/|A| × 100, no definido si A=0.</p></div></details>`;
}

export function applyCityScenarioFromWhatIf({ model, day, endDay, reduction }) {
  if (!models.includes(model) || !Number.isInteger(day) || !Number.isInteger(endDay) || day < 0 || day >= endDay || endDay > 36 || !Number.isFinite(reduction) || reduction < 0 || reduction > 90) {
    throw new RangeError("El escenario recibido debe usar un modelo y un intervalo válido entre los días 0 y 36.");
  }
  ui.modelA = model;
  ui.start = day;
  ui.horizon = endDay - day;
  ui.activation = day;
  ui.day = day;
  ui.interventionA = true;
  ui.interventionADay = day;
  ui.interventionAReduction = reduction;
  ui.mapScenario = "A";
  ui.focus = ui.origin;
}

export function cityScenarioForWhatIf() {
  const useB = ui.compare && ui.mapScenario === "B";
  return {
    model: useB ? ui.modelB : ui.modelA,
    day: ui.start,
    endDay: ui.start + ui.horizon,
    reduction: useB
      ? (ui.interventionB ? ui.interventionBReduction : 0)
      : (ui.interventionA ? ui.interventionAReduction : 0),
  };
}

function geometryPath(geometry) {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  return polygons.flatMap(polygon => polygon.map(ring => ring.length ? `M${coord({lon:ring[0][0],lat:ring[0][1]})}${ring.slice(1).map(point=>`L${(point[0]+180)/360*960},${(90-point[1])/180*500}`).join("")}Z` : "")).join("");
}

function modelValues(model, intervention, start, end) {
  return cityTrajectory(model,start,end,intervention?{day:intervention.day,reduction:intervention.reduction}:null);
}

export async function mountCities(container, onNavigateAway = ()=>{}) {
  activeContainer = container;
  const map = container.querySelector("#city-map"), worldGroup = container.querySelector("#city-map-world"), content = container.querySelector("#city-map-content");
  try {
    if(!geographyCache) geographyCache=Promise.all([loadCities(),fetch("./data/world/world-boundaries.geojson").then(async response=>{if(!response.ok)throw new Error(`No se pudieron cargar los límites geográficos locales (${response.status}).`);return response.json();})]).catch(error=>{geographyCache=undefined;throw error;});
    const [cities,boundaries]=await geographyCache;
    if(!container.isConnected) return;
    const byCity=new Map(cities.map(city=>[city.city,city]));
    const defs=element("defs");
    worldGroup.append(defs);
    for(const feature of boundaries.features){if(!feature.geometry)continue;const path=element("path",{d:geometryPath(feature.geometry),class:"city-country-shape"});worldGroup.append(path);}
    const citySelect=container.querySelector('[data-city-input="origin"]');
    citySelect.innerHTML=cities.map(city=>`<option>${esc(city.city)}</option>`).join("");
    const focusSelect=container.querySelector('[data-city-input="focus"]');
    container.querySelectorAll('[data-city-input="modelA"],[data-city-input="modelB"]').forEach(select=>select.value=ui[select.dataset.cityInput]);
    let transform={scale:1,x:0,y:0}, pointers=new Map(), drag=null;
    const applyTransform=()=>{const maxX=960*(transform.scale-1)/2,maxY=500*(transform.scale-1)/2;transform.x=Math.max(-maxX,Math.min(maxX,transform.x));transform.y=Math.max(-maxY,Math.min(maxY,transform.y));worldGroup.setAttribute("transform",`translate(${transform.x} ${transform.y}) scale(${transform.scale})`);content.setAttribute("transform",`translate(${transform.x} ${transform.y}) scale(${transform.scale})`);};
    const setZoom=(factor)=>{transform.scale=Math.max(1,Math.min(8,transform.scale*factor));applyTransform();};
    container.querySelectorAll("[data-city-zoom]").forEach(button=>button.addEventListener("click",()=>button.dataset.cityZoom==="reset"?(transform={scale:1,x:0,y:0},applyTransform()):setZoom(button.dataset.cityZoom==="in"?1.35:1/1.35)));
    map.addEventListener("pointerdown",event=>{if(event.target.closest("[data-city]")||event.target.closest(".map-zoom"))return;drag={x:event.clientX,y:event.clientY,tx:transform.x,ty:transform.y};map.setPointerCapture(event.pointerId);});
    map.addEventListener("pointermove",event=>{if(!drag)return;const rect=map.getBoundingClientRect();transform.x=drag.tx+(event.clientX-drag.x)/rect.width*960;transform.y=drag.ty+(event.clientY-drag.y)/rect.height*500;applyTransform();});
    map.addEventListener("pointerup",()=>{drag=null;});

    const renderDestinationInputs=()=>{
      container.querySelector("#city-destination-list").innerHTML=cities.filter(city=>city.city!==ui.origin).map(city=>`<div class="city-destination-row"><label><input type="checkbox" data-destination="${esc(city.city)}" ${ui.destinations.includes(city.city)?"checked":""}><span>${esc(city.city)} <small>${esc(city.country)}</small></span></label><label class="city-weight"><span>PESO</span><input type="number" min="0" max="100" step="0.1" value="${Number(ui.weights[city.city]??1)}" data-city-weight="${esc(city.city)}" aria-label="Peso relativo de ${esc(city.city)}" ${ui.destinations.includes(city.city)?"":"disabled"}></label></div>`).join("");
      container.querySelectorAll("[data-destination]").forEach(input=>input.addEventListener("change",()=>{ui.destinations=input.checked?[...ui.destinations,input.dataset.destination]:ui.destinations.filter(name=>name!==input.dataset.destination);if(!ui.destinations.includes(ui.focus))ui.focus=ui.origin;renderDestinationInputs();update();}));
      container.querySelectorAll("[data-city-weight]").forEach(input=>input.addEventListener("change",()=>{const value=Number(input.value);if(!Number.isFinite(value)||value<0||value>100){input.setCustomValidity("El peso debe estar entre 0 y 100.");input.reportValidity();input.value=String(ui.weights[input.dataset.cityWeight]??1);return;}input.setCustomValidity("");ui.weights[input.dataset.cityWeight]=value;update();}));
    };
    renderDestinationInputs();
    const clampState=()=>{ui.start=Math.min(35,Math.max(0,Number(ui.start)));ui.horizon=Math.max(1,Math.min(36-ui.start,Number(ui.horizon)));const end=ui.start+ui.horizon;ui.activation=Math.min(end,Math.max(ui.start,Number(ui.activation)));ui.day=Math.min(end,Math.max(ui.start,Number(ui.day)));ui.interventionADay=Math.min(end,Math.max(ui.start,Number(ui.interventionADay)));ui.interventionBDay=Math.min(end,Math.max(ui.start,Number(ui.interventionBDay)));};
    const allocate=(scenario)=>{const intervention=scenario==="A"?(ui.interventionA?{day:ui.interventionADay,reduction:ui.interventionAReduction}:null):(ui.interventionB?{day:ui.interventionBDay,reduction:ui.interventionBReduction}:null);const model=scenario==="A"?ui.modelA:ui.modelB;const {days,totals}=modelValues(model,intervention,ui.start,ui.start+ui.horizon);const weights=Object.fromEntries(ui.destinations.map(name=>[name,Number(ui.weights[name]??1)]));return{model,days,totals,allocation:distributeCities(days,totals,ui.origin,weights,scenario==="A"?ui.intensityA:ui.intensityB,ui.activation),intervention};};
    const update=()=>{
      clampState();
      const a=allocate("A"),b=ui.compare?allocate("B"):null;
      if(!byCity.has(ui.focus))ui.focus=ui.origin;
      const shown=ui.mapScenario==="B"&&b?b:a;
      const dayValues=(allocation,day)=>allocation.cities.map((city,index)=>({city,value:allocation.values[allocation.days.indexOf(day)][index]}));
      const aNow=dayValues(a.allocation,ui.day),bNow=b?dayValues(b.allocation,ui.day):null;
      const selectedA=cityValue(a.allocation,ui.day,ui.focus),selectedB=b?cityValue(b.allocation,ui.day,ui.focus):null;
      const totalA=a.totals[a.days.indexOf(ui.day)],totalB=b?.totals[b.days.indexOf(ui.day)];
      const finalA=cityValue(a.allocation,a.days.at(-1),ui.focus),finalB=b?cityValue(b.allocation,b.days.at(-1),ui.focus):null;
      const sharedMax=Math.max(1,...aNow.map(item=>Math.abs(item.value)),...(bNow||[]).map(item=>Math.abs(item.value)));
      ui.destinations.forEach((name,index)=>{const input=container.querySelector(`[data-city-weight="${CSS.escape(name)}"]`);if(input&&document.activeElement!==input)input.value=String(ui.weights[name]??1);});
      container.querySelectorAll("[data-city-input]").forEach(input=>{const key=input.dataset.cityInput;if(key in ui){if(input.type==="checkbox")input.checked=Boolean(ui[key]);else if(document.activeElement!==input)input.value=String(ui[key]);}});
      container.querySelectorAll("[data-show]").forEach(node=>node.textContent=String(ui[node.dataset.show]));
      citySelect.value=ui.origin;focusSelect.innerHTML=[ui.origin,...ui.destinations].filter((name,index,list)=>list.indexOf(name)===index).map(name=>`<option>${esc(name)}</option>`).join("");focusSelect.value=ui.focus;
      const maxDay=ui.start+ui.horizon, daySlider=container.querySelector('[data-city-input="day"]');daySlider.min=String(ui.start);daySlider.max=String(maxDay);daySlider.value=String(ui.day);
      container.querySelector('[data-city-input="start"]').value=String(ui.start);const horizonSelect=container.querySelector('[data-city-input="horizon"]');if(horizonSelect.options.length!==36-ui.start){horizonSelect.innerHTML=Array.from({length:36-ui.start},(_,index)=>`<option value="${index+1}">${index+1} días</option>`).join("");}horizonSelect.value=String(ui.horizon);
      const activationInput=container.querySelector('[data-city-input="activation"]');activationInput.min=String(ui.start);activationInput.max=String(maxDay);
      ["interventionADay","interventionBDay"].forEach(key=>{const input=container.querySelector(`[data-city-input="${key}"]`);input.min=String(ui.start);input.max=String(maxDay);});
      container.querySelector("#city-b-controls").hidden=!ui.compare;
      container.querySelector('[data-city-input="mapScenario"]').value=ui.mapScenario==="B"&&!b?"A":ui.mapScenario;
      container.querySelector('[data-city-action="previous"]').disabled=ui.day<=ui.start;container.querySelector('[data-city-action="next"]').disabled=ui.day>=maxDay;
      container.querySelector('[data-city-action="play"]').textContent=ui.playing?"⏸ Pausar":"▶ Reproducir";
      container.querySelector("#city-current-day").textContent=ui.day;container.querySelector("#city-current-date").textContent=dateFor(ui.day);
      container.querySelector("#city-activation-state").textContent=ui.day<ui.activation?`Destinos se activan · día ${ui.activation}`:`Conexiones activas · desde día ${ui.activation}`;
      const sums=[...a.allocation.checks,...(b?b.allocation.checks:[])];const maxError=Math.max(...sums.map(check=>Math.abs(check.assigned-check.expected)));
      container.querySelector("#city-conservation-badge").textContent=maxError<=1e-7?`Conservación A${b?" / B":""} · verificada`:`Aviso de conservación · error ${fmt(maxError,8)}`;
      const warn=[];for(const [label,result] of [["A",a],["B",b]].filter(([,value])=>value)){if(result.totals.some(value=>value<0))warn.push(`El modelo ${label} produce valores negativos; se conservan sin recortarlos.`);if(result.totals.slice(1).some((value,index)=>value<result.totals[index]))warn.push(`El modelo ${label} presenta incrementos descendentes; se conservan con su signo.`);}
      const warning=container.querySelector("#city-warning");warning.hidden=!warn.length;warning.textContent=warn.join(" ");
      const finalComparison=b?compareCityScenarios(finalA,finalB):null, dayComparison=b?compareCityScenarios(selectedA,selectedB):null, totalComparison=b?compareCityScenarios(totalA,totalB):null;
      container.querySelector("#city-kpis").innerHTML=`<article class="metric-card"><span>FUNCIÓN A · DÍA ${ui.day}</span><strong>${fmt(totalA)}</strong><small>${a.model} · valor matemático</small></article>${b?`<article class="metric-card"><span>FUNCIÓN B · DÍA ${ui.day}</span><strong>${fmt(totalB)}</strong><small>${b.model} · valor matemático</small></article><article class="metric-card accent-metric"><span>DIFERENCIA DE TOTALES · B − A</span><strong>${totalComparison?`${totalComparison.difference>0?"+":""}${fmt(totalComparison.difference)}`:"—"}</strong><small>día ${ui.day} · unidades matemáticas</small></article>`:`<article class="metric-card"><span>${esc(ui.focus)} · VALOR A</span><strong>${fmt(selectedA)}</strong><small>unidades matemáticas hipotéticas</small></article><article class="metric-card"><span>TOTAL ASIGNADO A</span><strong>${fmt(aNow.reduce((sum,item)=>sum+item.value,0))}</strong><small>comprobación en el día seleccionado</small></article>`}<article class="metric-card"><span>HORIZONTE</span><strong>${dateFor(maxDay)}</strong><small>día ${maxDay} · ${ui.horizon} días desde inicio</small></article>`;
      const connections=hypotheticalConnections(cities,ui.origin,Object.fromEntries(ui.destinations.map(name=>[name,Number(ui.weights[name]??1)])),ui.day,ui.start,ui.activation);
      content.replaceChildren();
      for(const connection of connections){const [x1,y1]=coord(connection.source).split(",").map(Number),[x2,y2]=coord(connection.target).split(",").map(Number);content.append(element("line",{x1,y1,x2,y2,class:"city-hypothetical-link","stroke-width":Math.max(1,Math.sqrt(connection.weight))}));}
      const shownValues=dayValues(shown.allocation,ui.day);
      shownValues.forEach((item,index)=>{const city=byCity.get(item.city);if(!city)return;const [x,y]=coord(city).split(",").map(Number),radius=5+10*Math.sqrt(Math.abs(item.value)/sharedMax),group=element("g",{class:`city-node ${item.city===ui.origin?"origin":"destination"}`,tabindex:"0",role:"button","data-city":item.city,"aria-label":`${item.city} · ${fmt(item.value)} unidades hipotéticas`}),circle=element("circle",{cx:x,cy:y,r:radius});const title=element("title");title.textContent=`${item.city} · ${city.country} · ${fmt(item.value)} unidades hipotéticas · ${ui.mapScenario}`;group.append(circle,title);const text=element("text",{x:x+radius+3,y:y+3});text.textContent=item.city;group.append(text);group.addEventListener("click",()=>{ui.focus=item.city;update();});group.addEventListener("keydown",event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();ui.focus=item.city;update();}});content.append(group);});
      applyTransform();
      container.querySelector("#city-detail").innerHTML=`<h2>${esc(ui.focus)}</h2><p class="world-country-source">${esc(byCity.get(ui.focus)?.country||"")} · ${dateFor(ui.day)} · Escenario A${b?" y B":""}</p><div class="city-detail-value"><span>VALOR A</span><b>${fmt(selectedA)}</b></div>${b?`<div class="city-detail-value"><span>VALOR B</span><b>${fmt(selectedB)}</b></div><p class="caption">B − A: ${dayComparison.difference>0?"+":""}${fmt(dayComparison.difference)} · ${dayComparison.differencePercent===null?"porcentaje no definido":`${fmt(dayComparison.differencePercent)} %`}</p>`:""}<p class="caption">Valor asignado por la regla matemática del escenario. No son casos observados.</p>`;
      renderCityChart(container.querySelector("#city-chart"),ui,a,b);
      const endDay=a.days.at(-1), totalFinalComparison=b?compareCityScenarios(a.totals.at(-1),b.totals.at(-1)):null;
      container.querySelector("#city-final-results").innerHTML=b?`<section class="panel city-final-panel"><div class="panel-head"><div><span class="eyebrow">RESULTADO FINAL · DÍA ${endDay} · ${dateFor(endDay)}</span><h2>${esc(ui.focus)} · distribución matemática hipotética</h2></div><span class="unit-chip">B − A</span></div><div class="metric-grid city-final-kpis"><article class="metric-card"><span>VALOR FINAL A · ${esc(a.model)}</span><strong>${fmt(finalA)}</strong><small>${esc(ui.focus)} · unidades hipotéticas</small></article><article class="metric-card"><span>VALOR FINAL B · ${esc(b.model)}</span><strong>${fmt(finalB)}</strong><small>${esc(ui.focus)} · unidades hipotéticas</small></article><article class="metric-card accent-metric"><span>DIFERENCIA ABSOLUTA</span><strong>${finalComparison.difference>0?"+":""}${fmt(finalComparison.difference)}</strong><small>valor B menos valor A</small></article><article class="metric-card"><span>DIFERENCIA PORCENTUAL</span><strong>${finalComparison.differencePercent===null?"No definida":`${finalComparison.differencePercent>0?"+":""}${fmt(finalComparison.differencePercent)} %`}</strong><small>referida a |A| · no definida si A = 0</small></article></div><p class="caption">Totales de función al final: A ${fmt(a.totals.at(-1))} · B ${fmt(b.totals.at(-1))} · diferencia total ${totalFinalComparison.difference>0?"+":""}${fmt(totalFinalComparison.difference)}. La diferencia matemática no equivale a infecciones evitadas o causadas.</p></section>`:"";
      const rows=aNow.map(item=>{const other=bNow?.find(value=>value.city===item.city)?.value;return[item.city,item.city===ui.origin?"Origen":"Destino",fmt(item.value),...(b?[fmt(other),`${other-item.value>0?"+":""}${fmt(other-item.value)}`]:[])];});
      const errorA=a.allocation.checks[a.allocation.days.indexOf(ui.day)],errorB=b?.allocation.checks[b.allocation.days.indexOf(ui.day)];
      const headers=["Ciudad","Tipo","Valor A",...(b?["Valor B","B − A"]:[])];
      container.querySelector("#city-table").innerHTML=`<div class="table-scroll"><table><thead><tr>${headers.map(item=>`<th>${item}</th>`).join("")}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(item=>`<td>${item}</td>`).join("")}</tr>`).join("")}<tr class="city-total-row"><td colspan="2">Total de la función · conservación verificada</td><td>${fmt(errorA.expected)}</td>${b?`<td>${fmt(errorB.expected)}</td><td>${fmt(errorB.expected-errorA.expected)}</td>`:""}</tr></tbody></table></div>`;
      if(b&&ui.mapScenario==="B")container.querySelector("#city-activation-state").textContent+=` · B−A final en ${ui.focus}: ${finalComparison.difference>0?"+":""}${fmt(finalComparison.difference)}`;
    };
    const inputHandler=event=>{const input=event.target.closest("[data-city-input]");if(!input)return;const key=input.dataset.cityInput,previousValue=ui[key];if(ui.playing&&key!=="mapScenario"&&key!=="focus")stopCityPlayback();if(input.type==="checkbox")ui[key]=input.checked;else if(["day","start","horizon","intensityA","activation","interventionADay","interventionAReduction","intensityB","interventionBDay","interventionBReduction"].includes(key))ui[key]=Number(input.value);else ui[key]=input.value;if(key==="origin"){ui.destinations=ui.destinations.filter(name=>name!==ui.origin);if(ui.focus===previousValue)ui.focus=ui.origin;renderDestinationInputs();}if(key==="start"){ui.day=Math.max(ui.day,ui.start);ui.activation=Math.max(ui.activation,ui.start);}if(key==="horizon"){ui.day=Math.min(ui.day,ui.start+ui.horizon);ui.activation=Math.min(ui.activation,ui.start+ui.horizon);}if(key==="day")ui.day=Number(input.value);update();};
    container.addEventListener("input",event=>{if(event.target.type==="range")inputHandler(event);});container.addEventListener("change",event=>{if(event.target.type!=="range")inputHandler(event);});
    container.querySelectorAll("[data-city-action]").forEach(button=>button.addEventListener("click",()=>{const action=button.dataset.cityAction,max=ui.start+ui.horizon;if(action==="start"||action==="end"||action==="previous"||action==="next"){if(ui.playing)stopCityPlayback();if(action==="start")ui.day=ui.start;else if(action==="end")ui.day=max;else if(action==="previous")ui.day=Math.max(ui.start,ui.day-1);else ui.day=Math.min(max,ui.day+1);}else if(ui.playing)stopCityPlayback();else{if(ui.day>=max)ui.day=ui.start;ui.playing=true;timerTick=()=>{if(!activeContainer?.isConnected||ui.day>=ui.start+ui.horizon){stopCityPlayback();if(activeContainer?.isConnected)update();return;}ui.day+=1;update();};timer=setInterval(()=>timerTick?.(),900);}update();}));
    update();
  } catch(error) { if(container.isConnected){const panel=container.querySelector("#city-warning");panel.hidden=false;panel.textContent=`No se pudo preparar el simulador: ${error.message}`;} }
}

function renderCityChart(target,state,a,b) {
  const W=860,H=280,p={l:66,r:18,t:25,b:42},days=a.days;
  const selected=state.focus, ai=a.allocation.cities.indexOf(selected),bi=b?.allocation.cities.indexOf(selected);
  const values=[...a.allocation.values.map(row=>row[ai]),...(b?b.allocation.values.map(row=>row[bi]):[])];
  const min=Math.min(0,...values),max=Math.max(1,...values),yMin=min<0?min:0,yMax=max===yMin?yMin+1:max*1.06;
  const x=day=>p.l+(day-days[0])/Math.max(1,days.at(-1)-days[0])*(W-p.l-p.r),y=value=>H-p.b-(value-yMin)/(yMax-yMin)*(H-p.t-p.b);
  const grid=Array.from({length:5},(_,i)=>{const value=yMin+(yMax-yMin)*i/4,yy=y(value);return`<line class="grid" x1="${p.l}" x2="${W-p.r}" y1="${yy}" y2="${yy}"/><text class="axis-label" x="${p.l-8}" y="${yy+4}" text-anchor="end">${fmt(value,0)}</text>`;}).join("");
  const path=(scenario,col,dash="")=>{const allocation=scenario.allocation,index=allocation.cities.indexOf(selected),d=allocation.days.map((day,row)=>`${row?"L":"M"}${x(day)},${y(allocation.values[row][index])}`).join(" ");return`<path d="${d}" fill="none" stroke="${col}" stroke-width="2.5" ${dash?`stroke-dasharray="${dash}"`:""}/>`;};
  const marker=x(state.activation);const selectedA=cityValue(a.allocation,state.day,selected),selectedB=b?cityValue(b.allocation,state.day,selected):null;
  target.innerHTML=`<div class="chart-wrap"><div class="chart-title">${esc(selected)} · día actual ${state.day} · valores matemáticos hipotéticos</div><div class="chart-scroll"><svg class="city-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Comparación temporal de ${esc(selected)}"><rect x="${marker}" y="${p.t}" width="${Math.max(0,W-p.r-marker)}" height="${H-p.t-p.b}" fill="#153b36" opacity=".12"/>${grid}<line class="axis" x1="${p.l}" x2="${W-p.r}" y1="${H-p.b}" y2="${H-p.b}"/><line class="city-activation-marker" x1="${marker}" x2="${marker}" y1="${p.t}" y2="${H-p.b}"/><text class="split-label" x="${Math.min(marker+4,W-130)}" y="${p.t+12}">ACTIVACIÓN · DÍA ${state.activation}</text>${path(a,"#52dfc0")}${b?path(b,"#ffc36e","6 4"):""}<line class="city-current-marker" x1="${x(state.day)}" x2="${x(state.day)}" y1="${p.t}" y2="${H-p.b}"/><circle cx="${x(state.day)}" cy="${y(selectedA)}" r="4" fill="#52dfc0"><title>A · ${fmt(selectedA)}</title></circle>${b?`<circle cx="${x(state.day)}" cy="${y(selectedB)}" r="4" fill="#ffc36e"><title>B · ${fmt(selectedB)}</title></circle>`:""}<text class="axis-label" x="${p.l}" y="${H-12}">Día ${days[0]} · ${dateFor(days[0])}</text><text class="axis-label" x="${W-p.r}" y="${H-12}" text-anchor="end">Día ${days.at(-1)} · ${dateFor(days.at(-1))}</text></svg></div><div class="legend"><span><i style="--series-color:#52dfc0"></i>Escenario A · ${esc(a.model)}</span>${b?`<span><i style="--series-color:#ffc36e"></i>Escenario B · ${esc(b.model)}</span>`:""}</div></div>`;
}
