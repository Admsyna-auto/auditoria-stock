/**
 * Revisa las respuestas del día y manda un mail de reclamo (por Gmail) a
 * cada local que no completó su control esperado. Corre desde GitHub
 * Actions (ver .github/workflows/reclamos.yml), reusando la misma lógica
 * de validación que la app (js/validacion.js, js/csv.js).
 *
 * Variables de entorno requeridas:
 *   GMAIL_USER            cuenta que envía los mails
 *   GMAIL_APP_PASSWORD    contraseña de aplicación de esa cuenta
 *   LOCALES_EMAILS_JSON   JSON: { "<codigo sin prefijo>": { "emailLocal": "...", "emailReferente": "..." } }
 *   DRY_RUN               "true" para solo mostrar qué mandaría, sin enviar ni loguear
 */
const fs = require("fs");
const path = require("path");
const nodemailer = require("nodemailer");
const { csvToObjects } = require("../js/csv.js");
const { procesarRespuestas, claveLocal } = require("../js/validacion.js");

const ROOT = path.join(__dirname, "..");
const RUTA_COMPARTIDO = path.join(ROOT, "data", "compartido.json");
const RUTA_LOG = path.join(ROOT, "data", "reclamos-log.json");
const TZ = "America/Argentina/Cordoba";
const MAX_ENVIOS_POR_CORRIDA = 200;

function fechaKeyHoyEnTZ() {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const obj = Object.fromEntries(partes.map((p) => [p.type, p.value]));
  return `${obj.year}-${obj.month}-${obj.day}`;
}

function diaIsoDeFechaKey(fechaKey) {
  const [y, m, d] = fechaKey.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Dom..6=Sab
  return dow === 0 ? 7 : dow;
}

async function main() {
  const dryRun = String(process.env.DRY_RUN || "").toLowerCase() === "true";
  const compartido = JSON.parse(fs.readFileSync(RUTA_COMPARTIDO, "utf-8"));
  const localesActivos = (compartido.locales || []).filter((l) => l.activo !== false);
  const fuentes = compartido.fuentes || [];
  const config = compartido.config || { allowedStartHour: 8, allowedStartMinute: 0, allowedEndHour: 23, allowedEndMinute: 30 };
  const emailsPorCodigo = JSON.parse(process.env.LOCALES_EMAILS_JSON || "{}");

  const fechaKey = fechaKeyHoyEnTZ();
  const diaIso = diaIsoDeFechaKey(fechaKey);

  const log = fs.existsSync(RUTA_LOG) ? JSON.parse(fs.readFileSync(RUTA_LOG, "utf-8")) : [];
  const logKeys = new Set(log.map((l) => l.key));

  const candidatos = [];

  for (const fuente of fuentes) {
    const calDia = (fuente.calendario || []).find((c) => Number(c.dia_semana) === diaIso);
    if (!calDia) continue; // esta fuente no espera control hoy

    const localesDeFuente = localesActivos.filter((l) => (fuente.marcas || []).includes(l.marca));
    if (!localesDeFuente.length) continue;

    let rows = [];
    try {
      const resp = await fetch(fuente.csvUrl);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      rows = csvToObjects(await resp.text());
    } catch (err) {
      console.error(`No se pudo descargar el CSV de "${fuente.nombre}": ${err.message}`);
      continue;
    }

    const resultados = procesarRespuestas(rows, localesDeFuente, fuente.calendario || [], config);
    const deHoy = resultados.filter((r) => r.fechaKey === fechaKey);

    const mejorPorLocal = new Map();
    deHoy.forEach((r) => {
      const actual = mejorPorLocal.get(r.localCodigo);
      if (!actual || r.estado === "✅ OK") mejorPorLocal.set(r.localCodigo, r);
    });

    localesDeFuente.forEach((local) => {
      const clave = claveLocal(local.codigo);
      const resultado = mejorPorLocal.get(clave);
      if (resultado && resultado.estado === "✅ OK") return;

      candidatos.push({
        local,
        tipoEsperado: calDia.tipo_esperado,
        estado: resultado ? resultado.estado : "❌ No completó el control",
        detalle: resultado ? resultado.detalle : "No se encontró ninguna carga de este local hoy.",
        fuenteNombre: fuente.nombre,
      });
    });
  }

  console.log(`Fecha controlada: ${fechaKey} (día ISO ${diaIso}). Candidatos a reclamo: ${candidatos.length}.`);

  const transporter = dryRun
    ? null
    : nodemailer.createTransport({
        service: "gmail",
        auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
      });

  let enviados = 0;
  for (const c of candidatos) {
    if (enviados >= MAX_ENVIOS_POR_CORRIDA) break;

    const clave = claveLocal(c.local.codigo);
    const emails = emailsPorCodigo[clave];
    if (!emails || !emails.emailLocal) {
      console.log(`SIN EMAIL configurado para ${c.local.codigo} (${c.local.nombre}) — se omite.`);
      continue;
    }

    const key = `${fechaKey}||${c.tipoEsperado}||${c.local.codigo}`;
    if (logKeys.has(key)) continue;

    const subject = `[RECLAMO] Control de stock - ${c.tipoEsperado} - ${fechaKey}`;
    const body = `Hola equipo de ${c.local.nombre},

No registramos el control diario correspondiente a:
• Fecha: ${fechaKey}
• Control esperado: ${c.tipoEsperado}

Estado detectado: ${c.estado}
Detalle: ${c.detalle}

Por favor, realizar la carga correcta a la brevedad desde el formulario habitual.

NO RESPONDER ESTE MAIL.
ANTE CUALQUIER CONSULTA COMUNICARSE CON:
Mail: ${process.env.GMAIL_USER || "auditoria@grupomeditel.com"}

Gracias,
Auditoría / Administración
`;

    if (dryRun) {
      console.log(`[DRY RUN] Enviaría a ${emails.emailLocal}${emails.emailReferente ? " (CC: " + emails.emailReferente + ")" : ""}: ${subject}`);
    } else {
      await transporter.sendMail({
        from: `"Equipo de Auditoría" <${process.env.GMAIL_USER}>`,
        to: emails.emailLocal,
        cc: emails.emailReferente || undefined,
        subject,
        text: body,
      });
      log.push({ key, enviadoEn: new Date().toISOString(), local: c.local.codigo, estado: c.estado });
      logKeys.add(key);
    }
    enviados++;
  }

  if (!dryRun) {
    fs.writeFileSync(RUTA_LOG, JSON.stringify(log, null, 2));
  }
  console.log(`${dryRun ? "[DRY RUN] Se habrían enviado" : "Enviados"}: ${enviados} de ${candidatos.length} candidatos.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
