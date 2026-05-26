let rawMessageRows = [];
let campaignRows = [];
let groupedRows = [];
let consolidatedRows = [];
let estadoChart = null;
let horasChart = null;

const STORAGE_KEY_CAMPAIGN = "campania_previa_para_masivos_v1";
const STORAGE_KEY_CAMPAIGN_META = "campania_previa_para_masivos_meta_v1";

let campaignMetaRows = [];

const campaignFileInput = document.getElementById("campaignFileInput");
const messagesFileInput = document.getElementById("messagesFileInput");
const btnProcesar = document.getElementById("btnProcesar");
const fechaEnvioFiltro = document.getElementById("fechaEnvioFiltro");
const fechaCitaFiltro = document.getElementById("fechaCitaFiltro");
const estadoFiltro = document.getElementById("estadoFiltro");
const numeroFiltro = document.getElementById("numeroFiltro");
const cedulaFiltro = document.getElementById("cedulaFiltro");
const nombreFiltro = document.getElementById("nombreFiltro");
const dashboard = document.getElementById("dashboard");
const kpis = document.getElementById("kpis");
const vistaActual = document.getElementById("vistaActual");
const btnExportar = document.getElementById("btnExportar");

if (btnProcesar) btnProcesar.addEventListener("click", procesarArchivos);
if (fechaEnvioFiltro) fechaEnvioFiltro.addEventListener("change", renderDashboard);
if (fechaCitaFiltro) fechaCitaFiltro.addEventListener("change", renderDashboard);
if (estadoFiltro) estadoFiltro.addEventListener("change", renderDashboard);
if (numeroFiltro) numeroFiltro.addEventListener("input", renderDashboard);
if (cedulaFiltro) cedulaFiltro.addEventListener("input", renderDashboard);
if (nombreFiltro) nombreFiltro.addEventListener("input", renderDashboard);
if (btnExportar) btnExportar.addEventListener("click", exportarCSV);

document.querySelectorAll(".pill").forEach(pill => {
  pill.addEventListener("click", e => {
    e.preventDefault();
    if (estadoFiltro) estadoFiltro.value = pill.dataset.estado || "TODOS";
    renderDashboard();
  });
});

document.addEventListener("DOMContentLoaded", () => {
  actualizarNotaCampaniaPrecargada();
});

function normalizeText(text) {
  if (text === null || text === undefined) return "";
  return String(text)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function normalizarTelefono(text) {
  const raw = String(text || "").trim();
  if (!raw) return "";

  const candidatos = raw.match(/\d{7,13}/g) || [];
  for (const c of candidatos) {
    let dig = c.replace(/\D/g, "");

    if (dig.startsWith("0057")) dig = dig.slice(4);
    if (dig.startsWith("57") && dig.length >= 12) dig = dig.slice(2);

    if (dig.length === 10) return dig;
    if (dig.length > 10) return dig.slice(-10);
  }

  const dig = raw.replace(/\D/g, "");
  if (dig.startsWith("0057")) return dig.slice(4, 14);
  if (dig.startsWith("57") && dig.length >= 12) return dig.slice(2, 12);
  if (dig.length >= 10) return dig.slice(0, 10);

  return dig;
}

function obtenerCampaniaGuardada() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CAMPAIGN);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed) return null;
    if (!Array.isArray(parsed.rows)) return null;
    if (!parsed.rows.length) return null;

    return parsed.rows;
  } catch (e) {
    console.warn("No se pudo leer la campaña guardada:", e);
    return null;
  }
}

function obtenerMetaCampaniaGuardada() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CAMPAIGN_META);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.rows)) return [];
    return parsed.rows;
  } catch (e) {
    console.warn("No se pudo leer la meta de la campaña guardada:", e);
    return [];
  }
}

function guardarCampaniaNormalizada(rows) {
  try {
    localStorage.setItem(
      STORAGE_KEY_CAMPAIGN,
      JSON.stringify({
        savedAt: new Date().toISOString(),
        rows
      })
    );
    return true;
  } catch (e) {
    console.error("No se pudo guardar la campaña en localStorage:", e);
    return false;
  }
}

function limpiarCampaniaGuardada() {
  try {
    localStorage.removeItem(STORAGE_KEY_CAMPAIGN);
    localStorage.removeItem(STORAGE_KEY_CAMPAIGN_META);
  } catch (e) {
    console.warn("No se pudo limpiar la campaña guardada:", e);
  }
}

function borrarCampaniaGuardadaConAviso() {
  limpiarCampaniaGuardada();
  actualizarNotaCampaniaPrecargada();
  alert("Campaña guardada eliminada.");
}

function actualizarNotaCampaniaPrecargada() {
  const existente = document.getElementById("campaniaPrecargadaInfo");
  if (existente) existente.remove();

  const saved = obtenerCampaniaGuardada();
  const subnote = document.querySelector(".subnote");
  if (!subnote || !saved || !saved.length) return;

  const box = document.createElement("div");
  box.id = "campaniaPrecargadaInfo";
  box.style.marginTop = "10px";
  box.style.padding = "10px 12px";
  box.style.borderRadius = "10px";
  box.style.background = "#eef7ff";
  box.style.border = "1px solid #cfe2f5";
  box.innerHTML = `
    <strong>Campaña precargada detectada:</strong> ${saved.length} registros listos desde la página previa.
    <br>Puedes procesar solo con el archivo de respuestas.
    <div style="margin-top:8px;">
      <button type="button" id="btnBorrarCampaniaPrecargada" style="width:auto;padding:8px 12px;font-size:12px;">
        Borrar campaña guardada
      </button>
    </div>
  `;

  subnote.appendChild(box);

  const btnBorrar = document.getElementById("btnBorrarCampaniaPrecargada");
  if (btnBorrar) {
    btnBorrar.addEventListener("click", borrarCampaniaGuardadaConAviso);
  }
}

function classifyMessage(text) {
  const t = normalizeText(text);

  if (
    t === "confirmar asistencia" ||
    t === "confirmo asistencia" ||
    t === "si confirmo asistencia" ||
    t === "si confirmo"
  ) {
    return "CONFIRMA";
  }

  if (
    t === "no podre asistir" ||
    t === "no podré asistir" ||
    t === "no puedo asistir"
  ) {
    return "NO_ASISTE";
  }

  if (t === "ya fui atendido") return "YA_ATENDIDO";
  if (t === "tengo cita en medyreh") return "TIENE_CITA_MEDYREH";
  if (t === "no me han programado cita") return "NO_HAN_PROGRAMADO";

  return null;
}

function classifyMedyrehMessage(text) {
  const t = normalizeText(text);
  if (t === "ya fui atendido") return "YA_FUI_ATENDIDO";
  if (t === "tengo cita en medyreh") return "TIENE_CITA_MEDYREH";
  if (t === "no me han programado cita") return "NO_PROGRAMADO";
  return null;
}

function extraerNombreDesdeTemplate(mensaje) {
  const m = String(mensaje || "").match(/Saludos\s+Sr\(a\)\.\s*(.*?)\s*\./i);
  return m ? m[1].trim() : "";
}

function extraerServicioDesdeTemplate(mensaje) {
  const m = String(mensaje || "").match(/autorizaci[oó]n para el servicio de\s+(.*?)\s+en la IPS/i);
  return m ? m[1].trim() : "";
}

function transformBaseRowsMedyreh(data) {
  if (!data || !data.length) return [];

  const columns = Object.keys(data[0] || {});

  // Mapeo priorizado: nombre exacto de la campaña → alias genéricos
  const colCedula    = findColumn(columns, ["CodCliente",  "cedula",        "documento",    "identificacion"]);
  const colCelular   = findColumn(columns, ["Telefono1",   "celular",       "telefono",     "movil", "numero", "phone"]);
  const colNombre    = findColumn(columns, ["Info1",       "nombre",        "paciente",     "usuario"]);
  const colServicio  = findColumn(columns, ["Info3",       "servicio",      "especialidad", "procedimiento"]);
  const colCodCamp   = findColumn(columns, ["CodCampanna", "cod_campanna",  "codigo_campana"]);
  const colFechaMod  = findColumn(columns, ["FechaMod",    "fecha_mod",     "fecha_base",   "fecha"]);

  console.log("[transformBaseRowsMedyreh] Mapeo de columnas detectado →",
    { colCedula, colCelular, colNombre, colServicio, colCodCamp, colFechaMod }
  );

  // Índice para detectar duplicados (celular normalizado → índice de fila 0-based)
  const seenCelulares = new Map();
  const resultado = [];

  for (let i = 0; i < data.length; i++) {
    const r = data[i];

    const celularRaw = String(colCelular ? r[colCelular] || "" : "").trim();
    const celular = normalizarTelefono(celularRaw);
    if (!celular) continue;   // fila sin teléfono → ignorar

    if (seenCelulares.has(celular)) {
      // Regla 8: conservar primer registro no vacío, registrar advertencia
      console.warn(
        `[Base MEDYREH] Celular duplicado: ${celular}` +
        ` — primera aparición fila ${seenCelulares.get(celular) + 2},` +
        ` duplicado ignorado en fila ${i + 2}`
      );
      continue;
    }

    seenCelulares.set(celular, i);
    resultado.push({
      cedula:          String(colCedula   ? r[colCedula]   || "" : "").trim(),
      celular,
      nombre:          String(colNombre   ? r[colNombre]   || "" : "").trim(),
      servicio:        String(colServicio ? r[colServicio] || "" : "").trim(),
      codigo_campanna: String(colCodCamp  ? r[colCodCamp]  || "" : "").trim(),
      fecha_base:      String(colFechaMod ? r[colFechaMod] || "" : "").trim()
    });
  }

  console.log(`[transformBaseRowsMedyreh] ${resultado.length} registros únicos cargados de la base.`);
  return resultado;
}

function isIncomingMessage(msg) {
  const dirNorm = normalizeText(msg?.dir || "");
  return dirNorm.includes("entrada") || dirNorm.includes("inbound") || dirNorm === "in";
}

function isOutgoingMessage(msg) {
  const dirNorm = normalizeText(msg?.dir || "");
  return dirNorm.includes("salida") || dirNorm.includes("outbound") || dirNorm === "out";
}

function isTemplateMessage(msg) {
  if (!msg) return false;
  const nombre = normalizeText(msg.template_name || "");
  const mensaje = normalizeText(msg.mensaje || "");

  if (nombre.includes("confirmacion_boton_masivo") || nombre.includes("confirmacion_masivo")) {
    return true;
  }

  if (nombre.includes("no_me_han_programado_cita") || nombre.includes("no me han programado cita")) {
    return true;
  }

  if (
    mensaje.includes("medyreh integral") &&
    mensaje.includes("queremos confirmar con usted el estado")
  ) {
    return true;
  }

  if (mensaje.includes("queremos confirmar con usted el estado actual frente dicho servicio")) {
    return true;
  }

  return (
    mensaje.includes("por favor confirmar su asistencia") &&
    mensaje.includes("queremos recordar la cita")
  );
}

function formatDateToISO(ddmmyyyy) {
  const m = String(ddmmyyyy).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return "";
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function extraerFechaCita(texto) {
  if (!texto) return "";
  const s = String(texto);

  let m = s.match(/el día\s+(\d{2}\/\d{2}\/\d{4})/i);
  if (m) return formatDateToISO(m[1]);

  m = s.match(/\b(\d{2}\/\d{2}\/\d{4})\b/);
  if (m) return formatDateToISO(m[1]);

  m = s.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (m) return m[1];

  m = s.match(/\b(\d{4}-\d{2}-\d{2})\s+\d{2}:\d{2}:\d{2}\b/);
  if (m) return m[1];

  const meses = {
    enero: "01",
    febrero: "02",
    marzo: "03",
    abril: "04",
    mayo: "05",
    junio: "06",
    julio: "07",
    agosto: "08",
    septiembre: "09",
    setiembre: "09",
    octubre: "10",
    noviembre: "11",
    diciembre: "12"
  };

  m = s.match(/(?:lunes|martes|miercoles|miércoles|jueves|viernes|sabado|sábado|domingo)?\s*(\d{1,2})\s+de\s+([a-záéíóú]+)\s+de\s+(\d{4})/i);
  if (m) {
    const dia = String(m[1]).padStart(2, "0");
    const mesTxt = normalizeText(m[2]);
    const anio = m[3];
    const mes = meses[mesTxt];
    if (mes) return `${anio}-${mes}-${dia}`;
  }

  return "";
}

function parseDateFlexible(v) {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date && !isNaN(v.getTime())) return v;

  if (typeof v === "number") {
    const dias = Math.floor(v);
    const fraccion = v - dias;

    const excelEpoch = new Date(1899, 11, 30);
    excelEpoch.setDate(excelEpoch.getDate() + dias);

    const segundosDelDia = Math.round(fraccion * 86400);
    excelEpoch.setSeconds(excelEpoch.getSeconds() + segundosDelDia);

    return isNaN(excelEpoch.getTime()) ? null : excelEpoch;
  }

  const s = String(v).trim();
  if (!s) return null;

  let m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|am|pm)?)?$/);
  if (m) {
    let hh = Number(m[4] || 0);
    const mm = Number(m[5] || 0);
    const ss = Number(m[6] || 0);
    const ampm = (m[7] || "").toUpperCase();

    if (ampm === "PM" && hh < 12) hh += 12;
    if (ampm === "AM" && hh === 12) hh = 0;

    return new Date(
      Number(m[3]),
      Number(m[2]) - 1,
      Number(m[1]),
      hh,
      mm,
      ss
    );
  }

  m = s.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|am|pm)?$/);
  if (m) {
    let hh = Number(m[4] || 0);
    const mm = Number(m[5] || 0);
    const ss = Number(m[6] || 0);
    const ampm = (m[7] || "").toUpperCase();

    if (ampm === "PM" && hh < 12) hh += 12;
    if (ampm === "AM" && hh === 12) hh = 0;

    return new Date(
      Number(m[1]),
      Number(m[2]) - 1,
      Number(m[3]),
      hh,
      mm,
      ss
    );
  }

  m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (m) {
    return new Date(
      Number(m[1]),
      Number(m[2]) - 1,
      Number(m[3]),
      Number(m[4] || 0),
      Number(m[5] || 0),
      Number(m[6] || 0)
    );
  }

  m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0);
  }

  m = s.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+\-]\d{2}:\d{2})$/);
  if (m) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }

  const d = new Date(s);
  if (!isNaN(d.getTime())) return d;

  return null;
}

function toISODate(d) {
  if (!(d instanceof Date) || isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toDateTimeStr(d) {
  if (!(d instanceof Date) || isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${y}-${m}-${day} ${hh}:${mm}:${ss}`;
}

function findColumn(columns, candidates) {
  const cols = columns.map(c => normalizeText(c));

  for (const cand of candidates) {
    const needle = normalizeText(cand);
    for (let i = 0; i < cols.length; i++) {
      if (cols[i].includes(needle)) return columns[i];
    }
  }

  return null;
}

async function procesarArchivos() {
  const campaignFile = campaignFileInput ? campaignFileInput.files[0] : null;
  const messagesFile = messagesFileInput ? messagesFileInput.files[0] : null;

  if (!messagesFile) {
    alert("Selecciona primero el archivo de respuestas.");
    return;
  }

  try {
    const messagesData = await readGenericFile(messagesFile, false);

    if (campaignFile) {
      const campaignData = await readGenericFile(campaignFile, false);
      campaignRows = transformCampaignRows(campaignData);

      campaignMetaRows = campaignRows.map(r => ({
        cedula: r.cedula || "",
        numero: r.numero || "",
        fecha_hora: r.fecha_cita_str || r.fecha_cita || "",
        entidad: r.entidad || ""
      }));

      guardarCampaniaNormalizada(
        campaignRows.map(r => [
          r.cedula || "",
          r.numero || "",
          r.nombre || "",
          r.especialidad || "",
          r.fecha_cita_str || r.fecha_cita || ""
        ])
      );

      try {
        localStorage.setItem(
          STORAGE_KEY_CAMPAIGN_META,
          JSON.stringify({
            savedAt: new Date().toISOString(),
            rows: campaignMetaRows
          })
        );
      } catch (e) {
        console.warn("No se pudo guardar la metadata de campaña:", e);
      }

      actualizarNotaCampaniaPrecargada();
    } else {
      const savedCampaignRows = obtenerCampaniaGuardada();
      const savedMetaRows = obtenerMetaCampaniaGuardada();

      if (!savedCampaignRows || !savedCampaignRows.length) {
        alert("Selecciona un archivo de campaña o guarda una campaña desde la página previa.");
        return;
      }

      campaignRows = transformCampaignRows(savedCampaignRows);
      campaignMetaRows = savedMetaRows || [];
    }

    rawMessageRows = transformMessageRows(messagesData);

    groupedRows = cruzarCampaniaConMensajes(campaignRows, rawMessageRows);
    consolidatedRows = consolidarPorCedula(groupedRows);

    if (!campaignRows.length) {
      alert("No se pudo interpretar la plantilla de campaña.");
      return;
    }

    if (!rawMessageRows.length) {
      alert("No se pudo interpretar el archivo de respuestas.");
      return;
    }

    if (!groupedRows.length) {
      console.log("campaignRows ejemplo:", campaignRows.slice(0, 5));
      console.log("rawMessageRows ejemplo:", rawMessageRows.slice(0, 10));
      alert("No se encontraron registros válidos. Ya se leyó la campaña y las respuestas, pero no hubo coincidencias entre número + plantilla enviada + fecha de cita.");
      return;
    }

    renderDashboard();
  } catch (e) {
    console.error(e);
    alert("Error procesando archivos: " + (e.message || e));
  }
}

function readGenericFile(file, isCampaignFile = false) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const isCSV = file.name.toLowerCase().endsWith(".csv");

    if (isCSV) {
      reader.onload = e => {
        try {
          const text = e.target.result;
          const wb = XLSX.read(text, { type: "string" });
          const sheet = wb.Sheets[wb.SheetNames[0]];
          if (isCampaignFile) {
            resolve(XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }));
          } else {
            resolve(XLSX.utils.sheet_to_json(sheet, { defval: "" }));
          }
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error("No se pudo leer el archivo CSV."));
      reader.readAsText(file, "utf-8");
    } else {
      reader.onload = e => {
        try {
          const data = new Uint8Array(e.target.result);
          const wb = XLSX.read(data, { type: "array", cellDates: true });
          const sheet = wb.Sheets[wb.SheetNames[0]];
          if (isCampaignFile) {
            resolve(XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }));
          } else {
            resolve(XLSX.utils.sheet_to_json(sheet, { defval: "" }));
          }
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error("No se pudo leer el archivo Excel."));
      reader.readAsArrayBuffer(file);
    }
  });
}

// ─── Lector adaptativo para el archivo base MEDYREH ──────────────────────────
// El archivo puede ser .xls real, .xlsx, .csv o .xls que en realidad es TSV.
// Estrategia: detectar tabulaciones en la primera línea → TSV;
//             si no, parsear como Excel binario; último recurso: XLSX como texto.

function parseTSV(text) {
  const lines = text.split(/\r?\n/);
  const noEmpty = lines.filter(l => l.trim() !== "");
  if (!noEmpty.length) return [];
  const headers = noEmpty[0].split("\t").map(h => h.trim());
  return noEmpty
    .slice(1)
    .filter(l => l.trim() !== "")
    .map(l => {
      const vals = l.split("\t");
      const obj = {};
      headers.forEach((h, i) => {
        obj[h] = String(vals[i] !== undefined ? vals[i] : "").trim();
      });
      return obj;
    });
}

async function readBaseFile(file) {
  let textContent = "";

  // Intentar leer como texto primero (siempre disponible para TSV / CSV)
  try {
    textContent = await file.text();
  } catch (e) {
    console.warn("[readBaseFile] No se pudo leer como texto:", e);
  }

  // 1️⃣  Si la primera línea tiene tabulaciones → es TSV
  if (textContent) {
    const firstLine = textContent.split(/\r?\n/).find(l => l.trim() !== "") || "";
    if (firstLine.includes("\t")) {
      const rows = parseTSV(textContent);
      if (rows.length > 0) {
        console.log(
          `[readBaseFile] TSV detectado → ${rows.length} registros.`,
          "Columnas:", Object.keys(rows[0]).join(", ")
        );
        return rows;
      }
    }
  }

  // 2️⃣  Intentar Excel binario (XLS / XLSX reales)
  try {
    const arrayBuf = await file.arrayBuffer();
    const uint8 = new Uint8Array(arrayBuf);
    const wb = XLSX.read(uint8, { type: "array", cellDates: true });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
    console.log(`[readBaseFile] Excel binario → ${rows.length} registros.`);
    return rows;
  } catch (e) {
    console.warn("[readBaseFile] Excel binario falló, intentando texto con XLSX:", e.message || e);
  }

  // 3️⃣  Último recurso: XLSX sobre el texto (maneja CSV con separador coma/punto y coma)
  if (textContent) {
    try {
      const wb = XLSX.read(textContent, { type: "string" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
      console.log(`[readBaseFile] CSV/texto → ${rows.length} registros.`);
      return rows;
    } catch (e2) {
      throw new Error(
        "No se pudo leer el archivo base como TSV, Excel ni CSV: " + (e2.message || e2)
      );
    }
  }

  throw new Error("No se pudo leer el archivo base (sin contenido legible).");
}

function buildCampaignMetaIndex(rows) {
  const map = new Map();

  for (const row of rows || []) {
    const cedula = String(row?.cedula || "").trim();
    const numero = normalizarTelefono(row?.numero || "");
    const fechaHora = String(row?.fecha_hora || row?.fechaHora || row?.fecha_hora_cita || "").trim();
    const fechaCita = (() => {
      const d = parseDateFlexible(fechaHora);
      return d ? toISODate(d) : "";
    })();
    const entidad = String(row?.entidad || "").trim();
    if (!entidad) continue;

    const keys = [
      `${cedula}|${numero}|${fechaHora}`,
      `${cedula}|${numero}|${fechaCita}`,
      `|${numero}|${fechaHora}`,
      `|${numero}|${fechaCita}`
    ];

    for (const key of keys) {
      if (!map.has(key)) map.set(key, entidad);
    }
  }

  return map;
}

function resolverEntidadCampania(camp, metaIndex) {
  if (!metaIndex || !metaIndex.size) return "";

  const keys = [
    `${camp.cedula || ""}|${camp.numero || ""}|${camp.fecha_cita_str || ""}`,
    `${camp.cedula || ""}|${camp.numero || ""}|${camp.fecha_cita || ""}`,
    `|${camp.numero || ""}|${camp.fecha_cita_str || ""}`,
    `|${camp.numero || ""}|${camp.fecha_cita || ""}`
  ];

  for (const key of keys) {
    if (metaIndex.has(key)) return metaIndex.get(key) || "";
  }

  return "";
}

function transformCampaignRows(rows) {
  if (!rows || !rows.length) return [];

  const firstRowIsArray = Array.isArray(rows[0]);

  if (firstRowIsArray) {
    const rowsNoVacias = rows.filter(r => Array.isArray(r) && r.some(v => String(v || "").trim() !== ""));
    if (!rowsNoVacias.length) return [];

    let dataRows = rowsNoVacias;
    const first = rowsNoVacias[0].map(v => normalizeText(v));

    const pareceEncabezado =
      first.some(v => v.includes("cedula")) ||
      first.some(v => v.includes("celular")) ||
      first.some(v => v.includes("telefono")) ||
      first.some(v => v.includes("fecha")) ||
      first.some(v => v.includes("servicio")) ||
      first.some(v => v.includes("especialidad"));

    if (pareceEncabezado) {
      dataRows = rowsNoVacias.slice(1);
    }

    return dataRows
      .filter(r => Array.isArray(r) && r.length >= 5)
      .map(r => {
        const fecha = parseDateFlexible(r[4]);

        return {
          cedula: String(r[0] || "").trim(),
          numero: normalizarTelefono(r[1]),
          nombre: String(r[2] || "").trim(),
          especialidad: String(r[3] || "").trim(),
          entidad: "",
          fecha_cita: fecha ? toISODate(fecha) : "",
          fecha_cita_str: fecha ? toDateTimeStr(fecha) : ""
        };
      })
      .filter(r => r.numero && r.fecha_cita);
  }

  const columns = Object.keys(rows[0] || {});
  const colCedula = findColumn(columns, ["documento", "cedula", "identificacion", "id"]);
  const colNumero = findColumn(columns, ["telefono", "celular", "numero", "movil", "phone"]);
  const colNombre = findColumn(columns, ["nombre", "paciente", "usuario"]);
  const colEspecialidad = findColumn(columns, ["especialidad", "servicio", "procedimiento"]);
  const colEntidad = findColumn(columns, ["entidad", "eps", "aseguradora"]);
  const colFecha = findColumn(columns, ["fechacita", "fecha cita", "fecha"]);
  const colHora = findColumn(columns, ["hora"]);

  return rows
    .map(r => {
      const fechaRaw = colFecha ? r[colFecha] : "";
      const horaRaw = colHora ? r[colHora] : "";
      const fechaHoraTexto = `${fechaRaw || ""} ${horaRaw || ""}`.trim();

      let fecha = parseDateFlexible(fechaHoraTexto);
      if (!fecha) fecha = parseDateFlexible(fechaRaw);

      return {
        cedula: String(colCedula ? r[colCedula] || "" : "").trim(),
        numero: normalizarTelefono(colNumero ? r[colNumero] || "" : ""),
        nombre: String(colNombre ? r[colNombre] || "" : "").trim(),
        especialidad: String(colEspecialidad ? r[colEspecialidad] || "" : "").trim(),
        entidad: String(colEntidad ? r[colEntidad] || "" : "").trim(),
        fecha_cita: fecha ? toISODate(fecha) : "",
        fecha_cita_str: fecha ? toDateTimeStr(fecha) : ""
      };
    })
    .filter(r => r.numero && r.fecha_cita);
}

function transformMessageRows(rows) {
  if (!rows.length) return [];

  const columns = Object.keys(rows[0]);

  const numeroCol = findColumn(columns, [
    "numero", "celular", "telefono", "tel", "phone", "msisdn", "destinatario", "cel"
  ]);

  const mensajeCol = findColumn(columns, [
    "mensaje", "message", "texto", "body", "contenido"
  ]);

  const fechaCol = findColumn(columns, [
    "fecha", "date", "time", "hora", "timestamp", "creado"
  ]);

  const dirCol = findColumn(columns, [
    "dir", "direccion", "tipo", "sentido", "entrada", "salida", "traffic"
  ]);

  const templateCol = findColumn(columns, [
    "plantilla", "template", "nombre", "template_name"
  ]);

  if (!numeroCol || !mensajeCol || !fechaCol) {
    throw new Error(
      `No encontré columnas mínimas en archivo de respuestas. numero=${numeroCol}, mensaje=${mensajeCol}, fecha=${fechaCol}`
    );
  }

  return rows
    .map(r => {
      const fecha = parseDateFlexible(r[fechaCol]);
      const mensaje = String(r[mensajeCol] || "");
      const dir = String(dirCol ? r[dirCol] || "" : "").trim();

      return {
        numero: normalizarTelefono(r[numeroCol]),
        mensaje,
        mensaje_normalizado: normalizeText(mensaje),
        fecha,
        fecha_envio: fecha ? toISODate(fecha) : "",
        fecha_cita: extraerFechaCita(mensaje),
        fecha_hora_str: fecha ? toDateTimeStr(fecha) : "",
        dir,
        template_name: String(templateCol ? r[templateCol] || "" : "").trim()
      };
    })
    .filter(r => r.fecha && r.numero);
}

function buildTemplateAssignments(mensajesPorNumero, campaignRows) {
  const assignments = new Map();

  const campaignPorNumero = new Map();
  for (const camp of campaignRows) {
    const numero = normalizarTelefono(camp.numero);
    if (!numero || !camp.fecha_cita) continue;
    if (!campaignPorNumero.has(numero)) campaignPorNumero.set(numero, []);
    campaignPorNumero.get(numero).push(camp);
  }

  for (const [numero, campañasNumero] of campaignPorNumero.entries()) {
    const mensajes = mensajesPorNumero.get(numero) || [];
    const templates = mensajes
      .filter(m => isOutgoingMessage(m) && isTemplateMessage(m) && m.fecha)
      .sort((a, b) => (a.fecha?.getTime() || 0) - (b.fecha?.getTime() || 0));

    const campañas = [...campañasNumero].sort((a, b) => {
      const cmpFecha = String(a.fecha_cita || "").localeCompare(String(b.fecha_cita || ""));
      if (cmpFecha !== 0) return cmpFecha;
      return String(a.cedula || "").localeCompare(String(b.cedula || ""));
    });

    if (!templates.length || !campañas.length) continue;

    const usadosTemplate = new Set();
    const usadosCamp = new Set();

    campañas.forEach((camp, campIdx) => {
      const templateIdx = templates.findIndex((t, idx) => {
        if (usadosTemplate.has(idx)) return false;
        return t.fecha_cita && t.fecha_cita === camp.fecha_cita;
      });

      if (templateIdx >= 0) {
        assignments.set(camp, templates[templateIdx]);
        usadosTemplate.add(templateIdx);
        usadosCamp.add(campIdx);
      }
    });

    const templatesPendientes = templates
      .map((t, idx) => ({ t, idx }))
      .filter(x => !usadosTemplate.has(x.idx));

    const campañasPendientes = campañas
      .map((camp, idx) => ({ camp, idx }))
      .filter(x => !usadosCamp.has(x.idx));

    const len = Math.min(templatesPendientes.length, campañasPendientes.length);
    for (let i = 0; i < len; i++) {
      assignments.set(campañasPendientes[i].camp, templatesPendientes[i].t);
      usadosTemplate.add(templatesPendientes[i].idx);
      usadosCamp.add(campañasPendientes[i].idx);
    }
  }

  return assignments;
}

function cruzarCampaniaConMensajes(campaignRows, messageRows) {
  const mensajesPorNumero = new Map();
  const metaIndex = buildCampaignMetaIndex(campaignMetaRows);

  for (const msg of messageRows) {
    const num = normalizarTelefono(msg.numero);
    if (!num) continue;
    if (!mensajesPorNumero.has(num)) mensajesPorNumero.set(num, []);
    mensajesPorNumero.get(num).push(msg);
  }

  for (const lista of mensajesPorNumero.values()) {
    lista.sort((a, b) => (a.fecha?.getTime() || 0) - (b.fecha?.getTime() || 0));
  }

  const templateAssignments = buildTemplateAssignments(mensajesPorNumero, campaignRows);
  const resultado = [];

  for (const camp of campaignRows) {
    if (!camp.numero || !camp.fecha_cita) continue;

    const mensajes = mensajesPorNumero.get(camp.numero) || [];
    let matchedTemplate = templateAssignments.get(camp) || null;

    if (!matchedTemplate) {
      const templatesFallback = mensajes
        .filter(m => isOutgoingMessage(m) && isTemplateMessage(m) && m.fecha)
        .sort((a, b) => (a.fecha?.getTime() || 0) - (b.fecha?.getTime() || 0));

      matchedTemplate =
        templatesFallback.find(t => !t.fecha_cita || !camp.fecha_cita || t.fecha_cita === camp.fecha_cita) ||
        templatesFallback[0] ||
        null;
    }

    if (!matchedTemplate || !matchedTemplate.fecha_envio) {
      continue;
    }

    const templatesNumero = mensajes
      .filter(m => isOutgoingMessage(m) && isTemplateMessage(m) && m.fecha)
      .sort((a, b) => (a.fecha?.getTime() || 0) - (b.fecha?.getTime() || 0));

    const idxTemplate = templatesNumero.findIndex(t => t === matchedTemplate);
    const siguienteTemplate = idxTemplate >= 0 ? templatesNumero[idxTemplate + 1] || null : null;
    const finVentana = siguienteTemplate?.fecha || null;

    const mensajesVentana = mensajes.filter(m => {
      if (!m.fecha) return false;
      const ts = m.fecha.getTime();
      const ini = matchedTemplate.fecha.getTime();
      if (ts < ini) return false;
      if (finVentana && ts >= finVentana.getTime()) return false;
      return true;
    });

    const respuestasEntrada = mensajesVentana.filter(m => isIncomingMessage(m));

    let estado_final = "SIN_RESPUESTA";
    let respuesta_valida = "";
    let fecha_ultima_respuesta = "";
    let fecha_ultima_respuesta_dt = null;
    let hubo_invalida = false;
    let ultima_invalida = "";
    let ultima_invalidaFecha = null;
    let cambio_decision = "NO";
    const historialClasificado = [];

    for (const msg of respuestasEntrada) {
      const clas = classifyMessage(msg.mensaje);
      const clasFinal = clas || "NO_VALIDA";
      historialClasificado.push(`${msg.fecha_hora_str} | ${clasFinal} | ${msg.mensaje}`);

      if (clas === "CONFIRMA") {
        if (estado_final === "NO_ASISTE") cambio_decision = "SI";
        estado_final = "CONFIRMA";
        respuesta_valida = msg.mensaje;
        fecha_ultima_respuesta_dt = msg.fecha;
        fecha_ultima_respuesta = msg.fecha_hora_str;
      } else if (clas === "NO_ASISTE") {
        if (estado_final === "CONFIRMA") cambio_decision = "SI";
        estado_final = "NO_ASISTE";
        respuesta_valida = msg.mensaje;
        fecha_ultima_respuesta_dt = msg.fecha;
        fecha_ultima_respuesta = msg.fecha_hora_str;
      } else if (clas === "YA_ATENDIDO" || clas === "TIENE_CITA_MEDYREH" || clas === "NO_HAN_PROGRAMADO") {
        if (estado_final !== "SIN_RESPUESTA" && estado_final !== clas) cambio_decision = "SI";
        estado_final = clas;
        respuesta_valida = msg.mensaje;
        fecha_ultima_respuesta_dt = msg.fecha;
        fecha_ultima_respuesta = msg.fecha_hora_str;
      } else if (msg.mensaje_normalizado) {
        hubo_invalida = true;
        ultima_invalida = msg.mensaje;
        ultima_invalidaFecha = msg.fecha;
      }
    }

    if (estado_final === "SIN_RESPUESTA" && hubo_invalida) {
      estado_final = "RESPUESTA_NO_VALIDA";
      respuesta_valida = ultima_invalida;
      fecha_ultima_respuesta_dt = ultima_invalidaFecha;
      fecha_ultima_respuesta = ultima_invalidaFecha ? toDateTimeStr(ultima_invalidaFecha) : "";
    }

    resultado.push({
      cedula: camp.cedula,
      nombre: camp.nombre,
      especialidad: camp.especialidad,
      entidad: camp.entidad || resolverEntidadCampania(camp, metaIndex),
      numero: camp.numero,
      fecha_cita: camp.fecha_cita,
      fecha_cita_str: camp.fecha_cita_str || camp.fecha_cita || "",
      fecha_envio: matchedTemplate.fecha_envio || "",
      fecha_envio_str: matchedTemplate.fecha_hora_str || matchedTemplate.fecha_envio || "",
      estado_final,
      respuesta_valida,
      fecha_ultima_respuesta,
      fecha_ultima_respuesta_dt,
      mensajes_total: mensajesVentana.length,
      mensajes_respuesta_total: respuestasEntrada.length,
      template_name: matchedTemplate.template_name || "",
      template_texto: matchedTemplate.mensaje || "",
      template_fecha_cita_detectada: matchedTemplate.fecha_cita || "",
      cambio_decision,
      historial: historialClasificado.join("\n")
    });
  }

  return resultado
    .filter(r => r.numero && r.fecha_envio && r.fecha_cita)
    .sort((a, b) => {
      const cmpNumero = String(a.numero || "").localeCompare(String(b.numero || ""));
      if (cmpNumero !== 0) return cmpNumero;
      const cmpCita = String(a.fecha_cita || "").localeCompare(String(b.fecha_cita || ""));
      if (cmpCita !== 0) return cmpCita;
      return String(a.fecha_envio || "").localeCompare(String(b.fecha_envio || ""));
    });
}

function consolidarPorCedula(rows) {
  const map = new Map();

  for (const r of rows) {
    const key = r.cedula || `SIN_CEDULA_${r.numero}`;

    if (!map.has(key)) {
      map.set(key, {
        cedula: r.cedula,
        nombre: r.nombre,
        especialidad: r.especialidad,
        entidad: r.entidad || "",
        fecha_cita: r.fecha_cita,
        numeros: new Set(),
        estado_final: "SIN_RESPUESTA",
        respuesta_valida: "",
        fecha_ultima_respuesta: ""
      });
    }

    const item = map.get(key);
    item.numeros.add(r.numero);
    if (!item.entidad && r.entidad) item.entidad = r.entidad;

    const prioridad = {
      CONFIRMA: 4,
      NO_ASISTE: 3,
      YA_ATENDIDO: 3,
      TIENE_CITA_MEDYREH: 3,
      NO_HAN_PROGRAMADO: 3,
      RESPUESTA_NO_VALIDA: 2,
      SIN_RESPUESTA: 1
    };

    if (prioridad[r.estado_final] > prioridad[item.estado_final]) {
      item.estado_final = r.estado_final;
      item.respuesta_valida = r.respuesta_valida;
      item.fecha_ultima_respuesta = r.fecha_ultima_respuesta;
    }
  }

  return Array.from(map.values()).map(x => ({
    cedula: x.cedula,
    nombre: x.nombre,
    especialidad: x.especialidad,
    entidad: x.entidad || "",
    fecha_cita: x.fecha_cita,
    numeros: Array.from(x.numeros).join(", "),
    estado_final: x.estado_final,
    respuesta_valida: x.respuesta_valida,
    fecha_ultima_respuesta: x.fecha_ultima_respuesta
  }));
}

function getFilteredRows() {
  let rows = [...groupedRows];

  const fEnvio = fechaEnvioFiltro ? fechaEnvioFiltro.value : "";
  const fCita = fechaCitaFiltro ? fechaCitaFiltro.value : "";
  const estado = estadoFiltro ? estadoFiltro.value : "TODOS";
  const numero = normalizarTelefono(numeroFiltro ? numeroFiltro.value : "");
  const cedula = normalizeText(cedulaFiltro ? cedulaFiltro.value : "");
  const nombre = normalizeText(nombreFiltro ? nombreFiltro.value : "");

  if (fEnvio) rows = rows.filter(r => r.fecha_envio === fEnvio);
  if (fCita) rows = rows.filter(r => r.fecha_cita === fCita);
  if (estado && estado !== "TODOS") rows = rows.filter(r => r.estado_final === estado);
  if (numero) rows = rows.filter(r => String(r.numero || "").includes(numero));
  if (cedula) rows = rows.filter(r => normalizeText(r.cedula).includes(cedula));
  if (nombre) rows = rows.filter(r => normalizeText(r.nombre).includes(nombre));

  return rows;
}

function getFilteredConsolidatedRows() {
  const filteredMain = getFilteredRows();
  return consolidarPorCedula(filteredMain);
}

function renderDashboard() {
  if (!dashboard || !kpis) return;

  const filtered = getFilteredRows();
  const resumen = buildResumen(filtered);

  kpis.style.display = "grid";
  dashboard.style.display = "block";

  const kpiTotal = document.getElementById("kpiTotal");
  const kpiConfirma = document.getElementById("kpiConfirma");
  const kpiNoAsiste = document.getElementById("kpiNoAsiste");
  const kpiNoValida = document.getElementById("kpiNoValida");
  const kpiSinRespuesta = document.getElementById("kpiSinRespuesta");
  const kpiTasaRespuesta = document.getElementById("kpiTasaRespuesta");
  const kpiTasaConfirma = document.getElementById("kpiTasaConfirma");
  const kpiTasaNoAsiste = document.getElementById("kpiTasaNoAsiste");

  if (kpiTotal) kpiTotal.textContent = resumen.total;
  if (kpiConfirma) kpiConfirma.textContent = resumen.confirma;
  if (kpiNoAsiste) kpiNoAsiste.textContent = resumen.no_asiste;
  if (kpiNoValida) kpiNoValida.textContent = resumen.no_valida;
  if (kpiSinRespuesta) kpiSinRespuesta.textContent = resumen.sin_respuesta;
  if (kpiTasaRespuesta) kpiTasaRespuesta.textContent = resumen.tasa_respuesta + "%";
  if (kpiTasaConfirma) kpiTasaConfirma.textContent = resumen.tasa_confirma + "%";
  if (kpiTasaNoAsiste) kpiTasaNoAsiste.textContent = resumen.tasa_noasiste + "%";

  const kpiYaAtendido = document.getElementById("kpiYaAtendido");
  const kpiTieneCitaMedyreh = document.getElementById("kpiTieneCitaMedyreh");
  const kpiNoHanProgramado = document.getElementById("kpiNoHanProgramado");
  if (kpiYaAtendido) kpiYaAtendido.textContent = resumen.ya_atendido;
  if (kpiTieneCitaMedyreh) kpiTieneCitaMedyreh.textContent = resumen.tiene_cita_medyreh;
  if (kpiNoHanProgramado) kpiNoHanProgramado.textContent = resumen.no_han_programado;

  if (vistaActual) {
    vistaActual.textContent =
      `Vista actual: ${estadoFiltro ? estadoFiltro.value : "TODOS"}` +
      ((numeroFiltro && numeroFiltro.value) ? ` | Número: ${numeroFiltro.value}` : "") +
      ((cedulaFiltro && cedulaFiltro.value) ? ` | Cédula: ${cedulaFiltro.value}` : "") +
      ((nombreFiltro && nombreFiltro.value) ? ` | Nombre: ${nombreFiltro.value}` : "") +
      ((fechaEnvioFiltro && fechaEnvioFiltro.value) ? ` | Envío: ${fechaEnvioFiltro.value}` : "") +
      ((fechaCitaFiltro && fechaCitaFiltro.value) ? ` | Cita: ${fechaCitaFiltro.value}` : "");
  }

  renderMainTable("tablaPrincipalWrap", filtered);
  renderCedulaTable("tablaCedula", getFilteredConsolidatedRows());
  renderMainTable("tablaConfirma", filtered.filter(r => r.estado_final === "CONFIRMA"));
  renderMainTable("tablaNoAsiste", filtered.filter(r => r.estado_final === "NO_ASISTE"));
  renderMainTable("tablaNoValida", filtered.filter(r => r.estado_final === "RESPUESTA_NO_VALIDA"));
  renderMainTable("tablaSinRespuesta", filtered.filter(r => r.estado_final === "SIN_RESPUESTA"));
  renderMainTable("tablaYaAtendido", filtered.filter(r => r.estado_final === "YA_ATENDIDO"));
  renderMainTable("tablaTieneCitaMedyreh", filtered.filter(r => r.estado_final === "TIENE_CITA_MEDYREH"));
  renderMainTable("tablaNoHanProgramado", filtered.filter(r => r.estado_final === "NO_HAN_PROGRAMADO"));

  const filteredNumbers = new Set(filtered.map(x => x.numero));

  const detalle = rawMessageRows.filter(r => {
    if (!filteredNumbers.has(r.numero)) return false;
    if (fechaEnvioFiltro && fechaEnvioFiltro.value && r.fecha_envio !== fechaEnvioFiltro.value) return false;
    if (fechaCitaFiltro && fechaCitaFiltro.value && r.fecha_cita && r.fecha_cita !== fechaCitaFiltro.value) return false;
    return true;
  });

  renderDetalle(detalle);
  renderCharts(resumen, filtered);
}

function buildResumen(rows) {
  const total = rows.length;
  const confirma = rows.filter(r => r.estado_final === "CONFIRMA").length;
  const no_asiste = rows.filter(r => r.estado_final === "NO_ASISTE").length;
  const no_valida = rows.filter(r => r.estado_final === "RESPUESTA_NO_VALIDA").length;
  const sin_respuesta = rows.filter(r => r.estado_final === "SIN_RESPUESTA").length;
  const ya_atendido = rows.filter(r => r.estado_final === "YA_ATENDIDO").length;
  const tiene_cita_medyreh = rows.filter(r => r.estado_final === "TIENE_CITA_MEDYREH").length;
  const no_han_programado = rows.filter(r => r.estado_final === "NO_HAN_PROGRAMADO").length;
  const respuestas = confirma + no_asiste + no_valida + ya_atendido + tiene_cita_medyreh + no_han_programado;

  return {
    total,
    confirma,
    no_asiste,
    no_valida,
    sin_respuesta,
    ya_atendido,
    tiene_cita_medyreh,
    no_han_programado,
    tasa_respuesta: total ? ((respuestas / total) * 100).toFixed(2) : "0.00",
    tasa_confirma: total ? ((confirma / total) * 100).toFixed(2) : "0.00",
    tasa_noasiste: total ? ((no_asiste / total) * 100).toFixed(2) : "0.00"
  };
}

function estadoBadge(estado) {
  if (estado === "CONFIRMA") return `<span class="badge confirma">SÍ VIENE</span>`;
  if (estado === "NO_ASISTE") return `<span class="badge noasiste">NO VIENE</span>`;
  if (estado === "YA_ATENDIDO") return `<span class="badge ya-atendido">YA FUI ATENDIDO</span>`;
  if (estado === "YA_FUI_ATENDIDO") return `<span class="badge ya-atendido">YA FUI ATENDIDO</span>`;
  if (estado === "TIENE_CITA_MEDYREH") return `<span class="badge tiene-cita">TENGO CITA MEDYREH</span>`;
  if (estado === "NO_HAN_PROGRAMADO") return `<span class="badge no-programado">NO HAN PROGRAMADO</span>`;
  if (estado === "NO_PROGRAMADO") return `<span class="badge no-programado">NO ME HAN PROGRAMADO</span>`;
  if (estado === "RESPUESTA_NO_VALIDA") return `<span class="badge invalida">RESPUESTA NO VÁLIDA</span>`;
  return `<span class="badge sinresp">SIN RESPUESTA</span>`;
}

function renderMainTable(targetId, rows) {
  const target = document.getElementById(targetId);
  if (!target) return;

  if (!rows.length) {
    target.innerHTML = `<table><tr><td>Sin datos para mostrar.</td></tr></table>`;
    return;
  }

  const html = `
    <table>
      <thead>
        <tr>
          <th>cedula</th>
          <th>nombre</th>
          <th>especialidad</th>
          <th>entidad</th>
          <th>numero</th>
          <th>fecha_cita</th>
          <th>fecha_envio</th>
          <th>plantilla</th>
          <th>estado_final</th>
          <th>respuesta_valida</th>
          <th>fecha_ultima_respuesta</th>
          <th>respuestas</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(r => `
          <tr>
            <td>${escapeHtml(r.cedula || "")}</td>
            <td>${escapeHtml(r.nombre || "")}</td>
            <td>${escapeHtml(r.especialidad || "")}</td>
            <td>${escapeHtml(r.entidad || "")}</td>
            <td>${escapeHtml(r.numero || "")}</td>
            <td>${escapeHtml(r.fecha_cita_str || r.fecha_cita || "")}</td>
            <td>${escapeHtml(r.fecha_envio_str || r.fecha_envio || "")}</td>
            <td>${escapeHtml(r.template_name || "")}</td>
            <td>${estadoBadge(r.estado_final)}</td>
            <td>${escapeHtml(r.respuesta_valida || "")}</td>
            <td>${escapeHtml(r.fecha_ultima_respuesta || "")}</td>
            <td>${escapeHtml(r.mensajes_respuesta_total ?? 0)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;

  target.innerHTML = html;
}

function renderCedulaTable(targetId, rows) {
  const target = document.getElementById(targetId);
  if (!target) return;

  if (!rows.length) {
    target.innerHTML = `<table><tr><td>Sin datos para mostrar.</td></tr></table>`;
    return;
  }

  const html = `
    <table>
      <thead>
        <tr>
          <th>cedula</th>
          <th>nombre</th>
          <th>especialidad</th>
          <th>entidad</th>
          <th>fecha_cita</th>
          <th>numeros</th>
          <th>estado_final</th>
          <th>respuesta_valida</th>
          <th>fecha_ultima_respuesta</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(r => `
          <tr>
            <td>${escapeHtml(r.cedula || "")}</td>
            <td>${escapeHtml(r.nombre || "")}</td>
            <td>${escapeHtml(r.especialidad || "")}</td>
            <td>${escapeHtml(r.entidad || "")}</td>
            <td>${escapeHtml(r.fecha_cita || "")}</td>
            <td>${escapeHtml(r.numeros || "")}</td>
            <td>${estadoBadge(r.estado_final)}</td>
            <td>${escapeHtml(r.respuesta_valida || "")}</td>
            <td>${escapeHtml(r.fecha_ultima_respuesta || "")}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;

  target.innerHTML = html;
}

function renderDetalle(rows) {
  const target = document.getElementById("tablaDetalle");
  if (!target) return;

  if (!rows.length) {
    target.innerHTML = `<table><tr><td>Sin detalle para mostrar.</td></tr></table>`;
    return;
  }

  const html = `
    <table>
      <thead>
        <tr>
          <th>numero</th>
          <th>direccion</th>
          <th>plantilla</th>
          <th>mensaje</th>
          <th>fecha</th>
          <th>fecha_envio</th>
          <th>fecha_cita</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(r => `
          <tr>
            <td>${escapeHtml(r.numero)}</td>
            <td>${escapeHtml(r.dir || "")}</td>
            <td>${escapeHtml(r.template_name || "")}</td>
            <td>${escapeHtml(r.mensaje)}</td>
            <td>${escapeHtml(r.fecha_hora_str)}</td>
            <td>${escapeHtml(r.fecha_envio || "")}</td>
            <td>${escapeHtml(r.fecha_cita || "")}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;

  target.innerHTML = html;
}

function renderCharts(resumen, rows) {
  const canvasEstados = document.getElementById("chartEstados");
  const canvasHoras = document.getElementById("chartHoras");

  if (!canvasEstados || !canvasHoras || typeof Chart === "undefined") return;

  const ctxEstados = canvasEstados.getContext("2d");
  const ctxHoras = canvasHoras.getContext("2d");

  if (estadoChart) estadoChart.destroy();
  if (horasChart) horasChart.destroy();

  estadoChart = new Chart(ctxEstados, {
    type: "doughnut",
    data: {
      labels: ["Sí vienen", "No vienen", "Ya atendido", "Tiene cita MEDYREH", "No han programado", "No válida", "Sin respuesta"],
      datasets: [{
        data: [resumen.confirma, resumen.no_asiste, resumen.ya_atendido, resumen.tiene_cita_medyreh, resumen.no_han_programado, resumen.no_valida, resumen.sin_respuesta],
        backgroundColor: ["#19b56b", "#ef4444", "#3b82f6", "#8b5cf6", "#f97316", "#f59e0b", "#94a3b8"],
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "bottom" }
      }
    }
  });

  const horas = Array.from({ length: 24 }, (_, i) => i);
  const counts = new Array(24).fill(0);

  rows.forEach(r => {
    if (r.fecha_ultima_respuesta_dt instanceof Date && !isNaN(r.fecha_ultima_respuesta_dt.getTime())) {
      counts[r.fecha_ultima_respuesta_dt.getHours()]++;
    }
  });

  horasChart = new Chart(ctxHoras, {
    type: "bar",
    data: {
      labels: horas.map(h => String(h).padStart(2, "0") + ":00"),
      datasets: [{
        label: "Respuestas",
        data: counts,
        backgroundColor: "#22b3e6",
        borderRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { precision: 0 }
        }
      }
    }
  });
}

function exportarCSV() {
  const rows = getFilteredRows();

  if (!rows.length) {
    alert("No hay datos para exportar.");
    return;
  }

  const headers = [
    "cedula",
    "nombre",
    "especialidad",
    "entidad",
    "numero",
    "fecha_cita",
    "fecha_envio",
    "template_name",
    "estado_final",
    "respuesta_valida",
    "fecha_ultima_respuesta",
    "mensajes_respuesta_total"
  ];

  const exportRows = rows.map(r => ({
    cedula: r.cedula || "",
    nombre: r.nombre || "",
    especialidad: r.especialidad || "",
    entidad: r.entidad || "",
    numero: r.numero || "",
    fecha_cita: r.fecha_cita_str || r.fecha_cita || "",
    fecha_envio: r.fecha_envio_str || r.fecha_envio || "",
    template_name: r.template_name || "",
    estado_final: r.estado_final || "",
    respuesta_valida: r.respuesta_valida || "",
    fecha_ultima_respuesta: r.fecha_ultima_respuesta || "",
    mensajes_respuesta_total: r.mensajes_respuesta_total ?? 0
  }));

  const csv = [
    headers.join(","),
    ...exportRows.map(r => headers.map(h => csvEscape(r[h] ?? "")).join(","))
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "resumen_asistencia_filtrado.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function csvEscape(value) {
  const s = String(value).replace(/"/g, '""');
  return `"${s}"`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ─── MODO INDIVIDUAL MEDYREH ────────────────────────────────────────────────

let medyrehResultRows = [];
let medyrehBaseRows = [];

const medyrehFileInput = document.getElementById("medyrehFileInput");
const medyrehBaseInput = document.getElementById("medyrehBaseInput");
const btnProcesarMedyreh = document.getElementById("btnProcesarMedyreh");
const btnExportarMedyreh = document.getElementById("btnExportarMedyreh");
const medyrehEstadoFiltro = document.getElementById("medyrehEstadoFiltro");

if (btnProcesarMedyreh) btnProcesarMedyreh.addEventListener("click", procesarMedyrehIndividual);
if (btnExportarMedyreh) btnExportarMedyreh.addEventListener("click", exportarMedyrehCSV);
if (medyrehEstadoFiltro) medyrehEstadoFiltro.addEventListener("change", renderMedyreh);

document.querySelectorAll(".pill-medyreh").forEach(pill => {
  pill.addEventListener("click", e => {
    e.preventDefault();
    if (medyrehEstadoFiltro) medyrehEstadoFiltro.value = pill.dataset.estado || "TODOS";
    renderMedyreh();
  });
});

function isMedyrehTemplateMsg(msg) {
  const nombre = normalizeText(msg.template_name || "");
  const mensaje = normalizeText(msg.mensaje || "");
  if (nombre.includes("no_me_han_programado_cita") || nombre.includes("no me han programado cita")) return true;
  if (mensaje.includes("medyreh integral") && mensaje.includes("queremos confirmar con usted el estado")) return true;
  if (mensaje.includes("queremos confirmar con usted el estado actual frente dicho servicio")) return true;
  return false;
}

async function procesarMedyrehIndividual() {
  const file = medyrehFileInput ? medyrehFileInput.files[0] : null;
  if (!file) {
    alert("Selecciona el archivo de respuestas.");
    return;
  }

  try {
    const data = await readGenericFile(file, false);
    const mensajes = transformMessageRows(data);

    medyrehBaseRows = [];
    const baseFile = medyrehBaseInput ? medyrehBaseInput.files[0] : null;
    if (baseFile) {
      const baseData = await readBaseFile(baseFile);
      medyrehBaseRows = transformBaseRowsMedyreh(baseData);
    }

    medyrehResultRows = construirResultadosMedyreh(mensajes, medyrehBaseRows);

    if (!medyrehResultRows.length) {
      alert("No se encontraron registros de la plantilla 'no_me_han_programado_cita' en el archivo.");
      return;
    }

    renderMedyreh();
  } catch (e) {
    console.error(e);
    alert("Error procesando archivo: " + (e.message || e));
  }
}

function construirResultadosMedyreh(mensajes, baseRows) {
  const baseIndex = new Map();
  for (const row of (baseRows || [])) {
    const cel = normalizarTelefono(row.celular || row.numero || row.telefono || "");
    if (cel) baseIndex.set(cel, row);
  }

  const porNumero = new Map();
  for (const msg of mensajes) {
    if (!msg.numero) continue;
    if (!porNumero.has(msg.numero)) porNumero.set(msg.numero, []);
    porNumero.get(msg.numero).push(msg);
  }

  for (const lista of porNumero.values()) {
    lista.sort((a, b) => (a.fecha?.getTime() || 0) - (b.fecha?.getTime() || 0));
  }

  const resultado = [];

  for (const [numero, msgs] of porNumero.entries()) {
    const templates = msgs.filter(m => isOutgoingMessage(m) && isMedyrehTemplateMsg(m));
    if (!templates.length) continue;

    const baseData = baseIndex.get(numero) || null;
    const cedula      = baseData ? (baseData.cedula   || "") : "";
    const nombreBase  = baseData ? (baseData.nombre   || "") : "";
    const servicioBase = baseData ? (baseData.servicio || "") : "";

    for (let i = 0; i < templates.length; i++) {
      const template = templates[i];
      const finVentana = templates[i + 1]?.fecha || null;

      // Prioridad: base (Info1/Info3) → extracción del mensaje de salida
      const nombre   = nombreBase   || extraerNombreDesdeTemplate(template.mensaje);
      const servicio = servicioBase || extraerServicioDesdeTemplate(template.mensaje);

      const respuestas = msgs.filter(m => {
        if (!m.fecha || !isIncomingMessage(m)) return false;
        const ts = m.fecha.getTime();
        if (ts <= template.fecha.getTime()) return false;
        if (finVentana && ts >= finVentana.getTime()) return false;
        return true;
      });

      let estado_medyreh = "SIN_RESPUESTA";
      let respuesta_texto = "";
      let fecha_respuesta = "";
      let hubo_invalida = false;
      let ultima_invalida = "";
      let ultima_invalida_fecha = null;

      for (const resp of respuestas) {
        const clas = classifyMedyrehMessage(resp.mensaje);
        if (clas) {
          estado_medyreh = clas;
          respuesta_texto = resp.mensaje;
          fecha_respuesta = resp.fecha_hora_str;
        } else if (resp.mensaje_normalizado) {
          hubo_invalida = true;
          ultima_invalida = resp.mensaje;
          ultima_invalida_fecha = resp.fecha;
        }
      }

      if (estado_medyreh === "SIN_RESPUESTA" && hubo_invalida) {
        estado_medyreh = "RESPUESTA_NO_VALIDA";
        respuesta_texto = ultima_invalida;
        fecha_respuesta = ultima_invalida_fecha ? toDateTimeStr(ultima_invalida_fecha) : "";
      }

      resultado.push({
        cedula,
        nombre,
        numero,
        fecha_envio_str: template.fecha_hora_str || template.fecha_envio || "",
        fecha_envio: template.fecha_envio || "",
        template_name: template.template_name || "",
        servicio,
        estado_medyreh,
        respuesta: respuesta_texto,
        fecha_respuesta
      });
    }
  }

  return resultado.sort((a, b) =>
    String(a.fecha_envio_str).localeCompare(String(b.fecha_envio_str))
  );
}

function getMedyrehFiltradas() {
  const estado = medyrehEstadoFiltro ? medyrehEstadoFiltro.value : "TODOS";
  if (!estado || estado === "TODOS") return medyrehResultRows;
  return medyrehResultRows.filter(r => r.estado_medyreh === estado);
}

function renderMedyreh() {
  const dashboard = document.getElementById("medyrehDashboard");
  if (dashboard) dashboard.style.display = "block";

  const total = medyrehResultRows.length;
  const ya_atendido = medyrehResultRows.filter(r => r.estado_medyreh === "YA_FUI_ATENDIDO").length;
  const tiene_cita = medyrehResultRows.filter(r => r.estado_medyreh === "TIENE_CITA_MEDYREH").length;
  const no_programado = medyrehResultRows.filter(r => r.estado_medyreh === "NO_PROGRAMADO").length;
  const sin_resp = medyrehResultRows.filter(r => r.estado_medyreh === "SIN_RESPUESTA").length;
  const no_valida = medyrehResultRows.filter(r => r.estado_medyreh === "RESPUESTA_NO_VALIDA").length;

  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set("kpiM_total", total);
  set("kpiM_ya", ya_atendido);
  set("kpiM_cita", tiene_cita);
  set("kpiM_noprog", no_programado);
  set("kpiM_sinresp", sin_resp);
  set("kpiM_novalida", no_valida);

  const vActual = document.getElementById("medyrehVistaActual");
  if (vActual) {
    const estado = medyrehEstadoFiltro ? medyrehEstadoFiltro.value : "TODOS";
    vActual.textContent = `Vista actual: ${estado}`;
  }

  const rows = getMedyrehFiltradas();
  const tabla = document.getElementById("tablaMedyreh");
  if (!tabla) return;

  if (!rows.length) {
    tabla.innerHTML = `<table><tr><td>Sin datos para el filtro seleccionado.</td></tr></table>`;
    return;
  }

  tabla.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>cedula</th>
          <th>nombre</th>
          <th>celular</th>
          <th>servicio</th>
          <th>fecha_envio</th>
          <th>plantilla</th>
          <th>estado</th>
          <th>respuesta</th>
          <th>fecha_respuesta</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(r => `
          <tr>
            <td>${escapeHtml(r.cedula || "")}</td>
            <td>${escapeHtml(r.nombre || "")}</td>
            <td>${escapeHtml(r.numero)}</td>
            <td>${escapeHtml(r.servicio || "")}</td>
            <td>${escapeHtml(r.fecha_envio_str)}</td>
            <td>${escapeHtml(r.template_name)}</td>
            <td>${estadoBadge(r.estado_medyreh)}</td>
            <td>${escapeHtml(r.respuesta)}</td>
            <td>${escapeHtml(r.fecha_respuesta)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function exportarMedyrehCSV() {
  const rows = getMedyrehFiltradas();
  if (!rows.length) {
    alert("No hay datos para exportar.");
    return;
  }

  // Orden requerido: cedula, nombre, celular, servicio, plantilla, estado,
  //                  respuesta, fecha_envio, fecha_respuesta
  const headers = [
    "cedula", "nombre", "celular", "servicio",
    "plantilla", "estado", "respuesta",
    "fecha_envio", "fecha_respuesta"
  ];
  const csv = [
    headers.join(","),
    ...rows.map(r => [
      csvEscape(r.cedula               || ""),
      csvEscape(r.nombre               || ""),
      csvEscape(r.numero               || ""),
      csvEscape(r.servicio             || ""),
      csvEscape(r.template_name        || ""),
      csvEscape(r.estado_medyreh       || ""),
      csvEscape(r.respuesta            || ""),
      csvEscape(r.fecha_envio_str || r.fecha_envio || ""),
      csvEscape(r.fecha_respuesta      || "")
    ].join(","))
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "medyreh_individual.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}