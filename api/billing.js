// Suscripciones con Stripe (Checkout + portal de cliente). La clave secreta vive solo en el servidor.
//   STRIPE_SECRET_KEY   sk_test_… (modo de prueba, sin dinero real) o sk_live_… (cobros reales)
//   BILLING_LIVE=on     obligatorio para aceptar una clave sk_live_ (evita cobrar por error)
// El plan de cada cuenta lo decide SIEMPRE el servidor consultando a Stripe; la app nunca lo concede por su cuenta.
// GET  /api/billing                       → { configured, mode, plan, status, periodEnd, cancelAtPeriodEnd, prices }
// POST /api/billing { op:"checkout", plan } → { url }  (página de pago de Stripe)
// POST /api/billing { op:"confirm", session_id } → { status:"succeeded", verified:true, plan } tras comprobarlo con Stripe
// POST /api/billing { op:"portal" }        → { url }  (cambiar de plan, cancelar, facturas, método de pago)
import { storeReady, redis, send, sameOrigin, readJSON, currentUser } from "./_lib.js";

export const PRICES = { pro: 299, elite: 599, ultra: 999 };           // céntimos de euro al mes (IVA incluido)
const NAMES = { pro: "DropStats Pro", elite: "DropStats Elite", ultra: "Drop Ultra" };
const LOOKUP = p => `dropstats_${p}_monthly_eur`;
const ACTIVE = new Set(["active", "trialing"]);                      // sin pago al día no hay plan (past_due, unpaid… = Gratis)

export function billingMode() {
  const k = process.env.STRIPE_SECRET_KEY || "";
  if (k.startsWith("sk_test_") || k.startsWith("rk_test_")) return "test";
  if ((k.startsWith("sk_live_") || k.startsWith("rk_live_")) && process.env.BILLING_LIVE === "on") return "live";
  return null;
}
async function stripe(method, path, params) {
  const body = params ? new URLSearchParams(flat(params)).toString() : undefined;
  const url = "https://api.stripe.com/v1" + path + (method === "GET" && body ? "?" + body : "");
  const r = await fetch(url, { method, headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, "Content-Type": "application/x-www-form-urlencoded", "Stripe-Version": "2024-06-20" }, body: method === "GET" ? undefined : body });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error?.message || "stripe_error"), { stripe: true, status: r.status, type: j.error?.type, code: j.error?.code });
  return j;
}
function flat(o, pre = "", out = []) { // {a:{b:1}, c:[x]} → a[b]=1&c[0]=x  (formato de Stripe)
  for (const [k, v] of Object.entries(o)) {
    const key = pre ? `${pre}[${k}]` : k;
    if (v == null) continue;
    if (typeof v === "object") flat(v, key, out); else out.push([key, String(v)]);
  }
  return out;
}
async function priceFor(plan) { // busca el precio por su lookup_key; si no existe lo crea (una sola vez)
  const ck = `bill:price:${billingMode()}:${plan}:${PRICES[plan]}`;
  const c = await redis("GET", ck); if (c) return c;
  const l = await stripe("GET", "/prices", { "lookup_keys[0]": LOOKUP(plan), active: "true", limit: 1 });
  let price = l.data?.[0];
  if (!price || price.unit_amount !== PRICES[plan]) {
    const prod = await stripe("POST", "/products", { name: NAMES[plan], metadata: { app: "dropstats", plan } });
    price = await stripe("POST", "/prices", { product: prod.id, currency: "eur", unit_amount: PRICES[plan], recurring: { interval: "month" }, lookup_key: LOOKUP(plan), transfer_lookup_key: "true", tax_behavior: "inclusive", metadata: { app: "dropstats", plan } });
  }
  await redis("SET", ck, price.id, "EX", 86400);
  return price.id;
}
const planOfPrice = price => { const k = price?.lookup_key || ""; const m = k.match(/^dropstats_(pro|elite|ultra)_monthly_eur$/); return m ? m[1] : PRICES[price?.metadata?.plan] ? price.metadata.plan : null; };
function fromSub(sub) {
  const item = sub.items?.data?.[0];
  return { sub: sub.id, customer: typeof sub.customer === "string" ? sub.customer : sub.customer?.id, status: sub.status, plan: ACTIVE.has(sub.status) ? planOfPrice(item?.price) : null,
    periodEnd: (sub.current_period_end || item?.current_period_end || 0) * 1000, cancelAtPeriodEnd: !!sub.cancel_at_period_end, checkedAt: Date.now() };
}
const key = uid => `bill:${billingMode()}:${uid}`;
// Plan verificado de una cuenta (se vuelve a comprobar con Stripe como mucho cada 30 minutos)
export async function verifiedPlan(uid, force) {
  if (!billingMode()) return null;
  const raw = await redis("GET", key(uid)); let b = raw ? JSON.parse(raw) : null;
  if (b?.sub && (force || Date.now() - (b.checkedAt || 0) > 30 * 60e3)) {
    try { b = { ...b, ...fromSub(await stripe("GET", `/subscriptions/${b.sub}`)) }; await redis("SET", key(uid), JSON.stringify(b)); } catch (e) { if (e.status === 404) { b = { customer: b.customer, plan: null, status: "canceled", checkedAt: Date.now() }; await redis("SET", key(uid), JSON.stringify(b)); } }
  }
  if (b?.plan && b.periodEnd && b.periodEnd + 3 * 86400e3 < Date.now()) b.plan = null; // seguridad: periodo vencido sin renovar
  return b;
}
const origin = req => { const h = req.headers["x-forwarded-host"] || req.headers.host; return `https://${h}`; };

export default async function handler(req, res) {
  const mode = billingMode();
  try {
    if (req.method === "GET") {
      const base = { configured: !!mode && storeReady(), mode, prices: PRICES, liveKeyBlocked: /^(sk|rk)_live_/.test(process.env.STRIPE_SECRET_KEY || "") && !mode };
      if (!mode || !storeReady()) return send(res, 200, base);
      const u = await currentUser(req); if (!u) return send(res, 200, { ...base, plan: null, needsLogin: true });
      const b = await verifiedPlan(u.id, req.query.force === "1");
      return send(res, 200, { ...base, plan: b?.plan || null, status: b?.status || null, periodEnd: b?.periodEnd || null, cancelAtPeriodEnd: !!b?.cancelAtPeriodEnd, hasCustomer: !!b?.customer });
    }
    if (req.method !== "POST") return send(res, 405, { error: "method" });
    if (!mode) return send(res, 200, { ok: false, error: "not_configured" });
    if (!storeReady()) return send(res, 200, { ok: false, error: "no_store" });
    if (!sameOrigin(req)) return send(res, 403, { ok: false, error: "origin" });
    const u = await currentUser(req); if (!u) return send(res, 200, { ok: false, error: "no_session" });
    const b = await readJSON(req, 10_000);
    if (b.op === "checkout") {
      const plan = String(b.plan || ""); if (!PRICES[plan]) return send(res, 400, { ok: false, error: "bad_plan" });
      const cur = await verifiedPlan(u.id, true);
      if (cur?.plan && cur.customer) { // ya tiene una suscripción activa: el cambio de plan se hace en el portal de Stripe (con prorrateo)
        const ps = await portalSession(cur.customer, origin(req)); return send(res, 200, { ok: true, url: ps.url, portal: true });
      }
      const price = await priceFor(plan);
      const s = await stripe("POST", "/checkout/sessions", {
        mode: "subscription", "line_items[0][price]": price, "line_items[0][quantity]": 1, client_reference_id: u.id, locale: "es", allow_promotion_codes: "true",
        ...(cur?.customer ? { customer: cur.customer } : { customer_email: u.email }),
        metadata: { uid: u.id, plan }, subscription_data: { metadata: { uid: u.id, plan } },
        success_url: `${origin(req)}/?checkout=success&session_id={CHECKOUT_SESSION_ID}#premium`, cancel_url: `${origin(req)}/?checkout=cancel#premium`
      });
      return send(res, 200, { ok: true, url: s.url });
    }
    if (b.op === "confirm") { // comprobación en el servidor: la sesión es de esta cuenta, está pagada y la suscripción está activa
      const sid = String(b.session_id || ""); if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(sid)) return send(res, 400, { ok: false, error: "bad_session" });
      const s = await stripe("GET", `/checkout/sessions/${sid}`, { "expand[0]": "subscription" });
      if (s.client_reference_id !== u.id) return send(res, 200, { ok: false, status: "failed", error: "not_yours" });
      if (s.status !== "complete" || !s.subscription) return send(res, 200, { ok: false, status: s.status === "expired" ? "canceled" : "failed" });
      const sub = typeof s.subscription === "string" ? await stripe("GET", `/subscriptions/${s.subscription}`) : s.subscription;
      const info = fromSub(sub); await redis("SET", key(u.id), JSON.stringify(info));
      if (!info.plan) return send(res, 200, { ok: false, status: "failed", subStatus: info.status });
      return send(res, 200, { ok: true, status: "succeeded", verified: true, plan: info.plan });
    }
    if (b.op === "portal") {
      const cur = await verifiedPlan(u.id); if (!cur?.customer) return send(res, 200, { ok: false, error: "no_customer" });
      const ps = await portalSession(cur.customer, origin(req)); return send(res, 200, { ok: true, url: ps.url });
    }
    return send(res, 400, { ok: false, error: "bad_op" });
  } catch (e) {
    if (e.stripe) return send(res, 200, { ok: false, error: "stripe", detail: String(e.message).slice(0, 200), code: e.code || e.type });
    return send(res, e.code || 500, { ok: false, error: e.code === 413 ? "too_big" : "server" });
  }
}
// Portal de cliente: si no hay configuración, se crea una (cancelar, cambiar de plan con prorrateo, facturas, tarjeta)
async function portalSession(customer, base) {
  let conf = await redis("GET", `bill:portal:${billingMode()}`);
  if (!conf) {
    const prices = await Promise.all(Object.keys(PRICES).map(priceFor));
    const prods = {}; for (const id of prices) { const p = await stripe("GET", `/prices/${id}`); (prods[p.product] = prods[p.product] || []).push(id); }
    const c = await stripe("POST", "/billing_portal/configurations", {
      business_profile: { headline: "DropStats · gestiona tu suscripción" },
      features: { customer_update: { enabled: "true", "allowed_updates[0]": "email" }, invoice_history: { enabled: "true" }, payment_method_update: { enabled: "true" },
        subscription_cancel: { enabled: "true", mode: "at_period_end" },
        subscription_update: { enabled: "true", "default_allowed_updates[0]": "price", proration_behavior: "create_prorations", products: Object.entries(prods).map(([product, ps]) => ({ product, prices: ps })) } }
    });
    conf = c.id; await redis("SET", `bill:portal:${billingMode()}`, conf, "EX", 30 * 86400);
  }
  return stripe("POST", "/billing_portal/sessions", { customer, configuration: conf, return_url: `${base}/?portal=back#premium` });
}
