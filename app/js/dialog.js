// dialog.js
// Ventanas de confirmación con el estilo de la app (reemplazan confirm/prompt/alert del navegador).
//
//   const ok = await askDialog({ title, text, confirm: "Eliminar", tone: "danger" });        // true | null
//   const motivo = await askDialog({ title, text, input: { label, placeholder } });         // texto ("" si lo deja vacío) | null
//   const r = await askDialog({ title, choices: ["Spam", "Acoso"], input: {...} });         // { choice, text } | null
//   await askDialog({ title, text, alertOnly: true });                                      // solo informa
//
// Usa el sistema de ventanas de modal.js: Esc, clic en el fondo y «Cancelar» devuelven null; el foco queda atrapado
// dentro y vuelve a quien abrió la ventana. Siempre aparece encima de todo (también del chat y de Configuración).

import { openModal, closeModal } from "./modal.js";

const ID = "app-dialog";
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
const ICONS = {
  danger: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/>',
  report: '<path d="M4 22V4M4 4h13l-2 4 2 4H4"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v5h1"/>',
  leave: '<path d="M15 4h4v16h-4M10 17l-5-5 5-5M5 12h11"/>',
  ok: '<path d="M20 6 9 17l-5-5"/>',
};

let pending = null; // { resolve } de la ventana abierta

function ensure() {
  let ov = document.getElementById(ID);
  if (ov) return ov;
  ov = document.createElement("div");
  ov.id = ID;
  ov.className = "modal-overlay hidden dlg-overlay";
  ov.innerHTML = `<div class="card modal-box dlg-box" role="alertdialog" aria-modal="true" aria-labelledby="dlg-title" aria-describedby="dlg-text"></div>`;
  document.body.appendChild(ov);
  // cerrar con Esc, el fondo o [data-modal-close] = cancelar
  ov.addEventListener("modal:closed", () => { if (pending) { const p = pending; pending = null; p.resolve(null); } });
  return ov;
}

/**
 * @param {object} o
 * @param {string} o.title
 * @param {string} [o.text]          párrafos separados por una línea en blanco
 * @param {string} [o.icon]          danger | report | info | leave | ok
 * @param {"danger"|"default"} [o.tone]
 * @param {string} [o.confirm]       texto del botón principal
 * @param {string} [o.cancel]
 * @param {boolean} [o.alertOnly]    un solo botón (aviso)
 * @param {string[]} [o.choices]     opciones rápidas (chips); se devuelve { choice, text }
 * @param {{label?:string, placeholder?:string, maxlength?:number, rows?:number}} [o.input]
 * @returns {Promise<any>}
 */
export function askDialog(o = {}) {
  const ov = ensure();
  if (pending) { const p = pending; pending = null; p.resolve(null); } // una a la vez
  const tone = o.tone === "danger" ? "danger" : "default";
  const icon = ICONS[o.icon || (tone === "danger" ? "danger" : o.alertOnly ? "info" : "info")] || ICONS.info;
  const paras = String(o.text || "").split(/\n\s*\n/).filter(Boolean).map(p => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("");
  const max = o.input?.maxlength || 120;
  const box = ov.querySelector(".dlg-box");
  box.innerHTML = `
    <div class="dlg-head">
      <span class="dlg-icon dlg-${tone}" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${icon}</svg></span>
      <h3 id="dlg-title">${esc(o.title || "")}</h3>
    </div>
    <div id="dlg-text" class="dlg-text">${paras}</div>
    ${o.choices ? `<div class="dlg-choices" role="radiogroup" aria-label="Motivo">${o.choices.map((c, i) => `<button type="button" class="dlg-chip" role="radio" aria-checked="false" data-choice="${i}">${esc(c)}</button>`).join("")}</div>` : ""}
    ${o.input ? `<label class="dlg-field">${o.input.label ? `<span>${esc(o.input.label)}</span>` : ""}
      <textarea class="input dlg-input" rows="${o.input.rows || 2}" maxlength="${max}" placeholder="${esc(o.input.placeholder || "")}"></textarea>
      <small class="dlg-count" aria-live="polite">0/${max}</small></label>` : ""}
    <div class="dlg-actions">
      ${o.alertOnly ? "" : `<button type="button" class="btn btn-ghost" data-dlg="cancel">${esc(o.cancel || "Cancelar")}</button>`}
      <button type="button" class="btn ${tone === "danger" ? "btn-danger" : "btn-primary"}" data-dlg="ok"${o.choices && o.requireChoice ? " disabled" : ""}>${esc(o.confirm || (o.alertOnly ? "Entendido" : "Aceptar"))}</button>
    </div>`;

  let choice = null;
  const ta = box.querySelector(".dlg-input");
  const okBtn = box.querySelector('[data-dlg="ok"]');
  if (ta) {
    ta.addEventListener("input", () => { box.querySelector(".dlg-count").textContent = `${ta.value.length}/${max}`; });
    ta.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); okBtn.click(); } });
  }
  box.onclick = (e) => {
    const chip = e.target.closest("[data-choice]");
    if (chip) {
      choice = o.choices[Number(chip.dataset.choice)];
      box.querySelectorAll("[data-choice]").forEach(c => c.setAttribute("aria-checked", String(c === chip)));
      okBtn.disabled = false;
      ta?.focus();
      return;
    }
    const b = e.target.closest("[data-dlg]");
    if (!b) return;
    const p = pending; pending = null;
    let value = null;
    if (b.dataset.dlg === "ok") value = o.choices ? { choice, text: ta ? ta.value.trim() : "" } : o.input ? (ta.value.trim()) : true;
    closeModal(ID);
    p?.resolve(value);
  };

  return new Promise((resolve) => {
    pending = { resolve };
    openModal(ID);
    setTimeout(() => (ta && !o.choices ? ta : okBtn.disabled ? box.querySelector("[data-choice]") : (tone === "danger" ? box.querySelector('[data-dlg="cancel"]') || okBtn : okBtn))?.focus({ preventScroll: true }), 60);
  });
}
