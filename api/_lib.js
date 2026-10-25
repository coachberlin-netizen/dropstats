// Utilidades compartidas del servidor (los archivos que empiezan por _ no son rutas en Vercel).
import crypto from "node:crypto";

// Upstash Redis por REST. Vercel crea estas variables al conectar «Upstash for Redis» desde Storage/Marketplace.
// Si al conectarla se eligió otro prefijo (p. ej. STORAGE_), se busca cualquier pareja *_REST_API_URL / *_REST_API_TOKEN.
function findStore() {
  const e = process.env;
  if (e.KV_REST_API_URL && e.KV_REST_API_TOKEN) return [e.KV_REST_API_URL, e.KV_REST_API_TOKEN];
  if (e.UPSTASH_REDIS_REST_URL && e.UPSTASH_REDIS_REST_TOKEN) return [e.UPSTASH_REDIS_REST_URL, e.UPSTASH_REDIS_REST_TOKEN];
  for (const k of Object.keys(e)) {
    const m = k.match(/^(.*)_REST_API_URL$/);
    if (m && e[m[1] + "_REST_API_TOKEN"] && /^https:\/\//.test(e[k])) return [e[k], e[m[1] + "_REST_API_TOKEN"]];
  }
  return [null, null];
}
const [RURL, RTOK] = findStore();
export const storeReady = () => !!(RURL && RTOK);

export async function redis(...cmd) {
  const r = await fetch(RURL, { method: "POST", headers: { Authorization: `Bearer ${RTOK}`, "Content-Type": "application/json" }, body: JSON.stringify(cmd) });
  const j = await r.json();
  if (j.error) throw new Error("redis: " + j.error);
  return j.result;
}

export function send(res, code, obj) {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(obj));
}

// Protección CSRF: las escrituras deben venir de la propia web y en JSON.
export function sameOrigin(req) {
  const o = req.headers.origin;
  if (!o) return true;
  try { return new URL(o).host === req.headers.host; } catch { return false; }
}
export async function readJSON(req, max = 400_000) {
  if (!String(req.headers["content-type"] || "").includes("application/json")) throw Object.assign(new Error("bad_type"), { code: 415 });
  if (req.body && typeof req.body === "object") return req.body;
  let size = 0; const chunks = [];
  for await (const c of req) { size += c.length; if (size > max) throw Object.assign(new Error("too_big"), { code: 413 }); chunks.push(c); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

// Contraseñas: scrypt con sal aleatoria; comparación en tiempo constante.
export function hashPassword(pw, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 }).toString("hex");
  return { salt, hash };
}
export function checkPassword(pw, salt, hash) {
  const h = crypto.scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 });
  const ref = Buffer.from(hash, "hex");
  return ref.length === h.length && crypto.timingSafeEqual(h, ref);
}

// Sesiones: token aleatorio guardado en Redis; la cookie es HttpOnly y solo viaja por HTTPS.
export const SESSION_DAYS = 60;
export const newToken = () => crypto.randomBytes(32).toString("hex");
const COOKIE = "ds_session";
export function setSessionCookie(res, token, maxAge = SESSION_DAYS * 86400) {
  res.setHeader("Set-Cookie", `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`);
}
export function readToken(req) {
  const m = String(req.headers.cookie || "").match(/(?:^|;\s*)ds_session=([0-9a-f]{64})/);
  return m ? m[1] : null;
}
export async function currentUser(req) {
  const t = readToken(req);
  if (!t) return null;
  const s = await redis("GET", "sess:" + t);
  return s ? { ...JSON.parse(s), token: t } : null;
}
export const clientIp = req => String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "0";
export async function tooMany(key, limit, windowSec) {
  const n = await redis("INCR", key);
  if (n === 1) await redis("EXPIRE", key, windowSec);
  return n > limit;
}
