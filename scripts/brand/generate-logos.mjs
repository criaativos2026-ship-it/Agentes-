/**
 * Gera os arquivos da marca NEXUS AI (SVG vetorial puro, sem depender de fontes instaladas).
 * Uso: node scripts/brand/generate-logos.mjs
 *
 * Símbolo: um "N" traçado como um único caminho entre dois nós — entrada (base à esquerda) e
 * resultado (topo à direita). O nó de resultado é o único ponto de cor: o azul de sinal.
 * Logotipo: "NEXUS" em Barlow Semi Condensed 500 (SIL OFL), caixa alta, espaçamento aberto;
 * "AI" em peso 400. As letras são convertidas em contornos.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import opentype from "opentype.js";

const INK = "#010205";
const SIGNAL = "#1A44EA";
const WHITE = "#FFFFFF";
const FONT = "node_modules/@fontsource/barlow-semi-condensed/files/barlow-semi-condensed-latin";
const load = (w) => {
  const buf = readFileSync(`${FONT}-${w}-normal.woff`);
  return opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
};
const medium = load(500);
const regular = load(400);

/** Texto → contorno, com espaçamento extra (em unidades da fonte por letra). */
function textPath(font, text, x, baseline, size, tracking) {
  let cursor = x;
  const parts = [];
  for (const ch of text) {
    if (ch === " ") {
      cursor += font.charToGlyph(" ").advanceWidth * (size / font.unitsPerEm) + tracking;
      continue;
    }
    const g = font.charToGlyph(ch);
    parts.push(g.getPath(cursor, baseline, size).toPathData(2));
    cursor += g.advanceWidth * (size / font.unitsPerEm) + tracking;
  }
  return { d: parts.join(""), end: cursor - tracking };
}

/** Símbolo em uma caixa 64×64. */
function symbol({ ink, node, x = 0, y = 0, scale = 1 }) {
  const t = (n) => +(n * scale).toFixed(2);
  const X = (n) => +(x + n * scale).toFixed(2);
  const Y = (n) => +(y + n * scale).toFixed(2);
  return [
    `<path d="M${X(19)} ${Y(46)}V${Y(18)}L${X(45)} ${Y(46)}V${Y(18)}" fill="none" stroke="${ink}" stroke-width="${t(6)}" stroke-linejoin="miter" stroke-miterlimit="10"/>`,
    `<circle cx="${X(19)}" cy="${Y(46)}" r="${t(6.5)}" fill="${ink}"/>`,
    `<circle cx="${X(45)}" cy="${Y(18)}" r="${t(6.5)}" fill="${node}"/>`,
  ].join("");
}

const svg = (w, h, body, title) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${title}"><title>${title}</title>${body}</svg>\n`;

/** Ícone de aplicativo (favicon): quadrado escuro arredondado. */
const appIcon = (bg = INK) =>
  svg(64, 64, `<rect width="64" height="64" rx="14" fill="${bg}"/>${symbol({ ink: WHITE, node: SIGNAL, x: 6, y: 6, scale: 52 / 64 })}`, "NEXUS AI");

/** Logotipo e assinatura horizontal. */
function wordmark(color, withSymbol) {
  const size = 40;
  const tracking = 6.4; // ~0,16em
  const left = withSymbol ? 68 : 0;
  const nexus = textPath(medium, "NEXUS", left, 44, size, tracking);
  const ai = textPath(regular, "AI", nexus.end + 14, 44, size, tracking);
  const width = Math.ceil(ai.end + 2);
  const body = [
    withSymbol ? symbol({ ink: color, node: SIGNAL, x: 0, y: 2, scale: 52 / 64 }) : "",
    `<path d="${nexus.d}" fill="${color}"/>`,
    `<path d="${ai.d}" fill="${color}"/>`,
  ].join("");
  return { svg: svg(width, 56, body, "NEXUS AI"), width };
}

mkdirSync("public/brand", { recursive: true });
const files = {
  "public/brand/nexus-simbolo.svg": svg(64, 64, symbol({ ink: INK, node: SIGNAL }), "NEXUS AI"),
  "public/brand/nexus-simbolo-negativo.svg": svg(64, 64, symbol({ ink: WHITE, node: SIGNAL }), "NEXUS AI"),
  "public/brand/nexus-simbolo-mono.svg": svg(64, 64, symbol({ ink: INK, node: INK }), "NEXUS AI"),
  "public/brand/nexus-icone-app.svg": appIcon(),
  "public/brand/nexus-logotipo.svg": wordmark(INK, false).svg,
  "public/brand/nexus-logotipo-negativo.svg": wordmark(WHITE, false).svg,
  "public/brand/nexus-assinatura.svg": wordmark(INK, true).svg,
  "public/brand/nexus-assinatura-negativa.svg": wordmark(WHITE, true).svg,
  "src/app/icon.svg": appIcon(),
};
for (const [path, content] of Object.entries(files)) writeFileSync(path, content);

// Contornos do logotipo para o componente React (sem fonte externa).
const wm = textPath(medium, "NEXUS", 68, 44, 40, 6.4);
const ai = textPath(regular, "AI", wm.end + 14, 44, 40, 6.4);
writeFileSync(
  "src/components/brand-paths.ts",
  `// Gerado por scripts/brand/generate-logos.mjs — não edite à mão.\nexport const WORDMARK_NEXUS = ${JSON.stringify(wm.d)};\nexport const WORDMARK_AI = ${JSON.stringify(ai.d)};\nexport const WORDMARK_WIDTH = ${Math.ceil(ai.end + 2)};\n`,
);
console.log("Marca gerada:", Object.keys(files).join(", "));
