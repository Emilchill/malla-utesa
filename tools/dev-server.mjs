// tools/dev-server.mjs — entorno de desarrollo LOCAL completo, sin Cloudflare ni Firebase ni cuentas.
//
//   npm run dev        →  http://localhost:5190
//
// Qué hace:
//   1. Copia app/ a .dev-site/ y cambia Firebase (Auth y Firestore) por simulaciones locales.
//   2. Sirve ese sitio y corre el _worker.js REAL (la API) contra una base SQLite en memoria.
//   3. Simula el portal de UTESA (para probar "vincular con matrícula") y crea usuarios de ejemplo.
//
// Nada de esto se publica: .dev-site/ está en .gitignore. Los datos viven en memoria y se pierden al cerrar.
//
// Usuarios de ejemplo (cambia de uno a otro en http://localhost:5190/dev.html):
//   ana = dueña/administradora (ISC) · bob = estudiante (ISC) · cat = estudiante (DER) · dan, eva = estudiantes (ISC)
import { createServer } from "node:http";
import { cpSync, rmSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { extname, join, normalize, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { generateKeyPairSync, createSign } from "node:crypto";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const APP = join(ROOT, "app");
const SITE = join(ROOT, ".dev-site");
const PORT = Number(process.env.PORT || 5190);

/* ---------------------------------------------------------------- 1. sitio con Firebase simulado */
rmSync(SITE, { recursive: true, force: true });
cpSync(APP, SITE, { recursive: true });
mkdirSync(join(SITE, "js/stubs"), { recursive: true });

writeFileSync(join(SITE, "js/stubs/auth.js"), `// Firebase Auth simulado: siempre hay una sesión; el usuario sale de localStorage.uid (por defecto "ana").
export const __user = { uid: "u1", email: "estudiante@correo.com", providerData: [{ providerId: "password" }],
  async getIdToken() { return (await fetch("/__token?uid=" + (localStorage.getItem("uid") || "ana"))).text(); } };
export function getAuth() { return { currentUser: __user }; }
export function onAuthStateChanged(auth, cb) { setTimeout(() => cb(localStorage.getItem("h_signed_out") === "1" ? null : __user), 0); return () => {}; }
export async function signOut() { localStorage.setItem("h_signed_out", "1"); }
export async function updatePassword() {}
export async function reauthenticateWithCredential() {}
export const EmailAuthProvider = { credential: (email, password) => ({ email, password }) };
export async function sendPasswordResetEmail() {}
export class GoogleAuthProvider {}
export async function signInWithPopup() {}
export async function signInWithEmailAndPassword() {}
export async function createUserWithEmailAndPassword() {}
`);

writeFileSync(join(SITE, "js/stubs/firestore.js"), `// Firestore simulado: sin avisos en vivo (el chat usa el sondeo de respaldo).
export function getFirestore() { return {}; }
export function doc(db, col, id) { return { col, id }; }
export async function getDoc() { return { exists: () => false, data: () => ({}) }; }
export async function updateDoc() {}
export async function setDoc() {}
export function onSnapshot() { throw new Error("sin Firestore en desarrollo local"); }
export function serverTimestamp() { return Date.now(); }
`);

writeFileSync(join(SITE, "js/firebase-config.js"), `import { __user } from "./stubs/auth.js";
export const app = {};
export const auth = { currentUser: __user };
export const db = {};
`);

const FB = { AUTH: "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js", FS: "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js" };
for (const name of readdirSync(join(SITE, "js"))) {
  if (!name.endsWith(".js") || name === "firebase-config.js") continue;
  const p = join(SITE, "js", name);
  writeFileSync(p, readFileSync(p, "utf8").replaceAll(FB.AUTH, "./stubs/auth.js").replaceAll(FB.FS, "./stubs/firestore.js"));
}
// las páginas con <script type="module"> en línea también importan Firebase directamente
for (const name of readdirSync(SITE)) {
  if (!name.endsWith(".html")) continue;
  const p = join(SITE, name);
  writeFileSync(p, readFileSync(p, "utf8").replaceAll(FB.AUTH, "./js/stubs/auth.js").replaceAll(FB.FS, "./js/stubs/firestore.js"));
}
writeFileSync(join(SITE, "dev.html"), `<!doctype html><meta charset="utf-8"><title>Desarrollo local</title>
<body style="font:16px system-ui;max-width:520px;margin:40px auto;padding:0 16px">
<h1>Desarrollo local</h1><p>Elige con qué usuario de ejemplo entrar (se guarda en este navegador):</p>
<p id="u"></p><p style="color:#666">ana es la dueña (administradora). Los datos viven en memoria y se pierden al reiniciar.</p>
<script>
const users = { ana: "Ana Pérez · dueña · ISC", bob: "Bob Díaz · ISC", cat: "Cat Ruiz · DER", dan: "Dan Mora · ISC", eva: "Eva Soto · ISC" };
document.getElementById("u").innerHTML = Object.entries(users).map(([k, v]) => '<button style="display:block;width:100%;margin:6px 0;padding:12px;font:inherit" onclick="localStorage.setItem(\\'uid\\',\\'' + k + '\\');localStorage.removeItem(\\'h_signed_out\\');location.href=\\'dashboard.html\\'">' + v + '</button>').join("");
</script>`);

/* ---------------------------------------------------------------- 2. API real (worker) + SQLite en memoria */
const sq = new DatabaseSync(":memory:");
const prep = (q) => { let args = []; const o = { bind: (...x) => { args = x; return o; },
  run: async () => { const r = sq.prepare(q).run(...args); return { meta: { last_row_id: Number(r.lastInsertRowid) } }; },
  first: async () => sq.prepare(q).get(...args) || null,
  all: async () => ({ results: sq.prepare(q).all(...args) }) }; return o; };
const DB = { prepare: prep, batch: async (list) => { for (const s of list) await s.run(); } };

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: "jwk" }), kid: "k1", alg: "RS256", use: "sig" };
const realFetch = globalThis.fetch;
const { PENSUMS } = await import(pathToFileURL(join(APP, "js/pensums-data.js")).href);
const isc = PENSUMS.ISC.cuatrimestres.flatMap(c => c.materias.map(m => m.c)).filter(c => /^[A-Z]{2,4}-\d{3}$/.test(c));
const approved = new Set(["MAT-170", "MAT-340", "MAT-350", "MAT-360", "INF-164", "INF-385", "ESP-181", "INF-502"]);
// el worker llama a Google (claves públicas) y a utesa.edu: aquí se responden en local
globalThis.fetch = async (u, init) => {
  u = String(u);
  if (u.includes("googleapis.com/service_accounts")) return { ok: true, json: async () => ({ keys: [jwk] }) };
  if (u.includes("utesa.edu")) {
    const html = (b) => ({ status: 200, headers: { get: () => null, getSetCookie: () => [] }, text: async () => b });
    if (u.includes("asignaturas-pendientes")) return html(`<input id="txtNombrecar" value="Ing"><input id="txtPensum" value="2023"><table><tr><th>Cód. Asig.</th></tr>${isc.filter(c => !approved.has(c)).map(c => `<tr><td>${c}</td></tr>`).join("")}</table>`);
    return html('<input id="txtCanAprob" value="8"><input id="txtCanInscri" value="0">');
  }
  return realFetch(u, init);
};
const b64 = (o) => Buffer.from(typeof o === "string" ? o : JSON.stringify(o)).toString("base64url");
const token = (uid) => {
  const now = Math.floor(Date.now() / 1000), h = b64({ alg: "RS256", kid: "k1" });
  const p = b64({ aud: "malla-curricular-38175", iss: "https://securetoken.google.com/malla-curricular-38175", sub: uid, iat: now, exp: now + 3600 });
  return `${h}.${p}.${createSign("RSA-SHA256").update(h + "." + p).sign(privateKey).toString("base64url")}`;
};

const worker = (await import(pathToFileURL(join(APP, "_worker.js")).href)).default;
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css", ".pdf": "application/pdf", ".svg": "image/svg+xml", ".json": "application/json" };
const env = { DB, ADMIN_UIDS: "ana", ASSETS: { fetch: async (req) => {
  let p = decodeURIComponent(new URL(req.url).pathname); if (p.endsWith("/")) p += "index.html";
  let f = normalize(join(SITE, p)); if (!existsSync(f) && existsSync(f + ".html")) f += ".html";
  if (!f.startsWith(SITE) || !existsSync(f) || statSync(f).isDirectory()) return new Response("no", { status: 404 });
  return new Response(readFileSync(f), { headers: { "content-type": MIME[extname(f)] || "application/octet-stream" } });
} } };

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname === "/__token") { res.end(token(url.searchParams.get("uid") || "ana")); return; } // solo desarrollo
  const chunks = []; for await (const c of req) chunks.push(c);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  const headers = new Headers(); for (const [k, v] of Object.entries(req.headers)) headers.set(k, String(v));
  const r = await worker.fetch(new Request(url, { method: req.method, headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : body }), env);
  res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(Buffer.from(await r.arrayBuffer()));
}).listen(PORT, async () => {
  /* ------------------------------------------------------------ 3. usuarios de ejemplo */
  const { presetAvatar } = await import(pathToFileURL(join(APP, "js/avatars.js")).href);
  const H = `http://localhost:${PORT}`;
  const call = async (m, p, uid, bodyObj) => (await fetch(H + p, { method: m, headers: { authorization: "Bearer " + token(uid), origin: H, "content-type": "application/json", "cf-connecting-ip": "9.9.9." + uid.length }, body: bodyObj && JSON.stringify(bodyObj) })).json();
  for (const [u, n, c, sex] of [["ana", "Ana Pérez", "ISC", "f"], ["bob", "Bob Díaz", "ISC", "m"], ["cat", "Cat Ruiz", "DER", "f"], ["dan", "Dan Mora", "ISC", "m"], ["eva", "Eva Soto", "ISC", "f"]])
    await call("PUT", "/api/user", u, { fields: { name: n, career: c, theme: "utesa", avatar: presetAvatar(sex), done: [] } });
  console.log(`\nMalla UTESA en desarrollo local → ${H}\n  · elegir usuario:  ${H}/dev.html\n  · la API es el _worker.js real; los datos viven en memoria\n  · Ctrl+C para salir\n`);
});
