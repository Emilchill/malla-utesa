// chat-core.js — el chat de la comunidad como pieza reutilizable.
// Lo usan el cuadro fijo del panel (chat-dock.js) y la página completa (chat.js).
//
//  · Dos salas: "General" y "Mi carrera" (solo estudiantes de esa carrera; el servidor lo impone).
//  · En vivo: cada envío o borrado avisa por Firestore (chat-live.js) y todos reciben el cambio al instante.
//    Un sondeo de respaldo (6 s, o 30 s si el modo en vivo funciona) cubre cualquier fallo.
//  · Mensajes nuevos con el chat cerrado o la pestaña oculta cuentan como "sin leer".
//  · Cuando escribe otra persona suena un "plin" leve (si los avisos están encendidos; ver chat-prefs.js).
//  · El servidor enmascara las malas palabras con ****; aquí se le avisa a quien las escribió.

import { PENSUMS } from "./pensums-data.js";
import { framedAvatar, MOD_BY_ID } from "./frames.js";
import { ACH_BY_ID, TIERS, GLYPHS } from "./achievements.js";
import { api, serverNow } from "./store.js";
import { openModal, closeModal } from "./modal.js";
import { subscribe, ping, pingId, pingInbox } from "./chat-live.js";
import { skelRows, skelProfile } from "./motion.js";
import { playPing, desktopNotify, isMuted, toggleMute, permState, turnOn } from "./chat-prefs.js";
import { rankCardHtml } from "./ranks.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
const MAX_KEEP = 600;
const GROUP_MS = 5 * 60 * 1000;
const EDIT_MS = 5 * 60 * 1000; // quien escribe puede editar durante 5 minutos (el servidor lo vuelve a comprobar)

const roleChip = (role) => role === "owner" ? '<span class="role-chip is-owner" title="Dueño de la comunidad">👑 Dueño</span>' : role === "mod" ? '<span class="role-chip" title="Moderador">🛡️ Mod</span>' : "";


/** Selector de emojis (sin librerías: emojis nativos del dispositivo). */
const EMOJI_SETS = [
  { id: "recent", icon: "🕘", name: "Recientes", list: [] },
  { id: "caras", icon: "😀", name: "Caras", list: "😀 😃 😄 😁 😆 😅 😂 🤣 😊 😇 🙂 😉 😍 🥰 😘 😋 😜 🤪 😎 🤓 🥳 🤩 😏 😒 😞 😔 😟 😕 🙁 😢 😭 😤 😡 🤯 😳 🥺 😱 😨 😰 😴 🤔 🤗 🫡 🙄 😬 😮‍💨 🤭 🤫 🥱 😷 🤒 🤕 🥵 🥶".split(" ") },
  { id: "gestos", icon: "👍", name: "Gestos", list: "👍 👎 👏 🙌 🙏 💪 👌 ✌️ 🤞 🤝 👋 🤙 ☝️ 👆 👇 👉 👈 ✋ 🤚 🫶 🤟 🤘 🫂 👀 🧠 🫵".split(" ") },
  { id: "simbolos", icon: "❤️", name: "Corazones y símbolos", list: "❤️ 🧡 💛 💚 💙 💜 🖤 🤍 💔 ❤️‍🔥 💯 ✨ 🔥 ⭐ 🌟 💥 🎉 🎊 🏆 🥇 ✅ ❌ ⚠️ ❓ ❗ 💬 💤 🚀".split(" ") },
  { id: "estudio", icon: "📚", name: "Estudio y vida", list: "📚 📖 📝 ✏️ 🧮 💻 ⌨️ 🖥️ 🔬 🧪 📐 📏 🎓 💡 ⏰ 📅 ☕ 🍕 🍔 🍟 🥤 🍿 🎧 🎮 ⚽ 🏀 🌎 🌴 ☀️ 🌧️ 🐶 🐱 🎂 🎁".split(" ") },
];
const RECENT_KEY = "malla_emoji_recent";
const readRecent = () => { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]").slice(0, 24); } catch { return []; } };
const pushRecent = (e) => { try { localStorage.setItem(RECENT_KEY, JSON.stringify([e, ...readRecent().filter(x => x !== e)].slice(0, 24))); } catch { /* nada */ } };

const clock = (ms) => new Date(ms).toLocaleTimeString("es-DO", { hour: "numeric", minute: "2-digit" });
const stamp = (ms) => {
  const d = new Date(ms), now = new Date();
  return d.toDateString() === now.toDateString() ? clock(ms) : `${d.toLocaleDateString("es-DO", { day: "numeric", month: "short" })} ${clock(ms)}`;
};
const ICON_SEND = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4z"/></svg>';
const ICON_CHAT = '<svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/></svg>';

/** Ventana del perfil de otra persona (se crea una sola vez, sirve para cualquier página). */
function ensureProfileModal() {
  if (document.getElementById("chat-profile-overlay")) return;
  document.body.insertAdjacentHTML("beforeend", `
    <div class="modal-overlay hidden" id="chat-profile-overlay">
      <div class="card modal-box" role="dialog" aria-modal="true" aria-label="Perfil" style="max-width:400px">
        <div class="modal-head"><h3>Perfil</h3>
          <button class="icon-btn" data-modal-close title="Cerrar" aria-label="Cerrar perfil"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
        </div>
        <div class="pcard" id="chat-pcard"></div>
      </div>
    </div>`);
}

export function createChat({ root, me, isVisible = () => true, onUnread = () => {}, onRoomChange = () => {}, onLive = () => {} }) {
  ensureProfileModal();
  const career = PENSUMS[me.career];
  const ROOMS = {
    general: { name: "general", label: "General", ping: pingId("general"), msgs: new Map(), last: 0, since: 0, unread: 0, loaded: false, more: false, epoch: undefined, loadingOlder: false },
    carrera: { name: "carrera", label: career ? career.key : "Mi carrera", ping: pingId("carrera", me.career), msgs: new Map(), last: 0, since: 0, unread: 0, loaded: false, more: false, epoch: undefined, loadingOlder: false },
  };
  let active = "general";
  let live = false;
  let stopLive = null, timer = null, destroyed = false, warnTimer = null;
  const busy = { general: false, carrera: false };
  const dirty = { general: false, carrera: false }; // llegó un aviso mientras se actualizaba: se vuelve a pedir al terminar
  const blockedPids = new Set();
  const social = { friends: [], incoming: [], outgoing: [], groups: [], unread: 0, loaded: false, groupsLoaded: false };
  const dir = { career: me.career, q: "", people: [], careers: [], more: false, offset: 0, loading: false, loaded: false, again: false };
  let ptab = "directorio", qTimer = null, stopInbox = null, profileCache = null, ginfoGid = 0, stopGroups = null, groupKey = "";

  root.classList.add("cc-root");
  root.innerHTML = `
    <div class="chat-top">
      <strong class="chat-top-title">Chats</strong>
      <button type="button" class="chat-topbtn" data-go="people">Estudiantes <i class="chat-tab-dot hidden"></i></button>
      <button type="button" class="chat-topbtn is-main" data-go="new">＋ Grupo</button>
    </div>
    <div class="chat-perm" hidden></div>
    <div class="chat-dmbar"><button type="button" class="chat-back" aria-label="Volver">‹</button><span class="chat-dmwho"></span></div>
    <p class="chat-note"></p>
    ${me.admin ? `<details class="chat-admin"><summary>Moderación</summary>
      <h4>Mensajes reportados</h4><ul class="chat-reports"></ul>
      <h4>Equipo de moderación</h4><ul class="chat-mods"></ul>
      <h4>Vaciar chats</h4>
      <div class="chat-wipe"><button type="button" class="btn btn-ghost btn-sm" data-wipe="general">Vaciar General</button><button type="button" class="btn btn-ghost btn-sm" data-wipe="carrera">Vaciar mi carrera</button>${me.owner ? '<button type="button" class="btn btn-ghost btn-sm" data-wipe="all">Vaciar todo</button>' : ""}</div>
      <p class="chat-hint">Borra los mensajes de forma definitiva. Los chats privados no se tocan.</p>
      ${me.owner ? '<p class="chat-hint">Para nombrar a alguien moderador, ábrele el perfil (en Estudiantes → Ver estudiantes) y toca «Nombrar moderador». Ahí mismo está «Eliminar usuario» para borrar a alguien por completo.</p>' : ""}
    </details>` : ""}
    <div class="chat-home"></div>
    <div class="chat-people"><div class="pp-tabs" role="tablist" aria-label="Personas"></div><div class="pp-body"></div></div>
    <div class="chat-new"></div>
    <div class="chat-ginfo"></div>
    <div class="chat-stage">
      <div class="chat-list" role="log" aria-live="polite" aria-label="Mensajes"></div>
      <button type="button" class="chat-jump hidden">↓ Mensajes nuevos</button>
      <button type="button" class="chat-down hidden" aria-label="Ir al último mensaje" title="Ir al último mensaje"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button>
    </div>
    <div class="chat-warn hidden" role="alert"></div>
    <div class="chat-err" role="alert"></div>
    <div class="chat-emoji" hidden>
      <div class="emo-tabs" role="tablist" aria-label="Categorías de emojis"></div>
      <div class="emo-grid" role="listbox" aria-label="Emojis"></div>
    </div>
    <form class="chat-compose">
      <button type="button" class="chat-emoji-btn" aria-label="Elegir emoji" aria-expanded="false" title="Emojis">😊</button>
      <textarea rows="1" maxlength="500" placeholder="Escribe un mensaje…" aria-label="Mensaje" enterkeyhint="send" autocomplete="off"></textarea>
      <button type="submit" class="chat-send" aria-label="Enviar mensaje">${ICON_SEND}</button>
    </form>
    <div class="chat-toast" role="status" aria-live="polite" hidden></div>`;
  const $ = (sel) => root.querySelector(sel);
  const list = $(".chat-list"), ta = $("textarea"), errBox = $(".chat-err"), note = $(".chat-note"), jump = $(".chat-jump"), down = $(".chat-down"), warn = $(".chat-warn");
  const dmbar = $(".chat-dmbar"), dmwho = $(".chat-dmwho"), peopleEl = $(".chat-people"), homeEl = $(".chat-home"), newEl = $(".chat-new"), ginfoEl = $(".chat-ginfo");
  const setErr = (m) => { errBox.textContent = m || ""; };
  let toastTimer = null, emoSet = "caras";
  const emoEl = $(".chat-emoji"), emoBtn = $(".chat-emoji-btn");
  function paintEmoji() {
    const sets = EMOJI_SETS.map(s => (s.id === "recent" ? { ...s, list: readRecent() } : s));
    if (emoSet === "recent" && !sets[0].list.length) emoSet = "caras";
    $(".emo-tabs").innerHTML = sets.filter(s => s.id !== "recent" || s.list.length).map(s => `<button type="button" class="emo-tab" role="tab" data-emo-set="${s.id}" aria-selected="${s.id === emoSet}" title="${esc(s.name)}">${s.icon}</button>`).join("");
    $(".emo-grid").innerHTML = sets.find(s => s.id === emoSet).list.map(e => `<button type="button" class="emo" data-emo="${e}" role="option" aria-label="${e}">${e}</button>`).join("");
  }
  const toggleEmoji = (open = emoEl.hidden) => { emoEl.hidden = !open; emoBtn.setAttribute("aria-expanded", String(open)); if (open) paintEmoji(); };
  function insertEmoji(e) {
    if (ta.value.length + e.length > 500) return setErr("Máximo 500 caracteres.");
    const a = ta.selectionStart ?? ta.value.length, b = ta.selectionEnd ?? a;
    ta.setRangeText(e, a, b, "end");
    ta.dispatchEvent(new Event("input"));
    pushRecent(e);
    if (!matchMedia("(pointer: coarse)").matches) ta.focus(); // en el teléfono no se vuelve a abrir el teclado
  }
  const toast = (t) => { const el = $(".chat-toast"); if (!el) return; el.textContent = t; el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 2400); }; // confirma cada acción (visibilidad del estado del sistema)
  const nearBottom = (px = 90) => list.scrollHeight - list.scrollTop - list.clientHeight < px;
  const toBottom = () => { list.scrollTop = list.scrollHeight; jump.classList.add("hidden"); down.classList.add("hidden"); };

  /** Aviso amable cuando el servidor enmascaró palabras. */
  function showWarn(text) {
    warn.innerHTML = `<span aria-hidden="true">⚠️</span><span>${esc(text)}</span>`;
    warn.classList.remove("hidden");
    clearTimeout(warnTimer);
    warnTimer = setTimeout(() => warn.classList.add("hidden"), 10000);
  }

  /* ---------- presencia y avatares ---------- */
  const ago = (ms) => { const m = Math.max(0, Math.round((serverNow() - ms) / 60000)); return m < 2 ? "hace un momento" : m < 60 ? `hace ${m} min` : m < 1440 ? `hace ${Math.round(m / 60)} h` : `hace ${Math.round(m / 1440)} d`; };
  /* Una sola regla de presencia para toda la app: en línea = visto hace menos de 2 minutos (según el reloj del servidor). */
  const isOnline = (p) => !!p && !!p.seen && serverNow() - p.seen < 120000;
  const presenceText = (p) => isOnline(p) ? "En línea" : p && p.seen ? `Activo ${ago(p.seen)}` : "";
  const avDot = (p, size) => `<span class="av-wrap">${framedAvatar(p.avatar, p.avatarBg, p.frame, size)}${isOnline(p) ? '<i class="on-dot" title="En línea"></i>' : ""}</span>`;
  const groupAv = (name, size) => { let h = 0; for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) % 360; return `<span class="gav" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.42)}px;background:hsl(${h},52%,42%)">${esc((String(name).trim()[0] || "G").toUpperCase())}</span>`; };
  const pubAv = (txt, size) => `<span class="gav is-pub" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.46)}px">${txt}</span>`;

  /* ---------- dibujo ---------- */
  const modHere = () => { const r = ROOMS[active]; return !r ? false : r.group ? r.myRole === "admin" : r.dm ? false : me.admin; }; // en cada grupo mandan sus propios administradores
  const modPublic = () => me.admin && !ROOMS[active]?.priv;
  const sigOf = (m) => `${m.hidden || ""}|${m.edited || ""}`;
  const canEdit = (m) => m.pid === me.pid && !m.hidden && Date.now() - m.at < EDIT_MS;
  const msgHtml = (m) => {
    const mine = m.pid === me.pid;
    const c = PENSUMS[m.career]?.key || m.career || "";
    const gone = !!m.hidden;
    const goneText = m.hidden === "mod" ? "🛡️ Mensaje ocultado por un moderador" : "🚫 Mensaje borrado";
    const body = gone
      ? `<p class="msg-text msg-gone"${m.adminText ? ` title="${esc("Texto original (solo lo ves tú, moderador): " + m.adminText)}"` : ""}>${goneText}</p>`
      : `<p class="msg-text${/^(?:\p{Extended_Pictographic}[\uFE0F\u200D\p{Extended_Pictographic}\u{1F3FB}-\u{1F3FF}]*\s*){1,3}$/u.test(m.text) ? " is-emoji" : ""}">${esc(m.text)}</p>`;
    const actions = gone
      ? (modPublic() && m.hidden === "mod" ? `<button type="button" class="msg-act" data-restore="${m.id}">Restaurar</button>` : "")
      : `${canEdit(m) ? `<button type="button" class="msg-act" data-edit="${m.id}">Editar</button>` : ""}
         ${mine || modHere() ? `<button type="button" class="msg-act" data-del="${m.id}">${mine ? "Borrar" : "Ocultar"}</button>` : ""}
         ${mine ? "" : `<button type="button" class="msg-act" data-report="${m.id}">Reportar</button>`}`;
    return `<article class="msg ${mine ? "is-me" : "is-other"}${gone ? " is-gone" : ""}" data-id="${m.id}" data-pid="${esc(m.pid)}" data-at="${m.at}" data-sig="${esc(sigOf(m))}">
      ${mine ? "" : `<button type="button" class="msg-av${isOnline({ seen: ROOMS[active]?.seen?.[m.pid] }) ? " is-on" : ""}" data-profile="${esc(m.pid)}" aria-label="Ver perfil de ${esc(m.name)}">${framedAvatar(m.avatar, m.avatarBg, m.frame, 34)}</button>`}
      <div class="msg-main">
        ${mine ? "" : `<div class="msg-head"><button type="button" class="msg-name" data-profile="${esc(m.pid)}">${esc(m.name || "Estudiante")}</button><span class="msg-career">${esc(c)}</span>${roleChip(m.role)}</div>`}
        <div class="msg-bubble">${body}<span class="msg-time" title="${esc(stamp(m.at))}">${esc(clock(m.at))}${m.edited && !gone ? " · editado" : ""}</span></div>
        <div class="msg-actions">${actions}</div>
      </div></article>`;
  };

  /** Junta los mensajes seguidos de la misma persona (sin repetir foto y nombre). */
  function regroup() {
    let prev = null;
    list.querySelectorAll(".msg").forEach((el) => {
      const cont = prev && prev.dataset.pid === el.dataset.pid && Number(el.dataset.at) - Number(prev.dataset.at) < GROUP_MS;
      el.classList.toggle("is-cont", !!cont);
      prev = el;
    });
  }

  /** Pone en pantalla la sala activa: agrega lo nuevo y quita lo borrado, sin parpadeos. */
  function paint() {
    const st = ROOMS[active];
    if (!st) return; // la vista "Personas" no tiene mensajes
    const atBottom = nearBottom();
    const have = new Map([...list.querySelectorAll(".msg")].map(el => [Number(el.dataset.id), el]));
    have.forEach((el, id) => { if (!st.msgs.has(id)) el.remove(); });
    // encabezado del historial: invita a subir o marca el inicio de la conversación
    let head = list.querySelector(".chat-start");
    if (st.msgs.size) {
      if (!head) { list.insertAdjacentHTML("afterbegin", '<div class="chat-start"></div>'); head = list.querySelector(".chat-start"); }
      head.textContent = st.loadingOlder ? "Cargando mensajes anteriores…" : st.more ? "↑ Sube para ver mensajes anteriores" : "Inicio de la conversación";
    } else head?.remove();
    let appended = null, prevEl = head || null;
    for (const m of [...st.msgs.values()].sort((a, b) => a.id - b.id)) {
      let el = have.get(m.id);
      if (!el) {
        const html = msgHtml(m);
        if (prevEl) prevEl.insertAdjacentHTML("afterend", html); else list.insertAdjacentHTML("afterbegin", html);
        el = list.querySelector(`.msg[data-id="${m.id}"]`);
        el.classList.add("is-new"); // entrada suave solo para lo que aparece por primera vez (no al redibujar)
        if (!el.nextElementSibling) appended = m; // quedó al final: es un mensaje nuevo (no historial)
      } else if (el.dataset.sig !== sigOf(m)) { // cambió (editado, borrado, ocultado o restaurado): se vuelve a dibujar en su sitio
        const open = el.classList.contains("is-open");
        el.outerHTML = msgHtml(m);
        el = list.querySelector(`.msg[data-id="${m.id}"]`);
        if (open) el.classList.add("is-open");
      }
      prevEl = el;
    }
    const empty = list.querySelector(".chat-empty");
    if (!st.msgs.size) {
      if (!empty) list.innerHTML = `<div class="chat-empty">${ICON_CHAT}<strong>${st.group ? "Grupo nuevo" : st.dm ? "Chat privado" : active === "general" ? "Aún no hay mensajes" : "Sala de tu carrera"}</strong><span>${st.group ? "Escribe el primer mensaje del grupo." : st.dm ? `Aquí solo escriben tú y ${esc(st.peer.name)}. ¡Saluda!` : active === "general" ? "Sé la primera persona en escribir." : "Solo estudiantes de tu carrera pueden verla. ¡Rompe el hielo!"}</span></div>`;
    } else if (empty) empty.remove();
    regroup();
    if (appended) {
      if (atBottom || !have.size || appended.pid === me.pid) toBottom();
      else jump.classList.remove("hidden");
    }
  }

  const groupUnread = () => social.groups.reduce((n, g) => n + (isMuted("g:" + g.id) ? 0 : g.unread || 0), 0);
  const socialAlerts = () => social.unread + groupUnread() + social.incoming.length; // privados y grupos sin leer + solicitudes por responder
  const totalUnread = () => (isMuted("general") ? 0 : ROOMS.general.unread) + (isMuted("carrera") ? 0 : ROOMS.carrera.unread) + socialAlerts();
  function paintBadges() {
    root.querySelector('[data-go="people"] .chat-tab-dot')?.classList.toggle("hidden", !social.incoming.length);
    onUnread(totalUnread());
    if (active === "home") renderHome();
  }

  /* ---------- datos ---------- */
  async function fetchRoom(name) {
    const st = ROOMS[name];
    if (destroyed) return;
    if (busy[name]) { dirty[name] = true; return; } // había una actualización en curso: se repite al terminar (antes el aviso se perdía)
    busy[name] = true;
    const firstLoad = st.last === 0;
    try {
      const askOn = !st.onlineAt || Date.now() - st.onlineAt > 15000;
      const r = await api("GET", `/api/chat?room=${name}&after=${st.last}&since=${st.since}${askOn ? "&on=1" : ""}`);
      if (r.status === 401) { location.href = "index.html"; return; }
      if (st.priv && (r.status === 400 || r.status === 410)) { // ya no son amigos / ya no estás en el grupo: se vuelve a la lista de chats
        delete ROOMS[name];
        if (active === name) { setRoom("home"); setErr(r.status === 410 ? "Usuario eliminado" : st.group ? "Ya no estás en ese grupo." : "Ya no puedes chatear con esa persona."); }
        loadSocial(); loadGroups();
        return;
      }
      if (r.status !== 200 || !r.data?.ok) { if (!st.loaded) setErr("No se pudieron cargar los mensajes."); return; }
      const d = r.data;
      // se borró todo el chat (marca de reinicio distinta): se limpia la sala y se carga de cero
      if (st.epoch !== undefined && d.epoch !== undefined && d.epoch !== st.epoch) {
        st.epoch = d.epoch; st.msgs.clear(); st.last = 0; st.since = 0; st.loaded = false; st.unread = 0; st.more = false;
        if (name === active) { list.innerHTML = ""; paint(); }
        paintBadges();
        dirty[name] = true;
        return;
      }
      st.epoch = d.epoch;
      if (d.seen) { st.seen = d.seen; st.onlineAt = Date.now(); }
      if (firstLoad) st.more = !!d.more;
      // mensajes que ya tenías y cambiaron: ahora se ven como "borrado/ocultado" o con su texto editado
      for (const m of [...(d.hiddenNow || []), ...(d.edited || [])]) {
        if (st.msgs.has(m.id) && !blockedPids.has(m.pid)) st.msgs.set(m.id, m);
      }
      const visibleNow = name === active && isVisible();
      const fresh = [];
      for (const m of d.messages) {
        if (st.msgs.has(m.id) || blockedPids.has(m.pid)) { st.last = Math.max(st.last, m.id); continue; }
        st.msgs.set(m.id, m);
        st.last = Math.max(st.last, m.id);
        if (st.loaded && m.pid !== me.pid && !m.hidden) { fresh.push(m); if (!visibleNow && !st.priv) st.unread++; }
      }
      if (st.msgs.size > MAX_KEEP && nearBottom()) { const ids = [...st.msgs.keys()].sort((a, b) => a - b); ids.slice(0, st.msgs.size - MAX_KEEP).forEach(id => st.msgs.delete(id)); st.more = true; }
      st.since = Math.max(0, (d.now || Date.now()) - 4000);
      st.loaded = true;
      setErr("");
      if (name === active) { paint(); paintOnline(); }
      paintBadges();
      if (st.priv && name === active && isVisible()) {
        const f = st.dm ? social.friends.find(x => x.pid === st.peer.pid) : social.groups.find(x => x.id === st.gid);
        if ((f && f.unread) || fresh.length) markRoomRead(st);
      }
      if (fresh.length) { // alguien escribió: sonido leve y, con la pestaña oculta, aviso del navegador
        playPing(false, name);
        const last = fresh[fresh.length - 1];
        desktopNotify(`${last.name || "Comunidad"} · ${st.label}`, last.text, name);
      }
    } catch {
      if (!st.loaded) setErr("Sin conexión. Reintentando…");
    } finally {
      busy[name] = false;
      if (dirty[name]) { dirty[name] = false; fetchRoom(name); }
    }
  }

  /** Pone o quita el puntito verde de quienes escriben, según quién está en línea ahora. */
  function paintOnline() {
    const seen = ROOMS[active]?.seen;
    list.querySelectorAll(".msg-av").forEach(b => b.classList.toggle("is-on", !!seen && isOnline({ seen: seen[b.dataset.profile] })));
  }

  /** Al subir con el scroll se cargan mensajes más antiguos (de 40 en 40). */
  async function loadOlder() {
    const st = ROOMS[active];
    if (!st.more || st.loadingOlder || !st.msgs.size || destroyed) return;
    const name = active;
    st.loadingOlder = true;
    paint();
    try {
      const minId = Math.min(...st.msgs.keys());
      const r = await api("GET", `/api/chat?room=${name}&before=${minId}`);
      if (r.status !== 200 || !r.data?.ok) return;
      const d = r.data;
      if (st.epoch !== undefined && d.epoch !== undefined && d.epoch !== st.epoch) { dirty[name] = true; fetchRoom(name); return; }
      const prevH = list.scrollHeight, prevTop = list.scrollTop;
      for (const m of d.messages) if (!st.msgs.has(m.id) && !blockedPids.has(m.pid)) st.msgs.set(m.id, m);
      st.more = !!d.more;
      st.loadingOlder = false;
      if (name === active) { paint(); list.scrollTop = prevTop + (list.scrollHeight - prevH); } // se queda donde estabas leyendo
    } catch { /* se reintenta al volver a subir */ }
    finally { st.loadingOlder = false; if (name === active) paint(); }
  }
  const refreshAll = () => Promise.all([fetchRoom("general"), fetchRoom("carrera"), loadSocial(), loadGroups(), ROOMS[active]?.priv ? fetchRoom(active) : null]);

  /* ---------- personas: amigos, solicitudes y directorio ---------- */
  const sumUnread = () => { social.unread = social.friends.reduce((n, f) => n + (isMuted("dm:" + f.pid) ? 0 : f.unread || 0), 0); };
  async function loadSocial() {
    if (destroyed) return;
    try {
      const r = await api("GET", "/api/friends");
      if (r.status !== 200 || !r.data?.ok) return;
      const d = r.data;
      const before = new Map(social.friends.map(f => [f.pid, f.unread || 0]));
      const reqBefore = social.incoming.length;
      const activePid = active.startsWith("dm:") && isVisible() ? active.slice(3) : null;
      social.friends = d.friends; social.incoming = d.incoming; social.outgoing = d.outgoing;
      sumUnread();
      const was = social.loaded; social.loaded = true;
      if (was) { // algo nuevo: sonido leve y, con la pestaña oculta, aviso del navegador
        const gain = social.friends.find(f => f.pid !== activePid && (f.unread || 0) > (before.get(f.pid) || 0));
        if (gain) { playPing(false, "dm:" + gain.pid); desktopNotify(`${gain.name} · mensaje privado`, "Tienes un mensaje nuevo", "dm:" + gain.pid); }
        else if (social.incoming.length > reqBefore) { playPing(); desktopNotify("Solicitud de amistad", `${social.incoming[0].name} quiere ser tu amigo`); }
      }
      paintBadges();
      refreshPeopleView();
      if (ROOMS[active]?.dm) paintHead();
    } catch { /* se reintenta con el sondeo */ }
  }
  async function markRead(pid) {
    const f = social.friends.find(x => x.pid === pid);
    if (f && f.unread) { f.unread = 0; sumUnread(); paintBadges(); }
    api("POST", "/api/dm/read", { pid }).catch(() => {});
  }
  const findPerson = (pid) => [...social.friends, ...social.incoming, ...social.outgoing, ...dir.people].find(p => p.pid === pid);

  async function loadDir(reset) {
    if (destroyed) return;
    if (dir.loading) { if (reset) dir.again = true; return; }
    dir.loading = true;
    if (reset) { dir.offset = 0; dir.people = []; dir.more = false; }
    renderDirList();
    try {
      const r = await api("GET", `/api/people?career=${encodeURIComponent(dir.career)}&q=${encodeURIComponent(dir.q)}&offset=${dir.offset}`);
      if (r.status === 200 && r.data?.ok) {
        const known = new Set(dir.people.map(p => p.pid));
        for (const p of r.data.people) if (!known.has(p.pid)) dir.people.push(p);
        dir.more = !!r.data.more; dir.offset += 60; dir.loaded = true;
        const changed = JSON.stringify(dir.careers) !== JSON.stringify(r.data.careers);
        dir.careers = r.data.careers;
        if (changed) fillCareerSelect();
      } else setErr("No se pudo cargar el directorio.");
    } catch { setErr("Sin conexión."); }
    finally {
      dir.loading = false;
      if (dir.again) { dir.again = false; loadDir(true); return; }
      renderDirList();
    }
  }

  /** Actualiza solo la presencia de la primera página del listado, sin recargarlo ni moverlo. */
  async function refreshDirPresence() {
    if (dir.loading || !dir.people.length) return;
    const r = await api("GET", `/api/people?career=${encodeURIComponent(dir.career)}&q=${encodeURIComponent(dir.q)}&offset=0`).catch(() => null);
    if (!r || r.status !== 200 || !r.data?.ok) return;
    const fresh = new Map(r.data.people.map(p => [p.pid, p]));
    for (const p of dir.people) { const f = fresh.get(p.pid); if (f) { p.seen = f.seen; p.rel = f.rel; } }
    if (active === "people" && ptab === "directorio") renderDirList();
  }
  const relActs = (p) => p.rel === "friend" ? `<button type="button" class="btn btn-primary btn-sm" data-dm="${esc(p.pid)}">Mensaje</button>`
    : p.rel === "sent" ? `<button type="button" class="btn btn-ghost btn-sm" data-fa="cancel" data-pid="${esc(p.pid)}" title="Cancelar la solicitud">Enviada ✓</button>`
    : p.rel === "received" ? `<button type="button" class="btn btn-primary btn-sm" data-fa="accept" data-pid="${esc(p.pid)}">Aceptar</button><button type="button" class="btn btn-ghost btn-sm" data-fa="decline" data-pid="${esc(p.pid)}" aria-label="Rechazar">✕</button>`
    : `<button type="button" class="btn btn-primary btn-sm" data-fa="request" data-pid="${esc(p.pid)}">Agregar</button>`;
  const personRow = (p, acts, extra = "") => { if (p.pid === me.pid) acts = ""; return `<div class="pp-row">
    <button type="button" class="pp-av" data-profile="${esc(p.pid)}" aria-label="Ver perfil de ${esc(p.name)}">${avDot(p, 42)}</button>
    <div class="pp-info"><button type="button" class="pp-name" data-profile="${esc(p.pid)}">${esc(p.name || "Estudiante")}</button>
      <span class="pp-sub"><span class="msg-career">${esc(PENSUMS[p.career]?.key || p.career || "")}</span>${roleChip(p.role)}${isOnline(p) ? '<span class="pp-on">● En línea</span>' : ""}</span></div>
    ${extra}<div class="pp-acts">${acts}</div></div>`; };

  function renderPpTabs() {
    const items = [["directorio", "Ver estudiantes", 0], ["amigos", "Amigos", 0], ["solicitudes", "Solicitudes", social.incoming.length]];
    $(".pp-tabs").innerHTML = items.map(([k, l, n]) => `<button type="button" class="pp-tab" role="tab" data-pt="${k}" aria-selected="${ptab === k}">${l}${n ? `<b class="pp-n">${n > 99 ? "99+" : n}</b>` : ""}</button>`).join("");
  }
  function fillCareerSelect() {
    const sel = peopleEl.querySelector(".pp-career");
    if (!sel) return;
    const n = new Map(dir.careers.map(c => [c.career, c.n]));
    sel.innerHTML = `<option value="all">Todas las carreras</option>` + Object.keys(PENSUMS).map(k => `<option value="${k}">${esc(PENSUMS[k].nombre)}${n.get(k) ? ` (${n.get(k)})` : ""}</option>`).join("");
    sel.value = dir.career;
  }
  function renderDirList() {
    const el = peopleEl.querySelector(".pp-dirlist");
    if (!el) return;
    if (!dir.people.length) {
      el.innerHTML = dir.loading ? skelRows(6, "Buscando estudiantes…") : `<p class="pp-empty">${dir.q ? "Nadie coincide con esa búsqueda." : "Aún no hay nadie visible en esta carrera."}</p>`;
      return;
    }
    let last = null, html = "";
    for (const p of dir.people) {
      if (dir.career === "all" && p.career !== last) { last = p.career; html += `<h4 class="pp-group">${esc(PENSUMS[p.career]?.nombre || p.career || "")}</h4>`; }
      html += personRow(p, relActs(p));
    }
    if (dir.more) html += `<button type="button" class="btn btn-ghost pp-more" data-more="1">${dir.loading ? "Cargando…" : "Ver más"}</button>`;
    el.innerHTML = html;
  }
  function renderPpBody() {
    const body = peopleEl.querySelector(".pp-body");
    if (ptab === "amigos") {
      body.innerHTML = social.friends.length
        ? social.friends.map(f => personRow(f, `<button type="button" class="btn btn-primary btn-sm" data-dm="${esc(f.pid)}">Mensaje</button>`, f.unread ? `<b class="pp-unread" aria-label="${f.unread} sin leer">${f.unread > 99 ? "99+" : f.unread}</b>` : "")).join("")
        : `<p class="pp-empty">${social.loaded ? "Aún no tienes amigos. Búscalos en <b>Ver estudiantes</b> y envíales una solicitud." : "Cargando…"}</p>`;
    } else if (ptab === "solicitudes") {
      const inc = social.incoming.map(p => personRow(p, relActs(p))).join("");
      const out = social.outgoing.map(p => personRow(p, relActs(p))).join("");
      body.innerHTML = (inc ? `<h4 class="pp-group">Recibidas</h4>${inc}` : "") + (out ? `<h4 class="pp-group">Enviadas</h4>${out}` : "") || '<p class="pp-empty">No tienes solicitudes pendientes.</p>';
    } else {
      body.innerHTML = `<div class="pp-dirbar"><select class="pp-career" aria-label="Carrera"></select><input class="pp-q" type="search" autocomplete="off" enterkeyhint="search" maxlength="40" placeholder="Buscar por nombre…" value="${esc(dir.q)}" aria-label="Buscar personas"></div>
        <div class="pp-dirlist"></div>
        <p class="chat-hint">Aquí aparecen los estudiantes que no se ocultaron. Puedes ocultarte desde Configuración.</p>`;
      fillCareerSelect();
      renderDirList();
    }
  }
  function renderPeople() { renderPpTabs(); renderPpBody(); }
  function refreshPeopleView() {
    if (active !== "people") return;
    renderPpTabs();
    if (ptab === "directorio") renderDirList(); else renderPpBody();
  }

  async function friendAction(action, pid) {
    if (pid === me.pid) return null; // no tiene sentido enviarte solicitudes ni cambiarte nada a ti mismo
    const r = await api("POST", "/api/friends", { action, pid }).catch(() => null);
    if (!r || r.status !== 200 || !r.data?.ok) { setErr(r?.data?.message || "No se pudo completar la acción."); refreshPeopleView(); return null; }
    setErr("");
    toast({ request: "Solicitud enviada ✓", accept: "¡Ahora son amigos! ✓", decline: "Solicitud rechazada", cancel: "Solicitud cancelada", remove: "Amistad eliminada" }[action] || "Listo ✓");
    pingInbox(pid); // la otra persona se entera al instante
    const p = dir.people.find(x => x.pid === pid);
    if (p) p.rel = r.data.rel;
    if (action === "remove") delete ROOMS["dm:" + pid];
    await loadSocial();
    refreshPeopleView();
    return r.data.rel;
  }
  function openDm(pid, info = {}) {
    const key = "dm:" + pid;
    const p = findPerson(pid) || {};
    const peer = { pid, name: info.name || p.name || "Chat privado", avatar: info.avatar ?? p.avatar ?? null, avatarBg: info.avatarBg ?? p.avatarBg ?? null, frame: info.frame ?? p.frame ?? null };
    if (!ROOMS[key]) ROOMS[key] = { name: key, dm: true, priv: true, label: peer.name, peer, ping: null, msgs: new Map(), last: 0, since: 0, unread: 0, loaded: false, more: false, epoch: undefined, loadingOlder: false };
    closeModal("chat-profile-overlay");
    setRoom(key);
  }
  const pingRoom = (st) => { if (st.dm) pingInbox(st.peer.pid); else ping(st.ping); };

  function markRoomRead(st) {
    if (st.dm) return markRead(st.peer.pid);
    const g = social.groups.find(x => x.id === st.gid);
    if (g && g.unread) { g.unread = 0; paintBadges(); }
    api("POST", "/api/groups", { action: "read", id: st.gid }).catch(() => {});
  }
  async function resubGroups() { // escucha los avisos de cada grupo en el que estás
    const ids = social.groups.map(g => "g_" + g.id).sort();
    const key = ids.join(",");
    if (key === groupKey) return;
    groupKey = key;
    stopGroups?.(); stopGroups = null;
    if (!ids.length) return;
    const h = await subscribe(ids, (id) => { const k = "g:" + id.slice(2); if (ROOMS[k]) fetchRoom(k); loadGroups(); }, () => {});
    if (destroyed || key !== groupKey) h.stop(); else stopGroups = h.stop;
  }
  async function loadGroups() {
    if (destroyed) return;
    try {
      const r = await api("GET", "/api/groups");
      if (r.status !== 200 || !r.data?.ok) return;
      const before = new Map(social.groups.map(g => [g.id, g.unread || 0]));
      const activeGid = ROOMS[active]?.group && isVisible() ? ROOMS[active].gid : null;
      social.groups = r.data.groups;
      for (const g of social.groups) { const st = ROOMS["g:" + g.id]; if (st) { st.myRole = g.role; st.label = g.name; } }
      for (const k of Object.keys(ROOMS)) if (ROOMS[k].group && !social.groups.some(g => "g:" + g.id === k)) { delete ROOMS[k]; if (active === k || (active === "ginfo" && "g:" + ginfoGid === k)) setRoom("home"); }
      const was = social.groupsLoaded; social.groupsLoaded = true;
      if (was) {
        const gain = social.groups.find(g => g.id !== activeGid && (g.unread || 0) > (before.get(g.id) || 0));
        if (gain) { playPing(false, "g:" + gain.id); desktopNotify(`${gain.name} · grupo`, "Tienes un mensaje nuevo", "g:" + gain.id); }
      }
      paintBadges();
      refreshPeopleView();
      if (ROOMS[active]?.group) paintHead();
      resubGroups();
    } catch { /* se reintenta con el sondeo */ }
  }
  function openGroup(gid, name) {
    const key = "g:" + gid;
    const g = social.groups.find(x => x.id === gid);
    if (!ROOMS[key]) ROOMS[key] = { name: key, group: true, priv: true, gid, label: name || (g && g.name) || "Grupo", myRole: g ? g.role : "member", ping: "g_" + gid, msgs: new Map(), last: 0, since: 0, unread: 0, loaded: false, more: false, epoch: undefined, loadingOlder: false };
    setRoom(key);
  }
  function openKey(key) {
    if (key.startsWith("dm:")) return openDm(key.slice(3));
    if (key.startsWith("g:")) return openGroup(Number(key.slice(2)));
    setRoom(key);
  }

  /** Lista de chats tipo Messenger: General, tu carrera, tus grupos y tus amigos. */
  const unreadBadge = (n, key) => (n ? `<b class="pp-unread${isMuted(key) ? " is-muted" : ""}">${n > 99 ? "99+" : n}</b>` : "");
  function renderHome() {
    const pub = [
      { key: "general", name: "General", sub: "Todos los estudiantes", av: pubAv("🌎", 46), unread: ROOMS.general.unread },
      { key: "carrera", name: career ? career.nombre : "Mi carrera", sub: "Solo tu carrera", av: pubAv("🎓", 46), unread: ROOMS.carrera.unread },
    ];
    const conv = [
      ...social.groups.map(g => ({ key: "g:" + g.id, name: g.name, sub: `Grupo · ${g.n} miembro${g.n === 1 ? "" : "s"}${g.role === "admin" ? " · Admin" : ""}`, av: groupAv(g.name, 46), unread: g.unread, at: g.lastAt })),
      ...social.friends.map(f => ({ key: "dm:" + f.pid, name: f.name, sub: presenceText(f) || PENSUMS[f.career]?.key || "", av: avDot(f, 46), unread: f.unread, at: f.lastAt || 0 })),
    ].sort((a, b) => b.at - a.at || a.name.localeCompare(b.name));
    const row = (c) => `<button type="button" class="hm-row" data-open="${esc(c.key)}">${c.av}<span class="hm-txt"><strong>${esc(c.name)}</strong><small>${esc(c.sub)}</small></span>${isMuted(c.key) ? '<span class="hm-mute" title="Silenciado">🔕</span>' : ""}${unreadBadge(c.unread, c.key)}</button>`;
    homeEl.innerHTML = `<div class="hm-list">${[...pub, ...conv].map(row).join("")}${conv.length ? "" : '<p class="pp-empty">Aquí aparecerán tus chats privados y tus grupos. Entra a <b>Estudiantes</b> para agregar amigos.</p>'}<a class="hm-help" href="https://wa.me/18296422334?text=Hey%2C%20vengo%20del%20proyecto%20Malla%20UTESA%20y%20me%20gustar%C3%ADa%20reportar%20o%20sugerir%20algo%3A%20" target="_blank" rel="noopener noreferrer"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.500-.7-1.700-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.700 6.700 0 0 1-3.300-2.900c-.2-.4.2-.4.700-1.300.1-.2 0-.3 0-.4l-.8-1.800c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.200 5.100 5.100 0 0 0 1.100 2.700 11.700 11.700 0 0 0 4.500 4c1.700.7 2.300.8 3.200.7a2.700 2.700 0 0 0 1.800-1.300 2.200 2.200 0 0 0 .2-1.300c-.1-.1-.3-.2-.5-.3z"/></svg><span>¿Un error o una sugerencia? Escríbenos por WhatsApp</span></a></div>`;
  }

  function renderNew() {
    newEl.innerHTML = social.friends.length
      ? `<label class="nw-label">Nombre del grupo<input class="nw-name" maxlength="40" placeholder="Ej.: Estudio de Cálculo"></label>
         <p class="nw-label">Elige amigos <small class="muted">(luego puedes agregar más)</small></p>
         <div class="nw-list">${social.friends.map(f => `<label class="nw-row"><input type="checkbox" data-pick="${esc(f.pid)}">${avDot(f, 36)}<span>${esc(f.name)}</span></label>`).join("")}</div>
         <button type="button" class="btn btn-primary nw-go">Crear grupo</button>
         <p class="chat-hint">Tú serás administrador del grupo y podrás nombrar a otros. Los grupos los moderan sus propios administradores.</p>`
      : `<p class="pp-empty">Para crear un grupo primero agrega amigos desde <b>Estudiantes</b>.</p><button type="button" class="btn btn-primary" data-go="people">Ver estudiantes</button>`;
  }
  async function createGroup() {
    const name = newEl.querySelector(".nw-name").value.trim();
    const members = [...newEl.querySelectorAll("[data-pick]:checked")].map(i => i.dataset.pick);
    if (!name) return setErr("Escribe un nombre para el grupo.");
    const btn = newEl.querySelector(".nw-go"); btn.disabled = true;
    const r = await api("POST", "/api/groups", { action: "create", name, members }).catch(() => null);
    btn.disabled = false;
    if (!r || r.status !== 200 || !r.data?.ok) return setErr(r?.data?.message || "No se pudo crear el grupo.");
    setErr("");
    toast("Grupo creado ✓");
    members.forEach(pingInbox);
    await loadGroups();
    openGroup(r.data.id, name);
  }

  const gRole = (m) => (m.creator ? '<span class="role-chip is-owner">Creador</span>' : m.grole === "admin" ? '<span class="role-chip">Admin</span>' : "");
  async function renderGinfo() {
    ginfoEl.innerHTML = skelRows(5, "Cargando el grupo…");
    const r = await api("GET", `/api/groups?id=${ginfoGid}`).catch(() => null);
    if (active !== "ginfo") return;
    if (!r || r.status !== 200) { ginfoEl.innerHTML = '<p class="pp-empty">No se pudo cargar el grupo.</p>'; return; }
    const g = r.data.group, admin = g.me === "admin";
    const inGroup = new Set(g.members.map(m => m.pid));
    const addable = social.friends.filter(f => !inGroup.has(f.pid));
    const acts = (m) => {
      if (!admin || m.pid === me.pid || m.creator) return "";
      const canTouch = m.grole !== "admin" || g.iAmCreator;
      return `${m.grole === "admin" ? (g.iAmCreator ? `<button type="button" class="btn btn-ghost btn-sm" data-g="role" data-on="0" data-pid="${esc(m.pid)}">Quitar admin</button>` : "") : `<button type="button" class="btn btn-ghost btn-sm" data-g="role" data-on="1" data-pid="${esc(m.pid)}">Hacer admin</button>`}${canTouch ? `<button type="button" class="btn btn-ghost btn-sm" data-g="remove" data-pid="${esc(m.pid)}">Sacar</button>` : ""}`;
    };
    ginfoEl.innerHTML = `<div class="gi-body">
      <div class="gi-head">${groupAv(g.name, 64)}<div class="gi-title">${admin ? `<input class="gi-name" maxlength="40" value="${esc(g.name)}" aria-label="Nombre del grupo"><button type="button" class="btn btn-ghost btn-sm" data-g="rename">Guardar nombre</button>` : `<h3>${esc(g.name)}</h3>`}</div></div>
      <h4 class="pp-group">Miembros (${g.members.length})</h4>
      ${g.members.map(m => personRow(m, acts(m), gRole(m))).join("")}
      ${admin && addable.length ? `<h4 class="pp-group">Agregar amigos</h4>${addable.map(f => personRow(f, `<button type="button" class="btn btn-primary btn-sm" data-g="add" data-pid="${esc(f.pid)}">Agregar</button>`)).join("")}` : ""}
      <div class="gi-foot"><button type="button" class="btn btn-ghost" data-g="leave">Salir del grupo</button>${g.iAmCreator ? '<button type="button" class="btn btn-ghost gi-danger" data-g="delete">Borrar grupo</button>' : ""}</div></div>`;
  }
  async function groupAction(action, pid, on) {
    const body = { action, id: ginfoGid };
    if (pid) body.pid = pid;
    if (on !== undefined) body.on = on === "1";
    if (action === "rename") body.name = ginfoEl.querySelector(".gi-name").value;
    if (action === "leave" && !confirm("¿Salir de este grupo?")) return;
    if (action === "delete" && !confirm("¿Borrar el grupo y todos sus mensajes? No se puede deshacer.")) return;
    const r = await api("POST", "/api/groups", body).catch(() => null);
    if (!r || r.status !== 200) { setErr(r?.data?.message || "No se pudo completar la acción."); return; }
    setErr("");
    toast({ add: "Agregado al grupo ✓", remove: "Sacado del grupo", role: "Rol actualizado ✓", rename: "Nombre guardado ✓", leave: "Saliste del grupo", delete: "Grupo borrado" }[action] || "Listo ✓");
    const k = "g:" + ginfoGid;
    if (ROOMS[k]) pingRoom(ROOMS[k]);
    if (pid && (action === "add" || action === "remove")) pingInbox(pid);
    if (action === "leave" || action === "delete") { delete ROOMS[k]; await loadGroups(); setRoom("home"); return; }
    await loadGroups();
    renderGinfo();
  }

  /** Barra que invita a activar las notificaciones del navegador (o explica cómo desbloquearlas). */
  function paintPerm() {
    const bar = $(".chat-perm"), st = permState();
    if (st === "granted" || st === "unsupported") { bar.hidden = true; return; }
    bar.hidden = false;
    bar.innerHTML = st === "denied"
      ? `<span>🔕 Las notificaciones están bloqueadas. Toca el candado junto a la dirección de la página y permite «Notificaciones».</span><button type="button" data-perm="recheck">Ya lo hice</button>`
      : `<span>🔔 Activa las notificaciones para enterarte de los mensajes aunque estés en otra pestaña.</span><button type="button" data-perm="ask">Activar</button>`;
  }
  window.addEventListener("chat-prefs", paintPerm);
  window.addEventListener("focus", paintPerm);

  function paintHead() {
    const st = ROOMS[active];
    let title = "", sub = "", av = "", info = "";
    if (active === "people") title = "Estudiantes";
    else if (active === "new") title = "Nuevo grupo";
    else if (active === "ginfo") title = "Información del grupo";
    else if (st) {
      title = st.label;
      if (st.dm) { const f = social.friends.find(x => x.pid === st.peer.pid) || {}; av = avDot({ ...st.peer, seen: f.seen }, 34); sub = presenceText(f); }
      else if (st.group) { const g = social.groups.find(x => x.id === st.gid); sub = g ? `${g.n} miembro${g.n === 1 ? "" : "s"} · toca ⓘ para ver` : "Grupo"; av = groupAv(title, 34); info = `<button type="button" class="chat-info" data-ginfo="${st.gid}" aria-label="Información del grupo" title="Información del grupo">ⓘ</button>`; }
      else { av = pubAv(active === "general" ? "🌎" : "🎓", 34); sub = active === "general" ? "Todos los estudiantes" : "Solo tu carrera"; }
    }
    const mkey = st ? active : "";
    const mute = mkey ? `<button type="button" class="chat-mute${isMuted(mkey) ? " is-off" : ""}" data-mute="${esc(mkey)}" aria-label="${isMuted(mkey) ? "Activar avisos de este chat" : "Silenciar este chat"}" title="${isMuted(mkey) ? "Silenciado: toca para activar los avisos" : "Silenciar este chat"}">${isMuted(mkey) ? "🔕" : "🔔"}</button>` : "";
    const who = `${av}<span class="chat-dmtxt"><strong>${esc(title)}</strong>${sub ? `<small>${esc(sub)}</small>` : ""}</span>`;
    const whoEl = st?.dm ? `<button type="button" class="chat-who" data-profile="${esc(st.peer.pid)}" title="Ver perfil" aria-label="Ver perfil de ${esc(title)}">${who}</button>`
      : st?.group ? `<button type="button" class="chat-who" data-ginfo="${st.gid}" title="Información del grupo">${who}</button>` : `<span class="chat-who">${who}</span>`;
    dmwho.innerHTML = `${whoEl}${mute}${info}`;
  }

  async function loadMods() {
    if (!me.admin) return;
    const r = await api("GET", "/api/mods").catch(() => null);
    const ul = root.querySelector(".chat-mods");
    if (!r || r.status !== 200 || !ul) return;
    ul.innerHTML = r.data.mods.map(m => `<li><span><strong>${esc(m.name)}</strong> · ${m.role === "owner" ? "👑 Dueño" : "🛡️ Moderador"} <small class="muted">${esc(PENSUMS[m.career]?.key || "")}</small></span>${me.owner && m.role === "mod" ? `<button type="button" class="btn btn-ghost btn-sm" data-unmod="${esc(m.pid)}">Quitar</button>` : ""}</li>`).join("");
  }
  async function setMod(pid, on) {
    if (pid === me.pid) return;
    const r = await api("POST", "/api/mods", { pid, on }).catch(() => null);
    if (!r || r.status !== 200) setErr(r?.data?.message || "No se pudo cambiar el rol.");
    else { setErr(""); toast("Rol actualizado ✓"); }
    loadMods();
  }

  /* ---------- salas ---------- */
  const VIEWS = ["home", "people", "new", "ginfo"];
  function setRoom(name) {
    if (!ROOMS[name] && !VIEWS.includes(name)) name = "home";
    active = name;
    root.dataset.view = ROOMS[name] ? "room" : name;
    paintHead();
    list.classList.toggle("is-dm", !!ROOMS[name]?.dm);
    toggleEmoji(false);
    list.innerHTML = "";
    jump.classList.add("hidden");
    down.classList.add("hidden");
    if (!ROOMS[name]) {
      note.textContent = "";
      if (name === "home") { renderHome(); loadSocial(); loadGroups(); }
      else if (name === "people") { renderPeople(); loadSocial(); if (ptab === "directorio" && !dir.loaded) loadDir(true); }
      else if (name === "new") renderNew();
      else renderGinfo();
      paintBadges();
      onRoomChange(name, name === "home" ? "Chats" : name === "people" ? "Estudiantes" : name === "new" ? "Nuevo grupo" : "Grupo");
      return;
    }
    const st = ROOMS[name];
    note.textContent = st.group ? "Grupo · solo sus miembros. Lo moderan los administradores del grupo; si reportas un mensaje, el equipo también puede revisarlo."
      : st.dm ? "Chat privado · solo ustedes dos. Si alguien reporta un mensaje, el equipo de moderación puede revisarlo."
      : name === "general" ? "Abierto a todos los estudiantes con cuenta · se muestra tu nombre"
      : `Privado de ${career ? career.nombre : "tu carrera"} · solo lo ve tu carrera`;
    if (!st.priv) { if (me.owner) note.textContent += " · 👑 Eres el dueño"; else if (me.admin) note.textContent += " · 🛡️ Eres moderador"; }
    if (isVisible()) st.unread = 0;
    paint();
    paintBadges();
    fetchRoom(name);
    loadSocial(); loadGroups(); // al cambiar de chat también se actualizan la lista, los no leídos y quién está en línea
    onRoomChange(name, st.label);
  }

  /** El panel pasó a verse (o se cerró): al verse se marcan como leídos los de la sala activa. */
  function show() {
    if (ROOMS[active]) ROOMS[active].unread = 0;
    paintBadges();
    paint();
    toBottom();
    refreshAll();
  }

  /* ---------- acciones ---------- */
  async function send(e) {
    e.preventDefault();
    const text = ta.value.trim();
    if (!text) return;
    const btn = $(".chat-send");
    btn.disabled = true;
    try {
      const roomName = active;
      const r = await api("POST", "/api/chat", { room: roomName, text });
      if (r.status === 200 && r.data?.ok) {
        ta.value = ""; ta.style.height = ""; setErr(""); toggleEmoji(false);
        if (r.data.flagged) showWarn(r.data.notice || "Tu mensaje tenía palabras no permitidas y se enmascaró. Por favor, modera tu forma de hablar.");
        const st0 = ROOMS[roomName];
        if (st0 && r.data.id && !st0.msgs.has(r.data.id)) { // se muestra al instante, sin esperar a la segunda consulta
          st0.msgs.set(r.data.id, { id: r.data.id, text: r.data.text ?? text, at: r.data.at || Date.now(), pid: me.pid, name: me.name, career: me.career, avatar: null, avatarBg: null, frame: null, hidden: null, edited: null, pct: null, role: me.owner ? "owner" : me.admin ? "mod" : null });
          if (roomName === active) { paint(); toBottom(); }
        }
        if (st0) pingRoom(st0); // los demás se enteran ya, sin esperar a que yo termine de actualizarme
        fetchRoom(roomName);
      } else setErr(r.data?.message || "No se pudo enviar. Intenta de nuevo.");
    } catch { setErr("Sin conexión. No se envió el mensaje."); }
    finally { btn.disabled = false; ta.focus(); }
  }

  async function removeMsg(id) {
    const r = await api("DELETE", `/api/chat?id=${id}`).catch(() => null);
    if (r && r.status === 200) {
      await fetchRoom(active); // el servidor lo devuelve como "borrado" u "ocultado por un moderador"
      pingRoom(ROOMS[active]);
      if (me.admin) loadReports();
    } else setErr("No se pudo borrar el mensaje.");
  }

  /** Editar un mensaje propio (hasta 5 minutos): se cambia la burbuja por un cuadro de texto. */
  function startEdit(id) {
    const m = ROOMS[active].msgs.get(id);
    const el = list.querySelector(`.msg[data-id="${id}"]`);
    if (!m || !el) return;
    if (!canEdit(m)) { setErr("Ya pasaron los 5 minutos para editar este mensaje."); paint(); return; }
    const bubble = el.querySelector(".msg-bubble");
    bubble.innerHTML = `<textarea class="msg-edit" rows="2" maxlength="500" aria-label="Editar mensaje">${esc(m.text)}</textarea>
      <div class="msg-edit-actions"><button type="button" class="msg-edit-cancel" data-cancel="${id}">Cancelar</button><button type="button" class="msg-edit-save" data-save="${id}">Guardar</button></div>`;
    el.querySelector(".msg-actions").style.display = "none";
    const t = bubble.querySelector("textarea");
    t.focus(); t.setSelectionRange(t.value.length, t.value.length);
    t.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); saveEdit(id, t.value); }
      if (e.key === "Escape") { el.outerHTML = msgHtml(m); }
    });
  }
  async function saveEdit(id, value) {
    const text = value.trim();
    if (!text) { setErr("El mensaje no puede quedar vacío."); return; }
    const r = await api("PATCH", "/api/chat", { id, text }).catch(() => null);
    if (r && r.status === 200 && r.data?.ok) {
      setErr("");
      if (r.data.flagged) showWarn(r.data.notice);
      await fetchRoom(active);
      paint();
      pingRoom(ROOMS[active]);
    } else { setErr((r && r.data?.message) || "No se pudo guardar el cambio."); if (r && r.status === 403) paint(); }
  }
  async function restoreMsg(id) {
    const r = await api("POST", "/api/chat/restore", { id }).catch(() => null);
    if (r && r.status === 200) { await fetchRoom(active); pingRoom(ROOMS[active]); } else setErr("No se pudo restaurar el mensaje.");
  }

  async function loadReports() {
    if (!me.admin) return;
    const r = await api("GET", "/api/chat/reports").catch(() => null);
    if (!r || r.status !== 200) return;
    $(".chat-reports").innerHTML = r.data.reports.length
      ? r.data.reports.map(x => `<li><span><strong>${esc(x.name)}</strong> (${x.n} reporte${x.n === 1 ? "" : "s"}${x.reason ? ` · ${esc(x.reason)}` : ""}): ${esc(x.text)}${x.selfDeleted ? ' <em class="rep-flag">borrado por su autor después del reporte</em>' : x.edited ? ' <em class="rep-flag">editado después del reporte</em>' : ""}</span><button type="button" class="btn btn-ghost btn-sm" data-hide="${x.id}">${x.selfDeleted ? "Archivar" : "Ocultar"}</button></li>`).join("")
      : "<li>Sin reportes pendientes.</li>";
  }

  async function showProfile(pid) {
    const card = document.getElementById("chat-pcard");
    card.innerHTML = skelProfile();
    openModal("chat-profile-overlay");
    try {
      const r = await api("GET", `/api/profile?pid=${encodeURIComponent(pid)}`);
      if (r.status === 404) { card.innerHTML = '<p class="pp-empty">👤 Usuario eliminado</p>'; return; }
      if (r.status !== 200 || !r.data?.ok) { card.innerHTML = '<p class="muted">No se pudo cargar este perfil.</p>'; return; }
      const { profile: p, blocked, rel } = r.data;
      const isMe = r.data.me || pid === me.pid;
      profileCache = { pid, name: p.name, avatar: p.avatar, avatarBg: p.avatarBg, frame: p.frame };
      const c = PENSUMS[p.career];
      const primary = isMe ? "" : rel === "friend" ? `<button type="button" class="btn btn-primary" data-dm="${esc(pid)}">Enviar mensaje</button>`
        : rel === "sent" ? `<button type="button" class="btn btn-ghost" data-fa="cancel" data-pid="${esc(pid)}">Solicitud enviada · Cancelar</button>`
        : rel === "received" ? `<button type="button" class="btn btn-primary" data-fa="accept" data-pid="${esc(pid)}">Aceptar solicitud</button><button type="button" class="btn btn-ghost" data-fa="decline" data-pid="${esc(pid)}">Rechazar</button>`
        : `<button type="button" class="btn btn-primary" data-fa="request" data-pid="${esc(pid)}">Agregar amigo</button>`;
      const removeBtn = rel === "friend" ? `<button type="button" class="btn btn-ghost" data-fa="remove" data-pid="${esc(pid)}">Eliminar amistad</button>` : "";
      const delBtn = me.owner && !isMe && p.role !== "owner" ? `<button type="button" class="btn btn-ghost gi-danger" data-deluser="${esc(pid)}">Eliminar usuario</button>` : "";
      const modBtn = me.owner && !isMe && p.role !== "owner" ? `<button type="button" class="btn btn-ghost" data-mod="${p.role === "mod" ? "0" : "1"}" data-pid="${esc(pid)}">${p.role === "mod" ? "Quitar moderador" : "Nombrar moderador"}</button>` : "";
      const frame = p.frame ? (ACH_BY_ID[p.frame] || MOD_BY_ID[p.frame] || null) : null;
      const ach = (p.earned || []).map(id => ACH_BY_ID[id]).filter(Boolean).sort((a, b) => b.tier - a.tier);
      card.innerHTML = `
        ${framedAvatar(p.avatar, p.avatarBg, p.frame, 120)}
        <h3>${esc(p.name || "Estudiante")}</h3>
        ${roleChip(p.role)}${isOnline(p) ? '<span class="pp-on">● En línea</span>' : p.seen ? `<span class="muted" style="font-size:12px">${esc(presenceText(p))}</span>` : ""}
        <span class="pcard-career">${esc(c ? c.nombre : p.career || "")}</span>
        ${frame ? `<span class="pcard-frame">Marco: ${esc(frame.name)}</span>` : ""}
        ${rankCardHtml(p.pct, { own: isMe })}
        ${p.pct != null && p.verifiedVia ? `<span class="pcard-via${p.verifiedVia === "bookmark" ? " is-bm" : ""}">${p.verifiedVia === "bookmark" ? "✓ Verificado con marcador" : "✓ Verificado con inicio de sesión directo"}</span>` : ""}
        <div class="pcard-list" aria-label="Logros">
          ${ach.length ? ach.map(a => `<div class="pcard-ach">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${TIERS[a.tier].c2}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${GLYPHS[a.glyph] || ""}</svg>
              <div><strong>${esc(a.name)}</strong><span>${esc(a.flavor)}</span></div></div>`).join("")
            : '<p class="muted" style="text-align:center;font-size:13px">Aún sin logros verificados.</p>'}
        </div>
        ${isMe ? "" : `<div class="pc-actions">${primary}</div>
          <details class="pc-more"><summary>Más opciones</summary><div class="pc-more-list">${removeBtn}${modBtn}<button type="button" class="btn btn-ghost" data-block="${esc(pid)}" data-on="${blocked ? "0" : "1"}">${blocked ? "Desbloquear" : "Bloquear"}</button>${delBtn}</div></details>`}`;
    } catch { card.innerHTML = '<p class="muted">Sin conexión.</p>'; }
  }

  /* ---------- eventos ---------- */
  $(".chat-back").addEventListener("click", () => setRoom(active === "ginfo" ? "g:" + ginfoGid : "home"));
  root.addEventListener("click", (e) => {
    const go = e.target.closest("[data-go]"); if (go) return setRoom(go.dataset.go);
    const op = e.target.closest("[data-open]"); if (op) return openKey(op.dataset.open);
    const pf = e.target.closest(".chat-dmbar [data-profile]"); if (pf) return showProfile(pf.dataset.profile);
    const mu = e.target.closest("[data-mute]"); if (mu) { const now = toggleMute(mu.dataset.mute); toast(now ? "Chat silenciado 🔕" : "Avisos activados 🔔"); paintHead(); paintBadges(); return; }
    const pm = e.target.closest("[data-perm]");
    if (pm) { if (pm.dataset.perm === "ask") { turnOn().then(paintPerm); } else paintPerm(); return; }
    const gi = e.target.closest("[data-ginfo]"); if (gi) { ginfoGid = Number(gi.dataset.ginfo); return setRoom("ginfo"); }
    if (e.target.closest(".nw-go")) return createGroup();
  });
  ginfoEl.addEventListener("click", (e) => {
    const prof = e.target.closest("[data-profile]"); if (prof) return showProfile(prof.dataset.profile);
    const ga = e.target.closest("[data-g]"); if (ga) { ga.disabled = true; groupAction(ga.dataset.g, ga.dataset.pid, ga.dataset.on).finally(() => { ga.disabled = false; }); }
  });
  peopleEl.addEventListener("click", async (e) => {
    const t = e.target;
    const pt = t.closest("[data-pt]");
    if (pt) { ptab = pt.dataset.pt; renderPeople(); if (ptab === "directorio" && !dir.loaded) loadDir(true); return; }
    const prof = t.closest("[data-profile]");
    if (prof) return showProfile(prof.dataset.profile);
    const dmb = t.closest("[data-dm]");
    if (dmb) return openDm(dmb.dataset.dm);
    const fa = t.closest("[data-fa]");
    if (fa) { fa.disabled = true; await friendAction(fa.dataset.fa, fa.dataset.pid); return; }
    if (t.closest("[data-more]")) loadDir(false);
  });
  peopleEl.addEventListener("change", (e) => { if (e.target.matches(".pp-career")) { dir.career = e.target.value; loadDir(true); } });
  peopleEl.addEventListener("input", (e) => { if (e.target.matches(".pp-q")) { dir.q = e.target.value.trim(); clearTimeout(qTimer); qTimer = setTimeout(() => loadDir(true), 300); } });
  emoBtn.addEventListener("click", () => toggleEmoji());
  emoEl.addEventListener("click", (e) => {
    const t = e.target.closest("[data-emo-set]"); if (t) { emoSet = t.dataset.emoSet; return paintEmoji(); }
    const m = e.target.closest("[data-emo]"); if (m) insertEmoji(m.dataset.emo);
  });
  ta.addEventListener("keydown", (e) => { if (e.key === "Escape" && !emoEl.hidden) { toggleEmoji(false); } });
  $(".chat-compose").addEventListener("submit", send);
  ta.addEventListener("input", () => { ta.style.height = "auto"; ta.style.height = Math.min(110, ta.scrollHeight) + "px"; });
  ta.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); $(".chat-compose").requestSubmit(); } });
  jump.addEventListener("click", toBottom);
  list.addEventListener("scroll", () => {
    if (nearBottom()) jump.classList.add("hidden");
    down.classList.toggle("hidden", nearBottom(260));
    if (list.scrollTop < 70) loadOlder();
  }, { passive: true });
  down.addEventListener("click", () => { list.scrollTo({ top: list.scrollHeight, behavior: "smooth" }); });
  list.addEventListener("click", async (e) => {
    const prof = e.target.closest("[data-profile]");
    if (prof) return showProfile(prof.dataset.profile);
    const del = e.target.closest("[data-del]");
    if (del) return removeMsg(Number(del.dataset.del));
    const ed = e.target.closest("[data-edit]");
    if (ed) return startEdit(Number(ed.dataset.edit));
    const sv = e.target.closest("[data-save]");
    if (sv) return saveEdit(Number(sv.dataset.save), sv.closest(".msg-bubble").querySelector("textarea").value);
    const cn = e.target.closest("[data-cancel]");
    if (cn) { const m = ROOMS[active].msgs.get(Number(cn.dataset.cancel)); const el = cn.closest(".msg"); if (m && el) el.outerHTML = msgHtml(m); return; }
    const rs = e.target.closest("[data-restore]");
    if (rs) return restoreMsg(Number(rs.dataset.restore));
    const rep = e.target.closest("[data-report]");
    if (rep && !rep.dataset.done) {
      const reason = prompt("¿Por qué reportas este mensaje? (opcional)", "");
      if (reason === null) return;
      const r = await api("POST", "/api/chat/report", { id: Number(rep.dataset.report), reason }).catch(() => null);
      if (r && r.status === 200) { rep.textContent = "Reportado ✓"; rep.dataset.done = "1"; } else setErr("No se pudo enviar el reporte.");
      return;
    }
    if (e.target.closest(".msg-edit, .msg-edit-actions, .msg-actions")) return;
    const bubble = e.target.closest(".msg-bubble"); // al tocar un mensaje aparecen sus acciones (útil en el teléfono)
    if (bubble) { const m = bubble.closest(".msg"); const was = m.classList.contains("is-open"); list.querySelectorAll(".msg.is-open").forEach(x => x.classList.remove("is-open")); if (!was) m.classList.add("is-open"); return; }
  });
  const onDocClick = async (e) => {
    if (e.target.closest("#chat-pcard")) {
      const fa = e.target.closest("[data-fa]");
      if (fa) { fa.disabled = true; await friendAction(fa.dataset.fa, fa.dataset.pid); showProfile(fa.dataset.pid); return; }
      const dmb = e.target.closest("[data-dm]");
      if (dmb) return openDm(dmb.dataset.dm, profileCache && profileCache.pid === dmb.dataset.dm ? profileCache : {});
      const du = e.target.closest("[data-deluser]");
      if (du) {
        const pid = du.dataset.deluser, name = profileCache?.name || "esta persona";
        if (!confirm(`¿Eliminar DEFINITIVAMENTE a ${name}?\n\nSe borran su cuenta, sus mensajes, sus amistades y su lugar en los grupos, y no podrá volver a entrar. No se puede deshacer.`)) return;
        du.disabled = true;
        const r = await api("POST", "/api/users/delete", { pid }).catch(() => null);
        if (r && r.status === 200) {
          closeModal("chat-profile-overlay");
          dir.people = dir.people.filter(x => x.pid !== pid);
          for (const k of Object.keys(ROOMS)) if (ROOMS[k].peer && ROOMS[k].peer.pid === pid) { delete ROOMS[k]; if (active === k) setRoom("home"); }
          setErr(""); toast("Usuario eliminado");
          await Promise.all([loadSocial(), loadGroups()]);
          refreshPeopleView();
          ping(ROOMS.general.ping); ping(ROOMS.carrera.ping);
        } else { du.disabled = false; setErr(r?.data?.message || "No se pudo eliminar al usuario."); }
        return;
      }
      const md = e.target.closest("[data-mod]");
      if (md) { md.disabled = true; await setMod(md.dataset.pid, md.dataset.mod === "1"); showProfile(md.dataset.pid); return; }
    }
    const b = e.target.closest("#chat-pcard [data-block]");
    if (!b) return;
    const on = b.dataset.on === "1";
    b.disabled = true;
    const r = await api("POST", "/api/chat/block", { pid: b.dataset.block, on }).catch(() => null);
    if (r && r.status === 200) {
      if (on) { const k = "dm:" + b.dataset.block; if (ROOMS[k]) { delete ROOMS[k]; if (active === k) setRoom("general"); } loadSocial(); blockedPids.add(b.dataset.block); for (const st of Object.values(ROOMS)) for (const [id, m] of st.msgs) if (m.pid === b.dataset.block) st.msgs.delete(id); paint(); }
      else { blockedPids.delete(b.dataset.block); for (const st of Object.values(ROOMS)) { st.last = 0; st.msgs.clear(); st.loaded = false; } refreshAll(); }
      closeModal("chat-profile-overlay");
    } else { b.disabled = false; setErr("No se pudo cambiar el bloqueo."); }
  };
  document.addEventListener("click", onDocClick);
  if (me.admin) {
    root.querySelector(".chat-admin").addEventListener("toggle", () => { loadReports(); loadMods(); });
    root.querySelector(".chat-wipe").addEventListener("click", async (e) => {
      const b = e.target.closest("[data-wipe]");
      if (!b) return;
      const what = b.dataset.wipe;
      if (!confirm(what === "all" ? "¿Vaciar TODOS los chats públicos? No se puede deshacer." : `¿Vaciar ${what === "general" ? "el chat General" : "el chat de tu carrera"}? No se puede deshacer.`)) return;
      b.disabled = true;
      const r = await api("POST", "/api/chat/wipe", { room: what }).catch(() => null);
      b.disabled = false;
      if (r && r.status === 200) { ping(ROOMS.general.ping); ping(ROOMS.carrera.ping); refreshAll(); loadReports(); setErr(""); } else setErr(r?.data?.message || "No se pudo vaciar.");
    });
    root.querySelector(".chat-mods").addEventListener("click", async (e) => {
      const u = e.target.closest("[data-unmod]");
      if (u) { u.disabled = true; await setMod(u.dataset.unmod, false); }
    });
    root.querySelector(".chat-reports").addEventListener("click", async (e) => {
      const h = e.target.closest("[data-hide]");
      if (!h) return;
      const r = await api("DELETE", `/api/chat?id=${h.dataset.hide}`).catch(() => null);
      if (r && r.status === 200) { loadReports(); refreshAll(); ping(ROOMS.general.ping); ping(ROOMS.carrera.ping); }
    });
  }
  const onVis = () => { if (!document.hidden) { refreshAll(); if (isVisible()) show(); } };
  document.addEventListener("visibilitychange", onVis);

  /* ---------- en vivo + respaldo ---------- */
  const roomByPing = (id) => (id === ROOMS.general.ping ? "general" : "carrera");
  (async () => {
    const h = await subscribe([ROOMS.general.ping, ROOMS.carrera.ping], (id) => fetchRoom(roomByPing(id)), (ok) => { live = ok; onLive(ok); });
    stopLive = h.stop;
  })();
  (async () => { // bandeja personal: mensajes privados, solicitudes y respuestas llegan al instante
    if (!me.pid) return;
    const h = await subscribe([me.pid], async () => { await loadSocial(); loadGroups(); if (ROOMS[active]?.dm) fetchRoom(active); }, () => {}, "inbox");
    stopInbox = h.stop;
  })();
  const editTimer = setInterval(() => { // el botón "Editar" desaparece a los 5 minutos
    list.querySelectorAll(".msg.is-me [data-edit]").forEach((b) => { const el = b.closest(".msg"); if (Date.now() - Number(el.dataset.at) >= EDIT_MS) b.remove(); });
  }, 15000);
  let slow = 0;
  const tick = () => { // respaldo rápido: la sala abierta cada 3 s; lo demás (lista, estado en línea) cada 9–30 s
    if (destroyed) return;
    if (!document.hidden) {
      slow += 3;
      const vis = isVisible();
      if (vis && ROOMS[active] && !live) fetchRoom(active); // sin aviso en vivo, la sala abierta se consulta cada 3 s
      if (slow >= (vis ? 15 : 60)) { slow = 0; refreshAll(); if (vis && active === "people" && ptab === "directorio") refreshDirPresence(); } // con el panel visible todo se refresca cada 15 s; cerrado, cada minuto (ahorra cuota gratis)
    }
    timer = setTimeout(tick, 3000);
  };
  timer = setTimeout(tick, 3000);

  setRoom("home");
  paintPerm();
  fetchRoom("general"); fetchRoom("carrera"); // para tener al día los "sin leer" de las salas públicas
  loadSocial(); loadGroups();

  return {
    show, setRoom, openDm, refresh: refreshAll, totalUnread,
    focusInput: () => ta.focus(),
    destroy() { destroyed = true; clearInterval(editTimer); clearTimeout(timer); clearTimeout(warnTimer); stopLive?.(); stopInbox?.(); stopGroups?.(); window.removeEventListener("chat-prefs", paintPerm); window.removeEventListener("focus", paintPerm); clearTimeout(qTimer); document.removeEventListener("click", onDocClick); document.removeEventListener("visibilitychange", onVis); },
  };
}
