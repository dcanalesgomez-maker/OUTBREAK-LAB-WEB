// Equivalentes JavaScript de las ecuaciones oficiales de models.py.
export const COEFFICIENTS = Object.freeze({
  Lineal: Object.freeze([1374.76581027668, -6756.467391304345]),
  Cuadrático: Object.freeze([115.1030208921515, -1157.5006493506523, 2106.46521739132]),
  Exponencial: Object.freeze([102.40055724010803, 0.2862071570140057]),
});

export function predict(model, day, coefficients = COEFFICIENTS[model]) {
  if (!coefficients || !Number.isFinite(day)) throw new TypeError("Modelo o día no válido.");
  let value;
  if (model === "Lineal") value = coefficients[0] * day + coefficients[1];
  else if (model === "Cuadrático") value = coefficients[0] * day ** 2 + coefficients[1] * day + coefficients[2];
  else if (model === "Exponencial") value = coefficients[0] * Math.exp(coefficients[1] * day);
  else throw new TypeError(`Modelo desconocido: ${model}`);
  if (!Number.isFinite(value)) throw new RangeError("La predicción no es finita.");
  return value;
}

export function mae(actual, estimated) {
  const [a, e] = checkedPair(actual, estimated);
  return a.reduce((sum, value, i) => sum + Math.abs(value - e[i]), 0) / a.length;
}

export function rmse(actual, estimated) {
  const [a, e] = checkedPair(actual, estimated);
  return Math.sqrt(a.reduce((sum, value, i) => sum + (value - e[i]) ** 2, 0) / a.length);
}

export function rSquared(actual, estimated) {
  const [a, e] = checkedPair(actual, estimated);
  const mean = a.reduce((sum, value) => sum + value, 0) / a.length;
  const total = a.reduce((sum, value) => sum + (value - mean) ** 2, 0);
  if (total === 0) return null;
  const residual = a.reduce((sum, value, i) => sum + (value - e[i]) ** 2, 0);
  return 1 - residual / total;
}

export function derivative(model, day, coefficients = COEFFICIENTS[model]) {
  if (!coefficients || !Number.isFinite(day)) throw new TypeError("Modelo o día no válido.");
  if (model === "Lineal") return coefficients[0];
  if (model === "Cuadrático") return 2 * coefficients[0] * day + coefficients[1];
  if (model === "Exponencial") return coefficients[1] * predict(model, day, coefficients);
  throw new TypeError(`Modelo desconocido: ${model}`);
}

export function secondDerivative(model, day, coefficients = COEFFICIENTS[model]) {
  if (!coefficients || !Number.isFinite(day)) throw new TypeError("Modelo o día no válido.");
  if (model === "Lineal") return 0;
  if (model === "Cuadrático") return 2 * coefficients[0];
  if (model === "Exponencial") return coefficients[1] ** 2 * predict(model, day, coefficients);
  throw new TypeError(`Modelo desconocido: ${model}`);
}

export function modelIncrement(model, startDay, endDay, coefficients = COEFFICIENTS[model]) {
  if (!Number.isFinite(startDay) || !Number.isFinite(endDay) || endDay <= startDay) {
    throw new RangeError("El día final debe ser posterior al inicial.");
  }
  return predict(model, endDay, coefficients) - predict(model, startDay, coefficients);
}

function checkedPair(actual, estimated) {
  if (!Array.isArray(actual) || !Array.isArray(estimated) || !actual.length || actual.length !== estimated.length ||
      [...actual, ...estimated].some((value) => !Number.isFinite(value))) {
    throw new TypeError("Se requieren dos listas no vacías, finitas y del mismo tamaño.");
  }
  return [actual, estimated];
}
