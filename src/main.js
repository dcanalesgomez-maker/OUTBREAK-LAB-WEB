import { COEFFICIENTS, derivative, modelIncrement, predict, secondDerivative } from "./models.js";
import { canUseLogScale, resolveChartScale } from "./chart-scale.js";
import { mae, metrics, rmse } from "./metrics.js";
import { fitModel } from "./fit.js";
import { evaluateModels } from "./analysis.js";
import { comparePrecision, lossExplorer, roundHalfEven, runPlayground } from "./experiments.js";
import { firstHistoricalThreshold, projectionFor, solveThreshold } from "./projections.js";
import { delayedPaths, hasNegativeIncrements, interventionPath, scenarioDate, scenarioSummary, uncontrolledPaths } from "./scenarios.js";
import { loadNationalData } from "./data.js";
import { mountWorld, worldMarkup } from "./world-page.js?v=10d7";
import { cityMarkup, cityModeTabs, mountCities, stopCityPlayback, applyCityScenarioFromWhatIf, cityScenarioForWhatIf } from "./world-city-page.js?v=10d7";

const MODEL_NAMES = Object.keys(COEFFICIENTS);
const MODEL_COLORS = { Lineal: "#65b9ff", Cuadrático: "#bd9aff", Exponencial: "#ffc36e" };
const SECTIONS = [
  ["dashboard", "Panel de control", "⌂"],
  ["models", "Laboratorio matemático", "⌁"],
  ["prediction", "Simulador de predicciones", "↗"],
  ["report", "Análisis de resultados", "▤"],
  ["whatif", "¿Qué habría pasado si…?", "◌"],
  ["world", "Expansión mundial", "◎"],
];
const state = {
  section: "dashboard", labTab: "modelos", selectedModel: "Exponencial", compareModels: true,
  velocityDay: 10, accelerationDay: 10, accumulationModel: "Cuadrático", startDay: 0, endDay: 10,
  playgroundModel: "Lineal", playgroundDays: 23, playgroundCompare: false,
  precisionModel: "Exponencial", precisionDigits: "2", precisionDay: 36,
  lossSlope: COEFFICIENTS.Lineal[0], lossIntercept: COEFFICIENTS.Lineal[1],
  selectedPredictionModels: ["Lineal", "Cuadrático", "Exponencial"], horizon: 3,
  thresholdModel: "Cuadrático", threshold: 100000, predictionScale: "Lineal", errorMeasure: "absolute", residualModel: "Todos",
  whatIfMode: "Intervención temprana", whatIfModel: "Exponencial", whatIfDay: 20,
  whatIfReduction: 40, whatIfDelay: 5, whatIfEnd: 36,
  whatIfModels: ["Lineal", "Cuadrático", "Exponencial"], whatIfScale: "Lineal",
  worldMode: "historical",
};
const nav = document.querySelector("#navigation");
const main = document.querySelector("#main-content");
let rows = [];

const format = (value, digits = 2) => Number.isFinite(value)
  ? new Intl.NumberFormat("es-ES", { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(value)
  : "No definido";
const formatApproxDate = day => new Intl.DateTimeFormat("es-ES", { day:"numeric", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit", timeZone:"UTC" }).format(new Date(Date.UTC(2020, 2, 1) + day * 86400000));
const esc = value => String(value).replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const select = (key, value, label) => `<label class="control"><span>${label}</span><select data-state="${key}">${value.map(item => `<option value="${esc(item)}" ${state[key] === item ? "selected" : ""}>${esc(item)}</option>`).join("")}</select></label>`;
const range = (key, label, min, max, step, value, suffix = "") => `<label class="control range-control"><span>${label} <b>${esc(value)}${suffix}</b></span><input type="range" data-state="${key}" min="${min}" max="${max}" step="${step}" value="${value}"></label>`;
const checkbox = (key, label, checked) => `<label class="check-control"><input type="checkbox" data-state="${key}" ${checked ? "checked" : ""}><span>${label}</span></label>`;

function renderNavigation() {
  nav.innerHTML = SECTIONS.map(([id, label, icon]) => `<button class="nav-item ${state.section === id ? "active" : ""}" data-section="${id}"><span>${icon}</span>${label}</button>`).join("");
}

function chart(series, { title, xTitle = "Día transcurrido", yTitle = "Casos acumulados", splitDay = null, splitLabel = "VALIDACIÓN", zeroLine = false, markers = [], logY = false } = {}) {
  const drawable = series.flatMap(item => item.points.filter(point => Number.isFinite(point.y) && (!logY || point.y > 0)));
  const width = 900, height = 320, pad = { left: 72, right: 18, top: 22, bottom: 48 };
  if (!drawable.length) return `<div class="chart-empty">No hay valores disponibles para mostrar.</div>`;
  const xmin = Math.min(0, ...drawable.map(point => point.x));
  const xmax = Math.max(1, ...drawable.map(point => point.x));
  const scaleY = value => logY ? Math.log10(value) : value;
  const yminData = Math.min(...drawable.map(point => scaleY(point.y)));
  const ymaxData = Math.max(...drawable.map(point => scaleY(point.y)));
  const ymin = logY ? Math.floor(yminData) : Math.min(0, yminData);
  const ymax = ymaxData === ymin ? ymin + 1 : logY ? Math.ceil(ymaxData) : ymaxData * 1.06;
  const x = value => pad.left + (value - xmin) / (xmax - xmin) * (width - pad.left - pad.right);
  const y = value => height - pad.bottom - (scaleY(value) - ymin) / (ymax - ymin) * (height - pad.top - pad.bottom);
  const ticks = Array.from({ length: 5 }, (_, index) => ymin + (ymax - ymin) * index / 4);
  const grid = ticks.map(value => { const raw = logY ? 10 ** value : value; return `<line class="grid" x1="${pad.left}" x2="${width-pad.right}" y1="${height-pad.bottom-(value-ymin)/(ymax-ymin)*(height-pad.top-pad.bottom)}" y2="${height-pad.bottom-(value-ymin)/(ymax-ymin)*(height-pad.top-pad.bottom)}"/><text class="axis-label" x="${pad.left-9}" y="${height-pad.bottom-(value-ymin)/(ymax-ymin)*(height-pad.top-pad.bottom)+4}" text-anchor="end">${format(raw, logY ? 0 : 0)}</text>`; }).join("");
  const zero = !logY && zeroLine && ymin < 0 && ymax > 0 ? `<line class="zero-line" x1="${pad.left}" x2="${width-pad.right}" y1="${y(0)}" y2="${y(0)}"/>` : "";
  const split = splitDay == null ? "" : `<line class="split-line" x1="${x(splitDay)}" x2="${x(splitDay)}" y1="${pad.top}" y2="${height-pad.bottom}"/><text class="split-label" x="${x(splitDay)+6}" y="${pad.top+13}">${esc(splitLabel)}</text>`;
  const referenceMarkers = markers.map((marker,index) => `<line class="scenario-marker" x1="${x(marker.day)}" x2="${x(marker.day)}" y1="${pad.top}" y2="${height-pad.bottom}"/><text class="scenario-marker-label" x="${Math.min(x(marker.day)+5,width-150)}" y="${pad.top+13+index*12}">${esc(marker.label)}</text>`).join("");
  const marks = series.map(item => {
    const points = item.points.filter(point => Number.isFinite(point.x) && Number.isFinite(point.y) && (!logY || point.y > 0));
    const line = item.line && points.length > 1 ? `<path class="series-line" stroke="${item.color}" ${item.dash ? `stroke-dasharray="${esc(item.dash)}"` : ""} d="${points.map((point,index) => `${index ? "L" : "M"}${x(point.x)},${y(point.y)}`).join(" ")}"/>` : "";
    const circles = item.dots || item.tooltips ? points.map(point => `<circle cx="${x(point.x)}" cy="${y(point.y)}" r="${item.radius || 4.5}" fill="${item.dots ? item.color : "transparent"}" class="${item.dots ? "chart-dot" : "chart-hitpoint"}"><title>${esc(item.name)} · ${esc(point.label ?? `día ${point.x}`)}: ${format(point.y, 2)}</title></circle>`).join("") : "";
    return line + circles;
  }).join("");
  const legend = `<div class="legend">${series.map(item => `<span><i class="${item.dash ? "legend-dashed" : ""}" style="--series-color:${item.color}"></i>${esc(item.name)}</span>`).join("")}</div>`;
  return `<div class="chart-wrap"><div class="chart-title">${esc(title)}${logY ? " · escala logarítmica" : ""}</div><div class="chart-scroll"><svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(title)}. Eje horizontal: ${esc(xTitle)}. Eje vertical: ${esc(yTitle)}${logY ? ", escala logarítmica; no se representan valores cero o negativos" : ""}">${grid}${zero}${split}${referenceMarkers}${marks}<line class="axis" x1="${pad.left}" x2="${width-pad.right}" y1="${height-pad.bottom}" y2="${height-pad.bottom}"/><text class="axis-label" x="${width/2}" y="${height-9}" text-anchor="middle">${esc(xTitle)}</text><text class="axis-label" transform="translate(15 ${height/2}) rotate(-90)" text-anchor="middle">${esc(yTitle)}</text></svg></div>${legend}</div>`;
}

function table(headers, bodyRows) {
  return `<div class="table-scroll"><table><thead><tr>${headers.map(head => `<th>${esc(head)}</th>`).join("")}</tr></thead><tbody>${bodyRows.map(row => `<tr>${row.map(value => `<td>${esc(value)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}

function pageHeader(section, title, description) {
  const number = String(SECTIONS.findIndex(item => item[0] === section) + 1).padStart(2, "0");
  return `<header class="topbar"><span>OUTBREAK LAB <b>/</b> ${esc(SECTIONS.find(item => item[0] === section)[1].toUpperCase())}</span><span class="status-pill"><i></i> LABORATORIO EDUCATIVO</span></header><section class="page-heading"><div class="eyebrow"><span></span> HERRAMIENTAS INTERACTIVAS <span class="hero-index">${number} / 06</span></div><h1>${esc(title)}</h1><p>${esc(description)}</p></section>`;
}

function dashboard() {
  const evaluation = evaluateModels(rows);
  const winner = Object.entries(evaluation.models).sort((a,b) => a[1].validationMetrics.RMSE - b[1].validationMetrics.RMSE)[0];
  const history = rows.map(row => ({ x: row.dia, y: row.casos_acumulados, label: row.fecha }));
  return `<header class="topbar"><span>OUTBREAK LAB <b>/</b> PANEL DE CONTROL</span><span class="status-pill"><i></i> LABORATORIO EDUCATIVO</span></header><section class="hero"><div class="eyebrow"><span></span> EPIDEMIC INTELLIGENCE SYSTEM <span class="hero-index">01 / 06</span></div><h1>Comprender el pasado.<br><em>Explorar los modelos.</em></h1><p>Un laboratorio interactivo para analizar la primera ola de COVID-19 en España mediante modelos matemáticos, datos históricos y escenarios explicables.</p><div class="hero-meta"><span><b>ESPAÑA</b> · COVID-19</span><span>01 — 30 MARZO 2020</span><span>DATOS HISTÓRICOS</span></div></section><section class="metric-grid"><article class="metric-card"><span>CASOS ACUMULADOS</span><strong>${format(rows.at(-1).casos_acumulados,0)}</strong><small>cierre del periodo · 30 mar 2020</small></article><article class="metric-card"><span>OBSERVACIONES</span><strong>30 <small>DIARIAS</small></strong><small>1–30 marzo 2020</small></article><article class="metric-card"><span>RESERVA CRONOLÓGICA</span><strong>7 <small>DÍAS</small></strong><small>23 observaciones de ajuste</small></article><article class="metric-card accent-metric"><span>MENOR RMSE EN VALIDACIÓN</span><strong>Cuadrático</strong><small>${format(winner[1].validationMetrics.RMSE)} casos · comparación de referencia</small></article></section><section class="content-grid"><article class="panel chart-panel"><div class="panel-head"><div><span class="eyebrow">SERIE HISTÓRICA</span><h2>Evolución de casos confirmados</h2></div><span class="unit-chip">CASOS ACUMULADOS</span></div>${chart([{ name:"Ajuste · días 0–22", color:"#8ca5ff", points:history.filter(point=>point.x<=22), dots:true },{ name:"Validación · días 23–29", color:"#52dfc0", points:history.filter(point=>point.x>=23), dots:true }],{title:"Casos confirmados · España",splitDay:22.5,xTitle:"Día desde el 1 de marzo de 2020",yTitle:"Casos confirmados acumulados"})}</article><aside class="panel insight-panel"><span class="eyebrow">LECTURA DEL CONJUNTO</span><h2>Una ventana de 30 días.</h2><p>Los últimos siete días se mantienen separados para validar las funciones ajustadas con los 23 días anteriores.</p><div class="split-stat"><div><b>23</b><span>AJUSTE</span></div><div><b>7</b><span>VALIDACIÓN</span></div></div><div class="source-note"><span>FUENTE</span><b>Johns Hopkins CSSE</b><small>Serie histórica nacional, incluida localmente.</small></div></aside></section><section class="section-intro"><div><span class="eyebrow">CINCO EXPERIENCIAS DISPONIBLES</span><h2>Del dato a la evaluación.</h2></div><button class="primary-button" data-section="models">Abrir laboratorio matemático ↗</button></section><div class="model-cards">${SECTIONS.slice(1).map(([id,label],index)=>`<button class="model-card" data-section="${id}"><span class="model-icon">${index+1}</span><span>${label.toUpperCase()}</span><b>Abrir herramienta <i>↗</i></b></button>`).join("")}</div><p class="science-note">Los resultados describen una única ventana histórica; no garantizan predicción futura ni demuestran causalidad.</p>`;
}

function modelCore(evaluation) {
  const model = state.selectedModel;
  const result = evaluation.models[model];
  const visibleModels = state.compareModels ? MODEL_NAMES : [model];
  const trainingActual = evaluation.training.map(row=>({x:row.dia,y:row.casos_acumulados}));
  const rowsTable = MODEL_NAMES.map(name=>{
    const item=evaluation.models[name];
    return [name, ...[item.trainingMetrics.MAE,item.trainingMetrics.RMSE,item.trainingMetrics.R2,item.validationMetrics.MAE,item.validationMetrics.RMSE,item.validationMetrics.R2].map(value=>format(value,2))];
  });
  return `<section class="content-grid lab-grid"><article class="panel chart-panel"><div class="panel-head"><div><span class="eyebrow">AJUSTE SOBRE 23 OBSERVACIONES</span><h2>Funciones ajustadas y datos de entrenamiento</h2></div>${select("selectedModel",MODEL_NAMES, "MODELO")}</div>${checkbox("compareModels","Comparar los tres modelos",state.compareModels)}${chart([{name:"Datos observados",color:"#52dfc0",points:trainingActual,dots:true},...visibleModels.map(name=>({name:`Ajuste ${name}`,color:MODEL_COLORS[name],points:evaluation.models[name].trainingEstimates.map((value,index)=>({x:index,y:value})),line:true}))],{title:`Regresiones sobre días 0–22${state.compareModels?" · comparación":" · "+model}`,xTitle:"Día transcurrido",yTitle:"Casos acumulados"})}<div class="equation-card"><span>ECUACIÓN Y COEFICIENTES COMPLETOS · ${model.toUpperCase()}</span><b>${equation(model, result.coefficients)}</b><small>${result.coefficients.map((value,index)=>`${["a","b","c"][index]} = ${value}`).join(" · ")}</small></div></article><aside class="panel score-panel"><span class="eyebrow">MÉTRICAS DEL MODELO ${model.toUpperCase()}</span><h2>Ajuste y validación</h2><p>Los parámetros se calculan solo con los días 0–22.</p>${metricBlock("Entrenamiento · 23 días",result.trainingMetrics)}${metricBlock("Validación · 7 días",result.validationMetrics)}<div class="notice">El exponencial ajusta mínimos cuadrados en ln(casos); por eso su objetivo de ajuste difiere del lineal y cuadrático.</div></aside></section><section class="panel table-panel"><div class="panel-head"><div><span class="eyebrow">COMPARACIÓN</span><h2>Métricas para los tres modelos</h2></div></div>${table(["Modelo","MAE ajuste","RMSE ajuste","R² ajuste","MAE validación","RMSE validación","R² validación"],rowsTable)}<p class="caption">MAE y RMSE están expresados en casos. R² se presenta sin recortarlo; puede ser negativo.</p></section>`;
}

function equation(model, coefficients) {
  const [a,b,c] = coefficients;
  if (model === "Lineal") return `y(t) = ${format(a,8)}t ${b < 0 ? "−" : "+"} ${format(Math.abs(b),8)}`;
  if (model === "Cuadrático") return `y(t) = ${format(a,8)}t² ${b < 0 ? "−" : "+"} ${format(Math.abs(b),8)}t ${c < 0 ? "−" : "+"} ${format(Math.abs(c),8)}`;
  return `y(t) = ${format(a,8)}e^(${format(b,10)}t)`;
}

function metricBlock(title, values) {
  return `<div class="metric-block"><strong>${title}</strong><div><span>MAE</span><b>${format(values.MAE)}</b><small>casos</small></div><div><span>RMSE</span><b>${format(values.RMSE)}</b><small>casos</small></div><div><span>R²</span><b>${format(values.R2,4)}</b><small>sin unidades</small></div></div>`;
}

function dynamics(evaluation) {
  const day = Number(state.velocityDay);
  const accelerationDay = Number(state.accelerationDay);
  const models = MODEL_NAMES.map(model=>({name:`${model} · y′`,color:MODEL_COLORS[model],points:Array.from({length:30},(_,x)=>({x,y:derivative(model,x)})),line:true}));
  const changes = evaluation.dailyChanges.map((value,index)=>({x:index+1,y:value}));
  const acceleration = MODEL_NAMES.map(model=>({name:`${model} · y″`,color:MODEL_COLORS[model],points:Array.from({length:30},(_,x)=>({x,y:secondDerivative(model,x)})),line:true}));
  const area = modelIncrement(state.accumulationModel,Number(state.startDay),Number(state.endDay));
  const negativeModels=MODEL_NAMES.filter(model=>Array.from({length:30},(_,day)=>derivative(model,day)).some(value=>value<0));
  const integralModel=state.accumulationModel;
  const integralSeries=[{name:`y′ · ${integralModel}`,color:MODEL_COLORS[integralModel],points:Array.from({length:145},(_,index)=>{const day=index/4;return{x:day,y:derivative(integralModel,day)}}),line:true},{name:"Extremos seleccionados",color:"#f2be73",points:[{x:Number(state.startDay),y:derivative(integralModel,Number(state.startDay))},{x:Number(state.endDay),y:derivative(integralModel,Number(state.endDay))}],dots:true}];
  const derivativeChart = chart([...models,{name:"Diferencia diaria observada",color:"#e9edf4",points:changes,dots:true,radius:3}],{title:"Tasas instantáneas y cambios diarios observados",xTitle:"Día",yTitle:"Casos por día",splitDay:22.5,zeroLine:true});
  return `<div class="metric-grid three-metrics">${MODEL_NAMES.map(model=>`<article class="metric-card"><span>VELOCIDAD · ${model.toUpperCase()}</span><strong>${format(derivative(model,day))}</strong><small>casos/día en día ${day}</small></article>`).join("")}</div><section class="panel chart-panel">${range("velocityDay","Día para consultar la tasa instantánea",0,29,1,day)}${derivativeChart}<p class="caption">La diferencia diaria observa dos días consecutivos; la derivada es la pendiente instantánea de una función continua. Se expresan en unidades comparables, pero no son la misma operación.</p>${negativeModels.length?`<div class="notice">Tasa negativa en la ventana observada para: ${negativeModels.join(", ")}. Se muestra el resultado matemático sin corregirlo.</div>`:""}</section><section class="content-grid"><article class="panel chart-panel"><div class="panel-head"><div><span class="eyebrow">ACELERACIÓN</span><h2>Segunda derivada · casos/día²</h2></div>${range("accelerationDay","Día seleccionado",0,29,1,accelerationDay)}</div>${chart(acceleration,{title:"Cambio de la pendiente matemática",xTitle:"Día",yTitle:"Casos por día²",zeroLine:true})}<p class="caption">Una aceleración positiva indica que aumenta la pendiente matemática; no demuestra un cambio epidemiológico.</p></article><article class="panel accumulation-panel"><span class="eyebrow">CAMBIO ACUMULADO</span><h2>Integral definida de la tasa</h2><p>El teorema fundamental del cálculo da ∫ y′(t)dt = y(t₂) − y(t₁).</p>${select("accumulationModel",MODEL_NAMES,"MODELO")}${range("startDay","Día inicial t₁",0,35,1,state.startDay)}${range("endDay","Día final t₂",1,36,1,state.endDay)}<div class="big-result">${format(area)} <small>casos de cambio neto</small></div>${chart(integralSeries,{title:`Tasa e intervalo seleccionado · ${integralModel}`,xTitle:"Día",yTitle:"Derivada · casos/día",zeroLine:true})}<p class="caption">No es un conteo observado de casos diarios. Si la tasa cambia de signo, el área firmada descuenta tramos negativos.</p>${area<0?`<div class="notice">El resultado negativo pertenece a la función matemática. No es un número plausible de casos acumulados.</div>`:""}</article></section>`;
}

function experiments(evaluation) {
  const playground = runPlayground(state.playgroundModel,Number(state.playgroundDays),rows);
  const days = rows.slice(0,Number(state.playgroundDays)).map(row=>row.dia);
  const playgroundSeries = [
    {name:"Usadas en el experimento",color:"#52dfc0",points:rows.slice(0,Number(state.playgroundDays)).map(row=>({x:row.dia,y:row.casos_acumulados})),dots:true},
    {name:"Entrenamiento no usado",color:"#8190a3",points:rows.slice(Number(state.playgroundDays),23).map(row=>({x:row.dia,y:row.casos_acumulados})),dots:true},
    {name:"Validación reservada",color:"#f2be73",points:rows.slice(23).map(row=>({x:row.dia,y:row.casos_acumulados})),dots:true},
    {name:"Ajuste experimental",color:MODEL_COLORS[state.playgroundModel],points:days.map((day,index)=>({x:day,y:playground.estimates[index]})),line:true},
  ];
  if(state.playgroundCompare) playgroundSeries.push({name:"Función oficial",color:"#f28ca8",points:Array.from({length:30},(_,x)=>({x,y:predict(state.playgroundModel,x)})),line:true});
  const precision = comparePrecision(state.precisionModel,Number(state.precisionDay),state.precisionDigits==="completa"?null:Number(state.precisionDigits));
  const precisionDigits=state.precisionDigits==="completa"?null:Number(state.precisionDigits);
  const precisionCoefficients=COEFFICIENTS[state.precisionModel].map(value=>roundHalfEven(value,precisionDigits));
  const precisionGraph=chart([{name:"Precisión original",color:"#52dfc0",points:Array.from({length:37},(_,day)=>({x:day,y:predict(state.precisionModel,day)})),line:true},{name:`Precisión ${state.precisionDigits} decimales`,color:"#f2be73",points:Array.from({length:37},(_,day)=>({x:day,y:predict(state.precisionModel,day,precisionCoefficients)})),line:true}],{title:"Trayectorias con coeficientes originales y redondeados",xTitle:"Día",yTitle:"Casos acumulados estimados"});
  const loss = lossExplorer(Number(state.lossSlope),Number(state.lossIntercept),evaluation.training.map(row=>row.dia),evaluation.training.map(row=>row.casos_acumulados));
  const lossGraph = chart([{name:"MSE con intercepto fijo",color:"#8ca5ff",points:loss.curve.map(point=>({x:point.slope,y:point.MSE})),line:true},{name:"Pendiente seleccionada",color:"#ff8d73",points:[{x:Number(state.lossSlope),y:loss.MSE}],dots:true},{name:"Mínimo con b fijo",color:"#52dfc0",points:[{x:loss.fixedInterceptOptimum,y:loss.optimumMSE}],dots:true}],{title:"MSE según la pendiente; intercepto fijo",xTitle:"Pendiente a",yTitle:"MSE · casos²"});
  const validationEst = rows.slice(23).map(row=>predict(state.playgroundModel,row.dia,playground.coefficients));
  const compareRows = state.playgroundCompare ? [["Experimental",format(mae(rows.slice(23).map(r=>r.casos_acumulados),validationEst)),format(rmse(rows.slice(23).map(r=>r.casos_acumulados),validationEst))],["Oficial · 23 días",format(evaluation.models[state.playgroundModel].validationMetrics.MAE),format(evaluation.models[state.playgroundModel].validationMetrics.RMSE)]] : [];
  return `<div class="experiment-stack"><details class="panel experiment" open><summary><span>Model Playground</span><small>Reajusta usando solo un prefijo del entrenamiento</small></summary><p>El ajuste nunca utiliza los días de validación (23–29). Cambiar la cantidad de observaciones también cambia la muestra con la que se mide el error.</p><div class="control-row">${select("playgroundModel",MODEL_NAMES,"MODELO EXPERIMENTAL")}${range("playgroundDays","Días usados (8–23)",8,23,1,state.playgroundDays)}</div>${checkbox("playgroundCompare","Comparar ajuste experimental con la curva oficial",state.playgroundCompare)}<div class="equation-card"><span>COEFICIENTES EXPERIMENTALES</span><b>${equation(state.playgroundModel,playground.coefficients)}</b><small>${playground.coefficients.map(value=>value.toPrecision(9)).join(" · ")}</small></div><div class="inline-metrics"><span>MAE de entrenamiento <b>${format(playground.MAE)} casos</b></span><span>RMSE de entrenamiento <b>${format(playground.RMSE)} casos</b></span></div>${chart(playgroundSeries,{title:`Ajuste de ${state.playgroundModel} con ${state.playgroundDays} observaciones`,xTitle:"Día",yTitle:"Casos acumulados"})}${state.playgroundCompare?`<h3>Comparación en las mismas siete fechas</h3>${table(["Ajuste","MAE validación","RMSE validación"],compareRows)}<div class="notice">Esta validación ya se consulta para comparar modelos; repetir comparaciones puede sesgar la elección. No es una prueba independiente nueva.</div>`:""}</details><details class="panel experiment"><summary><span>Numerical Precision Lab</span><small>Compara el resultado antes y después de redondear coeficientes</small></summary><div class="control-row">${select("precisionModel",MODEL_NAMES,"MODELO")}${select("precisionDigits",["2","4","6","completa"],"PRECISIÓN")}</div>${range("precisionDay","Día (0–36)",0,36,1,state.precisionDay)}<div class="precision-grid"><div class="equation-card"><span>COEFICIENTES ORIGINALES</span><b>${equation(state.precisionModel,precision.originalCoefficients)}</b></div><div class="equation-card"><span>COEFICIENTES REDONDEADOS</span><b>${equation(state.precisionModel,precision.roundedCoefficients)}</b></div></div><div class="inline-metrics"><span>Predicción completa <b>${format(precision.original,6)}</b></span><span>Predicción redondeada <b>${format(precision.rounded,6)}</b></span><span>Error absoluto <b>${format(precision.absoluteError,8)}</b></span><span>Error relativo <b>${precision.relativePercent==null?"No definido":`${format(precision.relativePercent,8)}%`}</b></span></div>${precisionGraph}<p class="caption">Solo se redondea una copia para este experimento. La precisión completa se conserva en los demás cálculos; no se redondean resultados intermedios.</p></details><details class="panel experiment"><summary><span>Loss Function Explorer</span><small>Observa el MSE lineal con un intercepto seleccionado</small></summary><p>MSE(a,b) = (1/n) Σ [yᵢ − (a·tᵢ+b)]². El punto óptimo calcula la pendiente a con el intercepto b fijo; no representa el mínimo conjunto.</p><div class="control-row">${numberControl("lossSlope","Pendiente a",-3000,5000,25,state.lossSlope)}${numberControl("lossIntercept","Intercepto b",-20000,20000,250,state.lossIntercept)}<button class="secondary-button" data-action="restore-loss">Restaurar coeficientes oficiales</button></div><div class="inline-metrics"><span>MSE interactivo <b>${format(loss.MSE,0)} casos²</b></span><span>MSE oficial <b>${format(loss.officialMSE,0)} casos²</b></span><span>Pendiente mínima con b fijo <b>${format(loss.fixedInterceptOptimum,3)}</b></span></div>${lossGraph}<p class="caption">El MSE se calcula sobre los 23 días de entrenamiento. La validación no participa en esta función de pérdida.</p></details></div>`;
}

function numberControl(key,label,min,max,step,value) { return `<label class="control"><span>${label}</span><input type="number" data-state="${key}" min="${min}" max="${max}" step="${step}" value="${value}"></label>`; }

function modelLab(evaluation) {
  const tabs = [["modelos","Modelos principales"],["dinamica","Dinámica y acumulación"],["experimentos","Experimentos"]];
  const panel = state.labTab === "dinamica" ? dynamics(evaluation) : state.labTab === "experimentos" ? experiments(evaluation) : modelCore(evaluation);
  return `${pageHeader("models","Laboratorio matemático","Ajusta, compara y explora las funciones con las herramientas matemáticas de la versión original.")}<div class="tab-nav">${tabs.map(([id,label])=>`<button class="tab-button ${state.labTab===id?"active":""}" data-tab="${id}">${label}</button>`).join("")}</div>${panel}<p class="science-note">Las funciones describen modelos matemáticos sobre una serie histórica; no son modelos epidemiológicos causales.</p>`;
}

function predictionPage() {
  const selected = state.selectedPredictionModels.length ? state.selectedPredictionModels : ["Cuadrático"];
  const validation = rows.filter(row=>row.dia>=23).map(row=>({x:row.dia,y:row.casos_acumulados,label:row.fecha}));
  const training = rows.filter(row=>row.dia<=22).map(row=>({x:row.dia,y:row.casos_acumulados,label:row.fecha}));
  const series=[{name:"Observaciones · ajuste",color:"#8ca5ff",points:training,dots:true},{name:"Observaciones · validación",color:"#52dfc0",points:validation,dots:true}];
  const projected = Object.fromEntries(selected.map(model=>[model,projectionFor(model,Number(state.horizon))]));
  selected.forEach(model=>{
    series.push({name:`${model} · ajuste`,color:MODEL_COLORS[model],points:rows.slice(0,23).map(row=>({x:row.dia,y:predict(model,row.dia)})),line:true});
    series.push({name:`${model} · proyección`,color:MODEL_COLORS[model],points:projected[model].map(point=>({x:point.day,y:point.cases,label:point.date})),line:true,dots:true,dash:"6 4"});
  });
  const modelChecks=MODEL_NAMES.map(model=>`<label class="check-control"><input type="checkbox" data-model-choice="${model}" ${selected.includes(model)?"checked":""}><span>${model}</span></label>`).join("");
  const scaleValues=series.flatMap(item=>item.points.map(point=>point.y));
  const logarithmicAllowed=canUseLogScale(scaleValues);
  state.predictionScale=resolveChartScale(state.predictionScale,scaleValues);
  const logarithmic=state.predictionScale==="Logarítmica";
  const scaleControl=`<label class="control"><span>ESCALA DEL GRÁFICO</span><select data-state="predictionScale" aria-describedby="prediction-scale-note"><option value="Lineal" ${!logarithmic?"selected":""}>Lineal</option><option value="Logarítmica" ${logarithmic?"selected":""} ${logarithmicAllowed?"":"disabled"}>Logarítmica · base 10${logarithmicAllowed?"":" (escala no válida)"}</option></select></label>`;
  const scaleNote=logarithmicAllowed?`Escala logarítmica de base 10: solo disponible porque todos los valores de las series seleccionadas son positivos.`:`Escala logarítmica desactivada: alguna serie seleccionada contiene valores no positivos o no finitos. No se oculta ningún punto; la escala lineal conserva todos los valores.`;
  const last=rows.at(-1).casos_acumulados;
  const projectionRows=Array.from({length:Number(state.horizon)},(_,index)=>[projected[selected[0]][index].date,projected[selected[0]][index].day,...selected.map(model=>format(projected[model][index].cases,2))]);
  const warningGroups=[
    ["Hay valores negativos; se muestran sin convertirlos a cero.",model=>projected[model].some(point=>point.cases<0)],
    ["Parte de la curva queda bajo el último acumulado observado.",model=>projected[model].some(point=>point.cases<last)],
    ["La proyección supera diez veces el último valor; es un aviso didáctico, no un umbral epidemiológico.",model=>Math.max(...projected[model].map(point=>point.cases))>last*10],
  ];
  const warnings=warningGroups.map(([message,predicate])=>{const affected=selected.filter(predicate);return affected.length?`<div class="notice">${affected.join(", ")}: ${message}</div>`:""}).filter(Boolean);
  const thresholdRows=solveThreshold(state.thresholdModel,Number(state.threshold)).map((root,index)=>[index+1,format(root,2),formatApproxDate(root)]);
  const crossing=firstHistoricalThreshold(rows,Number(state.threshold));
  const thresholdCurve=Array.from({length:181},(_,index)=>{const day=index/5;return{x:day,y:predict(state.thresholdModel,day)}});
  const selectedThreshold=chart([{name:`Función oficial · ${state.thresholdModel}`,color:MODEL_COLORS[state.thresholdModel],points:thresholdCurve,line:true},{name:"Datos históricos",color:"#52dfc0",points:rows.map(row=>({x:row.dia,y:row.casos_acumulados,label:row.fecha})),dots:true},{name:"Umbral",color:"#f28ca8",points:[{x:0,y:Number(state.threshold)},{x:36,y:Number(state.threshold)}],line:true}],{title:"Cruces matemáticos y datos observados",xTitle:"Día desde 1 de marzo de 2020",yTitle:"Casos acumulados"});
  return `${pageHeader("prediction","Simulador de predicciones","Elige modelos y horizonte para extender las funciones oficiales hasta siete días después del último dato histórico.")}<section class="panel controls-panel"><div class="control-row">${range("horizon","Horizonte futuro (1–7 días)",1,7,1,state.horizon)}<div class="model-checks"><span>MODELOS</span>${modelChecks}</div>${scaleControl}</div><p id="prediction-scale-note" class="caption">${scaleNote} Histórico: ajuste (0–22) y validación (23–29). La línea discontinua marca la proyección, que conserva los coeficientes completos y no vuelve a ajustarse.</p></section><section class="panel chart-panel">${chart(series,{title:"Histórico y proyección matemática",xTitle:"Día desde el 1 de marzo de 2020",yTitle:"Casos acumulados",markers:[{day:22.5,label:"INICIO VALIDACIÓN"},{day:29.5,label:"INICIO EXTRAPOLACIÓN"}],logY:logarithmic})}<p class="caption">Las líneas de proyección no se conectan al último punto observado: una función puede no coincidir con ese dato.</p></section><section class="panel table-panel"><div class="panel-head"><div><span class="eyebrow">DÍAS POSTERIORES AL HISTÓRICO</span><h2>Valores proyectados</h2></div></div>${table(["Fecha","Día",...selected.map(model=>`${model} · casos estimados`)],projectionRows)}</section><section class="notice strong-notice">Estas cifras son continuación matemática de funciones ajustadas con datos históricos. No son predicciones sanitarias fiables ni observaciones futuras.</section>${warnings.join("")}<section class="panel threshold-panel"><div class="panel-head"><div><span class="eyebrow">THRESHOLD SIMULATOR</span><h2>Cruce de un umbral matemático</h2></div></div><div class="control-row">${select("thresholdModel",MODEL_NAMES,"MODELO")}${numberControl("threshold","Umbral (casos acumulados)",1,100000000,1000,state.threshold)}</div><p>Resolver y(t)=C para 0≤t≤36. Las raíces matemáticas se muestran separadas del primer dato histórico que alcanzó el umbral.</p>${crossing?`<p class="notice">El histórico alcanza el umbral el ${crossing.fecha}, día ${crossing.dia}.</p>`:`<p class="caption">El histórico disponible no alcanza este umbral.</p>`}${thresholdRows.length?table(["Cruce","Día matemático · aprox.","Fecha aproximada (UTC)"],thresholdRows):`<div class="notice">No hay raíces reales del modelo dentro del intervalo de días 0–36.</div>`}${selectedThreshold}</section>`;
}

function resultsPage(evaluation) {
  const metricRows=MODEL_NAMES.flatMap(model=>{
    const result=evaluation.models[model];
    return [[model,"Ajuste · días 0–22",format(result.trainingMetrics.MAE),format(result.trainingMetrics.RMSE),format(result.trainingMetrics.R2,4)],[model,"Validación · días 23–29",format(result.validationMetrics.MAE),format(result.validationMetrics.RMSE),format(result.validationMetrics.R2,4)]];
  });
  const baselineRows=[["Baseline constante",format(evaluation.baseline.metrics.MAE),format(evaluation.baseline.metrics.RMSE),format(evaluation.baseline.metrics.R2,4)],...MODEL_NAMES.map(model=>[model,format(evaluation.models[model].validationMetrics.MAE),format(evaluation.models[model].validationMetrics.RMSE),format(evaluation.models[model].validationMetrics.R2,4)])];
  const stabilityModels=MODEL_NAMES.map(model=>({name:model,color:MODEL_COLORS[model],points:evaluation.stability.filter(row=>row.model===model).map(row=>({x:row.horizon,y:row.RMSE,label:`${row.horizon} días`})),line:true,dots:true}));
  const stabilityRows=evaluation.stability.map(row=>[row.model,row.horizon,format(row.MAE),format(row.RMSE)]);
  const modelFilter=state.residualModel;
  const residualsShown=evaluation.residualRows.filter(row=>modelFilter==="Todos"||row.model===modelFilter);
  const residualSeries=MODEL_NAMES.filter(model=>modelFilter==="Todos"||model===modelFilter).map(model=>({name:model,color:MODEL_COLORS[model],points:residualsShown.filter(row=>row.model===model).map(row=>({x:row.dia,y:row.residual,label:`${row.period} · ${row.fecha}`})),dots:true}));
  const detectiveRows=residualsShown.filter(row=>state.errorMeasure==="absolute"||row.relativePercent!==null).map(row=>[row.model,row.period,row.fecha,row.dia,format(row.residual),format(row.absolute),row.relativePercent===null?"No definido":`${format(row.relativePercent)}%`,row.classification]);
  const stats=evaluation.dailyStatistics;
  const changes=evaluation.dailyChanges.map((value,index)=>({x:index+1,y:value}));
  const rmseWinner=MODEL_NAMES.reduce((best,name)=>evaluation.models[name].validationMetrics.RMSE<evaluation.models[best].validationMetrics.RMSE?name:best,MODEL_NAMES[0]);
  const winningRmse=evaluation.models[rmseWinner].validationMetrics.RMSE;
  const maxRows=evaluation.maxErrors.map(row=>[row.model,row.period,row.fecha,format(row.residual),format(row.absolute)]);
  return `${pageHeader("report","Análisis de resultados","Evalúa el ajuste y la validación cronológica; explora residuos, baseline y sensibilidad al horizonte.")}<div class="notice strong-notice">Los coeficientes se estiman una sola vez con los días 0–22. La validación comprende los días 23–29 y ya se utiliza para comparar estos modelos; no es una prueba independiente adicional.</div><section class="metric-grid three-metrics">${MODEL_NAMES.map(model=>{const result=evaluation.models[model];return `<article class="metric-card"><span>${model.toUpperCase()} · RMSE VALIDACIÓN</span><strong>${format(result.validationMetrics.RMSE)}</strong><small>casos · MAE ${format(result.validationMetrics.MAE)}</small></article>`}).join("")}</section><section class="panel table-panel"><div class="panel-head"><div><span class="eyebrow">MÉTRICAS</span><h2>Ajuste frente a validación</h2></div></div>${table(["Modelo","Periodo","MAE · casos","RMSE · casos","R²"],metricRows)}<p class="caption">R² negativo no se recorta. Si la varianza real fuese cero, su valor no estaría definido.</p></section><section class="content-grid"><article class="panel chart-panel"><span class="eyebrow">ESTABILIDAD DEL PRONÓSTICO</span><h2>Errores en prefijos de validación</h2>${chart(stabilityModels,{title:"RMSE acumulado según la ventana evaluada",xTitle:"Días de validación incluidos",yTitle:"RMSE · casos"})}${table(["Modelo","Días acumulados","MAE · casos","RMSE · casos"],stabilityRows)}<p class="caption">Las ventanas 1, 3, 5 y 7 días son prefijos cronológicos anidados. Comparten datos y los coeficientes no se reajustan.</p></article><article class="panel score-panel"><span class="eyebrow">BASELINE CHALLENGE</span><h2>Regla constante</h2><p>Repite el último dato del ajuste durante los siete días de validación.</p><b class="baseline-value">${format(evaluation.baseline.values[0],0)} casos · día 22</b>${table(["Método","MAE","RMSE","R²"],baselineRows)}<p class="caption">El denominador de R² usa la media de validación; compárese también MAE y RMSE directamente.</p></article></section><section class="content-grid"><article class="panel chart-panel"><span class="eyebrow">ANÁLISIS DESCRIPTIVO</span><h2>Variaciones diarias observadas</h2><div class="stat-row">${[["Media",stats.mean],["Mediana",stats.median],["Mínimo",stats.min],["Máximo",stats.max],["Desv. típica poblacional",stats.populationStd]].map(([name,value])=>`<div><span>${name}</span><b>${format(value)}</b></div>`).join("")}</div>${chart([{name:"Diferencia diaria",color:"#52dfc0",points:changes,dots:true}],{title:"29 cambios entre acumulados consecutivos",xTitle:"Día final del intervalo",yTitle:"Casos por diferencia",zeroLine:true})}</article><article class="panel score-panel"><span class="eyebrow">LECTURA DEL RESULTADO</span><h2>${rmseWinner} · menor RMSE de validación</h2><div class="big-result">${format(winningRmse)} <small>casos</small></div><p>Es el menor RMSE entre estos tres modelos oficiales en los siete días reservados.</p><div class="notice">No garantiza capacidad predictiva futura. La comparación se basa en un único periodo histórico y se usa para seleccionar entre modelos.</div></article></section><section class="panel chart-panel"><div class="panel-head"><div><span class="eyebrow">RESIDUOS · REAL − ESTIMADO</span><h2>Dirección y tamaño de los errores</h2></div>${select("residualModel",["Todos",...MODEL_NAMES],"MODELO")}</div>${chart(residualSeries,{title:"Residuos de ajuste y validación",xTitle:"Día",yTitle:"Residuo · casos",splitDay:22.5,zeroLine:true})}<p class="caption">Un residuo positivo indica subestimación; uno negativo indica sobreestimación. Los ajustes de los 23 días se estiman sin usar validación.</p>${table(["Modelo","Periodo","Fecha","Residuo día","Error absoluto"],maxRows)}</section><section class="panel detective-panel"><div class="panel-head"><div><span class="eyebrow">ERROR DETECTIVE</span><h2>Detalle por observación</h2></div><label class="control"><span>MEDIDA GRÁFICA</span><select data-state="errorMeasure"><option value="absolute" ${state.errorMeasure==="absolute"?"selected":""}>Error absoluto</option><option value="relative" ${state.errorMeasure==="relative"?"selected":""}>Error relativo (%)</option></select></label></div>${chart([{name:state.errorMeasure==="absolute"?"Error absoluto":"Error relativo (%)",color:"#f28ca8",points:residualsShown.filter(row=>state.errorMeasure!=="relative"||row.relativePercent!==null).map(row=>({x:row.dia,y:state.errorMeasure==="absolute"?row.absolute:row.relativePercent,label:`${row.model} · ${row.period}`})),dots:true}],{title:"Error por fecha y modelo",xTitle:"Día",yTitle:state.errorMeasure==="absolute"?"Error absoluto · casos":"Error relativo · %"})}<p class="caption">Error relativo = |real − estimado| / |real| × 100. Si el real vale cero, el porcentaje no se define. Las clasificaciones respetan residuo positivo = subestimación.</p>${table(["Modelo","Periodo","Fecha","Día","Residuo","Error absoluto","Error relativo","Clasificación"],detectiveRows)}</section>`;
}

function scenarioResultCard(label, value, detail, accent = false) {
  return `<article class="metric-card ${accent ? "accent-metric" : ""}"><span>${esc(label.toUpperCase())}</span><strong>${value}</strong><small>${esc(detail)}</small></article>`;
}

function whatIfPage() {
  const mode = state.whatIfMode;
  const isGrowth = mode === "Crecimiento sin intervención";
  const isDelayed = mode === "Respuesta retrasada";
  const maxStartDay = isDelayed ? 26 : 35;
  const selectedDay = Math.min(state.whatIfDay, maxStartDay);
  const interventionStart = selectedDay + (isDelayed ? state.whatIfDelay : 0);
  const minEndDay = Math.max(1, interventionStart);
  const endDay = Math.max(minEndDay, state.whatIfEnd);
  const history = rows.map(row => ({ x: row.dia, y: row.casos_acumulados, label: row.fecha }));
  const tabs = ["Intervención temprana", "Respuesta retrasada", "Crecimiento sin intervención"];
  const tabMarkup = tabs.map(item => `<button class="tab-button ${mode === item ? "active" : ""}" data-scenario-mode="${esc(item)}">${esc(item)}</button>`).join("");

  if (!isGrowth) {
    const result = isDelayed
      ? delayedPaths(state.whatIfModel, selectedDay, state.whatIfDelay, state.whatIfReduction, endDay)
      : interventionPath(state.whatIfModel, selectedDay, state.whatIfReduction, endDay);
    const reference = isDelayed ? result.early : result.baseline;
    const alternative = isDelayed ? result.delayed : result.scenario;
    const summary = scenarioSummary(reference, alternative);
    const mainLabel = isDelayed ? "Respuesta temprana" : "Trayectoria original";
    const altLabel = isDelayed ? "Respuesta retrasada" : "Escenario alternativo";
    const series = [
      { name: "Casos observados · hasta 30 mar", color: "#f2be73", points: history.filter(point => point.x <= endDay), dots: true, radius: 4 },
      { name: mainLabel, color: isDelayed ? "#52dfc0" : "#f28ca8", points: result.days.map((x,index)=>({x,y:reference[index]})), line: true, tooltips: true },
      { name: altLabel, color: isDelayed ? "#f28ca8" : "#52dfc0", points: result.days.map((x,index)=>({x,y:alternative[index]})), line: true, tooltips: true },
    ];
    const markers = isDelayed
      ? [{day:selectedDay,label:`TEMPRANA · ${scenarioDate(selectedDay)}`},{day:result.delayedDay,label:`RETRASADA · ${scenarioDate(result.delayedDay)}`}]
      : [{day:selectedDay,label:`INTERVENCIÓN · ${scenarioDate(selectedDay)}`}];
    const relative = summary.differencePercent === null ? "No definida" : `${summary.differencePercent > 0 ? "+" : ""}${format(summary.differencePercent)} %`;
    const warnings = [];
    if (hasNegativeIncrements(result.baseline)) warnings.push("La función de referencia presenta incrementos negativos en este horizonte. El escenario mantiene su signo y puede descender; no se interpreta como contagios negativos.");
    if ([...reference,...alternative].some(value=>value<0)) warnings.push("Al menos una trayectoria contiene valores negativos. Se muestran sin recorte porque pertenecen al resultado algebraico; no son casos epidemiológicos plausibles.");
    const controls = `<div class="control-row">${select("whatIfModel",MODEL_NAMES,"MODELO MATEMÁTICO")}${range("whatIfDay","Día de intervención de referencia",0,maxStartDay,1,selectedDay)}${range("whatIfReduction","Intensidad de reducción hipotética",0,90,5,state.whatIfReduction," %")}${isDelayed?range("whatIfDelay","Retraso de la respuesta",0,10,1,state.whatIfDelay," días"):""}${range("whatIfEnd","Día final del horizonte",minEndDay,36,1,endDay)}</div>`;
    const cityTransfer = !isDelayed ? `<button class="secondary-button" data-action="whatif-to-city">Usar este modelo y momento en el simulador por ciudades</button>` : "";
    const differenceLabel=isDelayed?"Diferencia retrasada − temprana":"Diferencia · alternativa − referencia";
    return `${pageHeader("whatif","¿Qué habría pasado si…?","Cambia las condiciones. Explora otros resultados matemáticos.")}<section class="notice strong-notice">Experimentos matemáticos hipotéticos, no reconstrucciones causales. Estos modelos de tendencia no representan la eficacia real de vacunas o intervenciones sanitarias.</section><nav class="tab-nav scenario-tabs" aria-label="Modo de simulación">${tabMarkup}</nav><section class="panel controls-panel scenario-controls"><div class="panel-head"><div><span class="eyebrow">CONFIGURA EL EXPERIMENTO</span><h2>${isDelayed?"Compara el momento de respuesta":"Cambia una condición matemática"}</h2></div><button class="secondary-button" data-action="reset-whatif">Restablecer</button></div>${controls}<p class="caption">Los días se cuentan desde el 1 de marzo de 2020. Horizonte actual: día ${endDay} · ${scenarioDate(endDay)}. La misma función oficial es la referencia; solo cambia la regla descrita.</p>${cityTransfer}</section><section class="panel chart-panel scenario-chart">${chart(series,{title:isDelayed?"Respuesta temprana frente a respuesta retrasada":"Trayectoria de referencia y escenario alternativo",xTitle:"Día desde el 1 de marzo de 2020",yTitle:"Valor matemático acumulado",markers,zeroLine:true})}<p class="caption">Los puntos ámbar son observaciones históricas reales; las líneas son funciones y escenarios matemáticos. Las marcas verticales señalan el inicio de cada intervención. Las líneas posteriores al 30 de marzo son extrapolaciones.</p></section><section class="metric-grid scenario-metrics">${scenarioResultCard(`${mainLabel} · día ${endDay}`,format(summary.reference),scenarioDate(endDay),isDelayed)}${scenarioResultCard(`${altLabel} · día ${endDay}`,format(summary.alternative),scenarioDate(endDay),!isDelayed)}${scenarioResultCard(differenceLabel,`${summary.difference>0?"+":""}${format(summary.difference)}`,"unidades matemáticas",true)}${scenarioResultCard("Variación relativa",relative,"respecto al valor absoluto de la referencia")}</section><p class="science-note">La diferencia es el resultado de esta regla matemática; no representa contagios reales evitados ni eficacia causal.</p>${warnings.map(message=>`<section class="notice scenario-warning">${esc(message)}</section>`).join("")}<details class="panel experiment scenario-explainer"><summary><span>¿Cómo funciona este escenario?</span><small>Fórmulas, parámetros y límites</small></summary><div class="experiment-content"><p>La trayectoria base es la función oficial <b>B(t)</b>. Su incremento diario discreto es <b>ΔB(t) = B(t) − B(t−1)</b>. La reducción elegida es <b>r</b> y el factor que se conserva es <b>q = 1 − r/100</b>.</p><p>Hasta el día elegido, la trayectoria alternativa coincide con la función. Después, cada incremento se actualiza como <b>S(t) = S(t−1) + q · ΔB(t)</b>. Así, una reducción del 40 % deja <b>q = 0,60</b>: si la función aumenta 1.000 unidades en un paso, el escenario suma 600.</p><p>La respuesta retrasada utiliza la misma fórmula y los mismos porcentajes; solamente empieza en el día <b>t₀ + retraso</b>. Si el retraso es cero, ambas trayectorias coinciden. La diferencia final se calcula como <b>alternativa − referencia</b>; el porcentaje usa el valor absoluto de la referencia como denominador.</p><p>No se redondea ningún valor usado en los cálculos. Las funciones no modelan contactos, transmisión, inmunidad, vacunación ni causalidad. Se conservan incrementos y valores negativos si los produce la ecuación.</p></div></details>`;
  }

  const selectedModels = state.whatIfModels;
  const growth = selectedModels.length ? uncontrolledPaths(selectedModels, state.whatIfEnd) : null;
  const growthSeries = growth ? [
    { name: "Casos observados · hasta 30 mar", color: "#f2be73", points: history.filter(point => point.x <= state.whatIfEnd), dots: true, radius: 4 },
    ...selectedModels.map(model=>({name:`Función ${model}`,color:MODEL_COLORS[model],points:growth.days.map((x,index)=>({x,y:growth.paths[model][index]})),line:true,tooltips:true})),
  ] : [];
  const growthWarnings = growth ? selectedModels.flatMap(model=>{
    const path=growth.paths[model];
    const warnings=[];
    if(path.some(value=>value<0)) warnings.push(`${model}: la función contiene valores negativos. Se mantienen sin recorte; no son casos epidemiológicos plausibles.`);
    if(hasNegativeIncrements(path)) warnings.push(`${model}: la función incluye incrementos descendentes en el horizonte. Se representa la ecuación sin corregirla.`);
    return [...new Set(warnings)];
  }):[];
  if(growth){
    const largest=Math.max(...Object.values(growth.paths).flat());
    const initialScale=Math.max(...selectedModels.map(model=>Math.abs(growth.paths[model][0])));
    if(largest>10*initialScale) growthWarnings.push("La extrapolación alcanza valores muy superiores al inicio. La escala puede ocultar otras curvas; cambia de escala o muestra modelos individualmente. No se recortan cifras.");
  }
  const modelControls = `<div class="model-checks scenario-models"><span>FUNCIONES OFICIALES</span>${MODEL_NAMES.map(model=>`<label class="check-control"><input type="checkbox" data-scenario-model="${model}" ${selectedModels.includes(model)?"checked":""}><span>${model}</span></label>`).join("")}</div>`;
  const growthCards = growth ? selectedModels.map(model=>{
    const path=growth.paths[model];
    return scenarioResultCard(`${model} · día ${state.whatIfEnd}`,format(path.at(-1)),`cambio desde día 0: ${path.at(-1)-path[0]>0?"+":""}${format(path.at(-1)-path[0])}`);
  }).join("") : "";
  const logUnavailable = state.whatIfScale === "Logarítmica" && growth && Object.values(growth.paths).every(path=>path.every(value=>value<=0));
  return `${pageHeader("whatif","¿Qué habría pasado si…?","Cambia las condiciones. Explora otros resultados matemáticos.")}<section class="notice strong-notice">Este modo prolonga funciones matemáticas oficiales sin intervención. No representa la evolución real de la pandemia ni una reconstrucción causal; tampoco puede determinar qué efecto habrían tenido medidas sanitarias.</section><nav class="tab-nav scenario-tabs" aria-label="Modo de simulación">${tabMarkup}</nav><section class="panel controls-panel scenario-controls"><div class="panel-head"><div><span class="eyebrow">EXPLORA LA TENDENCIA</span><h2>Funciones oficiales sin cambios</h2></div><button class="secondary-button" data-action="reset-whatif">Restablecer</button></div><div class="control-row">${range("whatIfEnd","Día final del horizonte",1,36,1,state.whatIfEnd)}${select("whatIfScale",["Lineal","Logarítmica"],"ESCALA VERTICAL")}</div>${modelControls}<p class="caption">Las funciones conservan sus coeficientes completos. El histórico se muestra como puntos, separado de las curvas matemáticas. Día final: ${scenarioDate(state.whatIfEnd)}.</p></section>${selectedModels.length?`<section class="panel chart-panel scenario-chart">${chart(growthSeries,{title:"Continuación matemática de las funciones oficiales",xTitle:"Día desde el 1 de marzo de 2020",yTitle:"Valor de la función",logY:state.whatIfScale==="Logarítmica"})}<p class="caption">La escala logarítmica solo representa valores positivos; no modifica los valores originales de las funciones.</p></section><section class="metric-grid scenario-metrics">${growthCards}</section>${growthWarnings.map(message=>`<section class="notice scenario-warning">${esc(message)}</section>`).join("")}${logUnavailable?`<section class="notice">Las funciones seleccionadas no tienen valores positivos en este horizonte; no hay puntos que representar en escala logarítmica.</section>`:""}`:`<section class="panel empty-state">Selecciona al menos una función oficial para ver su trayectoria.</section>`}<details class="panel experiment scenario-explainer"><summary><span>¿Cómo funciona este escenario?</span><small>Fórmulas, parámetros y límites</small></summary><div class="experiment-content"><p>Este modo calcula directamente las ecuaciones fijadas en la fase matemática: lineal <b>L(t)=at+b</b>, cuadrática <b>Q(t)=at²+bt+c</b> y exponencial <b>E(t)=Aeᵏᵗ</b>.</p><p>La escala vertical puede ser lineal o logarítmica. La escala logarítmica descarta de la visualización valores cero y negativos; no transforma, corrige ni elimina los resultados del cálculo.</p><p>Los valores de los días posteriores al 30 de marzo son extrapolaciones de una tendencia ajustada a un periodo corto. No constituyen una predicción sanitaria fiable.</p></div></details>`;
}

function render() {
  const openDetails = Array.from(main.querySelectorAll("details")).map(item => item.open);
  renderNavigation();
  const evaluation = evaluateModels(rows);
  main.innerHTML = state.section === "dashboard" ? dashboard() : state.section === "models" ? modelLab(evaluation) : state.section === "prediction" ? predictionPage() : state.section === "whatif" ? whatIfPage() : state.section === "world" ? `${cityModeTabs(state.worldMode)}${state.worldMode === "cities" ? cityMarkup() : worldMarkup()}` : resultsPage(evaluation);
  main.querySelectorAll("details").forEach((item,index)=>{if(openDetails[index])item.open=true;});
  document.querySelectorAll("[data-section]").forEach(button=>button.addEventListener("click",()=>{if(button.dataset.section!=="world")stopCityPlayback();state.section=button.dataset.section;render();window.scrollTo({top:0,behavior:"smooth"})}));
  document.querySelector("[data-action=whatif-to-city]")?.addEventListener("click",()=>{stopCityPlayback();applyCityScenarioFromWhatIf({model:state.whatIfModel,day:state.whatIfDay,endDay:state.whatIfEnd,reduction:state.whatIfReduction});state.section="world";state.worldMode="cities";render();window.scrollTo({top:0,behavior:"smooth"})});
  document.querySelector("[data-action=city-to-whatif]")?.addEventListener("click",()=>{stopCityPlayback();const scenario=cityScenarioForWhatIf();Object.assign(state,{section:"whatif",whatIfMode:"Intervención temprana",whatIfModel:scenario.model,whatIfDay:scenario.day,whatIfReduction:scenario.reduction,whatIfEnd:scenario.endDay});render();window.scrollTo({top:0,behavior:"smooth"})});
  document.querySelectorAll("[data-world-mode]").forEach(button=>button.addEventListener("click",()=>{stopCityPlayback();state.worldMode=button.dataset.worldMode;render();window.scrollTo({top:0,behavior:"smooth"})}));
  document.querySelectorAll("[data-tab]").forEach(button=>button.addEventListener("click",()=>{state.labTab=button.dataset.tab;render()}));
  document.querySelectorAll("[data-scenario-mode]").forEach(button=>button.addEventListener("click",()=>{state.whatIfMode=button.dataset.scenarioMode;render()}));
  document.querySelectorAll("[data-scenario-model]").forEach(control=>control.addEventListener("change",event=>{const model=control.dataset.scenarioModel;state.whatIfModels=event.target.checked?[...new Set([...state.whatIfModels,model])]:state.whatIfModels.filter(item=>item!==model);render()}));
  document.querySelector("[data-action=reset-whatif]")?.addEventListener("click",()=>{Object.assign(state,{whatIfModel:"Exponencial",whatIfDay:20,whatIfReduction:40,whatIfDelay:5,whatIfEnd:36,whatIfModels:MODEL_NAMES.slice(),whatIfScale:"Lineal"});render()});
  document.querySelector("[data-action=restore-loss]")?.addEventListener("click",()=>{state.lossSlope=COEFFICIENTS.Lineal[0];state.lossIntercept=COEFFICIENTS.Lineal[1];render()});
  document.querySelectorAll("[data-state]").forEach(control=>control.addEventListener("change",event=>{
    const key=control.dataset.state;
    const numeric=["velocityDay","accelerationDay","startDay","endDay","playgroundDays","precisionDay","lossSlope","lossIntercept","horizon","threshold","whatIfDay","whatIfReduction","whatIfDelay","whatIfEnd"].includes(key);
    state[key]=control.type==="checkbox"?event.target.checked:numeric?Number(event.target.value):event.target.value;
    if(key==="startDay" && state.startDay>=state.endDay) state.endDay=state.startDay+1;
    if(key==="endDay" && state.endDay<=state.startDay) state.startDay=state.endDay-1;
    if(key==="threshold" && (!Number.isFinite(state.threshold)||state.threshold<1)) state.threshold=1;
    if(key==="whatIfDay"||key==="whatIfDelay") { const minEnd=Math.max(1,Math.min(state.whatIfDay,state.whatIfMode==="Respuesta retrasada"?26:35)+(state.whatIfMode==="Respuesta retrasada"?state.whatIfDelay:0)); state.whatIfEnd=Math.max(state.whatIfEnd,minEnd); }
    render();
  }));
  document.querySelectorAll("[data-model-choice]").forEach(control=>control.addEventListener("change",event=>{
    const model=control.dataset.modelChoice;
    const chosen=state.selectedPredictionModels;
    state.selectedPredictionModels=event.target.checked?[...new Set([...chosen,model])]:chosen.filter(value=>value!==model);
    if(!state.selectedPredictionModels.length) state.selectedPredictionModels=[model];
    render();
  }));
  if(state.section==="world") state.worldMode === "cities" ? mountCities(main) : mountWorld(main);
}

loadNationalData().then(dataset=>{rows=dataset;render();}).catch(error=>{
  main.innerHTML=`<div class="error-panel"><h1>No se pudo iniciar el laboratorio</h1><p>${esc(error.message)}</p><p>Abre esta edición desde un servidor local para cargar sus datos.</p></div>`;
});
