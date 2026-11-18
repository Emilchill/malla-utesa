// chat-dock.js — el chat siempre a mano dentro de la app.
//
//  · PC / tablet: un cuadro fijo abajo a la derecha, siempre encendido. Su barra se ve siempre (con los mensajes
//    sin leer); se despliega o se mantiene cerrado y recuerda tu elección. En pantallas anchas arranca desplegado.
//  · Teléfono: un botón redondo flotante abajo a la derecha (con el número de mensajes nuevos) que abre el chat
//    como hoja a pantalla completa, fácil de alcanzar con el pulgar.

import { createChat } from "./chat-core.js";
import { bindBell } from "./chat-prefs.js";

const KEY = "malla_chat_open";
const mqMobile = window.matchMedia("(max-width: 719px)");
const CHAT_ICON = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z"/></svg>';

let dock = null;

export function initChatDock(me) {
  if (dock) { dock.update(me); return dock; }
  let ctrl = null, open = false, unread = 0, live = false;

  const el = document.createElement("aside");
  el.className = "cdock";
  el.id = "chat-dock";
  el.setAttribute("aria-label", "Comunidad");
  el.innerHTML = `
    <div class="cdock-bar">
      <button type="button" class="cdock-head" aria-expanded="false" aria-controls="cdock-body">
        <span class="cdock-live" title="Conectando…"></span>
        <span class="cdock-title"><strong>Comunidad</strong><small class="cdock-sub">Chats</small></span>
        <span class="cdock-badge hidden" aria-live="polite">0</span>
        <svg class="cdock-chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 15 6-6 6 6"/></svg>
      </button>
      <button type="button" class="cdock-bell" aria-pressed="true"></button>
      <button type="button" class="cdock-x" aria-label="Cerrar el chat"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
    </div>
    <div class="cdock-body" id="cdock-body"></div>`;
  const fab = document.createElement("button");
  fab.type = "button";
  fab.className = "cfab";
  fab.id = "chat-fab";
  fab.setAttribute("aria-label", "Abrir el chat de la comunidad");
  fab.innerHTML = `${CHAT_ICON}<span class="cfab-badge hidden">0</span>`;
  document.body.append(el, fab);

  const head = el.querySelector(".cdock-head");
  const badge = el.querySelector(".cdock-badge");
  const fabBadge = fab.querySelector(".cfab-badge");
  const liveDot = el.querySelector(".cdock-live");
  const sub = el.querySelector(".cdock-sub");
  bindBell(el.querySelector(".cdock-bell"));

  const paintUnread = () => {
    const txt = unread > 99 ? "99+" : String(unread);
    for (const b of [badge, fabBadge]) { b.textContent = txt; b.classList.toggle("hidden", !unread); }
    el.classList.toggle("has-unread", unread > 0);
  };
  const paintLive = () => {
    liveDot.classList.toggle("is-on", live);
    liveDot.title = live ? "En vivo" : "Actualizando cada pocos segundos";
  };

  const isVisible = () => open && !document.hidden;

  function build(meNow) {
    ctrl?.destroy();
    ctrl = createChat({
      root: el.querySelector(".cdock-body"), me: meNow, isVisible,
      onUnread: (n) => { unread = n; paintUnread(); },
      onLive: (ok) => { live = ok; paintLive(); },
      onRoomChange: (_n, label) => { sub.textContent = label; },
    });
  }

  function setOpen(v, { remember = true } = {}) {
    open = v;
    const mobile = mqMobile.matches;
    el.classList.toggle("is-open", v && !mobile);
    el.classList.toggle("is-sheet", v && mobile);
    document.body.classList.toggle("chat-sheet-open", v && mobile);
    head.setAttribute("aria-expanded", String(v));
    if (!v) ctrl?.refresh?.(); // al cerrar el panel también se actualiza, para que el contador quede al día
    if (v) { ctrl?.show(); if (!mobile) setTimeout(() => ctrl?.focusInput?.(), 60); }
    if (remember && !mobile) { try { localStorage.setItem(KEY, v ? "1" : "0"); } catch { /* nada */ } }
  }

  head.addEventListener("click", () => setOpen(!open));
  el.querySelector(".cdock-x").addEventListener("click", () => setOpen(false, { remember: false }));
  fab.addEventListener("click", () => setOpen(true, { remember: false }));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && open && mqMobile.matches && !document.querySelector(".modal-overlay:not(.hidden)")) setOpen(false, { remember: false }); });
  mqMobile.addEventListener?.("change", () => setOpen(false, { remember: false })); // al girar o cambiar de tamaño se cierra limpio
  document.addEventListener("visibilitychange", () => { if (open && !document.hidden) ctrl?.show(); });

  build(me);
  paintLive();
  // en pantallas anchas arranca desplegado (si la persona no eligió otra cosa)
  let saved = null;
  try { saved = localStorage.getItem(KEY); } catch { /* nada */ }
  if (!mqMobile.matches && (saved === "1" || (saved === null && window.innerWidth >= 1200))) setOpen(true, { remember: false });

  dock = {
    open: () => setOpen(true, { remember: !mqMobile.matches }),
    close: () => setOpen(false),
    toggle: () => setOpen(!open),
    update: (meNow) => { build(meNow); if (open) ctrl.show(); },
  };
  return dock;
}
