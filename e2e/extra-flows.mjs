// Secondary flows: chat, direct booking + counter-price, dispute → admin refund, Pro subscription, signed-out pages.
// Run after full-flow.mjs (expects both test users onboarded; the provider must be an admin).
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { execSync } from "node:child_process";

const require = createRequire(import.meta.url);
let pw;
try {
  pw = require("playwright");
} catch {
  pw = require(execSync("npm root -g").toString().trim() + "/playwright");
}
const { chromium, devices } = pw;
const BASE = process.env.BASE ?? "http://localhost:3100";
const SUPA = "https://kfnelxnsuejinrcceeap.supabase.co";
const KEY = "sb_publishable_DNgxZpWSc_0IG_zxrsVQ2A_8GUA1ED_";
const SHOTS = process.env.SHOTS ?? "e2e/shots";
mkdirSync(SHOTS, { recursive: true });

async function session(email) {
  const r = await fetch(`${SUPA}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: process.env.E2E_PASSWORD }),
  });
  return r.json();
}
const browser = await chromium.launch();
async function ctxFor(email) {
  const ctx = await browser.newContext({ ...devices["Pixel 7"], locale: "en-KE" });
  if (email) {
    const s = await session(email);
    await ctx.addInitScript((v) => {
      if (!localStorage.getItem("kazikenya-auth")) localStorage.setItem("kazikenya-auth", v);
    }, JSON.stringify(s));
  }
  const p = await ctx.newPage();
  p.on("pageerror", (e) => console.log(`[${email ?? "anon"}] pageerror:`, e.message));
  return p;
}
const step = (m) => console.log(`✓ ${m}`);
const shot = (p, n) => p.screenshot({ path: `${SHOTS}/${n}.png` });

const anon = await ctxFor(null);
const buyer = await ctxFor("e2e-buyer@kazikenya.test");
const fundi = await ctxFor("e2e-fundi@kazikenya.test");
process.on("uncaughtException", async (e) => {
  console.error("FAILED:", e.message.split("\n")[0]);
  for (const [n, p] of [["anon", anon], ["buyer", buyer], ["fundi", fundi]]) await p.screenshot({ path: `${SHOTS}/xfail-${n}.png` }).catch(() => {});
  await browser.close();
  process.exit(1);
});

// Signed-out experience
await anon.goto(`${BASE}/`);
await anon.getByText("Get it done by trusted local pros.").waitFor();
await anon.getByText("How KaziKenya works").waitFor();
await shot(anon, "x01-landing");
await anon.goto(`${BASE}/login`);
await anon.getByRole("button", { name: "Continue with Google" }).waitFor();
await anon.getByLabel("Phone number").fill("0712");
await anon.getByRole("button", { name: "Send code" }).click();
await anon.getByText("Enter a valid Safaricom, Airtel or Telkom number").waitFor();
await shot(anon, "x02-login");
await anon.goto(`${BASE}/work`);
await anon.waitForURL(/\/login\?next=/);
step("signed-out landing, login validation, protected-route redirect");

// Find provider id
await buyer.goto(`${BASE}/explore?cat=1`);
await buyer.getByText("Otieno Fundi (Test)").first().click();
await buyer.waitForURL(/\/p\//);
const providerUrl = buyer.url();
await buyer.getByText("Came on time").waitFor();
await shot(buyer, "x03-provider-profile");
step("provider profile shows review");

// Chat
await buyer.getByRole("button", { name: "Message" }).click();
await buyer.waitForURL(/\/inbox\//);
await buyer.getByLabel("Type a message…").fill("Habari! Are you free on Saturday?");
await buyer.getByRole("button", { name: "Send" }).click();
await buyer.getByText("Habari! Are you free on Saturday?").waitFor();
await buyer.getByLabel("Type a message…").fill("My number is 0712 345 678");
await buyer.getByText(/Payments outside escrow aren't protected/).waitFor();
await shot(buyer, "x04-chat-warning");
await buyer.getByLabel("Type a message…").fill("");
await fundi.goto(`${BASE}/inbox`);
await fundi.getByText("Habari! Are you free on Saturday?").waitFor({ timeout: 15000 });
await fundi.getByText("Habari! Are you free on Saturday?").click();
await fundi.getByLabel("Type a message…").fill("Ndio, niko free. I can come at 9am.");
await fundi.getByRole("button", { name: "Send" }).click();
await buyer.getByText("Ndio, niko free. I can come at 9am.").waitFor({ timeout: 15000 });
step("realtime chat both ways + off-platform phone warning");

// Direct booking with counter-price
await buyer.goto(providerUrl);
await buyer.getByRole("link", { name: "Book now" }).click();
await buyer.getByLabel("What do you need done?").fill("Install water tank pump");
await buyer.getByLabel("Your offer (KES)").fill("4000");
await buyer.getByRole("button", { name: "Send booking request" }).click();
await buyer.waitForURL(/\/bookings\//);
const bUrl = buyer.url();
await fundi.goto(bUrl);
await fundi.getByRole("button", { name: "Accept job" }).click();
await fundi.getByLabel("Your price (KES)").fill("4500");
await fundi.getByRole("dialog").getByRole("button", { name: "Accept job" }).click();
await fundi.getByText("Awaiting payment").first().waitFor();
await buyer.reload();
await buyer.getByRole("button", { name: /Pay KES 4,500 via M-Pesa/ }).click();
await buyer.getByLabel("M-Pesa number").fill("0712345678");
await buyer.getByRole("button", { name: "Send payment prompt" }).click();
await buyer.getByText("Payment received!").waitFor({ timeout: 20000 });
await buyer.getByRole("button", { name: "Done" }).click();
await buyer.getByText("Paid · in escrow").first().waitFor({ timeout: 15000 });
step("direct booking → provider counter-price 4,500 → M-Pesa escrow");

// Dispute → admin refund
await buyer.getByRole("button", { name: "Report a problem" }).click();
await buyer.getByRole("radio", { name: "Didn't show up" }).click();
await buyer.getByLabel("Tell us more").fill("Waited all morning, no show.");
await buyer.getByRole("button", { name: "Submit to KaziKenya team" }).click();
await buyer.getByText("In dispute").first().waitFor();
await shot(buyer, "x05-dispute");
await fundi.goto(`${BASE}/admin`);
await fundi.getByText("Users").first().waitFor();
await shot(fundi, "x06-admin");
await fundi.getByRole("button", { name: /Disputes/ }).click();
await fundi.getByText("Install water tank pump").waitFor();
await fundi.getByRole("button", { name: "Refund client" }).click();
await fundi.getByText("Resolved").waitFor({ timeout: 20000 });
await buyer.reload();
await buyer.getByText("Refunded").first().waitFor({ timeout: 15000 });
step("dispute opened → admin refunded client");

// Pro subscription
await fundi.goto(`${BASE}/wallet`);
await fundi.getByRole("button", { name: "Upgrade to Pro" }).click();
await fundi.getByLabel("M-Pesa number").fill("0712345678");
await fundi.getByRole("button", { name: "Send payment prompt" }).click();
await fundi.getByText("Payment received!").waitFor({ timeout: 20000 });
await fundi.getByRole("button", { name: "Done" }).click();
await fundi.getByText(/Pro active until/).waitFor({ timeout: 15000 });
await shot(fundi, "x07-pro");
step("Pro subscription via M-Pesa (demo) activated");

// Notifications page
await buyer.goto(`${BASE}/notifications`);
await buyer.getByText("Refund issued").waitFor();
await shot(buyer, "x08-notifications");
step("notifications list");

await browser.close();
console.log("EXTRA FLOWS PASSED");
