// character.js
// Creador de personajes en SVG (sin imágenes externas): personas y animales.
// Un personaje se guarda como texto corto en users/{uid}.avatar  ->  "c1:{...}"
// (cada número es la posición de la opción elegida dentro de su lista) y el color
// de fondo en users/{uid}.avatarBg. Los avatares antiguos (ids) siguen funcionando.

const INK = "#1b1b1b";
const MOUTH = "#8A3B3B";
const DARK_RED = "#7a2d3a";

/* ---------- Utilidades de color ---------- */
export function mix(hex, to, t) {
  const n = (h) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const a = n(hex), b = n(to);
  return "#" + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, "0")).join("");
}
export const bgPair = (hex) => [mix(hex, "#ffffff", 0.32), hex];
export const isHex = (v) => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);

export const BG_COLORS = [
  "#F4645F", "#FF8A5B", "#F5C542", "#A3D63C", "#34B77A", "#2FB5B0", "#4F9FEF",
  "#5D7BC9", "#8F78E8", "#C26CF0", "#F27BB0", "#B9824B", "#6B7C93", "#2B2D5A",
];
const DEFAULT_BG = { p: "#5D7BC9", a: "#F5C542" };

/* ---------- Paletas ---------- */
const SKIN = ["#FDE3CF", "#F6CBA6", "#E7B48B", "#D49C70", "#BF8A5E", "#A66C43", "#8A5232", "#6E4224", "#543020", "#3B2216"];
const HAIR = ["#1d1612", "#3a2619", "#5A3825", "#8B5A2B", "#B9824B", "#D9A441", "#F0D58C", "#C0392B", "#E0693F", "#8c8c93", "#E8E8EC", "#3B82F6", "#A855F7", "#EC4899"];
const EYES = ["#3b2a1e", "#6b4423", "#4a7a3b", "#2f6fb0", "#6b7c93", "#8e5aa8", "#1b1b1b", "#2aa198"];
const LIPS = ["#C2455C", "#E0607E", "#A3283D", "#D9774F", "#7A2E4A", "#B4496B", "#E8A0A8", "#4B2D5E"];
const BLUSH = ["#FF8FA3", "#FF9E7A", "#F2A3C8", "#E07A7A", "#C98CE0", "#F5B873"];
const SHADOW = ["#A98BE0", "#6FA8E8", "#E88BB4", "#7BC7A0", "#D9A441", "#5A4A6A"];
const FUR = ["#F2A65A", "#D9A066", "#8B5E3C", "#5A3A2A", "#F5F0E6", "#FFFFFF", "#9AA3AD", "#3C3C44", "#E8C27A", "#F4B6C2", "#A4C8A0", "#8EC5F0", "#C9A7EB", "#E8704A"];
const DETAIL = ["#1b1b1b", "#5A3A2A", "#FFB3B3", "#C9822B", "#F5F0E6", "#8B5E3C", "#E8704A", "#3C3C44", "#7A5CC9", "#2f6fb0"];
const NOSE = ["#1b1b1b", "#E57B94", "#8B5E3C", "#E8704A", "#7A5CC9", "#3C3C44"];
const CLOTHES = BG_COLORS;

/* ---------- Esquemas (alimentan el dibujo, el azar y la interfaz) ----------
   type: "opt" lista de nombres | "color" paleta (none:true => 0 = ninguno) | "bool"        */
const L = (...names) => names;

export const SCHEMAS = {
  p: {
    label: "Persona",
    tabs: [
      { id: "cuerpo", label: "Cuerpo", fields: [
        { key: "s", label: "Tono de piel", type: "color", colors: SKIN, def: 2, crop: "head" },
        { key: "f", label: "Forma de la cara", type: "opt", names: L("Ovalada", "Redonda", "Cuadrada"), def: 0, crop: "head" },
      ] },
      { id: "pelo", label: "Pelo", fields: [
        { key: "h", label: "Peinado", type: "opt", names: L("Sin pelo", "Rapado", "Corto", "De lado", "Rizado", "Afro", "Moño", "Cola de caballo", "Melena corta", "Melena larga", "Puntas", "Dos moños"), def: 2, crop: "head" },
        { key: "hc", label: "Color del pelo", type: "color", colors: HAIR, def: 1, crop: "head" },
        { key: "fh", label: "Vello facial", type: "opt", names: L("Ninguno", "Sombra", "Bigote", "Perilla", "Barba"), def: 0, none: true, crop: "face" },
      ] },
      { id: "rostro", label: "Rostro", fields: [
        { key: "e", label: "Ojos", type: "opt", names: L("Naturales", "Puntos", "Felices", "Dormilones", "Pestañas"), def: 0, crop: "eyes" },
        { key: "ec", label: "Color de ojos", type: "color", colors: EYES, def: 1, crop: "face" },
        { key: "b", label: "Cejas", type: "opt", names: L("Sin cejas", "Suaves", "Rectas", "Gruesas", "Arqueadas"), def: 1, crop: "eyes" },
        { key: "n", label: "Nariz", type: "opt", names: L("Línea", "Redonda", "Pequeña"), def: 0, crop: "mouth" },
        { key: "m", label: "Boca", type: "opt", names: L("Sonrisa", "Sonrisa grande", "Neutra", "Pícara", "Sorpresa", "Lengua"), def: 0, crop: "mouth" },
        { key: "fr", label: "Pecas", type: "bool", def: 0, crop: "face" },
      ] },
      { id: "maquillaje", label: "Maquillaje", fields: [
        { key: "lp", label: "Labios", type: "color", colors: LIPS, none: true, def: 0, crop: "mouth" },
        { key: "bl", label: "Rubor", type: "color", colors: BLUSH, none: true, def: 1, crop: "face" },
        { key: "sh", label: "Sombra de ojos", type: "color", colors: SHADOW, none: true, def: 0, crop: "eyes" },
        { key: "li", label: "Delineador", type: "bool", def: 0, crop: "eyes" },
      ] },
      { id: "ropa", label: "Ropa", fields: [
        { key: "c", label: "Estilo", type: "opt", names: L("Camiseta", "Sudadera", "Camisa", "Traje", "Cuello en V", "Vestido", "Polo", "Bata de laboratorio", "Toga de graduación", "Chaleco", "Cuello alto", "Rayas", "Chaqueta deportiva", "Overol", "Blusa con moño", "Cuadros", "Chaqueta de cuero", "Sin mangas",
          "Suéter tejido", "Abrigo", "Camisa hawaiana", "Jersey deportivo", "Blazer", "Chef", "Lunares", "Uniforme escolar", "Poncho", "Tie-dye",
          "🎄 Suéter de copos", "🦌 Suéter de reno", "🎅 Traje de Santa", "💡 Suéter con luces", "🎁 Pijama navideña", "🧝 Chaleco de elfo"), def: 0, crop: "body" },
        { key: "cc", label: "Color", type: "color", colors: CLOTHES, def: 6, crop: "body" },
      ] },
      { id: "extras", label: "Extras", fields: [
        { key: "g", label: "Lentes", type: "opt", names: L("Ninguno", "Redondos", "Cuadrados", "De sol", "Ojo de gato"), def: 0, none: true, crop: "face" },
        { key: "er", label: "Aretes", type: "opt", names: L("Ninguno", "Botones", "Aros"), def: 0, none: true, crop: "head" },
        { key: "ht", label: "Gorro o sombrero", type: "opt", names: L("Ninguno", "Gorra", "Gorro", "Corona", "Fiesta", "Birrete", "Casco de obra", "Boina", "Diadema", "🎅 Gorro de Santa", "🧝 Gorro de elfo", "🦌 Cuernos de reno", "🎄 Corona de acebo", "Vaquero", "Copa", "Pamela"), def: 0, none: true, crop: "head" },
        { key: "hv", label: "Color del gorro", type: "color", colors: BG_COLORS, def: 0, crop: "head" },
      ] },
      { id: "exclusivo", label: "⭐ Exclusivo", exclusive: true, fields: [
        { key: "xh", label: "Corona o casco exclusivo", type: "opt", names: L("Ninguno", "Corona imperial", "Halo dorado", "Casco espartano", "Laurel de oro", "Orejas de neón"), def: 0, exclusive: true, crop: "head" },
        { key: "xg", label: "Visor o antifaz exclusivo", type: "opt", names: L("Ninguno", "Visor ciber", "Antifaz dorado", "Monóculo de oro"), def: 0, exclusive: true, crop: "face" },
        { key: "xb", label: "Prenda exclusiva", type: "opt", names: L("Ninguna", "Capa real", "Hombreras de armadura", "Collar de oro"), def: 0, exclusive: true, crop: "full" },
        { key: "xw", label: "Alas", type: "opt", names: L("Ninguna", "Alas de ángel", "Alas de dragón"), def: 0, exclusive: true, crop: "full" },
        { key: "xa", label: "Aura", type: "opt", names: L("Ninguna", "Aura dorada", "Aura violeta"), def: 0, exclusive: true, crop: "full" },
      ] },
    ],
  },
  a: {
    label: "Animal",
    tabs: [
      { id: "especie", label: "Especie", fields: [
        { key: "sp", label: "Animal", type: "opt", names: L("Gato", "Perro", "Oso", "Zorro", "Conejo", "Panda", "León", "Rana", "Cerdito", "Búho"), def: 0, crop: "head", onPick: true },
      ] },
      { id: "pelaje", label: "Pelaje", fields: [
        { key: "fc", label: "Color del pelaje", type: "color", colors: FUR, def: 0, crop: "head" },
        { key: "dc", label: "Color de detalles", type: "color", colors: DETAIL, def: 2, crop: "head" },
        { key: "spt", label: "Manchas", type: "opt", names: L("Ninguna", "Mancha en el ojo", "Pecas", "Rayas"), def: 0, none: true, crop: "head" },
      ] },
      { id: "rostro", label: "Rostro", fields: [
        { key: "e", label: "Ojos", type: "opt", names: L("Redondos", "Con iris", "Felices", "Dormilones"), def: 0, crop: "head" },
        { key: "ec", label: "Color de ojos", type: "color", colors: EYES, def: 1, crop: "head" },
        { key: "nc", label: "Color de nariz", type: "color", colors: NOSE, def: 0, crop: "head" },
        { key: "m", label: "Boca", type: "opt", names: L("Sonrisa", "Sonrisa grande", "Neutra", "Lengua"), def: 0, crop: "head" },
        { key: "bl", label: "Rubor", type: "color", colors: BLUSH, none: true, def: 1, crop: "head" },
      ] },
      { id: "extras", label: "Extras", fields: [
        { key: "g", label: "Lentes", type: "opt", names: L("Ninguno", "Redondos", "Cuadrados", "De sol", "Ojo de gato"), def: 0, none: true, crop: "head" },
        { key: "ht", label: "Gorro o sombrero", type: "opt", names: L("Ninguno", "Gorra", "Gorro", "Corona", "Fiesta", "Birrete", "Casco de obra", "Boina", "Diadema", "🎅 Gorro de Santa", "🧝 Gorro de elfo", "🦌 Cuernos de reno", "🎄 Corona de acebo", "Vaquero", "Copa", "Pamela"), def: 0, none: true, crop: "head" },
        { key: "hv", label: "Color del gorro", type: "color", colors: BG_COLORS, def: 4, crop: "head" },
        { key: "nw", label: "Cuello", type: "opt", names: L("Ninguno", "Pajarita", "Bufanda", "Cascabel"), def: 0, none: true, crop: "body" },
        { key: "nv", label: "Color del cuello", type: "color", colors: BG_COLORS, def: 0, crop: "body" },
      ] },
    ],
  },
};

const CROPS = { head: "6 0 88 88", face: "22 26 56 52", eyes: "29 33 42 42", mouth: "27 40 46 46", body: "4 46 92 54", full: "0 0 100 100" };

const fieldsOf = (kind) => SCHEMAS[kind].tabs.flatMap(t => t.fields);
const countOf = (f) => f.type === "bool" ? 2 : f.type === "opt" ? f.names.length : f.colors.length + (f.none ? 1 : 0);

/* ---------- Animales: ficha por especie ---------- */
const SPECIES = [
  { id: "gato", fc: 0, dc: 2, nc: 1, top: 31 },
  { id: "perro", fc: 1, dc: 5, nc: 0, top: 31 },
  { id: "oso", fc: 2, dc: 5, nc: 0, top: 31 },
  { id: "zorro", fc: 13, dc: 0, nc: 0, top: 32 },
  { id: "conejo", fc: 4, dc: 2, nc: 1, top: 37 },
  { id: "panda", fc: 5, dc: 0, nc: 0, top: 31 },
  { id: "leon", fc: 8, dc: 3, nc: 2, top: 26 },
  { id: "rana", fc: 10, dc: 4, nc: 2, top: 28 },
  { id: "cerdito", fc: 9, dc: 2, nc: 2, top: 32 },
  { id: "buho", fc: 2, dc: 5, nc: 3, top: 30 },
];

/* ---------- Config: crear, azar, codificar ---------- */
export function defaultConfig(kind = "p") {
  const cfg = { k: kind };
  for (const f of fieldsOf(kind)) cfg[f.key] = f.def;
  if (kind === "a") applySpeciesDefaults(cfg);
  return cfg;
}
function applySpeciesDefaults(cfg) {
  const s = SPECIES[cfg.sp] || SPECIES[0];
  cfg.fc = s.fc; cfg.dc = s.dc; cfg.nc = s.nc;
}
export function randomConfig(kind = "p", rnd = Math.random) {
  const cfg = { k: kind };
  for (const f of fieldsOf(kind)) {
    const n = countOf(f);
    if (f.exclusive) { cfg[f.key] = 0; continue; }
    cfg[f.key] = f.none && rnd() < 0.62 ? 0 : Math.floor(rnd() * n);
  }
  if (kind === "a") {
    const s = SPECIES[cfg.sp];
    if (rnd() < 0.6) { cfg.fc = s.fc; cfg.dc = s.dc; cfg.nc = s.nc; }
  }
  return cfg;
}
export function encodeCharacter(cfg) {
  const out = { k: cfg.k };
  for (const f of fieldsOf(cfg.k)) out[f.key] = cfg[f.key];
  return "c1:" + JSON.stringify(out);
}
export const isCharacter = (v) => typeof v === "string" && v.startsWith("c1:");
export function decodeCharacter(str) {
  let raw = {};
  try { raw = JSON.parse(String(str).slice(3)) || {}; } catch { /* usa los valores por defecto */ }
  const kind = raw.k === "a" ? "a" : "p";
  const cfg = defaultConfig(kind);
  for (const f of fieldsOf(kind)) {
    const v = raw[f.key];
    if (Number.isInteger(v) && v >= 0 && v < countOf(f)) cfg[f.key] = v;
  }
  return cfg;
}
/* ---------- Personajes iniciales (primer uso) ---------- */
export const SEX_OPTIONS = [
  { id: "f", label: "Mujer" },
  { id: "m", label: "Hombre" },
  { id: "n", label: "Prefiero no decirlo" },
];
/** Persona ya armada según la opción elegida; se puede cambiar todo después. */
export function presetConfig(sex) {
  const base = defaultConfig("p");
  if (sex === "m") return { ...base, s: 2, f: 2, h: 2, hc: 1, e: 0, ec: 1, b: 3, n: 0, m: 0, bl: 0, c: 2, cc: 6 };
  if (sex === "n") return { ...base, s: 3, f: 0, h: 3, hc: 2, e: 0, ec: 1, b: 2, n: 2, m: 0, bl: 0, c: 1, cc: 5 };
  return { ...base, s: 2, f: 0, h: 9, hc: 1, e: 4, ec: 1, b: 1, n: 0, m: 0, lp: 2, bl: 1, c: 4, cc: 8, er: 1 };
}
export const presetAvatar = (sex) => encodeCharacter(presetConfig(sex));

export const DEFAULT_AVATAR = encodeCharacter(defaultConfig("p"));

/* ---------- Piezas de dibujo comunes ---------- */
function eyeArt(style, x, y, s, ec, lid, mirror) {
  const r = 3.1 * s;
  const dot = `<circle cx="${x}" cy="${y}" r="${r}" fill="${INK}"/><circle cx="${x + r * 0.32}" cy="${y - r * 0.34}" r="${r * 0.32}" fill="#fff"/>`;
  const natural = `<ellipse cx="${x}" cy="${y}" rx="${3.7 * s}" ry="${3.2 * s}" fill="#fff"/><circle cx="${x}" cy="${y}" r="${2.3 * s}" fill="${ec}"/><circle cx="${x}" cy="${y}" r="${1.05 * s}" fill="${INK}"/><circle cx="${x + 0.9 * s}" cy="${y - 0.9 * s}" r="${0.7 * s}" fill="#fff"/>`;
  if (style === 1) return dot;
  if (style === 2) return `<path d="M${x - 3.7 * s} ${y + 1.2 * s} Q${x} ${y - 4.6 * s} ${x + 3.7 * s} ${y + 1.2 * s}" fill="none" stroke="${INK}" stroke-width="${2.3 * Math.min(s, 1.4)}" stroke-linecap="round"/>`;
  if (style === 3) return `${natural}<path d="M${x - 4.4 * s} ${y - 3.6 * s} H${x + 4.4 * s} V${y - 0.3 * s} H${x - 4.4 * s}Z" fill="${lid}"/><path d="M${x - 4 * s} ${y - 0.3 * s} H${x + 4 * s}" stroke="${INK}" stroke-width="1.6" stroke-linecap="round"/>`;
  if (style === 4) {
    const d = mirror ? 1 : -1; // lado exterior del ojo
    const ox = x + d * 3.5 * s, oy = y - 1.3 * s;
    return `${natural}<path d="M${x - 3.9 * s} ${y - 2.3 * s} Q${x} ${y - 4.8 * s} ${x + 3.9 * s} ${y - 2.3 * s}" fill="none" stroke="${INK}" stroke-width="1.5" stroke-linecap="round"/><path d="M${ox} ${oy} l${d * 2.5} -1.5 M${ox + d * 0.3} ${oy + 1.5} l${d * 2.9} -0.3 M${ox - d * 0.7} ${oy - 1.3} l${d * 1.7} -2.1" fill="none" stroke="${INK}" stroke-width="1.1" stroke-linecap="round"/>`;
  }
  return natural;
}

function glassesArt(style, x1, x2, y, s = 1) {
  if (!style) return "";
  const c = "#2b2b2b", r = 6.6 * s, bridge = `<path d="M${x1 + r} ${y} H${x2 - r}" stroke="${c}" stroke-width="1.9"/>`;
  if (style === 1) return `<circle cx="${x1}" cy="${y}" r="${r}" fill="rgba(255,255,255,.18)" stroke="${c}" stroke-width="1.9"/><circle cx="${x2}" cy="${y}" r="${r}" fill="rgba(255,255,255,.18)" stroke="${c}" stroke-width="1.9"/>${bridge}`;
  const box = (x) => `<rect x="${x - r}" y="${y - r * 0.82}" width="${r * 2}" height="${r * 1.64}" rx="${r * 0.4}"`;
  if (style === 2) return `${box(x1)} fill="rgba(255,255,255,.18)" stroke="${c}" stroke-width="1.9"/>${box(x2)} fill="rgba(255,255,255,.18)" stroke="${c}" stroke-width="1.9"/>${bridge}`;
  if (style === 3) return `${box(x1)} fill="#15151b" stroke="${c}" stroke-width="1.6"/>${box(x2)} fill="#15151b" stroke="${c}" stroke-width="1.6"/>${bridge}<path d="M${x1 - r * 0.6} ${y - r * 0.5} l${r * 0.7} -0.2 M${x2 - r * 0.6} ${y - r * 0.5} l${r * 0.7} -0.2" stroke="rgba(255,255,255,.55)" stroke-width="1.2" stroke-linecap="round"/>`;
  const cat = (x, d) => `<path d="M${x - d * r} ${y - r * 0.2} Q${x - d * r * 0.2} ${y - r * 1.05} ${x + d * r * 0.95} ${y - r * 0.55} Q${x + d * r * 0.9} ${y + r * 0.9} ${x - d * r * 0.1} ${y + r * 0.85} Q${x - d * r} ${y + r * 0.7} ${x - d * r} ${y - r * 0.2}Z" fill="rgba(255,255,255,.18)" stroke="${c}" stroke-width="1.9" stroke-linejoin="round"/>`;
  return cat(x1, -1) + cat(x2, 1) + bridge;
}

/* Sombreros: la base queda en y=28 y se desplaza con `dy` hasta la cabeza */
function hatArt(style, color, dy, sx = 1) {
  if (!style) return "";
  const dark = mix(color, "#000000", 0.22), light = mix(color, "#ffffff", 0.4);
  let a = "";
  if (style === 1) a = `<path d="M28 28 Q28 8 50 8 Q72 8 72 28Z" fill="${color}"/><path d="M44 26.5 H85 Q89 26.5 87 31 H44Z" fill="${dark}"/><circle cx="50" cy="8.5" r="2.4" fill="${dark}"/>`;
  else if (style === 2) a = `<path d="M27 29 Q27 6 50 6 Q73 6 73 29Z" fill="${color}"/><rect x="25" y="24" width="50" height="9" rx="4.5" fill="${dark}"/><circle cx="50" cy="5" r="5" fill="${light}"/>`;
  else if (style === 3) a = `<path d="M30 29 L29 11 L40 20 L50 7 L60 20 L71 11 L70 29Z" fill="#F5C542" stroke="#C9962B" stroke-width="1.4" stroke-linejoin="round"/><circle cx="50" cy="22" r="2.6" fill="${color}"/><circle cx="38" cy="24" r="1.8" fill="${color}"/><circle cx="62" cy="24" r="1.8" fill="${color}"/>`;
  else if (style === 4) a = `<path d="M36 30 L50 1 L64 30Z" fill="${color}"/><path d="M41 21 L59 21 M38.6 26 L61.4 26" stroke="${light}" stroke-width="2.6"/><circle cx="50" cy="2" r="3.4" fill="${light}"/>`;
  else if (style === 5) a = `<path d="M32 24 H68 V32 Q50 37 32 32Z" fill="${dark}"/><path d="M50 8 L84 19 L50 30 L16 19Z" fill="${color}" stroke="${dark}" stroke-width="1" stroke-linejoin="round"/><path d="M50 19 L77 21.4 L77 33" fill="none" stroke="#E0A61B" stroke-width="1.6" stroke-linecap="round"/><circle cx="77" cy="35" r="2.6" fill="#E0A61B"/><circle cx="50" cy="19" r="2" fill="#E0A61B"/>`;
  else if (style === 6) a = `<path d="M29 30 Q29 7 50 7 Q71 7 71 30Z" fill="${color}"/><path d="M50 7 V30 M39 9 Q36 20 35 30 M61 9 Q64 20 65 30" fill="none" stroke="${dark}" stroke-width="1.3"/><rect x="24" y="26.5" width="52" height="5.5" rx="2.7" fill="${dark}"/><rect x="43" y="3.5" width="14" height="5.5" rx="2.5" fill="${dark}"/>`;
  else if (style === 7) a = `<ellipse cx="55" cy="24" rx="31" ry="9.6" fill="${color}" transform="rotate(-6 55 24)"/><path d="M28 27 Q30 22 40 22 Q56 20 76 22 Q80 26 76 29 Q52 33 28 27Z" fill="${dark}" opacity=".55"/><circle cx="52" cy="13.6" r="2.3" fill="${dark}"/>`;
  else if (style === 9) a = `<path d="M26 31 Q25 11 44 7 Q64 3 76 19 Q82 27 83 36 Q70 25 58 23 Q42 23 26 31Z" fill="${color}"/><path d="M24 27.5 Q50 19 77 28 L77 34.5 Q50 27 24 34.5Z" fill="#fff"/><circle cx="83" cy="36" r="5.6" fill="#fff"/>`;
  else if (style === 10) a = `<path d="M29 30 Q28 19 42 15 Q56 11 64 1 Q64 15 72 26 L71 31Z" fill="${color}"/><path d="M29 28 Q50 20 71 28 L71 32 Q50 26 29 32Z" fill="${light}"/><path d="M42 15 L44.6 25 M54 12 L55.6 22" stroke="${dark}" stroke-width="1.4"/><circle cx="64" cy="1.4" r="3.4" fill="#F5C542" stroke="#C9962B" stroke-width=".8"/>`;
  else if (style === 11) a = `<path d="M27 27 Q50 15 73 27" fill="none" stroke="#5A3A2A" stroke-width="3.6" stroke-linecap="round"/><g fill="none" stroke="#8B5A2B" stroke-width="3" stroke-linecap="round"><path d="M33 21 L28 7 M28 7 L22 5 M30.6 13 L24 13.6"/><path d="M67 21 L72 7 M72 7 L78 5 M69.4 13 L76 13.6"/></g><circle cx="50" cy="18" r="2.2" fill="#E5484D"/>`;
  else if (style === 12) a = `<path d="M26 33 Q50 3 74 33" fill="none" stroke="#2F8F4E" stroke-width="6" stroke-linecap="round"/><g fill="#2F8F4E" stroke="#1d6b36" stroke-width=".6"><ellipse cx="32" cy="22" rx="5" ry="2.4" transform="rotate(-50 32 22)"/><ellipse cx="68" cy="22" rx="5" ry="2.4" transform="rotate(50 68 22)"/><ellipse cx="42" cy="12" rx="5" ry="2.4" transform="rotate(-22 42 12)"/><ellipse cx="58" cy="12" rx="5" ry="2.4" transform="rotate(22 58 12)"/></g><circle cx="37" cy="18" r="2.2" fill="#E5484D"/><circle cx="50" cy="11" r="2.4" fill="#E5484D"/><circle cx="63" cy="18" r="2.2" fill="#E5484D"/><path d="M50 7 L50 11" stroke="#fff" stroke-width=".5"/>`;
  else if (style === 13) a = `<path d="M33 28 Q32 8 50 9 Q68 8 67 28Z" fill="${color}"/><path d="M33 22 Q50 17 67 22 L67 26 Q50 21 33 26Z" fill="${dark}"/><path d="M16 27 Q28 33 50 32 Q72 33 84 27 Q88 22 80 24 Q66 27 50 27 Q34 27 20 24 Q12 22 16 27Z" fill="${mix(color, "#000000", 0.12)}" stroke="${dark}" stroke-width="1" stroke-linejoin="round"/>`;
  else if (style === 14) a = `<rect x="34" y="-1" width="32" height="29" rx="3" fill="#1d1d22"/><rect x="34" y="19" width="32" height="5.4" fill="${color}"/><ellipse cx="50" cy="28.4" rx="31" ry="6" fill="#26262c"/><path d="M38 3 V16" stroke="#fff" stroke-width="1.2" opacity=".18" stroke-linecap="round"/>`;
  else if (style === 15) a = `<path d="M33 27 Q33 11 50 11 Q67 11 67 27Z" fill="${mix(color, "#ffffff", 0.5)}"/><path d="M33 22 Q50 17.4 67 22 L67 26 Q50 21.4 33 26Z" fill="${color}"/><ellipse cx="50" cy="28" rx="41" ry="8.6" fill="${mix(color, "#ffffff", 0.62)}" stroke="${mix(color, "#000000", 0.1)}" stroke-width="1"/><path d="M12 28 Q50 36 88 28" fill="none" stroke="${color}" stroke-width="1.2" opacity=".5"/>`;
  else a = `<path d="M28 34 Q28 12 50 12 Q72 12 72 34" fill="none" stroke="${color}" stroke-width="5.2" stroke-linecap="round"/><path d="M31 33 Q31 16 50 15" fill="none" stroke="${light}" stroke-width="1.4" stroke-linecap="round" opacity=".7"/>`;
  return `<g transform="translate(50 ${dy}) scale(${sx} 1) translate(-50 0)">${a}</g>`;
}


/* =====================================================================
   Artículos EXCLUSIVOS del equipo (dueño y moderadores). El servidor no deja guardarlos a nadie más.
   xh corona/casco · xg visor/antifaz · xb prenda · xw alas · xa aura
   ===================================================================== */
const GOLD = "#F5C542", GOLD_D = "#B8860B", GOLD_L = "#FFE9A8";
function exclusiveBack(c, g) {
  let o = "";
  if (c.xa === 1) o += `<defs><radialGradient id="${g}xa" cx=".5" cy=".5" r=".5"><stop offset=".45" stop-color="${GOLD}" stop-opacity=".55"/><stop offset="1" stop-color="${GOLD}" stop-opacity="0"/></radialGradient></defs><circle cx="50" cy="56" r="56" fill="url(#${g}xa)"/><g fill="#FFF3B8"><circle cx="14" cy="34" r="1.6"/><circle cx="88" cy="26" r="1.4"/><circle cx="8" cy="70" r="1.2"/><circle cx="92" cy="64" r="1.7"/><circle cx="24" cy="12" r="1.2"/><circle cx="78" cy="10" r="1.4"/></g>`;
  if (c.xa === 2) o += `<defs><radialGradient id="${g}xa" cx=".5" cy=".5" r=".5"><stop offset=".4" stop-color="#C026D3" stop-opacity=".6"/><stop offset=".75" stop-color="#7C3AED" stop-opacity=".3"/><stop offset="1" stop-color="#7C3AED" stop-opacity="0"/></radialGradient></defs><circle cx="50" cy="56" r="58" fill="url(#${g}xa)"/><g fill="#F0ABFC"><circle cx="12" cy="40" r="1.5"/><circle cx="90" cy="30" r="1.6"/><circle cx="6" cy="76" r="1.2"/><circle cx="94" cy="68" r="1.4"/><circle cx="20" cy="14" r="1.3"/></g>`;
  if (c.xw === 1) { // alas de ángel
    const w = `<path d="M36 82 Q4 82 1 48 Q12 56 20 52 Q8 44 11 26 Q24 42 32 56 Q38 68 36 82Z" fill="#fff" stroke="#CBD5E1" stroke-width="1"/><path d="M33 76 Q14 74 8 52 M34 66 Q22 60 17 42" fill="none" stroke="#E2E8F0" stroke-width="1"/>`;
    o += `<g>${w}<g transform="translate(100 0) scale(-1 1)">${w}</g></g>`;
  }
  if (c.xw === 2) { // alas de dragón
    const w = `<path d="M36 82 L2 56 L12 56 L3 40 L16 48 L11 28 L26 46 L36 60Z" fill="#8B1E2D" stroke="#3D0F16" stroke-width="1" stroke-linejoin="round"/><path d="M36 80 L12 56 M36 72 L16 48 M36 66 L26 46" stroke="#E5484D" stroke-width="1" fill="none" opacity=".7"/>`;
    o += `<g>${w}<g transform="translate(100 0) scale(-1 1)">${w}</g></g>`;
  }
  if (c.xb === 1) o += `<path d="M30 79 Q6 84 1 100 L99 100 Q94 84 70 79Z" fill="#6D28D9" stroke="${GOLD}" stroke-width="1.6" stroke-linejoin="round"/><path d="M12 100 Q18 90 28 86 M88 100 Q82 90 72 86" stroke="#A78BFA" stroke-width="1" fill="none" opacity=".7"/>`;
  return o;
}
function exclusiveFront(c, g) {
  let o = "";
  if (c.xb === 2) o += `<path d="M10 100 Q8 86 22 80 Q34 78 38 84 L36 100Z M90 100 Q92 86 78 80 Q66 78 62 84 L64 100Z" fill="#9AA3AD" stroke="#4A5568" stroke-width="1" stroke-linejoin="round"/><g fill="${GOLD}" stroke="${GOLD_D}" stroke-width=".6"><circle cx="22" cy="88" r="2"/><circle cx="78" cy="88" r="2"/></g><path d="M14 96 Q22 84 34 84 M86 96 Q78 84 66 84" stroke="#E2E8F0" stroke-width="1" fill="none" opacity=".8"/>`;
  if (c.xb === 3) o += `<path d="M36 76 Q50 94 64 76" fill="none" stroke="${GOLD}" stroke-width="2.6" stroke-linecap="round"/><path d="M36 76 Q50 94 64 76" fill="none" stroke="${GOLD_L}" stroke-width=".8" stroke-dasharray="1.4 2.2"/><path d="M50 91 L46.4 96 L50 102 L53.6 96Z" fill="#E5484D" stroke="${GOLD_D}" stroke-width=".9"/>`;
  if (c.xg === 1) o += `<rect x="27" y="43.6" width="46" height="12" rx="6" fill="#0B1B2E" stroke="#2EE6C5" stroke-width="1.6"/><rect x="30" y="46" width="40" height="7.2" rx="3.6" fill="url(#${g}vz)"/><defs><linearGradient id="${g}vz" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#2EE6C5" stop-opacity=".95"/><stop offset=".5" stop-color="#7DF9FF" stop-opacity=".75"/><stop offset="1" stop-color="#C026D3" stop-opacity=".9"/></linearGradient></defs><path d="M33 47.4 H50" stroke="#fff" stroke-width="1" opacity=".7" stroke-linecap="round"/><path d="M27 49.6 L21 47 M73 49.6 L79 47" stroke="#2EE6C5" stroke-width="1.6" stroke-linecap="round"/>`;
  if (c.xg === 2) o += `<path fill-rule="evenodd" d="M26 47 Q33 40 41 45.4 L50 44 L59 45.4 Q67 40 74 47 Q73 57 62 55.6 Q55 54.6 50 51 Q45 54.6 38 55.6 Q27 57 26 47Z M33.6 49.4 a5.2 3.6 0 1 0 10.4 0 a5.2 3.6 0 1 0 -10.4 0Z M56 49.4 a5.2 3.6 0 1 0 10.4 0 a5.2 3.6 0 1 0 -10.4 0Z" fill="${GOLD}" stroke="${GOLD_D}" stroke-width="1"/><circle cx="50" cy="46.6" r="1.6" fill="#E5484D"/><path d="M27 46 Q22 42 18 44 M73 46 Q78 42 82 44" stroke="${GOLD}" stroke-width="1.4" fill="none" stroke-linecap="round"/>`;
  if (c.xg === 3) o += `<circle cx="59" cy="50" r="7.8" fill="rgba(255,255,255,.14)" stroke="${GOLD}" stroke-width="2"/><circle cx="59" cy="50" r="9.2" fill="none" stroke="${GOLD_D}" stroke-width=".7" opacity=".7"/><path d="M66 55 Q74 68 66 84" fill="none" stroke="${GOLD}" stroke-width="1.2" stroke-dasharray="2 1.4"/><path d="M55 46 Q58 44 61 45" stroke="#fff" stroke-width="1.1" fill="none" opacity=".8" stroke-linecap="round"/>`;
  if (c.xh === 1) o += `<path d="M27 31 L24 7 L38 20 L50 2 L62 20 L76 7 L73 31Z" fill="${GOLD}" stroke="${GOLD_D}" stroke-width="1.3" stroke-linejoin="round"/><rect x="27" y="27" width="46" height="5" rx="2" fill="${GOLD_D}"/><path d="M30 29.5 H70" stroke="${GOLD_L}" stroke-width=".9"/><circle cx="50" cy="21" r="3" fill="#E5484D" stroke="#fff" stroke-width=".6"/><circle cx="38" cy="25" r="2" fill="#4F9FEF" stroke="#fff" stroke-width=".5"/><circle cx="62" cy="25" r="2" fill="#4F9FEF" stroke="#fff" stroke-width=".5"/><circle cx="50" cy="3" r="2" fill="#fff"/><circle cx="24" cy="7" r="1.8" fill="#fff"/><circle cx="76" cy="7" r="1.8" fill="#fff"/>`;
  if (c.xh === 2) o += `<ellipse cx="50" cy="12" rx="22" ry="5.6" fill="none" stroke="#FFF3B8" stroke-width="7" opacity=".28"/><ellipse cx="50" cy="12" rx="22" ry="5.6" fill="none" stroke="${GOLD_L}" stroke-width="3.2"/><ellipse cx="50" cy="12" rx="22" ry="5.6" fill="none" stroke="#fff" stroke-width="1" opacity=".9"/>`;
  if (c.xh === 3) o += `<path d="M26 42 Q23 8 50 7 Q77 8 74 42 L67 42 L67 30 Q50 24 33 30 L33 42Z" fill="#C9962B" stroke="#7a5410" stroke-width="1.3" stroke-linejoin="round"/><path d="M30 14 Q50 -10 70 14 Q50 4 30 14Z" fill="#C0392B" stroke="#7a1f16" stroke-width=".8"/><path d="M34 20 Q50 14 66 20" fill="none" stroke="#F5D98A" stroke-width="1.2"/><path d="M33 34 V42 M67 34 V42" stroke="#7a5410" stroke-width="1"/>`;
  if (c.xh === 4) o += `<g fill="${GOLD}" stroke="${GOLD_D}" stroke-width=".6"><ellipse cx="28" cy="34" rx="5.4" ry="2.4" transform="rotate(-62 28 34)"/><ellipse cx="25" cy="26" rx="5.4" ry="2.4" transform="rotate(-80 25 26)"/><ellipse cx="27" cy="18" rx="5.4" ry="2.4" transform="rotate(-100 27 18)"/><ellipse cx="33" cy="11.6" rx="5.4" ry="2.4" transform="rotate(-125 33 11.6)"/><ellipse cx="72" cy="34" rx="5.4" ry="2.4" transform="rotate(62 72 34)"/><ellipse cx="75" cy="26" rx="5.4" ry="2.4" transform="rotate(80 75 26)"/><ellipse cx="73" cy="18" rx="5.4" ry="2.4" transform="rotate(100 73 18)"/><ellipse cx="67" cy="11.6" rx="5.4" ry="2.4" transform="rotate(125 67 11.6)"/></g><path d="M30 38 Q22 22 34 9 M70 38 Q78 22 66 9" fill="none" stroke="${GOLD_D}" stroke-width="1" opacity=".7"/>`;
  if (c.xh === 5) o += `<g fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M30 29 L33 5 L47 22" stroke="#2EE6C5" stroke-width="2.6"/><path d="M70 29 L67 5 L53 22" stroke="#F27BB0" stroke-width="2.6"/><path d="M34 22 L35 11 L42 20" stroke="#7DF9FF" stroke-width="1.2" opacity=".9"/><path d="M66 22 L65 11 L58 20" stroke="#FFC2DD" stroke-width="1.2" opacity=".9"/><path d="M28 29 Q50 14 72 29" stroke="#C026D3" stroke-width="2.4"/></g><g fill="#fff"><circle cx="33" cy="5" r="1.3"/><circle cx="67" cy="5" r="1.3"/></g>`;
  return o;
}

/* ---------- Persona ---------- */
const FACE_OVAL = "M28 44 Q28 25 50 25 Q72 25 72 44 Q72 60 63 69 Q57 76 50 76 Q43 76 37 69 Q28 60 28 44Z";
const FACE_SQUARE = "M27 38 Q27 25 50 25 Q73 25 73 38 L73 60 Q73 70 66 74 Q58 77 50 77 Q42 77 34 74 Q27 70 27 60Z";
const longBack = (c) => `<path d="M25 52 Q19 88 31 97 L69 97 Q81 88 75 52 Q76 22 50 22 Q24 22 25 52Z" fill="${c}"/>`;
const bobBack = (c) => `<path d="M25 48 Q22 74 33 77 L67 77 Q78 74 75 48 Q76 22 50 22 Q24 22 25 48Z" fill="${c}"/>`;
/* Líneas del nacimiento del pelo: región (por encima) donde el pelo cubre la cabeza.
   El gorro de pelo es la forma de la cabeza agrandada y recortada con esa región,
   así se ajusta sola a la cara ovalada, redonda o cuadrada. */
const HAIRLINE = {
  short: "M-10 -10H110V46H73Q71 33 60 31Q50 29.5 40 31Q29 33 27 46H-10Z",
  swept: "M-10 -10H110V46H73Q66 33 54 31Q40 36 27 46H-10Z",
  buzz: "M-10 -10H110V44H72Q68 35.5 50 34.5Q32 35.5 28 44H-10Z",
  bob: "M-10 -10H110V46H73V41Q50 32 27 41V46H-10Z",
  afro: "M-10 -10H110V46H73Q67 37 50 35Q33 37 27 46H-10Z",
  buns: "M-10 -10H110V46H74Q68 34 50 32.5Q32 34 26 46H-10Z",
};

/** [pelo detrás de la cabeza, pelo delante]. `cap(region, sx, sy, opacidad)` dibuja el gorro de pelo. */
function hairArt(style, c, cap) {
  switch (style) {
    case 1: return ["", cap(HAIRLINE.buzz, 1.03, 1.05, 0.85)];
    case 2: return ["", cap(HAIRLINE.short)];
    case 3: return ["", cap(HAIRLINE.swept)];
    case 4: return ["", cap(HAIRLINE.buns) + `<g fill="${c}"><circle cx="31" cy="36" r="9"/><circle cx="42" cy="27" r="10"/><circle cx="55" cy="26" r="10"/><circle cx="67" cy="32" r="9"/><circle cx="72" cy="44" r="6"/><circle cx="28" cy="45" r="6"/></g>`];
    case 5: return [`<circle cx="50" cy="38" r="28" fill="${c}"/>`, cap(HAIRLINE.afro, 1.1, 1.14)];
    case 6: return [`<circle cx="50" cy="15" r="9" fill="${c}"/>`, cap(HAIRLINE.short)];
    case 7: return [`<path d="M68 31 C95 29 96 64 82 80 C81 67 75 58 69 52Z" fill="${c}"/>`, cap(HAIRLINE.swept)];
    case 8: return [bobBack(c), cap(HAIRLINE.bob)];
    case 9: return [longBack(c), cap(HAIRLINE.swept)];
    case 10: return ["", `<path d="M29 38 L26 22 L36 30 L38 13 L46 28 L52 8 L58 28 L65 13 L68 30 L78 22 L72 38Z" fill="${c}"/>` + cap(HAIRLINE.short)];
    case 11: return [`<circle cx="24" cy="36" r="13" fill="${c}"/><circle cx="76" cy="36" r="13" fill="${c}"/>`, cap(HAIRLINE.buns)];
    default: return ["", ""];
  }
}

/* Ropa: 18 estilos. La silueta común es el busto; cada estilo añade cuello, solapas, botones, bolsillos…
   Devuelve { art, noNeck }: noNeck = true cuando la prenda ya dibuja la piel/cuello (escote, cuello alto, etc.). */
const BODY = "M12 100 Q15 79 50 77 Q85 79 88 100Z";
function clothesArt(style, color, skin, shade, gid) {
  const dark = mix(color, "#000000", 0.22);
  const darker = mix(color, "#000000", 0.4);
  const light = mix(color, "#ffffff", 0.35);
  const line = (d, c = dark, w = 1.2, extra = "") => `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" ${extra}/>`;
  const dot = (x, y, r = 1, c = "#fff") => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}" stroke="rgba(0,0,0,.25)" stroke-width=".3"/>`;
  const clip = (inner) => `<clipPath id="${gid}b"><path d="${BODY}"/></clipPath><g clip-path="url(#${gid}b)">${inner}</g>`;
  const sleeves = (c = dark) => line("M19 100 Q21 88 29 82", c, 1, 'opacity=".5"') + line("M81 100 Q79 88 71 82", c, 1, 'opacity=".5"');
  // volumen: la mitad izquierda un poco más oscura
  const shadeHalf = `<path d="M12 100 Q15 79 50 77 L50 100Z" fill="#000" opacity=".06"/>`;
  const crewHole = `<path d="M40.8 77.3 Q50 89.5 59.2 77.3Z" fill="${shade}"/>` + line("M40.2 77.2 Q50 90.6 59.8 77.2", dark, 2.1);
  let art = "", noNeck = false;
  switch (style) {
    case 1: // sudadera con capucha
      art = `<path d="${BODY}" fill="${color}"/><path d="M27 83 Q25 70 50 69.5 Q75 70 73 83 Q62 89.5 50 89.5 Q38 89.5 27 83Z" fill="${dark}"/><path d="M39 77.2 Q50 87.6 61 77.2 Q50 73.4 39 77.2Z" fill="${shade}"/>` +
        line("M45 87 V96.5", "#fff", 1.5) + line("M55 87 V96.5", "#fff", 1.5) + dot(45, 97.2, 1.2) + dot(55, 97.2, 1.2) +
        line("M31 100 L35 93 H65 L69 100", darker, 1.2, 'opacity=".55"') + sleeves();
      noNeck = true; break;
    case 2: // camisa con botones
      art = `<path d="${BODY}" fill="${color}"/>` +
        `<path d="M39.6 77 Q50 74.6 60.4 77 L50 91Z" fill="${shade}"/>` +
        `<path d="M39 76.6 L50 91.2 L43.6 76Z M61 76.6 L50 91.2 L56.4 76Z" fill="#fff" stroke="rgba(0,0,0,.22)" stroke-width=".8" stroke-linejoin="round"/>` +
        line("M50 91.5 V100", darker, 1.2, 'opacity=".55"') + dot(50, 94.4, .95) + dot(50, 98.3, .95) +
        `<rect x="60.5" y="88" width="9" height="8" rx="1.2" fill="none" stroke="${darker}" stroke-width=".9" opacity=".6"/>` + sleeves();
      break;
    case 3: // traje con corbata
      art = `<path d="${BODY}" fill="${mix(color, "#000000", 0.38)}"/>` +
        `<path d="M41 77.4 L50 100 L59 77.4Z" fill="#fff"/><path d="M48.2 83 H51.8 L53.4 100 H46.6Z" fill="#C0392B"/><path d="M47.6 80.2 H52.4 L51.8 83.6 H48.2Z" fill="#A8301F"/>` +
        `<path d="M40 77.2 L35 85 L47 100 L44 88Z M60 77.2 L65 85 L53 100 L56 88Z" fill="${mix(color, "#000000", 0.5)}" stroke="rgba(255,255,255,.12)" stroke-width=".6" stroke-linejoin="round"/>` +
        `<path d="M64.5 87 L69 86.2 L68.4 90Z" fill="#fff" opacity=".9"/>` + dot(47, 96, .8, "#555") + shadeHalf;
      break;
    case 4: // cuello en V
      art = `<path d="${BODY}" fill="${color}"/><path d="M41.6 77.3 L50 92 L58.4 77.3Z" fill="${skin}"/>` + line("M40.6 77.2 L50 93.3 L59.4 77.2", dark, 2) + sleeves() + line("M30 99.2 H70", dark, 1, 'opacity=".4"');
      noNeck = true; break;
    case 5: // vestido con tirantes y escote corazón
      art = `<path d="${BODY}" fill="${skin}"/>` +
        `<path d="M30 78 Q50 88 70 78" fill="none" stroke="${shade}" stroke-width="1" opacity=".35"/>` +
        `<path d="M24 100 L26 90.4 Q30 86.6 37 87.6 Q44 88.8 50 94.4 Q56 88.8 63 87.6 Q70 86.6 74 90.4 L76 100Z" fill="${color}"/>` +
        line("M34.4 87.4 Q33.4 81 37.6 78.4", color, 3.4) + line("M65.6 87.4 Q66.6 81 62.4 78.4", color, 3.4) +
        line("M24.8 96 H75.2", dark, 1.6, 'opacity=".55"') + `<path d="M46 94.4 Q50 98 54 94.4" fill="none" stroke="${dark}" stroke-width="1" opacity=".5"/>`;
      noNeck = true; break;
    case 6: // polo
      art = `<path d="${BODY}" fill="${color}"/><path d="M44.4 77.3 L50 85.4 L55.6 77.3Z" fill="${shade}"/>` +
        `<path d="M38.4 77.6 L46.2 76.8 L50 86.4 L41.2 84.4Z M61.6 77.6 L53.8 76.8 L50 86.4 L58.8 84.4Z" fill="${light}" stroke="${dark}" stroke-width=".8" stroke-linejoin="round"/>` +
        line("M50 86.4 V97", dark, 1, 'opacity=".6"') + dot(50, 89.6, .9) + dot(50, 93.6, .9) + sleeves();
      break;
    case 7: // bata de laboratorio
      art = `<path d="${BODY}" fill="#F3F6F9"/><path d="M42.4 77.4 L50 95.5 L57.6 77.4Z" fill="${color}"/>` +
        `<path d="M39.6 77 L47.6 96.8 L50.4 96 L43 77Z M60.4 77 L52.4 96.8 L49.6 96 L57 77Z" fill="#fff" stroke="#C9D1D9" stroke-width=".8" stroke-linejoin="round"/>` +
        line("M50 96 V100", "#C9D1D9", 1) + `<rect x="60.4" y="88.6" width="10" height="8.6" rx="1.2" fill="#fff" stroke="#C9D1D9" stroke-width=".9"/>` +
        line("M63.4 88.6 V85.6", "#2f6fb0", 1.3) + line("M66.2 88.6 V86.4", "#C0392B", 1.3) + line("M26 100 Q28 90 33 85", "#C9D1D9", .9) +
        line("M35.5 79.5 Q33 93.5 43.5 96.2 Q50 97.4 50 93.4", "#4a4a52", 1.3) + `<circle cx="50" cy="94.2" r="1.7" fill="#9aa3ad" stroke="#4a4a52" stroke-width=".7"/>` + shadeHalf;
      break;
    case 8: { // toga de graduación con estola
      const gown = mix(color, "#000000", 0.62), stole = mix(color, "#ffffff", 0.12);
      art = `<path d="${BODY}" fill="${gown}"/><path d="M43.4 77.4 L50 86.6 L56.6 77.4Z" fill="#fff"/>` +
        `<path d="M39.4 77.2 L36.2 100 H45 L46.4 82Z M60.6 77.2 L63.8 100 H55 L53.6 82Z" fill="${stole}" stroke="#E0A61B" stroke-width="1" stroke-linejoin="round"/>` +
        line("M37.2 92 H44.6 M55.4 92 H62.8", "#E0A61B", 1.2) + line("M36.6 96.6 H44.8 M55.2 96.6 H63.4", "#E0A61B", 1.2) +
        line("M20 100 Q22 88 29 82 M80 100 Q78 88 71 82", "#fff", 1, 'opacity=".25"');
      break; }
    case 9: // chaleco sobre camisa
      art = `<path d="${BODY}" fill="#F4F6F8"/><path d="M39.6 77 L46 84 L50 79 L54 84 L60.4 77 Q50 74.6 39.6 77Z" fill="#fff" stroke="rgba(0,0,0,.18)" stroke-width=".7" stroke-linejoin="round"/>` +
        `<path d="M26 100 Q26.4 87 36.6 80 L50 96 L63.4 80 Q73.6 87 74 100Z" fill="${color}" stroke="${dark}" stroke-width=".9" stroke-linejoin="round"/>` +
        dot(50, 97.8, .8, dark) + line("M37.6 80.6 L50 96 L62.4 80.6", dark, 1.3) + `<path d="M44.5 77.3 L50 84 L55.5 77.3Z" fill="${shade}" opacity=".9"/>` + shadeHalf;
      break;
    case 10: // cuello alto
      art = `<path d="${BODY}" fill="${color}"/><rect x="39.6" y="69" width="20.8" height="12" rx="5.4" fill="${dark}"/>` +
        line("M41 74 H59", darker, .9, 'opacity=".5"') + line("M41 77.4 H59", darker, .9, 'opacity=".5"') + sleeves() + line("M30 99.2 H70", dark, 1, 'opacity=".4"');
      noNeck = true; break;
    case 11: { // camiseta de rayas
      let st = ""; for (let i = 0; i < 6; i++) st += `<rect x="0" y="${79 + i * 6}" width="100" height="3" fill="#fff" opacity=".78"/>`;
      art = `<path d="${BODY}" fill="${color}"/>${clip(st)}` + crewHole + sleeves();
      break; }
    case 12: // chaqueta deportiva
      art = `<path d="${BODY}" fill="${color}"/><path d="M44.5 77.3 L50 85 L55.5 77.3Z" fill="${shade}"/>` +
        `<path d="M38.4 77.4 L40.2 70.8 L46.6 78.4 L50 84 L50 99 L47.4 99 L44 82Z M61.6 77.4 L59.8 70.8 L53.4 78.4 L50 84 L50 99 L52.6 99 L56 82Z" fill="${dark}" stroke="rgba(0,0,0,.15)" stroke-width=".6" stroke-linejoin="round"/>` +
        line("M50 84.4 V100", "#fff", 1.2) + `<rect x="49" y="86.4" width="2" height="3.4" rx=".8" fill="#fff"/>` +
        line("M16 100 Q17.5 90 24 84", "#fff", 2.3) + line("M84 100 Q82.5 90 76 84", "#fff", 2.3) + shadeHalf;
      break;
    case 13: { // overol sobre camiseta
      const shirt = mix(color, "#ffffff", 0.82);
      art = `<path d="${BODY}" fill="${shirt}"/>` + `<path d="M40.8 77.3 Q50 87.5 59.2 77.3Z" fill="${shade}"/>` + line("M40.2 77.2 Q50 88.4 59.8 77.2", mix(shirt, "#000000", .15), 1.8) +
        `<path d="M32 100 L35.4 87.6 H64.6 L68 100Z" fill="${color}"/>` +
        line("M37.8 88 L36.2 77.8", color, 4.4) + line("M62.2 88 L63.8 77.8", color, 4.4) +
        dot(37.8, 87.4, 1.2, "#E8B04A") + dot(62.2, 87.4, 1.2, "#E8B04A") +
        `<rect x="43.4" y="91.6" width="13.2" height="7" rx="1.2" fill="none" stroke="${light}" stroke-width=".9" stroke-dasharray="2 1.2"/>` +
        line("M35 90 L33.8 98", light, .8, 'stroke-dasharray="2 1.2"') + line("M65 90 L66.2 98", light, .8, 'stroke-dasharray="2 1.2"');
      noNeck = true; break; }
    case 14: // blusa con moño
      art = `<path d="${BODY}" fill="${color}"/><path d="M44 77.3 L50 82.6 L56 77.3Z" fill="${shade}"/>` +
        `<path d="M50 83 L40.6 78.4 Q38.6 82.4 40.6 87.2Z M50 83 L59.4 78.4 Q61.4 82.4 59.4 87.2Z" fill="${dark}" stroke="${darker}" stroke-width=".6" stroke-linejoin="round"/>` +
        `<path d="M48.6 84.4 L45.2 95 L49.6 91.6Z M51.4 84.4 L54.8 95 L50.4 91.6Z" fill="${dark}" stroke="${darker}" stroke-width=".5" stroke-linejoin="round"/>` +
        `<circle cx="50" cy="83" r="2.5" fill="${light}" stroke="${darker}" stroke-width=".6"/>` + sleeves();
      break;
    case 15: { // camisa de cuadros
      let p = ""; for (let i = 0; i < 10; i++) p += `<rect x="${6 + i * 9}" y="70" width="3.6" height="40" fill="#000" opacity=".22"/>`;
      for (let j = 0; j < 5; j++) p += `<rect x="0" y="${79 + j * 6}" width="100" height="3.2" fill="#fff" opacity=".28"/>`;
      art = `<path d="${BODY}" fill="${color}"/>${clip(p)}<path d="M39.6 77 Q50 74.6 60.4 77 L50 91Z" fill="${shade}"/>` +
        `<path d="M39 76.6 L50 91.2 L43.6 76Z M61 76.6 L50 91.2 L56.4 76Z" fill="${light}" stroke="${dark}" stroke-width=".8" stroke-linejoin="round"/>` +
        line("M50 91.5 V100", darker, 1.1, 'opacity=".6"') + dot(50, 94.4, .95) + dot(50, 98.3, .95) + sleeves();
      break; }
    case 16: // chaqueta de cuero
      art = `<path d="${BODY}" fill="${mix(color, "#000000", 0.66)}"/>` +
        `<path d="M43.4 77.4 L50 100 L56.6 77.4Z" fill="${mix(color, "#ffffff", 0.7)}"/>` +
        `<path d="M38.6 77.4 L47.4 88 L40.6 96.6 L31.4 84Z M61.4 77.4 L52.6 88 L59.4 96.6 L68.6 84Z" fill="${mix(color, "#000000", 0.5)}" stroke="rgba(255,255,255,.28)" stroke-width=".9" stroke-linejoin="round"/>` +
        line("M47.4 88 L52.2 100", "#C9D1D9", 1.2) + dot(40.2, 89.6, .9, "#C9D1D9") + dot(59.8, 89.6, .9, "#C9D1D9") +
        line("M24 100 Q26 91 31 86", "rgba(255,255,255,.22)", 1) + shadeHalf;
      break;
    case 17: // camiseta sin mangas
      art = `<path d="${BODY}" fill="${skin}"/><path d="M28 78.8 Q50 90 72 78.8" fill="none" stroke="${shade}" stroke-width="1" opacity=".3"/>` +
        `<path d="M29.4 100 L32 89 Q35 80.6 40.6 77.8 Q50 90.4 59.4 77.8 Q65 80.6 68 89 L70.6 100Z" fill="${color}"/>` +
        line("M40.6 77.8 Q50 90.8 59.4 77.8", dark, 1.6) + line("M30.2 96.4 H69.8", dark, 1, 'opacity=".45"');
      noNeck = true; break;
    case 18: { // suéter tejido
      let rib = ""; for (let i = 0; i < 18; i++) rib += `<rect x="${10 + i * 4.6}" y="78" width="1.3" height="30" fill="#000" opacity=".16"/>`;
      art = `<path d="${BODY}" fill="${color}"/>${clip(rib + `<rect x="0" y="94.4" width="100" height="8" fill="${dark}"/><path d="M44 84 q-3 4 0 8 q3 4 0 8 M50 84 q-3 4 0 8 q3 4 0 8 M56 84 q-3 4 0 8 q3 4 0 8" stroke="${light}" stroke-width="1.5" fill="none" opacity=".65"/>`)}` + crewHole + sleeves() + shadeHalf;
      break; }
    case 19: // abrigo largo con botones
      art = `<path d="${BODY}" fill="${mix(color, "#000000", 0.28)}"/><path d="M41.4 77.4 L50 100 L58.6 77.4Z" fill="${shade}"/>` +
        `<path d="M39 77 L31 84 L46 100 L50 88Z M61 77 L69 84 L54 100 L50 88Z" fill="${mix(color, "#000000", 0.4)}" stroke="rgba(255,255,255,.16)" stroke-width=".7" stroke-linejoin="round"/>` +
        dot(46.6, 92, 1.5, "#2b2b2b") + dot(46.6, 97.4, 1.5, "#2b2b2b") + dot(53.4, 92, 1.5, "#2b2b2b") + line("M70 100 Q74 90 70.6 82", "rgba(255,255,255,.2)", 1) + shadeHalf;
      break;
    case 20: { // camisa hawaiana
      let fl = ""; [[24, 88, 5], [46, 96, 6], [68, 86, 5.4], [84, 97, 4.4], [34, 80, 3.4], [58, 82, 3.6]].forEach(([x, y, r], i) => {
        const pc = ["#FF5C8A", "#FFE066", "#FF9F45", "#fff"][i % 4];
        for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; fl += `<circle cx="${(x + Math.cos(a) * r * .8).toFixed(1)}" cy="${(y + Math.sin(a) * r * .8).toFixed(1)}" r="${(r * .52).toFixed(1)}" fill="${pc}"/>`; }
        fl += `<circle cx="${x}" cy="${y}" r="${(r * .4).toFixed(1)}" fill="#C0392B"/><path d="M${x + r} ${y + r * .8} q${r} ${r * .3} ${r * 1.5} ${r * 1.2}" stroke="#2F8F4E" stroke-width="1.6" fill="none"/>`; });
      art = `<path d="${BODY}" fill="${mix(color, "#ffffff", 0.22)}"/>${clip(fl)}<path d="M39.6 77 Q50 74.6 60.4 77 L50 91Z" fill="${shade}"/>` +
        `<path d="M39 76.6 L50 91.2 L43.6 76Z M61 76.6 L50 91.2 L56.4 76Z" fill="${mix(color, "#ffffff", 0.5)}" stroke="${dark}" stroke-width=".8" stroke-linejoin="round"/>` + sleeves();
      break; }
    case 21: // jersey deportivo con número
      art = `<path d="${BODY}" fill="${color}"/><path d="M40.6 77.3 Q50 90 59.4 77.3Z" fill="${shade}"/>` + line("M40 77.2 Q50 91 60 77.2", "#fff", 2.2) +
        line("M16 100 Q17.5 90 24 84", "#fff", 1.8) + line("M84 100 Q82.5 90 76 84", "#fff", 1.8) +
        `<text x="50" y="98" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="15" fill="#fff" stroke="${dark}" stroke-width=".6">10</text>` + shadeHalf;
      noNeck = true; break;
    case 22: // blazer sobre camiseta
      art = `<path d="${BODY}" fill="${mix(color, "#000000", 0.35)}"/><path d="M42 77.4 L50 94 L58 77.4Z" fill="#fff"/>` +
        `<path d="M40 77.2 L33 86 L45.6 100 L47 90Z M60 77.2 L67 86 L54.4 100 L53 90Z" fill="${mix(color, "#000000", 0.48)}" stroke="rgba(255,255,255,.14)" stroke-width=".7" stroke-linejoin="round"/>` +
        `<path d="M62 86 L68 85.6 L67.4 89 L62.6 89.4Z" fill="#fff" opacity=".9"/>` + dot(48, 97.6, 1, "#555") + shadeHalf;
      break;
    case 23: // chaqueta de chef con pañuelo
      art = `<path d="${BODY}" fill="#fff"/><path d="M42 77.6 L50 100 L58 77.6Z" fill="#E8ECEF" stroke="#C9D1D9" stroke-width=".7"/>` +
        `<path d="M36 77.8 Q50 90 64 77.8 L61 84 Q50 93 39 84Z" fill="#E5484D" stroke="#b83036" stroke-width=".7"/>` +
        dot(45, 91.6, 1.4, "#9aa3ad") + dot(45, 97, 1.4, "#9aa3ad") + dot(55, 91.6, 1.4, "#9aa3ad") + dot(55, 97, 1.4, "#9aa3ad") + line("M50 88 V100", "#C9D1D9", 1) + sleeves("#C9D1D9") + shadeHalf;
      break;
    case 24: { // lunares
      let d = ""; for (let r = 0; r < 4; r++) for (let q = 0; q < 8; q++) d += `<circle cx="${9 + q * 12 + (r % 2) * 6}" cy="${81 + r * 7}" r="2.4" fill="#fff" opacity=".85"/>`;
      art = `<path d="${BODY}" fill="${color}"/>${clip(d)}` + crewHole + sleeves() + shadeHalf;
      break; }
    case 25: // uniforme escolar: camisa, suéter en V y corbata
      art = `<path d="${BODY}" fill="#F4F6F8"/><path d="M26 100 Q26 87 38 80 L50 95 L62 80 Q74 87 74 100Z" fill="${color}" stroke="${dark}" stroke-width=".9" stroke-linejoin="round"/>` +
        `<path d="M44.4 77.3 L50 84 L55.6 77.3Z" fill="${shade}"/><path d="M38.6 77.6 L46 83 L50 79 L54 83 L61.4 77.6 Q50 74.6 38.6 77.6Z" fill="#fff" stroke="rgba(0,0,0,.18)" stroke-width=".7"/>` +
        `<path d="M48.6 82 H51.4 L52.6 96 H47.4Z" fill="#C0392B"/>` + line("M47.8 86 H52.2 M47.6 90 H52.4", "#fff", .9) + line("M30 98.4 H70", "#fff", 1.4, 'opacity=".7"') + shadeHalf;
      break;
    case 26: { // poncho con flecos
      let st = ""; ["#F5C542", "#E5484D", "#2FB5B0", "#fff"].forEach((c2, i) => { st += `<rect x="0" y="${82 + i * 5}" width="100" height="2.4" fill="${c2}" opacity=".9"/>`; });
      let fr = ""; for (let i = 0; i < 13; i++) fr += line(`M${14 + i * 6} 100 v3`, "#fff", .9);
      art = `<path d="M8 100 Q14 80 50 76 Q86 80 92 100Z" fill="${color}"/>${`<clipPath id="${gid}p"><path d="M8 100 Q14 80 50 76 Q86 80 92 100Z"/></clipPath><g clip-path="url(#${gid}p)">${st}</g>`}` + fr +
        `<path d="M39 77.4 Q50 86 61 77.4Z" fill="${shade}"/>` + line("M38.6 77.2 Q50 88 61.4 77.2", dark, 2);
      noNeck = true; break; }
    case 27: { // tie-dye
      let rg = ["#FF5C8A", "#FFE066", "#2FB5B0", "#8F78E8"].map((c2, i) => `<circle cx="50" cy="92" r="${34 - i * 8}" fill="none" stroke="${c2}" stroke-width="4.4" opacity=".85"/>`).join("");
      art = `<path d="${BODY}" fill="${mix(color, "#ffffff", 0.55)}"/>${clip(rg)}` + crewHole + sleeves() + shadeHalf;
      break; }
    case 28: { // 🎄 suéter de copos de nieve
      const sf = (x, y, r) => `<g stroke="#fff" stroke-width="1" stroke-linecap="round" opacity=".95"><path d="M${x - r} ${y} H${x + r} M${x} ${y - r} V${y + r} M${x - r * .7} ${y - r * .7} L${x + r * .7} ${y + r * .7} M${x - r * .7} ${y + r * .7} L${x + r * .7} ${y - r * .7}"/></g>`;
      art = `<path d="${BODY}" fill="${color}"/>${clip(`<rect x="0" y="94" width="100" height="8" fill="#fff"/><rect x="0" y="82" width="100" height="2.2" fill="#fff" opacity=".7"/>` + sf(30, 89, 3.6) + sf(50, 91, 4.4) + sf(70, 89, 3.6) + sf(40, 98, 2.4) + sf(62, 98, 2.4) + sf(20, 97, 2.2) + sf(80, 97, 2.2))}` + crewHole + sleeves("#fff") + shadeHalf;
      break; }
    case 29: // 🦌 suéter de reno
      art = `<path d="${BODY}" fill="${color}"/>` + `<g><circle cx="50" cy="91" r="6.4" fill="#8B5A2B"/><path d="M45 86 L41 79 M41 79 L38 80 M43 83 L40 83 M55 86 L59 79 M59 79 L62 80 M57 83 L60 83" stroke="#5A3A2A" stroke-width="1.6" stroke-linecap="round" fill="none"/><circle cx="47.6" cy="89.6" r="1" fill="#1b1b1b"/><circle cx="52.4" cy="89.6" r="1" fill="#1b1b1b"/><circle cx="50" cy="94" r="2.2" fill="#E5484D"/></g>` +
        `<g fill="#fff" opacity=".9"><circle cx="28" cy="88" r="1.2"/><circle cx="72" cy="90" r="1.2"/><circle cx="34" cy="97" r="1"/><circle cx="66" cy="98" r="1"/><circle cx="22" cy="96" r="1"/><circle cx="78" cy="84" r="1"/></g>` + `<rect x="12" y="97.4" width="76" height="3" fill="#fff" opacity=".85"/>` + crewHole + sleeves("#fff") + shadeHalf;
      break;
    case 30: // 🎅 traje de Santa Claus
      art = `<path d="${BODY}" fill="#D7263D"/><rect x="46.4" y="77" width="7.2" height="23" fill="#fff"/>` +
        `<path d="M39 77.4 Q50 90 61 77.4 Q50 74 39 77.4Z" fill="#fff"/><path d="M37 76.6 Q50 92 63 76.6" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round"/>` +
        `<rect x="12" y="92.4" width="76" height="5" fill="#1b1b1b"/><rect x="44.4" y="91.4" width="11.2" height="7" rx="1.2" fill="#F5C542" stroke="#C9962B" stroke-width=".8"/><rect x="47" y="93.4" width="6" height="3" fill="#1b1b1b"/>` +
        line("M19 100 Q21 88 29 82 M81 100 Q79 88 71 82", "#fff", 2.2) + shadeHalf;
      noNeck = true; break;
    case 31: { // 💡 suéter con luces
      const cols = ["#E5484D", "#F5C542", "#2FB5B0", "#4F9FEF", "#F27BB0"];
      let ls = `<path d="M14 86 Q26 96 38 88 Q50 98 62 88 Q74 96 86 86" fill="none" stroke="#1d6b36" stroke-width="1.2"/>`;
      [[20, 92], [32, 93.6], [44, 94.6], [56, 94.6], [68, 93.6], [80, 92]].forEach(([x, y], i) => { ls += `<circle cx="${x}" cy="${y + 2}" r="2.5" fill="${cols[i % 5]}" stroke="rgba(0,0,0,.3)" stroke-width=".4"/><circle cx="${x - .7}" cy="${y + 1.3}" r=".7" fill="#fff" opacity=".8"/>`; });
      art = `<path d="${BODY}" fill="${color}"/>${clip(ls)}` + crewHole + sleeves() + shadeHalf;
      break; }
    case 32: { // 🎁 pijama navideña a cuadros
      let pl = ""; for (let i = 0; i < 10; i++) pl += `<rect x="${4 + i * 10}" y="70" width="4.4" height="40" fill="#fff" opacity=".28"/>`; for (let j = 0; j < 5; j++) pl += `<rect x="0" y="${79 + j * 6}" width="100" height="3.6" fill="#1d6b36" opacity=".55"/>`;
      art = `<path d="${BODY}" fill="${color}"/>${clip(pl)}<path d="M39.6 77 Q50 74.6 60.4 77 L50 90Z" fill="${shade}"/>` +
        `<path d="M39 76.6 L50 90.4 L43.6 76Z M61 76.6 L50 90.4 L56.4 76Z" fill="#fff" stroke="${dark}" stroke-width=".8" stroke-linejoin="round"/>` +
        dot(50, 93.6, 1.2, "#2F8F4E") + dot(50, 98, 1.2, "#2F8F4E") + sleeves();
      break; }
    case 33: { // 🧝 chaleco de elfo
      art = `<path d="${BODY}" fill="#fff"/>` + [0, 1, 2, 3, 4].map(i => `<rect x="12" y="${80 + i * 4.8}" width="76" height="2.4" fill="#E5484D"/>`).join("") +
        `<path d="M26 100 L28 88 L33 84 L38 79 L44 84 L50 80 L56 84 L62 79 L67 84 L72 88 L74 100Z" fill="#2F8F4E" stroke="#1d6b36" stroke-width=".9" stroke-linejoin="round"/>` +
        `<rect x="26" y="92.6" width="48" height="3.6" fill="#7a4a1d"/><rect x="45" y="91.8" width="10" height="5.2" rx="1" fill="#F5C542" stroke="#C9962B" stroke-width=".7"/>` +
        `<circle cx="38" cy="86" r="1.4" fill="#F5C542"/><circle cx="62" cy="86" r="1.4" fill="#F5C542"/>` + `<path d="M44.4 77.3 L50 84 L55.6 77.3Z" fill="${shade}"/>`;
      break; }
    default: // camiseta (0)
      art = `<path d="${BODY}" fill="${color}"/>` + crewHole + sleeves() + line("M30 99.2 H70", dark, 1, 'opacity=".4"') + shadeHalf;
  }
  return { art, noNeck };
}

function mouthArt(style, lipColor) {
  const st = lipColor || MOUTH, sw = lipColor ? 3.3 : 2.6;
  const line = (d) => `<path d="${d}" fill="none" stroke="${st}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>`;
  switch (style) {
    case 1: return `<path d="M42.5 62 Q50 74 57.5 62Z" fill="${DARK_RED}" stroke="${st}" stroke-width="${lipColor ? 2 : 1.4}" stroke-linejoin="round"/><path d="M44.3 62.7 H55.7 Q50 66.4 44.3 62.7Z" fill="#fff"/>`;
    case 2: return line("M45 64 H55");
    case 3: return line("M44 64.5 Q50 66.5 56.5 62");
    case 4: return `<ellipse cx="50" cy="64.5" rx="3.1" ry="3.8" fill="${DARK_RED}" stroke="${st}" stroke-width="${lipColor ? 2 : 1.2}"/>`;
    case 5: return `<path d="M47.8 66 Q50 72 52.2 66Z" fill="#E8607A"/>` + line("M43.5 63 Q50 69 56.5 63");
    default: return line("M43.5 63 Q50 69 56.5 63");
  }
}

function personSvg(c, gid) {
  const skin = SKIN[c.s], shade = mix(skin, "#000000", 0.12);
  const hair = HAIR[c.hc], brow = mix(hair, "#000000", 0.25);
  const ec = EYES[c.ec];
  const hasHat = c.ht > 0;
  // con sombrero, los peinados que sobresalen (moño, puntas) se adaptan para que no lo atraviesen
  const hairStyle = hasHat && c.h === 10 ? 2 : c.h;
  const headEl = (extra) => c.f === 1 ? `<ellipse cx="50" cy="51" rx="25" ry="25" ${extra}/>`
    : `<path d="${c.f === 2 ? FACE_SQUARE : FACE_OVAL}" ${extra}/>`;
  let capN = 0;
  const cap = (region, sx = 1.07, sy = 1.1, op = 1) => {
    const id = `${gid}r${++capN}`;
    return `<clipPath id="${id}"><path d="${region}"/></clipPath><g clip-path="url(#${id})" opacity="${op}"><g transform="translate(50 51) scale(${sx} ${sy}) translate(-50 -51)">${headEl(`fill="${hair}"`)}</g></g>`;
  };
  let [hBack, hFront] = hairArt(hairStyle, hair, cap);
  if (hasHat && c.h === 6) hBack = "";
  const hatFit = c.h === 5 ? { dy: -5, sx: 1.34 } : c.h === 4 ? { dy: -1, sx: 1.16 } : { dy: c.f === 1 ? 4 : 2, sx: 1.08 };
  const head = headEl(`fill="${skin}"`);
  const earX = [21.6, 24.6, 23][c.f];       // distancia de la oreja al centro
  const hairSx = [1, 1.07, 1.03][c.f];       // el pelo acompaña el ancho de la cara
  const beardHw = [21.4, 24, 23][c.f];
  const bw = (d, w = 2.4) => `<path d="${d}" fill="none" stroke="${brow}" stroke-width="${w}" stroke-linecap="round"/>`;
  const brows = [
    "",
    bw("M35 43.5 Q40 40.5 45 43") + bw("M55 43 Q60 40.5 65 43.5"),
    bw("M35 42.5 H45") + bw("M55 42.5 H65"),
    bw("M35 43 Q40 40.5 45 42.5", 3.8) + bw("M55 42.5 Q60 40.5 65 43", 3.8),
    bw("M35 44 Q40 38 45 41.5") + bw("M55 41.5 Q60 38 65 44"),
  ][c.b];
  const nose = [
    `<path d="M50 52 Q47.5 58 51.5 58.6" fill="none" stroke="${shade}" stroke-width="2" stroke-linecap="round"/>`,
    `<circle cx="50" cy="57" r="2.5" fill="${shade}"/>`,
    `<path d="M47.6 58.4 Q50 53.4 52.4 58.4" fill="none" stroke="${shade}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
  ][c.n];
  const stache = `<path d="M41 61 Q45 57.6 50 60.4 Q55 57.6 59 61 Q55 63.6 50 62 Q45 63.6 41 61Z" fill="${hair}"/>`;
  const bx1 = 50 - beardHw - 0.3, bx2 = 50 + beardHw + 0.3;
  const facial = [
    "",
    `<defs><linearGradient id="${gid}s" gradientUnits="userSpaceOnUse" x1="0" y1="58" x2="0" y2="77"><stop offset="0" stop-color="${hair}" stop-opacity="0"/><stop offset="1" stop-color="${hair}" stop-opacity=".42"/></linearGradient></defs><g clip-path="url(#${gid}h)"><rect x="0" y="58" width="100" height="42" fill="url(#${gid}s)"/></g>`,
    stache,
    stache + `<path d="M44 69 Q50 66 56 69 Q56 77 50 78 Q44 77 44 69Z" fill="${hair}"/>`,
    `<path d="M${bx1} 58 Q${bx1 + 1} 84 50 85 Q${bx2 - 1} 84 ${bx2} 58 Q${bx2 - 5} 68.5 50 68.5 Q${bx1 + 5} 68.5 ${bx1} 58Z" fill="${hair}"/>` + stache,
  ][c.fh];
  const earY = c.er === 2 ? 60.5 : 58.2;
  const earrings = c.er === 0 ? "" : [50 - earX - 0.2, 50 + earX + 0.2].map(x => c.er === 1
    ? `<circle cx="${x}" cy="${earY}" r="1.9" fill="#F5C542" stroke="#C9962B" stroke-width=".6"/>`
    : `<circle cx="${x}" cy="${earY}" r="3.1" fill="none" stroke="#F5C542" stroke-width="1.5"/>`).join("");
  const shadow = c.sh ? `<ellipse cx="41" cy="46.8" rx="5.6" ry="3" fill="${SHADOW[c.sh - 1]}" opacity=".62"/><ellipse cx="59" cy="46.8" rx="5.6" ry="3" fill="${SHADOW[c.sh - 1]}" opacity=".62"/>` : "";
  const linerFor = (x, o) => `<path d="M${x - o * 4.5} ${50 - 1.7} Q${x} ${50 - 5.4} ${x + o * 4.6} ${50 - 2.6} L${x + o * 6.8} ${50 - 4.4}" fill="none" stroke="${INK}" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round"/>`;
  const liner = c.li ? linerFor(41, -1) + linerFor(59, 1) : "";
  const blush = c.bl ? `<circle cx="35.5" cy="58.2" r="4.1" fill="${BLUSH[c.bl - 1]}" opacity=".42"/><circle cx="64.5" cy="58.2" r="4.1" fill="${BLUSH[c.bl - 1]}" opacity=".42"/>` : "";
  const freckles = c.fr ? `<g fill="#B8714A" opacity=".55"><circle cx="37" cy="57" r=".9"/><circle cx="40" cy="59" r=".9"/><circle cx="44" cy="57.6" r=".9"/><circle cx="56" cy="57.6" r=".9"/><circle cx="60" cy="59" r=".9"/><circle cx="63" cy="57" r=".9"/></g>` : "";
  const hb = hBack ? `<g transform="translate(50 0) scale(${hairSx} 1) translate(-50 0)">${hBack}</g>` : "";
  const hf = hFront;
  const cl = clothesArt(c.c, CLOTHES[c.cc], skin, shade, `${gid}k`);
  return `${exclusiveBack(c, gid)}${hb}
    ${cl.art}
    <rect x="43" y="63" width="14" height="17" rx="6" fill="${shade}" ${cl.noNeck ? 'opacity="0"' : ""}/>
    <ellipse cx="${50 - earX - 0.2}" cy="53" rx="4" ry="5" fill="${skin}"/><ellipse cx="${50 + earX + 0.2}" cy="53" rx="4" ry="5" fill="${skin}"/>
    ${earrings}${head}${blush}${freckles}${facial}${hf}${brows}${shadow}
    ${eyeArt(c.e, 41, 50, 1.1, ec, skin, false)}${eyeArt(c.e, 59, 50, 1.1, ec, skin, true)}${liner}
    ${nose}${mouthArt(c.m, c.lp ? LIPS[c.lp - 1] : null)}
    ${glassesArt(c.g, 41, 59, 50)}${hatArt(c.ht, BG_COLORS[c.hv], hatFit.dy, hatFit.sx)}${exclusiveFront(c, gid)}`;
}

/* ---------- Animal ---------- */
function animalSvg(c) {
  const sp = SPECIES[c.sp], F = FUR[c.fc], D = DETAIL[c.dc], NC = NOSE[c.nc];
  const M = c.sp === 5 ? "#FFFFFF" : mix(F, "#ffffff", 0.58), dark = mix(F, "#000000", 0.14);
  let eyes = [[38, 52], [62, 52]], es = 1, noseY = 60, mouthY = 64.5, back = "", head = "", face = "", nose = "";
  const tri = (x, y, w = 4.6) => `<path d="M${x - w} ${y - 1.4} Q${x} ${y - 3.4} ${x + w} ${y - 1.4} Q${x} ${y + 4} ${x - w} ${y - 1.4}Z" fill="${NC}"/>`;
  const oval = (x, y, rx = 5, ry = 3.6) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${NC}"/><ellipse cx="${x - rx * 0.3}" cy="${y - ry * 0.35}" rx="${rx * 0.28}" ry="${ry * 0.24}" fill="#fff" opacity=".55"/>`;
  switch (c.sp) {
    case 0: // gato
      back = `<path d="M24 46 L25 19 L45 34Z" fill="${F}"/><path d="M28.5 41 L29.5 26 L40 34Z" fill="${D}"/><path d="M76 46 L75 19 L55 34Z" fill="${F}"/><path d="M71.5 41 L70.5 26 L60 34Z" fill="${D}"/>`;
      head = `<ellipse cx="50" cy="57" rx="29" ry="25" fill="${F}"/>`;
      face = `<ellipse cx="50" cy="65" rx="12.5" ry="8.5" fill="${M}"/><path d="M20 60 L35 62.4 M20.5 67 L35 65 M80 60 L65 62.4 M79.5 67 L65 65" stroke="rgba(0,0,0,.32)" stroke-width="1.2" stroke-linecap="round"/>`;
      nose = tri(50, 60.6); mouthY = 65.6; break;
    case 1: // perro
      back = `<ellipse cx="25" cy="50" rx="9.5" ry="17" fill="${D}" transform="rotate(14 25 50)"/><ellipse cx="75" cy="50" rx="9.5" ry="17" fill="${D}" transform="rotate(-14 75 50)"/>`;
      head = `<ellipse cx="50" cy="56" rx="26" ry="25" fill="${F}"/>`;
      face = `<ellipse cx="50" cy="66" rx="14.5" ry="10.5" fill="${M}"/>`;
      nose = oval(50, 61, 5.4, 3.8); mouthY = 67; break;
    case 2: // oso
      back = `<circle cx="26" cy="34" r="9.5" fill="${F}"/><circle cx="26" cy="34" r="5" fill="${D}"/><circle cx="74" cy="34" r="9.5" fill="${F}"/><circle cx="74" cy="34" r="5" fill="${D}"/>`;
      head = `<ellipse cx="50" cy="56" rx="28" ry="26" fill="${F}"/>`;
      face = `<ellipse cx="50" cy="65.5" rx="13.5" ry="9.6" fill="${M}"/>`;
      nose = oval(50, 61.5, 5.2, 3.9); mouthY = 67; break;
    case 3: // zorro
      back = `<path d="M22 46 L24 15 L45 34Z" fill="${F}"/><path d="M24.6 28 L24 15 L33 25Z" fill="${D}"/><path d="M78 46 L76 15 L55 34Z" fill="${F}"/><path d="M75.4 28 L76 15 L67 25Z" fill="${D}"/>`;
      head = `<path d="M22 50 Q22 32 50 32 Q78 32 78 50 Q76 70 50 83 Q24 70 22 50Z" fill="${F}"/>`;
      face = `<path d="M22 57 Q38 57 50 71 Q62 57 78 57 Q74 73 50 83 Q26 73 22 57Z" fill="${M}"/>`;
      nose = oval(50, 75, 4.6, 3.3); mouthY = 79; eyes = [[37, 49], [63, 49]]; break;
    case 4: // conejo
      back = `<ellipse cx="37" cy="23" rx="7.6" ry="20" fill="${F}"/><ellipse cx="37" cy="24" rx="3.8" ry="14" fill="${D}"/><ellipse cx="63" cy="23" rx="7.6" ry="20" fill="${F}"/><ellipse cx="63" cy="24" rx="3.8" ry="14" fill="${D}"/>`;
      head = `<ellipse cx="50" cy="60" rx="25" ry="23" fill="${F}"/>`;
      face = `<ellipse cx="50" cy="68" rx="10.5" ry="7.4" fill="${M}"/>`;
      nose = tri(50, 63, 3.6); mouthY = 68.5; eyes = [[39, 55], [61, 55]]; break;
    case 5: // panda
      back = `<circle cx="26" cy="35" r="9.5" fill="${D}"/><circle cx="74" cy="35" r="9.5" fill="${D}"/>`;
      head = `<ellipse cx="50" cy="56" rx="28" ry="25" fill="${F}"/><ellipse cx="38" cy="53" rx="8.2" ry="10" fill="${D}" transform="rotate(-22 38 53)"/><ellipse cx="62" cy="53" rx="8.2" ry="10" fill="${D}" transform="rotate(22 62 53)"/>`;
      face = `<ellipse cx="50" cy="65.5" rx="12" ry="8.4" fill="${M}"/>`;
      nose = oval(50, 61.4, 5, 3.5); mouthY = 67; break;
    case 6: { // león
      const mane = Array.from({ length: 12 }, (_, i) => { const a = i / 12 * Math.PI * 2; return `<circle cx="${(50 + Math.cos(a) * 29).toFixed(1)}" cy="${(57 + Math.sin(a) * 28).toFixed(1)}" r="12" fill="${D}"/>`; }).join("");
      back = `${mane}<circle cx="50" cy="57" r="30" fill="${D}"/><circle cx="29" cy="30" r="8" fill="${F}"/><circle cx="71" cy="30" r="8" fill="${F}"/>`;
      head = `<ellipse cx="50" cy="57" rx="25" ry="24" fill="${F}"/>`;
      face = `<ellipse cx="50" cy="65.5" rx="12" ry="8.6" fill="${M}"/>`;
      nose = tri(50, 61, 4.6); mouthY = 66.4; break; }
    case 7: // rana
      back = `<circle cx="34" cy="38" r="11.5" fill="${F}"/><circle cx="66" cy="38" r="11.5" fill="${F}"/>`;
      head = `<ellipse cx="50" cy="60" rx="31" ry="23" fill="${F}"/>`;
      face = `<ellipse cx="50" cy="71" rx="19" ry="8" fill="${D}" opacity=".55"/>`;
      nose = `<circle cx="46" cy="56" r="1.2" fill="${NC}"/><circle cx="54" cy="56" r="1.2" fill="${NC}"/>`;
      eyes = [[34, 38], [66, 38]]; es = 1.35; mouthY = 64; break;
    case 8: // cerdito
      back = `<path d="M25 42 L29 20 L45 33Z" fill="${F}"/><path d="M75 42 L71 20 L55 33Z" fill="${F}"/><path d="M28.4 37 L30.4 26 L39 32.4Z" fill="${D}"/><path d="M71.6 37 L69.6 26 L61 32.4Z" fill="${D}"/>`;
      head = `<ellipse cx="50" cy="57" rx="28" ry="25" fill="${F}"/>`;
      face = `<ellipse cx="50" cy="65" rx="13.5" ry="9.6" fill="${D}"/><ellipse cx="45.6" cy="65" rx="2.1" ry="3" fill="${NC}"/><ellipse cx="54.4" cy="65" rx="2.1" ry="3" fill="${NC}"/>`;
      mouthY = 74.4; break;
    default: // búho
      back = `<path d="M26 42 L27 20 L43 32Z" fill="${F}"/><path d="M74 42 L73 20 L57 32Z" fill="${F}"/>`;
      head = `<ellipse cx="50" cy="57" rx="30" ry="27" fill="${F}"/>`;
      face = `<circle cx="37" cy="51" r="12" fill="${M}"/><circle cx="63" cy="51" r="12" fill="${M}"/>`;
      nose = `<path d="M45.6 58 L54.4 58 L50 67Z" fill="${NC}" stroke="${mix(NC, "#000000", 0.2)}" stroke-width=".8" stroke-linejoin="round"/>`;
      eyes = [[37, 51], [63, 51]]; es = 1.55; mouthY = -1; break;
  }
  const body = `<ellipse cx="50" cy="104" rx="29" ry="19" fill="${F}"/><ellipse cx="50" cy="106" rx="16" ry="12" fill="${M}"/>`;
  const spots = [
    "",
    `<ellipse cx="62" cy="50" rx="9.4" ry="10.4" fill="${D}" opacity=".9" transform="rotate(18 62 50)"/>`,
    `<g fill="${D}" opacity=".7"><circle cx="33" cy="60" r="1.1"/><circle cx="37" cy="62.4" r="1.1"/><circle cx="31.4" cy="64.4" r="1.1"/><circle cx="67" cy="60" r="1.1"/><circle cx="63" cy="62.4" r="1.1"/><circle cx="68.6" cy="64.4" r="1.1"/></g>`,
    `<path d="M50 34 V43 M43 35.4 L44.4 42.4 M57 35.4 L55.6 42.4" stroke="${D}" stroke-width="2.6" stroke-linecap="round" opacity=".85"/>`,
  ][c.spt];
  const blush = c.bl ? `<circle cx="31.5" cy="${mouthY > 0 ? 62 : 62}" r="4.4" fill="${BLUSH[c.bl - 1]}" opacity=".5"/><circle cx="68.5" cy="62" r="4.4" fill="${BLUSH[c.bl - 1]}" opacity=".5"/>` : "";
  const lid = F;
  const mst = INK;
  const mw = c.sp === 7 ? 2.3 : 1;
  const mouth = mouthY < 0 ? "" : [
    `<path d="M${50 - 6.4 * mw} ${mouthY} Q50 ${mouthY + 6} ${50 + 6.4 * mw} ${mouthY}" fill="none" stroke="${mst}" stroke-width="2.4" stroke-linecap="round"/>`,
    `<path d="M${50 - 7.4 * mw} ${mouthY - 1} Q50 ${mouthY + 11} ${50 + 7.4 * mw} ${mouthY - 1}Z" fill="${DARK_RED}" stroke="${mst}" stroke-width="1.4" stroke-linejoin="round"/><path d="M${50 - 3.4} ${mouthY + 6} Q50 ${mouthY + 3.2} ${50 + 3.4} ${mouthY + 6}Q50 ${mouthY + 9} ${50 - 3.4} ${mouthY + 6}Z" fill="#E8607A"/>`,
    `<path d="M${50 - 4 * mw} ${mouthY + 1} H${50 + 4 * mw}" stroke="${mst}" stroke-width="2.4" stroke-linecap="round"/>`,
    `<path d="M${50 - 6.4 * mw} ${mouthY} Q50 ${mouthY + 6} ${50 + 6.4 * mw} ${mouthY}" fill="none" stroke="${mst}" stroke-width="2.4" stroke-linecap="round"/><path d="M${50 - 2.8} ${mouthY + 3.2} Q50 ${mouthY + 3.8} ${50 + 2.8} ${mouthY + 3.2} L${50 + 2.4} ${mouthY + 7.6} Q50 ${mouthY + 9.4} ${50 - 2.4} ${mouthY + 7.6}Z" fill="#E8607A"/>`,
  ][c.m];
  const styleMap = [1, 0, 2, 3]; // redondos, con iris, felices, dormilones -> estilos de eyeArt
  const eyeSvg = eyes.map(([x, y], i) => eyeArt(styleMap[c.e], x, y, es, EYES[c.ec], lid, i === 1)).join("");
  const nwc = CLOTHES[c.nv];
  const neck = [
    "",
    `<path d="M50 87 L38 81 Q36 87 38 93Z M50 87 L62 81 Q64 87 62 93Z" fill="${nwc}"/><circle cx="50" cy="87" r="3.2" fill="${mix(nwc, "#000000", 0.2)}"/>`,
    `<path d="M24 80 Q50 93 76 80 L78 89 Q50 102 22 89Z" fill="${nwc}"/><path d="M62 90 L68 104 L76 101 L72 88Z" fill="${mix(nwc, "#000000", 0.16)}"/>`,
    `<path d="M26 81 Q50 93 74 81 L74 85 Q50 97 26 85Z" fill="${nwc}"/><circle cx="50" cy="91" r="4.2" fill="#F5C542" stroke="#C9962B" stroke-width="1"/><path d="M47.6 92 H52.4" stroke="#C9962B" stroke-width="1"/>`,
  ][c.nw];
  return `${back}${body}${neck}${head}${spots}${face}${eyeSvg}${nose}${mouth}${blush}
    ${glassesArt(c.g, eyes[0][0], eyes[1][0], eyes[0][1], c.sp === 7 ? 1.35 : c.sp === 9 ? 1.5 : 1.1)}
    ${hatArt(c.ht, BG_COLORS[c.hv], sp.top - 25, c.sp === 6 ? 1.2 : 1.06)}`;
}

/* Contorno de la cabeza (para recortar la sombra de barba) */
function headClip(c) {
  return c.f === 1 ? `<ellipse cx="50" cy="51" rx="25" ry="25"/>` : `<path d="${c.f === 2 ? FACE_SQUARE : FACE_OVAL}"/>`;
}

/* ---------- Dibujo público ---------- */
let uid = 0;

/** SVG cuadrado del personaje (se recorta en círculo con CSS). `view` = recorte opcional ("head", "face", "body"). */
export function characterSvg(cfg, size = 64, bg = null, view = "full", label = "Avatar") {
  const kind = cfg.k === "a" ? "a" : "p";
  const pair = bgPair(isHex(bg) ? bg : DEFAULT_BG[kind]);
  const g = `cg-${++uid}`;
  const art = kind === "a" ? animalSvg(cfg) : personSvg(cfg, g);
  return `<svg viewBox="${CROPS[view] || CROPS.full}" width="${size}" height="${size}" role="img" aria-label="${label}" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="${g}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${pair[0]}"/><stop offset="1" stop-color="${pair[1]}"/></linearGradient><clipPath id="${g}c"><rect width="100" height="100"/></clipPath><clipPath id="${g}h">${kind === "p" ? headClip(cfg) : ""}</clipPath></defs>
    <rect x="-40" y="-40" width="180" height="180" fill="url(#${g})"/>
    <circle cx="82" cy="84" r="22" fill="#fff" opacity=".12"/><circle cx="12" cy="10" r="16" fill="#fff" opacity=".1"/>
    <g clip-path="url(#${g}c)">${art}</g>
  </svg>`;
}

/* ---------- Editor ---------- */
const esc = (s) => String(s).replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));

/**
 * Editor de personaje. `state` = { avatar, bg }.  `onChange({ avatar, bg })` se llama con cada cambio
 * (quien lo use decide cuándo guardar). Devuelve { getState, destroy }.
 */
export function buildCharacterEditor(container, state, onChange, opts = {}) {
  const isStaff = !!opts.admin; // la pestaña "⭐ Exclusivo" solo la ve el equipo (el servidor lo vuelve a comprobar)
  const tabsOf = (schema) => schema.tabs.filter(t => !t.exclusive || isStaff);
  const cfgs = { p: defaultConfig("p"), a: defaultConfig("a") };
  let kind = "p";
  if (isCharacter(state?.avatar)) { const d = decodeCharacter(state.avatar); kind = d.k; cfgs[kind] = d; }
  let bg = isHex(state?.bg) ? state.bg : null;
  let tab = {};
  tab.p = tab.a = null;

  container.classList.add("cc");
  container.setAttribute("aria-label", "Creador de personaje");
  const cur = () => cfgs[kind];
  const emit = () => { if (typeof onChange === "function") onChange({ avatar: encodeCharacter(cur()), bg }); };

  function tileOpt(f, i) {
    const c = { ...cur(), [f.key]: i };
    if (f.onPick) applySpeciesDefaults(c); // cada animal se muestra con sus colores naturales
    const name = f.type === "bool" ? (i ? "Sí" : "No") : f.names[i];
    const thumb = f.type === "bool" && !i ? `<span class="cc-none" aria-hidden="true">∅</span>` : characterSvg(c, 52, bg, f.crop);
    return `<button type="button" class="cc-tile" role="radio" aria-checked="${cur()[f.key] === i}" data-key="${f.key}" data-val="${i}" title="${esc(name)}" aria-label="${esc(f.label)}: ${esc(name)}">${thumb}<span class="cc-tile-name">${esc(name)}</span></button>`;
  }
  function swatches(f) {
    const colors = f.colors;
    const none = f.none ? `<button type="button" class="cc-sw cc-sw-none" role="radio" aria-checked="${cur()[f.key] === 0}" data-key="${f.key}" data-val="0" title="Ninguno" aria-label="${esc(f.label)}: ninguno"></button>` : "";
    const off = f.none ? 1 : 0;
    return none + colors.map((col, i) => `<button type="button" class="cc-sw" role="radio" aria-checked="${cur()[f.key] === i + off}" data-key="${f.key}" data-val="${i + off}" style="--c:${col}" title="${col}" aria-label="${esc(f.label)} ${i + 1}"></button>`).join("");
  }
  function field(f) {
    let body;
    if (f.type === "color") body = `<div class="cc-swatches" role="radiogroup" aria-label="${esc(f.label)}">${swatches(f)}</div>`;
    else if (f.type === "bool") body = `<div class="cc-tiles cc-tiles-2" role="radiogroup" aria-label="${esc(f.label)}">${tileOpt(f, 0)}${tileOpt(f, 1)}</div>`;
    else body = `<div class="cc-tiles" role="radiogroup" aria-label="${esc(f.label)}">${f.names.map((_, i) => tileOpt(f, i)).join("")}</div>`;
    return `<div class="cc-field"><div class="cc-label">${esc(f.label)}</div>${body}</div>`;
  }
  function bgField() {
    return `<div class="cc-field"><div class="cc-label">Color de fondo</div><div class="cc-swatches" role="radiogroup" aria-label="Color de fondo">
      <button type="button" class="cc-sw cc-sw-none" role="radio" aria-checked="${!bg}" data-bg="" title="Color original" aria-label="Fondo original"></button>
      ${BG_COLORS.map(c => `<button type="button" class="cc-sw" role="radio" aria-checked="${bg === c}" data-bg="${c}" style="--c:${c}" title="${c}" aria-label="Fondo ${c}"></button>`).join("")}</div></div>`;
  }

  function render(keepFocus) {
    const schema = SCHEMAS[kind];
    if (!tab[kind] || (tab[kind] !== "fondo" && !tabsOf(schema).some(t => t.id === tab[kind]))) tab[kind] = tabsOf(schema)[0].id;
    const t = tabsOf(schema).find(x => x.id === tab[kind]);
    const prevPanel = container.querySelector(".cc-panel");
    const scroll = prevPanel ? prevPanel.scrollTop : 0;
    const tabsHtml = [...tabsOf(schema), { id: "fondo", label: "Fondo" }].map(x =>
      `<button type="button" class="cc-tab" role="tab" aria-selected="${x.id === tab[kind]}" data-tab="${x.id}" id="cc-tab-${x.id}">${esc(x.label)}</button>`).join("");
    container.innerHTML = `
      <div class="cc-top">
        <div class="cc-preview" aria-live="polite">${characterSvg(cur(), 148, bg, "full", "Tu personaje")}</div>
        <div class="cc-side">
          <div class="cc-kinds" role="tablist" aria-label="Tipo de personaje">
            <button type="button" class="cc-kind" role="tab" aria-selected="${kind === "p"}" data-kind="p">Personas</button>
            <button type="button" class="cc-kind" role="tab" aria-selected="${kind === "a"}" data-kind="a">Animales</button>
          </div>
          <div class="cc-actions">
            <button type="button" class="btn btn-ghost btn-sm" data-cc="random">🎲 Aleatorio</button>
            <button type="button" class="btn btn-ghost btn-sm" data-cc="reset">Restablecer</button>
          </div>
        </div>
      </div>
      <div class="cc-tabs" role="tablist" aria-label="Partes del personaje">${tabsHtml}</div>
      <div class="cc-panel" role="tabpanel" aria-labelledby="cc-tab-${tab[kind]}">${tab[kind] === "fondo" ? bgField() : t.fields.map(field).join("")}</div>`;
    const panel = container.querySelector(".cc-panel");
    if (panel) panel.scrollTop = scroll;
    if (keepFocus) container.querySelector(keepFocus)?.focus({ preventScroll: true });
  }

  function setValue(key, val) {
    const f = fieldsOf(kind).find(x => x.key === key);
    if (!f || !(val >= 0 && val < countOf(f))) return;
    cur()[key] = val;
    if (f.onPick) applySpeciesDefaults(cur());
  }

  const onClick = (e) => {
    const b = e.target.closest("button");
    if (!b || !container.contains(b)) return;
    if (b.dataset.kind) { kind = b.dataset.kind; render(`[data-kind="${kind}"]`); emit(); return; }
    if (b.dataset.tab) { tab[kind] = b.dataset.tab; render(`[data-tab="${b.dataset.tab}"]`); return; }
    if (b.dataset.cc === "random") { cfgs[kind] = randomConfig(kind); render('[data-cc="random"]'); emit(); return; }
    if (b.dataset.cc === "reset") { cfgs[kind] = defaultConfig(kind); bg = null; render('[data-cc="reset"]'); emit(); return; }
    if (b.dataset.bg !== undefined) { bg = b.dataset.bg || null; render(`[data-bg="${b.dataset.bg}"]`); emit(); return; }
    if (b.dataset.key) { setValue(b.dataset.key, Number(b.dataset.val)); render(`[data-key="${b.dataset.key}"][data-val="${b.dataset.val}"]`); emit(); }
  };
  const onKey = (e) => {
    const t = e.target.closest('[role="tab"]');
    if (!t || (e.key !== "ArrowRight" && e.key !== "ArrowLeft")) return;
    const list = [...t.parentElement.querySelectorAll('[role="tab"]')];
    const n = list[(list.indexOf(t) + (e.key === "ArrowRight" ? 1 : -1) + list.length) % list.length];
    n.focus(); n.click(); e.preventDefault();
  };
  container.addEventListener("click", onClick);
  container.addEventListener("keydown", onKey);
  render();

  return {
    getState: () => ({ avatar: encodeCharacter(cur()), bg }),
    destroy() { container.removeEventListener("click", onClick); container.removeEventListener("keydown", onKey); container.innerHTML = ""; container.classList.remove("cc"); },
  };
}
