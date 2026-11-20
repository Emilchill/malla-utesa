// motion.js — movimiento suave y esqueletos de carga, compartidos por todas las páginas.
//
//   · revealApp()  quita el esqueleto de página con un fundido y muestra la app.
//   · firstPaint() escalona la entrada de las tarjetas SOLO la primera vez (no en cada clic).
//   · replayIn()   repite un fundido corto al cambiar de vista.
//   · skelRows() / skelProfile()  esqueletos para listas y tarjetas que cargan dentro de la app.
//
// Todo respeta "reducir movimiento" del sistema: en ese caso no hay animaciones ni esperas.
// Las animaciones viven en css/style.css (sección "Movimiento suave y esqueletos de carga").

export function reducedMotion() {
  try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; }
}

/** Muestra la app y desvanece el esqueleto que la cubre. */
export function revealApp(loaderId = "loader", appId = "app") {
  const loader = document.getElementById(loaderId);
  document.getElementById(appId)?.classList.remove("hidden");
  if (!loader) return;
  loader.setAttribute("aria-busy", "false");
  if (reducedMotion()) { loader.classList.add("hidden"); return; }
  let done = false;
  const finish = () => { if (done) return; done = true; loader.classList.add("hidden"); loader.classList.remove("is-leaving"); };
  loader.classList.add("is-leaving");
  loader.addEventListener("animationend", finish, { once: true });
  setTimeout(finish, 450); // por si el navegador no emite animationend
}

/** Entrada escalonada de las tarjetas del contenedor, una sola vez. */
export function firstPaint(el, ms = 1300) {
  if (!el || reducedMotion()) return;
  el.classList.add("is-entering");
  setTimeout(() => el.classList.remove("is-entering"), ms);
}

/** Vuelve a reproducir el fundido de entrada de un contenedor (p. ej. al cambiar de vista). */
export function replayIn(el, cls = "view-in") {
  if (!el || reducedMotion()) return;
  el.classList.remove(cls);
  void el.offsetWidth; // reinicia la animación
  el.classList.add(cls);
}

/** Filas de esqueleto (persona o grupo: círculo + dos líneas). */
export function skelRows(n = 5, label = "Cargando…") {
  const row = (i) => `<div class="skel-row" style="--i:${i}"><span class="skel skel-circle"></span><span class="skel-col"><span class="skel skel-line" style="width:${48 + ((i * 17) % 34)}%"></span><span class="skel skel-line sm" style="width:${26 + ((i * 11) % 22)}%"></span></span><span class="skel skel-btn"></span></div>`;
  return `<div class="skel-list" role="status" aria-live="polite"><span class="sr-only">${label}</span>${Array.from({ length: n }, (_, i) => row(i)).join("")}</div>`;
}

/** Esqueleto de la tarjeta de perfil (avatar grande, nombre, datos y botones). */
export function skelProfile(label = "Cargando perfil…") {
  return `<div class="skel-profile" role="status" aria-live="polite"><span class="sr-only">${label}</span>
    <span class="skel skel-circle xl"></span>
    <span class="skel skel-line lg" style="width:52%"></span>
    <span class="skel skel-line" style="width:34%"></span>
    <div class="skel-chips"><span class="skel skel-pill"></span><span class="skel skel-pill"></span><span class="skel skel-pill"></span></div>
    <span class="skel skel-line" style="width:80%"></span>
    <span class="skel skel-line" style="width:64%"></span>
    <div class="skel-chips"><span class="skel skel-btn wide"></span><span class="skel skel-btn wide"></span></div>
  </div>`;
}
