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

  return null;
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
  const respuestas = confirma + no_asiste + no_valida;

  return {
    total,
    confirma,
    no_asiste,
    no_valida,
    sin_respuesta,
    tasa_respuesta: total ? ((respuestas / total) * 100).toFixed(2) : "0.00",
    tasa_confirma: total ? ((confirma / total) * 100).toFixed(2) : "0.00",
    tasa_noasiste: total ? ((no_asiste / total) * 100).toFixed(2) : "0.00"
  };
}

function estadoBadge(estado) {
  if (estado === "CONFIRMA") return `<span class="badge confirma">SÍ VIENE</span>`;
  if (estado === "NO_ASISTE") return `<span class="badge noasiste">NO VIENE</span>`;
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
      labels: ["Sí vienen", "No vienen", "No válida", "Sin respuesta"],
      datasets: [{
        data: [resumen.confirma, resumen.no_asiste, resumen.no_valida, resumen.sin_respuesta],
        backgroundColor: ["#19b56b", "#ef4444", "#f59e0b", "#94a3b8"],
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