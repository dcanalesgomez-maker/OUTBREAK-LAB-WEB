import { COEFFICIENTS, predict } from "./models.js";

export const MAX_SCENARIO_DAY = 36;
export const MAX_DELAY_DAYS = 10;
export const MAX_REDUCTION_PERCENT = 90;
export const SCENARIO_MODELS = Object.keys(COEFFICIENTS);

function validateHorizon(endDay) {
  if (!Number.isInteger(endDay) || endDay < 0 || endDay > MAX_SCENARIO_DAY) {
    throw new RangeError("El día final debe ser un entero entre 0 y 36.");
  }
}

function validateModel(modelName) {
  if (!SCENARIO_MODELS.includes(modelName)) throw new RangeError(`Modelo desconocido: ${modelName}`);
}

function validateIntervention(modelName, interventionDay, reductionPercent, endDay) {
  validateHorizon(endDay);
  validateModel(modelName);
  if (!Number.isInteger(interventionDay) || interventionDay < 0 || interventionDay > endDay) {
    throw new RangeError("El día de intervención debe ser un entero dentro del horizonte.");
  }
  if (!Number.isFinite(reductionPercent) || reductionPercent < 0 || reductionPercent > MAX_REDUCTION_PERCENT) {
    throw new RangeError("La reducción debe estar entre 0 % y 90 %.");
  }
}

/**
 * Mantiene la trayectoria oficial hasta t₀ y después aplica q a cada
 * incremento discreto. No redondea ni recorta valores negativos.
 */
export function interventionPath(modelName, interventionDay, reductionPercent, endDay) {
  validateIntervention(modelName, interventionDay, reductionPercent, endDay);
  const days = Array.from({ length: endDay + 1 }, (_, day) => day);
  const baseline = days.map(day => predict(modelName, day));
  const scenario = baseline.slice();
  const remainingFactor = 1 - reductionPercent / 100;

  for (let day = interventionDay + 1; day <= endDay; day += 1) {
    const originalIncrement = baseline[day] - baseline[day - 1];
    scenario[day] = scenario[day - 1] + remainingFactor * originalIncrement;
  }
  if (!scenario.every(Number.isFinite)) throw new RangeError("El escenario produjo valores no finitos.");
  return { days, baseline, scenario };
}

/** Compara la misma reducción iniciada en t₀ y en t₀ + retraso. */
export function delayedPaths(modelName, interventionDay, delayDays, reductionPercent, endDay) {
  validateHorizon(endDay);
  if (!Number.isInteger(delayDays) || delayDays < 0 || delayDays > MAX_DELAY_DAYS) {
    throw new RangeError("El retraso debe ser un entero entre 0 y 10 días.");
  }
  if (!Number.isInteger(interventionDay) || interventionDay < 0 || interventionDay + delayDays > endDay) {
    throw new RangeError("La intervención retrasada debe quedar dentro del horizonte.");
  }
  const early = interventionPath(modelName, interventionDay, reductionPercent, endDay);
  const delayed = interventionPath(modelName, interventionDay + delayDays, reductionPercent, endDay);
  return {
    days: early.days,
    baseline: early.baseline,
    early: early.scenario,
    delayed: delayed.scenario,
    delayedDay: interventionDay + delayDays,
  };
}

/** Evalúa una o varias funciones oficiales, sin intervención ni reajuste. */
export function uncontrolledPaths(modelNames, endDay) {
  validateHorizon(endDay);
  if (!Array.isArray(modelNames) || modelNames.length === 0 || modelNames.some(name => !SCENARIO_MODELS.includes(name))) {
    throw new RangeError("Selecciona al menos un modelo oficial.");
  }
  const days = Array.from({ length: endDay + 1 }, (_, day) => day);
  const paths = Object.fromEntries(modelNames.map(name => [name, days.map(day => predict(name, day))]));
  if (Object.values(paths).flat().some(value => !Number.isFinite(value))) {
    throw new RangeError("Una función produjo resultados no finitos en este horizonte.");
  }
  return { days, paths };
}

/** Diferencia final alternativa − referencia y cambio porcentual firmado. */
export function scenarioSummary(reference, alternative) {
  if (!Array.isArray(reference) || !Array.isArray(alternative) || reference.length === 0 || reference.length !== alternative.length) {
    throw new RangeError("Las trayectorias deben tener igual longitud y al menos un valor.");
  }
  const referenceValue = reference.at(-1);
  const alternativeValue = alternative.at(-1);
  if (!Number.isFinite(referenceValue) || !Number.isFinite(alternativeValue)) {
    throw new RangeError("La diferencia requiere valores finales finitos.");
  }
  const difference = alternativeValue - referenceValue;
  return {
    reference: referenceValue,
    alternative: alternativeValue,
    difference,
    differencePercent: referenceValue === 0 ? null : difference / Math.abs(referenceValue) * 100,
  };
}

export function scenarioDate(day) {
  if (!Number.isInteger(day) || day < 0 || day > MAX_SCENARIO_DAY) throw new RangeError("El día debe estar entre 0 y 36.");
  return new Date(Date.UTC(2020, 2, 1 + day)).toISOString().slice(0, 10);
}

export function hasNegativeIncrements(values) {
  return values.slice(1).some((value, index) => value - values[index] < 0);
}
