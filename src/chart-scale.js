/** Logarithmic axes are valid only when every plotted value is finite and positive. */
export function canUseLogScale(values) {
  return values.length > 0 && values.every(value => Number.isFinite(value) && value > 0);
}

/** Keep the requested scale unless a logarithm would drop or invalidate data. */
export function resolveChartScale(requested, values) {
  return requested === "Logarítmica" && canUseLogScale(values) ? "Logarítmica" : "Lineal";
}
