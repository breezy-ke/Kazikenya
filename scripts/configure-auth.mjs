// Configures Supabase Auth for KaziKenya through the Management API.
// Needs a Supabase personal access token: either SUPABASE_ACCESS_TOKEN in the environment,
// or a cloud-environment network secret for api.supabase.com (the proxy adds it to requests).
// Usage: SITE_URL=https://kazikenya-tau.vercel.app node scripts/configure-auth.mjs [--dry-run]
const REF = process.env.SUPABASE_PROJECT_REF ?? "kfnelxnsuejinrcceeap";
const SITE = (process.env.SITE_URL ?? "https://kazikenya-tau.vercel.app").replace(/\/$/, "");
const DRY = process.argv.includes("--dry-run");
const API = `https://api.supabase.com/v1/projects/${REF}/config/auth`;
const headers = { "Content-Type": "application/json" };
if (process.env.SUPABASE_ACCESS_TOKEN) headers.Authorization = `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`;
else headers.Authorization = "Bearer injected-by-proxy";

const codeEmail = (heading, intro) => `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto;padding:24px;color:#0f1f18">
  <h2 style="margin:0 0 8px">${heading}</h2>
  <p>${intro}</p>
  <p style="font-size:32px;font-weight:800;letter-spacing:8px;margin:20px 0">{{ .Token }}</p>
  <p>Or tap: <a href="{{ .ConfirmationURL }}" style="color:#0e5c39;font-weight:700">Sign in to KaziKenya</a></p>
  <p style="color:#64736b;font-size:13px">Usinipe mtu yeyote nambari hii · Don't share this code. It expires soon.</p>
</div>`;

const patch = {
  site_url: SITE,
  uri_allow_list: [`${SITE}/auth/callback`, `${SITE}/**`, "http://localhost:3000/auth/callback"].join(","),
  external_phone_enabled: true,
  mailer_otp_exp: 3600,
  mailer_subjects_magic_link: "Your KaziKenya sign-in code",
  mailer_templates_magic_link_content: codeEmail("Your KaziKenya code", "Enter this code in the app to sign in:"),
  mailer_subjects_confirmation: "Confirm your KaziKenya account",
  mailer_templates_confirmation_content: codeEmail("Karibu KaziKenya! 🎉", "Enter this code in the app to finish signing up:"),
};

const before = await fetch(API, { headers });
if (!before.ok) {
  console.error(`Cannot read auth config (${before.status}): ${await before.text()}`);
  process.exit(1);
}
const cur = await before.json();
console.log("current site_url:", cur.site_url, "| allow list:", cur.uri_allow_list || "(none)");
if (DRY) {
  console.log("dry run — would apply:", Object.keys(patch).join(", "));
  process.exit(0);
}
const res = await fetch(API, { method: "PATCH", headers, body: JSON.stringify(patch) });
if (!res.ok) {
  console.error(`Update failed (${res.status}): ${await res.text()}`);
  process.exit(1);
}
const after = await res.json();
console.log("✓ site_url:", after.site_url);
console.log("✓ redirect allow list:", after.uri_allow_list);
console.log("✓ email templates now include the 6-digit code");
