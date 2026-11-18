// chat-live.js — avisos instantáneos del chat.
//
// Los mensajes viven en D1 (el servidor decide quién puede leer y escribir). Para que el chat sea "en vivo"
// sin sondear cada segundo, cada vez que alguien envía o borra un mensaje escribe un aviso mínimo en
// Firestore (documento chatPing/{sala}) y todos los que tienen el chat abierto lo reciben al instante
// (onSnapshot) y piden los cambios a D1. Si Firestore no está disponible, el chat sigue funcionando con
// sondeo cada pocos segundos (ver chat-core.js).

import { db } from "./firebase-config.js";

const FS = "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
let lib = null;
const loadLib = () => (lib ||= import(FS));

/** Id del documento de aviso de una sala. */
export const pingId = (room, career) => (room === "general" ? "general" : `c_${career}`);

/**
 * Escucha los avisos de varias salas. `onPing(id)` se llama cuando OTRA persona (u otro dispositivo)
 * envía o borra algo. Devuelve { stop, ready } donde ready indica si la conexión en vivo se estableció.
 */
export async function subscribe(ids, onPing, onState = () => {}, coll = "chatPing") {
  let stops = [];
  try {
    const { doc, onSnapshot } = await loadLib();
    let ok = 0;
    stops = ids.map((id) => {
      let first = true;
      return onSnapshot(
        doc(db, coll, id),
        (snap) => {
          if (first) { first = false; ok++; if (ok === ids.length) onState(true); return; } // el primer aviso es el estado actual
          if (snap.metadata.hasPendingWrites) return; // lo escribí yo: ya actualicé mi pantalla
          onPing(id);
        },
        () => onState(false), // sin permiso o sin conexión: el chat usa sondeo
      );
    });
  } catch {
    onState(false);
  }
  return { stop: () => stops.forEach((s) => { try { s(); } catch { /* nada */ } }) };
}

/** Avisa a los demás que algo cambió en la sala (después de enviar o borrar). */
export async function ping(id, coll = "chatPing") {
  try {
    const { doc, setDoc, serverTimestamp } = await loadLib();
    await setDoc(doc(db, coll, id), { t: serverTimestamp() });
  } catch { /* si falla, los demás se enteran con el sondeo */ }
}

/** Avisa a una persona (por su id público) que tiene algo nuevo: mensaje privado, solicitud o respuesta. */
export const pingInbox = (pid) => ping(pid, "inbox");
