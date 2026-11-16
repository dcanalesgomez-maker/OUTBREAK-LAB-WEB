const LOW = [35, 95, 119];
const HIGH = [255, 190, 71];
export const NO_DATA = "#1f262a";

let cached;
export function decodeWorldData(metadata, casesBuffer, boundaries) {
  if (!Array.isArray(metadata?.dates) || !Array.isArray(metadata?.entities) || !boundaries?.features) throw new Error("Los archivos del mapa no tienen el formato esperado.");
  const expected = metadata.dates.length * metadata.entities.length;
  if (casesBuffer.byteLength !== expected * 4) throw new Error("El archivo de casos está incompleto o dañado.");
  const view = new DataView(casesBuffer);
  const cases = new Int32Array(expected);
  for (let i = 0; i < expected; i++) {
    cases[i] = view.getInt32(i * 4, true);
    if (cases[i] < 0) throw new Error("La serie contiene valores negativos.");
  }
  return { dates: metadata.dates, entities: metadata.entities, boundaries, cases, byIso: new Map(metadata.entities.map((item, index) => [item.iso, index]).filter(([iso]) => iso)) };
}

export function loadWorldData(fetcher = fetch, base = "./data/world/") {
  if (!cached) cached = Promise.all(["world-metadata.json", "world-cases.bin", "world-boundaries.geojson"].map(async file => {
    const response = await fetcher(base + file);
    if (!response.ok) throw new Error(`No se pudo cargar ${file} (${response.status}).`);
    return file.endsWith(".bin") ? response.arrayBuffer() : response.json();
  })).then(([metadata, cases, boundaries]) => decodeWorldData(metadata, cases, boundaries)).catch(error => { cached = undefined; throw error; });
  return cached;
}

export function valueAt(world, entityIndex, dateIndex, perMillion = false) {
  const cases = world.cases[entityIndex * world.dates.length + dateIndex];
  const population = world.entities[entityIndex].population;
  if (perMillion && !(Number.isFinite(population) && population > 0)) return null;
  return perMillion ? cases / population * 1_000_000 : cases;
}

export function mapColor(value, maximum) {
  if (value == null || !Number.isFinite(value)) return NO_DATA;
  const ratio = maximum > 0 ? Math.max(0, Math.min(1, Math.log1p(value) / Math.log1p(maximum))) : 0;
  return `rgb(${LOW.map((start, index) => Math.trunc(start + (HIGH[index] - start) * ratio)).join(",")})`;
}

export function snapshot(world, dateIndex, perMillion = false) {
  const values = world.entities.map((entity, index) => ({ entity, index, cases: valueAt(world, index, dateIndex), value: valueAt(world, index, dateIndex, perMillion) }));
  const valid = values.filter(item => item.value != null);
  const maximum = valid.reduce((largest, item) => Math.max(largest, item.value), 0);
  return { values, maximum, withData: valid.length, top: valid.toSorted ? [...valid].sort((a,b)=>b.value-a.value)[0] : valid.sort((a,b)=>b.value-a.value)[0] };
}

export function history(world, entityIndex, perMillion = false) {
  return world.dates.map((date, dateIndex) => ({ date, value: valueAt(world, entityIndex, dateIndex, perMillion) }));
}

export function compareCountries(world, indices, perMillion = false) {
  return indices.map(index => ({ entity: world.entities[index], points: history(world, index, perMillion) }));
}

export function indexForDate(dates, value) {
  const index = dates.indexOf(value);
  return index < 0 ? 0 : index;
}
