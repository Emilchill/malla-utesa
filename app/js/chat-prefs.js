// chat-prefs.js — avisos del chat: sonido suave y notificaciones del navegador.
//
//  · Un solo interruptor ("notificaciones encendidas/apagadas") que se recuerda en este dispositivo.
//  · Encendido: suena un "plin" leve cuando escribe otra persona y, si la pestaña está oculta y diste permiso,
//    sale un aviso del navegador. Apagado: silencio total (el contador de no leídos se sigue viendo).
//  · El sonido se genera con Web Audio (sin archivos). El navegador solo deja sonar después de que la persona
//    toque o escriba algo en la página, por eso se "despierta" con el primer gesto.

const KEY = "malla_chat_notif";
let ctx = null;
let lastPing = 0;

export const isOn = () => { try { return localStorage.getItem(KEY) !== "off"; } catch { return true; } };

export function setOn(v) {
  try { localStorage.setItem(KEY, v ? "on" : "off"); } catch { /* nada */ }
  window.dispatchEvent(new CustomEvent("chat-prefs", { detail: { on: v } }));
}

/* ---- chats silenciados (por chat, en este dispositivo) ---- */
const MUTE_KEY = "malla_chat_muted";
const readMuted = () => { try { return new Set(JSON.parse(localStorage.getItem(MUTE_KEY) || "[]")); } catch { return new Set(); } };
export const isMuted = (key) => readMuted().has(key);
export function toggleMute(key) {
  const s = readMuted();
  s.has(key) ? s.delete(key) : s.add(key);
  try { localStorage.setItem(MUTE_KEY, JSON.stringify([...s])); } catch { /* nada */ }
  window.dispatchEvent(new CustomEvent("chat-prefs", { detail: { muted: key } }));
  return s.has(key);
}

/* ---- permiso de notificaciones ----
   El navegador NO deja activarlas a la fuerza: solo se puede pedir con un clic de la persona, y si la bloquea
   hay que desbloquearla a mano. Por eso se pide en cuanto toca algo (cada visita mientras no haya respondido). */
export const permState = () => ("Notification" in window ? Notification.permission : "unsupported");
export async function askPermission() {
  if (permState() !== "default") return permState();
  try { await Notification.requestPermission(); } catch { /* nada */ }
  window.dispatchEvent(new CustomEvent("chat-prefs", { detail: { perm: true } }));
  return permState();
}
{
  const auto = () => { if (isOn() && permState() === "default") askPermission(); };
  window.addEventListener("pointerdown", auto, { once: true, passive: true });
  window.addEventListener("keydown", auto, { once: true, passive: true });
}

/** Enciende los avisos; si hace falta pide permiso de notificaciones (debe llamarse desde un clic). */
export async function turnOn() {
  setOn(true);
  wake();
  if ("Notification" in window && Notification.permission === "default") {
    try { await Notification.requestPermission(); } catch { /* nada */ }
  }
  playPing(true);
}
export const turnOff = () => setOn(false);

function wake() {
  try {
    ctx ||= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume();
  } catch { /* sin audio */ }
}
["pointerdown", "keydown", "touchstart"].forEach(ev => window.addEventListener(ev, wake, { passive: true }));

/** "Plin" leve de dos notas. `force` lo toca aunque haya sonado hace poco (vista previa al encender). */
export function playPing(force = false, key = null) {
  if (key && isMuted(key)) return;
  if (!isOn() || !ctx || ctx.state !== "running") return;
  const now = Date.now();
  if (!force && now - lastPing < 1500) return; // no más de uno cada 1,5 s
  lastPing = now;
  const t0 = ctx.currentTime;
  const master = ctx.createGain();
  master.gain.value = 0.07; // suave
  master.connect(ctx.destination);
  [[784, 0], [1175, 0.09]].forEach(([f, d]) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "sine"; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t0 + d);
    g.gain.exponentialRampToValueAtTime(1, t0 + d + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.22);
    o.connect(g); g.connect(master);
    o.start(t0 + d); o.stop(t0 + d + 0.25);
  });
}

/** Aviso del navegador (solo con la pestaña oculta y permiso concedido). */
export function desktopNotify(title, body, key = null) {
  if (key && isMuted(key)) return;
  if (!isOn() || !document.hidden || !("Notification" in window) || Notification.permission !== "granted") return;
  try {
    const n = new Notification(title, { body: String(body).slice(0, 120), tag: "malla-chat", silent: true });
    n.onclick = () => { window.focus(); n.close(); };
    setTimeout(() => n.close(), 6000);
  } catch { /* algunos móviles no permiten new Notification */ }
}

/** Dibuja el botón de campana según el estado. */
export function bellHtml(on) {
  return on
    ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/></svg>'
    : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13.7 21a1.9 1.9 0 0 1-3.4 0"/><path d="M18.6 13.2C18.2 11.9 18 10 18 8a6 6 0 0 0-9.3-5M6.3 6.3C6.1 6.9 6 7.4 6 8c0 7-3 9-3 9h14"/><path d="M2 2l20 20"/></svg>';
}

/** Conecta un botón: lo pinta y alterna el estado al tocarlo. Devuelve una función para soltarlo. */
export function bindBell(btn) {
  const paint = () => {
    const on = isOn();
    btn.innerHTML = bellHtml(on);
    btn.setAttribute("aria-pressed", String(on));
    btn.title = on ? "Avisos encendidos: toca para silenciar" : "Avisos apagados: toca para encender";
    btn.setAttribute("aria-label", btn.title);
    btn.classList.toggle("is-off", !on);
  };
  const click = (e) => { e.stopPropagation(); isOn() ? turnOff() : turnOn(); };
  btn.addEventListener("click", click);
  window.addEventListener("chat-prefs", paint);
  paint();
  return () => { btn.removeEventListener("click", click); window.removeEventListener("chat-prefs", paint); };
}
