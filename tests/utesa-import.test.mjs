// tests/utesa-import.test.mjs — el texto que llega por el enlace del marcador (#utesa=...) NUNCA debe entrar como HTML.
// Regresión del hallazgo F-01 (XSS por CARRERA sin escapar en analyzePayload).
// utesa-import.js es un módulo de navegador (importa URLs), así que aquí se extrae solo la lógica pura y se evalúa.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";

const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../app/js/utesa-import.js"), "utf8");
const from = src.indexOf("function norm(");
const to = src.indexOf("/* ---------- Marcador");
const escAt = src.indexOf("function esc(s)");
assert.ok(from > 0 && to > from && escAt > 0, "no se encontró el código esperado en utesa-import.js");
const code = src.slice(from, to).replace(/export function/g, "function") + "\n" + src.slice(escAt, src.indexOf("\n}\n", escAt) + 3);
const { analyzePayload } = new Function(
  'const META_PREFIX = "@@MALLA "; const STD_CODE = /^[A-Z]{2,4}-\\d{3}$/;\n' + code + "\nreturn { analyzePayload };"
)();

let n = 0;
const ok = (msg) => { n++; console.log("OK   " + msg); };

const pensum = {
  nombre: "Ingeniería en Sistemas Computacionales",
  cuatrimestres: [{ materias: [{ c: "MAT-160", n: "Cálculo I" }, { c: "INF-117", n: "Programación" }] }],
  electivas: [],
};
const rows = "\nP\tZZZ-111\nP\tZZZ-222\nP\tZZZ-333"; // claves que no son del pensum → rama "no coinciden"

// 1) La carrera maliciosa sale escapada en el mensaje de error
const evil = '<img src=x onerror="window.__xss=1">';
const bad = analyzePayload(`@@MALLA MODO=sync|CARRERA=${evil}|PENSUM=2023${rows}`, pensum);
assert.ok(bad.error, "debía devolver error por carrera distinta");
assert.ok(!/<img/i.test(bad.error), "el error contiene una etiqueta <img> sin escapar: " + bad.error);
assert.ok(!/onerror\s*=\s*"/i.test(bad.error), "el error contiene un atributo con comillas sin escapar");
assert.ok(bad.error.includes("&lt;img"), "la carrera debe verse como texto escapado");
ok("CARRERA con HTML sale escapada en el error");

// 2) Otras formas de inyección
for (const payload of ['"><script>alert(1)</script>', "'><svg onload=alert(1)>", "</strong><iframe src=javascript:alert(1)>"]) {
  const r = analyzePayload(`@@MALLA MODO=sync|CARRERA=${payload}|PENSUM=2023${rows}`, pensum);
  assert.ok(r.error && !/<(script|svg|iframe|img)/i.test(r.error), "inyección sin escapar: " + payload);
}
ok("script/svg/iframe en CARRERA no pasan como etiquetas");

// 3) Una carrera muy larga se recorta
const long = "A".repeat(500);
const r3 = analyzePayload(`@@MALLA MODO=sync|CARRERA=${long}|PENSUM=2023${rows}`, pensum);
assert.ok(r3.error.length < 500, "la carrera larga debe recortarse");
ok("carrera larga se recorta");

// 4) El mensaje normal sigue funcionando (la parte fija conserva su <strong>)
const normal = analyzePayload(`@@MALLA MODO=sync|CARRERA=Derecho|PENSUM=2023${rows}`, pensum);
assert.ok(normal.error.includes("<strong>Ingeniería en Sistemas Computacionales</strong>") && normal.error.includes("UTESA dice: Derecho"), "mensaje de error cambiado");
ok("mensaje de error legítimo intacto");

console.log(`\nTODO OK (${n} pruebas)`);
