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
  CHART_INSTANCES[id] = new Chart(canvas, config);
}

const COLOR_OK = "#28a745";
const COLOR_MEDIO = "#f0ad4e";
const COLOR_NO = "#d9534f";
const COLOR_AZUL = "#1a73e8";

function colorPorPct(pct) {
  if (pct === null || pct === undefined) return "#ccc";
  if (pct >= 0.9) return COLOR_OK;
  if (pct >= 0.7) return COLOR_MEDIO;
  return COLOR_NO;
}

function renderGraficos() {
  const cont = document.getElementById("tab-graficos");
  if (!cont) return;
  const locales = State.getLocales();
  const fuentes = State.getFuentes();
  const filasReporte = calcularReporte(locales, fuentes, RESULTADOS);

  // 1. Cumplimiento acumulado anual por provincia
  const porProvincia = promedioPorCampo(filasReporte, "provincia");
  crearChart("chartProvincia", {
    type: "bar",
    data: {
      labels: porProvincia.map((p) => `${p.valor} (${p.n})`),
      datasets: [{
        label: "% Cumplimiento acumulado anual",
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
        label: "% Cumplimiento acumulado anual",
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
        label: "% Cumpl. acumulado anual",
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
  const estados = distribucionEstados(RESULTADOS);
  const entradas = Object.entries(estados).sort((a, b) => b[1] - a[1]);
  crearChart("chartEstados", {
    type: "doughnut",
    data: {
      labels: entradas.map(([e]) => e),
      datasets: [{
        data: entradas.map(([, c]) => c),
        backgroundColor: ["#28a745", "#f0ad4e", "#fd7e14", "#6c757d", "#d9534f", "#0dcaf0"],
      }],
    },
  });

  // 5. Evolución semanal
  const evolucion = evolucionSemanal(locales, fuentes, RESULTADOS, 12);
  crearChart("chartEvolucion", {
    type: "line",
    data: {
      labels: evolucion.map((e) => e.semana.slice(5)),
      datasets: [{
        label: "% Cumplimiento general",
        data: evolucion.map((e) => (e.pct === null ? null : (e.pct * 100).toFixed(1))),
        borderColor: COLOR_AZUL,
        backgroundColor: COLOR_AZUL,
        tension: 0.2,
        spanGaps: true,
      }],
    },
    options: {
      scales: { y: { min: 0, max: 100, title: { display: true, text: "%" } } },
    },
  });
}
