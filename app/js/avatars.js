// avatars.js
// Punto único para dibujar la foto de perfil:
//   · personajes creados con el editor (character.js)  ->  avatar = "c1:{...}"
//   · avatares antiguos por id (24 dibujos), que se siguen mostrando igual a quien ya eligió uno
// El color de fondo va aparte en users/{uid}.avatarBg.
import { characterSvg, isCharacter, decodeCharacter, buildCharacterEditor, DEFAULT_AVATAR, BG_COLORS, bgPair, isHex, presetAvatar, SEX_OPTIONS } from "./character.js";

export { buildCharacterEditor, DEFAULT_AVATAR, BG_COLORS, isCharacter, presetAvatar, SEX_OPTIONS };

const INK = "#1b1b1b";

const eye = (cx, cy, r = 4.2) =>
  `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${INK}"/><circle cx="${cx + r * 0.32}" cy="${cy - r * 0.34}" r="${r * 0.32}" fill="#fff"/>`;
const eyes = (x1, x2, y, r = 4.2) => eye(x1, y, r) + eye(x2, y, r);
const smile = (cx, cy, w = 6, color = INK) =>
  `<path d="M${cx - w} ${cy} Q${cx} ${cy + w * 0.95} ${cx + w} ${cy}" fill="none" stroke="${color}" stroke-width="2.6" stroke-linecap="round"/>`;
const cheeks = (x1, x2, y, color = "#FF8FA3") =>
  `<circle cx="${x1}" cy="${y}" r="4.6" fill="${color}" opacity=".45"/><circle cx="${x2}" cy="${y}" r="4.6" fill="${color}" opacity=".45"/>`;

/* ---------- Personas: cuerpo + cabeza con tono de piel + peinado ---------- */
function person({ skin, shade, shirt, hairBack = "", hairFront = "", extra = "", brow = "#2b1d17", blush = "#FF8FA3" }) {
  return `${hairBack}
    <path d="M12 100 Q15 79 50 77 Q85 79 88 100Z" fill="${shirt}"/>
    <rect x="43" y="63" width="14" height="17" rx="6" fill="${shade}"/>
    <path d="M41 79 Q50 88 59 79" fill="none" stroke="rgba(0,0,0,.14)" stroke-width="2.2" stroke-linecap="round"/>
    <ellipse cx="28.5" cy="53" rx="4" ry="5" fill="${skin}"/><ellipse cx="71.5" cy="53" rx="4" ry="5" fill="${skin}"/>
    <ellipse cx="50" cy="50" rx="22" ry="25" fill="${skin}"/>
    ${hairFront}
    <path d="M35 43.5 Q40 40.5 45 43" fill="none" stroke="${brow}" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M55 43 Q60 40.5 65 43.5" fill="none" stroke="${brow}" stroke-width="2.4" stroke-linecap="round"/>
    ${eyes(41, 59, 50, 3.1)}
    <path d="M50 52 Q47.5 58 51.5 58.6" fill="none" stroke="${shade}" stroke-width="2" stroke-linecap="round"/>
    ${smile(50, 63, 6.5, "#8A3B3B")}${cheeks(35, 65, 58, blush)}${extra}`;
}
const glasses = (c = "#2b2b2b") =>
  `<circle cx="41" cy="50" r="6.6" fill="rgba(255,255,255,.18)" stroke="${c}" stroke-width="1.9"/><circle cx="59" cy="50" r="6.6" fill="rgba(255,255,255,.18)" stroke="${c}" stroke-width="1.9"/><path d="M47.6 50 H52.4" stroke="${c}" stroke-width="1.9"/>`;
const freckles = `<g fill="#B8714A" opacity=".55"><circle cx="37" cy="57" r=".9"/><circle cx="40" cy="59" r=".9"/><circle cx="44" cy="57.6" r=".9"/><circle cx="56" cy="57.6" r=".9"/><circle cx="60" cy="59" r=".9"/><circle cx="63" cy="57" r=".9"/></g>`;
const longBack = (c) => `<path d="M25 52 Q19 88 31 97 L69 97 Q81 88 75 52 Q76 22 50 22 Q24 22 25 52Z" fill="${c}"/>`;
const bobBack = (c) => `<path d="M25 48 Q22 74 33 77 L67 77 Q78 74 75 48 Q76 22 50 22 Q24 22 25 48Z" fill="${c}"/>`;
const shortFront = (c) => `<path d="M27 45 Q25 24 50 23 Q75 24 73 45 Q70 33 60 31 Q50 29 40 31 Q30 33 27 45Z" fill="${c}"/>`;
const sweptFront = (c) => `<path d="M27 46 Q26 25 50 24 Q74 25 73 46 Q66 33 54 31 Q40 36 27 46Z" fill="${c}"/>`;

const PERSONAS = [
  {
    id: "lucia", name: "Lucía", bg: ["#FFA9A4", "#F0605D"],
    art: person({ skin: "#F6CBA6", shade: "#E0AE86", shirt: "#E8556D", hairBack: longBack("#5A3825"), hairFront: sweptFront("#5A3825") }),
  },
  {
    id: "carlos", name: "Carlos", bg: ["#E8C79B", "#B9824B"],
    art: person({
      skin: "#D49C70", shade: "#BC8456", shirt: "#2E86AB", hairFront: shortFront("#1d1612"), brow: "#1d1612",
      extra: `<path d="M29 56 Q30 83 50 84 Q70 83 71 56 Q66 70 50 70 Q34 70 29 56Z" fill="#1d1612"/>`,
    }),
  },
  {
    id: "aisha", name: "Aisha", bg: ["#D5E27E", "#8FA31E"],
    art: person({
      skin: "#6E4224", shade: "#5A341B", shirt: "#F2B134", brow: "#14100d", blush: "#D9606F",
      hairBack: `<circle cx="24" cy="36" r="13" fill="#14100d"/><circle cx="76" cy="36" r="13" fill="#14100d"/>`,
      hairFront: `<path d="M26 46 Q25 22 50 21 Q75 22 74 46 Q68 34 50 33 Q32 34 26 46Z" fill="#14100d"/>
        <circle cx="24" cy="47" r="3" fill="#F2B134"/><circle cx="76" cy="47" r="3" fill="#F2B134"/>`,
    }),
  },
  {
    id: "mateo", name: "Mateo", bg: ["#F7B0E3", "#C026D3"],
    art: person({
      skin: "#E7B48B", shade: "#D09A70", shirt: "#6C5CE7", brow: "#3a2619",
      hairFront: `<g fill="#3a2619"><circle cx="31" cy="36" r="9"/><circle cx="42" cy="27" r="10"/><circle cx="55" cy="26" r="10"/><circle cx="67" cy="32" r="9"/><circle cx="72" cy="44" r="6"/><circle cx="28" cy="45" r="6"/></g>`,
      extra: glasses(),
    }),
  },
  {
    id: "sofia", name: "Sofía", bg: ["#8FD0FF", "#2F8CF0"],
    art: person({
      skin: "#FCE1CB", shade: "#EBC5A6", shirt: "#2ECC9A", brow: "#8A3A22",
      hairBack: `<ellipse cx="79" cy="58" rx="7" ry="15" transform="rotate(-16 79 58)" fill="#B4472C"/>`,
      hairFront: `<path d="M27 46 Q26 25 50 24 Q74 25 73 46 Q67 32 52 31 Q37 33 27 46Z" fill="#B4472C"/><circle cx="74.5" cy="46" r="3.4" fill="#FF6B81"/>`,
      extra: freckles,
    }),
  },
  {
    id: "jamal", name: "Jamal", bg: ["#69CF93", "#157A4A"],
    art: person({
      skin: "#4B2B16", shade: "#3B2210", shirt: "#FF7A59", brow: "#0f0b08", blush: "#C25563",
      hairFront: `<path d="M27 44 Q27 25 50 24 Q73 25 73 44 Q68 35 50 34 Q32 35 27 44Z" fill="#14100d"/>`,
      extra: `<path d="M43 63 Q50 71 57 63Z" fill="#fff"/>`,
    }),
  },
  {
    id: "valentina", name: "Valentina", bg: ["#FFB8A0", "#E8765B"],
    art: person({
      skin: "#B97C52", shade: "#A06A44", shirt: "#9B59B6", brow: "#1a1311",
      hairBack: longBack("#1a1311"),
      hairFront: `<path d="M26 47 Q27 25 50 24 Q73 25 74 47 Q64 36 50 36 Q36 36 26 47Z" fill="#1a1311"/>
        <path d="M27 38 Q50 18 73 38" fill="none" stroke="#FF6FA3" stroke-width="4.5" stroke-linecap="round"/>`,
    }),
  },
  {
    id: "diego", name: "Diego", bg: ["#D5C6FF", "#9B7CF2"],
    art: person({
      skin: "#F2C7A0", shade: "#DCAB82", shirt: "#34495E",
      hairFront: `<path d="M26 42 Q27 18 50 17 Q73 18 74 42Z" fill="#27AE60"/>
        <path d="M22 42 Q50 36 78 42 Q82 48 74 47 Q50 43 26 47 Q18 48 22 42Z" fill="#1E8449"/><circle cx="50" cy="17.5" r="2.2" fill="#1E8449"/>`,
    }),
  },
  {
    id: "mei", name: "Mei", bg: ["#6CC4CE", "#1F7A8C"],
    art: person({
      skin: "#F7D9BB", shade: "#E4BE9A", shirt: "#E67E22", brow: "#14100d",
      hairBack: bobBack("#14100d"),
      hairFront: `<path d="M26 45 Q26 24 50 24 Q74 24 74 45 L74 38 Q62 32 50 34 Q38 32 26 38Z" fill="#14100d"/>`,
    }),
  },
  {
    id: "omar", name: "Omar", bg: ["#FFE69A", "#E8B93B"],
    art: person({
      skin: "#8E5A32", shade: "#774A28", shirt: "#3498DB", brow: "#1d1612", blush: "#D9606F",
      hairFront: shortFront("#1d1612"),
      extra: `<path d="M40 60.5 Q45 56.5 50 59.5 Q55 56.5 60 60.5 Q55 62.5 50 61.5 Q45 62.5 40 60.5Z" fill="#1d1612"/>`,
    }),
  },
  {
    id: "camila", name: "Camila", bg: ["#C3A2E3", "#6B3FA0"],
    art: person({
      skin: "#CF9468", shade: "#B97F54", shirt: "#F39C12", brow: "#5b3720",
      hairBack: `<path d="M24 50 Q16 76 28 88 Q24 96 36 98 L64 98 Q76 96 72 88 Q84 76 76 50 Q76 22 50 22 Q24 22 24 50Z" fill="#7B4A2E"/>`,
      hairFront: `${sweptFront("#7B4A2E")}<g><circle cx="66" cy="31" r="4" fill="#FFD1DC"/><circle cx="71" cy="34" r="4" fill="#FFD1DC"/><circle cx="69" cy="39" r="4" fill="#FFD1DC"/><circle cx="63" cy="38" r="4" fill="#FFD1DC"/><circle cx="62" cy="33" r="4" fill="#FFD1DC"/><circle cx="67" cy="35" r="3" fill="#F6C23E"/></g>`,
    }),
  },
  {
    id: "andres", name: "Andrés", bg: ["#B5C2D6", "#5F728C"],
    art: person({
      skin: "#FDE3CF", shade: "#EBC9AC", shirt: "#E74C3C", brow: "#A9501C",
      hairFront: `<path d="M27 45 Q24 26 36 24 Q40 18 48 22 Q56 16 62 23 Q76 24 73 45 Q70 34 60 32 Q50 30 40 32 Q30 34 27 45Z" fill="#D2691E"/>`,
      extra: glasses("#7a3b12") + freckles,
    }),
  },
].map(a => ({ ...a, group: "personas" }));

/* ---------- Amigos: animales y personajes ---------- */
const AMIGOS = [
  {
    id: "oso", name: "Oso", bg: ["#FFC27A", "#FF8F4C"],
    art: `<circle cx="27" cy="31" r="11" fill="#8B5E3C"/><circle cx="73" cy="31" r="11" fill="#8B5E3C"/>
      <circle cx="27" cy="31" r="5.5" fill="#D8AE80"/><circle cx="73" cy="31" r="5.5" fill="#D8AE80"/>
      <circle cx="50" cy="57" r="31" fill="#A9744F"/>
      <ellipse cx="50" cy="67" rx="14" ry="11" fill="#F0D2A8"/>
      <ellipse cx="50" cy="61" rx="5" ry="3.4" fill="#3b2415"/>
      ${eyes(39, 61, 49)}${smile(50, 69, 6, "#3b2415")}${cheeks(31, 69, 62)}`,
  },
  {
    id: "gato", name: "Gato", bg: ["#6FD6CC", "#2FA79E"],
    art: `<polygon points="22,42 27,12 47,28" fill="#8C95A3"/><polygon points="78,42 73,12 53,28" fill="#8C95A3"/>
      <polygon points="29,36 31,20 41,28" fill="#F6A6B8"/><polygon points="71,36 69,20 59,28" fill="#F6A6B8"/>
      <circle cx="50" cy="58" r="30" fill="#B4BCC8"/>
      <path d="M44 34 V42 M50 32 V42 M56 34 V42" stroke="#8C95A3" stroke-width="3" stroke-linecap="round"/>
      ${eyes(39, 61, 54)}
      <polygon points="46.5,61 53.5,61 50,65.5" fill="#F27A96"/>
      <path d="M50 65.5 Q46 71 41 67.5 M50 65.5 Q54 71 59 67.5" fill="none" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/>
      <path d="M26 62 L14 59 M26 67 L14 69 M74 62 L86 59 M74 67 L86 69" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".9"/>`,
  },
  {
    id: "zorro", name: "Zorro", bg: ["#BBAAF7", "#8F78E8"],
    art: `<polygon points="20,46 22,12 47,28" fill="#F28C38"/><polygon points="80,46 78,12 53,28" fill="#F28C38"/>
      <polygon points="26,38 27,21 40,29" fill="#3b2a22"/><polygon points="74,38 73,21 60,29" fill="#3b2a22"/>
      <circle cx="50" cy="56" r="29" fill="#F28C38"/>
      <path d="M22 58 Q50 94 78 58 Q64 72 50 72 Q36 72 22 58Z" fill="#FFF3E3"/>
      ${eyes(40, 60, 50)}
      <circle cx="50" cy="66" r="3.8" fill="#2b1d17"/>${smile(50, 70, 5, "#2b1d17")}${cheeks(31, 69, 60, "#FF7B6B")}`,
  },
  {
    id: "panda", name: "Panda", bg: ["#B2EBCB", "#6FCF97"],
    art: `<circle cx="26" cy="29" r="11" fill="#222"/><circle cx="74" cy="29" r="11" fill="#222"/>
      <circle cx="50" cy="57" r="31" fill="#fff" stroke="#E4E8E6" stroke-width="2"/>
      <ellipse cx="37" cy="52" rx="8.5" ry="10.5" fill="#222" transform="rotate(-22 37 52)"/>
      <ellipse cx="63" cy="52" rx="8.5" ry="10.5" fill="#222" transform="rotate(22 63 52)"/>
      <circle cx="38" cy="52" r="3.6" fill="#fff"/><circle cx="62" cy="52" r="3.6" fill="#fff"/>
      <circle cx="38.6" cy="52.4" r="1.9" fill="${INK}"/><circle cx="61.4" cy="52.4" r="1.9" fill="${INK}"/>
      <ellipse cx="50" cy="64" rx="4.6" ry="3.2" fill="#222"/>${smile(50, 68, 6)}${cheeks(30, 70, 66)}`,
  },
  {
    id: "buho", name: "Búho", bg: ["#5D7BC9", "#2F4A92"],
    art: `<circle cx="14" cy="16" r="1.6" fill="#fff" opacity=".8"/><circle cx="84" cy="22" r="1.4" fill="#fff" opacity=".8"/><circle cx="88" cy="10" r="1.1" fill="#fff" opacity=".7"/>
      <polygon points="24,40 26,12 44,28" fill="#8F6A3F"/><polygon points="76,40 74,12 56,28" fill="#8F6A3F"/>
      <circle cx="50" cy="58" r="31" fill="#A47B4F"/>
      <ellipse cx="50" cy="82" rx="17" ry="9" fill="#E8D2AE"/>
      <circle cx="38" cy="52" r="13" fill="#fff"/><circle cx="62" cy="52" r="13" fill="#fff"/>
      <circle cx="38" cy="52" r="7" fill="${INK}"/><circle cx="62" cy="52" r="7" fill="${INK}"/>
      <circle cx="40" cy="50" r="2.4" fill="#fff"/><circle cx="64" cy="50" r="2.4" fill="#fff"/>
      <polygon points="50,58 44,67 56,67" fill="#F5A623"/>`,
  },
  {
    id: "robot", name: "Robot", bg: ["#FFE07A", "#FFB703"],
    art: `<line x1="50" y1="12" x2="50" y2="26" stroke="#8FA3B8" stroke-width="3" stroke-linecap="round"/><circle cx="50" cy="11" r="4.6" fill="#FF5C5C"/>
      <rect x="18" y="46" width="8" height="14" rx="3" fill="#8FA3B8"/><rect x="74" y="46" width="8" height="14" rx="3" fill="#8FA3B8"/>
      <rect x="22" y="26" width="56" height="54" rx="15" fill="#CFDAE6" stroke="#8FA3B8" stroke-width="3"/>
      <rect x="29" y="38" width="42" height="24" rx="11" fill="#1f2d3d"/>
      <circle cx="41" cy="50" r="5" fill="#4DE1FF"/><circle cx="59" cy="50" r="5" fill="#4DE1FF"/>
      <circle cx="42.4" cy="48.6" r="1.6" fill="#fff"/><circle cx="60.4" cy="48.6" r="1.6" fill="#fff"/>
      <path d="M42 69 Q50 76 58 69" fill="none" stroke="#4a5b6e" stroke-width="3" stroke-linecap="round"/>
      ${cheeks(30, 70, 70)}`,
  },
  {
    id: "conejo", name: "Conejo", bg: ["#FFB8CC", "#FF8FAE"],
    art: `<ellipse cx="36" cy="24" rx="8" ry="19" fill="#F3EEF2"/><ellipse cx="64" cy="24" rx="8" ry="19" fill="#F3EEF2"/>
      <ellipse cx="36" cy="25" rx="3.6" ry="13" fill="#F6A6BC"/><ellipse cx="64" cy="25" rx="3.6" ry="13" fill="#F6A6BC"/>
      <circle cx="50" cy="62" r="28" fill="#F8F4F7"/>
      ${eyes(40, 60, 58)}
      <ellipse cx="50" cy="65" rx="3.6" ry="2.8" fill="#F28BA8"/>
      <path d="M50 67.5 V70 M50 70 Q45 74 41 71 M50 70 Q55 74 59 71" fill="none" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/>
      <rect x="46.6" y="72" width="6.8" height="6.4" rx="1.4" fill="#fff" stroke="#E4DCE2" stroke-width="1.2"/>${cheeks(30, 70, 66)}`,
  },
  {
    id: "perro", name: "Perro", bg: ["#86CBFF", "#4F9FEF"],
    art: `<ellipse cx="22" cy="50" rx="10" ry="19" fill="#8B5A3C" transform="rotate(14 22 50)"/>
      <ellipse cx="78" cy="50" rx="10" ry="19" fill="#8B5A3C" transform="rotate(-14 78 50)"/>
      <circle cx="50" cy="55" r="28" fill="#EBC795"/>
      <circle cx="61" cy="47" r="10.5" fill="#8B5A3C" opacity=".9"/>
      ${eyes(39, 61, 49)}
      <ellipse cx="50" cy="67" rx="14" ry="10.5" fill="#F9E8CB"/>
      <ellipse cx="50" cy="61" rx="5.4" ry="3.8" fill="#2b1d17"/>
      <path d="M50 64.5 V69 M50 69 Q45 73 41 70 M50 69 Q55 73 59 70" fill="none" stroke="#2b1d17" stroke-width="2.2" stroke-linecap="round"/>
      <path d="M46 72 Q50 82 54 72Z" fill="#F27A96"/>`,
  },
  {
    id: "astronauta", name: "Astronauta", bg: ["#3A3A86", "#5B45B0"],
    art: `<circle cx="14" cy="20" r="1.6" fill="#fff"/><circle cx="86" cy="14" r="1.4" fill="#fff"/><circle cx="90" cy="46" r="1.2" fill="#fff"/><circle cx="10" cy="62" r="1.2" fill="#fff"/><circle cx="80" cy="84" r="1.5" fill="#FFE07A"/>
      <ellipse cx="50" cy="90" rx="26" ry="12" fill="#E1E6EF"/>
      <circle cx="50" cy="52" r="33" fill="#F2F5FA" stroke="#C9D1DF" stroke-width="3"/>
      <ellipse cx="50" cy="52" rx="24" ry="20" fill="#1d3557"/>
      <path d="M33 45 Q40 36 52 37" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".4"/>
      <circle cx="43" cy="53" r="3.4" fill="#fff"/><circle cx="57" cy="53" r="3.4" fill="#fff"/>
      <path d="M44 61 Q50 67 56 61" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/>
      <circle cx="21" cy="52" r="3.6" fill="#FF6B6B"/>`,
  },
  {
    id: "pinguino", name: "Pingüino", bg: ["#C4EBFF", "#8AD3FA"],
    art: `<ellipse cx="22" cy="62" rx="7" ry="15" fill="#1F3550" transform="rotate(16 22 62)"/><ellipse cx="78" cy="62" rx="7" ry="15" fill="#1F3550" transform="rotate(-16 78 62)"/>
      <ellipse cx="50" cy="56" rx="29" ry="34" fill="#263A55"/>
      <ellipse cx="50" cy="66" rx="19" ry="25" fill="#fff"/>
      <circle cx="41" cy="45" r="7" fill="#fff"/><circle cx="59" cy="45" r="7" fill="#fff"/>
      <circle cx="42" cy="46" r="3.4" fill="${INK}"/><circle cx="58" cy="46" r="3.4" fill="${INK}"/>
      <circle cx="43" cy="45" r="1.1" fill="#fff"/><circle cx="59" cy="45" r="1.1" fill="#fff"/>
      <ellipse cx="50" cy="56" rx="7" ry="4.4" fill="#F6A623"/>${cheeks(34, 66, 56, "#FF8FA3")}
      <ellipse cx="40" cy="92" rx="8" ry="4" fill="#F6A623"/><ellipse cx="60" cy="92" rx="8" ry="4" fill="#F6A623"/>`,
  },
  {
    id: "rana", name: "Rana", bg: ["#DDF57A", "#A3D63C"],
    art: `<circle cx="33" cy="32" r="13" fill="#5FB23B"/><circle cx="67" cy="32" r="13" fill="#5FB23B"/>
      <circle cx="33" cy="32" r="8.6" fill="#fff"/><circle cx="67" cy="32" r="8.6" fill="#fff"/>
      <circle cx="34" cy="33" r="4.4" fill="${INK}"/><circle cx="66" cy="33" r="4.4" fill="${INK}"/>
      <circle cx="35.4" cy="31.4" r="1.4" fill="#fff"/><circle cx="67.4" cy="31.4" r="1.4" fill="#fff"/>
      <ellipse cx="50" cy="60" rx="34" ry="27" fill="#6DBE45"/>
      <path d="M26 62 Q50 84 74 62" fill="none" stroke="#2f5d1c" stroke-width="3.2" stroke-linecap="round"/>
      <circle cx="45" cy="52" r="1.6" fill="#2f5d1c"/><circle cx="55" cy="52" r="1.6" fill="#2f5d1c"/>${cheeks(27, 73, 64)}`,
  },
  {
    id: "egresado", name: "Egresado", bg: ["#FBD87A", "#FD9F82"],
    art: `<circle cx="50" cy="62" r="26" fill="#F4C7A1"/>
      <path d="M24 58 Q26 34 50 34 Q74 34 76 58 Q64 46 50 46 Q36 46 24 58Z" fill="#3B2A22"/>
      <path d="M30 30 L30 42 Q50 52 70 42 L70 30 L50 38Z" fill="#2b3646"/>
      <polygon points="50,12 90,27 50,42 10,27" fill="#1f2937"/>
      <line x1="84" y1="29" x2="84" y2="46" stroke="#F5C542" stroke-width="2.6" stroke-linecap="round"/><circle cx="84" cy="48" r="3.4" fill="#F5C542"/>
      ${eyes(42, 58, 62)}${smile(50, 70, 7)}${cheeks(34, 66, 70)}`,
  },
].map(a => ({ ...a, group: "amigos" }));

export const AVATARS = [...AMIGOS, ...PERSONAS];

let uid = 0;

/** SVG cuadrado del avatar (se recorta en círculo con CSS). `bg` = color de fondo opcional (hex). */
export function avatarSvg(avatar, size = 64, bg = null) {
  if (isCharacter(avatar)) return characterSvg(decodeCharacter(avatar), size, bg);
  const a = AVATARS.find(x => x.id === avatar) || AVATARS[0];
  const pair = isHex(bg) ? bgPair(bg) : a.bg;
  const g = `ag-${a.id}-${++uid}`;
  return `<svg viewBox="0 0 100 100" width="${size}" height="${size}" role="img" aria-label="Avatar ${a.name}" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="${g}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${pair[0]}"/><stop offset="1" stop-color="${pair[1]}"/></linearGradient></defs>
    <rect width="100" height="100" fill="url(#${g})"/>
    <circle cx="82" cy="84" r="22" fill="#fff" opacity=".12"/><circle cx="12" cy="10" r="16" fill="#fff" opacity=".1"/>
    ${a.art}
  </svg>`;
}
