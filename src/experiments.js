import { COEFFICIENTS, predict } from "./models.js";
import { mae, mse, rmse, errorDetails } from "./metrics.js";
import { fitModel } from "./fit.js";

export function roundHalfEven(value, digits) {
  if (digits == null) return value;
  const scale = 10 ** digits;
  const absolute = Math.abs(value * scale);
  const lower = Math.floor(absolute);
  const fraction = absolute - lower;
  const rounded = fraction > 0.5 ? lower + 1 : fraction < 0.5 ? lower : lower % 2 ? lower + 1 : lower;
  return Math.sign(value) * rounded / scale;
}

export function comparePrecision(model, day, digits) {
  const originalCoefficients = COEFFICIENTS[model];
  const roundedCoefficients = originalCoefficients.map(value => roundHalfEven(value, digits));
  const original = predict(model, day, originalCoefficients);
  const rounded = predict(model, day, roundedCoefficients);
  const details = errorDetails([original], [rounded])[0];
  return { originalCoefficients, roundedCoefficients, original, rounded, absoluteError: details.absolute, relativePercent: details.relativePercent };
}

export function runPlayground(model, trainingDays, rows) {
  if (!Number.isInteger(trainingDays) || trainingDays < 8 || trainingDays > 23) throw new RangeError("El entrenamiento experimental debe usar 8–23 días.");
  const selected = rows.slice(0, trainingDays);
  const days = selected.map(row => row.dia);
  const actual = selected.map(row => row.casos_acumulados);
  const coefficients = fitModel(model, days, actual);
  const estimates = days.map(day => predict(model, day, coefficients));
  return { coefficients, estimates, MAE: mae(actual, estimates), RMSE: rmse(actual, estimates) };
}

export function lossExplorer(slope, intercept, days, actual, pointCount = 161) {
  if (!Number.isFinite(slope) || slope < -3000 || slope > 5000) throw new RangeError("La pendiente debe estar entre −3000 y 5000.");
  if (!Number.isFinite(intercept) || intercept < -20000 || intercept > 20000) throw new RangeError("El intercepto debe estar entre −20000 y 20000.");
  const estimates = days.map(day => slope * day + intercept);
  const official = COEFFICIENTS.Lineal;
  const optimum = days.reduce((sum, day, i) => sum + day * (actual[i] - intercept), 0) / days.reduce((sum, day) => sum + day ** 2, 0);
  const curve = Array.from({ length: pointCount }, (_, i) => {
    const candidate = -3000 + i * 8000 / (pointCount - 1);
    return { slope: candidate, MSE: mse(actual, days.map(day => candidate * day + intercept)) };
  });
  return {
    estimates,
    MSE: mse(actual, estimates),
    officialMSE: mse(actual, days.map(day => day * official[0] + official[1])),
    fixedInterceptOptimum: optimum,
    optimumMSE: mse(actual, days.map(day => day * optimum + intercept)),
    curve,
  };
}
