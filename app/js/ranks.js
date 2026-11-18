// ranks.js — rangos de los perfiles según el % de la carrera aprobado.
//
// El porcentaje lo calcula el servidor con lo que UTESA verificó en la vinculación directa (no se puede inventar).
// Sin verificar no hay porcentaje: se muestra "Sin verificar" y la invitación a vincular.

import { GLYPHS } from "./achievements.js";

export const RANKS = [
  { min: 0, id: "novato", name: "Novato", glyph: "leaf", color: "#6FB07A", blurb: "Recién empieza el camino" },
  { min: 10, id: "aprendiz", name: "Aprendiz", glyph: "book", color: "#4F9FEF", blurb: "Ya le agarró el ritmo" },
  { min: 25, id: "explorador", name: "Explorador", glyph: "compass", color: "#2FB5B0", blurb: "Un cuarto de la carrera, en marcha" },
  { min: 40, id: "avanzado", name: "Avanzado", glyph: "bolt", color: "#8F78E8", blurb: "Ya pasó lo más difícil del inicio" },
  { min: 60, id: "veterano", name: "Veterano", glyph: "shield", color: "#E0A61B", blurb: "Más de la mitad, con experiencia" },
  { min: 75, id: "experto", name: "Experto", glyph: "star", color: "#F27BB0", blurb: "Ya se le ve la meta" },
  { min: 90, id: "leyenda", name: "Leyenda", glyph: "flame", color: "#FF6B3D", blurb: "Casi graduado" },
  { min: 100, id: "graduado", name: "Graduado", glyph: "cap", color: "#6FA8FF", blurb: "¡Carrera completa!" },
];
export const UNVERIFIED = { id: "sin-verificar", name: "Sin verificar", glyph: "shield", color: "#8A968A", blurb: "Vincula con UTESA para tener rango" };

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const icon = (g, size) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${GLYPHS[g] || GLYPHS.star}</svg>`;

/** Rango para un porcentaje (null = cuenta sin verificar). */
export function rankFor(pct) {
  if (pct == null) return UNVERIFIED;
  let r = RANKS[0];
  for (const x of RANKS) if (pct >= x.min) r = x;
  return r;
}
/** Siguiente rango y cuánto falta (null si ya es el último o no hay porcentaje). */
export function nextRank(pct) {
  if (pct == null) return null;
  const n = RANKS.find(x => x.min > pct);
  return n ? { rank: n, left: n.min - pct } : null;
}

/** Etiqueta pequeña (chat). */
export function rankChipHtml(pct) {
  const r = rankFor(pct);
  const tip = pct == null ? r.blurb : `${r.name} · ${pct}% de su carrera`;
  return `<span class="rank-chip${pct == null ? " is-none" : ""}" style="--rk:${r.color}" title="${esc(tip)}">${icon(r.glyph, 11)}<span>${esc(r.name)}</span></span>`;
}

/** Bloque grande con barra de progreso (perfil y configuración). */
export function rankCardHtml(pct, { own = false } = {}) {
  const r = pct == null && !own ? { ...UNVERIFIED, blurb: "Aún no ha vinculado su cuenta con UTESA" } : rankFor(pct); // a otros se les habla en tercera persona
  const nx = nextRank(pct);
  const detail = pct == null
    ? (own ? "Vincula tu cuenta de UTESA para ganar tu rango." : "")
    : nx ? `${own ? "Te faltan" : "Le faltan"} ${nx.left}% para ser <b>${esc(nx.rank.name)}</b>` : "¡Rango máximo!";
  return `<div class="rank-card" style="--rk:${r.color}">
    <span class="rank-badge">${icon(r.glyph, 22)}</span>
    <div class="rank-info">
      <strong>${esc(r.name)}${pct == null ? "" : ` <em>${pct}%</em>`}</strong>
      <small>${esc(r.blurb)}</small>
      ${pct == null ? "" : `<div class="rank-bar" role="img" aria-label="${pct}% de la carrera"><i style="width:${pct}%"></i></div>`}
      ${detail ? `<small class="rank-next">${detail}</small>` : ""}
    </div>
  </div>`;
}
