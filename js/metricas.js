const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

function hoyKey() {
  return new Date().toISOString().slice(0, 10);
}

function fechaKeyDia(fk) {
  const [y, m, d] = fk.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return dow === 0 ? 7 : dow;
}

function sumarDias(fechaKey, n) {
  const [y, m, d] = fechaKey.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d) + n * 86400000);
  return dt.toISOString().slice(0, 10);
}

function inicioSemana(fechaKey) {
  const dia = fechaKeyDia(fechaKey); // 1=Lun..7=Dom
  return sumarDias(fechaKey, -(dia - 1));
}

function inicioMes(fechaKey) {
  return fechaKey.slice(0, 7) + "-01";
}

function inicioAnio(fechaKey) {
  return fechaKey.slice(0, 4) + "-01-01";
}

/**
 * Construye el set de "OK" por local+fecha para lookups O(1).
 */
function construirOkSet(resultados) {
  const okSet = new Set();
  resultados.forEach((r) => {
    if (r.estado === "✅ OK") okSet.add(`${r.localCodigo}|${r.fechaKey}`);
  });
  return okSet;
}

/**
 * Determina qué calendario (tipos esperados por día) aplica a un local,
 * según a qué fuente (Form) pertenece su marca. Si no matchea ninguna,
 * usa la primera fuente como respaldo.
 */
function calendarioParaLocal(local, fuentes) {
  if (!fuentes || !fuentes.length) return [];
  const match = fuentes.find((f) => (f.marcas || []).includes(local.marca));
  return (match || fuentes[0]).calendario || [];
}

/**
 * Cuenta cumplimiento de un local entre dos fechas (inclusive), sólo en los
 * días de la semana que tienen control esperado según el calendario.
 * diaFiltro: si se pasa, sólo cuenta ese día de la semana (1-7).
 */
function calcularCumplimiento(localCodigo, okSet, desdeKey, hastaKey, diasConControl, diaFiltro) {
  let ok = 0;
  let total = 0;
  if (!desdeKey || !hastaKey || desdeKey > hastaKey) return { ok, total, pct: null };
  for (let fk = desdeKey; fk <= hastaKey; fk = sumarDias(fk, 1)) {
    const dia = fechaKeyDia(fk);
    if (!diasConControl.has(dia)) continue;
    if (diaFiltro && dia !== diaFiltro) continue;
    total++;
    if (okSet.has(`${localCodigo}|${fk}`)) ok++;
  }
  return { ok, total, pct: total > 0 ? ok / total : null };
}

/**
 * Reporte general por sucursal: semana actual, mes actual, acumulado anual.
 */
function calcularReporte(locales, fuentes, resultados) {
  const okSet = construirOkSet(resultados);
  const hoy = hoyKey();
  const desdeSemana = inicioSemana(hoy);
  const desdeMes = inicioMes(hoy);
  const desdeAnio = inicioAnio(hoy);

  return locales.map((local) => {
    const diasConControl = new Set(calendarioParaLocal(local, fuentes).map((c) => Number(c.dia_semana)));
    const semana = calcularCumplimiento(local.codigo, okSet, desdeSemana, hoy, diasConControl);
    const mes = calcularCumplimiento(local.codigo, okSet, desdeMes, hoy, diasConControl);
    const anio = calcularCumplimiento(local.codigo, okSet, desdeAnio, hoy, diasConControl);
    return {
      local,
      controlesEnviados: semana.ok,
      totalSemana: semana.total,
      pctSemanal: semana.pct,
      pctMesActual: mes.pct,
      pctAnual: anio.pct,
      mesActualNombre: MESES[new Date(hoy).getUTCMonth()],
    };
  });
}

/**
 * Métricas por sucursal: % cumplimiento por día de la semana y por mes,
 * desde el inicio del año hasta hoy.
 */
function calcularMetricas(locales, fuentes, resultados) {
  const okSet = construirOkSet(resultados);
  const hoy = hoyKey();
  const desdeAnio = inicioAnio(hoy);

  return locales.map((local) => {
    const diasConControl = new Set(calendarioParaLocal(local, fuentes).map((c) => Number(c.dia_semana)));
    const porDia = {};
    [1, 2, 3, 4, 5, 6, 7].forEach((d) => {
      porDia[d] = diasConControl.has(d)
        ? calcularCumplimiento(local.codigo, okSet, desdeAnio, hoy, diasConControl, d).pct
        : null;
    });

    const porMes = [];
    for (let m = 0; m < 12; m++) {
      const y = new Date(hoy).getUTCFullYear();
      const desdeMes = `${y}-${String(m + 1).padStart(2, "0")}-01`;
      const finMes = new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10);
      const hastaMes = finMes > hoy ? hoy : finMes;
      if (desdeMes > hoy) {
        porMes.push(null);
        continue;
      }
      porMes.push(calcularCumplimiento(local.codigo, okSet, desdeMes, hastaMes, diasConControl).pct);
    }

    const general = calcularCumplimiento(local.codigo, okSet, desdeAnio, hoy, diasConControl);

    return { local, porDia, porMes, cumplGral: general.pct, ok: general.ok, total: general.total };
  });
}
