// KaziKenya payments: M-Pesa (Daraja) STK push, escrow release/refund and B2C payouts.
//
// App calls (POST JSON, user JWT in Authorization):
//   { action: "stk", purpose: "escrow"|"subscription", booking_id?, phone }
//   { action: "release", booking_id }                    buyer (or admin)
//   { action: "refund", booking_id, note? }              admin
//   { action: "process_payouts" }                        admin: retry pending/failed payouts
//   { action: "mark_paid", payout_id, receipt }          admin: record a manual payout
// Daraja callbacks (no JWT; verified with a secret token in the URL):
//   ?cb=stk&token=…      ?cb=b2c&token=…      ?cb=b2c_timeout&token=…
//
// Without MPESA_CONSUMER_KEY the function runs in DEMO mode: payments succeed instantly
// and are flagged `simulated`, so the whole product flow can be tested before Daraja go-live.

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.119.2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const env = (k: string) => Deno.env.get(k) ?? "";

const LIVE = !!env("MPESA_CONSUMER_KEY") && env("MPESA_MODE") !== "demo";
const DARAJA = env("MPESA_ENV") === "production" ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke";
const SHORTCODE = env("MPESA_SHORTCODE") || "174379"; // sandbox default
const PASSKEY = env("MPESA_PASSKEY") || "bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919"; // public sandbox passkey
const TX_TYPE = env("MPESA_TRANSACTION_TYPE") || "CustomerPayBillOnline"; // or CustomerBuyGoodsOnline for a Till
const PARTY_B = env("MPESA_PARTY_B") || SHORTCODE;
const B2C_READY = LIVE && !!env("MPESA_B2C_INITIATOR") && !!env("MPESA_B2C_SECURITY_CREDENTIAL");

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function callbackToken(): Promise<string> {
  const custom = env("MPESA_CALLBACK_TOKEN");
  if (custom) return custom;
  const data = new TextEncoder().encode(`${SERVICE_KEY}:kazikenya-mpesa-callback`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 40);
}

function nairobiTimestamp(): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Nairobi", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(new Date());
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${g("year")}${g("month")}${g("day")}${g("hour") === "24" ? "00" : g("hour")}${g("minute")}${g("second")}`;
}

function normalizePhone(input: string): string | null {
  let n = String(input ?? "").replace(/\D/g, "");
  if (n.startsWith("0") && n.length === 10) n = "254" + n.slice(1);
  else if ((n.startsWith("7") || n.startsWith("1")) && n.length === 9) n = "254" + n;
  return /^254(7|1)\d{8}$/.test(n) ? n : null;
}

let tokenCache: { token: string; exp: number } | null = null;
async function darajaToken(): Promise<string> {
  if (tokenCache && tokenCache.exp > Date.now()) return tokenCache.token;
  const basic = btoa(`${env("MPESA_CONSUMER_KEY")}:${env("MPESA_CONSUMER_SECRET")}`);
  const res = await fetch(`${DARAJA}/oauth/v1/generate?grant_type=client_credentials`, { headers: { Authorization: `Basic ${basic}` } });
  if (!res.ok) throw new HttpError(502, `M-Pesa auth failed (${res.status})`);
  const j = await res.json();
  tokenCache = { token: j.access_token, exp: Date.now() + (Number(j.expires_in ?? 3599) - 60) * 1000 };
  return tokenCache.token;
}

async function requireUser(req: Request, admin: SupabaseClient) {
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) throw new HttpError(401, "AUTH_REQUIRED");
  const { data, error } = await admin.auth.getUser(jwt);
  if (error || !data.user) throw new HttpError(401, "AUTH_REQUIRED");
  const { data: profile } = await admin.from("profiles").select("id,is_admin,suspended").eq("id", data.user.id).single();
  if (profile?.suspended) throw new HttpError(403, "SUSPENDED");
  return { id: data.user.id, isAdmin: !!profile?.is_admin };
}

// ---------------------------------------------------------------------------
// Effects of a successful incoming payment
// ---------------------------------------------------------------------------
async function applyPaymentSuccess(admin: SupabaseClient, payment: { purpose: string; booking_id: string | null; user_id: string }) {
  if (payment.purpose === "escrow" && payment.booking_id) {
    const { error } = await admin.rpc("fund_booking", { p_booking: payment.booking_id });
    if (error) console.error("fund_booking", error);
  } else if (payment.purpose === "subscription") {
    const { error } = await admin.rpc("activate_pro", { p_user: payment.user_id });
    if (error) console.error("activate_pro", error);
  }
}

// ---------------------------------------------------------------------------
// STK push
// ---------------------------------------------------------------------------
async function stk(req: Request, body: Record<string, unknown>, admin: SupabaseClient) {
  const user = await requireUser(req, admin);
  const phone = normalizePhone(String(body.phone ?? ""));
  if (!phone) throw new HttpError(400, "INVALID_PHONE");
  const purpose = body.purpose === "subscription" ? "subscription" : "escrow";

  let amount = 0;
  let bookingId: string | null = null;
  let reference = "KAZIPRO";
  let description = "KaziKenya Pro";

  if (purpose === "escrow") {
    bookingId = String(body.booking_id ?? "");
    const { data: b } = await admin.from("bookings").select("id,ref,buyer_id,status,amount,title").eq("id", bookingId).maybeSingle();
    if (!b || b.buyer_id !== user.id) throw new HttpError(403, "NOT_ALLOWED");
    if (b.status !== "awaiting_payment") throw new HttpError(409, "NOT_AVAILABLE");
    amount = b.amount;
    reference = `KAZI${b.ref}`.slice(0, 12);
    description = "Escrow";
    // Reuse a very recent pending request instead of spamming the phone.
    const { data: recent } = await admin
      .from("payments").select("*").eq("booking_id", bookingId).eq("status", "pending")
      .gte("created_at", new Date(Date.now() - 45_000).toISOString()).limit(1).maybeSingle();
    if (recent) return { payment: recent, live: LIVE };
  } else {
    const { data: pp } = await admin.from("provider_profiles").select("id").eq("id", user.id).maybeSingle();
    if (!pp) throw new HttpError(403, "NOT_PROVIDER");
    const { data: s } = await admin.from("platform_settings").select("pro_price_kes").single();
    amount = s?.pro_price_kes ?? 299;
  }

  const { data: payment, error } = await admin
    .from("payments")
    .insert({ user_id: user.id, booking_id: bookingId, purpose, amount, phone, simulated: !LIVE })
    .select("*")
    .single();
  if (error) throw new HttpError(500, error.message);

  if (!LIVE) {
    const receipt = `SIM${crypto.randomUUID().replace(/-/g, "").slice(0, 7).toUpperCase()}`;
    const { data: done } = await admin
      .from("payments")
      .update({ status: "success", mpesa_receipt: receipt, result_code: 0, result_desc: "Demo payment (no money moved)" })
      .eq("id", payment.id).select("*").single();
    await applyPaymentSuccess(admin, payment);
    return { payment: done, live: false };
  }

  const timestamp = nairobiTimestamp();
  const password = btoa(`${SHORTCODE}${PASSKEY}${timestamp}`);
  const token = await darajaToken();
  const callback = `${SUPABASE_URL}/functions/v1/mpesa?cb=stk&token=${await callbackToken()}`;
  const res = await fetch(`${DARAJA}/mpesa/stkpush/v1/processrequest`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      BusinessShortCode: SHORTCODE,
      Password: password,
      Timestamp: timestamp,
      TransactionType: TX_TYPE,
      Amount: Math.round(amount),
      PartyA: phone,
      PartyB: PARTY_B,
      PhoneNumber: phone,
      CallBackURL: callback,
      AccountReference: reference,
      TransactionDesc: description,
    }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.ResponseCode !== "0") {
    const msg = j.errorMessage || j.ResponseDescription || `M-Pesa request failed (${res.status})`;
    await admin.from("payments").update({ status: "failed", result_desc: msg }).eq("id", payment.id);
    throw new HttpError(502, msg);
  }
  const { data: updated } = await admin
    .from("payments")
    .update({ merchant_request_id: j.MerchantRequestID, checkout_request_id: j.CheckoutRequestID })
    .eq("id", payment.id).select("*").single();
  return { payment: updated, live: true };
}

async function stkCallback(body: Record<string, any>, admin: SupabaseClient) {
  const cb = body?.Body?.stkCallback;
  if (!cb?.CheckoutRequestID) return;
  const { data: payment } = await admin.from("payments").select("*").eq("checkout_request_id", cb.CheckoutRequestID).maybeSingle();
  if (!payment || payment.status !== "pending") return; // unknown or already handled (idempotent)
  const items: { Name: string; Value?: unknown }[] = cb.CallbackMetadata?.Item ?? [];
  const meta = (n: string) => items.find((i) => i.Name === n)?.Value;
  const code = Number(cb.ResultCode);
  if (code === 0) {
    const paid = Number(meta("Amount") ?? 0);
    if (paid + 0.5 < payment.amount) {
      await admin.from("payments").update({ status: "failed", result_code: code, result_desc: `Amount mismatch: ${paid}` }).eq("id", payment.id);
      return;
    }
    await admin.from("payments").update({
      status: "success", result_code: 0, result_desc: cb.ResultDesc, mpesa_receipt: String(meta("MpesaReceiptNumber") ?? ""),
    }).eq("id", payment.id);
    await applyPaymentSuccess(admin, payment);
  } else {
    await admin.from("payments").update({
      status: code === 1032 ? "cancelled" : "failed", result_code: code, result_desc: cb.ResultDesc,
    }).eq("id", payment.id);
  }
}

// ---------------------------------------------------------------------------
// Payouts (B2C)
// ---------------------------------------------------------------------------
async function sendPayout(admin: SupabaseClient, payout: Record<string, any>) {
  if (!LIVE) {
    const receipt = `SIM${crypto.randomUUID().replace(/-/g, "").slice(0, 7).toUpperCase()}`;
    await admin.from("payouts").update({ status: "success", simulated: true, mpesa_receipt: receipt, result_desc: "Demo payout (no money moved)" }).eq("id", payout.id);
    return;
  }
  if (!B2C_READY) return; // stays pending; admin pays manually and records it with mark_paid
  const phone = normalizePhone(payout.phone);
  if (!phone) {
    await admin.from("payouts").update({ status: "failed", result_desc: "Invalid M-Pesa number" }).eq("id", payout.id);
    return;
  }
  const token = await darajaToken();
  const t = await callbackToken();
  const originator = payout.originator_conversation_id || crypto.randomUUID();
  const res = await fetch(`${DARAJA}/mpesa/b2c/v3/paymentrequest`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      OriginatorConversationID: originator,
      InitiatorName: env("MPESA_B2C_INITIATOR"),
      SecurityCredential: env("MPESA_B2C_SECURITY_CREDENTIAL"),
      CommandID: "BusinessPayment",
      Amount: Math.round(payout.amount),
      PartyA: env("MPESA_B2C_SHORTCODE") || SHORTCODE,
      PartyB: phone,
      Remarks: payout.kind === "refund" ? "KaziKenya refund" : "KaziKenya payout",
      QueueTimeOutURL: `${SUPABASE_URL}/functions/v1/mpesa?cb=b2c_timeout&token=${t}`,
      ResultURL: `${SUPABASE_URL}/functions/v1/mpesa?cb=b2c&token=${t}`,
      Occasion: payout.booking_id.slice(0, 8),
    }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || String(j.ResponseCode) !== "0") {
    await admin.from("payouts").update({ status: "failed", originator_conversation_id: originator, result_desc: j.errorMessage || j.ResponseDescription || `B2C failed (${res.status})` }).eq("id", payout.id);
    return;
  }
  await admin.from("payouts").update({ status: "processing", originator_conversation_id: originator, conversation_id: j.ConversationID }).eq("id", payout.id);
}

async function b2cCallback(body: Record<string, any>, admin: SupabaseClient, timeout: boolean) {
  const r = body?.Result;
  const originator = r?.OriginatorConversationID;
  if (!originator) return;
  const { data: payout } = await admin.from("payouts").select("*").eq("originator_conversation_id", originator).maybeSingle();
  if (!payout || payout.status === "success") return;
  if (timeout) {
    await admin.from("payouts").update({ status: "failed", result_desc: "Timed out — will retry" }).eq("id", payout.id);
  } else if (Number(r.ResultCode) === 0) {
    await admin.from("payouts").update({ status: "success", mpesa_receipt: r.TransactionID, result_desc: r.ResultDesc }).eq("id", payout.id);
  } else {
    await admin.from("payouts").update({ status: "failed", result_desc: r.ResultDesc }).eq("id", payout.id);
  }
}

// ---------------------------------------------------------------------------
// Escrow release / refund
// ---------------------------------------------------------------------------
async function release(req: Request, body: Record<string, unknown>, admin: SupabaseClient) {
  const user = await requireUser(req, admin);
  const { data: payout, error } = await admin.rpc("release_booking", { p_booking: String(body.booking_id), p_actor: user.id });
  if (error) throw new HttpError(403, error.message);
  await sendPayout(admin, payout);
  const { data: fresh } = await admin.from("payouts").select("*").eq("id", payout.id).single();
  return { payout: fresh };
}

async function refund(req: Request, body: Record<string, unknown>, admin: SupabaseClient) {
  const user = await requireUser(req, admin);
  if (!user.isAdmin) throw new HttpError(403, "NOT_ALLOWED");
  const { data: payout, error } = await admin.rpc("refund_booking", { p_booking: String(body.booking_id), p_actor: user.id, p_note: String(body.note ?? "") || null });
  if (error) throw new HttpError(403, error.message);
  await sendPayout(admin, payout);
  return { payout };
}

async function processPayouts(req: Request, admin: SupabaseClient) {
  const user = await requireUser(req, admin);
  if (!user.isAdmin) throw new HttpError(403, "NOT_ALLOWED");
  const { data } = await admin.from("payouts").select("*").in("status", ["pending", "failed"]).order("created_at").limit(50);
  for (const p of data ?? []) await sendPayout(admin, p);
  return { processed: data?.length ?? 0, b2c: B2C_READY, live: LIVE };
}

async function markPaid(req: Request, body: Record<string, unknown>, admin: SupabaseClient) {
  const user = await requireUser(req, admin);
  if (!user.isAdmin) throw new HttpError(403, "NOT_ALLOWED");
  const { error } = await admin.from("payouts").update({ status: "success", mpesa_receipt: String(body.receipt ?? "MANUAL"), result_desc: "Paid manually by admin" }).eq("id", String(body.payout_id));
  if (error) throw new HttpError(400, error.message);
  return { ok: true };
}

// ---------------------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const url = new URL(req.url);

  // Daraja callbacks
  const cb = url.searchParams.get("cb");
  if (cb) {
    if (url.searchParams.get("token") !== (await callbackToken())) return json({ ResultCode: 1, ResultDesc: "Rejected" }, 401);
    try {
      const body = await req.json();
      if (cb === "stk") await stkCallback(body, admin);
      else if (cb === "b2c") await b2cCallback(body, admin, false);
      else if (cb === "b2c_timeout") await b2cCallback(body, admin, true);
    } catch (e) {
      console.error("callback error", e);
    }
    return json({ ResultCode: 0, ResultDesc: "Accepted" });
  }

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const body = await req.json();
    switch (body.action) {
      case "stk":
        return json(await stk(req, body, admin));
      case "release":
        return json(await release(req, body, admin));
      case "refund":
        return json(await refund(req, body, admin));
      case "process_payouts":
        return json(await processPayouts(req, admin));
      case "mark_paid":
        return json(await markPaid(req, body, admin));
      case "status":
        return json({ live: LIVE, env: LIVE ? (env("MPESA_ENV") || "sandbox") : "demo", b2c: B2C_READY });
      default:
        return json({ error: "Unknown action" }, 400);
    }
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    console.error(e);
    return json({ error: e instanceof Error ? e.message : "Server error" }, status);
  }
});
