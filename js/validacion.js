function normalizeTipo(tipoRaw) {
  if (!tipoRaw) return "";
  return tipoRaw.replace(/^[^:]+:\s*/i, "").trim();
}

/**
 * Clave canónica para matchear un local, sin importar si el código está
 * escrito como "SUC-554", "554" o "Suc 554": siempre se compara por el
 * número puro. Así una edición manual del campo Código no rompe el cruce
 * con las respuestas del Form.
 */
function claveLocal(codigo) {
  const digitos = (codigo || "").replace(/\D/g, "");
  return digitos || (codigo || "").trim().toUpperCase();
}

function codigoDeSucursal(nombre) {
  const m = (nombre || "").match(/SUC-(\d+)/i);
  return claveLocal(m ? m[1] : nombre);
}

// "26/01/2026 10:34:52" -> { fechaKey, diaIso(1=Lun..7=Dom), hour, minute }
function parseFechaForm(marcaTemporal) {
  const m = (marcaTemporal || "").match(
    /(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/
  );
  if (!m) return null;
  const [, dd, mm, yyyy, hh, min] = m;
  const d = Number(dd), mo = Number(mm), y = Number(yyyy);
  const h = Number(hh), mi = Number(min);
  const dow = new Date(Date.UTC(y, mo - 1, d)).getUTCDay(); // 0=Dom..6=Sab
  const diaIso = dow === 0 ? 7 : dow;
  const fechaKey = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return { fechaKey, diaIso, hour: h, minute: mi };
}

function getExpectedType(diaIso, calendario) {
  const row = calendario.find((c) => Number(c.dia_semana) === diaIso);
  return row ? row.tipo_esperado : "";
}

/**
 * Procesa las respuestas del form en orden cronológico, replicando la lógica
 * de onFormSubmit del Apps Script original (horario, tipo esperado, duplicados).
 */
function procesarRespuestas(rows, locales, calendario, config) {
  const localByCodigo = new Map();
  locales.forEach((l) => localByCodigo.set(claveLocal(l.codigo), l));

  const vistosPorDia = new Map(); // localCodigo|fechaKey -> true (hubo carga ese día)
  const okPorTipo = new Map(); // localCodigo|fechaKey|tipoEsperado -> true (hubo OK)

  const resultados = [];

  rows.forEach((row) => {
    const marcaTemporal = row["Marca temporal"];
    const sucursalRaw = row["Sucursal"];
    const tipoRaw = row["  Tipo de control  "] || row["Tipo de control"] || "";
    const archivo = row["Subir archivo (Excel)  "] || row["Subir archivo (Excel)"] || row["Subir archivo"] || "";
    const email = row["Dirección de correo electrónico"] || "";

    const fecha = parseFechaForm(marcaTemporal);
    const localCodigo = codigoDeSucursal(sucursalRaw);
    const local = localByCodigo.get(localCodigo);
    const tipoNormalizado = normalizeTipo(tipoRaw);

    if (!fecha || !sucursalRaw || !tipoRaw) {
      resultados.push({
        marcaTemporal, sucursalRaw, localCodigo, local, tipoRaw, tipoNormalizado,
        tipoEsperado: "", estado: "❌ Error", detalle: "Faltan campos Sucursal/Tipo de control", archivo, email,
      });
      return;
    }

    const { fechaKey, diaIso, hour, minute } = fecha;

    const inTime =
      (hour > config.allowedStartHour ||
        (hour === config.allowedStartHour && minute >= config.allowedStartMinute)) &&
      (hour < config.allowedEndHour ||
        (hour === config.allowedEndHour && minute <= config.allowedEndMinute));

    const expectedType = getExpectedType(diaIso, calendario);
    const hasExpected = expectedType !== "";
    const typeOk = hasExpected ? tipoNormalizado === expectedType : false;

    const claveDia = `${localCodigo}|${fechaKey}`;
    const claveTipo = `${localCodigo}|${fechaKey}|${expectedType}`;

    let estado, detalle;

    if (!inTime) {
      estado = "❌ Fuera de horario";
      detalle = `Hora ${hour}:${String(minute).padStart(2, "0")} fuera de ${config.allowedStartHour}:00-${config.allowedEndHour}:${String(config.allowedEndMinute).padStart(2, "0")}`;
    } else if (!hasExpected) {
      estado = "⚠️ Día sin control";
      detalle = `No hay control esperado en Calendario para día ${diaIso}. Seleccionado: ${tipoNormalizado}`;
    } else if (vistosPorDia.has(claveDia)) {
      estado = "⚠️ Carga múltiple en el mismo día";
      detalle = "El local registró más de una carga en la misma fecha.";
    } else if (!typeOk) {
      estado = "⚠️ Tipo incorrecto";
      detalle = `Esperado: ${expectedType} (día ${diaIso}) | Seleccionado: ${tipoNormalizado}`;
    } else if (okPorTipo.has(claveTipo)) {
      estado = "❌ Duplicado";
      detalle = `Ya existe una carga OK para este local el ${fechaKey} (${expectedType})`;
    } else {
      estado = "✅ OK";
      detalle = "Carga válida";
    }

    if (inTime && hasExpected) {
      vistosPorDia.set(claveDia, true);
      if (estado === "✅ OK") okPorTipo.set(claveTipo, true);
    }

    resultados.push({
      marcaTemporal, fechaKey, diaIso, sucursalRaw, localCodigo, local,
      tipoRaw, tipoNormalizado, tipoEsperado: expectedType, estado, detalle, archivo, email,
    });
  });

  return resultados;
}
