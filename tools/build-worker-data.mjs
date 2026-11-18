// Regenera dentro de _worker.js los datos que el servidor necesita:
//   · la lista de logros y los códigos de cada pénsum (js/achievements.js + js/pensums-data.js)
//   · la lista de palabras que el chat enmascara (tools/malas-palabras.txt)
// Úsalo cada vez que cambies alguno de esos archivos:
//   node tools/build-worker-data.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { PENSUMS } from "../app/js/pensums-data.js";
import { ACHIEVEMENTS } from "../app/js/achievements.js";

const careerCodes = {};
for (const [k, p] of Object.entries(PENSUMS)) {
  careerCodes[k] = [...new Set(p.cuatrimestres.flatMap(c => c.materias.map(m => m.c)).filter(c => /^[A-Z]{2,4}-\d{3}$/.test(c)))];
}
const achBlock = `/* <<ACH-DATA>> */
const ACH_CODES = new Set(${JSON.stringify(ACHIEVEMENTS.map(a => a.id))});
const CAREER_CODES = ${JSON.stringify(careerCodes)};
/* <</ACH-DATA>> */`;

const NL = /\r?\n/;
const lines = readFileSync(new URL("./malas-palabras.txt", import.meta.url), "utf8")
  .split(NL).map(l => l.trim().toLowerCase()).filter(l => l && !l.startsWith("#"));
const bad = lines.filter(l => !l.startsWith("ok:") && !l.startsWith("exacto:"));
const safe = lines.filter(l => l.startsWith("ok:")).map(l => l.slice(3));
const exact = lines.filter(l => l.startsWith("exacto:")).map(l => l.slice(7));
const badBlock = `/* <<BAD-WORDS>> */
const BAD_WORDS = ${JSON.stringify(bad)};
const SAFE_WORDS = ${JSON.stringify(safe)};
const SAFE_EXACT = new Set(${JSON.stringify(exact)});
/* <</BAD-WORDS>> */`;

const path = new URL("../app/_worker.js", import.meta.url);
let src = readFileSync(path, "utf8");
const swap = (re, name, block) => {
  if (!re.test(src)) throw new Error(`No se encontraron las marcas ${name} en _worker.js`);
  src = src.replace(re, () => block);
};
swap(/\/\* <<ACH-DATA>> \*\/[\s\S]*?\/\* <<\/ACH-DATA>> \*\//, "ACH-DATA", achBlock);
swap(/\/\* <<BAD-WORDS>> \*\/[\s\S]*?\/\* <<\/BAD-WORDS>> \*\//, "BAD-WORDS", badBlock);
writeFileSync(path, src);
console.log(`Logros: ${ACHIEVEMENTS.length} · Carreras: ${Object.keys(careerCodes).length} · Palabras enmascaradas: ${bad.length} (+${safe.length} excepciones)`);
