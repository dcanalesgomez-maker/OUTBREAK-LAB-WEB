import { COEFFICIENTS, predict } from "./models.js";

export function projectionFor(model, horizon) {
  if (!Number.isInteger(horizon) || horizon < 1 || horizon > 7) throw new RangeError("El horizonte debe estar entre 1 y 7 días.");
  return Array.from({ length: horizon }, (_, index) => {
    const day = 30 + index;
    const date = new Date(Date.UTC(2020, 2, 1 + day)).toISOString().slice(0, 10);
    return { day, date, cases: predict(model, day) };
  });
}

export function solveThreshold(model, threshold, startDay = 0, endDay = 36, coefficients = COEFFICIENTS[model]) {
  if (!Number.isFinite(threshold) || threshold <= 0 || !Number.isFinite(startDay) || !Number.isFinite(endDay) || startDay < 0 || endDay > 36 || startDay > endDay) {
    throw new RangeError("Umbral positivo e intervalo 0–36 requeridos.");
  }
  const roots = [];
  if (model === "Lineal") {
    const [a, b] = coefficients;
    if (a !== 0) roots.push((threshold - b) / a);
  } else if (model === "Cuadrático") {
    const [a, b, c] = coefficients;
    if (a === 0) {
      if (b !== 0) roots.push((threshold - c) / b);
    } else {
      const discriminant = b ** 2 - 4 * a * (c - threshold);
      if (discriminant >= 0) {
        const root = Math.sqrt(discriminant);
        roots.push((-b - root) / (2 * a), (-b + root) / (2 * a));
      }
    }
  } else if (model === "Exponencial") {
    const [initial, rate] = coefficients;
    if (initial <= 0) throw new RangeError("El valor inicial exponencial debe ser positivo.");
    if (rate !== 0) roots.push((Math.log(threshold) - Math.log(initial)) / rate);
  } else throw new TypeError(`Modelo desconocido: ${model}`);
  return [...new Set(roots.filter(root => Number.isFinite(root) && root >= startDay - 1e-10 && root <= endDay + 1e-10).map(root => Math.min(endDay, Math.max(startDay, root))).sort((a, b) => a - b)
    .filter((root, index, values) => index === 0 || Math.abs(root - values[index - 1]) > 1e-10))];
}

export function firstHistoricalThreshold(rows, threshold) {
  return rows.find(row => row.casos_acumulados >= threshold) ?? null;
}
