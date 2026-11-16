function checkedPair(actual, estimated) {
  if (!Array.isArray(actual) || !Array.isArray(estimated) || actual.length === 0 ||
      actual.length !== estimated.length || [...actual, ...estimated].some(value => !Number.isFinite(value))) {
    throw new TypeError("Se requieren dos listas finitas, no vacías y del mismo tamaño.");
  }
  return [actual, estimated];
}

export function mse(actual, estimated) {
  const [a, e] = checkedPair(actual, estimated);
  return a.reduce((sum, value, i) => sum + (value - e[i]) ** 2, 0) / a.length;
}

export function mae(actual, estimated) {
  const [a, e] = checkedPair(actual, estimated);
  return a.reduce((sum, value, i) => sum + Math.abs(value - e[i]), 0) / a.length;
}

export function rmse(actual, estimated) { return Math.sqrt(mse(actual, estimated)); }

export function rSquared(actual, estimated) {
  const [a, e] = checkedPair(actual, estimated);
  const mean = a.reduce((sum, value) => sum + value, 0) / a.length;
  const total = a.reduce((sum, value) => sum + (value - mean) ** 2, 0);
  if (total === 0) return null;
  return 1 - a.reduce((sum, value, i) => sum + (value - e[i]) ** 2, 0) / total;
}

export function metrics(actual, estimated) {
  return { MAE: mae(actual, estimated), RMSE: rmse(actual, estimated), R2: rSquared(actual, estimated) };
}

export function residuals(actual, estimated) {
  const [a, e] = checkedPair(actual, estimated);
  return a.map((value, i) => value - e[i]);
}

export function errorDetails(actual, estimated) {
  const errors = residuals(actual, estimated);
  return errors.map((error, i) => ({
    residual: error,
    absolute: Math.abs(error),
    relativePercent: actual[i] === 0 ? null : Math.abs(error) / Math.abs(actual[i]) * 100,
    classification: error > 0 ? "Subestimación" : error < 0 ? "Sobreestimación" : "Exacto",
  }));
}

export function dailyChanges(cumulative) {
  if (!Array.isArray(cumulative) || cumulative.length < 2 || cumulative.some(value => !Number.isFinite(value))) {
    throw new TypeError("Se necesitan al menos dos acumulados finitos.");
  }
  return cumulative.slice(1).map((value, i) => value - cumulative[i]);
}

export function descriptiveStatistics(values) {
  if (!Array.isArray(values) || values.length === 0 || values.some(value => !Number.isFinite(value))) {
    throw new TypeError("Se necesita una lista no vacía de valores finitos.");
  }
  const ordered = [...values].sort((a, b) => a - b);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const middle = Math.floor(ordered.length / 2);
  const median = ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
  return {
    mean,
    median,
    min: ordered[0],
    max: ordered.at(-1),
    populationStd: Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length),
  };
}

export function naiveBaseline(trainingValues, horizon) {
  if (!Array.isArray(trainingValues) || trainingValues.length === 0 || trainingValues.some(value => !Number.isFinite(value))) {
    throw new TypeError("El baseline necesita entrenamiento finito.");
  }
  if (!Number.isInteger(horizon) || horizon < 1 || horizon > 7) throw new RangeError("El horizonte debe estar entre 1 y 7.");
  return Array(horizon).fill(trainingValues.at(-1));
}

export function forecastHorizonMetrics(actual, estimatesByModel, horizons = [1, 3, 5, 7]) {
  return Object.entries(estimatesByModel).flatMap(([model, estimates]) => horizons.map(horizon => {
    if (horizon > actual.length || horizon < 1) throw new RangeError("Horizonte fuera de la validación disponible.");
    return { model, horizon, MAE: mae(actual.slice(0, horizon), estimates.slice(0, horizon)), RMSE: rmse(actual.slice(0, horizon), estimates.slice(0, horizon)) };
  }));
}
