let RESULTADOS = [];

function diaLabel(n) {
  return ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"][n - 1] || "";
}

function marcaDeNombre(nombre) {
  if (/RIIING/i.test(nombre)) return "RIIING";
  if (/DIGGIT/i.test(nombre)) return "DIGGIT";
  if (/JBL/i.test(nombre)) return "JBL";
  return "";
}

function setEstadoCarga(texto) {
  const estadoEl = document.getElementById("estadoCarga");
  const estadoGlobalEl = document.getElementById("estadoCargaGlobal");
  if (estadoEl) estadoEl.textContent = texto;
  if (estadoGlobalEl) estadoGlobalEl.textContent = texto;
}

async function fetchYProcesar() {
  const fuentes = State.getFuentes();
  if (!fuentes.length) {
    setEstadoCarga("Configurá primero al menos una fuente (CSV) en la pestaña Config.");
    return;
  }
  const btnGlobal = document.getElementById("btnActualizarGlobal");
  if (btnGlobal) btnGlobal.disabled = true;
  setEstadoCarga("Descargando respuestas...");
  const locales = State.getLocales();
  const config = State.getConfig();
  const todas = [];
  const errores = [];
  let totalFilas = 0;

  for (const fuente of fuentes) {
    try {
      const url = fuente.csvUrl;
      const resp = await fetch(url + (url.includes("?") ? "&" : "?") + "_=" + Date.now());
      if (!resp.ok) throw new Error("HTTP " + resp.status);
      const text = await resp.text();
      const rows = csvToObjects(text);
      totalFilas += rows.length;
      const resultados = procesarRespuestas(rows, locales, fuente.calendario || [], config).map((r) => ({
        ...r,
        fuenteNombre: fuente.nombre,
      }));
      todas.push(...resultados);
    } catch (err) {
      errores.push(`${fuente.nombre}: ${err.message}`);
    }
  }

  RESULTADOS = todas;
  const resumen = `${totalFilas} respuestas procesadas de ${fuentes.length} fuente(s) (${new Date().toLocaleTimeString("es-AR")}).`;
  setEstadoCarga(errores.length ? `${resumen} Errores: ${errores.join(" | ")}` : resumen);
  renderTodo();
  if (btnGlobal) btnGlobal.disabled = false;
}

function renderTodo() {
  renderResumen();
  poblarFiltroTipoDashboard();
  renderDashboard();
  renderRespuestas();
  renderLocalesNuevos();
  renderReporte();
  renderMetricas();
  if (getComputedStyle(document.getElementById("tab-graficos")).display !== "none") renderGraficos();
}

function exportarTablaExcel(idContenedor, nombreArchivo) {
  const tabla = document.querySelector(`#${idContenedor} table`);
  if (!tabla) {
    alert("No hay datos para exportar todavía.");
    return;
  }
  // raw: true evita que SheetJS intente "adivinar" fechas/números a partir del
  // texto de la tabla (mal interpretaba fechas como "2/07/2026" y las convertía
  // a un serial de Excel incorrecto, mostrando años como 2001).
  const hoja = XLSX.utils.table_to_sheet(tabla, { raw: true });
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, "Datos");
  XLSX.writeFile(libro, nombreArchivo);
}

function pct(v) {
  return v === null || v === undefined ? "—" : (v * 100).toFixed(1) + "%";
}

function claseCumpl(v) {
  if (v === null || v === undefined) return "";
  if (v >= 0.9) return "ok";
  if (v >= 0.7) return "";
  return "no";
}

function poblarFiltrosReporte(filas) {
  const selProvincia = document.getElementById("filtroReporteProvincia");
  const selResponsable = document.getElementById("filtroReporteResponsable");
  const provinciaActual = selProvincia.value;
  const responsableActual = selResponsable.value;

  const provincias = [...new Set(filas.map((f) => f.local.provincia).filter(Boolean))].sort();
  selProvincia.innerHTML = '<option value="">Todas</option>' + provincias.map((p) => `<option value="${p}">${p}</option>`).join("");
  if (provincias.includes(provinciaActual)) selProvincia.value = provinciaActual;

  const responsables = [...new Set(filas.map((f) => f.local.responsable).filter(Boolean))].sort();
  selResponsable.innerHTML = '<option value="">Todos</option>' + responsables.map((r) => `<option value="${r}">${r}</option>`).join("");
  if (responsables.includes(responsableActual)) selResponsable.value = responsableActual;
}

function renderReporte() {
  const cont = document.getElementById("tablaReporte");
  if (!cont) return;
  const locales = State.getLocales();
  const fuentes = State.getFuentes();
  const filas = calcularReporte(locales, fuentes, RESULTADOS);
  poblarFiltrosReporte(filas);

  const texto = (document.getElementById("filtroReporteTexto")?.value || "").trim().toLowerCase();
  const marcaFiltro = document.getElementById("filtroMarcaReporte")?.value || "";
  const provinciaFiltro = document.getElementById("filtroReporteProvincia")?.value || "";
  const responsableFiltro = document.getElementById("filtroReporteResponsable")?.value || "";
  const filtradas = filas.filter((f) => {
    if (texto && !`${f.local.codigo} ${f.local.nombre}`.toLowerCase().includes(texto)) return false;
    if (marcaFiltro && f.local.marca !== marcaFiltro) return false;
    if (provinciaFiltro && f.local.provincia !== provinciaFiltro) return false;
    if (responsableFiltro && f.local.responsable !== responsableFiltro) return false;
    return true;
  });

  const mesNombre = filas[0]?.mesActualNombre || "";
  let html = `<table><thead><tr><th>Código</th><th>Provincia</th><th>Responsable</th><th class="local">Sucursal</th><th>Controles enviados</th><th>% Cumpl semanal</th><th>% ${mesNombre}</th><th>% Cumpl acumulado anual</th></tr></thead><tbody>`;
  filtradas
    .slice()
    .sort((a, b) => (a.pctAnual ?? 1) - (b.pctAnual ?? 1))
    .forEach((f) => {
      html += `<tr>
        <td>${f.local.codigo}</td>
        <td>${f.local.provincia || ""}</td>
        <td>${f.local.responsable || ""}</td>
        <td class="local">${f.local.nombre}</td>
        <td>${f.controlesEnviados} / ${f.totalSemana}</td>
        <td class="${claseCumpl(f.pctSemanal)}">${pct(f.pctSemanal)}</td>
        <td class="${claseCumpl(f.pctMesActual)}">${pct(f.pctMesActual)}</td>
        <td class="${claseCumpl(f.pctAnual)}">${pct(f.pctAnual)}</td>
      </tr>`;
    });
  html += "</tbody></table>";
  cont.innerHTML = html;
}

function renderMetricas() {
  const cont = document.getElementById("tablaMetricas");
  if (!cont) return;
  const locales = State.getLocales();
  const fuentes = State.getFuentes();
  const diasOrdenados = [
    ...new Set(fuentes.flatMap((f) => (f.calendario || []).map((c) => Number(c.dia_semana)))),
  ].sort((a, b) => a - b);
  const filas = calcularMetricas(locales, fuentes, RESULTADOS);
  const marcaFiltro = document.getElementById("filtroMarcaMetricas")?.value || "";
  const filtradas = filas.filter((f) => !marcaFiltro || f.local.marca === marcaFiltro);

  const mesActual = new Date().getUTCMonth();

  let html = `<table><thead><tr><th>Código</th><th class="local">Sucursal</th>`;
  diasOrdenados.forEach((d) => (html += `<th>${diaLabel(d)}</th>`));
  html += `<th>% Cumpl gral</th>`;
  MESES.forEach((m, i) => (html += `<th${i === mesActual ? ' style="background:#eef1f4"' : ""}>${m.slice(0, 3)}</th>`));
  html += "</tr></thead><tbody>";
  filtradas
    .slice()
    .sort((a, b) => (a.cumplGral ?? 1) - (b.cumplGral ?? 1))
    .forEach((f) => {
      html += `<tr><td>${f.local.codigo}</td><td class="local">${f.local.nombre}</td>`;
      diasOrdenados.forEach((d) => {
        html += `<td class="${claseCumpl(f.porDia[d])}">${pct(f.porDia[d])}</td>`;
      });
      html += `<td class="${claseCumpl(f.cumplGral)}">${pct(f.cumplGral)}</td>`;
      f.porMes.forEach((v, i) => {
        html += `<td class="${claseCumpl(v)}"${i === mesActual ? ' style="background:#eef1f4"' : ""}>${pct(v)}</td>`;
      });
      html += "</tr>";
    });
  html += "</tbody></table>";
  cont.innerHTML = html;
}

function renderResumen() {
  const cont = document.getElementById("resumenEstados");
  const counts = {};
  RESULTADOS.forEach((r) => (counts[r.estado] = (counts[r.estado] || 0) + 1));
  cont.innerHTML = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([estado, c]) => `<span class="chip">${estado}: <b>${c}</b></span>`)
    .join(" ");
}

function fechaKeyToDate(fk) {
  const [y, m, d] = fk.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function poblarFiltroTipoDashboard() {
  const fuentes = State.getFuentes();
  const tiposPorDia = new Map(); // dia -> Set(tipos)
  fuentes.forEach((f) => {
    (f.calendario || []).forEach((c) => {
      const dia = Number(c.dia_semana);
      if (!tiposPorDia.has(dia)) tiposPorDia.set(dia, new Set());
      tiposPorDia.get(dia).add(c.tipo_esperado);
    });
  });

  const sel = document.getElementById("filtroTipoDia");
  const valorActual = sel.value;
  sel.innerHTML = '<option value="">Todos</option>';
  [...tiposPorDia.keys()]
    .sort((a, b) => a - b)
    .forEach((dia) => {
      const opt = document.createElement("option");
      opt.value = String(dia);
      opt.textContent = `${diaLabel(dia)} — ${[...tiposPorDia.get(dia)].join(" / ")}`;
      sel.appendChild(opt);
    });
  if ([...sel.options].some((o) => o.value === valorActual)) sel.value = valorActual;
}

function renderDashboard() {
  const locales = State.getLocales();
  const fuentes = State.getFuentes();

  const desdeInput = document.getElementById("desde").value;
  const hastaInput = document.getElementById("hasta").value;
  const hasta = hastaInput ? fechaKeyToDate(hastaInput) : new Date();
  const desde = desdeInput
    ? fechaKeyToDate(desdeInput)
    : new Date(hasta.getTime() - 27 * 86400000);

  const diaFiltro = document.getElementById("filtroTipoDia").value;

  const fechas = [];
  for (let d = new Date(desde); d <= hasta; d = new Date(d.getTime() + 86400000)) {
    const fk = d.toISOString().slice(0, 10);
    const diaIso = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
    if (diaFiltro && String(diaIso) !== diaFiltro) continue;
    fechas.push(fk);
  }

  const okSet = new Set();
  RESULTADOS.forEach((r) => {
    if (r.estado === "✅ OK") okSet.add(`${r.localCodigo}|${r.fechaKey}`);
  });

  const marcaFiltro = document.getElementById("filtroMarca").value;

  const localesFiltrados = locales.filter((l) => !marcaFiltro || l.marca === marcaFiltro);

  let html = '<table><thead><tr><th class="local">Sucursal</th>';
  fechas.forEach((f) => (html += `<th>${f.slice(5)}</th>`));
  html += "</tr></thead><tbody>";
  localesFiltrados.forEach((local) => {
    const diasConControl = new Set(calendarioParaLocal(local, fuentes).map((c) => Number(c.dia_semana)));
    html += `<tr><td class="local">${local.nombre}</td>`;
    fechas.forEach((fechaKey) => {
      const diaIso = fechaKeyToDate(fechaKey).getUTCDay() === 0 ? 7 : fechaKeyToDate(fechaKey).getUTCDay();
      if (!diasConControl.has(diaIso)) {
        html += '<td class="blank"></td>';
        return;
      }
      const ok = okSet.has(`${claveLocal(local.codigo)}|${fechaKey}`);
      html += `<td class="${ok ? "ok" : "no"}">${ok ? "Ok" : "No"}</td>`;
    });
    html += "</tr>";
  });
  html += "</tbody></table>";
  document.getElementById("tablaDashboard").innerHTML = html;
}

function renderRespuestas() {
  const filtroEstado = document.getElementById("filtroEstado").value;
  const filtroTexto = document.getElementById("filtroTexto").value.trim().toLowerCase();
  const filtroDesde = document.getElementById("respDesde").value;
  const filtroHasta = document.getElementById("respHasta").value;
  const filtradas = RESULTADOS.filter((r) => {
    if (filtroEstado && r.estado !== filtroEstado) return false;
    if (filtroTexto && !(r.sucursalRaw || "").toLowerCase().includes(filtroTexto)) return false;
    if (filtroDesde && (!r.fechaKey || r.fechaKey < filtroDesde)) return false;
    if (filtroHasta && (!r.fechaKey || r.fechaKey > filtroHasta)) return false;
    return true;
  }).slice(-500);

  const selEstado = document.getElementById("filtroEstado");
  if (selEstado.options.length <= 1) {
    const estados = [...new Set(RESULTADOS.map((r) => r.estado))];
    estados.forEach((e) => {
      const opt = document.createElement("option");
      opt.value = e;
      opt.textContent = e;
      selEstado.appendChild(opt);
    });
  }

  let html =
    "<table><thead><tr><th>Fecha</th><th>Fuente</th><th>Sucursal</th><th>Tipo seleccionado</th><th>Tipo esperado</th><th>Estado</th><th>Detalle</th><th>Archivo</th></tr></thead><tbody>";
  filtradas
    .slice()
    .reverse()
    .forEach((r) => {
      const archivoHtml = r.archivo && r.archivo.startsWith("http")
        ? `<a href="${r.archivo}" target="_blank" rel="noopener">link</a>`
        : r.archivo || "";
      html += `<tr><td>${r.marcaTemporal}</td><td>${r.fuenteNombre || ""}</td><td>${r.sucursalRaw}</td><td>${r.tipoNormalizado || r.tipoRaw}</td><td>${r.tipoEsperado || ""}</td><td>${r.estado}</td><td>${r.detalle}</td><td>${archivoHtml}</td></tr>`;
    });
  html += "</tbody></table>";
  document.getElementById("tablaRespuestas").innerHTML = html;
}

function poblarFiltrosLocales(locales) {
  const selMarca = document.getElementById("filtroLocalesMarca");
  const selProvincia = document.getElementById("filtroLocalesProvincia");
  const marcaActual = selMarca.value;
  const provinciaActual = selProvincia.value;

  const marcas = [...new Set(locales.map((l) => l.marca).filter(Boolean))].sort();
  selMarca.innerHTML = '<option value="">Todas</option>' + marcas.map((m) => `<option value="${m}">${m}</option>`).join("");
  if (marcas.includes(marcaActual)) selMarca.value = marcaActual;

  const provincias = [...new Set(locales.map((l) => l.provincia).filter(Boolean))].sort();
  selProvincia.innerHTML = '<option value="">Todas</option>' + provincias.map((p) => `<option value="${p}">${p}</option>`).join("");
  if (provincias.includes(provinciaActual)) selProvincia.value = provinciaActual;
}

function renderLocales() {
  const locales = State.getLocales();
  poblarFiltrosLocales(locales);

  const texto = (document.getElementById("filtroLocalesTexto")?.value || "").trim().toLowerCase();
  const marcaFiltro = document.getElementById("filtroLocalesMarca")?.value || "";
  const provinciaFiltro = document.getElementById("filtroLocalesProvincia")?.value || "";
  const activoFiltro = document.getElementById("filtroLocalesActivo")?.value || "";

  const filas = locales
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => {
      if (texto && !`${l.codigo} ${l.nombre}`.toLowerCase().includes(texto)) return false;
      if (marcaFiltro && l.marca !== marcaFiltro) return false;
      if (provinciaFiltro && l.provincia !== provinciaFiltro) return false;
      if (activoFiltro === "1" && l.activo === false) return false;
      if (activoFiltro === "0" && l.activo !== false) return false;
      return true;
    });

  let html =
    `<p style="font-size:0.8rem;color:#555">${filas.length} de ${locales.length} locales</p>` +
    "<table><thead><tr><th>Código</th><th>Marca</th><th>Nombre</th><th>Provincia</th><th>Responsable</th><th>Email local</th><th>Email referente</th><th>Activo</th><th></th></tr></thead><tbody>";
  filas.forEach(({ l, i }) => {
    html += `<tr>
      <td><input data-i="${i}" data-f="codigo" value="${l.codigo || ""}"></td>
      <td><input data-i="${i}" data-f="marca" value="${l.marca || ""}"></td>
      <td><input data-i="${i}" data-f="nombre" value="${(l.nombre || "").replace(/"/g, "&quot;")}"></td>
      <td><input data-i="${i}" data-f="provincia" value="${l.provincia || ""}"></td>
      <td><input data-i="${i}" data-f="responsable" value="${(l.responsable || "").replace(/"/g, "&quot;")}"></td>
      <td><input data-i="${i}" data-f="emailLocal" value="${(l.emailLocal || "").replace(/"/g, "&quot;")}"></td>
      <td><input data-i="${i}" data-f="emailReferente" value="${(l.emailReferente || "").replace(/"/g, "&quot;")}"></td>
      <td><input type="checkbox" data-i="${i}" data-f="activo" ${l.activo !== false ? "checked" : ""}></td>
      <td><button data-del="${i}">Borrar</button></td>
    </tr>`;
  });
  html += "</tbody></table>";
  document.getElementById("tablaLocales").innerHTML = html;

  document.querySelectorAll("#tablaLocales input").forEach((inp) => {
    inp.addEventListener("change", () => {
      const locales = State.getLocales();
      const i = Number(inp.dataset.i);
      const f = inp.dataset.f;
      locales[i][f] = f === "activo" ? inp.checked : inp.value;
      State.setLocales(locales);
      if (RESULTADOS.length) renderTodo();
    });
  });
  document.querySelectorAll("#tablaLocales button[data-del]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const locales = State.getLocales();
      locales.splice(Number(btn.dataset.del), 1);
      State.setLocales(locales);
      renderLocales();
    });
  });
}

const COLUMNAS_EXCEL_LOCALES = [
  ["Código", "codigo"],
  ["Marca", "marca"],
  ["Nombre", "nombre"],
  ["Provincia", "provincia"],
  ["Responsable", "responsable"],
  ["Email local", "emailLocal"],
  ["Email referente", "emailReferente"],
  ["Activo", "activo"],
];

function exportarLocalesExcel() {
  const locales = State.getLocales();
  const filas = locales.map((l) => {
    const fila = {};
    COLUMNAS_EXCEL_LOCALES.forEach(([titulo, campo]) => {
      fila[titulo] = campo === "activo" ? (l.activo !== false ? "SI" : "NO") : l[campo] || "";
    });
    return fila;
  });
  const hoja = XLSX.utils.json_to_sheet(filas);
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, "Locales");
  XLSX.writeFile(libro, "locales.xlsx");
}

function importarLocalesExcel(file) {
  const estadoEl = document.getElementById("estadoImportExcel");
  const lector = new FileReader();
  lector.onload = (e) => {
    try {
      const libro = XLSX.read(e.target.result, { type: "array" });
      const hoja = libro.Sheets[libro.SheetNames[0]];
      const filas = XLSX.utils.sheet_to_json(hoja, { defval: "" });

      const locales = State.getLocales();
      const porClave = new Map(locales.map((l) => [claveLocal(l.codigo), l]));
      let actualizados = 0;
      let agregados = 0;

      filas.forEach((fila) => {
        const codigoCrudo = String(fila["Código"] ?? fila["Codigo"] ?? fila["codigo"] ?? "").trim();
        if (!codigoCrudo) return;
        const clave = claveLocal(codigoCrudo);
        const existente = porClave.get(clave);
        const datos = {
          codigo: codigoCrudo,
          marca: String(fila["Marca"] ?? "").trim(),
          nombre: String(fila["Nombre"] ?? "").trim(),
          provincia: String(fila["Provincia"] ?? "").trim(),
          responsable: String(fila["Responsable"] ?? "").trim(),
          emailLocal: String(fila["Email local"] ?? "").trim(),
          emailReferente: String(fila["Email referente"] ?? "").trim(),
          activo: !/^no$/i.test(String(fila["Activo"] ?? "SI").trim()),
        };
        if (existente) {
          Object.assign(existente, datos);
          actualizados++;
        } else {
          locales.push(datos);
          porClave.set(clave, datos);
          agregados++;
        }
      });

      State.setLocales(locales);
      renderLocales();
      if (RESULTADOS.length) renderTodo();
      estadoEl.textContent = `Importación completa: ${actualizados} actualizados, ${agregados} agregados.`;
    } catch (err) {
      estadoEl.textContent = "Error al importar: " + err.message;
    }
  };
  lector.readAsArrayBuffer(file);
}

function agregarLocalManual() {
  const locales = State.getLocales();
  locales.push({
    codigo: "", marca: "", nombre: "", provincia: "", responsable: "",
    emailLocal: "", emailReferente: "", activo: true,
  });
  State.setLocales(locales);
  renderLocales();
}

function renderLocalesNuevos() {
  const locales = State.getLocales();
  const codigosExistentes = new Set(locales.map((l) => claveLocal(l.codigo)));
  const nuevos = new Map();
  RESULTADOS.forEach((r) => {
    if (!codigosExistentes.has(r.localCodigo) && r.localCodigo) {
      nuevos.set(r.localCodigo, r.sucursalRaw);
    }
  });
  const cont = document.getElementById("localesNuevos");
  if (nuevos.size === 0) {
    cont.innerHTML = "<p>No hay sucursales nuevas sin registrar.</p>";
    return;
  }
  let html = `<p>${nuevos.size} sucursales aparecen en las respuestas pero no están en tu lista de Locales:</p><ul>`;
  nuevos.forEach((nombre, codigo) => (html += `<li>${nombre}</li>`));
  html += "</ul><button id='btnAgregarTodos'>Agregar todas automáticamente</button>";
  cont.innerHTML = html;
  document.getElementById("btnAgregarTodos").addEventListener("click", () => {
    const locales = State.getLocales();
    nuevos.forEach((nombre, codigo) => {
      locales.push({
        codigo: /^\d+$/.test(codigo) ? `SUC-${codigo}` : codigo,
        marca: marcaDeNombre(nombre),
        nombre,
        provincia: "",
        responsable: "",
        emailLocal: "",
        emailReferente: "",
        activo: true,
      });
    });
    State.setLocales(locales);
    renderLocales();
    renderLocalesNuevos();
    renderDashboard();
  });
}

function poblarSelectorFuenteCalendario() {
  const fuentes = State.getFuentes();
  const sel = document.getElementById("fuenteCalendario");
  const valorActual = sel.value;
  sel.innerHTML = "";
  fuentes.forEach((f, i) => {
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = f.nombre || `Fuente ${i + 1}`;
    sel.appendChild(opt);
  });
  if (fuentes.some((_, i) => String(i) === valorActual)) sel.value = valorActual;
}

function renderCalendario() {
  poblarSelectorFuenteCalendario();
  const fuentes = State.getFuentes();
  const idx = Number(document.getElementById("fuenteCalendario").value || 0);
  const fuente = fuentes[idx];
  const cont = document.getElementById("tablaCalendario");
  if (!fuente) {
    cont.innerHTML = "<p>Agregá una fuente en la pestaña Config para poder definir su calendario.</p>";
    return;
  }
  const byDia = {};
  (fuente.calendario || []).forEach((c) => (byDia[c.dia_semana] = c.tipo_esperado));
  let html = "<table><thead><tr><th>Día</th><th>Tipo esperado</th></tr></thead><tbody>";
  for (let d = 1; d <= 7; d++) {
    html += `<tr><td>${diaLabel(d)}</td><td><input data-dia="${d}" value="${byDia[d] || ""}"></td></tr>`;
  }
  html += "</tbody></table>";
  cont.innerHTML = html;
}

function guardarCalendario() {
  const fuentes = State.getFuentes();
  const idx = Number(document.getElementById("fuenteCalendario").value || 0);
  if (!fuentes[idx]) return;
  const filas = Array.from(document.querySelectorAll("#tablaCalendario input[data-dia]"))
    .map((i) => ({ dia_semana: Number(i.dataset.dia), tipo_esperado: i.value.trim() }))
    .filter((f) => f.tipo_esperado);
  fuentes[idx].calendario = filas;
  State.setFuentes(fuentes);
  alert("Calendario guardado.");
  if (RESULTADOS.length) fetchYProcesar();
}

function importarLocalesSeed() {
  const estadoEl = document.getElementById("estadoSeed");
  try {
    const seed = LOCALES_SEED || [];
    const locales = State.getLocales();
    const porCodigo = new Map(locales.map((l) => [l.codigo, l]));
    let agregados = 0;
    let actualizados = 0;
    seed.forEach((l) => {
      const existente = porCodigo.get(l.codigo);
      if (!existente) {
        locales.push(l);
        agregados++;
        return;
      }
      let cambio = false;
      ["provincia", "responsable"].forEach((campo) => {
        if (!existente[campo] && l[campo]) {
          existente[campo] = l[campo];
          cambio = true;
        }
      });
      if (cambio) actualizados++;
    });
    State.setLocales(locales);
    renderLocales();
    if (RESULTADOS.length) renderLocalesNuevos();
    estadoEl.textContent = `${agregados} locales agregados, ${actualizados} actualizados (provincia/responsable), ${seed.length - agregados - actualizados} sin cambios.`;
  } catch (err) {
    estadoEl.textContent = "Error al importar: " + err.message;
  }
}

function initTabs() {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach((p) => (p.style.display = "none"));
      btn.classList.add("active");
      document.getElementById("tab-" + btn.dataset.tab).style.display = "block";
      if (btn.dataset.tab === "graficos" && RESULTADOS.length) renderGraficos();
    });
  });
}

function renderFuentes() {
  const fuentes = State.getFuentes();
  let html = "<table><thead><tr><th>Nombre</th><th>Link CSV</th><th>Marcas asociadas (separadas por coma)</th><th></th></tr></thead><tbody>";
  fuentes.forEach((f, i) => {
    html += `<tr>
      <td><input data-i="${i}" data-f="nombre" value="${(f.nombre || "").replace(/"/g, "&quot;")}"></td>
      <td><input data-i="${i}" data-f="csvUrl" value="${(f.csvUrl || "").replace(/"/g, "&quot;")}"></td>
      <td><input data-i="${i}" data-f="marcas" placeholder="ej. RIIING, DIGGIT" value="${(f.marcas || []).join(", ")}"></td>
      <td><button data-del="${i}">Borrar</button></td>
    </tr>`;
  });
  html += "</tbody></table>";
  document.getElementById("tablaFuentes").innerHTML = html;

  document.querySelectorAll("#tablaFuentes input").forEach((inp) => {
    inp.addEventListener("change", () => {
      const fuentes = State.getFuentes();
      const campo = inp.dataset.f;
      if (campo === "marcas") {
        fuentes[Number(inp.dataset.i)].marcas = inp.value.split(",").map((m) => m.trim()).filter(Boolean);
      } else {
        fuentes[Number(inp.dataset.i)][campo] = inp.value.trim();
      }
      State.setFuentes(fuentes);
      poblarSelectorFuenteCalendario();
    });
  });
  document.querySelectorAll("#tablaFuentes button[data-del]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const fuentes = State.getFuentes();
      fuentes.splice(Number(btn.dataset.del), 1);
      State.setFuentes(fuentes);
      renderFuentes();
      renderCalendario();
    });
  });
}

function agregarFuente() {
  const fuentes = State.getFuentes();
  fuentes.push({ id: "fuente-" + Date.now(), nombre: "", csvUrl: "", marcas: [], calendario: [] });
  State.setFuentes(fuentes);
  renderFuentes();
  renderCalendario();
}

function initConfig() {
  renderFuentes();
  document.getElementById("btnAgregarFuente").addEventListener("click", agregarFuente);
  document.getElementById("guardarFuentes").addEventListener("click", fetchYProcesar);

  const cfg = State.getConfig();
  document.getElementById("cfgStartHour").value = cfg.allowedStartHour;
  document.getElementById("cfgStartMin").value = cfg.allowedStartMinute;
  document.getElementById("cfgEndHour").value = cfg.allowedEndHour;
  document.getElementById("cfgEndMin").value = cfg.allowedEndMinute;
  document.getElementById("guardarConfig").addEventListener("click", () => {
    State.setConfig({
      allowedStartHour: Number(document.getElementById("cfgStartHour").value),
      allowedStartMinute: Number(document.getElementById("cfgStartMin").value),
      allowedEndHour: Number(document.getElementById("cfgEndHour").value),
      allowedEndMinute: Number(document.getElementById("cfgEndMin").value),
    });
    alert("Configuración guardada.");
    if (RESULTADOS.length) fetchYProcesar();
  });

  document.getElementById("githubToken").value = State.getGithubToken();
  document.getElementById("githubRepo").value = State.getGithubRepo();
  document.getElementById("githubToken").addEventListener("change", (e) => State.setGithubToken(e.target.value.trim()));
  document.getElementById("githubRepo").addEventListener("change", (e) => State.setGithubRepo(e.target.value.trim()));
  document.getElementById("btnSincronizarGithub").addEventListener("click", async () => {
    const ok = await sincronizarDesdeCompartido(true);
    if (ok) {
      renderLocales();
      renderFuentes();
      renderCalendario();
      if (RESULTADOS.length) fetchYProcesar();
    }
  });
  document.getElementById("btnGuardarGithub").addEventListener("click", guardarEnGithub);

  const ultimaSync = State.getUltimaSync();
  if (ultimaSync) document.getElementById("estadoSyncGithub").textContent = `Última sincronización: ${ultimaSync}.`;
}

window.addEventListener("DOMContentLoaded", async () => {
  initTabs();

  if (State.getLocales().length === 0) {
    await sincronizarDesdeCompartido(false);
  }

  initConfig();
  renderLocales();
  renderCalendario();
  document.getElementById("btnActualizar").addEventListener("click", fetchYProcesar);
  document.getElementById("btnActualizarGlobal").addEventListener("click", fetchYProcesar);
  document.getElementById("aplicarFiltrosDashboard").addEventListener("click", renderDashboard);
  document.getElementById("filtroTipoDia").addEventListener("change", renderDashboard);
  document.getElementById("filtroEstado").addEventListener("change", renderRespuestas);
  document.getElementById("filtroTexto").addEventListener("input", renderRespuestas);
  document.getElementById("respDesde").addEventListener("change", renderRespuestas);
  document.getElementById("respHasta").addEventListener("change", renderRespuestas);
  document.getElementById("btnAgregarLocal").addEventListener("click", agregarLocalManual);
  document.getElementById("filtroLocalesTexto").addEventListener("input", renderLocales);
  document.getElementById("filtroLocalesMarca").addEventListener("change", renderLocales);
  document.getElementById("filtroLocalesProvincia").addEventListener("change", renderLocales);
  document.getElementById("filtroLocalesActivo").addEventListener("change", renderLocales);
  document.getElementById("btnExportarLocales").addEventListener("click", exportarLocalesExcel);
  document.getElementById("btnImportarLocalesExcel").addEventListener("click", () => {
    document.getElementById("inputImportarLocalesExcel").click();
  });
  document.getElementById("inputImportarLocalesExcel").addEventListener("change", (e) => {
    if (e.target.files[0]) importarLocalesExcel(e.target.files[0]);
    e.target.value = "";
  });
  document.getElementById("guardarCalendarioBtn").addEventListener("click", guardarCalendario);
  document.getElementById("fuenteCalendario").addEventListener("change", renderCalendario);
  document.getElementById("btnImportarSeed").addEventListener("click", importarLocalesSeed);
  document.getElementById("filtroMarcaReporte").addEventListener("change", renderReporte);
  document.getElementById("filtroReporteTexto").addEventListener("input", renderReporte);
  document.getElementById("filtroReporteProvincia").addEventListener("change", renderReporte);
  document.getElementById("filtroReporteResponsable").addEventListener("change", renderReporte);
  document.getElementById("filtroMarcaMetricas").addEventListener("change", renderMetricas);

  document.getElementById("btnExportarDashboard").addEventListener("click", () => exportarTablaExcel("tablaDashboard", "dashboard.xlsx"));
  document.getElementById("btnExportarReporte").addEventListener("click", () => exportarTablaExcel("tablaReporte", "reporte.xlsx"));
  document.getElementById("btnExportarMetricas").addEventListener("click", () => exportarTablaExcel("tablaMetricas", "metricas.xlsx"));
  document.getElementById("btnExportarRespuestas").addEventListener("click", () => exportarTablaExcel("tablaRespuestas", "respuestas.xlsx"));

  document.getElementById("aplicarFiltrosGraficos").addEventListener("click", renderGraficos);
  document.getElementById("btnGraficosAnio").addEventListener("click", () => {
    document.getElementById("graficosDesde").value = "";
    document.getElementById("graficosHasta").value = "";
    renderGraficos();
  });

  if (State.getFuentes().length) fetchYProcesar();
});
