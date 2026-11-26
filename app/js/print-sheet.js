// print-sheet.js
// Hoja imprimible de la malla, en una sola página horizontal, con el formato clásico de las mallas de UTESA
// (una columna por cuatrimestre con números romanos, cada materia con HT · HP · TH · CR, flechas de
// prerrequisitos y totales por ciclo), pero coloreada con el PROGRESO del estudiante.
//
// Toda la geometría se calcula en milímetros (no se mide el DOM), así que las flechas caen exactas en el papel
// sin importar el navegador. Es un documento NO oficial: no usa el logo ni el membrete de la universidad.

const W = 265;          // ancho útil en mm (carta horizontal con márgenes de 7 mm)
const H = 199;          // alto útil en mm
const HEAD = 21;        // encabezado
const BAR = 6.2;        // barra con el número romano de cada cuatrimestre
const TOT = 6;          // fila "totales por ciclo"
const FOOT = 21;        // electivas, totales y aviso
const GUT = 5;          // espacio entre columnas (ahí pasan las flechas)

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV", "XVI"];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
const v = (n) => (n ? String(n) : "-");
const f1 = (n) => Number(n.toFixed(2));

/**
 * @param {object} o
 * @param {object} o.pensum      pénsum de la carrera
 * @param {Set}    o.done        claves aprobadas
 * @param {(m)=>boolean} o.isUnlocked  si una materia ya se puede cursar
 * @param {(m)=>string[]} o.prereqsOf  claves de sus prerrequisitos
 * @param {string} o.name        nombre del estudiante
 * @param {object} o.stats       { pct, creditosHechos, totalCreditos, doneCount, totalCount }
 * @returns {string} HTML de la hoja
 */
export function buildPrintSheet({ pensum, done, current, isUnlocked, prereqsOf, name, stats }) {
  const cuats = pensum.cuatrimestres;
  const cols = cuats.length;
  const rows = Math.max(1, ...cuats.map(c => c.materias.length));
  const colW = (W - (cols - 1) * GUT) / cols;
  const gridTop = HEAD + BAR + 2;
  const gridH = H - gridTop - TOT - 3 - FOOT;
  const pitch = gridH / rows;
  const gap = Math.min(2.4, pitch * 0.2);
  const boxH = pitch - gap;
  const xOf = (ci) => ci * (colW + GUT);
  const yOf = (ri) => gridTop + ri * pitch;

  // tipografía: cada nombre usa el tamaño más grande con el que cabe entero en su caja
  const basePt = boxH < 8.6 ? 4.6 : boxH < 10.5 ? 5 : 5.4;
  const cellH = boxH < 8.6 ? 2.3 : 2.6;
  const showCode = boxH >= 9;
  const nameArea = boxH - cellH - 0.7 - (showCode ? 1.55 : 0);   // alto libre para el nombre (mm)
  const LH = 1.24;                                                  // interlineado (deja las tildes de la línea oculta dentro de su renglón)
  const fitName = (text) => {
    const words = String(text).split(/\s+/).filter(Boolean);
    const sizes = [basePt, basePt - 0.4, basePt - 0.8, basePt - 1.1, basePt - 1.4];
    for (const pt of sizes) {
      const lineMm = pt * 0.3528 * LH;
      const maxLines = Math.max(1, Math.floor(nameArea / lineMm));
      const perLine = Math.floor((colW - 1.2) / (pt * 0.3528 * 0.71)); // ancho medio de una mayúscula ≈ 0.71 em (Inter, negrita)
      // cuántas líneas ocupa una lista de palabras (reparto por palabras, como el navegador)
      const linesOf = (ws) => {
        let used = 1, cur = 0;
        for (const w of ws) {
          const len = Math.min(w.length, perLine);
          if (cur && cur + 1 + len > perLine) { used++; cur = len; } else cur += (cur ? 1 : 0) + len;
        }
        return used;
      };
      const longest = Math.max(...words.map(w => w.length));
      if (longest <= perLine && linesOf(words) <= maxLines) return { pt, h: maxLines * lineMm, text };
      if (pt === sizes[sizes.length - 1]) {
        // ni con la letra más pequeña cabe: se recorta a palabras completas + "…" (sin líneas ocultas que asomen)
        let k = words.length - 1;
        while (k > 1 && linesOf([...words.slice(0, k - 1), words[k - 1] + "…"]) > maxLines) k--;
        return { pt, h: maxLines * lineMm, text: words.slice(0, k).join(" ").replace(/[\s,.;:(]+$/, "") + "…" };
      }
    }
  };

  // posición de cada materia en la rejilla
  const at = new Map();
  cuats.forEach((c, ci) => c.materias.forEach((m, ri) => { if (m.c !== "ELECTIVA") at.set(m.c, { ci, ri }); }));
  const state = (m) => (m.c === "ELECTIVA" ? "slot" : done.has(m.c) ? "done" : current && current.has(m.c) ? "current" : isUnlocked(m) ? "open" : "lock");

  /* ---- flechas (prerrequisito en el cuatrimestre anterior) y números (prerrequisitos más atrás) ---- */
  const paths = [];
  const badges = new Map(); // código -> [números de cuatrimestre]
  cuats.forEach((c, ci) => c.materias.forEach((m, ri) => {
    if (m.c === "ELECTIVA" || !m.req || m.req === "-") return;
    const far = new Set();
    if (m.reqLabel) {
      const n = String(m.reqLabel).match(/(\d{1,2})/);
      far.add(n ? Number(n[1]) : Math.max(...prereqsOf(m).map(p => (at.get(p)?.ci ?? -1) + 1), 0) || "★");
    } else {
      for (const p of prereqsOf(m)) {
        const a = at.get(p);
        if (!a || a.ci >= ci) continue;
        if (a.ci === ci - 1) {
          const x1 = xOf(a.ci) + colW, y1 = yOf(a.ri) + boxH / 2;
          const x2 = xOf(ci) - 0.5, y2 = yOf(ri) + boxH / 2;
          const xm = x1 + GUT * (0.22 + 0.56 * (rows > 1 ? ri / (rows - 1) : 0.5));
          const ok = done.has(p);
          paths.push(`<path d="M${f1(x1)} ${f1(y1)} H${f1(xm)} V${f1(y2)} H${f1(x2)}" class="${ok ? "ps-ok" : "ps-no"}" marker-end="url(#ps-ar-${ok ? "ok" : "no"})"/>`);
        } else far.add(a.ci + 1);
      }
    }
    if (far.size) badges.set(m.c, [...far].sort((x, y) => x - y));
  }));

  /* ---- cajas ---- */
  const boxes = [];
  cuats.forEach((c, ci) => c.materias.forEach((m, ri) => {
    const st = state(m);
    const style = `left:${f1(xOf(ci))}mm;top:${f1(yOf(ri))}mm;width:${f1(colW)}mm;height:${f1(boxH)}mm`;
    if (st === "slot") {
      boxes.push(`<div class="ps-box st-slot" style="${style}"><div class="ps-name" style="font-size:${basePt}pt">ELECTIVA</div>
        <div class="ps-cells" style="height:${cellH}mm"><span>${v(m.ht)}</span><span>${v(m.hp)}</span><span>${v(m.th)}</span><span>${v(m.cr)}</span></div></div>`);
      return;
    }
    const b = badges.get(m.c) || [];
    const badgeHtml = b.slice(0, 2).map((n, i) => `<i class="ps-badge" style="left:${-1.2 + i * 2.5}mm">${b.length > 2 && i === 1 ? "+" : n}</i>`).join("");
    boxes.push(`<div class="ps-box st-${st}" style="${style}">${badgeHtml}${st === "done" ? '<i class="ps-ok-mark">✓</i>' : ""}
      ${showCode ? `<div class="ps-code">${esc(m.c)}</div>` : ""}
      ${(() => { const t = fitName(m.n); return `<div class="ps-name" style="font-size:${t.pt}pt;line-height:${LH};max-height:${f1(t.h)}mm" title="${esc(m.n)}">${esc(t.text)}</div>`; })()}
      <div class="ps-cells" style="height:${cellH}mm"><span>${v(m.ht)}</span><span>${v(m.hp)}</span><span>${v(m.th)}</span><span>${v(m.cr)}</span></div></div>`);
  }));

  /* ---- números romanos y totales por ciclo ---- */
  const totY = gridTop + gridH + 1;
  const heads = [], totals = [];
  cuats.forEach((c, ci) => {
    const reales = c.materias.filter(m => m.c !== "ELECTIVA");
    const dn = reales.filter(m => done.has(m.c));
    const cr = c.materias.reduce((s, m) => s + (m.cr || 0), 0);
    const crDone = dn.reduce((s, m) => s + (m.cr || 0), 0);
    const full = reales.length > 0 && dn.length === reales.length;
    heads.push(`<div class="ps-roman${full ? " is-full" : ""}" style="left:${f1(xOf(ci))}mm;top:${HEAD}mm;width:${f1(colW)}mm;height:${BAR}mm">${ROMAN[ci] || ci + 1}<small>${dn.length}/${reales.length}</small></div>`);
    const pct = cr ? Math.round((crDone / cr) * 100) : 0;
    totals.push(`<div class="ps-tot" style="left:${f1(xOf(ci))}mm;top:${f1(totY)}mm;width:${f1(colW)}mm;height:${TOT}mm">
      <span><b>${crDone}</b>/${cr} CR</span><i><u style="width:${pct}%"></u></i></div>`);
  });

  /* ---- pie: electivas, totales, leyenda y aviso ---- */
  const all = cuats.flatMap(c => c.materias);
  const sum = (k) => all.reduce((s, m) => s + (m[k] || 0), 0);
  const el = pensum.electivas || [];
  const elDone = el.filter(m => done.has(m.c)).length;
  const footY = totY + TOT + 2;
  const fecha = new Date().toLocaleDateString("es-DO", { year: "numeric", month: "long", day: "numeric" });

  const svg = `<svg class="ps-lines" viewBox="0 0 ${W} ${H}" width="${W}mm" height="${H}mm" aria-hidden="true">
    <defs>
      <marker id="ps-ar-ok" viewBox="0 0 6 6" refX="5.4" refY="3" markerWidth="4" markerHeight="4" orient="auto"><path d="M0 0 L6 3 L0 6Z" fill="#2E7D4F"/></marker>
      <marker id="ps-ar-no" viewBox="0 0 6 6" refX="5.4" refY="3" markerWidth="4" markerHeight="4" orient="auto"><path d="M0 0 L6 3 L0 6Z" fill="#8E968C"/></marker>
    </defs>${paths.join("")}</svg>`;

  return `
  <div class="ps-head">
    <div class="ps-title">
      <div class="ps-career">${esc(pensum.nombre).toUpperCase()}</div>
      <div class="ps-sub">MALLA CURRICULAR · PROGRESO DEL ESTUDIANTE</div>
      <div class="ps-who"><b>${esc(name || "")}</b> · ${esc(pensum.titulo || "")} · ${fecha}</div>
    </div>
    <div class="ps-key">
      <div class="ps-sample"><div class="ps-sample-name">ASIGNATURA</div><div class="ps-cells"><span>HT</span><span>HP</span><span>TH</span><span>CR</span></div></div>
      <div class="ps-key-txt">
        <span><b>HT</b> horas teóricas · <b>HP</b> horas prácticas</span>
        <span><b>TH</b> total de horas · <b>CR</b> créditos</span>
        <span><svg width="7mm" height="2mm" viewBox="0 0 14 4"><path d="M0 2 H11" stroke="#2E7D4F" stroke-width=".8"/><path d="M10 0 L14 2 L10 4Z" fill="#2E7D4F"/></svg> prerrequisito del ciclo anterior</span>
        <span><i class="ps-badge ps-badge-inline">5</i> tiene prerrequisitos en el cuatrimestre indicado</span>
      </div>
    </div>
    <div class="ps-status">
      <span><i class="ps-sw st-done">✓</i>Aprobada</span>
      <span><i class="ps-sw st-current">▶</i>En curso</span>
      <span><i class="ps-sw st-open"></i>Disponible para cursar</span>
      <span><i class="ps-sw st-lock"></i>Bloqueada</span>
    </div>
    <div class="ps-pct"><b>${stats.pct}%</b><span>${stats.creditosHechos}/${stats.totalCreditos} créditos</span><i><u style="width:${stats.pct}%"></u></i></div>
  </div>
  ${heads.join("")}
  ${svg}
  ${boxes.join("")}
  ${totals.join("")}
  <div class="ps-foot" style="top:${f1(footY)}mm;height:${f1(H - footY)}mm">
    <div class="ps-elect">
      <div class="ps-foot-title">ELECTIVAS · ${elDone}/${el.length} cursadas</div>
      <div class="ps-elect-list">${el.map(m => `<span class="${done.has(m.c) ? "is-done" : ""}">${done.has(m.c) ? "✓" : "○"} ${esc(m.n)} <em>${m.cr} CR</em></span>`).join("") || "<span>Esta carrera no tiene lista de electivas.</span>"}</div>
    </div>
    <table class="ps-sums">
      <tr><th colspan="2">TOTALES</th></tr>
      <tr><td>HT</td><td>${sum("ht").toLocaleString("es-DO")}</td></tr>
      <tr><td>HP</td><td>${sum("hp").toLocaleString("es-DO")}</td></tr>
      <tr><td>TH</td><td>${sum("th").toLocaleString("es-DO")}</td></tr>
      <tr><td>CR</td><td>${pensum.totalCreditos}</td></tr>
      <tr class="ps-sums-me"><td>Aprobados</td><td>${stats.creditosHechos} CR</td></tr>
    </table>
    <div class="ps-disclaimer">Documento NO oficial, generado por Malla UTESA (proyecto estudiantil independiente) con los datos que marcó el estudiante. Para trámites, consulta tu historial en UTESA.</div>
  </div>`;
}
