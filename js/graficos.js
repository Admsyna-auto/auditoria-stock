let CHART_INSTANCES = {};

function destruirChart(id) {
  if (CHART_INSTANCES[id]) {
    CHART_INSTANCES[id].destroy();
    delete CHART_INSTANCES[id];
  }
}

function crearChart(id, config) {
  destruirChart(id);
  const canvas = document.getElementById(id);
  if (!canvas) return;
  config.options = Object.assign(
    { maintainAspectRatio: false, responsive: true },
    config.options
  );
  CHART_INSTANCES[id] = new Chart(canvas, config);
}

const COLOR_OK = "#4ebda9";
const COLOR_MEDIO = "#f0ad4e";
const COLOR_NO = "#c0392b";
const COLOR_GRIS = "#8b9095";

function colorPorPct(pct) {
  if (pct === null || pct === undefined) return "#ccc";
  if (pct >= 0.9) return COLOR_OK;
  if (pct >= 0.7) return COLOR_MEDIO;
  return COLOR_NO;
}

function kpiCard(label, valor, clase) {
  return `<div class="kpi-card ${clase || ""}"><div class="kpi-label">${label}</div><div class="kpi-value">${valor}</div></div>`;
}

function rangoFechasGraficos() {
  const hoy = hoyKey();
  const desdeInput = document.getElementById("graficosDesde")?.value;
  const hastaInput = document.getElementById("graficosHasta")?.value;
  return {
    desde: desdeInput || inicioAnio(hoy),
    hasta: hastaInput || hoy,
  };
}

function renderKpisGraficos(filasReporte, resultadosRango) {
  const cont = document.getElementById("kpisGraficos");
  if (!cont) return;

  const total = resultadosRango.length;
  const ok = resultadosRango.filter((r) => r.estado === "✅ OK").length;
  const incumplimientos = total - ok;
  const pctGeneral = total > 0 ? ((ok / total) * 100).toFixed(1) + "%" : "—";

  const locales = State.getLocales();
  const activos = locales.filter((l) => l.activo !== false).length;
  const enRiesgo = filasReporte.filter((f) => f.pctAnual !== null && f.pctAnual < 0.7).length;

  cont.innerHTML =
    kpiCard("Total respuestas", total.toLocaleString("es-AR")) +
    kpiCard("OK", ok.toLocaleString("es-AR"), "kpi-ok") +
    kpiCard("Incumplimientos", incumplimientos.toLocaleString("es-AR"), incumplimientos > 0 ? "kpi-no" : "") +
    kpiCard("% Cumplimiento general", pctGeneral) +
    kpiCard("Locales activos", activos) +
    kpiCard("Locales en riesgo (&lt;70%)", enRiesgo, enRiesgo > 0 ? "kpi-no" : "kpi-ok");
}

function renderGraficos() {
  const cont = document.getElementById("tab-graficos");
  if (!cont) return;
  const locales = State.getLocalesActivos();
  const fuentes = State.getFuentes();
  const { desde, hasta } = rangoFechasGraficos();
  const etiquetaRango = `${desde} a ${hasta}`;

  document.getElementById("tituloChartProvincia").textContent = `Cumplimiento por provincia (${etiquetaRango})`;
  document.getElementById("tituloChartMarca").textContent = `Cumplimiento por marca (${etiquetaRango})`;
  document.getElementById("tituloChartPeores").textContent = `Top 10 — peor cumplimiento (${etiquetaRango})`;
  document.getElementById("tituloChartEstados").textContent = `Distribución de estados (${etiquetaRango})`;
  document.getElementById("tituloChartEvolucion").textContent = `Evolución del cumplimiento general (${etiquetaRango})`;

  const codigosActivos = new Set(locales.map((l) => claveLocal(l.codigo)));
  const filasReporte = calcularReporteRango(locales, fuentes, RESULTADOS, desde, hasta);
  const resultadosRango = RESULTADOS.filter(
    (r) => r.fechaKey && r.fechaKey >= desde && r.fechaKey <= hasta && codigosActivos.has(r.localCodigo)
  );

  renderKpisGraficos(filasReporte, resultadosRango);

  // 1. Cumplimiento por provincia
  const porProvincia = promedioPorCampo(filasReporte, "provincia");
  crearChart("chartProvincia", {
    type: "bar",
    data: {
      labels: porProvincia.map((p) => `${p.valor} (${p.n})`),
      datasets: [{
        label: "% Cumplimiento",
        data: porProvincia.map((p) => (p.pct * 100).toFixed(1)),
        backgroundColor: porProvincia.map((p) => colorPorPct(p.pct)),
      }],
    },
    options: {
      indexAxis: "y",
      plugins: { legend: { display: false } },
      scales: { x: { min: 0, max: 100, title: { display: true, text: "%" } } },
    },
  });

  // 2. Cumplimiento por marca
  const porMarca = promedioPorCampo(filasReporte, "marca");
  crearChart("chartMarca", {
    type: "bar",
    data: {
      labels: porMarca.map((p) => `${p.valor} (${p.n})`),
      datasets: [{
        label: "% Cumplimiento",
        data: porMarca.map((p) => (p.pct * 100).toFixed(1)),
        backgroundColor: porMarca.map((p) => colorPorPct(p.pct)),
      }],
    },
    options: {
      plugins: { legend: { display: false } },
      scales: { y: { min: 0, max: 100, title: { display: true, text: "%" } } },
    },
  });

  // 3. Top 10 peor cumplimiento
  const peores = filasReporte
    .filter((f) => f.pctAnual !== null)
    .sort((a, b) => a.pctAnual - b.pctAnual)
    .slice(0, 10);
  crearChart("chartPeores", {
    type: "bar",
    data: {
      labels: peores.map((f) => f.local.nombre),
      datasets: [{
        label: "% Cumplimiento",
        data: peores.map((f) => (f.pctAnual * 100).toFixed(1)),
        backgroundColor: COLOR_NO,
      }],
    },
    options: {
      indexAxis: "y",
      plugins: { legend: { display: false } },
      scales: { x: { min: 0, max: 100, title: { display: true, text: "%" } } },
    },
  });

  // 4. Distribución de estados
  const estados = distribucionEstados(resultadosRango);
  const entradas = Object.entries(estados).sort((a, b) => b[1] - a[1]);
  crearChart("chartEstados", {
    type: "doughnut",
    data: {
      labels: entradas.map(([e]) => e),
      datasets: [{
        data: entradas.map(([, c]) => c),
        backgroundColor: [COLOR_OK, COLOR_MEDIO, "#e08a3c", COLOR_GRIS, COLOR_NO, "#5aa9c9"],
      }],
    },
    options: {
      plugins: { legend: { position: "right", labels: { boxWidth: 12, font: { size: 11 } } } },
    },
  });

  // 5. Evolución semanal dentro del rango elegido
  const evolucion = evolucionSemanalRango(locales, fuentes, RESULTADOS, desde, hasta);
  crearChart("chartEvolucion", {
    type: "line",
    data: {
      labels: evolucion.map((e) => e.semana.slice(5)),
      datasets: [{
        label: "% Cumplimiento general",
        data: evolucion.map((e) => (e.pct === null ? null : (e.pct * 100).toFixed(1))),
        borderColor: COLOR_OK,
        backgroundColor: COLOR_OK,
        tension: 0.2,
        spanGaps: true,
      }],
    },
    options: {
      scales: { y: { min: 0, max: 100, title: { display: true, text: "%" } } },
    },
  });
}
