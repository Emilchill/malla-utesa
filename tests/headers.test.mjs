// tests/headers.test.mjs — app/_headers (cabeceras de seguridad de los archivos estáticos).
// No prueba Cloudflare: comprueba que el archivo existe, tiene las cabeceras clave y que la CSP
// permite los orígenes externos que la app realmente usa (si falta uno, al activar la CSP se rompería esa función).
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";

const app = join(dirname(fileURLToPath(import.meta.url)), "../app");
const text = readFileSync(join(app, "_headers"), "utf8");
const lines = text.split(/\r?\n/);
assert.equal(lines[0].trim(), "/*", "la primera regla debe ser /*");
const headers = new Map();
for (const l of lines.slice(1)) {
  if (!l.trim()) continue;
  assert.ok(/^\s{2}[A-Za-z-]+: .+$/.test(l), "línea con formato inválido en _headers: " + l);
  const i = l.indexOf(":");
  headers.set(l.slice(0, i).trim().toLowerCase(), l.slice(i + 1).trim());
}
let n = 0;
const ok = (m) => { n++; console.log("OK   " + m); };

assert.equal(headers.get("x-frame-options"), "DENY"); ok("X-Frame-Options: DENY");
assert.equal(headers.get("x-content-type-options"), "nosniff"); ok("nosniff");
const report = headers.get("content-security-policy") || "";
assert.ok(report, "falta Content-Security-Policy");
assert.ok(!headers.has("content-security-policy-report-only"), "ya no debe quedar una política solo en modo informe");
for (const d of ["default-src 'self'", "frame-ancestors 'none'", "object-src 'none'", "base-uri 'self'", "form-action 'self'"]) assert.ok(report.includes(d), "falta en la CSP: " + d);
ok("CSP aplicada (no solo informe) con default-src, frame-ancestors, object-src, base-uri y form-action");
for (const origin of ["https://www.gstatic.com", "https://fonts.googleapis.com", "https://fonts.gstatic.com", "https://www.youtube-nocookie.com", "https://accounts.google.com", "https://malla-curricular-38175.firebaseapp.com"]) {
  assert.ok(report.includes(origin), "la CSP no permite " + origin);
}
assert.ok(report.includes("https://*.googleapis.com"), "falta *.googleapis.com (Auth y Firestore)");
ok("la CSP cubre Firebase, Google, fuentes y YouTube");

// ningún HTML debe cargar scripts o estilos de orígenes que la política no permita
const external = new Set();
for (const f of readdirSync(app).filter(f => f.endsWith(".html"))) {
  const html = readFileSync(join(app, f), "utf8");
  for (const m of html.matchAll(/<(?:script|link)[^>]+(?:src|href)=["'](https?:\/\/[^"']+)["']/gi)) external.add(new URL(m[1]).origin);
}
for (const o of external) assert.ok(report.includes(o) || report.includes(o.replace("://", "://*.")), "origen externo cargado por un HTML y no permitido en la CSP: " + o);
ok("los HTML solo cargan recursos de orígenes permitidos (" + ([...external].join(", ") || "ninguno") + ")");

console.log(`\nTODO OK (${n} pruebas)`);
