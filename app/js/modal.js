// modal.js
// Ayudante único para abrir y cerrar ventanas (.modal-overlay) en toda la app.
//   · openModal(id) / closeModal(id) / isOpen(id)
//   · Se cierran con Esc, con el fondo oscuro o con cualquier botón [data-modal-close]
//     (añade data-modal-static al overlay para que el fondo NO la cierre).
//   · Enfoque accesible: al abrir se enfoca la ventana, Tab no se escapa de ella y,
//     al cerrar, el foco vuelve a quien la abrió. El fondo de la página no se desplaza.
//   · Cada ventana emite los eventos "modal:opened" y "modal:closed".

const openStack = [];

function focusables(root) {
  return [...root.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), video[controls], [tabindex]:not([tabindex="-1"])')]
    .filter(el => el.offsetParent !== null);
}

export function isOpen(id) {
  return openStack.includes(id);
}

export function openModal(id) {
  const ov = document.getElementById(id);
  if (!ov) return false;
  if (!openStack.includes(id)) openStack.push(id);
  ov.__opener = document.activeElement;
  ov.classList.remove("hidden");
  ov.style.display = "flex";
  document.body.classList.add("modal-open");
  const box = ov.querySelector(".modal-box");
  if (box) {
    box.setAttribute("tabindex", "-1");
    setTimeout(() => {
      const first = box.querySelector("[data-autofocus]") || box;
      try { first.focus({ preventScroll: true }); } catch {}
    }, 30);
  }
  ov.dispatchEvent(new CustomEvent("modal:opened"));
  return true;
}

export function closeModal(id) {
  const ov = document.getElementById(id);
  if (!ov) return;
  const wasOpen = openStack.includes(id);
  ov.classList.add("hidden");
  ov.style.display = "none";
  const i = openStack.indexOf(id);
  if (i >= 0) openStack.splice(i, 1);
  if (!openStack.length) document.body.classList.remove("modal-open");
  if (wasOpen) ov.dispatchEvent(new CustomEvent("modal:closed"));
  const opener = ov.__opener;
  if (opener && document.contains(opener) && typeof opener.focus === "function") {
    try { opener.focus({ preventScroll: true }); } catch {}
  }
}

let started = false;
export function initModals() {
  if (started) return;
  started = true;

  document.addEventListener("click", (e) => {
    const closeBtn = e.target.closest("[data-modal-close]");
    if (closeBtn) {
      const ov = closeBtn.closest(".modal-overlay");
      if (ov) closeModal(ov.id);
      return;
    }
    // clic en el fondo oscuro (no dentro de la ventana)
    if (e.target.classList && e.target.classList.contains("modal-overlay") && !e.target.hasAttribute("data-modal-static")) {
      closeModal(e.target.id);
    }
  });

  document.addEventListener("keydown", (e) => {
    if (!openStack.length) return;
    const top = document.getElementById(openStack[openStack.length - 1]);
    if (e.key === "Escape") {
      if (top && !top.hasAttribute("data-modal-static")) closeModal(top.id);
      return;
    }
    if (e.key === "Tab" && top) {
      const items = focusables(top.querySelector(".modal-box") || top);
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === top.querySelector(".modal-box"))) { last.focus(); e.preventDefault(); }
      else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); }
    }
  });
}
