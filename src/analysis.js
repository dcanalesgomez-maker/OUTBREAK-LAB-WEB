import { COEFFICIENTS, predict } from "./models.js";
import { dailyChanges, descriptiveStatistics, errorDetails, forecastHorizonMetrics, mae, metrics, naiveBaseline, residuals, rmse } from "./metrics.js";
import { fitModel } from "./fit.js";

export function evaluateModels(rows) {
  const training = rows.slice(0, 23);
  const validation = rows.slice(23, 30);
  if (training.length !== 23 || validation.length !== 7) throw new RangeError("El análisis requiere las 30 observaciones auditadas.");
  const trainingDays = training.map(row => row.dia);
  const trainingActual = training.map(row => row.casos_acumulados);
  const validationDays = validation.map(row => row.dia);
  const validationActual = validation.map(row => row.casos_acumulados);
  const models = Object.fromEntries(Object.keys(COEFFICIENTS).map(model => {
    const coefficients = fitModel(model, trainingDays, trainingActual);
    const trainingEstimates = trainingDays.map(day => predict(model, day, coefficients));
    const validationEstimates = validationDays.map(day => predict(model, day, coefficients));
    return [model, { coefficients, trainingEstimates, validationEstimates, trainingMetrics: metrics(trainingActual, trainingEstimates), validationMetrics: metrics(validationActual, validationEstimates) }];
  }));
  const validationEstimates = Object.fromEntries(Object.entries(models).map(([name, values]) => [name, values.validationEstimates]));
  const baseline = naiveBaseline(trainingActual, validation.length);
  const residualRows = [];
  for (const [period, subset, estimatesKey] of [["Entrenamiento", training, "trainingEstimates"], ["Validación", validation, "validationEstimates"]]) {
    for (const [model, result] of Object.entries(models)) {
      const actual = subset.map(row => row.casos_acumulados);
      const estimates = result[estimatesKey];
      const details = errorDetails(actual, estimates);
      subset.forEach((row, i) => residualRows.push({ ...row, model, period, estimate: estimates[i], ...details[i] }));
    }
  }
  const maxErrors = Object.keys(models).map(model => {
    const rowsForModel = residualRows.filter(row => row.model === model);
    return rowsForModel.reduce((largest, row) => row.absolute > largest.absolute ? row : largest, rowsForModel[0]);
  });
  const daily = dailyChanges(rows.map(row => row.casos_acumulados));
  return {
    training,
    validation,
    models,
    baseline: { values: baseline, metrics: metrics(validationActual, baseline) },
    stability: forecastHorizonMetrics(validationActual, validationEstimates),
    residualRows,
    maxErrors,
    dailyChanges: daily,
    dailyStatistics: descriptiveStatistics(daily),
    actual: validationActual,
  };
}

export function modelValidationSummary(result) {
  return Object.entries(result.models).map(([model, values]) => ({ model, ...values.validationMetrics }));
}

export function comparesToBaseline(result) {
  return Object.entries(result.models).map(([model, values]) => ({
    model,
    MAE: values.validationMetrics.MAE,
    RMSE: values.validationMetrics.RMSE,
    betterMAE: values.validationMetrics.MAE < result.baseline.metrics.MAE,
    betterRMSE: values.validationMetrics.RMSE < result.baseline.metrics.RMSE,
  }));
}

export { mae, rmse, residuals };
