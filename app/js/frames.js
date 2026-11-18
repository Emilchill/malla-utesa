// frames.js — dibuja el avatar con su marco de logro (si lo tiene equipado).
//
// Cada logro tiene un marco ÚNICO: combina el nivel (bronce, plata, oro, diamante), un patrón de aro
// (cuentas, cuerda, engranaje, laurel, rayos, festón, doble aro, liso), un color de acento propio y su símbolo.
// Todos brillan: un destello recorre el aro; oro y diamante además laten con un halo y tienen destellos.
// Las animaciones viven en css/style.css (.fr-*) y se desactivan con prefers-reduced-motion.

import { avatarSvg } from "./avatars.js";
import { ACH_BY_ID, GLYPHS, TIERS } from "./achievements.js";

let uid = 0;

const PATTERNS = ["liso", "cuentas", "cuerda", "engranaje", "laurel", "rayos", "festón", "doble"];

/** Color de acento propio de cada logro (reparte los tonos con el "ángulo áureo": nunca se repiten seguidos). */
function accentOf(idx) {
  const h = Math.round((idx * 137.508) % 360);
  return `hsl(${h} 82% 52%)`;
}

function glyphAt(glyph, x, y, size, color, sw = 2.1) {
  const s = size / 24;
  return `<g transform="translate(${x - size / 2} ${y - size / 2}) scale(${s})" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${GLYPHS[glyph] || GLYPHS.star}</g>`;
}

/** Medallón redondo con símbolo, centrado en (x, y). */
function medal(g, glyph, x, y, r, t, accent) {
  return `<circle cx="${x}" cy="${y}" r="${r + 1.4}" fill="${t.c3}" opacity=".92"/>
    <circle cx="${x}" cy="${y}" r="${r}" fill="url(#${g}m)" stroke="${accent}" stroke-width="1.15"/>
    ${glyphAt(glyph, x, y, r * 1.35, t.c3, 2.3)}`;
}

function sparkle(x, y, r, color, i) {
  return `<path class="fr-twinkle" style="animation-delay:${(-i * 0.55).toFixed(2)}s" d="M${x} ${y - r} L${x + r * 0.28} ${y - r * 0.28} L${x + r} ${y} L${x + r * 0.28} ${y + r * 0.28} L${x} ${y + r} L${x - r * 0.28} ${y + r * 0.28} L${x - r} ${y} L${x - r * 0.28} ${y - r * 0.28}Z" fill="${color}"/>`;
}

/** Adorno del aro según el patrón del logro. */
function ringPattern(p, t, accent) {
  const pts = (n, r, f) => Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2 - Math.PI / 2; return f(50 + Math.cos(a) * r, 50 + Math.sin(a) * r, a, i); }).join("");
  switch (p) {
    case 1: return pts(28, 43.9, (x, y) => `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="1.25" fill="${t.c1}" stroke="${t.c3}" stroke-width=".35"/>`);
    case 2: return `<circle cx="50" cy="50" r="43.8" fill="none" stroke="${t.c3}" stroke-width="2.3" stroke-dasharray="3.4 2.1" opacity=".55"/><circle cx="50" cy="50" r="43.8" fill="none" stroke="${t.c1}" stroke-width="1" stroke-dasharray="2.4 3.1" stroke-dashoffset="1.6" opacity=".9"/>`;
    case 3: return pts(20, 47.2, (x, y, a) => `<rect x="${(x - 1.5).toFixed(2)}" y="${(y - 1.9).toFixed(2)}" width="3" height="3.8" rx=".6" fill="${t.c2}" stroke="${t.c3}" stroke-width=".4" transform="rotate(${(a * 180 / Math.PI + 90).toFixed(1)} ${x.toFixed(2)} ${y.toFixed(2)})"/>`);
    case 4: return pts(16, 43.6, (x, y, a, i) => i % 4 === 0 ? "" : `<ellipse cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" rx="3" ry="1.5" fill="${t.c1}" stroke="${t.c3}" stroke-width=".4" transform="rotate(${(a * 180 / Math.PI + 90 + 28).toFixed(1)} ${x.toFixed(2)} ${y.toFixed(2)})"/>`);
    case 5: return pts(24, 49, (x, y, a, i) => { const x2 = 50 + Math.cos(a) * 46.4, y2 = 50 + Math.sin(a) * 46.4; return `<path d="M${x2.toFixed(2)} ${y2.toFixed(2)} L${x.toFixed(2)} ${y.toFixed(2)}" stroke="${i % 2 ? t.c1 : accent}" stroke-width="${i % 2 ? 1.1 : 1.6}" stroke-linecap="round"/>`; });
    case 6: return pts(18, 46.4, (x, y) => `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="2.2" fill="${t.c2}" stroke="${t.c3}" stroke-width=".4"/>`);
    case 7: return `<circle cx="50" cy="50" r="39.9" fill="none" stroke="${accent}" stroke-width="1.5"/><circle cx="50" cy="50" r="48.2" fill="none" stroke="${t.c1}" stroke-width=".8" opacity=".85"/>`;
    default: return "";
  }
}

/** Capa SVG (viewBox 100) del marco. */
export function frameOverlay(frameId) {
  const a = ACH_BY_ID[frameId];
  if (!a) return "";
  const t = TIERS[a.tier] || TIERS[1];
  const g = `fr-${++uid}`;
  const accent = accentOf(a.idx);
  const pattern = PATTERNS[(a.idx * 3 + a.tier) % PATTERNS.length];
  const patIdx = PATTERNS.indexOf(pattern);
  const ringW = a.tier >= 3 ? 7 : 5.5;
  const delay = (-(a.idx * 0.43) % 3.6).toFixed(2);
  let out = `<defs>
    <linearGradient id="${g}r" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${t.c1}"/><stop offset=".5" stop-color="${t.c2}"/><stop offset="1" stop-color="${t.c3}"/></linearGradient>
    <linearGradient id="${g}m" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${t.c1}"/><stop offset="1" stop-color="${t.c2}"/></linearGradient>
    <radialGradient id="${g}h" cx=".5" cy=".5" r=".5"><stop offset=".78" stop-color="${t.c2}" stop-opacity="0"/><stop offset="1" stop-color="${accent}" stop-opacity=".6"/></radialGradient>
    <linearGradient id="${g}s" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".95"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <clipPath id="${g}c"><path clip-rule="evenodd" d="M50 1.5 a48.5 48.5 0 1 0 .01 0Z M50 ${1.5 + ringW + 1} a${48.5 - ringW - 1} ${48.5 - ringW - 1} 0 1 1 -.01 0Z"/></clipPath>
  </defs>`;
  if (a.tier === 4) out += `<circle class="fr-halo" cx="50" cy="50" r="50" fill="url(#${g}h)" style="animation-delay:${delay}s"/>`;
  // adorno detrás del aro (engranaje, rayos…)
  if ([3, 5].includes(patIdx)) out += ringPattern(pattern, t, accent);
  out += `<circle cx="50" cy="50" r="${46.5 - ringW / 2 + 1}" fill="none" stroke="url(#${g}r)" stroke-width="${ringW}"/>`;
  out += `<circle cx="50" cy="50" r="46.5" fill="none" stroke="${t.c3}" stroke-opacity=".55" stroke-width=".8"/>`;
  out += `<circle cx="50" cy="50" r="${46.5 - ringW}" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width=".7"/>`;
  if (![3, 5].includes(patIdx)) out += ringPattern(pattern, t, accent);

  if (a.tier >= 3) {
    // gemas entre medallones (con el color de acento)
    for (let i = 0; i < 12; i++) {
      if (i % 3 === 0) continue;
      const ang = (i / 12) * Math.PI * 2 - Math.PI / 2;
      const x = 50 + Math.cos(ang) * 43.5, y = 50 + Math.sin(ang) * 43.5;
      out += `<path d="M${x} ${y - 2.2} L${x + 1.9} ${y} L${x} ${y + 2.2} L${x - 1.9} ${y}Z" fill="${accent}" fill-opacity=".92" stroke="#fff" stroke-width=".55"/>`;
    }
    [[50, 4.2], [95.8, 50], [50, 95.8], [4.2, 50]].forEach(([x, y]) => { out += medal(g, a.glyph, x, y, 6.6, t, accent); });
  } else {
    out += medal(g, a.glyph, 82, 82, 11, t, accent);
  }
  if (a.tier === 4) {
    [[22, 22], [78, 22], [22, 78], [78, 78]].forEach(([x, y], i) => { out += sparkle(x, y, i % 2 ? 3.4 : 4.6, "#fff", i); });
    out += `<circle class="fr-orbit" cx="50" cy="50" r="49.2" fill="none" stroke="#fff" stroke-width="1.1" stroke-linecap="round" stroke-dasharray="3 22" opacity=".85"/>`;
  } else if (a.tier === 3) {
    [[24, 24], [76, 76]].forEach(([x, y], i) => { out += sparkle(x, y, 3.2, "#fff6c9", i + 1); });
  }
  // destello que recorre el aro
  out += `<g clip-path="url(#${g}c)"><g transform="rotate(28 50 50)"><rect class="fr-shine" style="animation-delay:${delay}s" x="-34" y="-12" width="24" height="124" fill="url(#${g}s)"/></g></g>`;
  return out;
}


/* =====================================================================
   Marcos EXCLUSIVOS del equipo de moderación (dueño y moderadores).
   No se ganan con materias: el servidor solo deja equiparlos a quien modera, y se pierden al perder el rol.
   ===================================================================== */
export const MOD_FRAMES = [
  { id: "MOD-1", name: "Arcoíris Cósmico", flavor: "Todos los colores girando sin parar", glow: "#c13bff" },
  { id: "MOD-2", name: "Amatista Real", flavor: "Gemas moradas de la corte de moderación", glow: "#a855f7" },
  { id: "MOD-3", name: "Aurora Boreal", flavor: "Luces verdes y violetas que fluyen", glow: "#2ee6c5" },
  { id: "MOD-4", name: "Guardián Nebulosa", flavor: "Estrellas y un cometa que custodia el chat", glow: "#d946ef" },
  { id: "MOD-5", name: "Llama Arcana", flavor: "Fuego violeta que nunca se apaga", glow: "#c026d3" },
];
export const MOD_BY_ID = Object.fromEntries(MOD_FRAMES.map(m => [m.id, m]));

function modOverlay(id) {
  const g = `fm-${++uid}`;
  const shine = `<defs><linearGradient id="${g}s" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".95"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <clipPath id="${g}c"><path clip-rule="evenodd" d="M50 1.5 a48.5 48.5 0 1 0 .01 0Z M50 9.5 a40.5 40.5 0 1 1 -.01 0Z"/></clipPath></defs>`;
  const sweep = `<g clip-path="url(#${g}c)"><g transform="rotate(28 50 50)"><rect class="fr-shine" x="-34" y="-12" width="24" height="124" fill="url(#${g}s)"/></g></g>`;
  const ring = (r, w, stroke, extra = "") => `<circle ${extra} cx="50" cy="50" r="${r}" fill="none" stroke="${stroke}" stroke-width="${w}"/>`;
  const edges = `${ring(48.2, 0.8, "#fff", 'stroke-opacity=".55"')}${ring(39.9, 0.7, "#fff", 'stroke-opacity=".55"')}`;
  const medalAt = (x, y, r, fill, stroke, glyph, gc) => `<circle cx="${x}" cy="${y}" r="${r + 1.3}" fill="#12061f" opacity=".9"/><circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="1.1"/>${glyphAt(glyph, x, y, r * 1.35, gc, 2.3)}`;
  const spark = (pts, color) => pts.map(([x, y], i) => sparkle(x, y, i % 2 ? 3 : 4.4, color, i)).join("");
  const pts = (n, r, f) => Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2 - Math.PI / 2; return f(50 + Math.cos(a) * r, 50 + Math.sin(a) * r, a, i); }).join("");

  switch (id) {
    case "MOD-1": // arcoíris que gira
      return `<defs><linearGradient id="${g}r" x1="0" y1="0" x2="1" y2="1">${["#ff3b3b", "#ff9f1c", "#ffe135", "#3ddc84", "#2ec4ff", "#5b6cff", "#c13bff", "#ff3b3b"].map((c, i, a) => `<stop offset="${(i / (a.length - 1)).toFixed(2)}" stop-color="${c}"/>`).join("")}</linearGradient></defs>${shine}
        ${ring(44, 8, `url(#${g}r)`, 'class="fr-spin"')}${edges}
        ${spark([[20, 22], [80, 20], [22, 80], [80, 78]], "#fff")}
        ${medalAt(50, 4.6, 6, "#fff", "#c13bff", "star", "#7a1fd1")}${medalAt(50, 95.4, 6, "#fff", "#2ec4ff", "star", "#1472a8")}
        ${sweep}`;
    case "MOD-2": // morado real con gemas
      return `<defs><linearGradient id="${g}r" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e9d5ff"/><stop offset=".4" stop-color="#8b3ff0"/><stop offset=".75" stop-color="#4c1d95"/><stop offset="1" stop-color="#c084fc"/></linearGradient>
        <radialGradient id="${g}h" cx=".5" cy=".5" r=".5"><stop offset=".76" stop-color="#a855f7" stop-opacity="0"/><stop offset="1" stop-color="#c084fc" stop-opacity=".75"/></radialGradient></defs>${shine}
        <circle class="fr-halo" cx="50" cy="50" r="50" fill="url(#${g}h)"/>
        ${ring(44, 7.5, `url(#${g}r)`)}${edges}
        ${pts(12, 43.8, (x, y, a, i) => i % 3 === 0 ? "" : `<path d="M${x.toFixed(2)} ${(y - 2.5).toFixed(2)} L${(x + 2.1).toFixed(2)} ${y.toFixed(2)} L${x.toFixed(2)} ${(y + 2.5).toFixed(2)} L${(x - 2.1).toFixed(2)} ${y.toFixed(2)}Z" fill="#f5d0fe" stroke="#fff" stroke-width=".55"/>`)}
        ${[[50, 4.4], [95.6, 50], [50, 95.6], [4.4, 50]].map(([x, y]) => medalAt(x, y, 6.6, "#ede0ff", "#7c3aed", "shield", "#4c1d95")).join("")}
        ${spark([[24, 24], [76, 76]], "#f5e1ff")}${sweep}`;
    case "MOD-3": // aurora boreal
      return `<defs><linearGradient id="${g}r" x1="0" y1="0" x2="1" y2="1">${["#00f5a0", "#00d9f5", "#7a5cff", "#d946ef", "#00f5a0"].map((c, i, a) => `<stop offset="${(i / (a.length - 1)).toFixed(2)}" stop-color="${c}"/>`).join("")}</linearGradient></defs>${shine}
        ${ring(44, 7.5, `url(#${g}r)`, 'class="fr-spin fr-spin-slow"')}
        ${ring(44, 1.6, "#fff", 'class="fr-flow" stroke-dasharray="7 11" stroke-linecap="round" stroke-opacity=".85"')}${edges}
        ${spark([[22, 24], [78, 22], [80, 78]], "#d7fff3")}
        ${medalAt(82, 82, 10, "#0b2a3a", "#2ee6c5", "wave", "#7dfbe1")}${sweep}`;
    case "MOD-4": // nebulosa con estrellas y cometa
      return `<defs><linearGradient id="${g}r" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0f0a2e"/><stop offset=".4" stop-color="#4338ca"/><stop offset=".75" stop-color="#9333ea"/><stop offset="1" stop-color="#be185d"/></linearGradient>
        <radialGradient id="${g}h" cx=".5" cy=".5" r=".5"><stop offset=".78" stop-color="#d946ef" stop-opacity="0"/><stop offset="1" stop-color="#d946ef" stop-opacity=".7"/></radialGradient></defs>${shine}
        <circle class="fr-halo" cx="50" cy="50" r="50" fill="url(#${g}h)"/>
        ${ring(44, 8, `url(#${g}r)`)}${edges}
        ${pts(20, 44, (x, y, a, i) => `<circle class="fr-twinkle" style="animation-delay:${(-i * 0.37).toFixed(2)}s" cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${i % 3 === 0 ? 1.5 : 0.9}" fill="#fff"/>`)}
        <circle class="fr-orbit" cx="50" cy="50" r="48.8" fill="none" stroke="#7df9ff" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="7 52"/>
        ${[[50, 4.4], [95.6, 50], [50, 95.6], [4.4, 50]].map(([x, y]) => medalAt(x, y, 6.4, "#1b1448", "#7df9ff", "shield", "#7df9ff")).join("")}${sweep}`;
    case "MOD-5": // llama arcana
      return `<defs><linearGradient id="${g}r" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2e1065"/><stop offset=".5" stop-color="#7c3aed"/><stop offset="1" stop-color="#c026d3"/></linearGradient>
        <linearGradient id="${g}f" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#6d28d9"/><stop offset=".55" stop-color="#d946ef"/><stop offset="1" stop-color="#fbcfe8"/></linearGradient></defs>${shine}
        ${Array.from({ length: 20 }, (_, i) => { const a = (i / 20) * 360, rad = (a * Math.PI) / 180, x = 50 + Math.sin(rad) * 45, y = 50 - Math.cos(rad) * 45; return `<g transform="translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${a.toFixed(1)})"><path class="fr-flick" style="animation-delay:${(-i * 0.19).toFixed(2)}s" d="M0 0 C-3.2 -2.6 -2.2 -5.8 0 -9.4 C2.2 -5.8 3.2 -2.6 0 0Z" fill="url(#${g}f)"/></g>`; }).join("")}
        ${ring(43, 7, `url(#${g}r)`)}${edges}
        ${medalAt(50, 5, 6.2, "#2e1065", "#f0abfc", "flame", "#f9a8ff")}${medalAt(50, 95, 6.2, "#2e1065", "#f0abfc", "flame", "#f9a8ff")}
        ${spark([[22, 24], [78, 76]], "#fde7ff")}${sweep}`;
    default: return "";
  }
}

/**
 * Avatar redondo con marco opcional.
 * @param avatar  valor guardado del avatar ("c1:{...}" o id antiguo)
 * @param bg      color de fondo guardado
 * @param frameId id del logro equipado, o null
 */
export function framedAvatar(avatar, bg, frameId, size = 64) {
  const mod = frameId && MOD_BY_ID[frameId];
  if (mod) { // marco exclusivo de moderación
    const art = avatar
      ? avatarSvg(avatar, Math.round(size * 0.84), bg || null)
      : `<svg viewBox="0 0 100 100" width="${size}" height="${size}"><rect width="100" height="100" fill="#DDE3D8"/></svg>`;
    return `<span class="fr fr-mod fr-modn${mod.id.slice(-1)} fr-glow" style="width:${size}px;height:${size}px;--glow:${mod.glow}" data-frame="${mod.id}"><span class="fr-art" style="inset:8%">${art}</span><svg class="fr-overlay" viewBox="0 0 100 100" aria-hidden="true">${modOverlay(mod.id)}</svg></span>`;
  }
  const a = frameId ? ACH_BY_ID[frameId] : null;
  const inner = a ? 0.84 : 1;
  const pad = ((1 - inner) / 2) * 100;
  const art = avatar
    ? avatarSvg(avatar, Math.round(size * inner), bg || null)
    : `<svg viewBox="0 0 100 100" width="${size}" height="${size}"><rect width="100" height="100" fill="#DDE3D8"/></svg>`;
  if (!a) return `<span class="fr" style="width:${size}px;height:${size}px"><span class="fr-art" style="inset:0">${art}</span></span>`;
  const t = TIERS[a.tier] || TIERS[1];
  const glow = a.tier >= 3 ? ` fr-glow` : "";
  return `<span class="fr fr-t${a.tier}${glow}" style="width:${size}px;height:${size}px;--glow:${t.c2};--acc:${accentOf(a.idx)}" data-frame="${a.id}"><span class="fr-art" style="inset:${pad}%">${art}</span><svg class="fr-overlay" viewBox="0 0 100 100" aria-hidden="true">${frameOverlay(a.id)}</svg></span>`;
}

/** Miniatura redonda de un marco (para listas): usa un avatar neutro. */
export function frameSwatch(frameId, size = 72, avatar = null, bg = null) {
  return framedAvatar(avatar, bg, frameId, size);
}

export { PATTERNS, accentOf };
