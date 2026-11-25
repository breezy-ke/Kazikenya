// Renders the Google Play feature graphic (1024x500). Run: node scripts/generate-store-assets.mjs
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require("playwright")); } catch { ({ chromium } = require(execSync("npm root -g").toString().trim() + "/playwright")); }

const mark = `<svg viewBox="0 0 64 64" width="100%" height="100%"><rect width="64" height="64" rx="14" fill="#0E5C39"/>
<path d="M20 16v32M20 33l15-17M26 27l13 21" stroke="#fff" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
<circle cx="46" cy="19" r="5.5" fill="#F2711C"/></svg>`;
const chip = (t) => `<span style="background:rgba(255,255,255,.14);border-radius:999px;padding:10px 18px;font-size:22px;font-weight:600">✓ ${t}</span>`;
const html = `<div style="width:1024px;height:500px;box-sizing:border-box;padding:0 72px;display:flex;align-items:center;gap:48px;color:#fff;
  font-family:system-ui,sans-serif;background:radial-gradient(110% 90% at 100% 0%,rgba(242,113,28,.5),transparent 55%),linear-gradient(160deg,#0e5c39,#07351f)">
  <div style="width:180px;height:180px;flex:none;border-radius:44px;overflow:hidden;box-shadow:0 24px 50px rgba(0,0,0,.35)">${mark}</div>
  <div>
    <div style="font-size:70px;font-weight:800;letter-spacing:-2px">Kazi<span style="color:#ff9d5c">Kenya</span></div>
    <div style="font-size:34px;line-height:1.25;margin-top:8px;opacity:.95">Hire trusted fundis near you.<br/>Pay safely with M-Pesa escrow.</div>
    <div style="display:flex;gap:12px;margin-top:26px">${chip("47 counties")}${chip("ID-verified pros")}${chip("Kiswahili")}</div>
  </div></div>`;
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1024, height: 500 } });
await p.setContent(`<html><body style="margin:0">${html}</body></html>`);
await p.screenshot({ path: "store/feature-graphic-1024x500.png" });
await b.close();
console.log("store/feature-graphic-1024x500.png");
