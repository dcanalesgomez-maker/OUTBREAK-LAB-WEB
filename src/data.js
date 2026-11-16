export async function loadNationalData(url = "./data/covid19_espana_marzo_2020_preparado.csv") {
  const response = await fetch(url);
  if (!response.ok) throw new Error("No se pudo cargar la serie histórica local.");
  const lines = (await response.text()).trim().split(/\r?\n/);
  if (lines[0] !== "fecha,dia,casos_acumulados") throw new Error("El CSV no tiene las columnas esperadas.");
  const rows = lines.slice(1).map(line => {
    const [fecha, rawDay, rawCases] = line.split(",");
    return { fecha, dia: Number(rawDay), casos_acumulados: Number(rawCases) };
  });
  if (rows.length !== 30 || rows.some((row, index) => !/^2020-03-\d{2}$/.test(row.fecha) || row.dia !== index || !Number.isFinite(row.casos_acumulados) || row.casos_acumulados < 0)) {
    throw new Error("La serie no supera las comprobaciones de 30 fechas, días y valores numéricos.");
  }
  return rows;
}
