const RUTA_COMPARTIDO = "data/compartido.json";

/**
 * Trae data/compartido.json (locales sin email, fuentes, config) y lo
 * mezcla con lo que ya hay en este navegador. Los emails locales/referente
 * de cada Local se preservan siempre (nunca viven en el archivo compartido).
 */
async function sincronizarDesdeCompartido(mostrarAlerta) {
  try {
    const resp = await fetch(RUTA_COMPARTIDO + "?_=" + Date.now());
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    const compartido = await resp.json();

    // Fuentes: upsert por id, preserva fuentes 100% locales que no estén en el compartido.
    const fuentesLocales = State.getFuentes();
    const fuentesPorId = new Map(fuentesLocales.map((f) => [f.id, f]));
    (compartido.fuentes || []).forEach((f) => {
      fuentesPorId.set(f.id, { ...fuentesPorId.get(f.id), ...f });
    });
    State.setFuentes([...fuentesPorId.values()]);

    // Locales: upsert por código, preservando emailLocal/emailReferente locales.
    const localesLocales = State.getLocales();
    const localesPorClave = new Map(localesLocales.map((l) => [claveLocal(l.codigo), l]));
    (compartido.locales || []).forEach((l) => {
      const clave = claveLocal(l.codigo);
      const existente = localesPorClave.get(clave);
      localesPorClave.set(clave, {
        ...l,
        emailLocal: existente?.emailLocal || "",
        emailReferente: existente?.emailReferente || "",
      });
    });
    State.setLocales([...localesPorClave.values()]);

    if (compartido.config) State.setConfig(compartido.config);

    const ahora = new Date().toLocaleString("es-AR");
    State.setUltimaSync(ahora);
    setEstadoGithub(`Sincronizado desde GitHub (${ahora}).`);
    if (mostrarAlerta) alert("Sincronización completa.");
    return true;
  } catch (err) {
    setEstadoGithub("Error al sincronizar: " + err.message);
    if (mostrarAlerta) alert("Error al sincronizar: " + err.message);
    return false;
  }
}

function construirPayloadCompartido() {
  const locales = State.getLocales().map((l) => ({
    codigo: l.codigo,
    marca: l.marca || "",
    nombre: l.nombre || "",
    provincia: l.provincia || "",
    responsable: l.responsable || "",
    activo: l.activo !== false,
  }));
  const fuentes = State.getFuentes().map((f) => ({
    id: f.id,
    nombre: f.nombre || "",
    csvUrl: f.csvUrl || "",
    marcas: f.marcas || [],
    calendario: f.calendario || [],
  }));
  return { locales, fuentes, config: State.getConfig() };
}

function setEstadoGithub(texto) {
  const estadoEl = document.getElementById("estadoSyncGithub");
  const estadoGlobalEl = document.getElementById("estadoCargaGlobal");
  if (estadoEl) estadoEl.textContent = texto;
  if (estadoGlobalEl) estadoGlobalEl.textContent = texto;
}

async function guardarEnGithub() {
  const token = State.getGithubToken();
  const repo = State.getGithubRepo();
  if (!token) {
    setEstadoGithub("Pegá tu token de GitHub en la pestaña Config primero.");
    alert("Todavía no configuraste tu token de GitHub. Andá a la pestaña Config para crearlo y pegarlo (una sola vez).");
    return;
  }

  const btnGlobal = document.getElementById("btnGuardarGithubGlobal");
  if (btnGlobal) btnGlobal.disabled = true;
  setEstadoGithub("Guardando en GitHub...");
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
  };
  const url = `https://api.github.com/repos/${repo}/contents/${RUTA_COMPARTIDO}`;

  try {
    let sha;
    const actual = await fetch(url, { headers });
    if (actual.ok) {
      sha = (await actual.json()).sha;
    } else if (actual.status !== 404) {
      throw new Error(`No se pudo leer el archivo actual (HTTP ${actual.status})`);
    }

    const payload = construirPayloadCompartido();
    const contenido = JSON.stringify(payload, null, 2);
    const contenidoB64 = btoa(unescape(encodeURIComponent(contenido)));

    const resp = await fetch(url, {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `Actualiza Locales/Config desde la app (${new Date().toLocaleString("es-AR")})`,
        content: contenidoB64,
        sha,
      }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.message || `HTTP ${resp.status}`);
    }

    const ahora = new Date().toLocaleString("es-AR");
    State.setUltimaSync(ahora);
    setEstadoGithub(`Guardado en GitHub correctamente (${ahora}). El sitio público tarda unos minutos en reflejarlo.`);
  } catch (err) {
    setEstadoGithub("Error al guardar en GitHub: " + err.message);
  } finally {
    if (btnGlobal) btnGlobal.disabled = false;
  }
}
