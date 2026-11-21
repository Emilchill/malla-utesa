// utesa-import.js
// Sincroniza tu PROGRESO (materias aprobadas) con el portal estudiantil de UTESA
// (https://www.utesa.edu/home/index.php → Acceso → Estudiantes) SIN pedir tu contraseña
// y sin guardar notas. Solo funciona con el portal de UTESA (no con Nube).
//
// Por qué así: el sistema estudiantil (www.utesa.edu/webestudi) usa sesiones ASP.NET con
// cookies HttpOnly y no permite CORS, así que ninguna app externa puede leer tus datos
// directamente, y tu contraseña institucional no debe pasar por terceros. Entonces:
//   1) Inicias sesión TÚ MISMO en utesa.edu.
//   2) Tocas el marcador "Enviar a Malla UTESA" estando en el panel estudiantil
//      (o copias y pegas la página "Asignaturas pendientes").
//   3) Aprobadas = tu pensum − tus pendientes. Tú revisas y confirmas.
//
// Formato real del portal (verificado nov. 2026):
//   - asignaturas-pendientes.aspx: una tabla por cuatrimestre con columnas
//     "# | Cód. Asig. | Nombre | CR | HT | HP | Pre/Co-requisitos". Incluye lo que cursas
//     ahora. Las electivas vienen como "CON118" (sin guion).
//   - resumen.aspx: contadores (aprobadas / inscritas / pendientes) para verificar.
//   - pagina-pensum.aspx: el pensum completo SIN estado (no sirve para el avance).
//   - La carrera aparece en #txtNombrecar y la versión del pensum en #txtPensum.

import { openModal as openDialog, closeModal as closeDialog } from "./modal.js";
import { auth } from "./firebase-config.js";

const PORTAL_URL = "https://www.utesa.edu/home/index.php";
const HASH_KEY = "utesa=";
const META_PREFIX = "@@MALLA ";
const STD_CODE = /^[A-Z]{2,4}-\d{3}$/;

const LOGIN_ENDPOINT = "/api/utesa-login";
const RECINTO_KEY = "malla_recinto";

let ctx = null;
let lastCounts = null;
let lastPending = null;      // lista de pendientes del último análisis
let lastFromBookmark = false; // ¿vino del marcador? (el inicio directo ya lo verifica el servidor)

/* ---------- Utilidades ---------- */
function norm(str) {
  return String(str)
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
/** "IID-420-002" → "IID-420", "CON118" → "CON-118", "mat 170" → "MAT-170" */
export function normCode(raw) {
  const m = String(raw).toUpperCase().match(/([A-Z]{2,4})\s?[-–]?\s?(\d{3})/);
  return m ? `${m[1]}-${m[2]}` : null;
}
function cuatSubjects(pensum) {
  return pensum.cuatrimestres.flatMap(c => c.materias).filter(m => m.c !== "ELECTIVA");
}
function allSubjects(pensum) {
  return [...cuatSubjects(pensum), ...pensum.electivas];
}
function intOrNull(v) {
  const n = parseInt(String(v ?? ""), 10);
  return isNaN(n) ? null : n;
}

/* ---------- Lectura del texto recibido ---------- */
function parsePayload(text) {
  const lines = String(text).split(/\r?\n/);
  if (lines[0] && lines[0].startsWith(META_PREFIX)) {
    const meta = {};
    lines[0].slice(META_PREFIX.length).split("|").forEach(kv => {
      const i = kv.indexOf("=");
      if (i > 0) meta[kv.slice(0, i).trim()] = kv.slice(i + 1).trim();
    });
    return { meta, rows: lines.slice(1).filter(Boolean).map(l => l.split("\t")) };
  }
  // Texto pegado a mano: ¿parece la página de pendientes o la de pensum?
  const up = String(text).toUpperCase();
  let modo = "generico";
  if (/ASIGNATURAS PENDIENTES|\bPENDIENTES\b/.test(up) && /C[ÓO]D\. ASIG/.test(up)) modo = "pendientes";
  else if (/\bPENSUM\b/.test(up) && /PRE\/CO-REQUISITOS/.test(up) && !/PENDIENTES/.test(up)) modo = "pensum";
  if (modo !== "pendientes") return { meta: { MODO: modo }, rows: [] };
  // En tablas copiadas, la clave está en las primeras columnas de cada fila
  const rows = [];
  lines.forEach(l => {
    const cells = l.split("\t").map(c => c.trim());
    const idx = cells.findIndex((c, i) => i <= 2 && /^[A-Z]{2,4}-?\d{3}(-\d{3})?$/i.test(c));
    if (idx !== -1) rows.push(["P", cells[idx]]);
  });
  return { meta: { MODO: "sync" }, rows };
}

/**
 * Analiza lo recibido contra el pensum de la app.
 * Devuelve { modo, found: [{m, reason, doubtful}], foreign, counts?, error?, note?, careerWarn? }
 */
export function analyzePayload(text, pensum) {
  const { meta, rows } = parsePayload(text);
  const modo = String(meta.MODO || "generico").toLowerCase();
  const byCode = new Map(allSubjects(pensum).map(m => [m.c, m]));
  const foreign = new Set();
  const found = new Map();

  // ¿Coincide la carrera?
  let careerWarn = null;
  if (meta.CARRERA) {
    const a = norm(meta.CARRERA), b = norm(pensum.nombre);
    if (a && !b.includes(a) && !a.includes(b)) careerWarn = meta.CARRERA;
  }

  if (modo === "pensum") {
    return { modo, found: [], foreign: [], error: "Esa es la página <em>Pensum</em>: muestra todas las materias de la carrera, no las que aprobaste. Abre <strong>Asignaturas pendientes</strong> y vuelve a intentarlo." };
  }

  // "sync" lo envía el marcador; "pendientes" es la página pegada a mano (versiones anteriores del marcador)
  if (modo === "sync" || modo === "completo" || modo === "pendientes") {
    const pending = new Set();
    rows.forEach(r => {
      const code = r.length > 1 && r[0] === "P" ? r[1] : (r[0] === "C" ? null : r[0]);
      const c = code ? normCode(code) : null;
      if (c) pending.add(c);
    });
    if (!pending.size) return { modo, found: [], foreign: [], error: "No encontramos la lista de pendientes en esa página." };

    const known = [...pending].filter(c => byCode.has(c));
    [...pending].filter(c => !byCode.has(c)).forEach(c => foreign.add(c));
    if (known.length / pending.size < 0.6) {
      return { modo, found: [], foreign: [...foreign],
        error: `Tus pendientes en UTESA no coinciden con el pensum de <strong>${pensum.nombre}</strong>${meta.CARRERA ? ` (UTESA dice: ${esc(String(meta.CARRERA).slice(0, 80))})` : ""}. Cambia tu carrera en Configuración y vuelve a sincronizar.` };
    }
    // Aprobadas = materias del pensum con clave oficial que NO están pendientes
    cuatSubjects(pensum).forEach(m => {
      if (!STD_CODE.test(m.c) || pending.has(m.c)) return;
      found.set(m.c, { m, reason: "no está en pendientes", doubtful: false });
    });
    pensum.electivas.forEach(m => {
      if (pending.has(m.c)) return;
      found.set(m.c, { m, reason: "electiva cursada", doubtful: false });
    });

    const counts = {
      aprob: intOrNull(meta.APROB), insc: intOrNull(meta.INSC), pend: intOrNull(meta.PEND),
      pensumVer: meta.PENSUM || "", carrera: meta.CARRERA || "",
    };
    let note = `Calculado como: tu pensum − ${pending.size} materias pendientes en UTESA (las que cursas ahora cuentan como pendientes).`;
    if (counts.aprob != null && counts.aprob !== found.size) {
      note += ` <span class="imp-warn">UTESA reporta ${counts.aprob} aprobadas y aquí se detectaron ${found.size}: revisa la lista.</span>`;
    }
    return { modo, found: [...found.values()], foreign: [...foreign], careerWarn, note, counts, pending: [...pending] };
  }

  return {
    modo: "otro", found: [], foreign: [],
    error: "Ese texto no parece la página <strong>Asignaturas pendientes</strong> del portal de UTESA. Ábrela (Acceso → Estudiantes → Asignaturas pendientes), selecciona todo con Ctrl + A, copia con Ctrl + C y pégalo aquí.",
  };
}

/* ---------- Marcador (bookmarklet) ---------- */
// Se escribe como función normal y se serializa (evita problemas de escapes).
// En el portal estudiantil (www.utesa.edu/webestudi/) trae el progreso con UN clic leyendo
// dos páginas internas con la sesión que el estudiante ya abrió:
//   asignaturas-pendientes.aspx → avance (pensum − pendientes)
//   resumen.aspx                → contadores de aprobadas / inscritas / pendientes (verificación)
function bookmarkletBody(appUrl, hashKey, metaPrefix) {
  if (!/(^|\.)utesa\.edu$/.test(location.hostname)) {
    alert("Usa este marcador estando dentro del portal de UTESA (Acceso → Estudiantes).");
    return;
  }
  function send(meta, lines) {
    var url = appUrl + "#" + hashKey + encodeURIComponent(meta + "\n" + lines.join("\n")).slice(0, 60000);
    var w = window.open(url, "_blank");
    if (!w) location.href = url; // si el navegador bloquea la ventana nueva
  }
  if (/\/webestudi\//i.test(location.pathname)) {
    var base = location.pathname.replace(/[^/]*$/, "");
    var get = function (p) {
      return fetch(base + p, { credentials: "include" }).then(function (r) { return r.text(); })
        .then(function (t) { return { t: t, d: new DOMParser().parseFromString(t, "text/html") }; });
    };
    Promise.all([get("asignaturas-pendientes.aspx"), get("resumen.aspx")]).then(function (res) {
      var pen = res[0], resu = res[1];
      var lines = [];
      pen.d.querySelectorAll("table").forEach(function (t) {
        var head = t.rows[0]; if (!head) return;
        var cells = [].slice.call(head.cells).map(function (c) { return (c.textContent || "").replace(/\s+/g, " ").trim(); });
        var ci = cells.findIndex(function (c) { return /c[óo]d/i.test(c); });
        if (ci === -1) return;
        [].slice.call(t.rows, 1).forEach(function (r) {
          var code = (r.cells[ci] && r.cells[ci].textContent || "").trim();
          if (/[A-Za-z]{2,4}-?\d{3}/.test(code)) lines.push("P\t" + code);
        });
      });
      if (!lines.length) { alert("No se pudo leer tu lista de pendientes. ¿Tu sesión de UTESA sigue abierta?"); return; }
      var v = function (d, id) { var e = d.getElementById(id); return e ? String(e.value || "").trim() : ""; };
      var meta = metaPrefix + "MODO=sync" +
        "|CARRERA=" + v(pen.d, "txtNombrecar") + "|PENSUM=" + v(pen.d, "txtPensum") +
        "|APROB=" + v(resu.d, "txtCanAprob") + "|INSC=" + v(resu.d, "txtCanInscri") + "|PEND=" + v(resu.d, "txtCanPens");
      send(meta, lines);
    }).catch(function () { alert("No se pudo leer el portal. Recarga la página de UTESA e inténtalo de nuevo."); });
    return;
  }
  alert("Abre el panel estudiantil de UTESA (utesa.edu → Acceso → Estudiantes) y toca el marcador desde ahí.");
}

function buildBookmarklet() {
  const appUrl = location.origin + location.pathname.replace(/[^/]*$/, "") + "dashboard.html" + location.search;
  const src = `(${bookmarkletBody.toString()})(${JSON.stringify(appUrl)},${JSON.stringify(HASH_KEY)},${JSON.stringify(META_PREFIX)});`;
  return "javascript:" + encodeURIComponent(src);
}

/* ---------- UI ---------- */
function $(id) { return document.getElementById(id); }

function openModal() {
  showStep("intro");
  updateLastSync();
  openDialog("utesa-overlay");
}
function closeModal() {
  closeDialog("utesa-overlay");
}
function showStep(step) {
  document.querySelectorAll("#utesa-overlay [data-step]").forEach(el => {
    el.classList.toggle("hidden", el.dataset.step !== step);
  });
}
function updateLastSync() {
  const el = $("utesa-last");
  if (!el) return;
  const last = ctx.getLastSync();
  el.textContent = last
    ? `Última sincronización: ${new Date(last.at).toLocaleString("es-DO", { dateStyle: "medium", timeStyle: "short" })}`
    : "Aún no has sincronizado tu progreso con UTESA.";
}
function esc(s) {
  return String(s).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

function analyze(text) {
  const pensum = ctx.getPensum();
  const done = ctx.getDoneSet();
  const res = analyzePayload(text, pensum);
  const list = $("utesa-results");
  const summary = $("utesa-summary");
  list.innerHTML = "";
  lastCounts = res.counts || null;
  lastPending = res.pending || null;

  if (res.error || !res.found.length) {
    summary.innerHTML = res.error
      ? `<strong>No se pudo importar.</strong> ${res.error}`
      : `<strong>No encontramos materias de tu pensum en ese texto.</strong>
         En el portal de UTESA abre <em>Asignaturas pendientes</em> y copia toda la página (Ctrl + A, Ctrl + C).`;
    $("utesa-apply").disabled = true;
    showStep("review");
    return;
  }

  const nuevos = res.found.filter(f => !done.has(f.m.c));
  const ya = res.found.filter(f => done.has(f.m.c));
  const careerWarn = res.careerWarn
    ? `<br><span class="imp-warn">Ojo: UTESA indica la carrera “${esc(res.careerWarn)}”, pero en la app tienes ${esc(pensum.nombre)}.</span>` : "";
  summary.innerHTML = `Encontramos <strong>${res.found.length}</strong> materia${res.found.length === 1 ? "" : "s"} aprobada${res.found.length === 1 ? "" : "s"} o por revisar
    (${nuevos.length} nueva${nuevos.length === 1 ? "" : "s"}, ${ya.length} ya marcada${ya.length === 1 ? "" : "s"}).
    ${res.note ? `<br><span class="muted">${res.note}</span>` : ""}
    <br><span class="muted">Revisa la lista antes de confirmar. Las que parecen reprobadas o en curso vienen desmarcadas.</span>${careerWarn}`;

  const ordered = [...nuevos, ...ya];
  list.innerHTML = ordered.map(f => {
    const isDone = done.has(f.m.c);
    const doubt = !isDone && f.doubtful;
    return `<label class="imp-row${isDone ? " imp-done" : ""}${doubt ? " imp-doubt" : ""}">
      <input type="checkbox" value="${f.m.c}" ${isDone ? "checked disabled" : doubt ? "" : "checked"}>
      <span class="mono imp-code">${f.m.c}</span>
      <span class="imp-name">${esc(f.m.n)}</span>
      <span class="imp-via">${isDone ? "ya aprobada" : esc(f.reason)}</span>
    </label>`;
  }).join("");

  if (res.foreign.length) {
    list.insertAdjacentHTML("beforeend", `<p class="imp-foreign">Claves de UTESA que no están en el pensum de la app: <span class="mono">${esc(res.foreign.slice(0, 20).join(", "))}${res.foreign.length > 20 ? "…" : ""}</span></p>`);
  }
  // Se puede confirmar aunque no haya materias nuevas: así se guarda la fecha y los contadores de UTESA
  $("utesa-apply").disabled = false;
  $("utesa-apply").textContent = nuevos.length ? "Marcar como aprobadas" : "Guardar sincronización";
  showStep("review");
}

/* ---------- Inicio de sesión directo (matrícula + contraseña → servidor → lista de pendientes) ---------- */
function initQuickLogin() {
  const form = $("utesa-login-form");
  if (!form) return;
  const rec = $("ul-recinto"), mat = $("ul-matricula"), pass = $("ul-pass"), consent = $("ul-consent");
  const err = $("ul-error"), btn = $("ul-submit"), eye = $("ul-eye");
  const showErr = (m) => { err.textContent = m || ""; err.classList.toggle("show", !!m); };
  try { const saved = localStorage.getItem(RECINTO_KEY); if (saved) rec.value = saved; } catch {}

  eye.addEventListener("click", () => {
    const show = pass.type === "password";
    pass.type = show ? "text" : "password";
    eye.textContent = show ? "Ocultar" : "Mostrar";
    eye.setAttribute("aria-pressed", String(show));
    eye.setAttribute("aria-label", show ? "Ocultar contraseña" : "Mostrar contraseña");
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    showErr("");
    const recinto = rec.value;
    const matricula = mat.value.trim();
    if (!recinto) return showErr("Elige tu recinto.");
    if (matricula.replace(/\D/g, "").length < 5) return showErr("Escribe tu matrícula (con o sin guiones).");
    if (!pass.value) return showErr("Escribe tu contraseña de UTESA.");
    if (!consent.checked) return showErr("Marca la casilla para confirmar que entiendes cómo se usan tus datos.");

    const body = JSON.stringify({ matricula, recinto, password: pass.value });
    pass.value = ""; // el campo se vacía en cuanto se envía: la contraseña no se queda en la pantalla
    pass.type = "password"; eye.textContent = "Mostrar";
    const label = btn.textContent;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner" style="border-top-color:#fff;"></span> Conectando con UTESA…';
    try { localStorage.setItem(RECINTO_KEY, recinto); } catch {}

    try {
      // El ID token de Firebase permite al servidor asociar la verificación (y los logros) a esta cuenta
      let token = "";
      try { token = await auth.currentUser.getIdToken(); } catch { /* sin sesión: se vincula igual, sin logros */ }
      const res = await fetch(LOGIN_ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body, credentials: "omit", cache: "no-store" });
      let data = null;
      try { data = await res.json(); } catch {}
      if (!data || !data.ok) {
        if (!data && (res.status === 404 || res.status === 405 || res.status >= 500)) {
          $("utesa-alt").open = true;
          return showErr("El inicio de sesión directo no está disponible ahora. Usa el marcador o copiar y pegar (abajo).");
        }
        return showErr((data && data.message) || "No se pudo iniciar sesión. Inténtalo de nuevo.");
      }
      if (data.verified && ctx.onVerified) ctx.onVerified(data.verified);
      const c = data.counts || {};
      const meta = `${META_PREFIX}MODO=sync|CARRERA=${data.carrera || ""}|PENSUM=${data.pensum || ""}|APROB=${c.aprob ?? ""}|INSC=${c.insc ?? ""}|PEND=${c.pend ?? ""}`;
      analyze(meta + "\n" + (data.pending || []).map(code => "P\t" + code).join("\n"));
      mat.value = "";
    } catch {
      showErr("No hay conexión con el servidor. Revisa tu internet o usa el marcador.");
    } finally {
      btn.disabled = false;
      btn.textContent = label;
    }
  });
}

/** Envía al servidor la lista que dejó el marcador para verificar la cuenta (logros, porcentaje y marcos). */
async function verifyWithBookmark(pending, counts) {
  try {
    const token = await auth.currentUser.getIdToken();
    const res = await fetch("/api/utesa-verify", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ pending, counts: counts ? { aprob: counts.aprob, insc: counts.insc, pend: counts.pend } : {} }), credentials: "omit", cache: "no-store" });
    const data = await res.json().catch(() => null);
    if (data && data.ok && data.verified && ctx.onVerified) ctx.onVerified(data.verified);
    else if (data && data.message) alert("No se pudo verificar con el marcador: " + data.message);
  } catch { /* la sincronización ya se aplicó; la verificación se puede reintentar */ }
}

export function initUtesaImport(context) {
  ctx = context;
  initQuickLogin();

  $("btn-utesa")?.addEventListener("click", openModal);
  document.addEventListener("click", (e) => { if (e.target.closest("[data-open-utesa]")) openModal(); });
  $("utesa-open-portal")?.setAttribute("href", PORTAL_URL);

  const bm = $("utesa-bookmarklet");
  if (bm) {
    bm.setAttribute("href", buildBookmarklet());
    bm.addEventListener("click", (e) => {
      e.preventDefault();
      alert("Arrastra este botón a tu barra de marcadores (en el teléfono: guárdalo como marcador). Luego úsalo dentro del panel estudiantil de UTESA.");
    });
  }

  $("utesa-analyze")?.addEventListener("click", () => analyze($("utesa-paste").value));
  $("utesa-back")?.addEventListener("click", () => showStep("intro"));
  $("utesa-apply")?.addEventListener("click", async () => {
    const codes = [...document.querySelectorAll("#utesa-results input[type=checkbox]:checked:not(:disabled)")].map(i => i.value);
    closeModal();
    $("utesa-paste").value = "";
    // con datos llegados por enlace (#utesa=), solo se verifica si la persona confirma que salieron de SU marcador
    const counts = lastCounts, pending = lastPending, viaBookmark = lastFromBookmark && !!$("utesa-verify-chk")?.checked;
    lastCounts = null; lastPending = null; lastFromBookmark = false;
    await ctx.onApply(codes, { counts });
    if (viaBookmark && pending && pending.length) verifyWithBookmark(pending, counts); // el marcador también verifica (con controles en el servidor)
  });

  // ¿Venimos desde el marcador? (#utesa=...)
  const h = location.hash || "";
  const idx = h.indexOf(HASH_KEY);
  if (idx !== -1) {
    const raw = h.slice(idx + HASH_KEY.length);
    let text = "";
    // el marcador puede cortar el texto a la mitad de un "%XX": se recorta ese pedazo
    try { text = decodeURIComponent(raw); }
    catch { try { text = decodeURIComponent(raw.replace(/%[0-9A-Fa-f]?$/, "")); } catch { text = ""; } }
    history.replaceState(null, "", location.pathname + location.search);
    if (text) {
      openModal();
      $("utesa-paste").value = text;
      lastFromBookmark = true;
      analyze(text);
      // aviso: cualquiera puede armar un enlace así; la verificación de logros queda desmarcada por defecto
      $("utesa-summary")?.insertAdjacentHTML("beforeend", `<label class="utesa-origin"><input type="checkbox" id="utesa-verify-chk"><span><b>Estos datos llegaron por un enlace.</b> Si los enviaste tú con tu marcador desde el portal de UTESA, marca esta casilla para verificar también tus logros. Si alguien te pasó este enlace, no la marques y revisa bien la lista.</span></label>`);
    }
  }
}
