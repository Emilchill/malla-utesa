// tools/build-diagrams.mjs — genera los diagramas animados (SVG en bucle) de docs/img/.
//   node tools/build-diagrams.mjs
// Son SVG con animaciones SMIL: se ven como un GIF en bucle, pero nítidos a cualquier tamaño y livianos.
// GitHub los muestra animados dentro del README. No usan fuentes externas ni imágenes.
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "docs", "img");
mkdirSync(OUT, { recursive: true });

/* ---------- estilo común ---------- */
const C = {
  green: "#00542B", greenSoft: "#E3EFE6", gold: "#C89B3C", goldSoft: "#FBF2DC", blue: "#2F6FB0", blueSoft: "#E4EEF9",
  red: "#C7402C", redSoft: "#FBE7E3", gray: "#6B7568", graySoft: "#EEF1EC", ink: "#17211A", line: "#C9D2C6", bg: "#F7F9F6", card: "#FFFFFF",
  violet: "#6D4BC2", violetSoft: "#EEE8FA",
};
const FONT = `'Segoe UI', 'Inter', 'Helvetica Neue', Arial, sans-serif`;
const MONO = `'JetBrains Mono', 'Consolas', 'Menlo', monospace`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function frame(w, h, title, subtitle, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${esc(title)}">
<title>${esc(title)}</title>
<defs>
  <filter id="sh" x="-10%" y="-10%" width="120%" height="130%"><feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#0b2a17" flood-opacity=".12"/></filter>
  ${["green", "gold", "blue", "gray", "red", "violet", "ink"].map(k => `<marker id="ar-${k}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10z" fill="${C[k]}"/></marker>`).join("")}
  <pattern id="dots" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.1" fill="#DCE3D8"/></pattern>
</defs>
<rect x="1" y="1" width="${w - 2}" height="${h - 2}" rx="18" fill="${C.bg}" stroke="#DDE3DA" stroke-width="1.5"/>
<rect x="1" y="1" width="${w - 2}" height="${h - 2}" rx="18" fill="url(#dots)" opacity=".7"/>
<rect x="0" y="0" width="${w}" height="6" rx="3" fill="${C.green}"/>
<text x="28" y="44" font-family="${FONT}" font-size="21" font-weight="700" fill="${C.ink}">${esc(title)}</text>
<text x="28" y="66" font-family="${FONT}" font-size="13" fill="${C.gray}">${esc(subtitle)}</text>
${body}
</svg>
`;
}

/** Caja UML: cabecera de color con «estereotipo» y título, y líneas de texto debajo. */
function box(x, y, w, h, { title, stereo, lines = [], color = C.green, soft = C.greenSoft, dashed = false, mono = false }) {
  const head = stereo ? 46 : 34;
  return `<g filter="url(#sh)">
  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="${C.card}" stroke="${color}" stroke-width="2"${dashed ? ' stroke-dasharray="6 5"' : ""}/>
  <path d="M${x} ${y + 12} a12 12 0 0 1 12 -12 h${w - 24} a12 12 0 0 1 12 12 v${head - 12} h${-w}z" fill="${soft}"/>
  <line x1="${x}" y1="${y + head}" x2="${x + w}" y2="${y + head}" stroke="${color}" stroke-width="1.2" opacity=".45"/>
  ${stereo ? `<text x="${x + w / 2}" y="${y + 18}" text-anchor="middle" font-family="${FONT}" font-size="11" fill="${color}" opacity=".9">«${esc(stereo)}»</text>` : ""}
  <text x="${x + w / 2}" y="${y + (stereo ? 36 : 23)}" text-anchor="middle" font-family="${FONT}" font-size="15" font-weight="700" fill="${C.ink}">${esc(title)}</text>
  ${lines.map((l, i) => `<text x="${x + 12}" y="${y + head + 20 + i * 17}" font-family="${mono ? MONO : FONT}" font-size="${mono ? 11.5 : 12.5}" fill="${C.ink}" opacity=".85">${esc(l)}</text>`).join("")}
</g>`;
}

/** Punto que viaja por un camino en bucle. */
const dot = (path, color, dur, begin = 0, r = 5) =>
  `<circle r="${r}" fill="${color}" opacity="0"><animateMotion dur="${dur}s" begin="${begin}s" repeatCount="indefinite" path="${path}"/><animate attributeName="opacity" values="0;1;1;0" keyTimes="0;.1;.85;1" dur="${dur}s" begin="${begin}s" repeatCount="indefinite"/></circle>`;

const label = (x, y, t, color = C.gray, anchor = "middle", size = 12) =>
  `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="${FONT}" font-size="${size}" fill="${color}" paint-order="stroke" stroke="${C.bg}" stroke-width="4" stroke-linejoin="round">${esc(t)}</text>`;

/** Aparece en el instante `at` de un ciclo de `T` segundos y desaparece al final (para secuencias en bucle). */
const appear = (at, T, inner) => {
  const a = Math.max(0.001, at / T), b = Math.min(0.9, a + 0.035);
  return `<g opacity="0"><animate attributeName="opacity" values="0;0;1;1;0" keyTimes="0;${a.toFixed(3)};${b.toFixed(3)};0.94;1" dur="${T}s" repeatCount="indefinite"/>${inner}</g>`;
};

/* =====================================================================
   0. Portada animada: una malla que se va completando
   ===================================================================== */
function hero() {
  const W = 960, H = 300, cols = 12, rows = 5, chh = 26, gy = 9, x0 = 440, y0 = 52, T = 9;
  const step = (W - x0 - 52) / cols; // la cuadrícula llena el panel blanco
  let cells = "";
  for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) {
    const x = x0 + c * step, y = y0 + r * (chh + gy);
    const order = c * rows + r, at = (order / (cols * rows)) * 0.7; // se aprueban de izquierda a derecha
    const cur = c === 6 || c === 7 ? 1 : 0;
    cells += `<rect x="${x.toFixed(1)}" y="${y}" width="${(step - 7).toFixed(1)}" height="${chh}" rx="6" fill="${C.graySoft}" stroke="${C.line}" stroke-width="1.2">
      <animate attributeName="fill" values="${C.graySoft};${C.graySoft};${cur ? C.blueSoft : C.greenSoft};${cur ? C.blueSoft : C.greenSoft};${C.graySoft}" keyTimes="0;${at.toFixed(3)};${(at + 0.03).toFixed(3)};0.93;1" dur="${T}s" repeatCount="indefinite"/>
      <animate attributeName="stroke" values="${C.line};${C.line};${cur ? C.blue : C.green};${cur ? C.blue : C.green};${C.line}" keyTimes="0;${at.toFixed(3)};${(at + 0.03).toFixed(3)};0.93;1" dur="${T}s" repeatCount="indefinite"/>
    </rect>`;
  }
  const bar = `<rect x="40" y="214" width="320" height="12" rx="6" fill="${C.graySoft}"/><rect x="40" y="214" width="0" height="12" rx="6" fill="${C.green}"><animate attributeName="width" values="0;320;320;0" keyTimes="0;0.72;0.93;1" dur="${T}s" repeatCount="indefinite"/></rect>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Malla UTESA">
<title>Malla UTESA</title>
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0B6B3A"/><stop offset="1" stop-color="#00542B"/></linearGradient>
<pattern id="dots" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.1" fill="#ffffff" opacity=".08"/></pattern></defs>
<rect width="${W}" height="${H}" rx="22" fill="url(#g)"/><rect width="${W}" height="${H}" rx="22" fill="url(#dots)"/>
<rect x="${x0 - 20}" y="${y0 - 20}" width="${W - 28 - (x0 - 20)}" height="${rows * (chh + gy) + 64}" rx="16" fill="#ffffff" opacity=".96"/>
${cells}
<text x="40" y="96" font-family="${FONT}" font-size="40" font-weight="800" fill="#fff">Malla UTESA</text>
<text x="40" y="132" font-family="${FONT}" font-size="17" fill="#DCEFE2">Tu malla curricular con tu progreso real:</text>
<text x="40" y="156" font-family="${FONT}" font-size="17" fill="#DCEFE2">aprobadas, en curso, disponibles y bloqueadas.</text>
<text x="40" y="200" font-family="${FONT}" font-size="13" fill="#BFE3CC">Avance de la carrera</text>
${bar}
<text x="40" y="262" font-family="${FONT}" font-size="12.5" fill="#BFE3CC">18 carreras · pénsum 2023 · proyecto estudiantil independiente</text>
<g font-family="${FONT}" font-size="12" fill="${C.ink}"><rect x="${x0}" y="${y0 + rows * (chh + gy) + 10}" width="12" height="12" rx="3" fill="${C.greenSoft}" stroke="${C.green}"/><text x="${x0 + 18}" y="${y0 + rows * (chh + gy) + 20}">Aprobada</text>
<rect x="${x0 + 100}" y="${y0 + rows * (chh + gy) + 10}" width="12" height="12" rx="3" fill="${C.blueSoft}" stroke="${C.blue}"/><text x="${x0 + 118}" y="${y0 + rows * (chh + gy) + 20}">En curso</text>
<rect x="${x0 + 200}" y="${y0 + rows * (chh + gy) + 10}" width="12" height="12" rx="3" fill="${C.graySoft}" stroke="${C.line}"/><text x="${x0 + 218}" y="${y0 + rows * (chh + gy) + 20}">Pendiente</text></g>
</svg>
`;
}

/* =====================================================================
   1. Arquitectura (diagrama de componentes)
   ===================================================================== */
function architecture() {
  const W = 980, H = 560;
  const body = `
  <rect x="250" y="92" width="410" height="400" rx="16" fill="#FFFFFF" fill-opacity=".55" stroke="${C.gold}" stroke-width="1.6" stroke-dasharray="7 6"/>
  ${label(455, 482, "Cloudflare · plan gratuito", C.gold, "middle", 12.5)}
  ${box(32, 228, 180, 120, { title: "Estudiante", stereo: "actor", lines: ["Navegador o teléfono", "Marcador (opcional)"], color: C.ink, soft: C.graySoft })}
  ${box(280, 130, 350, 100, { title: "Cloudflare Pages", stereo: "componente", lines: ["Sitio estático: HTML, CSS y JS (app/)", "Sin build · cache-busting por commit"] })}
  ${box(280, 300, 175, 150, { title: "Worker /api", stereo: "componente", lines: ["Verifica el token", "Permisos y límites", "Moderación", "Vinculación UTESA"] })}
  ${box(480, 300, 150, 150, { title: "D1 (SQLite)", stereo: "base de datos", lines: ["Perfiles y avance", "Chat y amistades", "Suspensiones", "Registro"], color: C.blue, soft: C.blueSoft })}
  ${box(712, 120, 240, 120, { title: "Firebase", stereo: "servicio externo", lines: ["Auth: inicio de sesión", "Firestore: avisos en vivo", "(sin contenido de mensajes)"], color: C.violet, soft: C.violetSoft })}
  ${box(712, 318, 240, 130, { title: "Portal de UTESA", stereo: "sistema externo", lines: ["Solo lectura:", "pendientes · inscritas", "resumen (contadores)"], color: C.red, soft: C.redSoft, dashed: true })}

  <path id="p1" d="M212 262 C 245 230, 250 190, 280 182" fill="none" stroke="${C.green}" stroke-width="2.2" marker-end="url(#ar-green)"/>
  <path id="p2" d="M212 300 C 240 320, 250 370, 280 372" fill="none" stroke="${C.green}" stroke-width="2.2" marker-end="url(#ar-green)"/>
  <path d="M455 375 L480 375" fill="none" stroke="${C.blue}" stroke-width="2.2" marker-end="url(#ar-blue)" marker-start="url(#ar-blue)"/>
  <path d="M122 228 C 140 120, 520 70, 712 160" fill="none" stroke="${C.violet}" stroke-width="2" marker-end="url(#ar-violet)"/>
  <path d="M455 330 C 560 260, 620 230, 712 214" fill="none" stroke="${C.violet}" stroke-width="1.6" stroke-dasharray="5 5" marker-end="url(#ar-violet)"/>
  <path d="M630 420 C 670 420, 680 400, 712 392" fill="none" stroke="${C.red}" stroke-width="2.2" marker-end="url(#ar-red)"/>
  <path d="M122 348 C 160 520, 640 540, 800 448" fill="none" stroke="${C.red}" stroke-width="1.6" stroke-dasharray="5 5" marker-end="url(#ar-red)"/>

  ${label(122, 216, "1 · carga la app", C.green)}
  ${label(122, 368, "2 · API con token", C.green)}
  ${label(470, 104, "inicio de sesión · token", C.violet)}
  ${label(612, 262, "verifica la firma", C.violet)}
  ${label(668, 438, "inicio directo", C.red)}
  ${label(450, 528, "marcador: corre en el navegador del estudiante", C.red)}

  ${dot("M212 262 C 245 230, 250 190, 280 182", C.green, 3, 0)}
  ${dot("M212 300 C 240 320, 250 370, 280 372", C.green, 3, 0.8)}
  ${dot("M455 375 L480 375", C.blue, 1.2, 0.3, 4)}
  ${dot("M122 228 C 140 120, 520 70, 712 160", C.violet, 4, 0.4)}
  ${dot("M630 420 C 670 420, 680 400, 712 392", C.red, 2.4, 1.2)}
  ${dot("M122 348 C 160 520, 640 540, 800 448", C.red, 4.5, 2)}
  `;
  return frame(W, H, "Arquitectura", "Cómo se conectan las piezas · los puntos muestran el flujo de datos", body);
}

/* =====================================================================
   2. Vinculación con UTESA (diagrama de secuencia)
   ===================================================================== */
function syncSequence() {
  const W = 980, H = 720, T = 16;
  const lanes = [["Estudiante", 110, C.ink, C.graySoft], ["App (navegador)", 340, C.green, C.greenSoft], ["Worker /api", 590, C.green, C.greenSoft], ["Portal UTESA", 850, C.red, C.redSoft]];
  const X = Object.fromEntries(lanes.map(([n, x]) => [n, x]));
  let s = lanes.map(([n, x, c, soft]) => `
    <g filter="url(#sh)"><rect x="${x - 85}" y="86" width="170" height="44" rx="10" fill="${soft}" stroke="${c}" stroke-width="2"/></g>
    <text x="${x}" y="114" text-anchor="middle" font-family="${FONT}" font-size="14.5" font-weight="700" fill="${C.ink}">${esc(n)}</text>
    <line x1="${x}" y1="130" x2="${x}" y2="${H - 40}" stroke="${c}" stroke-width="1.6" stroke-dasharray="6 6" opacity=".55"/>`).join("");
  const msgs = [
    ["Estudiante", "App (navegador)", "matrícula + contraseña", C.ink],
    ["App (navegador)", "Worker /api", "POST /api/utesa-login (con token)", C.green],
    ["Worker /api", "Portal UTESA", "inicia sesión", C.red],
    ["Worker /api", "Portal UTESA", "asignaturas pendientes", C.red],
    ["Worker /api", "Portal UTESA", "asignaturas inscritas (en curso)", C.red],
    ["Worker /api", "Portal UTESA", "resumen: contadores", C.red],
    ["Worker /api", "Portal UTESA", "cierra sesión", C.red],
    ["Worker /api", "Worker /api", "calcula avance y logros · descarta la contraseña", C.green],
    ["Worker /api", "App (navegador)", "aprobadas · en curso · contadores", C.green, true],
    ["App (navegador)", "Estudiante", "revisa la lista antes de guardar", C.ink, true],
    ["Estudiante", "App (navegador)", "confirma", C.ink],
    ["App (navegador)", "Worker /api", "PUT /api/user → guardado en D1", C.green],
  ];
  msgs.forEach(([a, b, t, col, ret], i) => {
    const y = 168 + i * 38, at = 0.6 + i * 1.05;
    const colorKey = Object.keys(C).find(k => C[k] === col) || "ink";
    let g;
    if (a === b) {
      const x = X[a];
      g = `<path d="M${x} ${y - 6} h46 v22 h-40" fill="none" stroke="${col}" stroke-width="2" marker-end="url(#ar-${colorKey})"/>${label(x + 56, y + 10, t, C.ink, "start", 12.5)}`;
    } else {
      const x1 = X[a], x2 = X[b], dir = x2 > x1 ? 1 : -1;
      g = `<line x1="${x1}" y1="${y}" x2="${x2 - dir * 4}" y2="${y}" stroke="${col}" stroke-width="2"${ret ? ' stroke-dasharray="7 5"' : ""} marker-end="url(#ar-${colorKey})"/>
        <circle r="4.5" fill="${col}"><animateMotion dur="0.7s" begin="${at}s;${at + T}s;${at + 2 * T}s" fill="freeze" path="M${x1} ${y} L${x2} ${y}"/></circle>
        ${label((x1 + x2) / 2, y - 8, `${i + 1}. ${t}`, C.ink, "middle", 12.5)}`;
    }
    s += appear(at, T, g);
  });
  s += appear(12.8, T, `<g filter="url(#sh)"><rect x="440" y="634" width="300" height="56" rx="10" fill="${C.goldSoft}" stroke="${C.gold}" stroke-width="1.5"/></g>
    <text x="456" y="657" font-family="${FONT}" font-size="12.5" font-weight="700" fill="${C.ink}">La contraseña solo existe en memoria</text>
    <text x="456" y="676" font-family="${FONT}" font-size="12" fill="${C.ink}" opacity=".8">durante esta petición; nunca se guarda.</text>`);
  return frame(W, H, "Vinculación con UTESA", "Diagrama de secuencia del inicio de sesión directo · se reproduce en bucle", s);
}

/* =====================================================================
   3. Estados de una materia (diagrama de estados)
   ===================================================================== */
function subjectStates() {
  const W = 980, H = 380, T = 8;
  const st = [["Bloqueada", 70, C.gray, C.graySoft, "faltan requisitos"], ["Disponible", 300, C.gold, C.goldSoft, "se puede inscribir"], ["En curso", 530, C.blue, C.blueSoft, "inscrita este cuatrimestre"], ["Aprobada", 760, C.green, C.greenSoft, "cuenta para el avance"]];
  const y = 160, w = 160, h = 72;
  const hit = [0.04, 0.3, 0.55, 0.8]; // cuándo llega el punto a cada estado
  let s = `<circle cx="40" cy="${y + h / 2}" r="9" fill="${C.ink}"/><line x1="49" y1="${y + h / 2}" x2="68" y2="${y + h / 2}" stroke="${C.ink}" stroke-width="2" marker-end="url(#ar-ink)"/>`;
  st.forEach(([n, x, c, soft, sub], i) => {
    const a = hit[i], b = Math.min(0.97, a + 0.18);
    s += `<g filter="url(#sh)"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="36" fill="${soft}" stroke="${c}" stroke-width="2.2"${i === 0 ? ' stroke-dasharray="6 5"' : ""}>
      <animate attributeName="stroke-width" values="2.2;2.2;5;2.2;2.2" keyTimes="0;${a.toFixed(2)};${(a + 0.04).toFixed(2)};${b.toFixed(2)};1" dur="${T}s" repeatCount="indefinite"/></rect></g>
      <text x="${x + w / 2}" y="${y + 33}" text-anchor="middle" font-family="${FONT}" font-size="16" font-weight="700" fill="${C.ink}">${esc(n)}</text>
      <text x="${x + w / 2}" y="${y + 53}" text-anchor="middle" font-family="${FONT}" font-size="11.5" fill="${C.ink}" opacity=".7">${esc(sub)}</text>`;
  });
  const arrow = (x1, x2, t, col, key) => `<line x1="${x1}" y1="${y + h / 2}" x2="${x2}" y2="${y + h / 2}" stroke="${col}" stroke-width="2.2" marker-end="url(#ar-${key})"/>${label((x1 + x2) / 2, y + h / 2 - 12, t, C.ink, "middle", 12)}`;
  s += arrow(230, 298, "requisitos ✓", C.gold, "gold") + arrow(460, 528, "la inscribes", C.blue, "blue") + arrow(690, 758, "la apruebas", C.green, "green");
  s += `<path d="M590 ${y + h} C 560 ${y + h + 80}, 420 ${y + h + 80}, 390 ${y + h + 4}" fill="none" stroke="${C.red}" stroke-width="2" stroke-dasharray="6 5" marker-end="url(#ar-red)"/>${label(490, y + h + 78, "reprobada o retirada", C.red)}`;
  s += `<path d="M380 ${y} C 400 ${y - 70}, 760 ${y - 70}, 830 ${y - 2}" fill="none" stroke="${C.green}" stroke-width="1.6" stroke-dasharray="4 5" marker-end="url(#ar-green)" opacity=".7"/>${label(605, y - 54, "convalidada o marcada a mano", C.green)}`;
  s += `<circle r="9" fill="#fff" stroke="${C.ink}" stroke-width="2.5"><animateMotion dur="${T}s" repeatCount="indefinite" keyPoints="0;0.02;0.32;0.36;0.66;0.7;1;1" keyTimes="0;0.04;0.26;0.3;0.51;0.55;0.8;1" calcMode="linear" path="M150 ${y + h / 2} L840 ${y + h / 2}"/>
    <animate attributeName="fill" values="${C.graySoft};${C.gold};${C.blue};${C.green};${C.green}" keyTimes="0;0.3;0.55;0.8;1" dur="${T}s" repeatCount="indefinite"/></circle>`;
  s += `<text x="${W - 28}" y="${H - 22}" text-anchor="end" font-family="${FONT}" font-size="12" fill="${C.gray}">Colores iguales a los de la app: gris, dorado, azul y verde.</text>`;
  return frame(W, H, "Estados de una materia", "Diagrama de estados · el punto recorre el camino normal de una materia", s);
}

/* =====================================================================
   4. Modelo de datos (diagrama de clases)
   ===================================================================== */
function dataModel() {
  const W = 980, H = 620, T = 10;
  const ent = [
    ["users", 360, 92, 260, ["pid  (id público)", "name · career", "done[] · current[]", "avatar · frame", "is_mod · is_owner", "needs_setup"], C.green, C.greenSoft],
    ["messages", 40, 92, 230, ["id · room", "uid → users", "text · hidden", "edited_at"], C.blue, C.blueSoft],
    ["reports", 40, 300, 230, ["message_id → messages", "reporter_uid", "reason · text (copia)"], C.blue, C.blueSoft],
    ["friendships", 710, 92, 230, ["from_uid → users", "to_uid → users", "status"], C.violet, C.violetSoft],
    ["chat_groups", 710, 262, 230, ["id · name · owner", "group_members (gid, uid, role)"], C.violet, C.violetSoft],
    ["chat_bans", 360, 360, 260, ["uid → users", "until (fecha de fin)", "reason · by_uid"], C.red, C.redSoft],
    ["mod_log", 710, 412, 230, ["at · actor_uid", "action · target", "detail"], C.gold, C.goldSoft],
    ["banned", 40, 470, 230, ["uid · at · reason", "snapshot (para reactivar)"], C.red, C.redSoft],
  ];
  let s = "";
  const rel = [
    ["M270 150 L360 150", "*", "1"], ["M155 230 L155 300", "1", "*"], ["M620 150 L710 150", "1", "*"], ["M620 200 C 670 220, 670 300, 710 300", "*", "*"],
    ["M490 266 L490 360", "1", "0..1"], ["M620 260 C 680 300, 680 420, 710 450", "1", "*"], ["M360 250 C 300 330, 300 480, 270 510", "", ""],
  ];
  rel.forEach(([d, a, b]) => { s += `<path d="${d}" fill="none" stroke="${C.gray}" stroke-width="1.6" opacity=".75"/>`; });
  ent.forEach(([n, x, y, w, fields, c, soft], i) => {
    const h = 46 + fields.length * 18 + 10, at = (i / ent.length) * 0.85;
    s += box(x, y, w, h, { title: n, lines: fields, color: c, soft, mono: true }).replace(`stroke-width="2"`, `stroke-width="2"><animate attributeName="stroke-width" values="2;2;4.5;2;2" keyTimes="0;${at.toFixed(3)};${(at + 0.05).toFixed(3)};${(at + 0.12).toFixed(3)};1" dur="${T}s" repeatCount="indefinite"/></rect><rect x="-9" y="-9" width="0" height="0"`);
  });
  s += label(305, 140, "*", C.gray) + label(345, 140, "1", C.gray) + label(640, 140, "1", C.gray) + label(700, 140, "*", C.gray) + label(500, 290, "1", C.gray) + label(506, 350, "0..1", C.gray);
  s += label(155, 458, "al eliminar: copia del perfil", C.red, "middle", 11.5);
  return frame(W, H, "Modelo de datos (D1)", "Diagrama de clases simplificado · se resalta una tabla a la vez", s);
}

/* =====================================================================
   5. Moderación (diagrama de actividad)
   ===================================================================== */
function moderation() {
  const W = 980, H = 520, T = 9;
  let s = `<circle cx="70" cy="140" r="11" fill="${C.ink}"/>`;
  s += box(110, 104, 200, 72, { title: "Alguien reporta", lines: ["motivo + detalle"], color: C.ink, soft: C.graySoft });
  s += box(360, 104, 230, 72, { title: "Moderación", lines: ["Configuración → Moderación"] });
  s += `<path d="M81 140 L110 140" stroke="${C.ink}" stroke-width="2" marker-end="url(#ar-ink)"/><path d="M310 140 L360 140" stroke="${C.green}" stroke-width="2" marker-end="url(#ar-green)"/>`;
  s += `<path d="M640 110 L680 140 L640 170 L600 140z" fill="${C.goldSoft}" stroke="${C.gold}" stroke-width="2"/><path d="M590 140 L600 140" stroke="${C.green}" stroke-width="2"/>` + label(735, 132, "¿qué hacer?", C.gold, "middle", 12.5);
  const acts = [["Ocultar mensaje", "el texto queda como evidencia", C.blue, C.blueSoft], ["Suspender del chat", "10 min a 30 días · con motivo", C.gold, C.goldSoft], ["Reiniciar cuenta", "vuelve a configurar su perfil", C.violet, C.violetSoft], ["Eliminar (dueño)", "queda en «Eliminadas»", C.red, C.redSoft]];
  acts.forEach(([t, sub, c, soft], i) => {
    const y = 230 + i * 66, key = Object.keys(C).find(k => C[k] === c);
    s += `<path d="M640 170 C 640 ${y + 20}, 660 ${y + 26}, 700 ${y + 26}" fill="none" stroke="${c}" stroke-width="2" marker-end="url(#ar-${key})"/>`;
    s += box(700, y, 250, 54, { title: t, color: c, soft }).replace(`y="${y + 23}"`, `y="${y + 21}"`) + label(825, y + 47, sub, C.ink, "middle", 11.5);
    s += dot(`M640 170 C 640 ${y + 20}, 660 ${y + 26}, 700 ${y + 26}`, c, 2.2, 0.5 + i * 0.55);
  });
  s += box(330, 330, 250, 86, { title: "Registro de moderación", lines: ["quién · qué · a quién · cuándo"], color: C.gold, soft: C.goldSoft });
  s += `<path d="M700 300 C 640 340, 620 360, 580 368" fill="none" stroke="${C.gold}" stroke-width="1.6" stroke-dasharray="5 5" marker-end="url(#ar-gold)"/>`;
  s += box(60, 330, 220, 86, { title: "Reactivar", lines: ["vuelve con su perfil", "y su avance"], color: C.green });
  s += `<path d="M700 452 C 500 500, 300 470, 200 418" fill="none" stroke="${C.red}" stroke-width="1.6" stroke-dasharray="5 5" marker-end="url(#ar-red)"/>${label(430, 488, "el dueño puede reactivar", C.red)}${label(455, 318, "todo queda anotado", C.gold, "middle", 11.5)}`;
  s += dot("M81 140 L110 140 M310 140 L600 140", C.ink, 2.6, 0);
  s += `<text x="${W - 28}" y="${H - 20}" text-anchor="end" font-family="${FONT}" font-size="12" fill="${C.gray}">La persona suspendida o eliminada ve el motivo en su pantalla.</text>`;
  return frame(W, H, "Moderación", "Diagrama de actividad · qué pasa cuando se reporta algo", s);
}

const files = { "hero.svg": hero(), "arquitectura.svg": architecture(), "vinculacion.svg": syncSequence(), "estados-materia.svg": subjectStates(), "modelo-datos.svg": dataModel(), "moderacion.svg": moderation() };
for (const [name, svg] of Object.entries(files)) {
  writeFileSync(join(OUT, name), svg);
  console.log(`docs/img/${name}  ${(svg.length / 1024).toFixed(1)} KB`);
}
