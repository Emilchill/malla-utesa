// netlify/functions/utesa-login.js
// Vincula el avance de un estudiante con el portal de UTESA SIN extensiones ni marcadores:
// recibe matrícula + contraseña, inicia sesión en www.utesa.edu/webestudi igual que lo haría el
// estudiante, lee "Asignaturas pendientes" y el resumen, cierra la sesión y devuelve SOLO la lista
// de materias pendientes y unos contadores.
//
// Garantías de privacidad / seguridad de esta función:
//   · La contraseña vive solo en memoria durante la petición: no se guarda, no se registra
//     (no hay console.log de datos del usuario) y nunca se devuelve en la respuesta.
//   · Solo habla con https://www.utesa.edu (no sigue redirecciones a otros dominios).
//   · Solo acepta peticiones POST del propio sitio (cabecera Origin = Host).
//   · Limita intentos por matrícula y por dirección IP para que no sirva para adivinar contraseñas.
//     (El límite vive en memoria de la instancia: se reinicia si Netlify la recicla.)

const HOST = "https://www.utesa.edu";
const BASE = `${HOST}/webestudi/`;
const RECINTOS = new Set(["UTDJB", "UTGHD", "UTMAO", "UTMOC", "UTPPT", "UTSAN", "UTGRS", "UTSDG", "UTSDO", "UTGRD"]);
const TIMEOUT_MS = 15000;
const UA = "Mozilla/5.0 (compatible; MallaUTESA/1.0; +estudiantes)";

/* ---------- Límite de intentos (en memoria) ---------- */
const hits = new Map(); // clave -> marcas de tiempo
function limited(key, max, windowMs) {
  const now = Date.now();
  const list = (hits.get(key) || []).filter(t => now - t < windowMs);
  if (list.length >= max) { hits.set(key, list); return true; }
  list.push(now);
  hits.set(key, list);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some(t => now - t < windowMs)) hits.delete(k);
  return false;
}

/* ---------- Respuestas ---------- */
function reply(status, body) {
  return {
    statusCode: status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
    body: JSON.stringify(body),
  };
}
const fail = (status, code, message) => reply(status, { ok: false, code, message });

/* ---------- Cookies de sesión del portal ---------- */
function splitSetCookie(header) {
  return header ? header.split(/,(?=\s*[^;,=\s]+=)/) : [];
}
class Jar {
  constructor() { this.cookies = new Map(); }
  add(res) {
    const list = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : splitSetCookie(res.headers.get("set-cookie"));
    for (const line of list) {
      const pair = line.split(";")[0];
      const i = pair.indexOf("=");
      if (i > 0) this.cookies.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
    }
  }
  header() { return [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; "); }
}

/** GET con cookies, siguiendo redirecciones a mano y solo dentro de www.utesa.edu. */
async function get(url, jar) {
  let current = url;
  for (let hop = 0; hop < 7; hop++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    let res;
    try {
      res = await fetch(current, { redirect: "manual", signal: ctrl.signal, headers: { "User-Agent": UA, Accept: "text/html", Cookie: jar.header() } });
    } finally {
      clearTimeout(timer);
    }
    jar.add(res);
    const loc = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && loc) {
      current = new URL(loc, current).toString();
      if (!current.startsWith(HOST + "/")) throw new Error("redirect-externo");
      continue;
    }
    return { status: res.status, html: await res.text(), url: current };
  }
  throw new Error("demasiadas-redirecciones");
}

/* ---------- Lectura del HTML del portal (sin dependencias) ---------- */
const decode = (s) => s
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
const textOf = (html) => decode(html.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();

function tablesOf(html) {
  return [...html.matchAll(/<table[\s\S]*?<\/table>/gi)].map(m => m[0]);
}
function rowsOf(table) {
  return [...table.matchAll(/<tr[\s\S]*?<\/tr>/gi)].map(m =>
    [...m[0].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(c => textOf(c[1])));
}
function inputValue(html, id) {
  const tag = html.match(new RegExp(`<input[^>]*\\bid=["']${id}["'][^>]*>`, "i"));
  if (!tag) return "";
  const v = tag[0].match(/\bvalue=["']([^"']*)["']/i);
  return v ? decode(v[1]).trim() : "";
}

/** Claves de la columna "Cód. Asig." de cada tabla; null si la página no es la de pendientes. */
function parsePending(html) {
  if (!/C[óo]d\.?\s*Asig/i.test(textOf(html))) return null;
  const out = [];
  for (const t of tablesOf(html)) {
    const rows = rowsOf(t);
    if (!rows.length) continue;
    const ci = rows[0].findIndex(c => /c[óo]d/i.test(c));
    if (ci === -1) continue;
    for (const r of rows.slice(1)) {
      const code = (r[ci] || "").trim();
      if (/[A-Za-z]{2,4}-?\d{3}/.test(code) && !out.includes(code)) out.push(code);
    }
  }
  return out;
}

/* ---------- Función principal ---------- */
exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return fail(405, "metodo", "Método no permitido.");

  // solo desde el propio sitio
  const origin = event.headers.origin || event.headers.Origin || "";
  const host = event.headers.host || event.headers.Host || "";
  try {
    if (!origin || new URL(origin).host !== host) return fail(403, "origen", "Petición no permitida.");
  } catch { return fail(403, "origen", "Petición no permitida."); }

  if ((event.body || "").length > 2048) return fail(413, "entrada", "Datos demasiado largos.");
  let data;
  try { data = JSON.parse(event.body || "{}"); } catch { return fail(400, "entrada", "Datos no válidos."); }

  const matricula = String(data.matricula || "").replace(/\D/g, "");
  const recinto = String(data.recinto || "").toUpperCase();
  const password = typeof data.password === "string" ? data.password : "";
  if (matricula.length < 5 || matricula.length > 10) return fail(400, "entrada", "Escribe tu matrícula (solo números, con o sin guiones).");
  if (!RECINTOS.has(recinto)) return fail(400, "entrada", "Elige tu recinto.");
  if (!password || password.length > 128) return fail(400, "entrada", "Escribe tu contraseña de UTESA.");

  const ip = (event.headers["x-nf-client-connection-ip"] || event.headers["x-forwarded-for"] || "desconocida").split(",")[0].trim();
  if (limited(`m:${matricula}`, 5, 15 * 60 * 1000) || limited(`ip:${ip}`, 20, 60 * 60 * 1000)) {
    return fail(429, "limite", "Demasiados intentos. Espera unos minutos antes de volver a intentar.");
  }

  const jar = new Jar();
  try {
    // 1) Inicio de sesión: igual que el portal (la contraseña se envía como códigos de carácter + "a")
    let ec = "";
    for (let i = 0; i < password.length; i++) ec += password.charCodeAt(i) + "a";
    await get(`${BASE}conexion.aspx?Ematri=${encodeURIComponent(matricula)}&Ec=${ec}&Erecinto=${recinto}`, jar);
    ec = ""; // la contraseña ya no se necesita

    // 2) Asignaturas pendientes: si no aparece la tabla, el inicio de sesión no fue válido
    const pend = await get(`${BASE}asignaturas-pendientes.aspx`, jar);
    const pending = pend.status === 200 ? parsePending(pend.html) : null;
    if (!pending) return fail(401, "credenciales", "No pudimos iniciar sesión en UTESA. Revisa tu recinto, matrícula y contraseña.");

    // 3) Resumen (contadores para verificar)
    let counts = { aprob: null, insc: null, pend: null };
    try {
      const resu = await get(`${BASE}resumen.aspx`, jar);
      const n = (id) => { const v = parseInt(inputValue(resu.html, id), 10); return Number.isNaN(v) ? null : v; };
      counts = { aprob: n("txtCanAprob"), insc: n("txtCanInscri"), pend: n("txtCanPens") };
    } catch { /* los contadores son opcionales */ }

    // 4) Cerrar la sesión del portal (mejor esfuerzo)
    try { await get(`${BASE}cerrarses.aspx`, jar); } catch { /* no es crítico */ }

    return reply(200, {
      ok: true,
      carrera: inputValue(pend.html, "txtNombrecar"),
      pensum: inputValue(pend.html, "txtPensum"),
      counts,
      pending,
    });
  } catch (e) {
    const timeout = e && e.name === "AbortError";
    return fail(502, "portal", timeout
      ? "UTESA tardó demasiado en responder. Intenta de nuevo en un momento."
      : "No pudimos comunicarnos con el portal de UTESA ahora mismo. Intenta más tarde o usa el marcador.");
  }
};

// solo para pruebas locales
exports._test = { parsePending, inputValue, limited, hits };
