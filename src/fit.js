import { predict } from "./models.js";

function validateXY(days, values, minimum) {
  if (!Array.isArray(days) || !Array.isArray(values) || days.length !== values.length || days.length < minimum ||
      [...days, ...values].some(value => !Number.isFinite(value)) || new Set(days).size < minimum) {
    throw new TypeError(`El ajuste requiere al menos ${minimum} días distintos y valores finitos.`);
  }
}

// Householder QR resuelve mínimos cuadrados sin formar XᵀX, que amplificaría
// el error numérico. Las columnas se normalizan y luego se deshace la escala.
export function leastSquares(columns, target) {
  const rows = target.length;
  const scales = columns.map(column => Math.sqrt(column.reduce((sum, value) => sum + value * value, 0)) || 1);
  const matrix = Array.from({ length: rows }, (_, r) => columns.map((column, c) => column[r] / scales[c]));
  const rhs = [...target];
  const count = columns.length;
  for (let k = 0; k < count; k += 1) {
    const norm = Math.sqrt(matrix.slice(k).reduce((sum, row) => sum + row[k] ** 2, 0));
    if (norm === 0) throw new RangeError("La matriz del ajuste no tiene rango suficiente.");
    const alpha = matrix[k][k] >= 0 ? -norm : norm;
    const vector = matrix.slice(k).map((row, i) => row[k] - (i === 0 ? alpha : 0));
    const denominator = vector.reduce((sum, value) => sum + value * value, 0);
    const beta = 2 / denominator;
    for (let c = k; c < count; c += 1) {
      const projection = beta * vector.reduce((sum, value, i) => sum + value * matrix[k + i][c], 0);
      for (let i = 0; i < vector.length; i += 1) matrix[k + i][c] -= projection * vector[i];
    }
    const targetProjection = beta * vector.reduce((sum, value, i) => sum + value * rhs[k + i], 0);
    for (let i = 0; i < vector.length; i += 1) rhs[k + i] -= targetProjection * vector[i];
    matrix[k][k] = alpha;
    for (let i = k + 1; i < rows; i += 1) matrix[i][k] = 0;
  }
  const solution = Array(count).fill(0);
  for (let i = count - 1; i >= 0; i -= 1) {
    let remainder = rhs[i];
    for (let j = i + 1; j < count; j += 1) remainder -= matrix[i][j] * solution[j];
    solution[i] = remainder / matrix[i][i];
  }
  for (let i = 0; i < count; i += 1) solution[i] /= scales[i];
  if (solution.some(value => !Number.isFinite(value))) throw new RangeError("El ajuste produjo coeficientes no finitos.");
  return solution;
}

export function fitModel(model, days, values) {
  const dimensions = model === "Cuadrático" ? 3 : 2;
  validateXY(days, values, dimensions);
  if (model === "Exponencial" && values.some(value => value <= 0)) throw new RangeError("El ajuste exponencial requiere valores positivos.");
  if (!(["Lineal", "Cuadrático", "Exponencial"].includes(model))) throw new TypeError(`Modelo desconocido: ${model}`);
  const target = model === "Exponencial" ? values.map(Math.log) : values;
  const columns = model === "Cuadrático"
    ? [days.map(day => day ** 2), days, days.map(() => 1)]
    : [days, days.map(() => 1)];
  const fitted = leastSquares(columns, target);
  if (model === "Exponencial") return [Math.exp(fitted[1]), fitted[0]];
  return fitted;
}

export function fitAllModels(days, values) {
  return Object.fromEntries(["Lineal", "Cuadrático", "Exponencial"].map(model => [model, fitModel(model, days, values)]));
}

export function fitPredictions(model, days, values) {
  const coefficients = fitModel(model, days, values);
  return { coefficients, estimates: days.map(day => predict(model, day, coefficients)) };
}
