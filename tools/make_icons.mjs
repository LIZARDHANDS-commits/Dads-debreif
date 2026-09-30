// Draws the app icon (a loop around a T-6 seen from above) and writes the
// SVG favicon plus the PNG sizes browsers ask for when installing the app.
// Run once after changing the drawing: node tools/make_icons.mjs
// The PNGs are drawn by the Chromium that Playwright uses.
import { writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const BG = '#020a10';
const ACCENT = '#42bfe9';
const PLANE = '#e6f2f8';
const OUT = 'public/icons';

// The loop: an arc with a gap at the top and an arrowhead closing it. It stays
// inside the maskable safe zone (a circle of radius 0.4 × size).
function loop() {
  const c = 256;
  const r = 170;
  const rad = (deg) => (deg * Math.PI) / 180;
  const at = (deg, radius = r) => [c + radius * Math.cos(rad(deg)), c + radius * Math.sin(rad(deg))];
  const [sx, sy] = at(-68);
  const [ex, ey] = at(-122);
  const end = rad(-122);
  const tangent = [-Math.sin(end), Math.cos(end)];
  const normal = [Math.cos(end), Math.sin(end)];
  const p = (x, y) => `${x.toFixed(1)} ${y.toFixed(1)}`;
  const tip = p(ex + 44 * tangent[0], ey + 44 * tangent[1]);
  const b1 = p(ex + 30 * normal[0], ey + 30 * normal[1]);
  const b2 = p(ex - 30 * normal[0], ey - 30 * normal[1]);
  return `<path d="M ${p(sx, sy)} A ${r} ${r} 0 1 1 ${p(ex, ey)}" fill="none" stroke="${ACCENT}" stroke-width="30"/>
  <path d="M ${b1} L ${tip} L ${b2} Z" fill="${ACCENT}"/>`;
}

const plane = `<g fill="${PLANE}">
    <path d="M 256 150 C 268 150 270 166 270 180 L 268 350 L 244 350 L 242 180 C 242 166 244 150 256 150 Z"/>
    <path d="M 150 258 L 256 238 L 362 258 L 362 278 L 256 272 L 150 278 Z"/>
    <path d="M 208 344 L 256 334 L 304 344 L 304 358 L 256 354 L 208 358 Z"/>
  </g>
  <ellipse cx="256" cy="212" rx="8" ry="20" fill="${BG}"/>`;

const svg = ({ rounded }) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${rounded ? 96 : 0}" fill="${BG}"/>
  ${loop()}
  ${plane}
</svg>
`;

writeFileSync(`${OUT}/icon.svg`, svg({ rounded: true }));

const pngs = [
  { file: 'icon-192.png', size: 192, rounded: true },
  { file: 'icon-512.png', size: 512, rounded: true },
  { file: 'icon-maskable-512.png', size: 512, rounded: false },
  { file: 'apple-touch-icon.png', size: 180, rounded: false },
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const { file, size, rounded } of pngs) {
  await page.setViewportSize({ width: size, height: size });
  const html = `<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg({ rounded })}`;
  await page.setContent(html);
  await page.screenshot({ path: `${OUT}/${file}`, omitBackground: true });
}
await browser.close();
console.log(`Wrote ${OUT}/icon.svg and ${pngs.length} PNGs`);
