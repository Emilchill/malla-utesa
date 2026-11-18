// _worker.js (Cloudflare Pages, modo avanzado): sirve la web, /api/utesa-login, /api/user, /api/chat y /api/profile (datos en D1)
// Vincula el avance de un estudiante con el portal de UTESA SIN extensiones ni marcadores:
// recibe matrícula + contraseña, inicia sesión en www.utesa.edu/webestudi igual que lo haría el
// estudiante, lee "Asignaturas pendientes" y el resumen, cierra la sesión y devuelve SOLO la lista
// de materias pendientes y unos contadores.
//
// Garantías de privacidad / seguridad de esta función:
//   · La contraseña vive solo en memoria durante la petición: no se guarda, no se registra
//     (no hay console.log de datos del usuario) y nunca se devuelve en la respuesta.
//   · Solo habla con https://www.utesa.edu (no sigue redirecciones a otros dominios).
//   · Solo acepta peticiones POST del propio sitio (cabecera Origin = Host) y con sesión de la app (token de Firebase).
//   · Limita intentos por matrícula y por dirección IP para que no sirva para adivinar contraseñas.
//     (El límite vive en memoria del Worker: es de mejor esfuerzo y se reinicia al reciclarse.)

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
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
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
      if (/[A-Za-z]{2,4}[-\s]?\d{3}/.test(code) && !out.includes(code)) out.push(code);
    }
  }
  return out;
}

/* ---------- Ruta /api/utesa-login ---------- */
async function login(request, env) {
  if (request.method !== "POST") return fail(405, "metodo", "Método no permitido.");

  // solo desde el propio sitio
  const origin = request.headers.get("origin") || "";
  const host = new URL(request.url).host;
  try {
    if (!origin || new URL(origin).host !== host) return fail(403, "origen", "Petición no permitida.");
  } catch { return fail(403, "origen", "Petición no permitida."); }

  // hace falta una sesión de la app (token de Firebase): así el servidor no sirve de intermediario a quien no tiene cuenta
  const authz = request.headers.get("authorization") || "";
  const vuid = authz.startsWith("Bearer ") ? await verifyToken(authz.slice(7)) : null;
  if (!vuid) return fail(401, "sesion", "Inicia sesión en la app para vincular con UTESA.");
  if (limited(`lu:${vuid}`, 10, 60 * 60 * 1000)) return fail(429, "limite", "Demasiados intentos. Espera unos minutos antes de volver a intentar.");

  const raw = await request.text();
  if (raw.length > 2048) return fail(413, "entrada", "Datos demasiado largos.");
  let data;
  try { data = JSON.parse(raw || "{}"); } catch { return fail(400, "entrada", "Datos no válidos."); }

  const matricula = String(data.matricula || "").replace(/\D/g, "");
  const recinto = String(data.recinto || "").toUpperCase();
  const password = typeof data.password === "string" ? data.password : "";
  if (matricula.length < 5 || matricula.length > 10) return fail(400, "entrada", "Escribe tu matrícula (solo números, con o sin guiones).");
  if (!RECINTOS.has(recinto)) return fail(400, "entrada", "Elige tu recinto.");
  if (!password || password.length > 128) return fail(400, "entrada", "Escribe tu contraseña de UTESA.");

  const ip = (request.headers.get("cf-connecting-ip") || "desconocida").trim();
  if (limited(`m:${matricula}`, 5, 15 * 60 * 1000) || limited(`ip:${ip}`, 20, 60 * 60 * 1000)) {
    return fail(429, "limite", "Demasiados intentos. Espera unos minutos antes de volver a intentar.");
  }

  const jar = new Jar();
  try {
    let ec = "";
    for (let i = 0; i < password.length; i++) ec += password.charCodeAt(i) + "a";
    await get(`${BASE}conexion.aspx?Ematri=${encodeURIComponent(matricula)}&Ec=${ec}&Erecinto=${recinto}`, jar);
    ec = "";

    const pend = await get(`${BASE}asignaturas-pendientes.aspx`, jar);
    const pending = pend.status === 200 ? parsePending(pend.html) : null;
    if (!pending) return fail(401, "credenciales", "No pudimos iniciar sesión en UTESA. Revisa tu recinto, matrícula y contraseña.");

    let counts = { aprob: null, insc: null, pend: null };
    try {
      const resu = await get(`${BASE}resumen.aspx`, jar);
      const n = (id) => { const v = parseInt(inputValue(resu.html, id), 10); return Number.isNaN(v) ? null : v; };
      counts = { aprob: n("txtCanAprob"), insc: n("txtCanInscri"), pend: n("txtCanPens") };
    } catch { /* los contadores son opcionales */ }

    // Logros: solo con inicio de sesión directo y sesión de Firebase válida
    let verified = null;
    try {
      // una lista de pendientes vacía mientras UTESA dice que aún hay pendientes es sospechosa: no se otorgan logros
      const suspicious = pending.length === 0 && counts.pend !== 0;
      if (vuid && env.DB && !suspicious) {
        await ensureSchema(env.DB);
        const u = await env.DB.prepare("SELECT career, frame FROM users WHERE uid = ?").bind(vuid).first();
        if (u && u.career) {
          const pend = [...new Set(pending.map(normCode).filter(Boolean))];
          const r = computeEarned(u.career, pend);
          const frame = u.frame && r.earned.includes(u.frame) ? u.frame : null;
          await env.DB.prepare("UPDATE users SET earned = ?, verified_at = ?, frame = ?, verified_pending = ?, verified_src = 'direct' WHERE uid = ?")
            .bind(JSON.stringify(r.earned), Date.now(), frame, JSON.stringify(pend), vuid).run();
          verified = { earned: r.earned, mismatch: r.mismatch, frame, pct: progressPct({ verified_at: 1, verified_pending: JSON.stringify(pend), career: u.career }) };
        }
      }
    } catch { /* los logros son opcionales: si algo falla, la vinculación sigue */ }

    try { await get(`${BASE}cerrarses.aspx`, jar); } catch { /* no es crítico */ }

    return reply(200, {
      ok: true,
      carrera: inputValue(pend.html, "txtNombrecar"),
      pensum: inputValue(pend.html, "txtPensum"),
      counts,
      pending,
      verified,
    });
  } catch (e) {
    const timeout = e && e.name === "AbortError";
    return fail(502, "portal", timeout
      ? "UTESA tardó demasiado en responder. Intenta de nuevo en un momento."
      : "No pudimos comunicarnos con el portal de UTESA ahora mismo. Intenta más tarde o usa el marcador.");
  }
}

/* ============================================================
   Datos del usuario en D1 (reemplaza a Firestore users/{uid})
   · La identidad sigue siendo Firebase Auth: el cliente manda su ID token y aquí se verifica
     (firma RS256 con las claves públicas de Google, aud, iss y vencimiento).
   · Cada usuario solo puede leer y escribir su propia fila (uid sale del token, nunca del cuerpo).
   ============================================================ */
const FB_PROJECT = "malla-curricular-38175";
/* <<ACH-DATA>> */
const ACH_CODES = new Set(["MAT-160","MAT-170","MAT-340","MAT-350","MAT-360","MAT-190","MAT-500","MAT-510","MAT-370","MAT-134","MAT-135","MAT-145","MED-750","ORI-112","ESP-181","ESP-302","ING-135","ING-168","SOC-114","SOC-118","SOC-160","SOC-155","SOC-172","SOC-502","SIC-766","ADM-900","ADM-910","ECO-525","DPG-010","DPG-020","INF-117","INF-164","INF-204","INF-167","INF-172","INF-217","INF-184","INF-385","INF-481","INF-535","INF-225","INF-640","INF-700","INF-705","INF-710","INF-411","INF-344","INF-241","INF-021","INF-840","INF-910","INF-502","INF-810","INF-450","INF-433","INF-820","INF-025","INF-920","IEL-100","IEL-200","IEL-300","IEL-400","IEL-310","IEL-410","IEL-420","IEL-640","IEL-910","IEL-900","IEL-960","IEL-970","IEL-630","IEL-700","IEL-940","IEL-930","IEL-820","IID-105","IID-480","IID-630","IID-650","IID-640","IID-285","IID-980","IID-720","IID-725","IID-235","IID-935","IID-915","IID-955","IID-930","IID-945","IID-830","IID-750","IID-810","IID-925","IID-941","IET-101","IET-320","IET-310","IET-410","IET-400","IET-600","IET-426","IET-612","IET-741","IET-700","IET-806","IET-906","IET-908","IET-918","IET-924","IET-922","IET-930","IET-912","IMC-110","IMC-100","IMC-425","IMC-210","IMC-420","IMC-480","IMC-630","IMC-700","IMC-800","IMC-950","IMC-930","IMC-940","IMC-935","IMC-910","IMC-020","IMC-030","IMC-970","IMC-035","ICV-100","ICV-222","ICV-300","ICV-250","ICV-470","ICV-660","ICV-740","ICV-280","ICV-290","ICV-810","ICV-580","ICV-905","ICV-945","ICV-390","ICV-935","ICV-650","ICV-840","ICV-410","ARQ-115","ARQ-130","ARQ-205","ARQ-122","ARQ-190","ARQ-545","ARQ-330","ARQ-400","ARQ-470","ARQ-804","ARQ-390","ARQ-430","ARQ-700","ARQ-810","ARQ-800","ARQ-460","ARQ-510","ARQ-490","DER-102","DER-125","DER-170","DER-110","DER-151","DER-200","DER-220","DER-450","DER-965","DER-341","DER-370","DER-518","DER-512","DER-620","DER-560","DER-700","DER-924","DER-515","DER-765","CCO-106","CCO-130","CCO-502","CCO-251","CCO-223","CCO-515","CCO-702","CCO-802","CCO-176","CCO-920","CCO-225","CCO-904","CCO-906","CCO-914","CCO-908","CCO-705","CCO-912","LEX-100","FRA-252","FRA-352","ITA-106","FRA-402","FRA-606","FRA-604","FRA-602","FRA-706","FRA-170","EDU-172","ITA-118","LMO-120","FRA-902","FRA-906","FRA-904","SIC-102","SIC-304","SIC-302","SIC-402","SIC-755","SIC-605","SIC-700","SIC-702","SIC-804","SIC-914","SIC-912","SIC-923","SIC-850","SIC-010","SIC-908","SIC-906","SIC-918","ADM-112","CON-118","ECO-110","ECO-120","MER-100","ADM-415","ADM-197","ADM-558","ADM-420","ADM-291","ADM-292","ADM-710","ADM-390","ADM-702","ADM-185","ADM-319","ADM-620","ADM-650","TUR-096","TUR-200","ALE-100","TUR-430","TUR-220","TUR-440","TUR-530","TUR-900","FRA-132","TUR-103","TUR-180","TUR-810","TUR-700","TUR-122","TUR-911","ITA-110","TUR-205","CON-111","CON-120","CON-305","CON-335","INF-406","CON-706","CON-702","ECO-230","CON-204","CON-206","CON-322","CON-802","CON-907","CON-804","CON-906","ECO-520","CON-208","MER-102","MER-210","MER-430","MER-507","MER-520","MER-126","MER-706","MER-707","MER-370","MER-801","MER-901","MER-902","MER-904","MER-506","MER-365","MER-940","MER-802","MER-326","MER-905","MER-950","MER-930","BIO-100","MED-100","MED-192","BIO-310","BIO-200","BIO-220","BIO-420","BIO-650","BIO-320","MED-880","MED-280","BIO-720","BIO-630","BIO-640","BIO-250","BIO-801","BIO-802","BIO-701","BIO-702","ODO-100","ODO-404","ODO-190","ODO-502","ODO-130","ODO-160","ODO-120","ODO-140","ODO-200","ODO-702","ODO-704","ODO-150","ODO-180","ODO-300","ODO-400","ODO-170","ODO-500","ODO-402","ODO-501","ODO-302","VET-102","VET-110","VET-705","VET-630","VET-380","VET-137","VET-421","VET-771","VET-195","VET-300","VET-640","VET-510","VET-320","VET-330","VET-500","VET-340","VET-874","VET-960","VET-360","VET-370"]);
const CAREER_CODES = {"ISC":["ESP-181","INF-117","ING-105","MAT-115","MAT-160","MED-750","MED-755","ORI-112","SOC-182","ESP-189","INF-164","INF-165","INF-204","ING-115","MAT-170","MAT-190","MAT-191","ESP-302","INF-121","INF-167","INF-168","ING-125","MAT-306","MAT-340","MAT-500","MAT-501","SOC-114","IEL-100","IEL-105","INF-171","INF-172","INF-173","INF-385","INF-387","ING-135","MAT-134","MAT-350","SOC-118","SOC-172","DIB-520","IID-420","INF-440","INF-445","INF-481","INF-482","INF-535","MAT-360","SOC-502","INF-184","INF-185","INF-217","INF-218","INF-225","INF-331","INF-640","ING-168","MAT-135","SOC-160","INF-502","INF-503","INF-700","INF-705","INF-706","INF-710","MAT-145","SIC-766","SOC-155","ECO-525","IID-725","INF-241","INF-810","INF-840","ADM-910","IID-830","INF-021","INF-411","INF-412","INF-450","INF-910","ADM-900","IID-945","INF-344","INF-345","INF-433","INF-920","DPG-010","IID-025","INF-025","INF-820","DPG-020"],"IEL":["ESP-181","IEL-130","IEL-140","INF-103","MAT-160","MED-750","MED-755","ORI-112","SOC-182","ESP-189","IEL-100","IEL-105","INF-113","ING-105","MAT-170","MAT-190","MAT-191","ESP-302","IEL-200","IEL-205","IMC-102","ING-115","MAT-306","SOC-114","IEL-300","IEL-305","IET-320","IET-325","IMC-100","IMC-105","IMC-320","IMC-321","ING-125","MAT-134","SOC-118","SOC-172","IEL-400","IEL-405","IET-310","IET-315","IID-420","IMC-260","ING-135","SOC-502","IEL-310","IEL-315","IEL-640","IEL-810","IET-410","IET-415","IMC-920","IMC-925","ING-168","SOC-155","SOC-160","IEL-410","IEL-415","IET-420","IET-425","IET-720","IET-725","IMC-630","IMC-635","IMC-700","SIC-766","ECO-525","IEL-420","IEL-425","IEL-520","IEL-525","IEL-630","IET-540","IET-545","IID-900","IMC-800","IEL-500","IEL-505","IEL-620","IEL-625","IEL-700","IEL-910","IEL-915","IMC-960","IMC-965","SOC-420","ADM-900","IEL-820","IEL-825","IEL-900","IEL-905","IID-025","DPG-010","IEL-930","IEL-940","IEL-950","IEL-955","IEL-960","IEL-970","DPG-020"],"IID":["ARQ-130","ESP-181","IID-105","INF-103","MAT-160","ORI-112","SOC-182","ESP-189","IID-480","IID-481","INF-113","INF-117","ING-105","MAT-170","MED-750","MED-755","ESP-302","IID-420","ING-115","MAT-306","MAT-340","MED-770","MED-774","SOC-114","IID-950","IMC-320","IMC-321","ING-125","MAT-134","MAT-350","SOC-118","SOC-172","IID-522","IID-630","IID-631","ING-135","MAT-190","MAT-191","MAT-360","MAT-370","SOC-502","IID-650","ING-168","MAT-135","MAT-500","MAT-501","SOC-140","SOC-155","SOC-160","IID-285","IID-640","IID-980","IMC-920","IMC-925","MAT-510","MAT-511","SIC-766","ECO-525","IEL-110","IEL-115","IET-110","IET-115","IID-720","IID-725","IID-870","INF-705","INF-706","IID-235","IID-240","IID-241","IID-830","IID-890","IID-915","IID-945","IMC-800","IMC-805","ADM-900","IID-750","IID-810","IID-905","IID-930","IID-935","IID-941","IID-955","ADM-910","DER-675","DPG-010","IID-025","IID-925","IMC-260","DPG-020"],"IET":["ESP-181","IET-101","IET-102","IET-192","IMC-102","MAT-160","MED-750","MED-755","ORI-112","SOC-182","ESP-189","IEL-100","IEL-105","INF-113","INF-117","ING-105","MAT-170","MAT-190","MAT-191","ESP-302","IEL-200","IEL-205","ING-115","MAT-306","MAT-340","MAT-500","MAT-501","SOC-114","IEL-300","IEL-305","IET-310","IET-315","IET-320","IET-325","ING-125","MAT-134","MAT-350","SOC-118","SOC-172","IEL-310","IEL-315","IET-400","IET-405","IET-410","IET-415","IID-420","ING-135","MAT-360","SOC-502","IEL-410","IEL-415","IET-426","IET-427","IET-600","IET-605","IET-670","IET-675","ING-168","SOC-155","SOC-160","IEL-520","IEL-525","IEL-810","IET-546","IET-547","IET-612","IET-702","IET-720","IET-725","SIC-766","ECO-525","IEL-910","IEL-915","IET-741","IET-746","IET-806","IET-807","IET-820","IET-825","IET-830","IET-832","IID-900","IEL-900","IEL-905","IET-700","IET-705","IET-906","IET-907","IET-908","IID-025","ADM-900","IET-810","IET-815","IET-912","IET-914","IET-918","IET-960","IET-965","DPG-010","IET-922","IET-924","IET-930","IET-935","DPG-020"],"IMC":["ARQ-130","ESP-181","IMC-110","INF-103","MAT-160","ORI-112","SOC-182","ESP-189","IMC-100","IMC-105","INF-113","ING-105","MAT-170","MED-750","MED-755","DIB-520","ESP-302","IMC-425","IMC-426","ING-115","MAT-190","MAT-191","MAT-306","MAT-340","SOC-114","IMC-210","IMC-215","IMC-320","IMC-321","IMC-445","ING-125","MAT-134","MAT-350","MAT-500","MAT-501","SOC-118","SOC-172","IEL-110","IEL-115","IMC-260","IMC-300","IMC-305","IMC-420","IMC-530","ING-135","MAT-360","MAT-510","MAT-511","SOC-502","IEL-120","IEL-125","IMC-500","IMC-610","IMC-650","ING-168","SOC-155","SOC-160","IID-420","IMC-480","IMC-630","IMC-635","IMC-700","IMC-920","IMC-925","INF-705","INF-706","SIC-766","ECO-525","IID-810","IMC-010","IMC-015","IMC-670","IMC-675","IMC-810","IMC-815","IMC-820","IMC-950","IEL-900","IEL-905","IEL-910","IEL-915","IID-900","IMC-800","IMC-805","IMC-930","ADM-900","IID-025","IMC-020","IMC-910","IMC-915","IMC-935","IMC-960","IMC-965","DPG-010","IMC-030","IMC-035","IMC-037","IMC-940","IMC-970","DPG-020"],"ICV":["ESP-181","ICV-100","INF-103","ING-105","MAT-160","ORI-112","SOC-114","SOC-182","ESP-189","INF-113","ING-115","MAT-170","MAT-190","MAT-191","MAT-306","MED-750","MED-755","SOC-118","DIB-522","ESP-302","ICV-222","ICV-223","ING-125","MAT-340","MAT-500","MAT-501","ICV-215","ICV-300","ICV-415","ICV-416","ING-135","MAT-350","MAT-510","MAT-511","SOC-502","ICV-240","ICV-245","ICV-305","ICV-460","IEL-400","IEL-405","IID-420","ING-168","MAT-135","MAT-360","ICV-250","ICV-255","ICV-470","ICV-475","ICV-640","ICV-660","ICV-670","IMC-700","SOC-155","ICV-190","ICV-195","ICV-260","ICV-265","ICV-740","ICV-950","ICV-955","SIC-766","ECO-525","ICV-280","ICV-345","ICV-860","ICV-870","ICV-875","MAT-200","SOC-160","ICV-290","ICV-355","ICV-520","ICV-810","ICV-830","ICV-905","SOC-172","ADM-900","ICV-410","ICV-840","ICV-915","ICV-925","ICV-990","DPG-010","ICV-390","ICV-580","ICV-650","ICV-820","ICV-935","ICV-945","DPG-020"],"ARQ":["ARQ-115","ARQ-130","DIB-520","ESP-181","INF-103","MAT-095","ORI-112","SOC-182","ARQ-100","ARQ-205","DIB-530","ESP-189","INF-113","ING-105","INT-115","MAT-100","ARQ-140","ARQ-170","ARQ-210","ARQ-320","ESP-302","ING-115","INT-215","MAT-306","SOC-114","ARQ-122","ARQ-180","ARQ-190","ING-125","MAT-134","MAT-150","MAT-190","MAT-191","SOC-118","SOC-172","ARQ-127","ARQ-230","ARQ-545","DIB-220","DIB-560","ICV-300","ING-135","MAT-170","SOC-502","ARQ-200","ARQ-280","ARQ-605","DIB-250","ICV-305","IEL-380","ING-168","SOC-155","SOC-160","ARQ-110","ARQ-240","ARQ-330","ARQ-365","ARQ-705","ICV-350","SIC-766","ARQ-150","ARQ-290","ARQ-370","ARQ-400","ARQ-470","ARQ-804","ECO-525","ICV-810","ARQ-160","ARQ-340","ARQ-410","ARQ-420","ARQ-500","ARQ-520","ICV-580","ADM-900","ARQ-390","ARQ-450","ARQ-480","ARQ-820","ARQ-430","ARQ-490","ARQ-510","ARQ-700","ARQ-800","ARQ-810","ARQ-460","DPG-010","DPG-020"],"DER":["DER-102","ESP-181","INF-103","MAT-095","ORI-112","SOC-182","DER-125","DER-141","ESP-189","INF-113","ING-105","MAT-100","DER-110","DER-170","DER-489","ESP-302","ING-115","MAT-306","SOC-114","SOC-200","DER-151","DER-160","DER-270","DER-335","DER-982","ING-125","MAT-134","SOC-118","SOC-172","DER-155","DER-190","DER-200","DER-360","DER-450","DER-610","ING-135","SOC-502","DER-210","DER-220","DER-230","DER-240","DER-431","DER-841","DER-965","ING-168","SOC-155","DER-250","DER-285","DER-290","DER-300","DER-320","DER-511","SIC-766","DER-341","DER-351","DER-370","DER-380","DER-391","DER-445","DER-512","ECO-525","DER-401","DER-410","DER-420","DER-509","DER-518","DER-790","DER-950","ADM-900","DER-514","DER-560","DER-620","DER-700","DER-515","DER-753","DER-763","DER-765","DER-924","DPG-010","DPG-020"],"COM":["CCO-106","ESP-181","INF-103","MAT-095","ORI-112","SOC-182","SOC-200","CCO-100","ESP-189","INF-113","ING-105","MAT-100","SIC-100","SOC-400","CCO-115","CCO-490","ECO-100","ESP-260","ESP-302","ING-115","MAT-306","SOC-114","CCO-130","CCO-251","DER-170","ECO-310","ING-125","MAT-134","SOC-118","SOC-172","ADM-160","CCO-145","CCO-252","CCO-500","CCO-502","ING-135","SOC-502","CCO-155","CCO-223","CCO-280","CCO-602","ING-168","SOC-155","SOC-160","CCO-185","CCO-515","CCO-702","CCO-704","CCO-706","MER-100","SIC-766","CCO-340","CCO-700","CCO-802","CCO-804","CCO-806","CCO-808","ECO-525","CCO-176","CCO-355","CCO-705","CCO-904","CCO-906","ADM-900","CCO-258","CCO-908","CCO-914","CCO-920","CCO-225","CCO-912","DPG-010","DPG-020"],"LEX":["ESP-181","INF-103","ING-152","LEX-100","MAT-095","ORI-112","SOC-182","EDU-100","ESP-189","FRA-252","INF-113","ING-252","MAT-100","EDU-110","ESP-302","FRA-352","ING-322","MAT-306","SOC-114","ESP-260","FRA-402","ING-426","MAT-134","SIC-100","SOC-118","SOC-172","FRA-502","ING-260","ING-310","ING-502","SIC-220","SOC-502","FRA-602","FRA-604","FRA-606","ING-261","ING-330","ING-602","ING-604","SOC-155","SOC-160","EDU-172","FRA-702","FRA-704","FRA-706","FRA-708","ING-440","SIC-766","ECO-525","EDU-202","FRA-220","ING-390","ING-504","ING-800","ITA-106","FRA-170","FRA-504","FRA-900","ING-900","ING-902","ITA-116","ADM-900","FRA-902","ING-904","ING-906","ITA-118","LMO-120","DPG-010","FRA-904","FRA-906","LEX-904","DPG-020"],"PSI":["ESP-181","INF-103","MAT-095","MED-010","MED-100","ORI-112","SIC-102","SOC-182","ESP-189","INF-113","ING-105","MAT-100","SIC-222","SIC-320","ESP-302","ING-115","MAT-306","SIC-110","SIC-302","SIC-304","SOC-114","ING-125","MAT-134","SIC-402","SIC-755","SIC-830","SOC-118","SOC-172","ING-135","SIC-131","SIC-161","SIC-502","SIC-504","SIC-506","SOC-502","ING-168","SIC-010","SIC-220","SIC-600","SIC-605","SIC-855","SOC-155","SIC-700","SIC-702","SIC-704","SIC-766","SIC-850","SIC-910","SIC-923","ECO-525","SIC-241","SIC-802","SIC-804","SIC-806","SIC-902","SIC-904","SIC-906","SIC-908","SIC-912","ADM-900","SIC-914","SIC-916","DPG-010","SIC-918","DPG-020"],"ADM":["ADM-112","ADM-160","CON-118","ESP-181","INF-103","MAT-095","ORI-112","SOC-182","ADM-181","CON-119","ECO-100","ESP-189","INF-113","ING-105","MAT-100","ADM-165","CON-120","ECO-110","ESP-302","ING-115","MAT-306","SOC-114","ADM-197","CON-500","ECO-120","ING-125","MAT-134","MER-100","SOC-118","SOC-172","ADM-116","ADM-198","ADM-510","ING-135","MAT-180","SOC-502","ADM-415","ADM-558","ADM-680","ING-168","MER-126","SOC-155","SOC-160","ADM-142","ADM-260","ADM-420","ADM-710","MER-145","SIC-766","ADM-170","ADM-201","ADM-317","ADM-805","ADM-806","CON-106","ADM-291","ADM-390","ADM-650","ADM-702","ECO-250","ADM-185","ADM-292","ADM-319","ADM-900","ADM-620","DPG-010","DPG-020"],"ATH":["ADM-160","CON-118","ESP-181","INF-103","MAT-095","ORI-112","SOC-182","TUR-096","CON-119","ECO-100","ESP-189","INF-113","ING-105","MAT-100","SOC-114","TUR-101","ECO-120","ESP-302","ING-115","MAT-306","SOC-118","TUR-200","TUR-420","FRA-100","ING-125","MAT-134","MAT-180","SOC-172","TUR-102","TUR-230","ADM-197","FRA-110","ING-135","MAT-130","SOC-502","TUR-210","TUR-220","TUR-500","FRA-132","ING-168","SOC-155","SOC-160","SOC-480","TUR-103","TUR-430","TUR-440","TUR-445","ING-145","SIC-766","TUR-104","TUR-140","TUR-450","TUR-455","TUR-530","TUR-710","ALE-100","ECO-525","MER-100","TUR-105","TUR-400","TUR-700","TUR-810","ALE-110","DER-860","TUR-122","TUR-900","TUR-911","ADM-291","ADM-900","ITA-100","TUR-180","ADM-422","DPG-010","ITA-110","TUR-205","DPG-020"],"CON":["ADM-160","CON-111","CON-118","ESP-181","INF-103","MAT-095","ORI-112","SOC-182","ADM-181","CON-119","ECO-100","ESP-189","INF-113","ING-105","MAT-100","CON-120","ECO-110","ESP-302","ING-115","MAT-306","SOC-114","CON-103","ECO-120","ESP-210","ING-125","MAT-134","MAT-180","MER-100","SOC-118","SOC-172","CON-305","CON-370","CON-500","ING-135","MAT-170","SOC-502","CON-306","CON-335","CON-470","DER-850","INF-406","ING-168","MAT-130","SOC-155","SOC-160","CON-307","CON-702","CON-704","CON-706","INF-408","MAT-140","SIC-766","ADM-197","CON-204","CON-802","CON-804","ECO-230","ECO-525","ADM-260","CON-117","CON-206","ECO-280","ADM-900","CON-208","CON-322","ECO-520","SOC-480","ADM-291","CON-906","CON-907","DPG-010","ECO-250","DPG-020"],"MER":["CON-118","ECO-100","ESP-181","INF-103","MAT-095","MER-102","ORI-112","SOC-182","ADM-160","CON-119","ECO-110","ESP-189","INF-113","ING-105","MAT-100","MER-100","ECO-120","ESP-302","ING-115","MAT-306","MER-210","SOC-114","ADM-181","ING-125","MAT-134","MER-402","MER-430","SIC-102","SOC-118","SOC-172","ING-135","MAT-130","MAT-180","MER-507","MER-520","SOC-502","ING-168","MAT-140","MER-126","MER-145","SOC-155","SOC-160","MER-151","MER-170","MER-706","MER-707","MER-810","SIC-766","ADM-260","ECO-525","MER-310","MER-370","MER-801","MER-802","MER-385","MER-505","MER-901","MER-902","MER-930","ADM-900","MER-345","MER-903","MER-904","MER-905","MER-940","DPG-010","MER-326","MER-365","MER-506","MER-950","DPG-020"],"BIO":["BIO-100","ESP-181","INF-103","MAT-095","MED-010","MED-100","ORI-112","SOC-182","ESP-189","INF-113","ING-105","MAT-100","MED-750","MED-755","SOC-114","BIO-112","ESP-302","ING-115","MAT-190","MAT-191","MAT-306","MED-760","MED-765","ING-125","MAT-134","MED-160","MED-401","MED-770","MED-774","SOC-118","SOC-172","BIO-720","ENF-625","FAR-500","ING-135","MED-192","MED-197","MED-395","MED-396","MED-397","MED-398","SOC-502","BIO-600","BIO-605","FAR-400","FAR-405","ING-168","MED-280","MED-606","MED-607","MED-880","SOC-155","SOC-160","BIO-200","BIO-205","BIO-220","BIO-225","BIO-310","BIO-315","FAR-530","FAR-535","SIC-766","BIO-210","BIO-215","BIO-240","BIO-245","BIO-400","BIO-415","ECO-525","FAR-620","FAR-625","MED-506","BIO-420","BIO-425","BIO-430","BIO-435","BIO-630","BIO-635","BIO-650","BIO-655","ADM-900","BIO-250","BIO-255","BIO-320","BIO-325","BIO-640","BIO-645","BIO-701","BIO-801","DPG-010","BIO-702","BIO-802","DPG-020"],"ODO":["ESP-181","INF-103","MAT-095","MED-010","MED-100","ODO-100","ORI-112","SOC-182","ESP-189","INF-113","ING-105","MAT-100","MED-200","MED-395","MED-396","MED-397","MED-398","ESP-302","ING-115","MAT-306","MED-172","MED-175","MED-272","MED-274","MED-750","MED-755","ODO-110","SOC-114","ING-125","MAT-134","MED-770","MED-774","MED-860","MED-865","ODO-210","ODO-404","SOC-118","SOC-172","ING-135","MED-192","MED-197","MED-300","MED-305","ODO-010","ODO-130","ODO-190","ODO-502","ODO-701","SOC-502","ING-168","MED-606","MED-607","ODO-020","ODO-120","ODO-150","ODO-160","ODO-180","ODO-230","SOC-155","SOC-160","ODO-030","ODO-140","ODO-151","ODO-161","ODO-181","ODO-200","ODO-220","ODO-702","ODO-704","SIC-766","ECO-525","ODO-170","ODO-300","ODO-400","ODO-401","ODO-500","ADM-900","ODO-301","ODO-402","DPG-010","ODO-302","ODO-501","DPG-020"],"VET":["ESP-181","INF-103","MAT-095","MED-010","MED-100","ORI-112","SOC-182","VET-102","ESP-189","INF-113","ING-105","MAT-100","VET-221","VET-226","VET-240","VET-245","VET-281","ESP-302","ING-115","MAT-306","MED-750","MED-755","SOC-114","VET-110","VET-112","VET-200","VET-205","VET-705","VET-706","ING-125","MAT-134","MED-192","MED-197","MED-770","MED-774","SOC-118","SOC-172","VET-400","VET-402","VET-404","VET-406","VET-710","VET-715","ING-135","SOC-502","VET-180","VET-185","VET-213","VET-214","VET-380","VET-385","VET-610","VET-615","VET-630","VET-631","VET-670","ING-168","MED-160","MED-860","MED-865","SOC-155","SOC-160","VET-626","VET-627","VET-890","VET-895","VET-950","VET-955","MED-272","MED-274","SIC-766","VET-137","VET-138","VET-310","VET-315","VET-421","VET-422","VET-708","VET-771","VET-775","VET-915","VET-920","ECO-525","VET-140","VET-144","VET-195","VET-545","VET-546","VET-620","VET-622","VET-635","VET-800","VET-880","VET-145","VET-147","VET-300","VET-640","VET-645","VET-660","VET-680","VET-874","VET-970","ADM-900","VET-320","VET-330","VET-500","VET-505","VET-510","VET-511","VET-815","VET-817","VET-960","DPG-010","VET-340","VET-345","VET-350","VET-355","VET-360","VET-370","DPG-020"]};
/* <</ACH-DATA>> */

/** Logros ganados según lo que UTESA dijo que sigue pendiente (verificado por inicio de sesión directo). */
/** "INF-117-001", "inf117", "INF 117" → "INF-117" (el portal a veces agrega la sección o quita el guion). */
function normCode(raw) {
  const m = String(raw).toUpperCase().match(/([A-Z]{2,4})\s?[-–]?\s?(\d{3})/);
  return m ? `${m[1]}-${m[2]}` : null;
}

/**
 * Logros de una persona: si tenemos guardado lo que UTESA dijo que le falta, se recalculan AHORA con la lista
 * actual de logros (así los logros nuevos aparecen sin volver a vincular). Cuentas verificadas antes de guardar
 * los pendientes conservan la lista que se calculó en su momento.
 */
function liveEarned(row) {
  if (!row.verified_at) return [];
  if (row.verified_pending) {
    try { return computeEarned(row.career, JSON.parse(row.verified_pending)).earned; } catch { /* usa la guardada */ }
  }
  try { return JSON.parse(row.earned || "[]"); } catch { return []; }
}

/** % de la carrera aprobado (0-100) según lo que UTESA dijo que falta; null si la cuenta no está verificada. */
function progressPct(row) {
  if (!row || !row.verified_at || !row.verified_pending || !row.career) return null;
  const codes = CAREER_CODES[row.career];
  if (!codes || !codes.length) return null;
  let pend;
  try { pend = JSON.parse(row.verified_pending); } catch { return null; }
  const inCareer = new Set(codes);
  const known = pend.filter(c => inCareer.has(c));
  if (pend.length && known.length / pend.length < 0.6) return null; // la carrera elegida no coincide con la de UTESA
  return Math.max(0, Math.min(100, Math.round(100 * (codes.length - known.length) / codes.length)));
}

function computeEarned(career, pending) {
  const codes = CAREER_CODES[career];
  if (!codes) return { earned: [], mismatch: true };
  const inCareer = new Set(codes);
  const pend = new Set(pending);
  const known = pending.filter(c => inCareer.has(c)).length;
  if (pending.length && known / pending.length < 0.6) return { earned: [], mismatch: true }; // la carrera elegida no coincide con la de UTESA
  return { earned: [...ACH_CODES].filter(c => inCareer.has(c) && !pend.has(c)), mismatch: false };
}

const CAREERS = new Set(["ISC", "IEL", "IID", "IET", "IMC", "ICV", "ARQ", "DER", "COM", "LEX", "PSI", "ADM", "ATH", "CON", "MER", "BIO", "ODO", "VET"]);
const JWKS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

let jwks = { keys: [], at: 0 };
async function googleKeys(force) {
  if (!force && jwks.keys.length && Date.now() - jwks.at < 3600e3) return jwks.keys;
  const r = await fetch(JWKS_URL);
  if (!r.ok) throw new Error("jwks");
  jwks = { keys: (await r.json()).keys || [], at: Date.now() };
  return jwks.keys;
}
const b64u = (s) => { s = s.replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; return Uint8Array.from(atob(s), c => c.charCodeAt(0)); };
const jsonOf = (s) => JSON.parse(new TextDecoder().decode(b64u(s)));

/** Devuelve { uid, email, verified } del token de Firebase, o null si no es válido. */
async function verifyClaims(token) {
  try {
    const [h, p, s] = String(token || "").split(".");
    if (!h || !p || !s) return null;
    const head = jsonOf(h);
    if (head.alg !== "RS256") return null;
    let jwk = (await googleKeys(false)).find(k => k.kid === head.kid);
    if (!jwk) jwk = (await googleKeys(true)).find(k => k.kid === head.kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64u(s), new TextEncoder().encode(`${h}.${p}`));
    if (!ok) return null;
    const c = jsonOf(p);
    const now = Math.floor(Date.now() / 1000);
    if (c.aud !== FB_PROJECT || c.iss !== `https://securetoken.google.com/${FB_PROJECT}`) return null;
    if (!c.sub || typeof c.sub !== "string" || c.sub.length > 128 || c.exp < now || c.iat > now + 300) return null;
    return { uid: c.sub, email: typeof c.email === "string" ? c.email.toLowerCase() : "", verified: c.email_verified === true };
  } catch { return null; }
}
/** Devuelve el uid del token de Firebase, o null si no es válido. */
async function verifyToken(token) {
  const c = await verifyClaims(token);
  return c ? c.uid : null;
}

let schemaReady = false;
async function ensureSchema(db) {
  if (schemaReady) return;
  await db.prepare(`CREATE TABLE IF NOT EXISTS users (
    uid TEXT PRIMARY KEY,
    name TEXT, career TEXT, theme TEXT, avatar TEXT, avatar_bg TEXT,
    done TEXT NOT NULL DEFAULT '[]',
    utesa_sync TEXT,
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
  )`).run();
  // columnas añadidas después (si ya existen, SQLite avisa y se ignora)
  for (const col of ["pid TEXT", "frame TEXT", "earned TEXT NOT NULL DEFAULT '[]'", "verified_at INTEGER", "verified_pending TEXT",
    "is_mod INTEGER NOT NULL DEFAULT 0", "is_owner INTEGER NOT NULL DEFAULT 0", "dir_hidden INTEGER NOT NULL DEFAULT 0",
    "last_seen INTEGER", "hide_online INTEGER NOT NULL DEFAULT 0", "verified_src TEXT"]) {
    try { await db.prepare(`ALTER TABLE users ADD COLUMN ${col}`).run(); } catch { /* ya existe */ }
  }
  try { await db.prepare("ALTER TABLE messages ADD COLUMN hidden_at INTEGER").run(); } catch { /* ya existe o la tabla aún no existe */ }
  await db.batch([
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS users_pid ON users(pid)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT, room TEXT NOT NULL, uid TEXT NOT NULL, text TEXT NOT NULL,
      created_at INTEGER NOT NULL, hidden INTEGER NOT NULL DEFAULT 0)`),
    db.prepare("CREATE INDEX IF NOT EXISTS messages_room ON messages(room, id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS messages_uid ON messages(uid, created_at)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS reports (
      message_id INTEGER NOT NULL, reporter_uid TEXT NOT NULL, reason TEXT, created_at INTEGER NOT NULL,
      PRIMARY KEY (message_id, reporter_uid))`),
    db.prepare("CREATE TABLE IF NOT EXISTS blocks (uid TEXT NOT NULL, blocked_pid TEXT NOT NULL, PRIMARY KEY (uid, blocked_pid))"),
    db.prepare("CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT)"),
    db.prepare("CREATE TABLE IF NOT EXISTS friendships (from_uid TEXT NOT NULL, to_uid TEXT NOT NULL, status TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (from_uid, to_uid))"),
    db.prepare("CREATE INDEX IF NOT EXISTS friendships_to ON friendships(to_uid)"),
    db.prepare("CREATE TABLE IF NOT EXISTS dm_reads (uid TEXT NOT NULL, room TEXT NOT NULL, last_id INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (uid, room))"),
    db.prepare("CREATE INDEX IF NOT EXISTS users_career ON users(career)"),
    db.prepare("CREATE TABLE IF NOT EXISTS chat_groups (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, owner_uid TEXT NOT NULL, created_at INTEGER NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS group_members (gid INTEGER NOT NULL, uid TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'member', joined_at INTEGER NOT NULL, PRIMARY KEY (gid, uid))"),
    db.prepare("CREATE INDEX IF NOT EXISTS group_members_uid ON group_members(uid)"),
    db.prepare("CREATE TABLE IF NOT EXISTS banned (uid TEXT PRIMARY KEY, at INTEGER NOT NULL)"),
  ]);
  for (const col of ["hidden_at INTEGER", "hidden_by TEXT", "edited_at INTEGER"]) {
    try { await db.prepare(`ALTER TABLE messages ADD COLUMN ${col}`).run(); } catch { /* ya existe */ }
  }
  schemaReady = true;
}

/* ============================================================
   Moderación por reglas: las malas palabras se enmascaran con asteriscos
   (la lista se edita en tools/malas-palabras.txt y se inyecta con tools/build-worker-data.mjs)
   ============================================================ */
/* <<BAD-WORDS>> */
const BAD_WORDS = ["puta*","puto*","putear","hijueputa*","hijoeputa*","hijodeputa","hdp","mierda*","mierdoso","joder","jodete","jodas","joda","jodiste","jodon*","jodanse","jodido*","jodida*","jodiendo","jodienda","coño*","puñeta*","puneta*","puñetero*","carajo*","cabron*","cabrona*","pendejo*","pendeja*","gilipollas","gilipolla","imbecil*","idiota*","estupido*","estupida*","retrasado*","retrasada*","tarado*","tarada*","subnormal*","mongolico*","maricon*","maricona*","marica*","marico*","zorra*","malparido*","malparida*","gonorrea","cagar","cagada*","cagon*","cago","verga","vergas","vergazo*","pinga","pingas","pingazo*","culo","culos","culiao","culiado","chingar*","chinga*","chingada*","chingon*","chingue*","pajero*","pajera*","mamabicho*","mamaguevo*","mamahuevo*","guevo*","guevon*","huevon*","ctm","ptm","csm","rmtm","mmg","mmñ","mmgv","nema","ñema*","mamañema*","mamanema*","singao*","singar*","singate","singona*","singaera*","pajuo*","pajua*","pariguayo*","pariguaya*","mardito*","mardita*","tigueraje","bellaquear","lambeculo*","lambon*","fuck*","fck","fuk","shit*","bitch*","asshole*","motherfucker*","bastard*","pussy","dick","cunt","slut","whore"];
const SAFE_WORDS = ["putativo","putativa","shitake","shiitake","cuerpo","cuerda","cuerdas","cuerdo"];
const SAFE_EXACT = new Set(["mg","mm"]);
/* <</BAD-WORDS>> */

const LEET = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s" };
/** Pasa una palabra a su forma comparable: sin mayúsculas ni acentos (la ñ se conserva), sin trucos de números y sin letras repetidas. */
function normWord(w) {
  let t = String(w).toLowerCase().replace(/ñ/g, "\u0001").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\u0001/g, "ñ");
  if (/\p{L}/u.test(t)) t = t.replace(/[013457@$]/g, (c) => LEET[c]);
  return t.replace(/(.)\1+/g, "$1");
}
const BAD_EXACT = new Set(), BAD_PREFIX = [], SAFE = new Set(SAFE_WORDS.map(normWord));
for (const raw of BAD_WORDS) {
  if (raw.includes(" ")) continue; // las frases se cubren por sus palabras sueltas
  if (raw.endsWith("*")) BAD_PREFIX.push(normWord(raw.slice(0, -1))); else BAD_EXACT.add(normWord(raw));
}
const isBad = (token) => {
  if (SAFE_EXACT.has(String(token).toLowerCase())) return false; // p. ej. "mg" (miligramos) sí; "mmg" no
  const n = normWord(token);
  if (n.length < 2 || SAFE.has(n)) return false;
  return BAD_EXACT.has(n) || BAD_PREFIX.some(p => n.startsWith(p));
};

/** Devuelve { text, flagged }: el texto con las malas palabras cambiadas por ****. */
function maskProfanity(text) {
  let flagged = false;
  // 1) palabra por palabra
  let out = String(text).replace(/[\p{L}\p{N}@$]+/gu, (tok) => {
    if (isBad(tok)) { flagged = true; return "*".repeat(tok.length); }
    return tok;
  });
  // 2) letras separadas para esquivar el filtro: "p u t a", "p.u.t.a"
  out = out.replace(/(?<![\p{L}])((?:\p{L}[ .\-_*]+){2,}\p{L})(?![\p{L}])/gu, (m) => {
    if (isBad(m.replace(/[ .\-_*]+/g, ""))) { flagged = true; return m.replace(/\p{L}/gu, "*"); }
    return m;
  });
  return { text: out, flagged };
}

/* Artículos exclusivos del creador de personajes (solo equipo): xh corona/casco, xg visor, xb prenda, xw alas, xa aura. */
const EXCL_KEYS = ["xh", "xg", "xb", "xw", "xa"];
const exclOf = (av) => {
  if (typeof av !== "string" || !av.startsWith("c1:")) return "";
  try { const o = JSON.parse(av.slice(3)); return EXCL_KEYS.map(k => (Number.isInteger(o[k]) && o[k] > 0 ? o[k] : 0)).join(","); } catch { return ""; }
};
const hasExcl = (av) => exclOf(av).split(",").some(v => v !== "" && v !== "0");
function stripExcl(av) {
  if (typeof av !== "string" || !av.startsWith("c1:")) return av;
  try { const o = JSON.parse(av.slice(3)); for (const k of EXCL_KEYS) delete o[k]; return "c1:" + JSON.stringify(o); } catch { return av; }
}

const CODE = /^[A-Z]{2,4}-\d{3}$/;
/** Valida y normaliza los campos permitidos. Devuelve {col: valor} o un texto de error. */
function cleanFields(f) {
  if (!f || typeof f !== "object" || Array.isArray(f)) return "Datos no válidos.";
  const out = {};
  if ("name" in f) {
    const v = String(f.name || "").replace(/\s+/g, " ").trim();
    if (!v || v.length > 60) return "Nombre no válido.";
    if (maskProfanity(v).flagged) return "Ese nombre no está permitido. Usa tu nombre real.";
    out.name = v;
  }
  if ("career" in f) {
    if (!CAREERS.has(f.career)) return "Carrera no válida.";
    out.career = f.career;
  }
  if ("theme" in f) {
    if (typeof f.theme !== "string" || f.theme.length > 30) return "Tema no válido.";
    out.theme = f.theme;
  }
  if ("avatar" in f) {
    if (f.avatar != null && (typeof f.avatar !== "string" || f.avatar.length > 4000)) return "Avatar no válido.";
    out.avatar = f.avatar ?? null;
  }
  if ("avatarBg" in f) {
    if (f.avatarBg != null && (typeof f.avatarBg !== "string" || f.avatarBg.length > 200)) return "Fondo no válido.";
    out.avatar_bg = f.avatarBg ?? null;
  }
  if ("frame" in f) {
    if (f.frame === null) out.frame = null;
    else if (typeof f.frame === "string" && (ACH_CODES.has(f.frame) || /^MOD-[1-5]$/.test(f.frame))) out.frame = f.frame;
    else return "Marco no válido.";
  }
  if ("hideOnline" in f) {
    if (typeof f.hideOnline !== "boolean") return "Dato no válido.";
    out.hide_online = f.hideOnline ? 1 : 0;
  }
  if ("dirHidden" in f) {
    if (typeof f.dirHidden !== "boolean") return "Dato no válido.";
    out.dir_hidden = f.dirHidden ? 1 : 0;
  }
  if ("done" in f) {
    if (!Array.isArray(f.done) || f.done.length > 400 || !f.done.every(c => typeof c === "string" && CODE.test(c))) return "Materias no válidas.";
    out.done = JSON.stringify([...new Set(f.done)]);
  }
  if ("utesaSync" in f) {
    if (f.utesaSync === null) out.utesa_sync = null;
    else {
      const s = JSON.stringify(f.utesaSync);
      if (typeof f.utesaSync !== "object" || Array.isArray(f.utesaSync) || s.length > 600) return "Sincronización no válida.";
      out.utesa_sync = s;
    }
  }
  return out;
}

const userOut = (r) => ({
  name: r.name, career: r.career, theme: r.theme || null, avatar: r.avatar || null, avatarBg: r.avatar_bg || null,
  done: JSON.parse(r.done || "[]"), utesaSync: r.utesa_sync ? JSON.parse(r.utesa_sync) : null, createdAt: r.created_at,
  frame: r.frame || null, earned: liveEarned(r), verifiedAt: r.verified_at || null, pid: r.pid || null,
  pct: progressPct(r),
  dirHidden: !!r.dir_hidden, hideOnline: !!r.hide_online,
  verifiedVia: r.verified_at ? (r.verified_src || "direct") : null,
  needsRelink: !!(r.verified_at && !r.verified_pending), // verificó antes de que se guardaran los pendientes: conviene volver a vincular una vez
});

async function userApi(request, env) {
  const a = await authed(request, env, false);
  if (isResp(a)) return a;
  const { uid, row, admin, owner } = a;

  if (request.method === "GET") {
    return row ? reply(200, { ok: true, user: { ...userOut(row), admin, owner } }) : fail(404, "sin-perfil", "Aún no hay perfil.");
  }

  if (request.method === "PUT") {
    const origin = request.headers.get("origin") || "";
    try { if (!origin || new URL(origin).host !== new URL(request.url).host) return fail(403, "origen", "Petición no permitida."); }
    catch { return fail(403, "origen", "Petición no permitida."); }
    const raw = await request.text();
    if (raw.length > 12000) return fail(413, "entrada", "Datos demasiado largos.");
    let body;
    try { body = JSON.parse(raw); } catch { return fail(400, "entrada", "Datos no válidos."); }
    const f = cleanFields(body && body.fields);
    if (typeof f === "string") return fail(400, "entrada", f);
    if (f.avatar && !admin && hasExcl(f.avatar) && exclOf(f.avatar) !== exclOf(row && row.avatar)) return fail(403, "exclusivo", "Esos artículos son exclusivos del equipo de moderación.");
    const now = Date.now();

    if (!row) {
      // crear: hace falta al menos nombre y carrera
      if (!f.name || !f.career) return fail(409, "sin-perfil", "Primero crea tu perfil.");
      const created = Number.isFinite(body.createdAt) && body.createdAt > 0 && body.createdAt <= now ? Math.floor(body.createdAt) : now;
      await env.DB.prepare(
        "INSERT INTO users (uid,pid,name,career,theme,avatar,avatar_bg,done,utesa_sync,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)"
      ).bind(uid, await pidOf(uid), f.name, f.career, f.theme ?? null, f.avatar ?? null, f.avatar_bg ?? null, f.done ?? "[]", f.utesa_sync ?? null, created, now).run();
    } else {
      if (f.frame && f.frame.startsWith("MOD-")) {
        if (!admin) return fail(403, "marco", "Ese marco es exclusivo del equipo de moderación.");
      } else if (f.frame) {
        const mine = liveEarned(row);
        if (!mine.includes(f.frame)) return fail(403, "marco", "Ese marco aún no es tuyo. Vincula con UTESA para desbloquearlo.");
      }
      if (f.career && f.career !== row.career) { f.earned = "[]"; f.verified_at = null; f.verified_pending = null; f.frame = null; } // otra carrera: los logros se verifican de nuevo
      const cols = Object.keys(f);
      if (cols.length) {
        await env.DB.prepare(`UPDATE users SET ${cols.map(c => `${c} = ?`).join(", ")}, updated_at = ? WHERE uid = ?`)
          .bind(...cols.map(c => f[c]), now, uid).run();
      }
    }
    return reply(200, { ok: true });
  }

  return fail(405, "metodo", "Método no permitido.");
}

/* ============================================================
   Red social: chats (general y por carrera), perfiles públicos y moderación
   ============================================================ */
const enc = new TextEncoder();
async function pidOf(uid) {
  const d = await crypto.subtle.digest("SHA-256", enc.encode(`malla-utesa|${uid}`));
  return [...new Uint8Array(d)].slice(0, 8).map(b => b.toString(16).padStart(2, "0")).join("");
}

/** Autentica y devuelve { uid, row, admin } o una Response de error. Garantiza que el usuario tenga pid. */
async function authed(request, env, needProfile = true) {
  if (!env.DB) return fail(503, "base", "La base de datos no está configurada.");
  const authz = request.headers.get("authorization") || "";
  const claims = await verifyClaims(authz.startsWith("Bearer ") ? authz.slice(7) : "");
  if (!claims) return fail(401, "sesion", "Sesión no válida. Vuelve a iniciar sesión.");
  const uid = claims.uid;
  await ensureSchema(env.DB);
  let row = await env.DB.prepare("SELECT * FROM users WHERE uid = ?").bind(uid).first();
  if (!row && (await env.DB.prepare("SELECT 1 FROM banned WHERE uid = ?").bind(uid).first())) return fail(403, "eliminada", "Esta cuenta fue eliminada por la administración.");
  if (!row && needProfile) return fail(409, "sin-perfil", "Primero crea tu perfil.");
  if (row && !row.pid) {
    row.pid = await pidOf(uid);
    await env.DB.prepare("UPDATE users SET pid = ? WHERE uid = ?").bind(row.pid, uid).run();
  }
  const list = (v) => String(v || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
  // por correo solo si Firebase confirma que ese correo es de quien inició sesión (Google o correo verificado)
  // el dueño se define en las variables del servidor (ADMIN_EMAILS / ADMIN_UIDS); los moderadores los gestiona el dueño desde la web
  const owner = list(env.ADMIN_UIDS).includes(uid.toLowerCase()) || (claims.verified && claims.email !== "" && list(env.ADMIN_EMAILS).includes(claims.email));
  if (row && !!row.is_owner !== owner) {
    row.is_owner = owner ? 1 : 0;
    await env.DB.prepare("UPDATE users SET is_owner = ? WHERE uid = ?").bind(row.is_owner, uid).run();
  }
  if (row && Date.now() - (row.last_seen || 0) > 60000) { // "en línea": se anota cada minuto que la persona usa la app
    row.last_seen = Date.now();
    await env.DB.prepare("UPDATE users SET last_seen = ? WHERE uid = ?").bind(row.last_seen, uid).run();
  }
  const admin = owner || !!(row && row.is_mod);
  return { uid, row, admin, owner };
}
const isResp = (x) => x instanceof Response;

function sameOrigin(request) {
  const origin = request.headers.get("origin") || "";
  try { return !!origin && new URL(origin).host === new URL(request.url).host; } catch { return false; }
}

const roomKey = (name, career) => (name === "general" ? "general" : name === "carrera" && career ? `c:${career}` : null);
const dmRoom = (a, b) => "dm:" + [a, b].sort().join(":");
/** Sala pedida por el cliente -> clave interna. "dm:<pid>" solo existe entre amigos aceptados. */
async function resolveRoom(env, uid, row, name) {
  const m = /^dm:([0-9a-f]{16})$/.exec(String(name || ""));
  const g = /^g:(\d{1,9})$/.exec(String(name || ""));
  if (g) return (await env.DB.prepare("SELECT 1 FROM group_members WHERE gid = ? AND uid = ?").bind(Number(g[1]), uid).first()) ? `g:${g[1]}` : null;
  if (!m) return roomKey(name, row.career);
  if (m[1] === row.pid) return null;
  const peer = await env.DB.prepare("SELECT uid FROM users WHERE pid = ?").bind(m[1]).first();
  if (!peer) return null;
  const f = await env.DB.prepare("SELECT 1 FROM friendships WHERE status = 'accepted' AND ((from_uid = ? AND to_uid = ?) OR (from_uid = ? AND to_uid = ?))").bind(uid, peer.uid, peer.uid, uid).first();
  return f ? dmRoom(row.pid, m[1]) : null;
}
const cleanText = (s) => String(s || "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200C\u200E-\u200F‪-‮⁦-⁩]/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();

const roleOf = (r) => (r.is_owner ? "owner" : r.is_mod ? "mod" : null);
const EDIT_WINDOW = 5 * 60 * 1000; // quien escribió puede editar durante 5 minutos
const msgOut = (r, admin = false) => ({
  id: r.id, text: r.hidden ? "" : r.text, at: r.created_at,
  pid: r.pid, name: r.name, career: r.career, avatar: r.avatar || null, avatarBg: r.avatar_bg || null, frame: r.frame || null,
  hidden: r.hidden ? (r.hidden_by === "mod" ? "mod" : "self") : null, // el texto original nunca sale
  edited: r.edited_at || null,
  pct: progressPct(r), role: roleOf(r),
  ...(admin && r.hidden && r.hidden_by === "mod" ? { adminText: r.text } : {}),
});

/** Quiénes de los que escriben en esta sala están en línea ahora (respeta «ocultar mi estado»). */
async function onlineIn(env, room) {
  const { results } = await env.DB.prepare(
    "SELECT u.pid, u.last_seen FROM users u WHERE u.last_seen > ? AND COALESCE(u.hide_online,0) = 0 AND u.pid IS NOT NULL AND u.uid IN (SELECT uid FROM (SELECT uid FROM messages WHERE room = ? ORDER BY id DESC LIMIT 150))"
  ).bind(Date.now() - 3600000, room).all();
  return Object.fromEntries(results.map(r => [r.pid, r.last_seen])); // pid -> última vez visto; el cliente decide "en línea" con la misma regla en todas partes
}

/** ¿La sala privada pedida era con alguien que ya fue eliminado? */
async function goneRoom(env, name) {
  const m = /^dm:([0-9a-f]{16})$/.exec(String(name || ""));
  return !!m && !(await env.DB.prepare("SELECT 1 FROM users WHERE pid = ?").bind(m[1]).first());
}

async function chatApi(request, env, sub) {
  const a = await authed(request, env);
  if (isResp(a)) return a;
  const { uid, row, admin, owner } = a;
  const url = new URL(request.url);

  // --- mensajes ---
  if (sub === "" && request.method === "GET") {
    const room = await resolveRoom(env, uid, row, url.searchParams.get("room"));
    if (!room) return (await goneRoom(env, url.searchParams.get("room"))) ? fail(410, "eliminado", "Usuario eliminado") : fail(400, "sala", "Sala no válida.");
    const after = Math.max(0, parseInt(url.searchParams.get("after") || "0", 10) || 0);
    const since = Math.max(0, parseInt(url.searchParams.get("since") || "0", 10) || 0);
    const before = Math.max(0, parseInt(url.searchParams.get("before") || "0", 10) || 0);
    const wantOn = url.searchParams.get("on") === "1";
    const now = Date.now();
    const ep = await env.DB.prepare("SELECT v FROM meta WHERE k = 'chat_epoch'").first();
    const epoch = ep ? String(ep.v) : "0"; // cambia cuando se borra todo el chat: los clientes se reinician solos
    const colsAll = "m.id, m.text, m.created_at, m.hidden, m.hidden_by, m.edited_at, u.pid, u.name, u.career, u.avatar, u.avatar_bg, u.frame, u.verified_at, u.verified_pending, u.is_mod, u.is_owner";
    if (before > 0) {
      // mensajes más antiguos (al subir con el scroll)
      const older = await env.DB.prepare(
        `SELECT ${colsAll} FROM messages m JOIN users u ON u.uid = m.uid
          WHERE m.room = ? AND m.id < ? AND (u.pid IS NULL OR u.pid NOT IN (SELECT blocked_pid FROM blocks WHERE uid = ?))
          ORDER BY m.id DESC LIMIT 40`
      ).bind(room, before, uid).all();
      return reply(200, { ok: true, me: row.pid, admin, now, epoch, seen: wantOn ? await onlineIn(env, room) : undefined, more: older.results.length === 40, messages: older.results.reverse().map(r => msgOut(r, admin)) });
    }
    let removed = [], hiddenNow = [], edited = [];
    const cols = "m.id, m.text, m.created_at, m.hidden, m.hidden_by, m.edited_at, u.pid, u.name, u.career, u.avatar, u.avatar_bg, u.frame, u.verified_at, u.verified_pending, u.is_mod, u.is_owner";
    if (since > 0) {
      // cambios en mensajes que el chat ya tiene: ocultados (ahora quedan como "mensaje borrado") y editados
      const rm = await env.DB.prepare(`SELECT ${cols} FROM messages m JOIN users u ON u.uid = m.uid WHERE m.room = ? AND m.hidden = 1 AND m.hidden_at > ? AND m.id <= ? ORDER BY m.id DESC LIMIT 60`).bind(room, since, after).all();
      removed = rm.results.map(r => r.id);
      hiddenNow = rm.results.map(r => msgOut(r, admin));
      const ed = await env.DB.prepare(`SELECT ${cols} FROM messages m JOIN users u ON u.uid = m.uid WHERE m.room = ? AND m.hidden = 0 AND m.edited_at > ? AND m.id <= ? ORDER BY m.id DESC LIMIT 60`).bind(room, since, after).all();
      edited = ed.results.map(r => msgOut(r, admin));
    }
    const { results } = await env.DB.prepare(
      `SELECT ${cols}
         FROM messages m JOIN users u ON u.uid = m.uid
        WHERE m.room = ? AND m.id > ?
          AND (u.pid IS NULL OR u.pid NOT IN (SELECT blocked_pid FROM blocks WHERE uid = ?))
        ORDER BY m.id DESC LIMIT 60`
    ).bind(room, after, uid).all();
    return reply(200, { ok: true, me: row.pid, admin, now, epoch, seen: wantOn ? await onlineIn(env, room) : undefined, more: after === 0 && results.length === 60, removed, hiddenNow, edited, messages: results.reverse().map(r => msgOut(r, admin)) });
  }

  if (sub === "" && request.method === "POST") {
    if (!sameOrigin(request)) return fail(403, "origen", "Petición no permitida.");
    let body;
    try { body = JSON.parse(await request.text()); } catch { return fail(400, "entrada", "Datos no válidos."); }
    const room = await resolveRoom(env, uid, row, body && body.room);
    if (!room) return (await goneRoom(env, body && body.room)) ? fail(410, "eliminado", "Usuario eliminado") : fail(400, "sala", "Sala no válida. En los chats privados hace falta ser amigos.");
    const clean = cleanText(body && body.text);
    if (!clean) return fail(400, "entrada", "Escribe un mensaje.");
    if (clean.length > 500) return fail(400, "entrada", "Máximo 500 caracteres.");
    const { text, flagged } = maskProfanity(clean);
    const now = Date.now();
    const recent = await env.DB.prepare("SELECT COUNT(*) AS n, MAX(created_at) AS last FROM messages WHERE uid = ? AND created_at > ?").bind(uid, now - 60000).first();
    if (recent && (recent.n >= 15 || (recent.last && now - recent.last < 1200))) return fail(429, "limite", "Vas muy rápido. Espera un momento.");
    const r = await env.DB.prepare("INSERT INTO messages (room, uid, text, created_at) VALUES (?,?,?,?)").bind(room, uid, text, now).run();
    return reply(200, {
      ok: true, id: r.meta && r.meta.last_row_id, flagged, text, at: now,
      notice: flagged ? "Tu mensaje tenía palabras no permitidas y se enmascaró con asteriscos. Por favor, modera tu forma de hablar: aquí nos respetamos." : null,
    });
  }

  if (sub === "" && request.method === "DELETE") {
    if (!sameOrigin(request)) return fail(403, "origen", "Petición no permitida.");
    const id = parseInt(url.searchParams.get("id") || "", 10);
    if (!id) return fail(400, "entrada", "Mensaje no válido.");
    const m = await env.DB.prepare("SELECT uid, room FROM messages WHERE id = ?").bind(id).first();
    if (!m) return fail(404, "mensaje", "No existe ese mensaje.");
    let mayMod = admin;
    if (m.uid !== uid && (m.room.startsWith("dm:") || m.room.startsWith("g:"))) {
      // los privados y los grupos solo los modera el equipo si alguien los reportó; cada grupo tiene sus propios administradores
      mayMod = admin && !!(await env.DB.prepare("SELECT 1 FROM reports WHERE message_id = ?").bind(id).first());
      if (m.room.startsWith("g:")) {
        const gm = await env.DB.prepare("SELECT role FROM group_members WHERE gid = ? AND uid = ?").bind(Number(m.room.slice(2)), uid).first();
        if (gm && gm.role === "admin") mayMod = true;
      }
    }
    if (m.uid !== uid && !mayMod) return fail(403, "permiso", "Solo puedes borrar tus mensajes.");
    await env.DB.prepare("UPDATE messages SET hidden = 1, hidden_by = ?, hidden_at = ? WHERE id = ?").bind(m.uid === uid ? "self" : "mod", Date.now(), id).run();
    return reply(200, { ok: true });
  }

  // editar (solo quien lo escribió y hasta 5 minutos después de enviarlo)
  if (sub === "" && request.method === "PATCH") {
    if (!sameOrigin(request)) return fail(403, "origen", "Petición no permitida.");
    let body;
    try { body = JSON.parse(await request.text()); } catch { return fail(400, "entrada", "Datos no válidos."); }
    const id = parseInt(body && body.id, 10);
    if (!id) return fail(400, "entrada", "Mensaje no válido.");
    const m = await env.DB.prepare("SELECT uid, hidden, created_at FROM messages WHERE id = ?").bind(id).first();
    if (!m) return fail(404, "mensaje", "No existe ese mensaje.");
    if (m.uid !== uid) return fail(403, "permiso", "Solo puedes editar tus mensajes.");
    if (m.hidden) return fail(409, "oculto", "Ese mensaje ya fue borrado u ocultado.");
    if (Date.now() - m.created_at > EDIT_WINDOW) return fail(403, "tiempo", "Ya pasaron los 5 minutos para editar este mensaje.");
    const clean = cleanText(body && body.text);
    if (!clean) return fail(400, "entrada", "El mensaje no puede quedar vacío.");
    if (clean.length > 500) return fail(400, "entrada", "Máximo 500 caracteres.");
    const { text, flagged } = maskProfanity(clean);
    await env.DB.prepare("UPDATE messages SET text = ?, edited_at = ? WHERE id = ?").bind(text, Date.now(), id).run();
    return reply(200, {
      ok: true, flagged,
      notice: flagged ? "Tu mensaje tenía palabras no permitidas y se enmascaró con asteriscos. Por favor, modera tu forma de hablar: aquí nos respetamos." : null,
    });
  }

  // --- reportes y bloqueos ---
  if (sub === "/report" && request.method === "POST") {
    if (!sameOrigin(request)) return fail(403, "origen", "Petición no permitida.");
    let body;
    try { body = JSON.parse(await request.text()); } catch { return fail(400, "entrada", "Datos no válidos."); }
    const id = parseInt(body && body.id, 10);
    const reason = cleanText(body && body.reason).slice(0, 120);
    if (!id) return fail(400, "entrada", "Mensaje no válido.");
    const rm = await env.DB.prepare("SELECT room FROM messages WHERE id = ?").bind(id).first();
    if (!rm) return fail(404, "mensaje", "No existe ese mensaje.");
    if (rm.room.startsWith("dm:") ? !rm.room.split(":").includes(row.pid) : rm.room.startsWith("g:") && !(await env.DB.prepare("SELECT 1 FROM group_members WHERE gid = ? AND uid = ?").bind(Number(rm.room.slice(2)), uid).first())) return fail(404, "mensaje", "No existe ese mensaje.");
    await env.DB.prepare("INSERT OR IGNORE INTO reports (message_id, reporter_uid, reason, created_at) VALUES (?,?,?,?)").bind(id, uid, reason, Date.now()).run();
    return reply(200, { ok: true });
  }

  if (sub === "/block" && request.method === "POST") {
    if (!sameOrigin(request)) return fail(403, "origen", "Petición no permitida.");
    let body;
    try { body = JSON.parse(await request.text()); } catch { return fail(400, "entrada", "Datos no válidos."); }
    const pid = String(body && body.pid || "");
    if (!/^[0-9a-f]{16}$/.test(pid) || pid === row.pid) return fail(400, "entrada", "Usuario no válido.");
    if (body.on) {
      await env.DB.prepare("INSERT OR IGNORE INTO blocks (uid, blocked_pid) VALUES (?,?)").bind(uid, pid).run();
      await env.DB.prepare("DELETE FROM friendships WHERE (from_uid = ? AND to_uid = (SELECT uid FROM users WHERE pid = ?)) OR (to_uid = ? AND from_uid = (SELECT uid FROM users WHERE pid = ?))").bind(uid, pid, uid, pid).run();
    }
    else await env.DB.prepare("DELETE FROM blocks WHERE uid = ? AND blocked_pid = ?").bind(uid, pid).run();
    return reply(200, { ok: true });
  }

  // --- moderación (solo administradores) ---
  if (sub === "/restore" && request.method === "POST") {
    if (!admin) return fail(403, "permiso", "Solo administradores.");
    if (!sameOrigin(request)) return fail(403, "origen", "Petición no permitida.");
    let body;
    try { body = JSON.parse(await request.text()); } catch { return fail(400, "entrada", "Datos no válidos."); }
    const id = parseInt(body && body.id, 10);
    const m = id ? await env.DB.prepare("SELECT hidden, hidden_by FROM messages WHERE id = ?").bind(id).first() : null;
    if (!m) return fail(404, "mensaje", "No existe ese mensaje.");
    if (!m.hidden || m.hidden_by !== "mod") return fail(409, "estado", "Solo se restauran mensajes ocultados por un moderador.");
    // se restaura como "editado" para que todos los chats abiertos lo vuelvan a mostrar
    await env.DB.prepare("UPDATE messages SET hidden = 0, hidden_by = NULL, hidden_at = NULL, edited_at = ? WHERE id = ?").bind(Date.now(), id).run();
    return reply(200, { ok: true });
  }

  // vaciar chats (moderadores y dueño). Los privados nunca se tocan. "all" (todas las salas públicas) solo el dueño.
  if (sub === "/wipe" && request.method === "POST") {
    if (!admin) return fail(403, "permiso", "Solo administradores.");
    if (!sameOrigin(request)) return fail(403, "origen", "Petición no permitida.");
    let body;
    try { body = JSON.parse(await request.text()); } catch { return fail(400, "entrada", "Datos no válidos."); }
    const what = String(body && body.room || "");
    if (what === "all" && !owner) return fail(403, "permiso", "Solo el dueño puede vaciar todo.");
    const cond = what === "all" ? "room NOT LIKE 'dm:%'" : "room = ?";
    const bind = what === "all" ? [] : [roomKey(what, row.career)];
    if (what !== "all" && !bind[0]) return fail(400, "sala", "Sala no válida.");
    await env.DB.prepare(`DELETE FROM reports WHERE message_id IN (SELECT id FROM messages WHERE ${cond})`).bind(...bind).run();
    await env.DB.prepare(`DELETE FROM messages WHERE ${cond}`).bind(...bind).run();
    await env.DB.prepare("INSERT OR REPLACE INTO meta (k, v) VALUES ('chat_epoch', ?)").bind(String(Date.now())).run(); // los chats abiertos se reinician solos
    return reply(200, { ok: true });
  }

  if (sub === "/reports" && request.method === "GET") {
    if (!admin) return fail(403, "permiso", "Solo administradores.");
    const { results } = await env.DB.prepare(
      `SELECT r.message_id AS id, COUNT(*) AS n, MAX(r.reason) AS reason, m.text, m.room, u.name, u.pid
         FROM reports r JOIN messages m ON m.id = r.message_id JOIN users u ON u.uid = m.uid
        WHERE m.hidden = 0 GROUP BY r.message_id ORDER BY n DESC, r.message_id DESC LIMIT 30`
    ).all();
    return reply(200, { ok: true, reports: results });
  }

  return fail(404, "ruta", "No existe.");
}

const PEOPLE_COLS = "u.pid, u.name, u.career, u.avatar, u.avatar_bg, u.frame, u.verified_at, u.verified_pending, u.is_mod, u.is_owner, u.last_seen, u.hide_online";
const ONLINE_MS = 120000;
const personOut = (r) => ({ pid: r.pid, name: r.name, career: r.career, avatar: r.avatar || null, avatarBg: r.avatar_bg || null, frame: r.frame || null, pct: progressPct(r), role: roleOf(r),
  online: !r.hide_online && !!r.last_seen && Date.now() - r.last_seen < ONLINE_MS, seen: r.hide_online ? null : (r.last_seen || null) });
const relOf = (r) => (r.fs === "accepted" ? "friend" : r.fs === "pending" ? (r.fmine ? "sent" : "received") : "none");
const PID = /^[0-9a-f]{16}$/;
const MAX_FRIENDS = 300, MAX_OUTGOING = 40;

async function socialApi(request, env, sub) {
  const a = await authed(request, env);
  if (isResp(a)) return a;
  const { uid, row, admin, owner } = a;
  const url = new URL(request.url);
  const readBody = async () => { try { return JSON.parse(await request.text()); } catch { return null; } };

  // --- directorio: todos los usuarios, por carrera ---
  if (sub === "/people" && request.method === "GET") {
    const career = url.searchParams.get("career") || row.career;
    if (career !== "all" && !CAREERS.has(career)) return fail(400, "entrada", "Carrera no válida.");
    const q = cleanText(url.searchParams.get("q") || "").slice(0, 40).replace(/[\\%_]/g, "");
    const offset = Math.min(2000, Math.max(0, parseInt(url.searchParams.get("offset") || "0", 10) || 0));
    const counts = await env.DB.prepare("SELECT career, COUNT(*) AS n FROM users WHERE pid IS NOT NULL AND career IS NOT NULL AND COALESCE(dir_hidden,0) = 0 GROUP BY career").all();
    const { results } = await env.DB.prepare(
      `SELECT ${PEOPLE_COLS}, f.status AS fs, (f.from_uid = ?) AS fmine
         FROM users u LEFT JOIN friendships f ON (f.from_uid = ? AND f.to_uid = u.uid) OR (f.to_uid = ? AND f.from_uid = u.uid)
        WHERE u.pid IS NOT NULL AND u.career IS NOT NULL AND u.uid != ?
          AND (? = 'all' OR u.career = ?)
          AND u.name LIKE ?
          AND (COALESCE(u.dir_hidden,0) = 0 OR f.status IS NOT NULL OR ? = 1)
          AND u.pid NOT IN (SELECT blocked_pid FROM blocks WHERE uid = ?)
          AND u.uid NOT IN (SELECT uid FROM blocks WHERE blocked_pid = ?)
        ORDER BY CASE WHEN ? = 'all' THEN u.career ELSE '' END, COALESCE(u.is_owner,0) DESC, COALESCE(u.is_mod,0) DESC, u.name COLLATE NOCASE
        LIMIT 61 OFFSET ?`
    ).bind(uid, uid, uid, uid, career, career, `%${q}%`, owner ? 1 : 0, uid, row.pid, career, offset).all();
    const more = results.length > 60;
    return reply(200, { ok: true, now: Date.now(), careers: counts.results, more, people: results.slice(0, 60).map(r => ({ ...personOut(r), rel: relOf(r) })) });
  }

  // --- amigos y solicitudes ---
  if (sub === "/friends" && request.method === "GET") {
    const { results } = await env.DB.prepare(
      `SELECT ${PEOPLE_COLS}, f.status AS fs, (f.from_uid = ?) AS fmine, f.created_at AS fat
         FROM friendships f JOIN users u ON u.uid = CASE WHEN f.from_uid = ? THEN f.to_uid ELSE f.from_uid END
        WHERE (f.from_uid = ? OR f.to_uid = ?) AND u.pid IS NOT NULL
          AND u.pid NOT IN (SELECT blocked_pid FROM blocks WHERE uid = ?)
        ORDER BY f.created_at DESC`
    ).bind(uid, uid, uid, uid, uid).all();
    // solo se miran las salas privadas de tus amigos (por índice), no toda la tabla de mensajes; D1 admite pocos parámetros por consulta, por eso va en tandas
    const dmRooms = results.filter(r => r.fs === "accepted").map(r => ({ room: dmRoom(row.pid, r.pid), pid: r.pid }));
    const byPeer = new Map();
    for (let i = 0; i < dmRooms.length; i += 40) {
      const chunk = dmRooms.slice(i, i + 40);
      const rr = await env.DB.prepare(
        `SELECT m.room, MAX(m.created_at) AS at,
                SUM(CASE WHEN m.uid != ? AND m.hidden = 0 AND m.id > COALESCE(d.last_id, 0) THEN 1 ELSE 0 END) AS unread
           FROM messages m LEFT JOIN dm_reads d ON d.uid = ? AND d.room = m.room
          WHERE m.room IN (${chunk.map(() => "?").join(",")})
          GROUP BY m.room`
      ).bind(uid, uid, ...chunk.map(c => c.room)).all();
      for (const x of rr.results) byPeer.set(chunk.find(c => c.room === x.room).pid, x);
    }
    const friends = [], incoming = [], outgoing = [];
    for (const r of results) {
      const p = { ...personOut(r), rel: relOf(r), since: r.fat };
      if (r.fs === "accepted") { const d = byPeer.get(r.pid); friends.push({ ...p, unread: d ? d.unread : 0, lastAt: d ? d.at : 0 }); }
      else if (r.fmine) outgoing.push(p); else incoming.push(p);
    }
    friends.sort((x, y) => (y.lastAt || 0) - (x.lastAt || 0) || x.name.localeCompare(y.name));
    return reply(200, { ok: true, now: Date.now(), friends, incoming, outgoing, unread: friends.reduce((n, f) => n + f.unread, 0) });
  }

  if (sub === "/friends" && request.method === "POST") {
    if (!sameOrigin(request)) return fail(403, "origen", "Petición no permitida.");
    const body = await readBody();
    const pid = String(body && body.pid || "");
    const action = String(body && body.action || "");
    if (!PID.test(pid) || pid === row.pid) return fail(400, "entrada", "Usuario no válido.");
    const peer = await env.DB.prepare("SELECT uid, pid FROM users WHERE pid = ?").bind(pid).first();
    if (!peer) return fail(404, "perfil", "No existe ese perfil.");
    const rel = await env.DB.prepare("SELECT from_uid, status FROM friendships WHERE (from_uid = ? AND to_uid = ?) OR (from_uid = ? AND to_uid = ?)").bind(uid, peer.uid, peer.uid, uid).first();
    const now = Date.now();

    if (action === "request") {
      if (rel && rel.status === "accepted") return reply(200, { ok: true, rel: "friend" });
      if (rel && rel.from_uid === uid) return reply(200, { ok: true, rel: "sent" });
      if (rel) { // la otra persona ya te había enviado solicitud: se acepta
        await env.DB.prepare("UPDATE friendships SET status = 'accepted', created_at = ? WHERE from_uid = ? AND to_uid = ?").bind(now, peer.uid, uid).run();
        return reply(200, { ok: true, rel: "friend" });
      }
      const blocked = await env.DB.prepare("SELECT 1 FROM blocks WHERE (uid = ? AND blocked_pid = ?) OR (uid = ? AND blocked_pid = ?)").bind(uid, peer.pid, peer.uid, row.pid).first();
      if (blocked) return fail(403, "bloqueo", "No se puede enviar la solicitud a esta persona.");
      const n = await env.DB.prepare("SELECT SUM(CASE WHEN status = 'pending' AND from_uid = ? THEN 1 ELSE 0 END) AS pend, SUM(CASE WHEN status = 'accepted' THEN 1 ELSE 0 END) AS fr FROM friendships WHERE from_uid = ? OR to_uid = ?").bind(uid, uid, uid).first();
      if (n && n.pend >= MAX_OUTGOING) return fail(429, "limite", "Tienes demasiadas solicitudes pendientes. Espera a que respondan o cancela alguna.");
      if (n && n.fr >= MAX_FRIENDS) return fail(409, "limite", "Alcanzaste el máximo de amigos.");
      await env.DB.prepare("INSERT INTO friendships (from_uid, to_uid, status, created_at) VALUES (?,?,'pending',?)").bind(uid, peer.uid, now).run();
      return reply(200, { ok: true, rel: "sent" });
    }
    if (action === "accept") {
      if (!rel || rel.status !== "pending" || rel.from_uid !== peer.uid) return fail(404, "solicitud", "Esa solicitud ya no existe.");
      await env.DB.prepare("UPDATE friendships SET status = 'accepted', created_at = ? WHERE from_uid = ? AND to_uid = ?").bind(now, peer.uid, uid).run();
      return reply(200, { ok: true, rel: "friend" });
    }
    if (action === "decline") {
      await env.DB.prepare("DELETE FROM friendships WHERE from_uid = ? AND to_uid = ? AND status = 'pending'").bind(peer.uid, uid).run();
      return reply(200, { ok: true, rel: "none" });
    }
    if (action === "cancel") {
      await env.DB.prepare("DELETE FROM friendships WHERE from_uid = ? AND to_uid = ? AND status = 'pending'").bind(uid, peer.uid).run();
      return reply(200, { ok: true, rel: "none" });
    }
    if (action === "remove") {
      await env.DB.prepare("DELETE FROM friendships WHERE status = 'accepted' AND ((from_uid = ? AND to_uid = ?) OR (from_uid = ? AND to_uid = ?))").bind(uid, peer.uid, peer.uid, uid).run();
      return reply(200, { ok: true, rel: "none" });
    }
    return fail(400, "entrada", "Acción no válida.");
  }

  // --- grupos: cada grupo tiene sus propios administradores (quien lo crea y a quien él nombre) ---
  if (sub === "/groups" && request.method === "GET") {
    const gid = parseInt(url.searchParams.get("id") || "0", 10);
    if (gid) {
      const mine = await env.DB.prepare("SELECT g.id, g.name, g.owner_uid, gm.role FROM chat_groups g JOIN group_members gm ON gm.gid = g.id AND gm.uid = ? WHERE g.id = ?").bind(uid, gid).first();
      if (!mine) return fail(404, "grupo", "No existe ese grupo o no eres miembro.");
      const { results } = await env.DB.prepare(`SELECT ${PEOPLE_COLS}, gm.role AS grole, (gm.uid = ?) AS creator FROM group_members gm JOIN users u ON u.uid = gm.uid WHERE gm.gid = ? ORDER BY (gm.role = 'admin') DESC, u.name COLLATE NOCASE`).bind(mine.owner_uid, gid).all();
      return reply(200, { ok: true, now: Date.now(), group: { id: mine.id, name: mine.name, me: mine.role, iAmCreator: mine.owner_uid === uid, members: results.map(r => ({ ...personOut(r), grole: r.grole, creator: !!r.creator })) } });
    }
    const { results } = await env.DB.prepare(
      `SELECT g.id, g.name, gm.role,
              (SELECT COUNT(*) FROM group_members x WHERE x.gid = g.id) AS n,
              (SELECT MAX(m.created_at) FROM messages m WHERE m.room = 'g:' || g.id) AS last_at,
              (SELECT COUNT(*) FROM messages m WHERE m.room = 'g:' || g.id AND m.uid != ? AND m.hidden = 0
                  AND m.id > COALESCE((SELECT d.last_id FROM dm_reads d WHERE d.uid = ? AND d.room = 'g:' || g.id), 0)) AS unread
         FROM chat_groups g JOIN group_members gm ON gm.gid = g.id AND gm.uid = ?
        ORDER BY COALESCE(last_at, g.created_at) DESC`
    ).bind(uid, uid, uid).all();
    return reply(200, { ok: true, groups: results.map(g => ({ id: g.id, name: g.name, role: g.role, n: g.n, lastAt: g.last_at || 0, unread: g.unread })) });
  }
  if (sub === "/groups" && request.method === "POST") {
    if (!sameOrigin(request)) return fail(403, "origen", "Petición no permitida.");
    const body = await readBody();
    const action = String(body && body.action || "");
    const now = Date.now();
    const cleanName = (v) => {
      const n = cleanText(v).replace(/\s+/g, " ").slice(0, 40);
      if (!n) return "Escribe un nombre para el grupo.";
      if (maskProfanity(n).flagged) return "Ese nombre no está permitido.";
      return null;
    };
    const asFriends = async (pids) => { // solo se pueden sumar amigos aceptados
      const out = [];
      for (const p of [...new Set(Array.isArray(pids) ? pids.map(String) : [])].slice(0, 49)) {
        if (!PID.test(p)) continue;
        const t = await env.DB.prepare("SELECT u.uid FROM users u JOIN friendships f ON f.status = 'accepted' AND ((f.from_uid = ? AND f.to_uid = u.uid) OR (f.to_uid = ? AND f.from_uid = u.uid)) WHERE u.pid = ?").bind(uid, uid, p).first();
        if (t) out.push(t.uid);
      }
      return out;
    };
    if (action === "create") {
      const bad = cleanName(body.name);
      if (bad) return fail(400, "entrada", bad);
      const made = await env.DB.prepare("SELECT COUNT(*) AS n FROM chat_groups WHERE owner_uid = ?").bind(uid).first();
      if (made && made.n >= 10) return fail(429, "limite", "Ya creaste 10 grupos. Borra alguno para crear otro.");
      const members = await asFriends(body.members);
      const r = await env.DB.prepare("INSERT INTO chat_groups (name, owner_uid, created_at) VALUES (?,?,?)").bind(cleanText(body.name).replace(/\s+/g, " ").slice(0, 40), uid, now).run();
      const id = r.meta && r.meta.last_row_id;
      await env.DB.prepare("INSERT INTO group_members (gid, uid, role, joined_at) VALUES (?,?,'admin',?)").bind(id, uid, now).run();
      for (const m of members) await env.DB.prepare("INSERT OR IGNORE INTO group_members (gid, uid, role, joined_at) VALUES (?,?,'member',?)").bind(id, m, now).run();
      return reply(200, { ok: true, id });
    }
    const gid = parseInt(body && body.id, 10);
    const g = gid ? await env.DB.prepare("SELECT g.id, g.owner_uid, gm.role FROM chat_groups g JOIN group_members gm ON gm.gid = g.id AND gm.uid = ? WHERE g.id = ?").bind(uid, gid).first() : null;
    if (!g) return fail(404, "grupo", "No existe ese grupo o no eres miembro.");
    const isAdmin = g.role === "admin", isCreator = g.owner_uid === uid;
    const target = async () => { const p = String(body.pid || ""); return PID.test(p) ? env.DB.prepare("SELECT u.uid FROM users u JOIN group_members gm ON gm.uid = u.uid AND gm.gid = ? WHERE u.pid = ?").bind(gid, p).first() : null; };

    if (action === "read") {
      const last = await env.DB.prepare("SELECT COALESCE(MAX(id), 0) AS id FROM messages WHERE room = ?").bind(`g:${gid}`).first();
      await env.DB.prepare("INSERT INTO dm_reads (uid, room, last_id) VALUES (?,?,?) ON CONFLICT(uid, room) DO UPDATE SET last_id = excluded.last_id").bind(uid, `g:${gid}`, last ? last.id : 0).run();
      return reply(200, { ok: true });
    }
    if (action === "leave") {
      await env.DB.prepare("DELETE FROM group_members WHERE gid = ? AND uid = ?").bind(gid, uid).run();
      if (isCreator) { // el grupo pasa a otro administrador (o al miembro más antiguo); sin miembros se borra
        const next = await env.DB.prepare("SELECT uid FROM group_members WHERE gid = ? ORDER BY (role = 'admin') DESC, joined_at LIMIT 1").bind(gid).first();
        if (next) { await env.DB.prepare("UPDATE chat_groups SET owner_uid = ? WHERE id = ?").bind(next.uid, gid).run(); await env.DB.prepare("UPDATE group_members SET role = 'admin' WHERE gid = ? AND uid = ?").bind(gid, next.uid).run(); }
        else { await env.DB.prepare("DELETE FROM messages WHERE room = ?").bind(`g:${gid}`).run(); await env.DB.prepare("DELETE FROM chat_groups WHERE id = ?").bind(gid).run(); }
      }
      return reply(200, { ok: true });
    }
    if (action === "delete") {
      if (!isCreator) return fail(403, "permiso", "Solo quien creó el grupo puede borrarlo.");
      await env.DB.prepare("DELETE FROM reports WHERE message_id IN (SELECT id FROM messages WHERE room = ?)").bind(`g:${gid}`).run();
      await env.DB.prepare("DELETE FROM messages WHERE room = ?").bind(`g:${gid}`).run();
      await env.DB.prepare("DELETE FROM group_members WHERE gid = ?").bind(gid).run();
      await env.DB.prepare("DELETE FROM chat_groups WHERE id = ?").bind(gid).run();
      return reply(200, { ok: true });
    }
    if (!isAdmin) return fail(403, "permiso", "Solo los administradores del grupo pueden hacer esto.");
    if (action === "rename") {
      const bad = cleanName(body.name);
      if (bad) return fail(400, "entrada", bad);
      await env.DB.prepare("UPDATE chat_groups SET name = ? WHERE id = ?").bind(cleanText(body.name).replace(/\s+/g, " ").slice(0, 40), gid).run();
      return reply(200, { ok: true });
    }
    if (action === "add") {
      const add = await asFriends([body.pid]);
      if (!add.length) return fail(400, "entrada", "Solo puedes agregar a tus amigos.");
      const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM group_members WHERE gid = ?").bind(gid).first();
      if (n && n.n >= 50) return fail(409, "limite", "El grupo está lleno (50 personas).");
      await env.DB.prepare("INSERT OR IGNORE INTO group_members (gid, uid, role, joined_at) VALUES (?,?,'member',?)").bind(gid, add[0], now).run();
      return reply(200, { ok: true });
    }
    if (action === "remove" || action === "role") {
      const t = await target();
      if (!t) return fail(404, "perfil", "Esa persona no está en el grupo.");
      if (t.uid === uid) return fail(400, "entrada", "No puedes cambiarte el rol a ti mismo.");
      if (t.uid === g.owner_uid) return fail(409, "creador", "Quien creó el grupo no puede ser quitado ni degradado.");
      const tm = await env.DB.prepare("SELECT role FROM group_members WHERE gid = ? AND uid = ?").bind(gid, t.uid).first();
      if (action === "remove") {
        if (t.uid === uid) return fail(400, "entrada", "Para salir usa «Salir del grupo».");
        if (tm.role === "admin" && !isCreator) return fail(403, "permiso", "Solo quien creó el grupo puede quitar a otro administrador.");
        await env.DB.prepare("DELETE FROM group_members WHERE gid = ? AND uid = ?").bind(gid, t.uid).run();
      } else {
        if (!body.on && !isCreator) return fail(403, "permiso", "Solo quien creó el grupo puede quitar el rol de administrador.");
        await env.DB.prepare("UPDATE group_members SET role = ? WHERE gid = ? AND uid = ?").bind(body.on ? "admin" : "member", gid, t.uid).run();
      }
      return reply(200, { ok: true });
    }
    return fail(400, "entrada", "Acción no válida.");
  }

  // marca un chat privado como leído
  if (sub === "/dm/read" && request.method === "POST") {
    if (!sameOrigin(request)) return fail(403, "origen", "Petición no permitida.");
    const body = await readBody();
    const room = await resolveRoom(env, uid, row, "dm:" + String(body && body.pid || ""));
    if (!room) return fail(400, "sala", "Sala no válida.");
    const last = await env.DB.prepare("SELECT COALESCE(MAX(id), 0) AS id FROM messages WHERE room = ?").bind(room).first();
    await env.DB.prepare("INSERT INTO dm_reads (uid, room, last_id) VALUES (?,?,?) ON CONFLICT(uid, room) DO UPDATE SET last_id = excluded.last_id").bind(uid, room, last ? last.id : 0).run();
    return reply(200, { ok: true });
  }

  // --- eliminar un usuario por completo (solo el dueño): cuenta, mensajes, amistades, grupos; y no puede volver a crear perfil ---
  if (sub === "/users/delete" && request.method === "POST") {
    if (!owner) return fail(403, "permiso", "Solo el dueño puede eliminar usuarios.");
    if (!sameOrigin(request)) return fail(403, "origen", "Petición no permitida.");
    const body = await readBody();
    const pid = String(body && body.pid || "");
    if (!PID.test(pid)) return fail(400, "entrada", "Usuario no válido.");
    const t = await env.DB.prepare("SELECT uid, is_owner FROM users WHERE pid = ?").bind(pid).first();
    if (!t) return fail(404, "perfil", "No existe ese perfil.");
    if (t.uid === uid) return fail(400, "entrada", "No puedes eliminarte a ti mismo.");
    if (t.is_owner) return fail(409, "dueno", "No se puede eliminar al dueño.");
    const owned = await env.DB.prepare("SELECT id FROM chat_groups WHERE owner_uid = ?").bind(t.uid).all();
    for (const g of owned.results) { // sus grupos pasan a otro miembro; si no queda nadie, se borran
      const next = await env.DB.prepare("SELECT uid FROM group_members WHERE gid = ? AND uid != ? ORDER BY (role = 'admin') DESC, joined_at LIMIT 1").bind(g.id, t.uid).first();
      if (next) { await env.DB.prepare("UPDATE chat_groups SET owner_uid = ? WHERE id = ?").bind(next.uid, g.id).run(); await env.DB.prepare("UPDATE group_members SET role = 'admin' WHERE gid = ? AND uid = ?").bind(g.id, next.uid).run(); }
      else { await env.DB.prepare("DELETE FROM messages WHERE room = ?").bind(`g:${g.id}`).run(); await env.DB.prepare("DELETE FROM chat_groups WHERE id = ?").bind(g.id).run(); }
    }
    await env.DB.batch([
      // todos sus chats privados desaparecen (también lo que escribió la otra persona en ellos)
      env.DB.prepare("DELETE FROM reports WHERE message_id IN (SELECT id FROM messages WHERE room LIKE ? OR room LIKE ?)").bind(`dm:${pid}:%`, `dm:%:${pid}`),
      env.DB.prepare("DELETE FROM dm_reads WHERE room LIKE ? OR room LIKE ?").bind(`dm:${pid}:%`, `dm:%:${pid}`),
      env.DB.prepare("DELETE FROM messages WHERE room LIKE ? OR room LIKE ?").bind(`dm:${pid}:%`, `dm:%:${pid}`),
      env.DB.prepare("DELETE FROM reports WHERE reporter_uid = ? OR message_id IN (SELECT id FROM messages WHERE uid = ?)").bind(t.uid, t.uid),
      env.DB.prepare("DELETE FROM messages WHERE uid = ?").bind(t.uid),
      env.DB.prepare("DELETE FROM blocks WHERE uid = ? OR blocked_pid = ?").bind(t.uid, pid),
      env.DB.prepare("DELETE FROM friendships WHERE from_uid = ? OR to_uid = ?").bind(t.uid, t.uid),
      env.DB.prepare("DELETE FROM group_members WHERE uid = ?").bind(t.uid),
      env.DB.prepare("DELETE FROM dm_reads WHERE uid = ?").bind(t.uid),
      env.DB.prepare("DELETE FROM users WHERE uid = ?").bind(t.uid),
      env.DB.prepare("INSERT OR IGNORE INTO banned (uid, at) VALUES (?, ?)").bind(t.uid, Date.now()),
      env.DB.prepare("INSERT OR REPLACE INTO meta (k, v) VALUES ('chat_epoch', ?)").bind(String(Date.now())), // los chats abiertos se recargan y ya no muestran sus mensajes
    ]);
    return reply(200, { ok: true });
  }

  // --- moderadores: los ve el equipo; solo el dueño los cambia ---
  if (sub === "/mods" && request.method === "GET") {
    if (!admin) return fail(403, "permiso", "Solo administradores.");
    const { results } = await env.DB.prepare(`SELECT ${PEOPLE_COLS} FROM users u WHERE u.pid IS NOT NULL AND (u.is_mod = 1 OR u.is_owner = 1) ORDER BY COALESCE(u.is_owner,0) DESC, u.name COLLATE NOCASE`).all();
    return reply(200, { ok: true, owner, mods: results.map(personOut) });
  }
  if (sub === "/mods" && request.method === "POST") {
    if (!owner) return fail(403, "permiso", "Solo el dueño puede gestionar moderadores.");
    if (!sameOrigin(request)) return fail(403, "origen", "Petición no permitida.");
    const body = await readBody();
    const pid = String(body && body.pid || "");
    if (!PID.test(pid)) return fail(400, "entrada", "Usuario no válido.");
    const t = await env.DB.prepare("SELECT uid, is_owner FROM users WHERE pid = ?").bind(pid).first();
    if (!t) return fail(404, "perfil", "No existe ese perfil.");
    if (t.uid === uid) return fail(400, "entrada", "No puedes cambiarte el rol a ti mismo.");
    if (t.is_owner) return fail(409, "dueno", "El dueño siempre es moderador.");
    await env.DB.prepare("UPDATE users SET is_mod = ? WHERE uid = ?").bind(body.on ? 1 : 0, t.uid).run();
    if (!body.on) { // sin rol, pierde los marcos y los artículos exclusivos
      await env.DB.prepare("UPDATE users SET frame = NULL WHERE uid = ? AND frame LIKE 'MOD-%'").bind(t.uid).run();
      const av = await env.DB.prepare("SELECT avatar FROM users WHERE uid = ?").bind(t.uid).first();
      if (av && hasExcl(av.avatar)) await env.DB.prepare("UPDATE users SET avatar = ? WHERE uid = ?").bind(stripExcl(av.avatar), t.uid).run();
    }
    return reply(200, { ok: true, role: body.on ? "mod" : null });
  }

  return fail(404, "ruta", "No existe.");
}

async function profileApi(request, env) {
  const a = await authed(request, env);
  if (isResp(a)) return a;
  const pid = new URL(request.url).searchParams.get("pid") || "";
  if (!/^[0-9a-f]{16}$/.test(pid)) return fail(400, "entrada", "Perfil no válido.");
  const u = await env.DB.prepare("SELECT uid, name, career, avatar, avatar_bg, frame, earned, verified_at, verified_pending, verified_src, created_at, is_mod, is_owner, last_seen, hide_online FROM users WHERE pid = ?").bind(pid).first();
  if (!u) return fail(404, "perfil", "No existe ese perfil.");
  const fr = pid === a.row.pid ? null : await env.DB.prepare("SELECT status, (from_uid = ?) AS mine FROM friendships WHERE (from_uid = ? AND to_uid = ?) OR (from_uid = ? AND to_uid = ?)").bind(a.uid, a.uid, u.uid, u.uid, a.uid).first();
  const blocked = !!(await env.DB.prepare("SELECT 1 FROM blocks WHERE uid = ? AND blocked_pid = ?").bind(a.uid, pid).first());
  return reply(200, {
    ok: true, now: Date.now(), blocked, me: pid === a.row.pid, rel: relOf(fr ? { fs: fr.status, fmine: fr.mine } : {}),
    profile: { role: roleOf(u), verifiedVia: u.verified_at ? (u.verified_src || "direct") : null, online: !u.hide_online && !!u.last_seen && Date.now() - u.last_seen < ONLINE_MS, seen: u.hide_online ? null : (u.last_seen || null), name: u.name, career: u.career, avatar: u.avatar || null, avatarBg: u.avatar_bg || null, frame: u.frame || null,
      earned: liveEarned(u), pct: progressPct(u), since: u.created_at },
  });
}

/* ============================================================
   Verificación con el MARCADOR (bookmarklet): la lista de pendientes la manda el navegador del estudiante,
   así que NO se puede probar que venga de UTESA como en el inicio de sesión directo. Se acepta con controles
   (carrera coincidente, contadores coherentes, el avance no puede retroceder, límite de intentos) y queda
   etiquetada como "marcador" para ser transparentes.
   ============================================================ */
async function verifyApi(request, env) {
  const a = await authed(request, env);
  if (isResp(a)) return a;
  const { uid, row } = a;
  if (request.method !== "POST") return fail(405, "metodo", "Método no permitido.");
  if (!sameOrigin(request)) return fail(403, "origen", "Petición no permitida.");
  if (limited(`v:${uid}`, 6, 60 * 60 * 1000)) return fail(429, "limite", "Demasiados intentos. Espera un rato y vuelve a intentar.");
  let body;
  try { body = JSON.parse(await request.text()); } catch { return fail(400, "entrada", "Datos no válidos."); }
  const raw = Array.isArray(body && body.pending) ? body.pending : null;
  if (!raw || raw.length > 400) return fail(400, "entrada", "Lista de pendientes no válida.");
  const pend = [...new Set(raw.filter(x => typeof x === "string" && x.length < 24).map(normCode).filter(Boolean))];
  const c = body.counts && typeof body.counts === "object" ? body.counts : {};
  const num = (v) => (Number.isInteger(v) && v >= 0 && v < 1000 ? v : null);
  const cp = num(c.pend), ci = num(c.insc);
  if (!pend.length && cp !== 0) return fail(400, "sospechoso", "La lista de pendientes llegó vacía mientras UTESA indica que aún faltan materias.");
  // los contadores de UTESA deben cuadrar con la lista (pendientes + las que cursas ahora)
  if (cp !== null && Math.abs(pend.length - (cp + (ci || 0))) > 6) return fail(400, "contadores", "La lista no coincide con los contadores del portal. Vuelve a tocar el marcador dentro de UTESA.");
  const r = computeEarned(row.career, pend);
  if (r.mismatch) return reply(200, { ok: true, verified: { earned: [], mismatch: true, frame: row.frame || null, pct: null, via: "bookmark" } });
  // el avance no retrocede: una lista nueva no puede traer muchas materias que ya no estaban pendientes
  if (row.verified_at && row.verified_pending) {
    try { const old = new Set(JSON.parse(row.verified_pending)); if (pend.filter(x => !old.has(x)).length > 8) return fail(409, "retroceso", "Tu avance parece haber retrocedido. Si cambiaste de pensum, vincula de nuevo con tu matrícula."); } catch { /* sin datos previos */ }
  }
  const frame = row.frame && !row.frame.startsWith("MOD-") && !r.earned.includes(row.frame) ? null : row.frame || null;
  await env.DB.prepare("UPDATE users SET earned = ?, verified_at = ?, frame = ?, verified_pending = ?, verified_src = 'bookmark' WHERE uid = ?")
    .bind(JSON.stringify(r.earned), Date.now(), frame, JSON.stringify(pend), uid).run();
  return reply(200, { ok: true, verified: { earned: r.earned, mismatch: false, frame, pct: progressPct({ verified_at: 1, verified_pending: JSON.stringify(pend), career: row.career }), via: "bookmark" } });
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === "/api/utesa-login") return login(request, env);
    if (pathname === "/api/user") return userApi(request, env);
    if (pathname === "/api/profile") return profileApi(request, env);
    if (pathname === "/api/utesa-verify") return verifyApi(request, env);
    if (pathname === "/api/people" || pathname === "/api/friends" || pathname === "/api/mods" || pathname === "/api/users/delete" || pathname === "/api/groups" || pathname === "/api/dm/read") return socialApi(request, env, pathname.slice(4));
    if (pathname === "/api/chat" || pathname.startsWith("/api/chat/")) return chatApi(request, env, pathname.slice("/api/chat".length));
    // todo lo demás: archivos estáticos de la web
    return env.ASSETS.fetch(request);
  },
};
