// moderation.js
// Configuración → Moderación (solo el equipo): resumen, cuentas (suspender del chat por tiempo, reiniciar,
// roles y eliminar), mensajes reportados, registro de moderación y herramientas para vaciar chats.
// El servidor vuelve a comprobar cada permiso; aquí solo se esconden los botones que no aplican.

import { api, serverNow } from "./store.js";
import { framedAvatar } from "./frames.js";
import { PENSUMS } from "./pensums-data.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
const ago = (ms) => {
  if (!ms) return "";
  const m = Math.max(0, Math.round((serverNow() - ms) / 60000));
  return m < 2 ? "hace un momento" : m < 60 ? `hace ${m} min` : m < 1440 ? `hace ${Math.round(m / 60)} h` : m < 43200 ? `hace ${Math.round(m / 1440)} d` : new Date(ms).toLocaleDateString("es-DO", { dateStyle: "medium" });
};
const until = (ms) => ms == null ? "indefinida" : `hasta el ${new Date(ms).toLocaleString("es-DO", { dateStyle: "medium", timeStyle: "short" })}`;
const DURATIONS = [[10, "10 minutos"], [60, "1 hora"], [360, "6 horas"], [1440, "1 día"], [4320, "3 días"], [10080, "1 semana"], [43200, "30 días"]];
const FILTERS = [["all", "Todas"], ["banned", "Suspendidas"], ["reported", "Reportadas"], ["staff", "Equipo"], ["new", "Nuevas (7 días)"], ["reset", "Reiniciadas"]];
const ACTIONS = {
  suspender: ["⛔", "suspendió a"], levantar: ["✅", "levantó la suspensión de"], reiniciar: ["♻️", "reinició la cuenta de"],
  ocultar: ["🙈", "ocultó un mensaje de"], restaurar: ["↩️", "restauró"], vaciar: ["🧹", "vació"], eliminar: ["🗑️", "eliminó a"],
  "hacer-mod": ["🛡️", "nombró moderador a"], "quitar-mod": ["➖", "quitó de moderación a"],
};

/** Botón de dos pasos: el primer toque pide confirmar, el segundo ejecuta. */
function twoStep(btn, armed, action) {
  if (btn.dataset.armed) { clearTimeout(btn.__t); delete btn.dataset.armed; btn.textContent = btn.dataset.label; btn.classList.remove("is-armed"); action(); return; }
  btn.dataset.label = btn.textContent; btn.dataset.armed = "1"; btn.textContent = armed; btn.classList.add("is-armed");
  btn.__t = setTimeout(() => { delete btn.dataset.armed; btn.textContent = btn.dataset.label; btn.classList.remove("is-armed"); }, 4000);
}

/**
 * Monta el panel dentro de `root`. `ctx` = { me: () => usuario actual, toast(texto) }.
 * Devuelve { show() } para recargar los datos cada vez que se abre la pestaña.
 */
export function initModeration(root, ctx) {
  let tab = "cuentas", filter = "all", q = "", accounts = [], more = false, owner = false, banFor = null, loading = false;

  root.innerHTML = `
    <div class="mod-summary" aria-live="polite"></div>
    <div class="mod-tabs" role="tablist" aria-label="Secciones de moderación">
      <button type="button" role="tab" data-mtab="cuentas">👥 Cuentas</button>
      <button type="button" role="tab" data-mtab="reportes">🚩 Reportes <i class="mod-count" hidden></i></button>
      <button type="button" role="tab" data-mtab="registro">📜 Registro</button>
      <button type="button" role="tab" data-mtab="herramientas">🧹 Herramientas</button>
    </div>
    <div class="mod-pane" data-mpane="cuentas">
      <div class="mod-bar"><input class="input mod-q" type="search" placeholder="Buscar por nombre…" maxlength="40" aria-label="Buscar cuentas" autocomplete="off"></div>
      <div class="mod-filters" role="group" aria-label="Filtrar cuentas">${FILTERS.map(([k, l]) => `<button type="button" class="chip" data-mfilter="${k}">${l}</button>`).join("")}</div>
      <ul class="mod-list mod-accounts"></ul>
      <button type="button" class="btn btn-ghost btn-sm mod-more" hidden>Cargar más</button>
    </div>
    <div class="mod-pane" data-mpane="reportes" hidden><ul class="mod-list mod-reports"></ul></div>
    <div class="mod-pane" data-mpane="registro" hidden><ul class="mod-list mod-log"></ul></div>
    <div class="mod-pane" data-mpane="herramientas" hidden>
      <h4 class="set-title">Vaciar chats</h4>
      <p class="set-text">Borra de forma definitiva los mensajes de una sala pública. Los chats privados y los grupos nunca se tocan.</p>
      <div class="set-row mod-wipe"></div>
      <h4 class="set-title" style="margin-top:18px">Cómo funciona</h4>
      <ul class="mod-help">
        <li><b>Suspender:</b> la persona sigue leyendo, pero no puede escribir ni editar en ningún chat hasta que venza. Se levanta sola.</li>
        <li><b>Reiniciar:</b> borra nombre, personaje, avance, logros y preferencias; al volver a entrar configura su perfil desde cero. Conserva amistades, mensajes y rol.</li>
        <li><b>Eliminar</b> (solo el dueño): borra la cuenta por completo y no puede volver.</li>
        <li>Los moderadores actúan sobre estudiantes; sobre otros moderadores solo el dueño. Todo queda en el <b>Registro</b>.</li>
      </ul>
    </div>`;
  const $ = (s) => root.querySelector(s);

  function setTab(t) {
    tab = t;
    root.querySelectorAll("[data-mtab]").forEach(b => b.setAttribute("aria-selected", String(b.dataset.mtab === t)));
    root.querySelectorAll("[data-mpane]").forEach(p => { p.hidden = p.dataset.mpane !== t; });
    if (t === "cuentas") loadAccounts(true);
    else if (t === "reportes") loadReports();
    else if (t === "registro") loadLog();
    else paintWipe();
  }

  /* ---------- resumen ---------- */
  async function loadSummary() {
    const r = await api("GET", "/api/mod/summary").catch(() => null);
    if (!r || r.status !== 200) { $(".mod-summary").innerHTML = `<p class="set-text">No se pudo cargar el resumen.</p>`; return; }
    owner = !!r.data.owner;
    const s = r.data.summary;
    const card = (n, l, f) => `<button type="button" class="mod-stat"${f ? ` data-jump="${f}"` : ""}><b>${n}</b><span>${l}</span></button>`;
    $(".mod-summary").innerHTML = card(s.users, "cuentas", "all") + card(s.online, "en línea") + card(s.newWeek, "nuevas esta semana", "new") +
      card(s.bans, "suspendidas", "banned") + card(s.reports, "reportes pendientes", "@reportes") + card(s.messagesDay, "mensajes hoy");
    const c = $(".mod-count");
    c.hidden = !s.reports; c.textContent = s.reports;
  }

  /* ---------- cuentas ---------- */
  const canAct = (a) => { const me = ctx.me(); return a.pid !== me.pid && a.role !== "owner" && (a.role !== "mod" || owner); };
  function accountHtml(a) {
    const me = ctx.me();
    const role = a.role === "owner" ? '<span class="role-chip is-owner">👑 Dueño</span>' : a.role === "mod" ? '<span class="role-chip">🛡️ Moderador</span>' : "";
    const status = [a.online ? '<span class="mod-on">● En línea</span>' : a.seen ? `Activo ${ago(a.seen)}` : "", `${a.msgs} mensaje${a.msgs === 1 ? "" : "s"}`,
      a.reported ? `<span class="mod-warn">${a.reported} reportado${a.reported === 1 ? "" : "s"}</span>` : "", a.reset ? "<em>reiniciada · aún sin configurar</em>" : "",
      a.hidden ? "oculta del directorio" : "", `desde ${new Date(a.created).toLocaleDateString("es-DO", { dateStyle: "medium" })}`].filter(Boolean).join(" · ");
    const ban = a.ban ? `<p class="mod-ban">⛔ Suspendido del chat (${esc(until(a.ban.until))})${a.ban.reason ? ` · ${esc(a.ban.reason)}` : ""}</p>` : "";
    let actions = "";
    if (canAct(a)) {
      actions += a.ban ? `<button type="button" class="btn btn-ghost btn-sm" data-act="unban">Quitar suspensión</button>` : `<button type="button" class="btn btn-ghost btn-sm" data-act="ban">Suspender del chat</button>`;
      if (!a.reset) actions += `<button type="button" class="btn btn-ghost btn-sm" data-act="reset">Reiniciar cuenta</button>`;
      if (owner) actions += a.role === "mod" ? `<button type="button" class="btn btn-ghost btn-sm" data-act="unmod">Quitar moderador</button>` : `<button type="button" class="btn btn-ghost btn-sm" data-act="mod">Hacer moderador</button>`;
      if (owner) actions += `<button type="button" class="btn btn-ghost btn-sm mod-danger" data-act="delete">Eliminar</button>`;
    } else if (a.pid === me.pid) actions = `<span class="set-text">Eres tú. Para reiniciar tu cuenta usa «Mi cuenta».</span>`;
    const form = banFor === a.pid ? `<div class="mod-banform">
        <label>Duración <select class="input mod-dur">${DURATIONS.map(([m, l]) => `<option value="${m}"${m === 1440 ? " selected" : ""}>${l}</option>`).join("")}${owner ? '<option value="0">Indefinida</option>' : ""}</select></label>
        <label>Motivo (lo verá la persona) <input class="input mod-reason" maxlength="120" placeholder="Ej.: insultos en el chat General"></label>
        <div class="set-row"><button type="button" class="btn btn-ghost btn-sm" data-act="ban-cancel">Cancelar</button><button type="button" class="btn btn-primary btn-sm" data-act="ban-go">Suspender</button></div>
      </div>` : "";
    return `<li class="mod-acc" data-pid="${esc(a.pid)}">
      <div class="mod-acc-top">${framedAvatar(a.avatar, a.avatarBg, a.frame, 42)}
        <div class="mod-acc-txt"><strong>${esc(a.name)}</strong> ${role} <small class="muted">${esc(PENSUMS[a.career]?.key || a.career || "")}</small><span class="mod-meta">${status}</span></div></div>
      ${ban}<div class="mod-actions">${actions}</div>${form}</li>`;
  }
  function paintAccounts() {
    root.querySelectorAll("[data-mfilter]").forEach(b => b.classList.toggle("chip-active", b.dataset.mfilter === filter));
    $(".mod-accounts").innerHTML = accounts.length ? accounts.map(accountHtml).join("") : `<li class="mod-empty">${loading ? "Cargando…" : "No hay cuentas con ese filtro."}</li>`;
    $(".mod-more").hidden = !more;
  }
  async function loadAccounts(fresh) {
    if (fresh) { accounts = []; more = false; }
    loading = true; paintAccounts();
    const r = await api("GET", `/api/mod/accounts?filter=${filter}&q=${encodeURIComponent(q)}&offset=${accounts.length}`).catch(() => null);
    loading = false;
    if (!r || r.status !== 200) { $(".mod-accounts").innerHTML = `<li class="mod-empty">No se pudieron cargar las cuentas.</li>`; return; }
    owner = !!r.data.owner;
    accounts = accounts.concat(r.data.accounts);
    more = !!r.data.more;
    paintAccounts();
  }
  async function act(kind, pid, btn) {
    const a = accounts.find(x => x.pid === pid);
    if (!a) return;
    const done = async (r, msg) => {
      if (r && r.status === 200) { ctx.toast(msg); banFor = null; await Promise.all([loadAccounts(true), loadSummary()]); }
      else { if (btn) btn.disabled = false; ctx.toast(r?.data?.message || "No se pudo completar la acción."); }
    };
    if (kind === "ban") { banFor = pid; paintAccounts(); root.querySelector(`[data-pid="${pid}"] .mod-reason`)?.focus(); return; }
    if (kind === "ban-cancel") { banFor = null; paintAccounts(); return; }
    if (kind === "ban-go") {
      const li = root.querySelector(`[data-pid="${pid}"]`);
      btn.disabled = true;
      const minutes = Number(li.querySelector(".mod-dur").value);
      const r = await api("POST", "/api/mod/ban", { pid, minutes, reason: li.querySelector(".mod-reason").value }).catch(() => null);
      return done(r, `${a.name} suspendido del chat ✓`);
    }
    if (kind === "unban") { btn.disabled = true; return done(await api("POST", "/api/mod/unban", { pid }).catch(() => null), "Suspensión levantada ✓"); }
    if (kind === "reset") return twoStep(btn, "¿Reiniciar? Toca otra vez", async () => { btn.disabled = true; done(await api("POST", "/api/mod/reset", { pid }).catch(() => null), `Cuenta de ${a.name} reiniciada ✓`); });
    if (kind === "mod" || kind === "unmod") { btn.disabled = true; return done(await api("POST", "/api/mods", { pid, on: kind === "mod" }).catch(() => null), "Rol actualizado ✓"); }
    if (kind === "delete") {
      return twoStep(btn, "¿Eliminar? Toca otra vez", async () => {
        if (!confirm(`¿Eliminar DEFINITIVAMENTE a ${a.name}?\n\nSe borran su cuenta, sus mensajes, sus amistades y su lugar en los grupos, y no podrá volver a entrar. No se puede deshacer.`)) return;
        btn.disabled = true;
        done(await api("POST", "/api/users/delete", { pid }).catch(() => null), "Usuario eliminado");
      });
    }
  }

  /* ---------- reportes ---------- */
  async function loadReports() {
    const ul = $(".mod-reports");
    ul.innerHTML = `<li class="mod-empty">Cargando…</li>`;
    const r = await api("GET", "/api/chat/reports").catch(() => null);
    if (!r || r.status !== 200) { ul.innerHTML = `<li class="mod-empty">No se pudieron cargar los reportes.</li>`; return; }
    const room = (k) => k === "general" ? "General" : k.startsWith("c:") ? `Sala ${k.slice(2)}` : k.startsWith("g:") ? "Grupo" : "Privado";
    ul.innerHTML = r.data.reports.length ? r.data.reports.map(x => `<li class="mod-rep">
        <p><strong>${esc(x.name)}</strong> <small class="muted">${room(x.room)} · ${x.n} reporte${x.n === 1 ? "" : "s"}${x.reason ? ` · «${esc(x.reason)}»` : ""}</small></p>
        <blockquote>${esc(x.text)}</blockquote>
        ${x.selfDeleted ? '<em class="rep-flag">borrado por su autor después del reporte</em>' : x.edited ? '<em class="rep-flag">editado después del reporte</em>' : ""}
        <div class="mod-actions"><button type="button" class="btn btn-ghost btn-sm" data-hide="${x.id}">${x.selfDeleted ? "Archivar" : "Ocultar mensaje"}</button><button type="button" class="btn btn-ghost btn-sm" data-see="${esc(x.name)}">Ver cuenta</button></div></li>`).join("")
      : `<li class="mod-empty">🎉 Sin reportes pendientes.</li>`;
  }

  /* ---------- registro ---------- */
  async function loadLog() {
    const ul = $(".mod-log");
    ul.innerHTML = `<li class="mod-empty">Cargando…</li>`;
    const r = await api("GET", "/api/mod/log").catch(() => null);
    if (!r || r.status !== 200) { ul.innerHTML = `<li class="mod-empty">No se pudo cargar el registro.</li>`; return; }
    ul.innerHTML = r.data.log.length ? r.data.log.map(l => {
      const [icon, verb] = ACTIONS[l.action] || ["•", l.action];
      const target = l.target ? ` <strong>${esc(l.target)}</strong>` : "";
      return `<li class="mod-logrow"><span class="mod-logicon" aria-hidden="true">${icon}</span><span><strong>${esc(l.actor)}</strong> ${esc(verb)}${target}${l.detail ? ` <small class="muted">· ${esc(l.detail)}</small>` : ""}<small class="mod-when">${ago(l.at)}</small></span></li>`;
    }).join("") : `<li class="mod-empty">Todavía no hay acciones registradas.</li>`;
  }

  /* ---------- herramientas ---------- */
  function paintWipe() {
    $(".mod-wipe").innerHTML = `<button type="button" class="btn btn-ghost btn-sm" data-wipe="general">Vaciar General</button><button type="button" class="btn btn-ghost btn-sm" data-wipe="carrera">Vaciar la sala de mi carrera</button>${owner ? '<button type="button" class="btn btn-ghost btn-sm mod-danger" data-wipe="all">Vaciar todas las salas públicas</button>' : ""}`;
  }

  /* ---------- eventos ---------- */
  let qTimer = 0;
  root.addEventListener("input", (e) => {
    if (!e.target.classList.contains("mod-q")) return;
    clearTimeout(qTimer);
    qTimer = setTimeout(() => { q = e.target.value.trim(); loadAccounts(true); }, 300);
  });
  root.addEventListener("click", async (e) => {
    const t = e.target;
    const mt = t.closest("[data-mtab]"); if (mt) return setTab(mt.dataset.mtab);
    const mf = t.closest("[data-mfilter]"); if (mf) { filter = mf.dataset.mfilter; return loadAccounts(true); }
    const jp = t.closest("[data-jump]");
    if (jp) { if (jp.dataset.jump === "@reportes") return setTab("reportes"); filter = jp.dataset.jump; q = ""; $(".mod-q").value = ""; return setTab("cuentas"); }
    if (t.closest(".mod-more")) return loadAccounts(false);
    const a = t.closest("[data-act]"); if (a) return act(a.dataset.act, a.closest("[data-pid]").dataset.pid, a);
    const h = t.closest("[data-hide]");
    if (h) { h.disabled = true; const r = await api("DELETE", `/api/chat?id=${h.dataset.hide}`).catch(() => null); if (r && r.status === 200) { ctx.toast("Listo ✓"); loadReports(); loadSummary(); } else { h.disabled = false; ctx.toast("No se pudo ocultar."); } return; }
    const see = t.closest("[data-see]"); if (see) { filter = "all"; q = see.dataset.see; $(".mod-q").value = q; return setTab("cuentas"); }
    const w = t.closest("[data-wipe]");
    if (w) {
      const what = w.dataset.wipe;
      return twoStep(w, what === "all" ? "¿Vaciar TODO? Toca otra vez" : "¿Seguro? Toca otra vez", async () => {
        w.disabled = true;
        const r = await api("POST", "/api/chat/wipe", { room: what }).catch(() => null);
        w.disabled = false;
        ctx.toast(r && r.status === 200 ? "Chat vaciado ✓" : (r?.data?.message || "No se pudo vaciar."));
        loadSummary();
      });
    }
  });

  return {
    show(section) { loadSummary(); setTab(section || tab); },
  };
}
