/** Gera os ícones em PNG a partir do SVG oficial (usa o Chromium do Playwright). */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const svg = readFileSync("public/brand/nexus-icone-app.svg", "utf8");
// Ícone da Apple: a própria plataforma arredonda os cantos, então o fundo vai cheio.
const square = svg.replace('rx="14"', 'rx="0"');
const targets = [
  ["src/app/apple-icon.png", 180, square],
  ["public/brand/nexus-icone-192.png", 192, svg],
  ["public/brand/nexus-icone-512.png", 512, svg],
];
const browser = await chromium.launch();
for (const [path, size, source] of targets) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  const sized = source.replace(/width="64" height="64"/, `width="${size}" height="${size}"`);
  await page.setContent(`<html><body style="margin:0;background:transparent">${sized}</body></html>`);
  await page.locator("svg").screenshot({ path, omitBackground: true });
  await page.close();
}
await browser.close();
console.log("PNG gerados:", targets.map((t) => t[0]).join(", "));
