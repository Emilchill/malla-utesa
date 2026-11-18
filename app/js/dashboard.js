import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { loadUser, saveUser as saveUserRemote } from "./store.js";
import { PENSUMS } from "./pensums-data.js";
import { applyTheme, getLocalTheme, setLocalTheme, buildThemePicker } from "./theme.js";
import { renderMallaGraph } from "./malla-view.js";
import { renderCharts } from "./charts-view.js";
import { avatarSvg } from "./avatars.js";
import { framedAvatar } from "./frames.js";
import { initChatDock } from "./chat-dock.js";
import { medalHtml, medalDetailHtml } from "./medal.js";
import { initUtesaImport } from "./utesa-import.js";
import { initSettings } from "./settings.js";
import { openModal, closeModal, initModals } from "./modal.js";

/* Guarda campos del usuario en D1 (vía /api/user) */
async function saveUser(fields) {
  await saveUserRemote(fields);
}

let userData = null;
let pensum = null;
let doneSet = new Set();
let activeFilter = "all";
let searchTerm = "";

/* ---------- Modo manual (solo si la cuenta NO está vinculada a UTESA) ---------- */
let selectMode = false;
let stagedFlips = new Set(); // códigos cuyo estado "aprobada" se invertirá al confirmar

const CODE_RE = /[A-Z]{2,4}-\d{3}/g;
const COREQ_RE = /CO[-.\s]?REQ\.?\s*([A-Z]{2,4}-\d{3})/gi;

/* ---------- Utilidades de prerrequisitos ---------- */
function getCoReqCodes(reqText) {
  const set = new Set();
  let match;
  const re = new RegExp(COREQ_RE);
  while ((match = re.exec(reqText)) !== null) set.add(match[1]);
  return set;
}
function getPrereqCodes(materia) {
  if (!materia.req || materia.req === "-") return [];
  const coReq = getCoReqCodes(materia.req);
  const all = materia.req.match(CODE_RE) || [];
  return [...new Set(all)].filter(code => code !== materia.c && !coReq.has(code));
}
function isUnlockedIn(materia, refSet) {
  // bloque con requisito propio (p. ej. Odontología): hay que tener aprobado todo el bloque anterior
  if (materia.bloque && !materia.bloque.codes.every(code => refSet.has(code))) return false;
  const prereqs = getPrereqCodes(materia);
  if (prereqs.length === 0) return true;
  return prereqs.every(code => refSet.has(code));
}

/* Una cuenta vinculada recibe su avance de UTESA: el modo manual solo existe sin vincular */
function isLinked() { return !!(userData && userData.utesaSync); }

function getEffectiveDoneSet() {
  if (!selectMode || stagedFlips.size === 0) return doneSet;
  const eff = new Set(doneSet);
  stagedFlips.forEach(code => { if (eff.has(code)) eff.delete(code); else eff.add(code); });
  return eff;
}

/* ---------- Toast ---------- */
let toastTimer = null;
function showToast(text) {
  const t = document.getElementById("toast");
  t.textContent = text;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
}

/* ---------- Guard de sesión ---------- */
function boot() {
  pensum = PENSUMS[userData.career] || PENSUMS.ISC;
  doneSet = new Set(userData.done || []);

  applyTheme(userData.theme || getLocalTheme());

  // Cada módulo se inicializa de forma aislada: si uno falla, no rompe los demás
  const safeInit = (fn, label) => {
    try { fn(); } catch (e) { console.error(`Error iniciando ${label}:`, e); }
  };
  safeInit(initModals, "ventanas");
  safeInit(initHeader, "header");
  safeInit(initUserMenu, "menu");
  safeInit(initThemePopover, "popover de temas");
  safeInit(initComparePopover, "popover de comparación");
  safeInit(initToolbar, "toolbar");
  safeInit(() => initSettings({
    getUser: () => userData,
    getPensum: () => pensum,
    getDoneCount: () => doneSet.size,
    getEmail: () => auth.currentUser?.email || "",
    saveUser,
    refreshHeader: initHeader,
    toast: showToast,
    signOut: () => signOut(auth),
    changeCareer,
    unlink: unlinkUtesa,
    resetProgress,
  }), "configuración");
  safeInit(initViewSwitch, "selector de vista");
  safeInit(initPrint, "impresión");
  safeInit(initDetail, "detalle de materia");
  safeInit(() => initUtesaImport({
    getPensum: () => pensum,
    getDoneSet: () => doneSet,
    getLastSync: () => userData.utesaSync || null,
    onApply: applyImportedCodes,
    onVerified: applyVerified,
  }), "importación UTESA");
  render();

  document.getElementById("loader").classList.add("hidden");
  document.getElementById("app").classList.remove("hidden");
  safeInit(trackHeaderHeight, "altura del encabezado"); // después de mostrar la app, para medir bien
  safeInit(initLinkPrompt, "ventana de vinculación");
  safeInit(() => {
    if (!userData.needsRelink) return;
    try { if (sessionStorage.getItem("malla_relink_toast")) return; sessionStorage.setItem("malla_relink_toast", "1"); } catch { /* nada */ }
    setTimeout(() => showToast("🏅 Hay logros nuevos: vuelve a vincular con UTESA una vez para actualizar tus marcos."), 1800);
  }, "aviso de logros nuevos");
  safeInit(() => {
    const dock = initChatDock({ pid: userData.pid, career: userData.career, admin: !!userData.admin, owner: !!userData.owner, name: userData.name });
    document.getElementById("btn-community")?.addEventListener("click", (e) => {
      e.preventDefault();
      const menu = document.getElementById("user-menu");
      if (menu) menu.hidden = true;
      document.getElementById("user-menu-btn")?.setAttribute("aria-expanded", "false");
      dock.open();
    });
  }, "chat de la comunidad");
  safeInit(initVideo, "video tutorial");
  render(); // segundo pintado ya con la app visible: el mapa necesita medir tamaños reales (zoom y caminos)
}

onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "index.html"; return; }
  let data;
  try { data = await loadUser(); }
  catch {
    document.body.innerHTML = '<p style="font:16px system-ui;padding:32px;text-align:center">No pudimos cargar tus datos. Revisa tu conexión y <a href="">recarga la página</a>.</p>';
    return;
  }
  if (!data) { window.location.href = "profile.html"; return; }
  userData = data;
  boot();
});

document.getElementById("btn-logout")?.addEventListener("click", () => signOut(auth));

/* ---------- Importación desde el portal de UTESA ---------- */
async function applyImportedCodes(codes, extras = {}) {
  const added = codes.filter(c => !doneSet.has(c));
  added.forEach(c => doneSet.add(c));
  const doneArr = [...doneSet];
  userData.done = doneArr;
  const c = extras.counts || {};
  const utesaSync = {
    at: new Date().toISOString(), count: added.length,
    aprob: c.aprob ?? null, insc: c.insc ?? null, pend: c.pend ?? null,
  };
  userData.utesaSync = utesaSync;
  render();
  try {
    await saveUser({ done: doneArr, utesaSync });
    showToast(added.length
      ? `${added.length} materia${added.length === 1 ? "" : "s"} sincronizada${added.length === 1 ? "" : "s"} con UTESA ✓`
      : "Sincronizado: tu progreso ya estaba al día ✓");
  } catch {
    showToast("Se aplicó en pantalla, pero no se pudo guardar. Revisa tu conexión.");
  }
}

/* El servidor verificó el avance con el inicio de sesión directo: actualiza logros y marco */
function applyVerified(v) {
  userData.earned = v.earned || [];
  userData.frame = v.frame || null;
  userData.verifiedAt = Date.now();
  userData.verifiedVia = v.via || "direct";
  userData.pct = v.pct ?? null;
  initHeader();
  if (v.mismatch) {
    showToast("Tu carrera en UTESA no coincide con la elegida aquí: no se desbloquearon logros.");
  } else if (userData.earned.length) {
    showToast(`🏅 ${userData.earned.length} logro${userData.earned.length === 1 ? "" : "s"} verificado${userData.earned.length === 1 ? "" : "s"}. Equipa tus marcos en Configuración.`);
  }
}

/* Altura del encabezado → variable CSS (para el menú pegajoso de cuatrimestres) */
function trackHeaderHeight() {
  const hdr = document.querySelector(".dash-header");
  if (!hdr) return;
  const set = () => document.documentElement.style.setProperty("--hdr-h", hdr.offsetHeight + "px");
  set();
  if ("ResizeObserver" in window) new ResizeObserver(set).observe(hdr);
  window.addEventListener("resize", set);
}

/* ---------- Header ---------- */
function initHeader() {
  const first = userData.name.split(" ")[0];
  document.getElementById("hi-name").textContent = `Hola, ${first}`;
  document.getElementById("hi-career").textContent = pensum.nombre;
  document.getElementById("um-name").textContent = userData.name;
  document.getElementById("um-career").textContent = pensum.nombre;
  const sync = document.getElementById("um-sync");
  sync.textContent = isLinked() ? "Vinculada con UTESA" : "Sin vincular";
  sync.classList.toggle("is-on", isLinked());
  const mark = document.getElementById("user-avatar");
  if (userData.avatar) {
    // personaje o foto de perfil elegida
    mark.className = "user-avatar has-avatar";
    mark.style.background = "none";
    mark.innerHTML = framedAvatar(userData.avatar, userData.avatarBg || null, userData.frame || null, 44);
    mark.classList.toggle("has-frame", !!userData.frame);
  } else {
    mark.className = "user-avatar";
    mark.textContent = pensum.key;
    mark.style.background = pensum.color;
  }

  renderCompareTable();

  const dl = document.getElementById("btn-download");
  if (pensum.pdf) {
    // pénsums sin copia local: se abre el PDF oficial en utesa.edu
    dl.href = pensum.pdf;
    dl.target = "_blank";
    dl.rel = "noopener";
    dl.removeAttribute("download");
  } else {
    dl.href = `assets/pensums/${pensum.key}.pdf`;
    dl.download = `Pensum_${pensum.key}_UTESA.pdf`;
  }
  dl.title = `Descargar pénsum de ${pensum.nombre} (PDF)`;
}

/* ---------- Menú de la cuenta (a la derecha del encabezado) ---------- */
function initUserMenu() {
  const btn = document.getElementById("user-menu-btn");
  const menu = document.getElementById("user-menu");
  const items = () => [...menu.querySelectorAll('[role="menuitem"]')];
  const closePops = () => document.querySelectorAll("#theme-pop, #compare-pop").forEach(p => p.classList.remove("show"));
  const open = (focusFirst) => {
    closePops();
    menu.hidden = false;
    btn.setAttribute("aria-expanded", "true");
    if (focusFirst) items()[0]?.focus();
  };
  const close = (returnFocus) => {
    menu.hidden = true;
    btn.setAttribute("aria-expanded", "false");
    if (returnFocus) btn.focus();
  };
  btn.addEventListener("click", (e) => { e.stopPropagation(); if (menu.hidden) open(false); else close(false); });
  btn.addEventListener("keydown", (e) => { if (e.key === "ArrowDown") { e.preventDefault(); open(true); } });
  // en captura: cada opción cierra el menú aunque su propio botón detenga la propagación
  menu.addEventListener("click", (e) => { if (e.target.closest('[role="menuitem"]')) close(false); }, true);
  menu.addEventListener("keydown", (e) => {
    const list = items();
    const i = list.indexOf(document.activeElement);
    if (e.key === "Escape") { e.preventDefault(); close(true); }
    else if (e.key === "ArrowDown") { e.preventDefault(); list[(i + 1) % list.length].focus(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); list[(i - 1 + list.length) % list.length].focus(); }
    else if (e.key === "Home") { e.preventDefault(); list[0].focus(); }
    else if (e.key === "End") { e.preventDefault(); list[list.length - 1].focus(); }
    else if (e.key === "Tab") close(false);
  });
  document.addEventListener("click", (e) => {
    if (!menu.hidden && !menu.contains(e.target) && !btn.contains(e.target)) close(false);
  });
}

/* ---------- Popover de temas ---------- */
function initThemePopover() {
  const btn = document.getElementById("btn-theme");
  const pop = document.getElementById("theme-pop");
  const container = document.getElementById("theme-picker-container");

  buildThemePicker(container, async (themeId) => {
    setLocalTheme(themeId);
    try {
      await saveUser({ theme: themeId });
      showToast("Tema guardado ✓");
    } catch {
      showToast("No se pudo guardar el tema, pero se aplicó localmente.");
    }
  });

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const willShow = !pop.classList.contains("show");
    document.getElementById("compare-pop")?.classList.remove("show");
    pop.classList.toggle("show", willShow);
    btn.setAttribute("aria-expanded", String(willShow));
  });
  document.addEventListener("click", (e) => {
    if (!pop.contains(e.target) && e.target !== btn) pop.classList.remove("show");
  });
}

/* ---------- Popover de comparación de carreras ---------- */
function careerStats(p) {
  const materiasReales = p.cuatrimestres.flatMap(c => c.materias).filter(m => m.c !== "ELECTIVA");
  return {
    materias: materiasReales.length,
    creditos: p.totalCreditos,
    cuatrimestres: p.cuatrimestres.length,
  };
}

/* La tabla se vuelve a dibujar al cambiar de carrera para marcar cuál es la tuya ("tú") */
function renderCompareTable() {
  const container = document.getElementById("compare-table-container");
  if (!container || !pensum) return;
  const rows = Object.values(PENSUMS).map(p => ({ p, stats: careerStats(p) }));

  container.innerHTML = `
    <table class="compare-table">
      <thead>
        <tr><th>Carrera</th><th>Créditos</th><th>Materias</th><th>Cuatrim.</th></tr>
      </thead>
      <tbody>
        ${rows.map(({ p, stats }) => `
          <tr class="${p.key === pensum.key ? "compare-current" : ""}">
            <td>
              <span class="compare-dot" style="background:${p.color}"></span>
              <span class="compare-name">${p.key}</span>
              ${p.key === pensum.key ? '<span class="compare-tag">tú</span>' : ""}
            </td>
            <td>${stats.creditos}</td>
            <td>${stats.materias}</td>
            <td>${stats.cuatrimestres}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
    <div class="compare-titles">
      ${rows.map(({ p }) => `<div><strong>${p.key}</strong> — ${p.nombre}</div>`).join("")}
    </div>
  `;
}

function initComparePopover() {
  const btn = document.getElementById("btn-compare");
  const pop = document.getElementById("compare-pop");
  renderCompareTable();

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const willShow = !pop.classList.contains("show");
    document.getElementById("theme-pop")?.classList.remove("show");
    pop.classList.toggle("show", willShow);
    btn.setAttribute("aria-expanded", String(willShow));
  });
  document.addEventListener("click", (e) => {
    if (!pop.contains(e.target) && e.target !== btn) pop.classList.remove("show");
  });
}

/* ---------- Acciones sobre la cuenta (las usa la ventana de Configuración) ---------- */
async function changeCareer(key) {
  await saveUser({ career: key, done: [], utesaSync: null });
  userData.career = key;
  userData.done = [];
  userData.utesaSync = null;
  userData.earned = []; userData.frame = null; userData.verifiedAt = null; // los logros se verifican de nuevo con la carrera nueva
  initChatDock({ pid: userData.pid, career: key, admin: !!userData.admin, owner: !!userData.owner, name: userData.name }); // la sala "Mi carrera" cambia
  pensum = PENSUMS[key];
  doneSet = new Set();
  stagedFlips.clear();
  selectMode = false;
  initHeader();
  render();
  showToast(`Carrera cambiada a ${pensum.nombre}. Progreso reiniciado.`);
}

/** Desvincular la cuenta de UTESA: se conserva el avance y vuelve el modo manual. */
async function unlinkUtesa() {
  await saveUser({ utesaSync: null });
  userData.utesaSync = null;
  render();
  showToast("Cuenta desvinculada. Ahora puedes marcar tus materias a mano.");
}

async function resetProgress() {
  await saveUser({ done: [] });
  userData.done = [];
  doneSet = new Set();
  stagedFlips.clear();
  selectMode = false;
  render();
  showToast("Tu progreso se reinició.");
}

/* ----- Modo manual ----- */
function toggleSelectMode() {
  if (isLinked()) return;
  if (selectMode) {
    const hadPending = stagedFlips.size > 0;
    stagedFlips.clear();
    selectMode = false;
    render();
    if (hadPending) showToast("Selección cancelada, no se guardó nada.");
  } else {
    selectMode = true;
    stagedFlips.clear();
    render();
    showToast("Modo manual activado: toca las materias que quieras marcar o desmarcar.");
  }
}

function cancelSelectMode() {
  stagedFlips.clear();
  selectMode = false;
  render();
}

function renderManualUI() {
  const banner = document.getElementById("select-mode-banner");
  const bar = document.getElementById("batch-bar");
  if (!banner) return;
  if (isLinked()) {
    // cuenta vinculada: el avance viene de UTESA, no hay marcado manual
    selectMode = false;
    stagedFlips.clear();
    banner.classList.add("hidden");
    bar?.classList.add("hidden");
    return;
  }
  banner.classList.remove("hidden");
  banner.classList.toggle("active", selectMode);
  document.getElementById("select-mode-title").textContent = selectMode ? "Modo manual activado" : "Modo manual";
  document.getElementById("select-mode-desc").textContent = selectMode
    ? "Toca las materias para marcarlas o desmarcarlas y luego confirma abajo."
    : "Tu cuenta no está vinculada con UTESA. Puedes marcar tus materias a mano o vincular para que se llenen solas.";
  const btn = document.getElementById("btn-select-mode");
  btn.textContent = selectMode ? "Salir del modo manual" : "Activar modo manual";
  btn.className = selectMode ? "btn btn-ghost" : "btn btn-primary";
  if (!bar) return;
  const n = stagedFlips.size;
  bar.classList.toggle("hidden", !selectMode);
  document.getElementById("batch-count").textContent =
    n === 0 ? "Toca las materias que quieras marcar o desmarcar" : `${n} materia${n === 1 ? "" : "s"} seleccionada${n === 1 ? "" : "s"}`;
}

function toggleStaged(materia) {
  const effSet = getEffectiveDoneSet();
  const currentlyDoneEff = effSet.has(materia.c);
  if (!currentlyDoneEff && !isUnlockedIn(materia, effSet)) {
    showToast("Aún te faltan prerrequisitos para esta materia.");
    return;
  }
  if (stagedFlips.has(materia.c)) stagedFlips.delete(materia.c);
  else stagedFlips.add(materia.c);
  render();
}

async function confirmBatch() {
  if (stagedFlips.size === 0) {
    selectMode = false;
    render();
    return;
  }
  const n = stagedFlips.size;
  stagedFlips.forEach(code => {
    if (doneSet.has(code)) doneSet.delete(code);
    else doneSet.add(code);
  });
  const doneArr = [...doneSet];
  userData.done = doneArr;
  stagedFlips.clear();
  selectMode = false;
  render();
  try {
    await saveUser({ done: doneArr });
    showToast(`${n} materia${n === 1 ? "" : "s"} aplicada${n === 1 ? "" : "s"} y guardada${n === 1 ? "" : "s"} ✓`);
  } catch {
    showToast("No se pudo guardar. Revisa tu conexión.");
  }
}

/* ----- Video tutorial dentro de la app (se carga solo al abrirlo) ----- */
// El video vive en YouTube (no listado): el sitio no lo sirve, solo lo incrusta al abrir la ventana.
const VIDEO_ID = "_na57-Qsmy0";
const VIDEO_EMBED = `https://www.youtube-nocookie.com/embed/${VIDEO_ID}?rel=0&modestbranding=1&autoplay=1`;
function initVideo() {
  const ov = document.getElementById("video-overlay");
  const frame = document.getElementById("tuto-video");
  if (!ov || !frame) return;
  document.addEventListener("click", (e) => {
    if (!e.target.closest("[data-open-video]")) return;
    frame.src = VIDEO_EMBED;
    openModal("video-overlay");
  });
  // al cerrar se vacía el marco: el video se detiene y no sigue descargando
  ov.addEventListener("modal:closed", () => frame.removeAttribute("src"));
}

/* ----- Ventana de bienvenida: vincular la cuenta (primera vez o sin vincular) ----- */
const ONB_KEY = "malla_onb";
function initLinkPrompt() {
  const ov = document.getElementById("link-overlay");
  if (!ov) return;
  const remember = () => { try { sessionStorage.setItem(ONB_KEY, "1"); } catch {} };
  ov.addEventListener("modal:closed", remember); // cerrar (botón, fondo o Esc) cuenta como "ya la vi"
  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-link-go]")) { closeModal("link-overlay"); document.getElementById("btn-utesa")?.click(); }
    else if (e.target.closest("[data-link-manual]")) {
      closeModal("link-overlay");
      showToast("Modo manual: toca “Activar modo manual” para marcar tus materias.");
    }
  });
  let seen = false;
  try { seen = sessionStorage.getItem(ONB_KEY) === "1"; } catch {}
  if (!isLinked() && !seen) openModal("link-overlay");
}

/* ----- Listener delegado: modo manual ----- */
document.addEventListener("click", (e) => {
  const id = e.target.closest("[id]")?.id;
  if (id === "btn-select-mode") return toggleSelectMode();
  if (id === "batch-cancel") return cancelSelectMode();
  if (id === "batch-confirm") return confirmBatch();
});

/* ---------- Toolbar (búsqueda + filtros) ---------- */
function initToolbar() {
  document.getElementById("search-input").addEventListener("input", (e) => {
    searchTerm = e.target.value.trim().toLowerCase();
    render();
  });
  document.querySelectorAll("#filter-chips .chip").forEach(chip => {
    chip.addEventListener("click", () => {
      activeFilter = chip.dataset.filter;
      document.querySelectorAll("#filter-chips .chip").forEach(c => c.classList.remove("chip-active"));
      chip.classList.add("chip-active");
      render();
    });
  });
}

/* ---------- Cálculo de progreso ---------- */
function computeStats() {
  const allReales = pensum.cuatrimestres.flatMap(c => c.materias).filter(m => m.c !== "ELECTIVA");
  const doneReales = allReales.filter(m => doneSet.has(m.c));
  const doneElectivas = pensum.electivas.filter(m => doneSet.has(m.c));

  const creditosHechos = doneReales.reduce((s, m) => s + m.cr, 0) + doneElectivas.reduce((s, m) => s + m.cr, 0);
  const totalCreditos = pensum.totalCreditos;
  const pct = Math.min(100, Math.round((creditosHechos / totalCreditos) * 100));

  return {
    doneCount: doneReales.length + doneElectivas.length,
    totalCount: allReales.length + pensum.electivas.length,
    creditosHechos,
    totalCreditos,
    pct,
  };
}

function renderStats() {
  const s = computeStats();
  document.getElementById("perc-txt").textContent = s.pct + "%";
  const faltan = Math.max(0, s.totalCreditos - s.creditosHechos);
  document.getElementById("perc-desc").textContent = faltan === 0 ? "¡Completaste tu pensum! 🎓" : `Te faltan ${faltan} créditos`;
  document.getElementById("stat-done").textContent = s.doneCount;
  document.getElementById("stat-pending").textContent = Math.max(0, s.totalCount - s.doneCount);
  document.getElementById("stat-credits").textContent = `${s.creditosHechos} / ${s.totalCreditos}`;
  document.getElementById("credits-bar-fill").style.width = Math.min(100, (s.creditosHechos / s.totalCreditos) * 100) + "%";

  const circumference = 326.7;
  const offset = circumference - (s.pct / 100) * circumference;
  document.getElementById("ring-fg").style.strokeDashoffset = offset;
}

/* ---------- Render de una tarjeta de materia ---------- */
function subjectMatchesSearch(m) {
  if (!searchTerm) return true;
  return m.n.toLowerCase().includes(searchTerm) || m.c.toLowerCase().includes(searchTerm);
}
function subjectMatchesFilter(m) {
  const done = doneSet.has(m.c);
  if (activeFilter === "done") return done;
  if (activeFilter === "pending") return !done;
  return true;
}

function buildCard(materia) {
  if (materia.c === "ELECTIVA") {
    const div = document.createElement("div");
    div.className = "subject-card locked";
    div.innerHTML = `
      <span class="clave mono">SLOT</span>
      <span class="nombre">Espacio para materia electiva</span>
      <span class="meta"><span>Ver sección Electivas ↓</span><span class="cr">${materia.cr} CR</span></span>
    `;
    div.addEventListener("click", () => {
      document.getElementById("electivas-anchor")?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    return div;
  }

  const baseDone = doneSet.has(materia.c);
  const effSet = selectMode ? getEffectiveDoneSet() : doneSet;
  const done = effSet.has(materia.c);
  const unlocked = done || isUnlockedIn(materia, effSet);
  const staged = selectMode && stagedFlips.has(materia.c);

  const card = document.createElement("div");
  let cls = "subject-card";
  if (done) cls += " done";
  if (!unlocked) cls += " locked";
  if (staged) cls += baseDone ? " staged-remove" : " staged-add";
  const medal = medalHtml(materia.c, new Set(userData.earned || []), !!userData.verifiedAt);
  if (medal) cls += " has-medal";
  card.className = cls;

  const reqDisplay = materia.reqLabel || materia.req;
  const titleParts = [];
  if (materia.req && materia.req !== "-") titleParts.push(`Requisitos: ${reqDisplay}`);
  if (materia.bloque) titleParts.push(materia.bloque.label);
  card.title = titleParts.length ? titleParts.join(" · ") : "Sin requisitos";

  card.innerHTML = `
    ${medal}
    ${!unlocked ? `<svg class="lock-ico" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>` : ""}
    <div class="sello">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6 9 17l-5-5"></path></svg>
    </div>
    <span class="clave mono">${materia.c}</span>
    <span class="nombre">${materia.n}</span>
    <span class="meta"><span>${materia.hp > 0 ? "Teórico-práctico" : "Teórico"}</span><span class="cr">${materia.cr} CR</span></span>
  `;
  card.addEventListener("click", () => {
    if (selectMode) toggleStaged(materia);
    else showSubjectDetail(materia);
  });
  return card;
}

/* ---------- Vista: malla escalonada (por defecto) o tarjetas ---------- */
let viewMode = "cards"; // al entrar siempre se muestran las tarjetas; el usuario puede cambiar de vista

function initViewSwitch() {
  document.querySelectorAll("#view-switch [data-view]").forEach(btn => {
    btn.classList.toggle("seg-active", btn.dataset.view === viewMode);
    btn.addEventListener("click", () => {
      viewMode = btn.dataset.view;
      document.querySelectorAll("#view-switch [data-view]").forEach(b => b.classList.toggle("seg-active", b === btn));
      render();
    });
  });
}

/* ---------- Panel de sincronización con UTESA ---------- */
function renderSync() {
  const el = document.getElementById("sync-panel");
  if (!el || !pensum) return;
  const sync = userData.utesaSync || null;
  const appAprob = [...doneSet].filter(c => /^[A-Z]{2,4}-\d{3}$/.test(c)).length;

  if (!sync) {
    el.innerHTML = `
      <div class="sync-main">
        <div class="sync-title">Sincronización con UTESA</div>
        <p>Trae tu progreso real desde la página oficial de UTESA: inicias sesión allá, la app copia tu avance y cierra tu sesión de UTESA.</p>
      </div>
      <button class="btn btn-primary btn-sm" data-open-utesa>Sincronizar con UTESA</button>`;
    return;
  }
  const when = new Date(sync.at).toLocaleString("es-DO", { dateStyle: "medium", timeStyle: "short" });
  const check = sync.aprob == null ? ""
    : sync.aprob === appAprob
      ? `<span class="perf-ok">✓ Coincide con UTESA: ${sync.aprob} aprobadas</span>`
      : `<span class="perf-warn">UTESA reporta ${sync.aprob} aprobadas · la app tiene ${appAprob}</span>`;
  el.innerHTML = `
    <div class="sync-main">
      <div class="sync-title">Sincronizado con UTESA</div>
      <p>Última vez: ${when}${sync.insc != null ? ` · ${sync.insc} inscritas ahora` : ""}${sync.pend != null ? ` · ${sync.pend} pendientes` : ""}</p>
      ${check}
    </div>
    <button class="btn btn-ghost btn-sm" data-open-utesa>Volver a sincronizar</button>`;
}

function render() {
  renderStats();
  renderSync();
  renderManualUI();
  renderPrintHeader();
  document.body.dataset.view = viewMode;
  if (viewMode === "malla") renderGraph();
  else if (viewMode === "charts") renderChartsView();
  else renderCards();
}

function findSubject(code) {
  const f = findMateria(code);
  return f ? f.m : null;
}

function renderChartsView() {
  const cont = document.getElementById("malla-content");
  cont.classList.remove("is-graph");
  cont.classList.add("is-charts");
  const effSet = selectMode ? getEffectiveDoneSet() : doneSet;
  renderCharts(cont, {
    pensum,
    effSet,
    prereqsOf: getPrereqCodes,
    isUnlocked: (m) => isUnlockedIn(m, effSet),
    findSubject,
    onSubjectClick: (m) => showSubjectDetail(m),
  });
}

function renderGraph() {
  const cont = document.getElementById("malla-content");
  cont.classList.remove("is-charts");
  cont.classList.add("is-graph");
  const effSet = selectMode ? getEffectiveDoneSet() : doneSet;
  renderMallaGraph(cont, {
    pensum,
    effSet,
    baseSet: doneSet,
    staged: selectMode ? stagedFlips : new Set(),
    manual: selectMode,
    matches: (m) => subjectMatchesSearch(m) && (activeFilter === "electivas" || subjectMatchesFilter(m)),
    prereqsOf: getPrereqCodes,
    isUnlocked: (m) => isUnlockedIn(m, effSet),
    medal: (code) => medalHtml(code, new Set(userData.earned || []), !!userData.verifiedAt),
    onCardClick: (m) => {
      if (m.c === "ELECTIVA") {
        document.getElementById("electivas-anchor")?.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
      // modo manual: marca la materia. En el mapa la ruta se resalta dentro del propio mapa (no se abre el panel de información).
      if (selectMode) toggleStaged(m);
    },
  });
  if (activeFilter === "electivas") {
    requestAnimationFrame(() => document.getElementById("electivas-anchor")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }
}

/* ---------- Panel de detalle de una materia ---------- */
function findMateria(code) {
  for (const c of pensum.cuatrimestres) {
    const f = c.materias.find(m => m.c === code);
    if (f) return { m: f, cuat: c.n };
  }
  const e = pensum.electivas.find(m => m.c === code);
  return e ? { m: e, cuat: null } : null;
}
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

function showSubjectDetail(materia) {
  const sheet = document.getElementById("detail-sheet");
  if (!sheet) return;
  const effSet = selectMode ? getEffectiveDoneSet() : doneSet;
  const done = effSet.has(materia.c);
  const unlocked = done || isUnlockedIn(materia, effSet);
  const prereqs = getPrereqCodes(materia);
  const all = [...pensum.cuatrimestres.flatMap(c => c.materias), ...pensum.electivas];
  const unlocks = all.filter(x => x.c !== "ELECTIVA" && !x.reqLabel && getPrereqCodes(x).includes(materia.c));
  const where = findMateria(materia.c);

  const status = done
    ? '<span class="pill pill-done">Aprobada</span>'
    : unlocked ? '<span class="pill pill-open">Disponible para cursar</span>'
    : '<span class="pill pill-lock">Bloqueada</span>';

  const reqHtml = materia.reqLabel
    ? `<p class="detail-note">${escapeHtml(materia.reqLabel)}</p>
       <p class="detail-note">${prereqs.filter(c => effSet.has(c)).length} de ${prereqs.length} materias requeridas aprobadas.</p>`
    : prereqs.length
      ? `<ul class="detail-list">${prereqs.map(c => {
          const f = findMateria(c);
          const ok = effSet.has(c);
          return `<li class="${ok ? "ok" : "no"}"><span class="mark">${ok ? "✓" : "•"}</span><span class="mono">${c}</span> ${escapeHtml(f ? f.m.n : "")}</li>`;
        }).join("")}</ul>`
      : '<p class="detail-note">Sin prerrequisitos.</p>';

  const bloqueNote = materia.bloque
    ? `<p class="detail-note">${escapeHtml(materia.bloque.label)}: ${materia.bloque.codes.filter(c => effSet.has(c)).length} de ${materia.bloque.codes.length} materias aprobadas.</p>` : "";
  const coreqCodes = [...getCoReqCodes(materia.req || "")];
  const coreq = coreqCodes.length
    ? `<p class="detail-note">Correquisito: <span class="mono">${coreqCodes.join(", ")}</span> (se cursan juntas)</p>` : "";

  sheet.innerHTML = `
    <div class="detail-head">
      <div>
        <span class="mono detail-code">${materia.c}</span>
        <h3>${escapeHtml(materia.n)}</h3>
      </div>
      <button class="icon-btn" data-close-detail title="Cerrar">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </button>
    </div>
    <div class="detail-meta">
      ${status}
      <span>${materia.cr} créditos</span>
      <span>${materia.ht} HT · ${materia.hp} HP</span>
      <span>${where && where.cuat ? `Cuatrimestre ${where.cuat}` : "Electiva"}</span>
    </div>
    <div class="detail-sec"><div class="detail-title">Requisitos</div>${reqHtml}${bloqueNote}${coreq}</div>
    <div class="detail-sec"><div class="detail-title">Desbloquea</div>
      ${unlocks.length
        ? `<ul class="detail-list">${unlocks.map(u => `<li class="${effSet.has(u.c) ? "ok" : ""}"><span class="mark">→</span><span class="mono">${u.c}</span> ${escapeHtml(u.n)}</li>`).join("")}</ul>`
        : '<p class="detail-note">No es prerrequisito directo de otra materia.</p>'}
    </div>
    ${medalDetailHtml(materia.c, new Set(userData.earned || []))}
    <p class="detail-foot">${isLinked() ? "Tu avance se actualiza al sincronizar con UTESA." : selectMode ? "Modo manual: toca la materia en la malla o en las tarjetas para marcarla." : "Para marcarla, activa el modo manual o vincula tu cuenta de UTESA."}</p>
  `;
  sheet.classList.add("show");
}

function initDetail() {
  document.addEventListener("click", (e) => {
    const sheet = document.getElementById("detail-sheet");
    if (!sheet || !sheet.classList.contains("show")) return;
    if (e.target.closest("[data-close-detail]")) { sheet.classList.remove("show"); return; }
    if (!sheet.contains(e.target) && !e.target.closest(".subject-card, .mg-node")) sheet.classList.remove("show");
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") document.getElementById("detail-sheet")?.classList.remove("show");
  });
}

/* ---------- Impresión ---------- */
function renderPrintHeader() {
  const el = document.getElementById("print-header");
  if (!el || !pensum) return;
  const s = computeStats();
  const fecha = new Date().toLocaleDateString("es-DO", { year: "numeric", month: "long", day: "numeric" });
  el.innerHTML = `
    <div class="ph-left">
      <div class="ph-badge" style="background:${pensum.color}">${pensum.key}</div>
      <div>
        <div class="ph-name">${escapeHtml(userData.name || "")}</div>
        <div class="ph-career">${escapeHtml(pensum.nombre)} · ${escapeHtml(pensum.titulo)}</div>
        <div class="ph-date">Malla curricular · generado el ${fecha}</div>
      </div>
    </div>
    <div class="ph-stats">
      <div><strong>${s.pct}%</strong><span>avance</span></div>
      <div><strong>${s.creditosHechos}/${s.totalCreditos}</strong><span>créditos</span></div>
      <div><strong>${s.doneCount}</strong><span>aprobadas</span></div>
    </div>
    <div class="ph-legend">
      <span><i class="lg lg-done">✓</i>Aprobada</span>
      <span><i class="lg lg-open"></i>Disponible</span>
      <span><i class="lg lg-lock"></i>Bloqueada</span>
    </div>
  `;
}

function initPrint() {
  let saved = null;
  const prepare = () => {
    if (saved) return;
    saved = { viewMode, activeFilter, searchTerm };
    // Siempre se imprime la malla completa, sin filtros
    viewMode = "malla"; activeFilter = "all"; searchTerm = "";
    document.body.classList.add("is-printing");
    document.getElementById("detail-sheet")?.classList.remove("show");
    render();
  };
  const restore = () => {
    if (!saved) return;
    ({ viewMode, activeFilter, searchTerm } = saved);
    saved = null;
    document.body.classList.remove("is-printing");
    render();
  };
  window.addEventListener("beforeprint", prepare);
  window.addEventListener("afterprint", restore);
  document.getElementById("btn-print")?.addEventListener("click", () => {
    prepare();
    // pequeño respiro para que el layout se recalcule antes del diálogo
    setTimeout(() => window.print(), 80);
  });
}

/* ---------- Cuatrimestres plegables (en el celular arrancan cerrados los ya completados) ---------- */
const collapsedCuatri = new Set();
let foldReady = false;
function initCuatriFold() {
  if (foldReady) return;
  foldReady = true;
  if (window.matchMedia("(max-width: 640px)").matches) {
    pensum.cuatrimestres.forEach(c => {
      const reales = c.materias.filter(m => m.c !== "ELECTIVA");
      if (reales.length && reales.every(m => doneSet.has(m.c))) collapsedCuatri.add(c.n);
    });
  }
  document.getElementById("malla-content").addEventListener("click", (e) => {
    const head = e.target.closest("button.cuatri-head");
    if (!head) return;
    const block = head.closest(".cuatri-block");
    const n = Number(block.dataset.cuat);
    const collapse = !block.classList.contains("collapsed");
    block.classList.toggle("collapsed", collapse);
    head.setAttribute("aria-expanded", String(!collapse));
    if (collapse) collapsedCuatri.add(n); else collapsedCuatri.delete(n);
  });
}

/* ---------- Vista de tarjetas (clásica) ---------- */
function renderCards() {
  const cont = document.getElementById("malla-content");
  cont.classList.remove("is-graph", "is-charts");
  cont.innerHTML = "";

  let anyVisible = false;
  initCuatriFold();

  // "¿Qué sigue?": materias pendientes cuyos requisitos ya están cumplidos
  if (activeFilter === "all" && !searchTerm && !selectMode) {
    const ready = pensum.cuatrimestres.flatMap(c => c.materias)
      .filter(m => m.c !== "ELECTIVA" && !doneSet.has(m.c) && isUnlockedIn(m, doneSet));
    if (ready.length) {
      const sec = document.createElement("section");
      sec.className = "next-up";
      sec.setAttribute("aria-label", "Materias listas para cursar");
      sec.innerHTML = `<div class="next-head"><strong>Listas para cursar</strong><span>${ready.length} ${ready.length === 1 ? "materia disponible" : "materias disponibles"}</span></div><div class="next-list"></div>`;
      const list = sec.querySelector(".next-list");
      ready.slice(0, 8).forEach(m => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "next-chip";
        b.innerHTML = `<span class="mono">${m.c}</span><b>${m.n}</b><em>${m.cr} CR</em>`;
        b.addEventListener("click", () => showSubjectDetail(m));
        list.appendChild(b);
      });
      cont.appendChild(sec);
    }
  }

  pensum.cuatrimestres.forEach(cuat => {
    const visibleMaterias = cuat.materias.filter(m =>
      subjectMatchesSearch(m) && (m.c === "ELECTIVA" ? activeFilter === "all" : subjectMatchesFilter(m))
    );
    if (activeFilter === "electivas") return; // se muestra aparte más abajo
    if (visibleMaterias.length === 0) return;
    anyVisible = true;

    const block = document.createElement("div");
    block.className = "cuatri-block";
    const total = cuat.materias.filter(m => m.c !== "ELECTIVA").length;
    const hechas = cuat.materias.filter(m => m.c !== "ELECTIVA" && doneSet.has(m.c)).length;
    const pctC = total ? Math.round(hechas / total * 100) : 0;
    block.dataset.cuat = cuat.n;
    block.classList.toggle("collapsed", collapsedCuatri.has(cuat.n));
    block.innerHTML = `
      <button type="button" class="cuatri-head" aria-expanded="${!collapsedCuatri.has(cuat.n)}">
        <span class="num">${String(cuat.n).padStart(2, "0")}</span>
        <span class="title">Cuatrimestre</span>
        <span class="cuatri-bar" role="img" aria-label="${pctC}% completado"><i style="width:${pctC}%"></i></span>
        <span class="cnt">${hechas} de ${total}</span>
        <svg class="cuatri-chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"></path></svg>
      </button>
    `;
    const grid = document.createElement("div");
    grid.className = "materias-grid";
    visibleMaterias.forEach(m => grid.appendChild(buildCard(m)));
    block.appendChild(grid);
    cont.appendChild(block);
  });

  // Sección de electivas
  const visibleElectivas = pensum.electivas.filter(m => subjectMatchesSearch(m) && subjectMatchesFilter(m));
  if ((activeFilter === "all" || activeFilter === "electivas" || (searchTerm && visibleElectivas.length)) && visibleElectivas.length > 0) {
    anyVisible = true;
    const block = document.createElement("div");
    block.className = "cuatri-block";
    block.id = "electivas-anchor";
    block.innerHTML = `
      <div class="cuatri-head is-static">
        <span class="num">EL</span>
        <span class="title">Electivas</span>
        <span class="cnt">${visibleElectivas.filter(m => doneSet.has(m.c)).length} de ${visibleElectivas.length}</span>
      </div>
      <div class="electivas-note">Debes cursar un mínimo de créditos electivos según tu pensum. Elige y marca las que curses.</div>
    `;
    const grid = document.createElement("div");
    grid.className = "materias-grid";
    visibleElectivas.forEach(m => grid.appendChild(buildCard(m)));
    block.appendChild(grid);
    cont.appendChild(block);
  }

  if (!anyVisible) {
    cont.innerHTML = `
      <div class="empty-state">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="7"></circle><path d="m21 21-4.35-4.35"></path></svg>
        <p>No encontramos materias que coincidan con tu búsqueda o filtro.</p>
      </div>
    `;
  }
}
