// charts-view.js
// Vista "Gráficos": resumen visual del avance de la carrera, dibujado con SVG
// (sin librerías) y con los colores del tema activo.
//   1. Resumen: dona de materias (aprobadas / disponibles / bloqueadas) + indicadores
//   2. Créditos por cuatrimestre (barras apiladas por estado)
//   3. Ritmo: avance acumulado tuyo vs. el plan del pensum
//   4. Proyección: en cuántos cuatrimestres terminarías según los créditos que tomes por período

const STD = /^[A-Z]{2,4}-\d{3}$/;
const CAP_KEY = "malla_cap";
const CAPS = [12, 15, 18, 21, 24, 27, 30]; // opciones de créditos por cuatrimestre; nunca pasan del máximo del pensum

// lo elegido se recuerda; null = usar el máximo del pensum (también si se había guardado «sin límite»)
let cap = (() => {
  try {
    const n = Number(localStorage.getItem(CAP_KEY));
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch { return null; }
})();

function esc(str) {
  return String(str).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}
const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);

/* ---------- Datos ---------- */
function collect(ctx) {
  const { pensum, effSet } = ctx;
  const stateOf = (m) => (effSet.has(m.c) ? "done" : ctx.isUnlocked(m) ? "open" : "lock");

  const cuats = pensum.cuatrimestres.map(c => {
    const subs = c.materias.filter(m => m.c !== "ELECTIVA" && STD.test(m.c));
    const slots = c.materias.filter(m => m.c === "ELECTIVA");
    const row = { n: c.n, done: 0, open: 0, lock: 0, count: { done: 0, open: 0, lock: 0 }, subs, slotCr: 0 };
    subs.forEach(m => { const s = stateOf(m); row[s] += m.cr; row.count[s]++; });
    slots.forEach(m => { row.slotCr += m.cr; });
    return row;
  });

  const electRequired = cuats.reduce((s, c) => s + c.slotCr, 0);
  const electDoneCr = pensum.electivas.filter(m => effSet.has(m.c)).reduce((s, m) => s + m.cr, 0);
  const electivas = { required: electRequired, done: Math.min(electRequired, electDoneCr), doneRaw: electDoneCr };

  const doneCr = cuats.reduce((s, c) => s + c.done, 0) + electDoneCr;
  const total = pensum.totalCreditos;
  const count = cuats.reduce((a, c) => ({
    done: a.done + c.count.done, open: a.open + c.count.open, lock: a.lock + c.count.lock,
  }), { done: 0, open: 0, lock: 0 });

  return { cuats, electivas, doneCr, total, count, stateOf };
}

/* ---------- 1. Resumen (dona + indicadores) ---------- */
function summaryHtml(d) {
  const n = d.count.done + d.count.open + d.count.lock;
  const R = 54, C = 2 * Math.PI * R;
  const segs = [
    { k: "done", v: d.count.done, label: "Aprobadas" },
    { k: "open", v: d.count.open, label: "Disponibles" },
    { k: "lock", v: d.count.lock, label: "Bloqueadas" },
  ];
  let acc = 0;
  const arcs = segs.map(s => {
    const len = n ? (s.v / n) * C : 0;
    const el = `<circle class="dn-seg dn-${s.k}" cx="70" cy="70" r="${R}" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-acc}"><title>${s.label}: ${s.v}</title></circle>`;
    acc += len;
    return el;
  }).join("");
  const p = Math.min(100, pct(d.doneCr, d.total));
  const complete = d.cuats.filter(c => c.count.done > 0 && c.count.open === 0 && c.count.lock === 0).length;

  return `<div class="ch-card ch-summary">
    <div class="ch-donut">
      <svg viewBox="0 0 140 140" role="img" aria-label="${d.count.done} materias aprobadas, ${d.count.open} disponibles y ${d.count.lock} bloqueadas">
        <circle class="dn-bg" cx="70" cy="70" r="${R}"/>
        <g transform="rotate(-90 70 70)">${arcs}</g>
      </svg>
      <div class="ch-donut-center"><strong>${p}%</strong><span>créditos</span></div>
    </div>
    <ul class="ch-legend ch-legend-col">
      ${segs.map(s => `<li><i class="sw sw-${s.k}"></i><span>${s.label}</span><strong>${s.v}</strong></li>`).join("")}
    </ul>
    <div class="ch-kpis">
      <div><strong>${d.doneCr}<small> / ${d.total}</small></strong><span>créditos aprobados</span></div>
      <div><strong>${d.count.done}<small> / ${n}</small></strong><span>materias aprobadas</span></div>
      <div><strong>${complete}<small> / ${d.cuats.length}</small></strong><span>cuatrimestres completos</span></div>
      <div><strong>${d.count.open}</strong><span>puedes cursar ahora</span></div>
    </div>
  </div>`;
}

/* ---------- 2. Créditos por cuatrimestre (barras apiladas) ---------- */
function barsHtml(d, W) {
  const H = W < 480 ? 250 : 290, L = 32, R = 6, T = 16, B = 30;
  const items = d.cuats.map(c => ({
    label: String(c.n), full: `Cuatrimestre ${c.n}`,
    done: c.done, open: c.open, lock: c.lock, pend: 0,
  }));
  if (d.electivas.required > 0) {
    items.push({
      label: "EL", full: "Electivas",
      done: d.electivas.done, open: 0, lock: 0, pend: Math.max(0, d.electivas.required - d.electivas.done),
    });
  }
  const sum = (it) => it.done + it.open + it.lock + it.pend;
  const maxV = Math.max(10, Math.ceil(Math.max(...items.map(sum)) / 5) * 5);
  const plotW = W - L - R, plotH = H - T - B;
  const slot = plotW / items.length, bw = Math.min(40, slot * 0.66);
  const y = (v) => T + plotH - (v / maxV) * plotH;

  const grid = [];
  for (let v = 0; v <= maxV; v += 5) {
    grid.push(`<line class="ax-grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="ax-txt" x="${L - 6}" y="${y(v) + 3.5}" text-anchor="end">${v}</text>`);
  }
  const bars = items.map((it, i) => {
    const x = L + slot * i + (slot - bw) / 2;
    let acc = 0;
    const seg = (k, v, name) => {
      if (v <= 0) return "";
      const y0 = y(acc + v), h = y(acc) - y0;
      acc += v;
      return `<rect class="bar-${k}" x="${x}" y="${y0}" width="${bw}" height="${Math.max(0, h - 0.8)}" rx="2"><title>${it.full} · ${name}: ${v} CR</title></rect>`;
    };
    const stack = seg("done", it.done, "aprobados") + seg("open", it.open, "disponibles") + seg("lock", it.lock, "bloqueados") + seg("pend", it.pend, "pendientes");
    const total = sum(it);
    return `<g>${stack}
      <text class="bar-val" x="${x + bw / 2}" y="${y(total) - 5}" text-anchor="middle">${total || ""}</text>
      <text class="ax-txt ax-x" x="${x + bw / 2}" y="${H - B + 17}" text-anchor="middle">${it.label}</text></g>`;
  }).join("");

  const table = `<table class="ch-table"><thead><tr><th>Cuatrimestre</th><th>Aprobados</th><th>Disponibles</th><th>Bloqueados</th><th>Total CR</th></tr></thead><tbody>
    ${items.map(it => `<tr><td>${esc(it.full)}</td><td>${it.done}</td><td>${it.open}</td><td>${it.lock + it.pend}</td><td>${sum(it)}</td></tr>`).join("")}
  </tbody></table>`;

  return `<div class="ch-card ch-wide">
    <div class="ch-head"><h3>Créditos por cuatrimestre</h3>
      <ul class="ch-legend">
        <li><i class="sw sw-done"></i>Aprobados</li><li><i class="sw sw-open"></i>Disponibles</li><li><i class="sw sw-lock"></i>Bloqueados</li>
      </ul></div>
    <svg class="ch-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Créditos por cuatrimestre según su estado">
      ${grid.join("")}${bars}
    </svg>
    <details class="ch-details"><summary>Ver datos en tabla</summary>${table}</details>
  </div>`;
}

/* ---------- 3. Ritmo: avance acumulado vs plan ---------- */
function paceHtml(d, W) {
  const H = W < 480 ? 220 : 250, L = 40, R = 14, T = 16, B = 30;
  const plotW = W - L - R, plotH = H - T - B;
  const total = d.cuats.reduce((s, c) => s + c.done + c.open + c.lock + c.slotCr, 0) || 1;
  const x = (i) => L + (plotW * i) / d.cuats.length;
  const y = (p) => T + plotH - (p / 100) * plotH;

  let accPlan = 0, accYou = 0;
  const plan = [{ i: 0, p: 0 }], you = [{ i: 0, p: 0 }];
  d.cuats.forEach((c, k) => {
    accPlan += c.done + c.open + c.lock + c.slotCr;
    accYou += c.done;
    plan.push({ i: k + 1, p: pct(accPlan, total) });
    you.push({ i: k + 1, p: pct(accYou, total) });
  });
  // posición actual = primer cuatrimestre incompleto
  const cur = d.cuats.findIndex(c => c.open > 0 || c.lock > 0);
  const youNow = Math.min(100, pct(d.doneCr, d.total));
  // "tu avance" se dibuja solo hasta donde vas: termina en tu porcentaje real, a mitad del cuatrimestre en curso
  const youPts = cur < 0 ? you : [...you.slice(0, cur + 1), { i: cur + 0.5, p: youNow }];
  if (cur < 0) youPts[youPts.length - 1].p = youNow;

  const path = (pts) => pts.map((q, k) => `${k ? "L" : "M"}${x(q.i).toFixed(1)},${y(q.p).toFixed(1)}`).join(" ");
  const last = youPts[youPts.length - 1];
  const area = `${path(youPts)} L${x(last.i)},${y(0)} L${x(0)},${y(0)} Z`;

  const grid = [0, 25, 50, 75, 100].map(v =>
    `<line class="ax-grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="ax-txt" x="${L - 6}" y="${y(v) + 3.5}" text-anchor="end">${v}%</text>`).join("");
  const xs = d.cuats.map((c, k) => `<text class="ax-txt ax-x" x="${x(k + 1)}" y="${H - B + 17}" text-anchor="middle">${c.n}</text>`).join("");

  const markX = cur >= 0 ? x(cur + 0.5) : x(d.cuats.length);
  const markRight = markX > W * 0.7; // evita que el texto se salga por la derecha
  const marker = cur >= 0
    ? `<line class="pace-mark" x1="${markX}" x2="${markX}" y1="${T}" y2="${H - B}"/><text class="pace-mark-txt" x="${markX + (markRight ? -5 : 5)}" y="${T + 10}" text-anchor="${markRight ? "end" : "start"}">vas por aquí</text>`
    : "";
  const dots = youPts.map((q, k) => {
    const isNow = k === youPts.length - 1;
    const tip = isNow ? `Ahora: ${q.p}% de la carrera` : `Hasta el cuatrimestre ${q.i}: ${q.p}% aprobado`;
    return `<circle class="pace-dot${isNow ? " pace-now" : ""}" cx="${x(q.i)}" cy="${y(q.p)}" r="${isNow ? 5 : 3}"><title>${tip}</title></circle>`;
  }).join("");

  // texto de lectura
  const planAtCur = cur >= 0 ? plan[cur].p : 100;
  const diff = youNow - planAtCur;
  const read = cur < 0 ? "Completaste todo el pensum. ¡Felicidades!"
    : diff >= 0
      ? `Llevas <strong>${youNow}%</strong> de la carrera; el plan indica ${planAtCur}% al terminar el cuatrimestre ${d.cuats[cur].n - 1 || 0}. Vas <strong>al día o adelantado</strong>.`
      : `Llevas <strong>${youNow}%</strong> de la carrera; el plan indica ${planAtCur}% al terminar el cuatrimestre ${d.cuats[cur].n - 1 || 0}. Hay materias de cuatrimestres anteriores pendientes.`;

  return `<div class="ch-card ch-wide">
    <div class="ch-head"><h3>Ritmo de avance</h3>
      <ul class="ch-legend"><li><i class="sw sw-line"></i>Tu avance</li><li><i class="sw sw-plan"></i>Plan del pensum</li></ul></div>
    <svg class="ch-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Avance acumulado frente al plan del pensum">
      ${grid}${xs}
      <path class="pace-area" d="${area}"/>
      <path class="pace-plan" d="${path(plan)}"/>
      <path class="pace-you" d="${path(youPts)}"/>
      ${marker}${dots}
    </svg>
    <p class="ch-read">${read}</p>
  </div>`;
}

/* ---------- 4. Proyección ---------- */
function project(ctx, d, limit) {
  const { pensum, effSet } = ctx;
  const subjects = pensum.cuatrimestres.flatMap(c => c.materias).filter(m => m.c !== "ELECTIVA" && STD.test(m.c));
  const known = new Set(subjects.map(m => m.c));
  const pending = subjects.filter(m => !effSet.has(m.c));
  const sim = new Set(effSet);

  // "profundidad": cuántos cuatrimestres de cadena dependen de esta materia (las críticas van primero)
  const deps = new Map();
  pending.forEach(m => ctx.prereqsOf(m).filter(p => known.has(p)).forEach(p => {
    if (!deps.has(p)) deps.set(p, []);
    deps.get(p).push(m.c);
  }));
  const memo = new Map();
  const depth = (c) => {
    if (memo.has(c)) return memo.get(c);
    memo.set(c, 1); // evita ciclos
    const v = 1 + Math.max(0, ...(deps.get(c) || []).map(depth));
    memo.set(c, v);
    return v;
  };

  let electLeft = Math.max(0, d.electivas.required - d.electivas.doneRaw);
  const left = [...pending];
  const terms = [];
  for (let guard = 0; guard < 30 && (left.length || electLeft > 0); guard++) {
    const avail = left
      .filter(m => ctx.prereqsOf(m).filter(p => known.has(p)).every(p => sim.has(p)))
      .sort((a, b) => depth(b.c) - depth(a.c) || b.cr - a.cr);
    const take = [];
    let load = 0;
    for (const m of avail) {
      if (limit == null || load + m.cr <= limit || (take.length === 0 && m.cr > limit)) { take.push(m); load += m.cr; }
    }
    let el = 0;
    if (electLeft > 0) {
      const room = limit == null ? electLeft : Math.max(0, limit - load);
      el = Math.min(electLeft, Math.floor(room / 3) * 3);
      load += el; electLeft -= el;
    }
    if (!take.length && !el) break;
    take.forEach(m => { sim.add(m.c); left.splice(left.indexOf(m), 1); });
    terms.push({ subjects: take, el, load });
  }
  return { terms, stuck: left };
}

/** Máximo de créditos por cuatrimestre según el pensum: el cuatrimestre que más créditos tiene. */
function pensumMaxCredits(pensum) {
  return Math.max(1, ...pensum.cuatrimestres.map(c => c.materias.reduce((s, m) => s + (m.cr || 0), 0)));
}

function projectionHtml(ctx, d) {
  // el límite nunca pasa del cuatrimestre más cargado del pensum (y ese es su máximo)
  const maxCr = pensumMaxCredits(ctx.pensum);
  const limit = cap == null || cap > maxCr ? maxCr : cap;
  const options = [...CAPS.filter(v => v != null && v < maxCr), maxCr];
  const { terms, stuck } = project(ctx, d, limit);
  const n = terms.length;
  const years = n / 3;
  const capLabel = (v) => (v === maxCr ? `${v} CR · máximo de tu pensum` : `${v} CR`);
  const head = n === 0
    ? "Ya no te queda ninguna materia por cursar."
    : `Tomando hasta <strong>${limit} créditos</strong> por cuatrimestre${limit === maxCr ? " (el máximo de tu pensum)" : ""}, terminarías en <strong>${n} cuatrimestre${n === 1 ? "" : "s"}</strong> (≈ ${years.toFixed(1).replace(".0", "")} año${years === 1 ? "" : "s"}).`;

  const maxLoad = Math.max(10, ...terms.map(t => t.load));
  const cols = terms.map((t, i) => `
    <section class="rd-col">
      <header><strong>${i === 0 ? "Siguiente" : `+${i}`}</strong><span>${t.load} CR</span></header>
      <div class="rd-bar"><i style="width:${Math.min(100, (t.load / maxLoad) * 100)}%"></i></div>
      <div class="rd-list">
        ${t.subjects.map(m => `<button type="button" class="rd-chip" data-code="${m.c}" title="${esc(m.n)} · ${m.cr} CR">
          <span class="mono">${m.c}</span><span class="rd-name">${esc(m.n)}</span></button>`).join("")}
        ${t.el ? `<div class="rd-chip rd-el"><span class="mono">ELEC</span><span class="rd-name">Electivas · ${t.el} CR</span></div>` : ""}
      </div>
    </section>`).join("");

  return `<div class="ch-card ch-wide">
    <div class="ch-head">
      <h3>Proyección para terminar</h3>
      <label class="ch-cap">Créditos por cuatrimestre
        <select id="ch-cap" class="input">${options.map(v => `<option value="${v}"${v === limit ? " selected" : ""}>${capLabel(v)}</option>`).join("")}</select>
      </label>
    </div>
    <p class="ch-read">${head}</p>
    ${n ? `<div class="rd-scroll"><div class="rd-track">${cols}</div></div>` : ""}
    ${stuck.length ? `<p class="ch-note">⚠ ${stuck.length} materia${stuck.length === 1 ? "" : "s"} no se pudo${stuck.length === 1 ? "" : "n"} ubicar por requisitos que no se cumplen (${stuck.slice(0, 4).map(m => m.c).join(", ")}${stuck.length > 4 ? "…" : ""}).</p>` : ""}
    <p class="ch-note">Estimación: ordena primero las materias que más cadena de requisitos desbloquean y no considera la oferta real de cada período ni los correquisitos. Incluye lo que cursas ahora como pendiente.</p>
  </div>`;
}

/* ---------- Render ---------- */
let ro = null;
let roWidth = 0;

export function renderCharts(container, ctx) {
  const d = collect(ctx);
  // el SVG se dibuja al ancho real de la tarjeta para que el texto se lea bien en teléfono
  const avail = container.clientWidth || window.innerWidth || 760;
  const W = Math.max(300, Math.min(900, avail - (avail < 600 ? 32 : 48) - 40));
  roWidth = avail;
  container.innerHTML = `<div class="ch">
    ${summaryHtml(d)}
    ${barsHtml(d, W)}
    ${paceHtml(d, W)}
    ${projectionHtml(ctx, d)}
  </div>`;

  if (ro) ro.disconnect();
  if ("ResizeObserver" in window) {
    let t = null;
    ro = new ResizeObserver(() => {
      if (!container.classList.contains("is-charts")) return;
      if (Math.abs(container.clientWidth - roWidth) < 24) return;
      clearTimeout(t);
      t = setTimeout(() => renderCharts(container, ctx), 150);
    });
    ro.observe(container);
  }

  const sel = container.querySelector("#ch-cap");
  sel?.addEventListener("change", () => {
    cap = Number(sel.value); // el máximo del pensum ya viene limitado en las opciones
    try { localStorage.setItem(CAP_KEY, sel.value); } catch {}
    renderCharts(container, ctx);
  });
  container.querySelectorAll(".rd-chip[data-code]").forEach(btn => {
    btn.addEventListener("click", () => {
      const m = ctx.findSubject(btn.dataset.code);
      if (m) ctx.onSubjectClick(m);
    });
  });
}
