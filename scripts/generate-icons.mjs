// Renders app icons + OG image with headless Chromium. Run: npm run icons
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require("playwright")); } catch { ({ chromium } = require(require("node:child_process").execSync("npm root -g").toString().trim() + "/playwright")); }
import { mkdirSync } from "node:fs";

const mark = (pad) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="100%" height="100%">
  <rect width="64" height="64" ${pad ? "" : 'rx="14"'} fill="#0E5C39"/>
  <g transform="${pad ? "translate(12.8 12.8) scale(0.6)" : ""}">
    <path d="M20 16v32M20 33l15-17M26 27l13 21" stroke="#fff" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    <circle cx="46" cy="19" r="5.5" fill="#F2711C"/>
  </g>
</svg>`;

const badge = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="100%" height="100%">
  <path d="M20 16v32M20 33l15-17M26 27l13 21" stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>`;

const og = `
<div style="width:1200px;height:630px;display:flex;align-items:center;gap:56px;padding:0 96px;box-sizing:border-box;
  background:radial-gradient(120% 90% at 100% 0%,rgba(242,113,28,.45),transparent 55%),linear-gradient(160deg,#0e5c39,#07351f);
  font-family:system-ui,sans-serif;color:#fff">
  <div style="width:220px;height:220px;flex:none;border-radius:56px;overflow:hidden;box-shadow:0 30px 60px rgba(0,0,0,.3)">${mark(false)}</div>
  <div>
    <div style="font-size:84px;font-weight:800;letter-spacing:-2px">Kazi<span style="color:#ff9d5c">Kenya</span></div>
    <div style="font-size:38px;margin-top:12px;opacity:.92;line-height:1.25">Trusted fundis &amp; freelancers<br/>in all 47 counties · M-Pesa escrow</div>
  </div>
</div>`;

mkdirSync("public/icons", { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage();
async function shot(html, size, path, transparent = false) {
  await page.setViewportSize({ width: size.w, height: size.h });
  await page.setContent(`<html><body style="margin:0;background:transparent"><div style="width:${size.w}px;height:${size.h}px">${html}</div></body></html>`);
  await page.screenshot({ path, omitBackground: transparent });
}
for (const s of [192, 512]) await shot(mark(false), { w: s, h: s }, `public/icons/icon-${s}.png`, true);
await shot(mark(true), { w: 512, h: 512 }, "public/icons/maskable-512.png");
await shot(mark(true), { w: 180, h: 180 }, "public/icons/apple-touch-icon.png");
await shot(badge, { w: 96, h: 96 }, "public/icons/badge-96.png", true);
await shot(og, { w: 1200, h: 630 }, "public/og.png");
await shot(mark(false), { w: 512, h: 512 }, "public/icons/play-store-512.png", true);
await browser.close();
console.log("icons generated");
