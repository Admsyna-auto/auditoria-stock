const LS_KEYS = {
  CSV_URL: "as_csv_url",
  FUENTES: "as_fuentes",
  LOCALES: "as_locales",
  CALENDARIO: "as_calendario",
  CONFIG: "as_config",
};

const DEFAULT_CALENDARIO = [
  { dia_semana: 1, tipo_esperado: "Imei de equipos ( Notebook -Tablet- tv- play- joystick)" },
  { dia_semana: 2, tipo_esperado: "Celulares" },
  { dia_semana: 3, tipo_esperado: "Parlantes y auriculares" },
  { dia_semana: 4, tipo_esperado: "Relojes y Hydros" },
];

const DEFAULT_CONFIG = {
  allowedStartHour: 8,
  allowedStartMinute: 0,
  allowedEndHour: 23,
  allowedEndMinute: 30,
};

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}
function saveJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

const State = {
  // Lista de fuentes: [{ id, nombre, csvUrl, marcas: [...], calendario: [{dia_semana, tipo_esperado}] }].
  // Cada fuente (Form) tiene su propio calendario de tipos esperados, porque
  // por ejemplo JBL usa controles distintos a RIIING/DIGGIT los mismos días.
  // Migra automáticamente instalaciones previas (link CSV único, o fuentes
  // sin calendario/marcas todavía).
  getFuentes: () => {
    let fuentes = loadJSON(LS_KEYS.FUENTES, null);
    if (!fuentes) {
      const urlVieja = localStorage.getItem(LS_KEYS.CSV_URL);
      fuentes = urlVieja ? [{ id: "riiing-diggit", nombre: "RIIING / DIGGIT", csvUrl: urlVieja }] : [];
    }
    const calendarioViejo = loadJSON(LS_KEYS.CALENDARIO, null);
    let cambio = false;
    fuentes.forEach((f) => {
      if (!f.calendario) {
        f.calendario = calendarioViejo || DEFAULT_CALENDARIO;
        cambio = true;
      }
      if (!f.marcas) {
        f.marcas = [];
        cambio = true;
      }
    });
    if (cambio) saveJSON(LS_KEYS.FUENTES, fuentes);
    return fuentes;
  },
  setFuentes: (fuentes) => saveJSON(LS_KEYS.FUENTES, fuentes),

  getLocales: () => loadJSON(LS_KEYS.LOCALES, []),
  setLocales: (locales) => saveJSON(LS_KEYS.LOCALES, locales),

  getConfig: () => Object.assign({}, DEFAULT_CONFIG, loadJSON(LS_KEYS.CONFIG, {})),
  setConfig: (cfg) => saveJSON(LS_KEYS.CONFIG, cfg),
};
