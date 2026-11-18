// medal.js — la "esquinota" de logro que se ve en cada materia (mapa y tarjetas) para motivar.
//
// Si la materia tiene un logro, aparece una pestaña en la esquina superior izquierda:
//  · de color (con el nivel: bronce, plata, oro o diamante) si ya lo ganaste con la vinculación directa;
//  · gris si todavía lo puedes ganar. Al pasar el cursor o mantener el dedo dice cuál es y cómo se gana.

import { ACH_BY_ID, TIERS, GLYPHS } from "./achievements.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));

/** HTML de la medalla de una materia ("" si esa materia no tiene logro). */
export function medalHtml(code, earnedSet, linked = false) {
  const a = ACH_BY_ID[code];
  if (!a) return "";
  const t = TIERS[a.tier];
  const got = earnedSet.has(code);
  const title = got
    ? `🏅 Logro desbloqueado: ${a.name} (${t.name})`
    : `🔒 Logro por ganar: ${a.name} (${t.name}). ${linked ? "Apruébala y vuelve a vincular con UTESA para ganarlo." : "Apruébala y vincula con tu matrícula en UTESA para ganarlo."}`;
  return `<span class="medal-tab ${got ? "is-earned" : "is-locked"} t${a.tier}" style="--m1:${t.c1};--m2:${t.c2};--m3:${t.c3}" title="${esc(title)}" role="img" aria-label="${esc(title)}"><svg viewBox="0 0 24 24" aria-hidden="true">${GLYPHS[a.glyph] || GLYPHS.star}</svg></span>`;
}

/** Línea de detalle para la hoja de la materia. */
export function medalDetailHtml(code, earnedSet) {
  const a = ACH_BY_ID[code];
  if (!a) return "";
  const t = TIERS[a.tier];
  const got = earnedSet.has(code);
  return `<div class="detail-sec"><div class="detail-title">Logro</div>
    <div class="detail-medal ${got ? "is-earned" : ""}">
      <span class="medal-chip t${a.tier}" style="--m1:${t.c1};--m2:${t.c2};--m3:${t.c3}"><svg viewBox="0 0 24 24" aria-hidden="true">${GLYPHS[a.glyph] || GLYPHS.star}</svg></span>
      <div><strong>${esc(a.name)}</strong> <em>${t.name}</em><span>${esc(a.flavor)}</span><small>${got ? "¡Ya lo ganaste! Lo puedes equipar como marco en Configuración." : "Se desbloquea al aprobar esta materia y vincular con tu matrícula."}</small></div>
    </div></div>`;
}
