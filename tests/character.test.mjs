// tests/character.test.mjs — compatibilidad del creador de personajes.
//   · todas las combinaciones de corte × gorro/casco × forma de cara × vello facial (y piercings, cejas, lentes…)
//     producen un SVG bien formado, sin "undefined"/"NaN" y sin referencias url(#…) rotas;
//   · los cortes altos (puntas, mohicano, tupé, rizos, moños) se adaptan con gorro, corona o casco;
//   · los avatares guardados antes de añadir opciones nuevas se siguen leyendo igual (índices estables).
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";

const ch = await import(pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), "../app/js/character.js")).href);
const { SCHEMAS, characterSvg, decodeCharacter, encodeCharacter, defaultConfig, randomConfig } = ch;

let n = 0;
const ok = (msg) => { n++; console.log("OK   " + msg); };
const field = (key) => SCHEMAS.p.tabs.flatMap(t => t.fields).find(f => f.key === key);
const count = (key) => { const f = field(key); return f.type === "bool" ? 2 : f.type === "opt" ? f.names.length : f.colors.length + (f.none ? 1 : 0); };

/** Comprueba que el SVG esté bien formado y sin valores rotos. Devuelve un mensaje de error o "". */
function svgProblem(svg) {
  if (/undefined|NaN|Infinity|\[object/.test(svg)) return "valor roto (undefined/NaN)";
  const stack = [];
  const re = /<(\/?)([a-zA-Z][\w:-]*)([^>]*?)(\/?)>/g;
  let m;
  while ((m = re.exec(svg))) {
    const [, close, tag, , self] = m;
    if (self) continue;
    if (close) { if (stack.pop() !== tag) return `etiqueta </${tag}> sin abrir`; }
    else stack.push(tag);
  }
  if (stack.length) return `etiquetas sin cerrar: ${stack.join(",")}`;
  const ids = new Set([...svg.matchAll(/\bid="([^"]+)"/g)].map(x => x[1]));
  for (const [, ref] of svg.matchAll(/url\(#([^)]+)\)/g)) if (!ids.has(ref)) return `url(#${ref}) sin definir`;
  return "";
}
const person = (over) => ({ ...defaultConfig("p"), ...over });
const render = (cfg) => characterSvg(cfg, 64, "#4F9FEF").replace(/cg-\d+/g, "cg");

// 1) Corte × gorro × forma de cara × vello facial
let combos = 0;
for (let h = 0; h < count("h"); h++)
  for (let ht = 0; ht < count("ht"); ht++)
    for (let f = 0; f < count("f"); f++)
      for (let fh = 0; fh < count("fh"); fh++) {
        const p = svgProblem(render(person({ h, ht, f, fh, fhc: (h + fh) % count("fhc") })));
        assert.equal(p, "", `h=${h} ht=${ht} f=${f} fh=${fh}: ${p}`);
        combos++;
      }
ok(`${combos} combinaciones de corte × gorro × cara × barba dan un SVG válido`);

// 2) Corte × corona/casco exclusivo
for (let h = 0; h < count("h"); h++) for (let xh = 0; xh < count("xh"); xh++) for (let f = 0; f < 3; f++)
  assert.equal(svgProblem(render(person({ h, xh, f }))), "", `h=${h} xh=${xh}`);
ok("cortes × coronas/cascos exclusivos: válidos");

// 3) Barba × boca × nariz × piercing × lunar (todo lo que vive alrededor de la boca)
for (let fh = 0; fh < count("fh"); fh++) for (let m = 0; m < count("m"); m++) for (let nn = 0; nn < count("n"); nn++)
  for (let pc = 0; pc < count("pc"); pc++) for (let mo = 0; mo < count("mo"); mo++)
    assert.equal(svgProblem(render(person({ fh, m, n: nn, pc, mo, lp: (m + pc) % count("lp") }))), "", `fh=${fh} m=${m} n=${nn} pc=${pc} mo=${mo}`);
ok("barba × boca × nariz × piercing × lunar: válidos");

// 4) Cejas × lentes × visores × corte (flequillo, tupé…) y aretes con cada cara
for (let b = 0; b < count("b"); b++) for (let g = 0; g < count("g"); g++) for (let xg = 0; xg < count("xg"); xg++) for (let h = 0; h < count("h"); h++)
  assert.equal(svgProblem(render(person({ b, g, xg, h, pc: 3 }))), "", `b=${b} g=${g} xg=${xg} h=${h}`);
for (let er = 0; er < count("er"); er++) for (let f = 0; f < 3; f++) for (let h = 0; h < count("h"); h++)
  assert.equal(svgProblem(render(person({ er, f, h }))), "", `er=${er} f=${f} h=${h}`);
ok("cejas × lentes × visores × cortes y aretes × caras: válidos");

// 5) Los cortes altos se adaptan bajo gorro, corona imperial o casco espartano (no lo atraviesan)
const TALL = { 10: 2, 13: 1, 14: 2, 20: 12, 21: 12 };
for (const [tall, low] of Object.entries(TALL)) for (const cover of [{ ht: 1 }, { ht: 6 }, { xh: 1 }, { xh: 3 }])
  assert.equal(render(person({ h: +tall, ...cover })), render(person({ h: low, ...cover })), `corte ${tall} con ${JSON.stringify(cover)}`);
// sin nada en la cabeza se dibujan completos
for (const tall of Object.keys(TALL)) assert.notEqual(render(person({ h: +tall })), render(person({ h: TALL[tall] })), `corte ${tall} sin gorro`);
ok("puntas, mohicano, tupé, rizos y moño alto se adaptan al gorro, corona o casco");

// 6) Avatares guardados antes de esta versión (solo claves antiguas) se leen igual y las claves nuevas quedan en "ninguno"
const old = 'c1:{"k":"p","s":3,"f":2,"h":10,"hc":4,"fh":4,"e":2,"ec":3,"b":4,"n":1,"m":2,"fr":1,"lp":0,"bl":2,"sh":0,"li":0,"c":12,"cc":3,"g":1,"er":2,"ht":0,"hv":0,"xh":0,"xg":0,"xb":0,"xw":0,"xa":0}';
const d = decodeCharacter(old);
assert.deepEqual([d.h, d.fh, d.b, d.er, d.hc], [10, 4, 4, 2, 4]);
assert.deepEqual([d.fhc, d.pc, d.mo], [0, 0, 0]);
assert.equal(field("h").names[10], "Puntas"); assert.equal(field("fh").names[4], "Barba"); assert.equal(field("er").names[2], "Aros");
ok("avatares antiguos: mismos valores; barba del color del pelo, sin piercing ni lunar");

// 7) Valores fuera de rango (p. ej. de una versión futura) vuelven al valor por defecto; ida y vuelta estable
const weird = decodeCharacter('c1:{"k":"p","h":999,"fh":-1,"pc":2.5,"mo":"x"}');
assert.deepEqual([weird.h, weird.fh, weird.pc, weird.mo], [field("h").def, 0, 0, 0]);
let rs = 7; const rnd = () => ((rs = (rs * 1103515245 + 12345) % 2147483648) / 2147483648);
for (let i = 0; i < 500; i++) {
  const c = randomConfig("p", rnd);
  assert.deepEqual(decodeCharacter(encodeCharacter(c)), c);
  assert.equal(svgProblem(render(c)), "");
}
ok("valores raros se ignoran; 500 personajes aleatorios van y vuelven sin cambios");

// 8) El texto guardado sigue cabiendo de sobra en el límite del servidor (4000 caracteres)
const maxCfg = person({}); for (const f of SCHEMAS.p.tabs.flatMap(t => t.fields)) maxCfg[f.key] = count(f.key) - 1;
assert.ok(encodeCharacter(maxCfg).length < 1000);
ok(`avatar más largo posible: ${encodeCharacter(maxCfg).length} caracteres (< 4000 del servidor)`);

console.log(`\nTODO OK (${n} pruebas)`);
