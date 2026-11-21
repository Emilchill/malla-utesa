// tests/print-sheet.test.mjs — la hoja imprimible de una página se arma bien para TODAS las carreras:
//   · HTML/SVG bien formado, sin "undefined"/"NaN" y con los nombres escapados;
//   · están todas las materias del pénsum y ninguna caja se sale de la hoja (265 × 199 mm);
//   · las flechas solo unen cuatrimestres contiguos y los totales coinciden con el pénsum.
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { PENSUMS } = await import(pathToFileURL(join(root, "app/js/pensums-data.js")).href);
const { buildPrintSheet } = await import(pathToFileURL(join(root, "app/js/print-sheet.js")).href);

let n = 0;
const ok = (msg) => { n++; console.log("OK   " + msg); };
const prereqsOf = (m) => (!m.req || m.req === "-") ? [] : m.req.split(",").map(s => s.trim()).filter(Boolean);

function problem(html) {
  if (/undefined|NaN|Infinity|\[object/.test(html)) return "valor roto";
  const stack = [];
  const VOID = new Set(["br", "img", "input", "meta", "link", "hr"]);
  for (const [, close, tag, , self] of html.matchAll(/<(\/?)([a-zA-Z][\w:-]*)([^>]*?)(\/?)>/g)) {
    if (self || VOID.has(tag)) continue;
    if (close) { if (stack.pop() !== tag) return `</${tag}> sin abrir`; } else stack.push(tag);
  }
  if (stack.length) return `sin cerrar: ${stack.join(",")}`;
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(x => x[1]));
  for (const [, ref] of html.matchAll(/url\(#([^)]+)\)/g)) if (!ids.has(ref)) return `url(#${ref}) sin definir`;
  return "";
}

for (const [key, P] of Object.entries(PENSUMS)) {
  for (const upTo of [0, 4, P.cuatrimestres.length]) {
    const done = new Set(P.cuatrimestres.slice(0, upTo).flatMap(c => c.materias.map(m => m.c)));
    const html = buildPrintSheet({
      pensum: P, done, prereqsOf, isUnlocked: (m) => prereqsOf(m).every(p => done.has(p)),
      name: 'Ana <b>"Prueba"</b>', stats: { pct: 50, creditosHechos: 10, totalCreditos: P.totalCreditos },
    });
    assert.equal(problem(html), "", `${key} (${upTo}): ${problem(html)}`);
    assert.ok(!html.includes("<b>\"Prueba\"</b>"), `${key}: el nombre no se escapó`);

    // todas las materias (y espacios de electiva) tienen su caja
    const total = P.cuatrimestres.reduce((s, c) => s + c.materias.length, 0);
    assert.equal((html.match(/class="ps-box /g) || []).length, total, `${key}: faltan cajas`);
    assert.equal((html.match(/ps-box st-done/g) || []).length,
      P.cuatrimestres.slice(0, upTo).flatMap(c => c.materias).filter(m => m.c !== "ELECTIVA").length, `${key}: aprobadas`);

    // ninguna caja se sale de la hoja
    for (const [, l, t, w, h] of html.matchAll(/class="ps-box [^"]*" style="left:([\d.]+)mm;top:([\d.]+)mm;width:([\d.]+)mm;height:([\d.]+)mm/g)) {
      assert.ok(+l >= 0 && +l + +w <= 265.01 && +t >= 0 && +t + +h <= 199, `${key}: caja fuera de la hoja (${l},${t})`);
      assert.ok(+h >= 7, `${key}: caja demasiado baja (${h} mm)`);
    }
    // flechas: van de izquierda a derecha y cruzan un solo espacio entre columnas
    for (const [, x1, , x2] of html.matchAll(/<path d="M([\d.]+) ([\d.]+) H[\d.]+ V[\d.]+ H([\d.]+)"/g))
      assert.ok(+x2 > +x1 && +x2 - +x1 <= 5.01, `${key}: flecha rara ${x1}→${x2}`);
    // totales
    const sum = (k) => P.cuatrimestres.flatMap(c => c.materias).reduce((s, m) => s + (m[k] || 0), 0);
    assert.ok(html.includes(`<td>TH</td><td>${sum("th").toLocaleString("es-DO")}</td>`), `${key}: total TH`);
  }
}
ok(`hoja válida para las ${Object.keys(PENSUMS).length} carreras (sin progreso, a medias y completa)`);
ok("todas las materias tienen caja dentro de la hoja; flechas solo entre ciclos contiguos; totales correctos");
console.log(`\nTODO OK (${n} pruebas)`);
