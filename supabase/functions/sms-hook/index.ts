// Supabase Auth "Send SMS" hook → Africa's Talking (cheapest reliable SMS route for Kenyan numbers).
// Configure in Supabase Dashboard → Authentication → Hooks → Send SMS hook → HTTPS → this function's URL.
// Secrets: SEND_SMS_HOOK_SECRET (from the hook screen, "v1,whsec_..."), AT_USERNAME, AT_API_KEY, optional AT_SENDER_ID.
// Use AT_USERNAME=sandbox to test with the Africa's Talking simulator.

import { Webhook } from "npm:standardwebhooks@1.0.0";

const AT_USERNAME = Deno.env.get("AT_USERNAME") ?? "sandbox";
const AT_API_KEY = Deno.env.get("AT_API_KEY") ?? "";
const AT_SENDER_ID = Deno.env.get("AT_SENDER_ID") ?? "";
const HOOK_SECRET = (Deno.env.get("SEND_SMS_HOOK_SECRET") ?? "").replace("v1,whsec_", "");
const AT_URL =
  AT_USERNAME === "sandbox"
    ? "https://api.sandbox.africastalking.com/version1/messaging"
    : "https://api.africastalking.com/version1/messaging";

const err = (message: string, status = 400) =>
  new Response(JSON.stringify({ error: { http_code: status, message } }), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return err("Method not allowed", 405);
  const payload = await req.text();
  let data: { user: { phone: string }; sms: { otp: string } };
  try {
    const wh = new Webhook(HOOK_SECRET);
    data = wh.verify(payload, Object.fromEntries(req.headers)) as typeof data;
  } catch {
    return err("Invalid signature", 401);
  }

  const phone = `+${String(data.user.phone).replace(/\D/g, "")}`;
  const message = `${data.sms.otp} is your KaziKenya code. Usinipe mtu yeyote / Don't share it. It expires in 10 minutes.`;

  const form = new URLSearchParams({ username: AT_USERNAME, to: phone, message });
  if (AT_SENDER_ID) form.set("from", AT_SENDER_ID);

  const res = await fetch(AT_URL, {
    method: "POST",
    headers: { apiKey: AT_API_KEY, Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
  });
  const j = await res.json().catch(() => ({}));
  const recipient = j?.SMSMessageData?.Recipients?.[0];
  if (!res.ok || !recipient || !["Success", "Sent"].includes(recipient.status)) {
    console.error("Africa's Talking error", res.status, JSON.stringify(j));
    return err("Could not send SMS. Please try again.", 502);
  }
  return new Response(JSON.stringify({}), { status: 200, headers: { "Content-Type": "application/json" } });
});
