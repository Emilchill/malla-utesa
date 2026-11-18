// tests/moderation.test.mjs — el filtro de malas palabras (enmascara lo ofensivo, no toca lo legítimo).
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("../app/_worker.js", import.meta.url), "utf8");
const a = src.indexOf("/* ============================================================\n   Moderación por reglas");
const b = src.indexOf("const CODE = /^[A-Z]{2,4}-");
const mask = new Function(src.slice(a, b) + "; return maskProfanity;")();
let fails = 0;
const must = (t, why) => { const r = mask(t); const ok = r.flagged && (r.text.match(/\*/g) || []).length >= 3; console.log((ok ? "OK   " : "FALLA") + " MASCARA: " + JSON.stringify(t) + " -> " + JSON.stringify(r.text)); if (!ok) fails++; };
const keep = (t) => { const r = mask(t); const ok = !r.flagged && r.text === t; console.log((ok ? "OK   " : "FALLA") + " LIBRE:   " + JSON.stringify(t) + (ok ? "" : " -> " + JSON.stringify(r.text))); if (!ok) fails++; };

// deben enmascararse
["eres un pendejo", "PUTA madre", "esto es una mierda", "mierrrda", "m1erda", "c@brón", "qué coño es eso", "puñeta", "puneta", "hijueputa", "hijo de puta", "singao", "pariguayo", "mamagüevo", "jódete", "no jodas con eso", "p u t a", "p.u.t.a", "eres un idiota", "fuck you", "vete a la mierda", "carajo!!", "maricón", "cabrona", "que verga", "ctm", "tigueraje de gente", "pajuo", "chinga tu madre", "RMTM", "mmñ", "MMÑ", "eres un mmñ", "mmmñ", "mmmg", "eres un mmg", "MMG!", "mamañema", "MAMAÑEMA", "ñema", "eres un ñema", "mamanema", "nema", "que singar", "singarte"].forEach(t => must(t));
// NO deben enmascararse (falsos positivos)
["Hola, ¿cómo están todos?", "Necesito la computadora", "una disputa interesante", "el apellido Vergara", "un cono de helado", "huevo frito", "qué ridículo examen", "pendiente de pago", "cálculo IV es difícil", "Mariana y Juan", "la analista de datos", "el puntaje del examen", "estudiante de ingeniería", "mi hijo de 5 años", "una cabra y un cabo", "el cuerpo humano", "una cuerda larga", "padre putativo", "shiitake", "Programación II está buena", "Matemáticas Discretas", "Compiladores y base de datos", "ese examen me tiene mal 😅", "grupo de estudio mañana a las 5", "INF-120 y MAT-170", "culturales", "cultura dominicana", "particular", "dictadura de la mayoría", "Ahora o nunca", "escucha esto", "esas son las reglas", "el cabrito del campo", "500 mg de paracetamol", "10 mm de espesor", "un cone de helado", "el cone del tráfico", "cone", "mmm no sé", "mm ok", "tema de la clase", "sistema operativo", "cinema", "enema", "ne"].forEach(t => keep(t));
// tamaño del enmascarado = tamaño de la palabra
const r = mask("eres un pendejo"); if (r.text !== "eres un *******") { console.log("FALLA tamaño", r.text); fails++; } else console.log("OK   tamaño correcto:", r.text);
console.log(fails ? `\n${fails} FALLOS` : "\nTODO OK"); process.exit(fails ? 1 : 0);
