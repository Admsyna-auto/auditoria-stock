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

async function fetchYProcesar() {
  const url = State.getCsvUrl();
  const estadoEl = document.getElementById("estadoCarga");
  if (!url) {
    estadoEl.textContent = "Configurá primero el link CSV en la pestaña Config.";
    return;
  }
  estadoEl.textContent = "Descargando respuestas...";
  try {
    const resp = await fetch(url + (url.includes("?") ? "&" : "?") + "_=" + Date.now());
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    const text = await resp.text();
    const rows = csvToObjects(text);
    const locales = State.getLocales();
    const calendario = State.getCalendario();
    const config = State.getConfig();
    RESULTADOS = procesarRespuestas(rows, locales, calendario, config);
    estadoEl.textContent = `${rows.length} respuestas procesadas (${new Date().toLocaleTimeString("es-AR")}).`;
    renderTodo();
  } catch (err) {
    estadoEl.textContent = "Error al descargar/procesar: " + err.message;
  }
}

function renderTodo() {
  renderResumen();
  renderDashboard();
  renderRespuestas();
  renderLocalesNuevos();
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

function renderDashboard() {
  const locales = State.getLocales();
  const calendario = State.getCalendario();
  const diasConControl = new Set(calendario.map((c) => Number(c.dia_semana)));

  const desdeInput = document.getElementById("desde").value;
  const hastaInput = document.getElementById("hasta").value;
  const hasta = hastaInput ? fechaKeyToDate(hastaInput) : new Date();
  const desde = desdeInput
    ? fechaKeyToDate(desdeInput)
    : new Date(hasta.getTime() - 27 * 86400000);

  const fechas = [];
  for (let d = new Date(desde); d <= hasta; d = new Date(d.getTime() + 86400000)) {
    fechas.push(d.toISOString().slice(0, 10));
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
    html += `<tr><td class="local">${local.nombre}</td>`;
    fechas.forEach((fechaKey) => {
      const diaIso = fechaKeyToDate(fechaKey).getUTCDay() === 0 ? 7 : fechaKeyToDate(fechaKey).getUTCDay();
      if (!diasConControl.has(diaIso)) {
        html += '<td class="blank"></td>';
        return;
      }
      const ok = okSet.has(`${local.codigo}|${fechaKey}`);
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
  const filtradas = RESULTADOS.filter((r) => {
    if (filtroEstado && r.estado !== filtroEstado) return false;
    if (filtroTexto && !(r.sucursalRaw || "").toLowerCase().includes(filtroTexto)) return false;
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
    "<table><thead><tr><th>Fecha</th><th>Sucursal</th><th>Tipo seleccionado</th><th>Tipo esperado</th><th>Estado</th><th>Detalle</th><th>Archivo</th></tr></thead><tbody>";
  filtradas
    .slice()
    .reverse()
    .forEach((r) => {
      const archivoHtml = r.archivo && r.archivo.startsWith("http")
        ? `<a href="${r.archivo}" target="_blank" rel="noopener">link</a>`
        : r.archivo || "";
      html += `<tr><td>${r.marcaTemporal}</td><td>${r.sucursalRaw}</td><td>${r.tipoNormalizado || r.tipoRaw}</td><td>${r.tipoEsperado || ""}</td><td>${r.estado}</td><td>${r.detalle}</td><td>${archivoHtml}</td></tr>`;
    });
  html += "</tbody></table>";
  document.getElementById("tablaRespuestas").innerHTML = html;
}

function renderLocales() {
  const locales = State.getLocales();
  let html =
    "<table><thead><tr><th>Código</th><th>Marca</th><th>Nombre</th><th>Provincia</th><th>Email local</th><th>Email referente</th><th>Activo</th><th></th></tr></thead><tbody>";
  locales.forEach((l, i) => {
    html += `<tr>
      <td><input data-i="${i}" data-f="codigo" value="${l.codigo || ""}"></td>
      <td><input data-i="${i}" data-f="marca" value="${l.marca || ""}"></td>
      <td><input data-i="${i}" data-f="nombre" value="${(l.nombre || "").replace(/"/g, "&quot;")}"></td>
      <td><input data-i="${i}" data-f="provincia" value="${l.provincia || ""}"></td>
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

function agregarLocalManual() {
  const locales = State.getLocales();
  locales.push({ codigo: "", marca: "", nombre: "", provincia: "", emailLocal: "", emailReferente: "", activo: true });
  State.setLocales(locales);
  renderLocales();
}

function renderLocalesNuevos() {
  const locales = State.getLocales();
  const codigosExistentes = new Set(locales.map((l) => l.codigo));
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
        codigo,
        marca: marcaDeNombre(nombre),
        nombre,
        provincia: "",
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

function renderCalendario() {
  const cal = State.getCalendario();
  const byDia = {};
  cal.forEach((c) => (byDia[c.dia_semana] = c.tipo_esperado));
  let html = "<table><thead><tr><th>Día</th><th>Tipo esperado</th></tr></thead><tbody>";
  for (let d = 1; d <= 7; d++) {
    html += `<tr><td>${diaLabel(d)}</td><td><input data-dia="${d}" value="${byDia[d] || ""}"></td></tr>`;
  }
  html += "</tbody></table>";
  document.getElementById("tablaCalendario").innerHTML = html;
}

function guardarCalendario() {
  const filas = Array.from(document.querySelectorAll("#tablaCalendario input[data-dia]"))
    .map((i) => ({ dia_semana: Number(i.dataset.dia), tipo_esperado: i.value.trim() }))
    .filter((f) => f.tipo_esperado);
  State.setCalendario(filas);
  alert("Calendario guardado.");
  if (RESULTADOS.length) fetchYProcesar();
}

function importarLocalesSeed() {
  const estadoEl = document.getElementById("estadoSeed");
  try {
    const seed = LOCALES_SEED || [];
    const locales = State.getLocales();
    const existentes = new Set(locales.map((l) => l.codigo));
    let agregados = 0;
    seed.forEach((l) => {
      if (!existentes.has(l.codigo)) {
        locales.push(l);
        agregados++;
      }
    });
    State.setLocales(locales);
    renderLocales();
    if (RESULTADOS.length) renderLocalesNuevos();
    estadoEl.textContent = `${agregados} locales agregados (${seed.length - agregados} ya existían).`;
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
    });
  });
}

function initConfig() {
  const input = document.getElementById("csvUrl");
  input.value = State.getCsvUrl();
  document.getElementById("guardarCsvUrl").addEventListener("click", () => {
    State.setCsvUrl(input.value.trim());
    fetchYProcesar();
  });

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
}

window.addEventListener("DOMContentLoaded", () => {
  initTabs();
  initConfig();
  renderLocales();
  renderCalendario();
  document.getElementById("btnActualizar").addEventListener("click", fetchYProcesar);
  document.getElementById("aplicarFiltrosDashboard").addEventListener("click", renderDashboard);
  document.getElementById("filtroEstado").addEventListener("change", renderRespuestas);
  document.getElementById("filtroTexto").addEventListener("input", renderRespuestas);
  document.getElementById("btnAgregarLocal").addEventListener("click", agregarLocalManual);
  document.getElementById("guardarCalendarioBtn").addEventListener("click", guardarCalendario);
  document.getElementById("btnImportarSeed").addEventListener("click", importarLocalesSeed);

  if (State.getCsvUrl()) fetchYProcesar();
});
