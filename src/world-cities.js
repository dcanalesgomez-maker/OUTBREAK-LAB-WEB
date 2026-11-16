import { COEFFICIENTS, predict } from "./models.js";
import { interventionPath } from "./scenarios.js";

export const CITY_MAX_DAY = 36;
export const CITY_ALLOCATION_TOLERANCE = Object.freeze({ rtol: 1e-10, atol: 1e-7 });
let cityCache;

export function decodeCities(rows) {
  if (!Array.isArray(rows) || rows.length !== 12) throw new Error("El catálogo debe contener las 12 ciudades de referencia.");
  const seen = new Set();
  for (const row of rows) {
    if (!row || typeof row.city !== "string" || !row.city.trim() || seen.has(row.city) ||
        typeof row.country !== "string" || !Number.isFinite(row.lat) || !Number.isFinite(row.lon) ||
        row.lat < -90 || row.lat > 90 || row.lon < -180 || row.lon > 180) {
      throw new Error("El catálogo contiene una ciudad duplicada o datos geográficos no válidos.");
    }
    seen.add(row.city);
  }
  return rows.map(row => Object.freeze({ ...row }));
}

export function loadCities(fetcher = fetch, url = "./data/world/cities.json") {
  if (!cityCache) cityCache = fetcher(url).then(response => {
    if (!response.ok) throw new Error(`No se pudo cargar el catálogo de ciudades (${response.status}).`);
    return response.json();
  }).then(decodeCities).catch(error => { cityCache = undefined; throw error; });
  return cityCache;
}

export function cityTrajectory(model, startDay, endDay, intervention = null) {
  if (!Object.hasOwn(COEFFICIENTS, model)) throw new RangeError(`Modelo desconocido: ${model}`);
  if (!Number.isInteger(startDay) || !Number.isInteger(endDay) || startDay < 0 || startDay >= endDay || endDay > CITY_MAX_DAY) {
    throw new RangeError("El intervalo debe cumplir 0 ≤ inicio < final ≤ 36.");
  }
  const days = Array.from({ length: endDay - startDay + 1 }, (_, index) => startDay + index);
  let values;
  if (intervention) {
    if (!Number.isInteger(intervention.day) || intervention.day < startDay || intervention.day > endDay ||
        !Number.isFinite(intervention.reduction) || intervention.reduction < 0 || intervention.reduction > 90) {
      throw new RangeError("La intervención debe estar dentro del horizonte y reducir entre 0 % y 90 %.");
    }
    const fullPath = interventionPath(model, intervention.day, intervention.reduction, endDay);
    values = fullPath.scenario.slice(startDay, endDay + 1);
  } else values = days.map(day => predict(model, day));
  if (!values.every(Number.isFinite)) throw new RangeError("El modelo produjo un valor no finito.");
  return { days, totals: values };
}

export function distributeCities(days, totals, origin, connectionWeights, intensityPercent, activationDay) {
  if (!Array.isArray(days) || !Array.isArray(totals) || !days.length || days.length !== totals.length ||
      !days.every(Number.isInteger) || !totals.every(Number.isFinite)) throw new TypeError("Días y totales deben ser listas finitas de igual tamaño.");
  if (days.some((day, index) => day < 0 || day > CITY_MAX_DAY || (index > 0 && day !== days[index - 1] + 1))) {
    throw new RangeError("Los días deben ser consecutivos y estar entre 0 y 36.");
  }
  if (typeof origin !== "string" || !origin.trim()) throw new TypeError("Selecciona una ciudad de origen.");
  if (!Number.isFinite(intensityPercent) || intensityPercent < 0 || intensityPercent > 100) throw new RangeError("La intensidad debe estar entre 0 % y 100 %.");
  if (!Number.isInteger(activationDay) || activationDay < days[0] || activationDay > days.at(-1)) throw new RangeError("El día de activación debe estar dentro del intervalo.");
  if (!connectionWeights || typeof connectionWeights !== "object" || Array.isArray(connectionWeights)) throw new TypeError("Los pesos deben ser un objeto ciudad-valor.");
  const destinations = Object.entries(connectionWeights);
  const seen = new Set([origin]);
  for (const [city, weight] of destinations) {
    if (seen.has(city)) throw new RangeError("El origen no puede repetirse entre los destinos.");
    if (!Number.isFinite(weight) || weight < 0) throw new RangeError("Los pesos deben ser finitos y no negativos.");
    seen.add(city);
  }
  const cities = [origin, ...destinations.map(([city]) => city)];
  const values = Array.from({ length: days.length }, () => Array(cities.length).fill(0));
  values[0][0] = totals[0];
  for (let row = 1; row < days.length; row += 1) {
    const increment = totals[row] - totals[row - 1];
    const active = days[row] >= activationDay ? destinations.filter(([, weight]) => weight > 0) : [];
    values[row] = [...values[row - 1]];
    if (!active.length) { values[row][0] += increment; continue; }
    const weightSum = active.reduce((sum, [, weight]) => sum + weight, 0);
    if (!Number.isFinite(weightSum) || weightSum <= 0) throw new RangeError("La suma de los pesos debe ser finita y positiva.");
    const share = intensityPercent / 100;
    values[row][0] += (1 - share) * increment;
    for (const [city, weight] of active) values[row][cities.indexOf(city)] += share * increment * weight / weightSum;
  }
  const checks = values.map((row, index) => ({ day: days[index], assigned: row.reduce((sum, value) => sum + value, 0), expected: totals[index] }));
  const failures = checks.filter(item => Math.abs(item.assigned - item.expected) > CITY_ALLOCATION_TOLERANCE.atol + CITY_ALLOCATION_TOLERANCE.rtol * Math.abs(item.expected));
  if (values.flat().some(value => !Number.isFinite(value)) || failures.length) throw new Error("La distribución no conserva el total matemático por día.");
  return { days: [...days], cities, values, checks };
}

export function compareCityScenarios(firstValue, secondValue) {
  if (!Number.isFinite(firstValue) || !Number.isFinite(secondValue)) throw new TypeError("Los escenarios deben ser finitos.");
  const difference = secondValue - firstValue;
  return { first: firstValue, second: secondValue, difference, differencePercent: firstValue === 0 ? null : difference / Math.abs(firstValue) * 100 };
}

export function cityValue(allocation, day, city) {
  const row = allocation.days.indexOf(day), column = allocation.cities.indexOf(city);
  if (row < 0 || column < 0) return null;
  return allocation.values[row][column];
}

export function hypotheticalConnections(cities, origin, weights, day, startDay, activationDay) {
  if (day <= startDay || day < activationDay) return [];
  const byName = new Map(cities.map(city => [city.city, city]));
  const source = byName.get(origin);
  if (!source) throw new RangeError("La ciudad de origen no tiene coordenadas disponibles.");
  return Object.entries(weights).filter(([, weight]) => weight > 0).map(([destination, weight]) => {
    const target = byName.get(destination);
    if (!target || !Number.isFinite(weight) || weight < 0) throw new RangeError("La conexión seleccionada no es válida.");
    return { origin, destination, weight, source, target };
  });
}
