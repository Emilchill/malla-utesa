// tests/harness.mjs — banco de pruebas del servidor (sin Cloudflare ni Firebase).
//
// Ejecuta el _worker.js REAL contra una base SQLite en memoria (node:sqlite, Node >= 22.5) y falsifica:
//   · Firebase Auth: genera tokens RS256 propios y responde el JWKS de Google con nuestra clave pública.
//   · El portal de UTESA: responde las páginas "asignaturas pendientes" y "resumen" con datos de ISC.
// Cada archivo *.test.mjs importa lo que necesita de aquí. Ver docs/TESTING.md.
import { DatabaseSync } from "node:sqlite";
import { generateKeyPairSync, createSign } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join, dirname } from "node:path";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const sq = new DatabaseSync(":memory:");
const mk = (q) => {
  let args = [];
  const o = {
    bind: (...a) => { args = a; return o; },
    run: async () => { const r = sq.prepare(q).run(...args); return { meta: { last_row_id: Number(r.lastInsertRowid) } }; },
    first: async () => sq.prepare(q).get(...args) || null,
    all: async () => ({ results: sq.prepare(q).all(...args) }),
  };
  return o;
};
const DB = { prepare: mk, batch: async (l) => { for (const s of l) await s.run(); } };
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: "jwk" }), kid: "k1", alg: "RS256", use: "sig" };
const approved = new Set(["MAT-170", "MAT-340", "MAT-350", "MAT-360", "INF-164", "ESP-181"]);
const { PENSUMS } = await import(pathToFileURL(join(ROOT, "app/js/pensums-data.js")).href);
const allIsc = PENSUMS.ISC.cuatrimestres.flatMap(c => c.materias.map(m => m.c)).filter(c => /^[A-Z]{2,4}-\d{3}$/.test(c));
globalThis.fetch = async (u) => {
  u = String(u);
  if (u.includes("googleapis.com")) return { ok: true, json: async () => ({ keys: [jwk] }) };
  const html = (body) => ({ status: 200, headers: { get: () => null, getSetCookie: () => [] }, text: async () => body });
  if (u.includes("conexion.aspx")) return html("");
  if (u.includes("asignaturas-pendientes")) {
    const rows = allIsc.filter(c => !approved.has(c)).map(c => `<tr><td>${(globalThis.__fmt || ((x) => x))(c)}</td><td>x</td></tr>`).join("");
    return html(`<input id="txtNombrecar" value="Ing"><input id="txtPensum" value="2023"><table><tr><th>Cód. Asig.</th><th>Nombre</th></tr>${rows}</table>`);
  }
  return html('<input id="txtCanAprob" value="6">');
};
const b = (o) => Buffer.from(typeof o === "string" ? o : JSON.stringify(o)).toString("base64url");
const tok = (uid, over = {}) => {
  const now = Math.floor(Date.now() / 1000);
  const h = b({ alg: "RS256", kid: "k1" });
  const p = b({ aud: "malla-curricular-38175", iss: "https://securetoken.google.com/malla-curricular-38175", sub: uid, iat: now, exp: now + 3600, ...over });
  return `${h}.${p}.${createSign("RSA-SHA256").update(h + "." + p).sign(privateKey).toString("base64url")}`;
};
const w = (await import(pathToFileURL(join(ROOT, "app/_worker.js")).href)).default;
const env = { DB, ADMIN_UIDS: "admin1", ADMIN_EMAILS: "boss@x.com", ASSETS: { fetch: () => new Response("s") } };
const H = "https://x.pages.dev";
const call = async (m, path, t, body, ip) => {
  const r = await w.fetch(new Request(H + path, { method: m, headers: { ...(t ? { authorization: "Bearer " + t } : {}), origin: H, "content-type": "application/json", "cf-connecting-ip": ip || "1.1.1.1" }, body: body ? JSON.stringify(body) : undefined }), env);
  return [r.status, await r.json()];
};
let fails = 0;
const ok = (n, c, x) => { console.log((c ? "OK   " : "FAIL ") + n + (c ? "" : "  -> " + JSON.stringify(x).slice(0, 300))); if (!c) fails++; };
const prof = (name, career) => ({ fields: { name, career, theme: "utesa", avatar: "c1:{}", done: [] } });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/** Cierra una suite: imprime el resultado y sale con código 1 si algo falló (para CI). */
export function finish() {
  console.log(fails ? `\n${fails} FALLOS` : "\nTODO OK");
  process.exit(fails ? 1 : 0);
}
export { sq, env, ok, prof, sleep, call, tok, w, H, allIsc, approved, PENSUMS, b };
