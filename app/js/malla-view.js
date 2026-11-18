// malla-view.js
// Vista "Malla" estilo mapa de ruta (como un árbol de niveles de videojuego):
//   · una columna por cuatrimestre, de izquierda a derecha;
//   · caminos que unen cada materia con sus prerrequisitos
//     (verde = ya recorrido, dorado = el siguiente paso, gris = bloqueado);
//   · ZOOM: botones + / − / ver todo / ir a mi progreso, rueda con Ctrl, pellizco con dos dedos;
//   · se mueve arrastrando (mouse) o deslizando (teléfono);
//   · al pasar el cursor o tocar una materia se resalta su cadena de requisitos.
//
// Al imprimir: dos bloques de 6 cuatrimestres (uno por página) + electivas, sin zoom,
// sin caminos y con los prerrequisitos escritos en cada materia.

const BAND_SIZE = 6;               // cuatrimestres por bloque impreso
const MAX_LINES_PER_SUBJECT = 6;   // materias tipo "todas hasta el 11vo" no dibujan líneas
const MIN_SCALE = 0.3;
const MAX_SCALE = 1.8;

/** Estado de la cámara: se conserva entre repintados (al marcar materias, filtrar, etc.). */
const view = { scale: null, left: 0, keep: false };

let resizeObs = null;
let lastCtx = null;
let selectedCode = null; // materia cuya ruta está resaltada (solo se cambia con clics)

function esc(str) {
  return String(str).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

function nodeState(m, ctx) {
  if (m.c === "ELECTIVA") return "slot";
  const done = ctx.effSet.has(m.c);
  if (done) return "done";
  return ctx.isUnlocked(m) ? "open" : "lock";
}

function reqText(m, ctx) {
  if (m.c === "ELECTIVA") return "";
  const own = !m.req || m.req === "-" ? "" : (m.reqLabel || ctx.prereqsOf(m).join(", "));
  if (m.bloque) return own ? `${own} · ${m.bloque.label}` : m.bloque.label;
  return own;
}

const LOCK_SVG = '<svg class="mg-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';

function nodeHtml(m, ctx) {
  const state = nodeState(m, ctx);
  if (state === "slot") {
    return `<button type="button" class="mg-node st-slot" data-code="ELECTIVA">
      <span class="mg-top"><span class="mg-code">ELECTIVA</span><span class="mg-cr">${m.cr} CR</span></span>
      <span class="mg-name">Espacio para electiva</span>
    </button>`;
  }
  const staged = ctx.staged.has(m.c);
  const stagedCls = staged ? (ctx.baseSet.has(m.c) ? " staged-remove" : " staged-add") : "";
  const dim = ctx.matches(m) ? "" : " mg-dim";
  const req = reqText(m, ctx);
  const label = `${m.c} ${m.n}. ${m.cr} créditos. ${state === "done" ? "Aprobada" : state === "open" ? "Disponible" : "Bloqueada"}.`;
  const medal = ctx.medal ? ctx.medal(m.c) : "";
  return `<button type="button" class="mg-node st-${state}${stagedCls}${dim}${medal ? " has-medal" : ""}" data-code="${m.c}" aria-label="${esc(label)}">
    ${medal}
    <span class="mg-top"><span class="mg-code">${state === "lock" ? LOCK_SVG : ""}${m.c}</span><span class="mg-cr">${m.cr} CR</span></span>
    <span class="mg-name">${esc(m.n)}</span>
    ${req ? `<span class="mg-req">Req: ${esc(req)}</span>` : ""}
    <span class="mg-check" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6 9 17l-5-5"/></svg></span>
  </button>`;
}

const RING = 2 * Math.PI * 19;

function colHtml(cuat, ctx) {
  const reales = cuat.materias.filter(m => m.c !== "ELECTIVA");
  const done = reales.filter(m => ctx.effSet.has(m.c));
  const cr = cuat.materias.reduce((s, m) => s + m.cr, 0);
  const pct = reales.length ? done.length / reales.length : 0;
  const complete = reales.length > 0 && done.length === reales.length;
  return `<section class="mg-col${complete ? " is-complete" : ""}" data-n="${cuat.n}">
    <header class="mg-col-head">
      <span class="mg-step">
        <svg viewBox="0 0 44 44" aria-hidden="true"><circle class="rg-bg" cx="22" cy="22" r="19"/><circle class="rg-fg" cx="22" cy="22" r="19" stroke-dasharray="${RING.toFixed(1)}" stroke-dashoffset="${(RING * (1 - pct)).toFixed(1)}"/></svg>
        <b>${cuat.n}</b>
      </span>
      <div class="mg-col-info">
        <span class="mg-col-title">Cuatrimestre ${cuat.n}${complete ? " ★" : ""}</span>
        <span class="mg-col-sub">${done.length}/${reales.length} · ${cr} CR</span>
      </div>
      <div class="mg-col-bar"><i style="width:${Math.round(pct * 100)}%"></i></div>
    </header>
    <div class="mg-col-body">${cuat.materias.map(m => nodeHtml(m, ctx)).join("")}</div>
  </section>`;
}

const ICONS = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  fit: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  me: '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
};
const icon = (k) => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[k]}</svg>`;

export function renderMallaGraph(container, ctx) {
  lastCtx = ctx;
  const { pensum } = ctx;
  const cuats = pensum.cuatrimestres;
  const bands = [];
  for (let i = 0; i < cuats.length; i += BAND_SIZE) bands.push(cuats.slice(i, i + BAND_SIZE));

  const electivas = pensum.electivas;
  const elDone = electivas.filter(m => ctx.effSet.has(m.c)).length;

  // conserva la posición de la cámara entre repintados
  const prev = container.querySelector(".mg-scroll");
  if (prev && prev.clientWidth) { view.left = prev.scrollLeft; view.keep = true; }

  container.innerHTML = `
    <div class="mg">
      <div class="mg-hint">
        <span><i class="lg lg-done">✓</i>Aprobada</span>
        <span><i class="lg lg-open"></i>Disponible</span>
        <span><i class="lg lg-lock"></i>Bloqueada</span>
        <span class="mg-hint-tip">Toca una materia para ver su ruta · toca de nuevo o el fondo para quitarla · arrastra para moverte · pellizca o usa + / − para el zoom</span>
      </div>
      <nav class="mg-jump" aria-label="Ir a un cuatrimestre">
        ${cuats.map(c => {
          const reales = c.materias.filter(m => m.c !== "ELECTIVA");
          const done = reales.filter(m => ctx.effSet.has(m.c)).length;
          const full = reales.length > 0 && done === reales.length;
          return `<button type="button" class="mg-jump-btn${full ? " is-full" : done ? " is-part" : ""}" data-jump="${c.n}" aria-label="Cuatrimestre ${c.n}: ${done} de ${reales.length}">${c.n}</button>`;
        }).join("")}
        ${electivas.length ? '<button type="button" class="mg-jump-btn mg-jump-el" data-jump-el aria-label="Electivas">EL</button>' : ""}
      </nav>
      <div class="mg-viewport">
        <div class="mg-controls" role="group" aria-label="Zoom del mapa">
          <div class="mg-ctl-bar">
            <button type="button" class="mg-ctl" data-zoom="in" aria-label="Acercar">${icon("plus")}</button>
            <button type="button" class="mg-ctl mg-zoom-val" data-zoom="reset" aria-label="Restablecer zoom">100%</button>
            <button type="button" class="mg-ctl" data-zoom="out" aria-label="Alejar">${icon("minus")}</button>
            <span class="mg-ctl-sep"></span>
            <button type="button" class="mg-ctl" data-zoom="fit" aria-label="Ver todo el mapa" title="Ver todo">${icon("fit")}</button>
            <button type="button" class="mg-ctl" data-zoom="me" aria-label="Ir a mi progreso" title="Mi progreso">${icon("me")}</button>
          </div>
        </div>
        <div class="mg-scroll">
          <div class="mg-zoom">
            <div class="mg-track">
              <svg class="mg-lines" aria-hidden="true"></svg>
              ${bands.map((b, i) => `
                <div class="mg-band" data-band="${i}">
                  <div class="mg-band-title">Cuatrimestres ${b[0].n}–${b[b.length - 1].n}</div>
                  <div class="mg-band-cols">${b.map(c => colHtml(c, ctx)).join("")}</div>
                </div>`).join("")}
            </div>
          </div>
        </div>
      </div>
      ${electivas.length ? `
      <section class="mg-electivas" id="electivas-anchor">
        <header class="mg-el-head">
          <span class="mg-step mg-step-el"><b>EL</b></span>
          <div class="mg-col-info">
            <span class="mg-col-title">Electivas</span>
            <span class="mg-col-sub">${elDone}/${electivas.length} cursadas · elige según los espacios de electiva de tu pensum</span>
          </div>
        </header>
        <div class="mg-el-grid">${electivas.map(m => nodeHtml(m, ctx)).join("")}</div>
      </section>` : ""}
    </div>`;

  wire(container, ctx);
  wireJump(container);
  wireZoom(container);
  drawLines(container, ctx);
  applySelection(container);

  if (resizeObs) resizeObs.disconnect();
  const track = container.querySelector(".mg-track");
  if (track && "ResizeObserver" in window) {
    resizeObs = new ResizeObserver(() => drawLines(container, lastCtx));
    resizeObs.observe(track);
  }
}

/* posición horizontal de una columna dentro del contenido desplazable */
function colLeft(col, scroller) {
  return col.getBoundingClientRect().left - scroller.getBoundingClientRect().left + scroller.scrollLeft;
}

/* ---------- Cámara: zoom, arrastre y "ver todo" ---------- */
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function wireZoom(container) {
  const sc = container.querySelector(".mg-scroll");
  const zoomEl = container.querySelector(".mg-zoom");
  const track = container.querySelector(".mg-track");
  const label = container.querySelector(".mg-zoom-val");
  if (!sc || !zoomEl || !track) return;

  let ready = false;

  const apply = () => {
    track.style.scale = String(view.scale);
    const w = track.offsetWidth, h = track.offsetHeight; // tamaño natural (sin zoom)
    if (w && h) {
      zoomEl.style.width = `${Math.ceil(w * view.scale)}px`;
      zoomEl.style.height = `${Math.ceil(h * view.scale)}px`;
    }
    if (label) label.textContent = `${Math.round(view.scale * 100)}%`;
  };

  /** Cambia el zoom manteniendo fijo el punto bajo el dedo / cursor (fx, en px dentro del visor). */
  const setScale = (s, fx) => {
    const old = view.scale;
    const next = clamp(s, MIN_SCALE, MAX_SCALE);
    if (Math.abs(next - old) < 0.001) return;
    const x = fx ?? sc.clientWidth / 2;
    const anchor = (sc.scrollLeft + x) / old;
    view.scale = next;
    apply();
    sc.scrollLeft = anchor * next - x;
  };

  const currentCol = () => {
    const cuats = lastCtx.pensum.cuatrimestres;
    const i = cuats.findIndex(c => c.materias.some(m => m.c !== "ELECTIVA" && !lastCtx.effSet.has(m.c)));
    return container.querySelector(`.mg-col[data-n="${cuats[i >= 0 ? i : cuats.length - 1].n}"]`);
  };
  const goToProgress = (smooth) => {
    const col = currentCol();
    if (!col) return;
    sc.scrollTo({ left: Math.max(0, colLeft(col, sc) - 20), behavior: smooth ? "smooth" : "auto" });
  };
  const fit = () => {
    const w = track.offsetWidth;
    if (!w) return;
    setScale(clamp(sc.clientWidth / w, MIN_SCALE, 1), 0);
    sc.scrollTo({ left: 0, behavior: "auto" });
  };

  // Primera vez que el mapa es visible: escala inicial y cámara en "mi progreso"
  const init = () => {
    if (ready || !sc.clientWidth) return;
    ready = true;
    if (view.scale == null) view.scale = sc.clientWidth < 640 ? 0.85 : 0.9;
    apply();
    if (view.keep) sc.scrollLeft = view.left;
    else { goToProgress(false); view.keep = true; }
    drawLines(container, lastCtx);
  };
  if (view.scale == null) view.scale = window.innerWidth < 640 ? 0.85 : 0.9;
  apply();
  init();
  if ("ResizeObserver" in window) new ResizeObserver(init).observe(sc); // si la app aún estaba oculta
  sc.addEventListener("scroll", () => { if (ready) view.left = sc.scrollLeft; }, { passive: true });

  // Botones
  container.querySelector(".mg-controls")?.addEventListener("click", (e) => {
    const b = e.target.closest("[data-zoom]");
    if (!b) return;
    const act = b.dataset.zoom;
    if (act === "in") setScale(view.scale * 1.25);
    else if (act === "out") setScale(view.scale / 1.25);
    else if (act === "reset") setScale(window.innerWidth < 640 ? 0.85 : 0.9);
    else if (act === "fit") fit();
    else if (act === "me") { if (view.scale < 0.6) setScale(window.innerWidth < 640 ? 0.85 : 0.9, 0); goToProgress(true); }
  });

  // Rueda con Ctrl (o pellizco en el trackpad): zoom bajo el cursor
  sc.addEventListener("wheel", (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    setScale(view.scale * Math.exp(-e.deltaY * 0.0025), e.clientX - sc.getBoundingClientRect().left);
  }, { passive: false });

  // Pellizco con dos dedos
  let pinch = null;
  const dist = (a, b) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  sc.addEventListener("touchstart", (e) => {
    if (e.touches.length === 2) pinch = { d: dist(e.touches[0], e.touches[1]), s: view.scale };
  }, { passive: true });
  sc.addEventListener("touchmove", (e) => {
    if (!pinch || e.touches.length !== 2) return;
    e.preventDefault();
    const [a, b] = e.touches;
    setScale(pinch.s * (dist(a, b) / pinch.d), (a.clientX + b.clientX) / 2 - sc.getBoundingClientRect().left);
  }, { passive: false });
  const endPinch = (e) => { if (e.touches.length < 2) pinch = null; };
  sc.addEventListener("touchend", endPinch, { passive: true });
  sc.addEventListener("touchcancel", endPinch, { passive: true });

  // Arrastrar el fondo con el mouse para moverse por el mapa
  let drag = null;
  sc.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "mouse" || e.button !== 0 || e.target.closest(".mg-node")) return;
    drag = { x: e.clientX, left: sc.scrollLeft };
    sc.classList.add("is-panning");
    sc.setPointerCapture(e.pointerId);
  });
  sc.addEventListener("pointermove", (e) => {
    if (!drag) return;
    if (Math.abs(e.clientX - drag.x) > 5) sc.__moved = true;
    sc.scrollLeft = drag.left - (e.clientX - drag.x);
  });
  const endDrag = () => { drag = null; sc.classList.remove("is-panning"); };
  sc.addEventListener("pointerup", endDrag);
  sc.addEventListener("pointercancel", endDrag);
}

/* ---------- Navegación rápida por cuatrimestre ---------- */
function wireJump(container) {
  const scroller = container.querySelector(".mg-scroll");
  const btns = [...container.querySelectorAll(".mg-jump-btn[data-jump]")];
  btns.forEach(b => b.addEventListener("click", () => {
    const col = container.querySelector(`.mg-col[data-n="${b.dataset.jump}"]`);
    if (!col || !scroller) return;
    scroller.scrollTo({ left: Math.max(0, colLeft(col, scroller) - 20), behavior: "smooth" });
  }));
  container.querySelector("[data-jump-el]")?.addEventListener("click", () => {
    document.getElementById("electivas-anchor")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  // marca el cuatrimestre que se está viendo
  if (!scroller) return;
  const mark = () => {
    const mid = scroller.scrollLeft + scroller.clientWidth * 0.35;
    let cur = btns[0];
    if (scroller.clientWidth === 0) { btns.forEach(b => b.classList.toggle("is-cur", b === cur)); return; } // aún oculto
    container.querySelectorAll(".mg-col").forEach(col => {
      if (colLeft(col, scroller) <= mid) cur = btns.find(b => b.dataset.jump === col.dataset.n) || cur;
    });
    btns.forEach(b => b.classList.toggle("is-cur", b === cur));
  };
  // sin requestAnimationFrame: en pestañas ocultas no se ejecuta y el marcador quedaría desactualizado
  let timer = 0;
  const schedule = () => { if (timer) return; timer = setTimeout(() => { timer = 0; mark(); }, 60); };
  scroller.addEventListener("scroll", schedule, { passive: true });
  if ("ResizeObserver" in window) new ResizeObserver(schedule).observe(scroller); // al mostrarse la app o cambiar el tamaño
  mark();
}

/* ---------- Grafo de dependencias ---------- */
function buildGraph(ctx) {
  const all = [...ctx.pensum.cuatrimestres.flatMap(c => c.materias), ...ctx.pensum.electivas].filter(m => m.c !== "ELECTIVA");
  const pre = new Map();   // code -> [prereq codes]
  const post = new Map();  // code -> [dependent codes]
  all.forEach(m => {
    const p = ctx.prereqsOf(m);
    const drawable = !m.reqLabel && p.length <= MAX_LINES_PER_SUBJECT;
    pre.set(m.c, drawable ? p : []);
    if (drawable) p.forEach(x => {
      if (!post.has(x)) post.set(x, []);
      post.get(x).push(m.c);
    });
  });
  return { pre, post };
}

function collect(start, map) {
  const seen = new Set();
  const stack = [start];
  while (stack.length) {
    const c = stack.pop();
    (map.get(c) || []).forEach(n => { if (!seen.has(n)) { seen.add(n); stack.push(n); } });
  }
  return seen;
}

function wire(container, ctx) {
  const graph = buildGraph(ctx);
  const track = container.querySelector(".mg-track");

  container.querySelectorAll(".mg-node").forEach(node => {
    const code = node.dataset.code;
    node.addEventListener("click", () => {
      const m = code === "ELECTIVA" ? { c: "ELECTIVA" } : findIn(ctx.pensum, code);
      if (m) ctx.onCardClick(m); // electivas y modo manual los resuelve quien llama
      if (code === "ELECTIVA" || ctx.manual) return;
      // la ruta solo se muestra con clics: clic = ver la ruta, clic otra vez = quitarla
      selectedCode = selectedCode === code ? null : code;
      applySelection(container);
    });
  });

  // clic en el fondo del mapa (sin arrastrar) quita la ruta
  const sc = container.querySelector(".mg-scroll");
  sc?.addEventListener("click", (e) => {
    if (sc.__moved) { sc.__moved = false; return; }
    if (e.target.closest(".mg-node") || e.target.closest(".mg-controls")) return;
    if (selectedCode) { selectedCode = null; applySelection(container); }
  });
}

/** Resalta (o limpia) la ruta de la materia elegida con un clic. */
function applySelection(container) {
  const track = container.querySelector(".mg-track");
  if (!track || !lastCtx) return;
  if (selectedCode && !container.querySelector(`.mg-node[data-code="${selectedCode}"]`)) selectedCode = null;
  if (selectedCode) highlight(container, track, buildGraph(lastCtx), selectedCode);
  else clearHighlight(container, track);
}

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape" || !selectedCode) return;
  selectedCode = null;
  const c = document.querySelector(".mg");
  if (c) applySelection(c.parentElement);
});

function findIn(pensum, code) {
  for (const c of pensum.cuatrimestres) {
    const f = c.materias.find(m => m.c === code);
    if (f) return f;
  }
  return pensum.electivas.find(m => m.c === code) || null;
}

function highlight(container, track, graph, code) {
  const before = collect(code, graph.pre);
  const after = collect(code, graph.post);
  container.classList.add("mg-focus");
  container.querySelectorAll(".mg-node").forEach(n => {
    const c = n.dataset.code;
    n.classList.toggle("hl-self", c === code);
    n.classList.toggle("hl-pre", before.has(c));
    n.classList.toggle("hl-post", after.has(c));
  });
  const chain = new Set([code, ...before, ...after]);
  track?.querySelectorAll(".mg-lines path").forEach(p => {
    const on = chain.has(p.dataset.from) && chain.has(p.dataset.to);
    p.classList.toggle("hl", on);
    p.classList.toggle("hl-post", on && (p.dataset.from === code || after.has(p.dataset.from)));
  });
}

function clearHighlight(container, track) {
  container.classList.remove("mg-focus");
  container.querySelectorAll(".mg-node").forEach(n => n.classList.remove("hl-self", "hl-pre", "hl-post"));
  track?.querySelectorAll(".mg-lines path").forEach(p => p.classList.remove("hl", "hl-post"));
}

/* ---------- Caminos de prerrequisitos (SVG) ---------- */
function drawLines(container, ctx) {
  const track = container.querySelector(".mg-track");
  const svg = container.querySelector(".mg-lines");
  if (!track || !svg || !ctx) return;
  if (document.body.classList.contains("is-printing")) { svg.innerHTML = ""; return; }
  if (!track.offsetWidth) return; // aún oculto

  const tr = track.getBoundingClientRect();
  const k = tr.width / track.offsetWidth || 1; // zoom actual: las posiciones se convierten a coordenadas sin zoom
  svg.setAttribute("width", track.offsetWidth);
  svg.setAttribute("height", track.offsetHeight);
  svg.setAttribute("viewBox", `0 0 ${track.offsetWidth} ${track.offsetHeight}`);

  const pos = new Map();
  track.querySelectorAll(".mg-node[data-code]").forEach(n => {
    const r = n.getBoundingClientRect();
    if (!r.width) return;
    pos.set(n.dataset.code, { l: (r.left - tr.left) / k, r: (r.right - tr.left) / k, y: (r.top - tr.top + r.height / 2) / k });
  });

  const graph = buildGraph(ctx);
  const paths = [];
  graph.pre.forEach((reqs, to) => {
    const b = pos.get(to);
    if (!b) return;
    reqs.forEach(from => {
      const a = pos.get(from);
      if (!a) return;
      const fromDone = ctx.effSet.has(from);
      const toDone = ctx.effSet.has(to);
      const cls = fromDone && toDone ? "ok" : fromDone ? "go" : "lk"; // recorrido · siguiente paso · bloqueado
      let d;
      if (a.r <= b.l) {
        const x1 = a.r, x2 = b.l, dx = Math.max(18, (x2 - x1) * 0.45);
        d = `M${x1},${a.y} C${x1 + dx},${a.y} ${x2 - dx},${b.y} ${x2},${b.y}`;
      } else {
        // mismo cuatrimestre (raro): curva por el lado derecho
        const x = Math.max(a.r, b.r);
        d = `M${a.r},${a.y} C${x + 26},${a.y} ${x + 26},${b.y} ${b.r},${b.y}`;
      }
      paths.push(`<path d="${d}" data-from="${from}" data-to="${to}" class="${cls}"/>`);
    });
  });
  svg.innerHTML = paths.join("");
}
