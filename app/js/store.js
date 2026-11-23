// store.js — datos del usuario en D1 (vía /api/user). La identidad sigue siendo Firebase Auth.
//
// · loadUser(): lee el perfil de D1. Si el usuario aún no está en D1 pero sí tenía datos en
//   Firestore (cuentas anteriores), los copia a D1 una sola vez y sigue desde ahí.
// · saveUser(fields): guarda solo los campos que cambian.
// · createUser(data): crea el perfil la primera vez (nombre y carrera obligatorios).

import { auth, db } from "./firebase-config.js";

const ENDPOINT = "/api/user";

let skew = 0;
/** Hora actual según el servidor (evita diferencias por relojes mal puestos en los teléfonos). */
export const serverNow = () => Date.now() + skew;

/** Llamada autenticada a cualquier ruta /api/... del Worker (usa el ID token de Firebase). */
export async function api(method, path, body) {
  const user = auth.currentUser;
  if (!user) throw new Error("sin-sesion");
  const token = await user.getIdToken();
  const res = await fetch(path, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  let data = null;
  try { data = await res.json(); } catch { /* respuesta sin JSON */ }
  if (data && typeof data.now === "number") skew = data.now - Date.now(); // reloj del servidor: así "en línea" se calcula igual en todas partes
  if (res.status === 403 && data && data.code === "eliminada") { location.replace("cuenta-eliminada.html"); } // cuenta eliminada o baneada: nada de bucles de "no pudimos cargar tus datos"
  return { status: res.status, data };
}
const call = (method, body) => api(method, ENDPOINT, body);

/** Datos que tenía la cuenta en Firestore (solo se usa una vez, para migrar). */
async function legacyFirestoreUser(uid) {
  try {
    const { doc, getDoc } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
    const snap = await getDoc(doc(db, "users", uid));
    if (!snap.exists()) return null;
    const d = snap.data();
    const created = d.createdAt && typeof d.createdAt.toMillis === "function" ? d.createdAt.toMillis() : null;
    return { d, created };
  } catch { return null; }
}

/** Devuelve el perfil o null si el usuario todavía no lo ha creado. */
export async function loadUser() {
  const r = await call("GET");
  if (r.status === 200 && r.data && r.data.user) return r.data.user;
  if (r.status !== 404) throw new Error("api-" + r.status);
  // cuenta reiniciada (por la persona o por moderación): se configura de nuevo, sin traer datos viejos de Firestore
  if (r.data && r.data.code === "reiniciado") return null;

  const legacy = await legacyFirestoreUser(auth.currentUser.uid);
  if (!legacy) return null;
  const { d, created } = legacy;
  const fields = {
    name: d.name, career: d.career, theme: d.theme || "utesa",
    avatar: d.avatar ?? null, avatarBg: d.avatarBg ?? null,
    done: Array.isArray(d.done) ? d.done : [], utesaSync: d.utesaSync ?? null,
  };
  const w = await call("PUT", { fields, createdAt: created });
  if (w.status !== 200) throw new Error("migracion-" + w.status);
  const again = await call("GET");
  if (again.status === 200 && again.data && again.data.user) return again.data.user;
  return { ...fields, createdAt: created };
}

export async function saveUser(fields) {
  const r = await call("PUT", { fields });
  if (r.status !== 200) {
    const e = new Error("guardar-" + r.status);
    e.serverMessage = r.data && r.data.message; // p. ej. "Ese nombre no está permitido."
    throw e;
  }
}

export async function createUser(fields) {
  await saveUser(fields);
}
