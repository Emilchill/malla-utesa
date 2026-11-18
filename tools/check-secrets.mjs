// tools/check-secrets.mjs — red de seguridad: falla si algún archivo del repo parece contener un secreto.
//   npm run check:secrets   (también corre dentro de `npm run check` y del CI)
//
// No es un escáner completo (usa patrones conocidos); no reemplaza la regla: NUNCA subir secretos.
// La configuración WEB de Firebase (apiKey "AIza…") es pública por diseño y solo se permite en app/js/firebase-config.js.
import { readdirSync, statSync, readFileSync } from "node:fs";
import { join, dirname, relative, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SKIP_DIRS = new Set(["node_modules", ".git", ".dev-site", ".wrangler"]);
const SKIP_EXT = new Set([".pdf", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".mp4", ".mp3", ".wav", ".zip", ".woff", ".woff2"]);
const ALLOWED = { "AIza": "app/js/firebase-config.js" };

const PATTERNS = [
  ["token de GitHub", /\bgh[pousr]_[A-Za-z0-9]{30,}\b/],
  ["token de GitHub (fine-grained)", /\bgithub_pat_[A-Za-z0-9_]{30,}\b/],
  ["clave privada", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["clave de cuenta de servicio (JSON)", /"private_key"\s*:\s*"-----BEGIN/],
  ["token de Slack", /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/],
  ["clave tipo sk-", /\bsk-[A-Za-z0-9]{32,}\b/],
  ["clave de AWS", /\bAKIA[0-9A-Z]{16}\b/],
  ["clave de Google (AIza…)", /\bAIza[0-9A-Za-z_-]{35}\b/, "AIza"],
  ["token de Cloudflare asignado", /CLOUDFLARE_API_TOKEN\s*[:=]\s*["']?[A-Za-z0-9_-]{30,}/],
  ["contraseña asignada", /\b(password|passwd|contrase[nñ]a)\s*[:=]\s*["'][^"'\s]{8,}["']/i],
];

const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (!SKIP_EXT.has(extname(name).toLowerCase()) && statSync(p).size < 3_000_000) files.push(p);
  }
})(ROOT);

let found = 0;
for (const f of files) {
  const rel = relative(ROOT, f).split(sep).join("/");
  if (rel === "tools/check-secrets.mjs") continue;
  const text = readFileSync(f, "utf8");
  for (const [label, re, key] of PATTERNS) {
    if (!re.test(text)) continue;
    if (key && ALLOWED[key] === rel) continue; // permitido solo ahí
    // "contraseña asignada": ignora tests y documentación, que usan valores de ejemplo
    if (label === "contraseña asignada" && (rel.startsWith("tests/") || rel.startsWith("docs/") || rel.endsWith(".md") || rel.startsWith("tools/"))) continue;
    found++;
    console.error(`✗ Posible secreto (${label}) en ${rel}`);
  }
}
console.log(found ? `\n${found} posible(s) secreto(s). Quítalo(s), revócalo(s) si eran reales y vuelve a intentar.` : `✓ Sin secretos a la vista en ${files.length} archivos`);
process.exit(found ? 1 : 0);
