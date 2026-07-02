const LS_KEYS = {
  CSV_URL: "as_csv_url",
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
  getCsvUrl: () => localStorage.getItem(LS_KEYS.CSV_URL) || "",
  setCsvUrl: (url) => localStorage.setItem(LS_KEYS.CSV_URL, url),

  getLocales: () => loadJSON(LS_KEYS.LOCALES, []),
  setLocales: (locales) => saveJSON(LS_KEYS.LOCALES, locales),

  getCalendario: () => loadJSON(LS_KEYS.CALENDARIO, DEFAULT_CALENDARIO),
  setCalendario: (cal) => saveJSON(LS_KEYS.CALENDARIO, cal),

  getConfig: () => Object.assign({}, DEFAULT_CONFIG, loadJSON(LS_KEYS.CONFIG, {})),
  setConfig: (cfg) => saveJSON(LS_KEYS.CONFIG, cfg),
};
