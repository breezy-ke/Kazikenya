// End-to-end smoke test of the core KaziKenya loop on a phone viewport.
// Usage: BASE=http://localhost:3100 E2E_PASSWORD=... node e2e/full-flow.mjs
// Requires two confirmed email/password test users (see README → Testing).
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
const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://kfnelxnsuejinrcceeap.supabase.co";
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_DNgxZpWSc_0IG_zxrsVQ2A_8GUA1ED_";
const PASS = process.env.E2E_PASSWORD;
const SHOTS = process.env.SHOTS ?? "e2e/shots";
const BUYER = process.env.E2E_BUYER ?? "e2e-buyer@kazikenya.test";
const FUNDI = process.env.E2E_FUNDI ?? "e2e-fundi@kazikenya.test";
mkdirSync(SHOTS, { recursive: true });

async function session(email) {
  const r = await fetch(`${SUPA}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASS }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error(`login failed for ${email}: ${JSON.stringify(j)}`);
  if (process.env.E2E_RESET === "1") {
    const rr = await fetch(`${SUPA}/rest/v1/rpc/e2e_reset`, {
      method: "POST",
      headers: { apikey: KEY, Authorization: `Bearer ${j.access_token}`, "Content-Type": "application/json" },
      body: "{}",
    });
    if (!rr.ok) throw new Error(`reset failed: ${await rr.text()}`);
  }
  return j;
}

const browser = await chromium.launch();
async function ctxFor(email) {
  const s = await session(email);
  const ctx = await browser.newContext({ ...devices["Pixel 7"], locale: "en-KE" });
  await ctx.addInitScript((v) => {
    if (!localStorage.getItem("kazikenya-auth")) localStorage.setItem("kazikenya-auth", v);
  }, JSON.stringify(s));
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log(`[${email}] pageerror:`, e.message));
  return page;
}
const step = (m) => console.log(`✓ ${m}`);
const shot = (p, name) => p.screenshot({ path: `${SHOTS}/${name}.png` });

const fundi = await ctxFor(FUNDI);
const buyer = await ctxFor(BUYER);
process.on("uncaughtException", async (e) => {
  console.error("FAILED:", e.message.split("\n")[0]);
  await buyer.screenshot({ path: `${SHOTS}/fail-buyer.png` }).catch(() => {});
  await fundi.screenshot({ path: `${SHOTS}/fail-fundi.png` }).catch(() => {});
  await browser.close();
  process.exit(1);
});

// 1. Provider onboarding
await fundi.goto(`${BASE}/onboarding`);
await fundi.getByLabel("Full name").fill("Otieno Fundi (Test)");
await fundi.getByRole("button", { name: "Continue" }).click();
await fundi.locator("select#county").selectOption("47");
await fundi.getByLabel("Town / estate").fill("Kasarani");
await fundi.getByRole("button", { name: "Continue" }).click();
await fundi.getByRole("button", { name: /I want to work/ }).click();
await fundi.getByRole("button", { name: "Let's go" }).click();
await fundi.waitForURL(/\/me\/provider/);
await fundi.getByRole("button", { name: "Plumbing", exact: true }).click();
await fundi.getByLabel("Headline").fill("Certified plumber — leaks, installations, boreholes");
await fundi.getByLabel("About your work").fill("8 years fixing homes across Nairobi. I bring my own tools and give a 30-day guarantee.");
await fundi.getByLabel("Starting price").fill("1500");
await fundi.getByLabel("M-Pesa number for payouts").fill("0712345678");
await shot(fundi, "01-provider-setup");
await fundi.getByRole("button", { name: "Publish profile" }).click();
await fundi.waitForURL(/\/verify/);
await shot(fundi, "02-verify");
step("provider onboarded + profile published");

// 2. Buyer onboarding
await buyer.goto(`${BASE}/onboarding`);
await buyer.getByLabel("Full name").fill("Wanjiku Kamau (Test)");
await buyer.getByRole("button", { name: "Continue" }).click();
await buyer.locator("select#county").selectOption("47");
await buyer.getByLabel("Town / estate").fill("Roysambu");
await buyer.getByRole("button", { name: "Continue" }).click();
await buyer.getByRole("button", { name: /I want to hire/ }).click();
await buyer.getByRole("button", { name: "Let's go" }).click();
await buyer.waitForURL((u) => u.pathname === "/");
await buyer.getByText("Top rated in Nairobi").waitFor({ timeout: 15000 });
await buyer.waitForTimeout(800);
await shot(buyer, "03-home-buyer");
step("buyer onboarded, sees providers in Nairobi");

// 3. Explore
await buyer.goto(`${BASE}/explore?cat=1`);
await buyer.getByText("Otieno Fundi (Test)").first().waitFor();
await shot(buyer, "04-explore");
step("explore shows provider");

// 4. Post a job
await buyer.goto(`${BASE}/jobs/new`);
await buyer.getByRole("button", { name: "Plumbing" }).click();
await buyer.getByLabel("Job title").fill("Fix leaking kitchen sink and replace tap");
await buyer.getByLabel("Describe the job").fill("Water leaking under the sink. Tap is old. Ground floor, easy access.");
await buyer.getByPlaceholder("Min").fill("1500");
await buyer.getByPlaceholder("Max").fill("3000");
await buyer.getByRole("button", { name: "Urgent (today)" }).click();
await buyer.getByRole("button", { name: "Post job" }).click();
await buyer.waitForURL(/\/jobs\/[0-9a-f-]{36}$/);
const jobUrl = buyer.url();
await buyer.getByText("No quotes yet").waitFor();
await shot(buyer, "05-job-posted");
step("job posted");

// 5. Provider gets notified and quotes
await fundi.goto(`${BASE}/notifications`);
await fundi.getByText(/Urgent: Plumbing/).waitFor({ timeout: 15000 });
await shot(fundi, "06-provider-notification");
await fundi.goto(jobUrl);
await fundi.getByRole("button", { name: "Send a quote" }).click();
await fundi.getByLabel("Your price (KES)").fill("2500");
await fundi.getByLabel("Message to client").fill("I can come within 2 hours. Price includes a new mixer tap.");
await shot(fundi, "07-quote-sheet");
await fundi.getByRole("dialog").getByRole("button", { name: "Send a quote" }).click();
await fundi.getByText("Your quote").waitFor();
step("provider notified of matching job and sent quote");

// 6. Buyer accepts and pays into escrow
await buyer.reload();
await buyer.getByRole("button", { name: "Accept & hire" }).waitFor();
await shot(buyer, "08-quotes");
await buyer.getByRole("button", { name: "Accept & hire" }).click();
await buyer.waitForURL(/\/bookings\//);
const bookingUrl = buyer.url();
await buyer.getByRole("button", { name: /Pay KES 2,500 via M-Pesa/ }).click();
await buyer.getByLabel("M-Pesa number").fill("0712345678");
await shot(buyer, "09-mpesa");
await buyer.getByRole("button", { name: "Send payment prompt" }).click();
await buyer.getByText("Payment received!").waitFor({ timeout: 20000 });
await shot(buyer, "10-paid");
await buyer.getByRole("button", { name: "Done" }).click();
await buyer.getByText("Paid · in escrow").first().waitFor({ timeout: 15000 });
step("quote accepted, escrow funded via M-Pesa (demo)");

// 7. Provider works
await fundi.goto(bookingUrl);
await fundi.getByRole("button", { name: "Start job" }).click();
await fundi.getByRole("button", { name: "Mark job as done" }).click();
await fundi.getByText("Done · confirm").first().waitFor();
await shot(fundi, "11-provider-booking");
step("provider started + delivered");

// 8. Buyer releases and reviews
await buyer.reload();
await buyer.getByRole("button", { name: "Confirm & release payment" }).click();
await buyer.getByRole("dialog").getByRole("button", { name: "Confirm & release payment" }).click();
await buyer.getByText("Completed").first().waitFor({ timeout: 20000 });
await buyer.getByRole("radio", { name: "5 stars" }).click();
await buyer.getByPlaceholder(/How was the work/).fill("Came on time, fixed it fast and left the kitchen clean. Highly recommend!");
await buyer.getByRole("button", { name: "Submit review" }).click();
await buyer.getByText("Your review").waitFor();
await shot(buyer, "12-completed-review");
step("payment released, review left");

// 9. Provider sees payout + rating
await fundi.goto(`${BASE}/wallet`);
await fundi.getByText("KES 2,325").first().waitFor({ timeout: 15000 });
await shot(fundi, "13-wallet");
await buyer.goto(fundi.url().replace("/wallet", "") + "/explore?cat=1");
await buyer.getByText("5.0").first().waitFor();
step("provider wallet shows KES 2,325 payout (7% fee) and 5.0 rating");

// 10. Swahili + dark mode
await buyer.goto(`${BASE}/me`);
await buyer.getByRole("radio", { name: "Dark" }).click();
await buyer.getByRole("radio", { name: "SW" }).click();
await buyer.goto(`${BASE}/`);
await buyer.getByText("Unahitaji nini leo?").waitFor();
await buyer.waitForTimeout(600);
await shot(buyer, "14-home-sw-dark");
step("Kiswahili + dark mode");

await browser.close();
console.log("ALL STEPS PASSED");
