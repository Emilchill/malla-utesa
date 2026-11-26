// tools/build-diagrams.mjs — genera los diagramas animados de docs/img/ (SVG en bucle).
//   node tools/build-diagrams.mjs
// Estilo: fondo nocturno con brillos y cuadrícula tenue, nodos con ícono dentro de círculos de vidrio, conexiones curvas
// con trazos que fluyen y pulsos de luz. Poco texto: cada diagrama cuenta una idea. Las animaciones (SMIL + CSS) se ven
// como un GIF en bucle, pero el archivo es nítido a cualquier tamaño y pesa pocos KB. GitHub las muestra en el README.
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "docs", "img");
mkdirSync(OUT, { recursive: true });

/* ---------- paleta (colores claros sobre fondo oscuro, contrastes sutiles) ---------- */
const C = {
  green: "#3DDC97", gold: "#F2C26B", blue: "#6FA8FF", red: "#FF7A8A", violet: "#A18BFF", cyan: "#35D6EA",
  gray: "#8E9AC0", ink: "#F3F6FF", sub: "#B4BFE3", panel: "#12163A",
};
const FONT = `ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* ---------- íconos (trazos sobre una cuadrícula de 24) ---------- */
const ICON = {
  user: `<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.2 3.6-7 8-7s8 2.8 8 7"/>`,
  browser: `<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 9h18"/><circle cx="6.5" cy="6.5" r=".6"/><circle cx="9" cy="6.5" r=".6"/><path d="M8 14h8M8 17h5"/>`,
  server: `<rect x="4" y="3.5" width="16" height="7" rx="2"/><rect x="4" y="13.5" width="16" height="7" rx="2"/><path d="M8 7h.01M8 17h.01M12 7h5M12 17h5"/>`,
  db: `<ellipse cx="12" cy="5.5" rx="7.5" ry="2.8"/><path d="M4.5 5.5v13c0 1.6 3.4 2.8 7.5 2.8s7.5-1.2 7.5-2.8v-13"/><path d="M4.5 12c0 1.6 3.4 2.8 7.5 2.8s7.5-1.2 7.5-2.8"/>`,
  key: `<circle cx="8" cy="15" r="4.2"/><path d="M11 12 20 3M16.5 6.5l3 3M14 9l2 2"/>`,
  bolt: `<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>`,
  building: `<path d="M3 10.5 12 4l9 6.5M5 10.5V20M19 10.5V20M9.5 20v-5h5v5M3 20h18"/>`,
  list: `<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>`,
  play: `<circle cx="12" cy="12" r="9"/><path d="M10 8.5v7l5.5-3.5z"/>`,
  chart: `<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>`,
  check: `<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.8 2.8L16.5 9.5"/>`,
  lock: `<rect x="5" y="11" width="14" height="10" rx="2.5"/><path d="M8 11V7.5a4 4 0 0 1 8 0V11"/>`,
  unlock: `<rect x="5" y="11" width="14" height="10" rx="2.5"/><path d="M8 11V7.5a4 4 0 0 1 7.7-1.5"/>`,
  chat: `<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9.5h8M8 12.5h5"/>`,
  flag: `<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>`,
  users: `<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18.5 14.5c1.9.8 3 2.7 3 5.5"/>`,
  group: `<circle cx="12" cy="7" r="3"/><circle cx="5" cy="11" r="2.4"/><circle cx="19" cy="11" r="2.4"/><path d="M7 20c0-3 2.2-5 5-5s5 2 5 5M1.5 19c0-2.2 1.4-3.6 3.5-3.6M22.5 19c0-2.2-1.4-3.6-3.5-3.6"/>`,
  clock: `<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>`,
  shield: `<path d="M12 3 20 6v6c0 4.8-3.4 8-8 9-4.6-1-8-4.2-8-9V6z"/><path d="M9 12l2 2 4-4"/>`,
  eyeoff: `<path d="M3 3l18 18M10.6 6.2A9.6 9.6 0 0 1 12 6c5 0 9 6 9 6a15 15 0 0 1-3 3.6M6.4 7.6C4.3 9.2 3 12 3 12s4 6 9 6c1.6 0 3-.4 4.3-1"/><path d="M9.9 10a3 3 0 0 0 4.1 4.1"/>`,
  refresh: `<path d="M20 11a8 8 0 0 0-14.6-4.4L3 9M3 4v5h5M4 13a8 8 0 0 0 14.6 4.4L21 15M21 20v-5h-5"/>`,
  trash: `<path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v6M14 11v6"/>`,
  archive: `<rect x="3" y="4" width="18" height="5" rx="1.5"/><path d="M5 9v10.5h14V9M10 13h4"/>`,
  id: `<rect x="3" y="5" width="18" height="14" rx="3"/><circle cx="9" cy="11" r="2.4"/><path d="M5.8 16.2c.6-1.7 1.8-2.6 3.2-2.6s2.6.9 3.2 2.6M14.5 10h4M14.5 13.5h3"/>`,
};

/* ---------- piezas comunes ---------- */
function backdrop(w, h, rx = 26) {
  const glow = (id, col, op) => `<radialGradient id="${id}" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="${col}" stop-opacity="${op}"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></radialGradient>`;
  return `<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0B1020"/><stop offset=".55" stop-color="#19123F"/><stop offset="1" stop-color="#07293A"/></linearGradient>
  <linearGradient id="ink" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#9B82FF"/><stop offset=".5" stop-color="#6FA8FF"/><stop offset="1" stop-color="#35D6EA"/></linearGradient>
  ${glow("glow1", "#7C5CFF", ".40")}${glow("glow2", "#22C8E6", ".28")}
  ${Object.entries(C).filter(([k]) => !["ink", "sub", "panel"].includes(k)).map(([k, v]) => glow(`halo-${k}`, v, ".55")).join("")}
  <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="#fff" stroke-opacity=".045"/></pattern>
  <filter id="blur" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="4"/></filter>
  <clipPath id="card"><rect width="${w}" height="${h}" rx="${rx}"/></clipPath>
</defs>
<style>
  text { font-family: ${FONT} }
  .flow { fill: none; stroke: url(#ink); stroke-width: 2; stroke-linecap: round; stroke-dasharray: 6 22; opacity: .22; animation: run 12s linear infinite }
  .flow.b { animation-duration: 17s; opacity: .14 }
  .lnk { fill: none; stroke-width: 2.4; stroke-linecap: round; stroke-dasharray: 2 14; animation: run 3.2s linear infinite }
  .lnk.slow { animation-duration: 5s }
  @keyframes run { to { stroke-dashoffset: -560 } }
  @media (prefers-reduced-motion: reduce) { .flow, .lnk { animation: none } }
</style>
<g clip-path="url(#card)">
  <rect width="${w}" height="${h}" fill="url(#bg)"/>
  <circle cx="${w * 0.1}" cy="${h * 0.95}" r="${Math.max(w, h) * 0.32}" fill="url(#glow1)"/>
  <circle cx="${w * 0.92}" cy="${h * 0.06}" r="${Math.max(w, h) * 0.32}" fill="url(#glow2)"/>
  <rect width="${w}" height="${h}" fill="url(#grid)"/>
  <path class="flow" d="M-20 ${h * 0.2}C${w * 0.2} ${h * 0.04} ${w * 0.35} ${h * 0.38} ${w * 0.56} ${h * 0.22}S${w * 0.88} ${h * 0.05} ${w + 20} ${h * 0.24}"/>
  <path class="flow b" d="M-20 ${h * 0.88}C${w * 0.19} ${h * 1.02} ${w * 0.37} ${h * 0.68} ${w * 0.56} ${h * 0.8}S${w * 0.85} ${h * 1.02} ${w + 20} ${h * 0.8}"/>
</g>
<rect x=".75" y=".75" width="${w - 1.5}" height="${h - 1.5}" rx="${rx}" fill="none" stroke="#fff" stroke-opacity=".08" stroke-width="1.5"/>`;
}

function frame(w, h, kicker, title, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${esc(title)}">
<title>${esc(title)}</title>
${backdrop(w, h)}
<text x="44" y="56" font-size="12.5" font-weight="700" letter-spacing=".16em" fill="${C.cyan}" opacity=".9">${esc(kicker.toUpperCase())}</text>
<text x="44" y="88" font-size="27" font-weight="800" fill="${C.ink}">${esc(title)}</text>
${body}
</svg>
`;
}

/** Nodo: ícono dentro de un círculo de vidrio con halo de color, título y una línea de apoyo. `at` = momento (0–1) en que brilla. */
function node(cx, cy, { icon, title, caption, color = C.blue, r = 38, at = null, T = 8, dashed = false, small = false }) {
  const s = (r * 0.9) / 24, haloKey = Object.keys(C).find(k => C[k] === color) || "blue";
  const glowAnim = at == null ? ""
    : `<animate attributeName="opacity" values=".3;.3;1;.3;.3" keyTimes="0;${Math.max(0.001, at - 0.04).toFixed(3)};${at.toFixed(3)};${Math.min(0.999, at + 0.14).toFixed(3)};1" dur="${T}s" repeatCount="indefinite"/>`;
  return `<g>
  <circle cx="${cx}" cy="${cy}" r="${r * 2}" fill="url(#halo-${haloKey})" opacity="${at == null ? ".5" : ".3"}">${glowAnim}</circle>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="${C.panel}" stroke="${color}" stroke-opacity=".75" stroke-width="1.8"${dashed ? ' stroke-dasharray="5 5"' : ""}/>
  <circle cx="${cx}" cy="${cy}" r="${r - 6}" fill="none" stroke="#fff" stroke-opacity=".06"/>
  <g transform="translate(${(cx - 12 * s).toFixed(1)} ${(cy - 12 * s).toFixed(1)}) scale(${s.toFixed(3)})" fill="none" stroke="${color}" stroke-width="${(1.6 / s).toFixed(2)}" stroke-linecap="round" stroke-linejoin="round">${ICON[icon]}</g>
  ${title ? `<text x="${cx}" y="${cy + r + 30}" text-anchor="middle" font-size="${small ? 14.5 : 16.5}" font-weight="700" fill="${C.ink}">${esc(title)}</text>` : ""}
  ${caption ? `<text x="${cx}" y="${cy + r + (small ? 49 : 52)}" text-anchor="middle" font-size="${small ? 12 : 13}" fill="${C.sub}">${esc(caption)}</text>` : ""}
</g>`;
}

/** Conexión: trazo base tenue + trazo punteado que fluye en la dirección del camino. */
const link = (d, color, { dashed = false, slow = false, op = 0.9 } = {}) =>
  `<path d="${d}" fill="none" stroke="${color}" stroke-opacity=".2" stroke-width="2"${dashed ? ' stroke-dasharray="5 7"' : ""}/>
  <path class="lnk${slow ? " slow" : ""}" d="${d}" stroke="${color}" stroke-opacity="${op}"/>`;

/** Pulso de luz que recorre un camino. */
const pulse = (d, color, dur, begin = 0, r = 4.5) =>
  `<g opacity="0"><animate attributeName="opacity" values="0;1;1;0" keyTimes="0;.08;.88;1" dur="${dur}s" begin="${begin}s" repeatCount="indefinite"/>
  <circle r="${r * 2.4}" fill="${color}" opacity=".45" filter="url(#blur)"><animateMotion dur="${dur}s" begin="${begin}s" repeatCount="indefinite" path="${d}"/></circle>
  <circle r="${r}" fill="#fff"><animateMotion dur="${dur}s" begin="${begin}s" repeatCount="indefinite" path="${d}"/></circle></g>`;

/** Cápsula de texto (etiqueta sobre una conexión o nota). */
function tag(x, y, text, color = C.sub, { icon = null } = {}) {
  const w = text.length * 6.9 + (icon ? 40 : 26);
  return `<g><rect x="${(x - w / 2).toFixed(1)}" y="${y - 14}" width="${w.toFixed(1)}" height="28" rx="14" fill="${C.panel}" fill-opacity=".92" stroke="${color}" stroke-opacity=".45"/>
  ${icon ? `<g transform="translate(${(x - w / 2 + 11).toFixed(1)} ${y - 7}) scale(.58)" fill="none" stroke="${color}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${ICON[icon]}</g>` : ""}
  <text x="${(x + (icon ? 9 : 0)).toFixed(1)}" y="${y + 4.5}" text-anchor="middle" font-size="12.5" font-weight="600" fill="${color}">${esc(text)}</text></g>`;
}

/* =====================================================================
   0. Portada
   ===================================================================== */
function hero() {
  const W = 1280, H = 380, cols = 12, rows = 5, chh = 30, gy = 10, x0 = 690, y0 = 92, T = 9;
  const step = (W - x0 - 70) / cols;
  let cells = "";
  for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) {
    const x = x0 + c * step, y = y0 + r * (chh + gy);
    const at = ((c * rows + r) / (cols * rows)) * 0.7;
    const cur = c === 6 || c === 7;
    const on = cur ? C.blue : C.green, onSoft = cur ? "rgba(111,168,255,.32)" : "rgba(61,220,151,.30)", off = "rgba(255,255,255,.05)", offS = "rgba(255,255,255,.12)";
    const kt = `0;${at.toFixed(3)};${(at + 0.03).toFixed(3)};0.93;1`;
    cells += `<rect x="${x.toFixed(1)}" y="${y}" width="${(step - 8).toFixed(1)}" height="${chh}" rx="8" fill="${off}" stroke="${offS}" stroke-width="1.2">
      <animate attributeName="fill" values="${off};${off};${onSoft};${onSoft};${off}" keyTimes="${kt}" dur="${T}s" repeatCount="indefinite"/>
      <animate attributeName="stroke" values="${offS};${offS};${on};${on};${offS}" keyTimes="${kt}" dur="${T}s" repeatCount="indefinite"/></rect>`;
  }
  const ly = y0 + rows * (chh + gy) + 14;
  const legend = [["Aprobada", C.green, "rgba(61,220,151,.30)"], ["En curso", C.blue, "rgba(111,168,255,.32)"], ["Pendiente", "rgba(255,255,255,.25)", "rgba(255,255,255,.05)"]]
    .map(([t, s, f], i) => `<rect x="${x0 + i * 120}" y="${ly}" width="13" height="13" rx="4" fill="${f}" stroke="${s}"/><text x="${x0 + i * 120 + 20}" y="${ly + 11}">${t}</text>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Malla UTESA">
<title>Malla UTESA</title>
${backdrop(W, H, 28)}
<rect x="${x0 - 26}" y="${y0 - 26}" width="${W - 44 - (x0 - 26)}" height="${rows * (chh + gy) + 74}" rx="20" fill="${C.panel}" fill-opacity=".7" stroke="#fff" stroke-opacity=".08"/>
${cells}
<g font-size="12.5" fill="${C.sub}">${legend}</g>
<text x="90" y="150" font-size="62" font-weight="800" fill="url(#ink)">Malla UTESA</text>
<text x="92" y="200" font-size="25" font-weight="700" fill="${C.ink}">Tu malla curricular, con tu progreso real</text>
<text x="92" y="236" font-size="17" fill="${C.sub}">Aprobadas · en curso · disponibles · bloqueadas</text>
<rect x="92" y="268" width="420" height="8" rx="4" fill="rgba(255,255,255,.08)"/>
<rect x="92" y="268" width="0" height="8" rx="4" fill="url(#ink)"><animate attributeName="width" values="0;420;420;0" keyTimes="0;0.72;0.93;1" dur="${T}s" repeatCount="indefinite"/></rect>
<text x="92" y="314" font-size="14" fill="${C.sub}" opacity=".85">18 carreras  ·  pénsum 2023  ·  proyecto estudiantil independiente</text>
</svg>
`;
}

/* =====================================================================
   1. Arquitectura
   ===================================================================== */
function architecture() {
  const W = 1280, H = 600, y = 330;
  const P = { est: [150, y], app: [440, y], api: [720, y], db: [1000, y], auth: [720, 168], live: [440, 168], portal: [1130, 500] };
  const path = {
    estApp: `M${P.est[0] + 40} ${y} L${P.app[0] - 40} ${y}`,
    appApi: `M${P.app[0] + 40} ${y} L${P.api[0] - 40} ${y}`,
    apiDb: `M${P.api[0] + 40} ${y} L${P.db[0] - 40} ${y}`,
    estAuth: `M${P.est[0]} ${y - 40} C ${P.est[0]} 190, 520 96, ${P.auth[0] - 34} ${P.auth[1]}`,
    apiAuth: `M${P.api[0]} ${y - 40} L${P.auth[0]} ${P.auth[1] + 34}`,
    appLive: `M${P.app[0]} ${y - 40} L${P.live[0]} ${P.live[1] + 34}`,
    apiPortal: `M${P.api[0] + 28} ${y + 28} C 820 470, 960 500, ${P.portal[0] - 36} ${P.portal[1]}`,
    estPortal: `M${P.est[0]} ${y + 40} C 200 570, 900 585, ${P.portal[0] - 26} ${P.portal[1] + 26}`,
  };
  const body = `
  <rect x="345" y="248" width="745" height="190" rx="34" fill="#F38020" fill-opacity=".05" stroke="#F38020" stroke-opacity=".28" stroke-dasharray="4 8"/>
  ${tag(1000, 438, "Cloudflare · gratis", "#F6A55A")}
  ${link(path.estApp, C.cyan)}${link(path.appApi, C.blue)}${link(path.apiDb, C.green)}
  ${link(path.estAuth, C.violet, { slow: true })}${link(path.apiAuth, C.violet, { dashed: true, slow: true, op: 0.6 })}${link(path.appLive, C.violet, { dashed: true, slow: true, op: 0.6 })}
  ${link(path.apiPortal, C.red)}${link(path.estPortal, C.red, { dashed: true, slow: true, op: 0.6 })}
  ${pulse(path.estApp, C.cyan, 2.4, 0)}${pulse(path.appApi, C.blue, 2.4, 0.8)}${pulse(path.apiDb, C.green, 2.4, 1.6)}${pulse(path.apiPortal, C.red, 3.2, 2.2)}${pulse(path.estAuth, C.violet, 3.6, 0.4)}
  ${node(...P.est, { icon: "user", title: "Estudiante", caption: "navegador o teléfono", color: C.cyan })}
  ${node(...P.app, { icon: "browser", title: "App", caption: "Pages · sitio estático", color: C.blue })}
  ${node(...P.api, { icon: "server", title: "API", caption: "Worker · reglas y permisos", color: C.blue })}
  ${node(...P.db, { icon: "db", title: "Datos", caption: "D1 · SQLite", color: C.green })}
  ${node(...P.auth, { icon: "key", title: "Identidad", caption: "Firebase Auth", color: C.violet, small: true, r: 32 })}
  ${node(...P.live, { icon: "bolt", title: "Avisos en vivo", caption: "solo «hay algo nuevo»", color: C.violet, small: true, r: 32 })}
  ${node(...P.portal, { icon: "building", title: "Portal UTESA", caption: "solo lectura", color: C.red, dashed: true, small: true, r: 34 })}
  ${tag(560, 560, "marcador: corre en tu navegador", C.red)}`;
  return frame(W, H, "Arquitectura", "Una app estática, una API y una base de datos", body);
}

/* =====================================================================
   2. Vinculación con UTESA
   ===================================================================== */
function syncFlow() {
  const W = 1280, H = 540, T = 10, y = 310;
  const xs = [150, 395, 640, 885, 1130];
  const steps = [
    ["key", "Inicias sesión", "matrícula o marcador", C.violet],
    ["list", "Pendientes", "lo que te falta", C.gold],
    ["play", "Inscritas", "lo que cursas ahora", C.blue],
    ["chart", "Tu avance", "pénsum − pendientes", C.cyan],
    ["check", "Confirmas", "revisas y guardas", C.green],
  ];
  const track = `M${xs[0]} ${y} C ${xs[0] + 120} ${y - 60}, ${xs[1] - 120} ${y - 60}, ${xs[1]} ${y} S ${xs[2] - 120} ${y + 60}, ${xs[2]} ${y} S ${xs[3] - 120} ${y - 60}, ${xs[3]} ${y} S ${xs[4] - 120} ${y + 60}, ${xs[4]} ${y}`;
  const hits = [0.05, 0.25, 0.45, 0.65, 0.85];
  let s = link(track, C.blue, { slow: true });
  // el portal (solo lectura) alimenta los pasos 2 y 3
  s += link(`M612 168 C 520 175, 420 200, ${xs[1]} ${y - 40}`, C.red, { dashed: true, slow: true, op: 0.5 }) + link(`M640 192 L640 ${y - 40}`, C.red, { dashed: true, slow: true, op: 0.5 });
  s += `<g opacity="0"><animate attributeName="opacity" values="0;1;1;0" keyTimes="0;.04;.9;1" dur="${T}s" repeatCount="indefinite"/>
    <circle r="12" fill="${C.cyan}" opacity=".5" filter="url(#blur)"><animateMotion dur="${T}s" repeatCount="indefinite" keyPoints="0;0;1;1" keyTimes="0;.05;.85;1" calcMode="linear" path="${track}"/></circle>
    <circle r="5.5" fill="#fff"><animateMotion dur="${T}s" repeatCount="indefinite" keyPoints="0;0;1;1" keyTimes="0;.05;.85;1" calcMode="linear" path="${track}"/></circle></g>`;
  steps.forEach(([icon, title, caption, color], i) => {
    s += node(xs[i], y, { icon, title, caption, color, at: hits[i], T });
    s += `<circle cx="${xs[i] + 30}" cy="${y - 30}" r="10" fill="${C.panel}" stroke="${color}" stroke-opacity=".7"/><text x="${xs[i] + 30}" y="${y - 26}" text-anchor="middle" font-size="11" font-weight="800" fill="${color}">${i + 1}</text>`;
  });
  s += node(640, 168, { icon: "building", color: C.red, r: 24, dashed: true });
  s += `<text x="678" y="164" font-size="14.5" font-weight="700" fill="${C.ink}">Portal UTESA</text><text x="678" y="183" font-size="12" fill="${C.sub}">solo lectura · sin notas</text>`;
  s += tag(470, 478, "la contraseña solo vive en memoria", C.gold, { icon: "lock" });
  s += tag(810, 478, "el marcador no envía contraseñas", C.cyan, { icon: "shield" });
  return frame(W, H, "Vinculación con UTESA", "De tu portal a tu malla en un clic", s);
}

/* =====================================================================
   3. Estados de una materia
   ===================================================================== */
function subjectStates() {
  const W = 1280, H = 400, T = 8, y = 230;
  const st = [[190, "lock", "Bloqueada", "faltan requisitos", C.gray], [490, "unlock", "Disponible", "la puedes inscribir", C.gold], [790, "play", "En curso", "este cuatrimestre", C.blue], [1090, "check", "Aprobada", "suma a tu avance", C.green]];
  const hits = [0.04, 0.3, 0.56, 0.82];
  let s = `<defs><linearGradient id="trk" gradientUnits="userSpaceOnUse" x1="190" y1="0" x2="1090" y2="0"><stop offset="0" stop-color="${C.gray}"/><stop offset=".35" stop-color="${C.gold}"/><stop offset=".65" stop-color="${C.blue}"/><stop offset="1" stop-color="${C.green}"/></linearGradient></defs>`;
  s += `<path d="M190 ${y} L1090 ${y}" stroke="url(#trk)" stroke-width="3" stroke-opacity=".3"/><path class="lnk slow" d="M190 ${y} L1090 ${y}" stroke="url(#trk)"/>`;
  s += tag(340, y - 66, "requisitos listos", C.gold) + tag(640, y - 66, "la inscribes", C.blue) + tag(940, y - 66, "la apruebas", C.green);
  st.forEach(([x, icon, title, caption, color], i) => { s += node(x, y, { icon, title, caption, color, r: 44, at: hits[i], T, dashed: i === 0 }); });
  s += `<g opacity="0"><animate attributeName="opacity" values="0;1;1;0" keyTimes="0;.03;.9;1" dur="${T}s" repeatCount="indefinite"/>
    <circle r="13" fill="#fff" opacity=".35" filter="url(#blur)"><animateMotion dur="${T}s" repeatCount="indefinite" keyPoints="0;0;1;1" keyTimes="0;.04;.82;1" calcMode="linear" path="M190 ${y} L1090 ${y}"/></circle>
    <circle r="6" fill="#fff"><animateMotion dur="${T}s" repeatCount="indefinite" keyPoints="0;0;1;1" keyTimes="0;.04;.82;1" calcMode="linear" path="M190 ${y} L1090 ${y}"/></circle></g>`;
  return frame(W, H, "Estados", "El camino de cada materia", s);
}

/* =====================================================================
   4. Datos: el perfil en el centro y todo lo que se relaciona con él
   ===================================================================== */
function dataModel() {
  const W = 1280, H = 640, cx = 640, cy = 360, rx = 410, ry = 185;
  const sats = [
    // ángulos repartidos por la órbita; abajo al centro queda libre para la nota
    ["chat", "Mensajes", "salas, privados y grupos", C.blue, -165],
    ["flag", "Reportes", "con copia del texto", C.gold, -125],
    ["archive", "Eliminadas", "copia para reactivar", C.red, -90],
    ["users", "Amistades", "solicitudes y amigos", C.violet, -55],
    ["group", "Grupos", "con sus propios admins", C.violet, -15],
    ["clock", "Suspensiones", "hasta una fecha", C.red, 35],
    ["list", "Registro", "acciones del equipo", C.gold, 145],
  ];
  let s = `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" stroke="#fff" stroke-opacity=".06" stroke-dasharray="3 9"/>`;
  sats.forEach(([icon, title, caption, color, deg], i) => {
    const a = (deg * Math.PI) / 180, x = +(cx + rx * Math.cos(a)).toFixed(1), y = +(cy + ry * Math.sin(a)).toFixed(1);
    s += link(`M${cx} ${cy} L${x} ${y}`, color, { slow: true, op: 0.6 }) + pulse(`M${x} ${y} L${cx} ${cy}`, color, 3.6, i * 0.5, 3.5);
    s += node(x, y, { icon, title, caption, color, r: 30, small: true });
  });
  s += node(cx, cy, { icon: "id", title: "Tu perfil", caption: "avance · en curso · personaje · rol", color: C.green, r: 54 });
  s += tag(cx, 600, "entre usuarios solo viaja un id público: nunca tu correo", C.cyan, { icon: "shield" });
  return frame(W, H, "Datos", "Todo gira alrededor de tu perfil", s);
}

/* =====================================================================
   5. Moderación
   ===================================================================== */
function moderation() {
  const W = 1280, H = 600, y = 320;
  const outs = [["eyeoff", "Ocultar", "el texto queda como evidencia", C.blue, 170], ["clock", "Suspender", "10 min a 30 días · con motivo", C.gold, 270], ["refresh", "Reiniciar", "vuelve a configurar su perfil", C.violet, 370], ["trash", "Eliminar", "solo el dueño · reactivable", C.red, 470]];
  const rep = [150, y], rev = [420, y], logp = [1150, y], ox = 760;
  let s = link(`M${rep[0] + 40} ${y} L${rev[0] - 46} ${y}`, C.gold) + pulse(`M${rep[0] + 40} ${y} L${rev[0] - 46} ${y}`, C.gold, 2, 0);
  outs.forEach(([icon, title, caption, color, oy], i) => {
    const a = `M${rev[0] + 46} ${y} C 560 ${y}, 620 ${oy}, ${ox - 32} ${oy}`, b = `M${ox + 230} ${oy} C 1020 ${oy}, 1060 ${y}, ${logp[0] - 40} ${y}`;
    s += link(a, color) + link(b, color, { slow: true, op: 0.5 }) + pulse(a, color, 2.6, 0.6 + i * 0.45, 4);
    s += node(ox, oy, { icon, color, r: 30 });
    s += `<text x="${ox + 46}" y="${oy - 3}" font-size="15.5" font-weight="700" fill="${C.ink}">${title}</text><text x="${ox + 46}" y="${oy + 16}" font-size="12.5" fill="${C.sub}">${esc(caption)}</text>`;
  });
  s += link(`M${ox} ${470 + 32} C 700 575, 300 575, ${rep[0]} ${y + 42}`, C.green, { dashed: true, slow: true, op: 0.5 });
  s += tag(430, 556, "el dueño puede reactivarla", C.green, { icon: "refresh" });
  s += node(...rep, { icon: "flag", title: "Reporte", caption: "motivo + detalle", color: C.gold });
  s += node(...rev, { icon: "shield", title: "El equipo revisa", caption: "Configuración → Moderación", color: C.cyan, r: 44 });
  s += node(...logp, { icon: "list", title: "Registro", caption: "quién · qué · cuándo", color: C.gold });
  return frame(W, H, "Moderación", "Del reporte a la decisión, todo queda anotado", s);
}

const files = { "hero.svg": hero(), "arquitectura.svg": architecture(), "vinculacion.svg": syncFlow(), "estados-materia.svg": subjectStates(), "modelo-datos.svg": dataModel(), "moderacion.svg": moderation() };
for (const [name, svg] of Object.entries(files)) {
  writeFileSync(join(OUT, name), svg);
  console.log(`docs/img/${name}  ${(svg.length / 1024).toFixed(1)} KB`);
}
