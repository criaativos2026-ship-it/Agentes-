/**
 * Monta o manual de marca visual (página única, imagens e SVG embutidos).
 * Uso: node scripts/brand/build-manual.mjs  →  docs/marca/manual-de-marca.html
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const read = (p) => readFileSync(p, "utf8").trim();
const clean = (svg, extra = "") =>
  svg.replace(/<title>.*?<\/title>/, "").replace(' role="img" aria-label="NEXUS AI"', ` aria-hidden="true"${extra}`).replace(/ width="\d+" height="\d+"/, "");
const sig = read("public/brand/nexus-assinatura.svg");
const sym = read("public/brand/nexus-simbolo.svg");
const jpg = (p) => `data:image/jpeg;base64,${readFileSync(p).toString("base64")}`;

// Desenho de construção: grade de 64 unidades com cotas fora da área do símbolo.
const grid = [];
for (let i = 0; i <= 64; i += 4) {
  grid.push(`<line x1="${i}" y1="0" x2="${i}" y2="64"/>`, `<line x1="0" y1="${i}" x2="64" y2="${i}"/>`);
}
const t = (x, y, s, anchor = "start") => `<text x="${x}" y="${y}" text-anchor="${anchor}">${s}</text>`;
const construction = `<svg viewBox="-24 -9 112 91.8" aria-hidden="true">
<g stroke="#D8D8DB" stroke-width=".15">${grid.join("")}</g>
<rect x="0" y="0" width="64" height="64" fill="none" stroke="#A8A8AD" stroke-width=".3"/>
<g stroke="#1A44EA" stroke-width=".25" stroke-dasharray="1 1">
<line x1="19" y1="-4" x2="19" y2="68"/><line x1="45" y1="-4" x2="45" y2="68"/>
<line x1="-4" y1="18" x2="68" y2="18"/><line x1="-4" y1="46" x2="68" y2="46"/></g>
<path d="M19 46V18L45 46V18" fill="none" stroke="#010205" stroke-width="6" stroke-miterlimit="10"/>
<circle cx="19" cy="46" r="6.5" fill="#010205"/>
<circle class="node-r" cx="45" cy="18" r="6.5" fill="#1A44EA"/>
<circle cx="45" cy="18" r="9.5" fill="none" stroke="#1A44EA" stroke-width=".25"/>
<circle cx="19" cy="46" r="9.5" fill="none" stroke="#6B6D70" stroke-width=".25"/>
<g font-family="Barlow, sans-serif" font-size="2.7" fill="#5C5E62">
${t(19, -5.5, "x 19", "middle")}${t(45, -5.5, "x 45", "middle")}
${t(-5, 18.9, "y 18", "end")}${t(-5, 46.9, "y 46", "end")}
${t(69, 14.5, "resultado")}${t(69, 18, "nó r 6,5 · azul")}
${t(-5, 54, "entrada", "end")}${t(-5, 57.5, "nó r 6,5", "end")}
${t(69, 33, "traço único")}${t(69, 36.5, "espessura 6")}
${t(0, 72, "grade 64 × 64 · módulo 4")}
</g>
<line x1="56" y1="32" x2="68" y2="34" stroke="#6B6D70" stroke-width=".2"/>
</svg>`;

const swatches = [
  ["#010205", "Tinta", "Títulos, botão principal, marca"],
  ["#393A3D", "Texto corrido", "Parágrafos"],
  ["#6B6D70", "Rótulo", "Legendas e dicas"],
  ["#FFFFFF", "Tela", "Fundo e cartões"],
  ["#F2F2F3", "Superfície", "Barra lateral, faixas, hover"],
  ["#D8D8DB", "Borda", "Cartões e réguas"],
  ["#1A44EA", "Azul de sinal", "Foco, links, nó do símbolo"],
  ["#237A1D", "Sucesso", "Concluído"],
  ["#AC5702", "Atenção", "Pendente, aguardando"],
  ["#BA171D", "Erro", "Falha, ação destrutiva"],
].map(([h, n, u]) => `<div><i style="background:${h}"></i><b>${n}</b><span><code>${h}</code></span><span>${u}</span></div>`).join("");

function lum(h) {
  const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return ((x + 0.05) / (y + 0.05)).toFixed(1).replace(".", ",");
};
const contrast = [
  ["#010205", "Qualquer texto"],
  ["#393A3D", "Qualquer texto"],
  ["#5C5E62", "Texto secundário"],
  ["#6B6D70", "Rótulos (AA)"],
  ["#1A44EA", "Links e foco"],
  ["#237A1D", "Estado: sucesso"],
  ["#AC5702", "Estado: atenção"],
  ["#BA171D", "Estado: erro"],
  ["#A8A8AD", "Só bordas, nunca texto"],
].map(([h, u]) => `<tr><td><span class="dot" style="background:${h}"></span><code>${h}</code></td><td>${u}</td><td class="n">${ratio(h, "#FFFFFF")} : 1</td><td class="n">${ratio(h, "#F2F2F3")} : 1</td></tr>`).join("");

// Exemplos de uso incorreto (desenhados de propósito errados).
const symPath = (ink, node, extra = "") =>
  `<svg viewBox="0 0 64 64" aria-hidden="true"${extra}><path d="M19 46V18L45 46V18" fill="none" stroke="${ink}" stroke-width="6"/><circle cx="19" cy="46" r="6.5" fill="${ink}"/><circle cx="45" cy="18" r="6.5" fill="${node}"/></svg>`;
const badGlow = `<svg viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="bg1" x1="0" x2="1"><stop offset="0" stop-color="#7b2ff7"/><stop offset="1" stop-color="#f107a3"/></linearGradient><filter id="gl"><feGaussianBlur stdDeviation="2.5"/></filter></defs><path d="M19 46V18L45 46V18" fill="none" stroke="#f107a3" stroke-width="8" filter="url(#gl)" opacity=".7"/><path d="M19 46V18L45 46V18" fill="none" stroke="url(#bg1)" stroke-width="6"/><circle cx="19" cy="46" r="6.5" fill="url(#bg1)"/><circle cx="45" cy="18" r="6.5" fill="url(#bg1)"/></svg>`;

const out = read("scripts/brand/manual-template.html")
  .replace("{{CONSTRUCTION}}", construction)
  .replaceAll("{{SIG_SMALL}}", clean(sig))
  .replace("{{SIG}}", clean(sig))
  .replace("{{SIG_NEG}}", clean(read("public/brand/nexus-assinatura-negativa.svg")))
  .replace("{{SYM}}", clean(sym))
  .replace("{{ICON}}", clean(read("public/brand/nexus-icone-app.svg")))
  .replace("{{BAD_COLOR}}", symPath("#E0681A", "#2BD47D"))
  .replace("{{BAD_SKEW}}", symPath("#010205", "#1A44EA", ' style="transform:skewX(-18deg) scaleY(.75)"'))
  .replace("{{BAD_GLOW}}", badGlow)
  .replace("{{BAD_POS}}", symPath("#010205", "#1A44EA"))
  .replace("{{SWATCHES}}", swatches)
  .replace("{{CONTRAST}}", contrast)
  .replace("{{SHOT_DESK}}", jpg("preview/telas/c01-painel.jpg"))
  .replace("{{SHOT_PHONE}}", jpg("preview/telas/m01-painel.jpg"));

mkdirSync("docs/marca", { recursive: true });
writeFileSync("docs/marca/manual-de-marca.html", out);
console.log("docs/marca/manual-de-marca.html", Math.round(out.length / 1024), "KB");
