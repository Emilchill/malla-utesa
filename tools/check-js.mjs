// tools/check-js.mjs — revisa que TODOS los .js y .mjs del proyecto tengan sintaxis válida (rápido, sin dependencias).
//   npm run check:js
import { readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SKIP = new Set(["node_modules", ".git", ".dev-site", "legacy"]);
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(m?js)$/.test(name)) files.push(p);
  }
})(ROOT);

let bad = 0;
for (const f of files) {
  try { execFileSync(process.execPath, ["--check", f], { stdio: "pipe" }); }
  catch (e) { bad++; console.error(`✗ ${relative(ROOT, f)}\n${String(e.stderr || e.message).split("\n").slice(0, 4).join("\n")}`); }
}
console.log(bad ? `\n${bad} archivo(s) con errores de sintaxis` : `✓ ${files.length} archivos JavaScript con sintaxis válida`);
process.exit(bad ? 1 : 0);
