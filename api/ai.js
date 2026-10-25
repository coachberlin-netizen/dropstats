// Drop AI: asistente de Fortnite con un modelo de IA real. Las claves viven solo en el servidor (variables de entorno de Vercel).
// Proveedores (se usa el primero configurado; AI_PROVIDER=groq|anthropic|openai|gemini lo fuerza):
//   GROQ_API_KEY        Groq (nivel gratuito, sin tarjeta). Modelo «openai/gpt-oss-120b»; si se agota, prueba los de AI_FALLBACK_MODELS.
//   ANTHROPIC_API_KEY   Claude (de pago). Modelo «claude-haiku-5-5».
//   AI_API_KEY + AI_BASE_URL + AI_MODEL   cualquier API compatible con OpenAI.
//   GEMINI_API_KEY      Google Gemini. Ojo: sus condiciones no permiten usar el nivel gratuito para dar servicio a usuarios del EEE (España incluida).
// AI_MODEL cambia el modelo principal. Límite diario por cuenta: AI_DAILY_LIMIT (30). Límite diario total: AI_GLOBAL_LIMIT (300).
// GET  /api/ai            → { configured, provider, model, limit }
// GET  /api/ai?op=ping    → prueba real mínima contra el proveedor (máx. AI_PING_LIMIT al día, 20 por defecto)
// POST /api/ai { messages:[{role,content}], context:{...} } → { ok, text, remaining, model }
import { storeReady, redis, send, sameOrigin, readJSON, currentUser, clientIp, tooMany } from "./_lib.js";

const GROQ_URL = "https://api.groq.com/openai/v1";
function provider() {
  const e = process.env, want = (e.AI_PROVIDER || "").toLowerCase();
  const all = {
    groq: e.GROQ_API_KEY && { id: "groq", url: GROQ_URL, key: e.GROQ_API_KEY, models: [e.AI_MODEL || "openai/gpt-oss-120b", ...String(e.AI_FALLBACK_MODELS ?? "llama-3.3-70b-versatile,llama-3.1-8b-instant").split(",").map(s => s.trim()).filter(Boolean)] },
    anthropic: e.ANTHROPIC_API_KEY && { id: "anthropic", models: [e.AI_MODEL || "claude-haiku-5-5"] },
    openai: e.AI_API_KEY && e.AI_BASE_URL && e.AI_MODEL && { id: "openai", url: e.AI_BASE_URL.replace(/\/$/, ""), key: e.AI_API_KEY, models: [e.AI_MODEL] },
    gemini: e.GEMINI_API_KEY && { id: "gemini", models: [e.AI_MODEL || "gemini-flash-latest"] }
  };
  const p = (want && all[want]) || all.groq || all.anthropic || all.openai || all.gemini || null;
  if (p) p.models = [...new Set(p.models)];
  return p;
}
const LIMIT = () => Math.max(1, Math.min(500, +process.env.AI_DAILY_LIMIT || 30));
const GLOBAL = () => Math.max(1, +process.env.AI_GLOBAL_LIMIT || 300);

const SYSTEM = `Eres Drop AI, el asistente de DropStats, una app independiente de Fortnite (no afiliada a Epic Games).
Ayudas con estrategia, toma de decisiones, armas, mecánicas, rotaciones, mapa y puntos de interés, preparación de torneos, interpretación de estadísticas, comparaciones de jugadores, cosméticos y tienda, y novedades.
Reglas:
- Responde en español, claro y bien estructurado (párrafos cortos y listas cuando ayuden). Sé concreto y práctico. No uses tablas.
- Recibirás un bloque CONTEXTO con datos reales que DropStats tiene ahora (estadísticas, estrategias, tienda, Meta Lab, torneos). Úsalo cuando sea relevante y di que lo usas ("según tus estadísticas en DropStats…").
- "noDisponible" lista lo que DropStats NO ha podido darte: no inventes esos datos y, si hacen falta, di cómo conseguirlos en la app.
- No inventes datos: si algo no está en el CONTEXTO ni es conocimiento general estable del juego, dilo. No afirmes haber consultado nada que no esté en el CONTEXTO. No tienes acceso a internet.
- Para cifras de armas, usa solo las de Meta Lab del CONTEXTO; si no están, habla en términos generales y advierte de que los valores cambian con cada parche.
- Torneos: distingue los recordatorios marcados como confirmados (comprobados por el usuario en la web oficial) de los no confirmados; nunca inventes fechas. Remite a fortnite.com/competitive para horarios oficiales.
- Tu conocimiento del juego puede estar desactualizado: avisa cuando hables de algo que cambia por temporada.
- Planes de DropStats: Gratis, Pro, Elite y Drop Ultra. Meta Lab básico, mapa, stats esenciales, tienda, catálogo y torneos están en todos los planes; Pro y Elite añaden funciones avanzadas; Widgets y Drop AI son exclusivos de Drop Ultra. Si algo de Meta Lab no está disponible, es porque la fuente de datos no está activa, no por el plan del usuario.
- No pidas ni aceptes contraseñas, y no ayudes con trampas, cuentas compartidas, compraventa de cuentas ni nada contra las normas de Epic.`;

const errOf = (status, msg) => status === 429 ? "provider_rate" : status === 401 || status === 403 ? "provider_key" : status === 400 || status === 404 ? "provider_config" : "provider_error";
async function callOnce(p, model, sys, messages, maxTokens, signal) {
  if (p.id === "gemini") {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST", signal, headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: sys }] }, contents: messages.map(m => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })), generationConfig: { maxOutputTokens: maxTokens, temperature: 0.6 } })
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { err: errOf(r.status), status: r.status, detail: j.error?.message };
    const text = (j.candidates?.[0]?.content?.parts || []).map(x => x.text || "").join("").trim();
    return text ? { text } : { err: "empty", detail: j.candidates?.[0]?.finishReason };
  }
  if (p.id === "anthropic") {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", signal, headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model, max_tokens: maxTokens, system: sys, messages })
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { err: errOf(r.status), status: r.status, detail: j.error?.message };
    const text = (j.content || []).filter(x => x.type === "text").map(x => x.text).join("").trim();
    return text ? { text } : { err: "empty" };
  }
  // Groq y cualquier API compatible con OpenAI
  const body = { model, temperature: 0.6, messages: [{ role: "system", content: sys }, ...messages] };
  if (p.id === "groq") { body.max_completion_tokens = maxTokens; if (/gpt-oss/.test(model)) { body.reasoning_effort = "low"; body.include_reasoning = false; } }
  else body.max_tokens = maxTokens;
  const r = await fetch(p.url + "/chat/completions", { method: "POST", signal, headers: { "Content-Type": "application/json", Authorization: `Bearer ${p.key}` }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return { err: errOf(r.status), status: r.status, detail: j.error?.message };
  const text = String(j.choices?.[0]?.message?.content || "").trim();
  return text ? { text } : { err: "empty", detail: j.choices?.[0]?.finish_reason };
}
async function callModel(p, messages, context, maxTokens = 1100) {
  const sys = SYSTEM + "\n\nCONTEXTO (JSON, datos reales de DropStats en este momento):\n" + JSON.stringify(context || {});
  const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 50000);
  let last = { err: "provider_error" };
  try {
    for (const model of p.models) {          // si un modelo está agotado (429) o no existe, se prueba el siguiente
      last = await callOnce(p, model, sys, messages, maxTokens, ctl.signal);
      if (!last.err) return { ...last, model };
      if (!["provider_rate", "provider_config"].includes(last.err) && last.err !== "empty") break;
    }
    return last;
  } catch (e) { return { err: e.name === "AbortError" ? "timeout" : "unreachable" }; }
  finally { clearTimeout(to); }
}
// Recorta el historial para que cada petición quepa en los límites por minuto del nivel gratuito
function trimMessages(list) {
  const out = []; let size = 0;
  for (const m of list.slice().reverse()) { size += m.content.length; if (out.length && size > 7000) break; out.unshift(m); }
  while (out.length && out[0].role !== "user") out.shift();
  return out;
}

export default async function handler(req, res) {
  const p = provider();
  if (req.method === "GET") {
    if (req.query.op !== "ping") return send(res, 200, { configured: !!p, provider: p?.id || null, model: p?.models[0] || null, limit: LIMIT(), needsLogin: storeReady() });
    // prueba real mínima: confirma que la clave y el modelo funcionan; no devuelve datos de nadie
    if (!p) return send(res, 200, { ok: false, error: "not_configured" });
    if (!storeReady()) return send(res, 200, { ok: false, error: "no_store" });
    const day = new Date().toISOString().slice(0, 10);
    if (await tooMany(`ai:ping:${day}`, Math.max(1, +process.env.AI_PING_LIMIT || 20), 90000)) return send(res, 200, { ok: false, error: "ping_limit" });
    const t0 = Date.now();
    const out = await callModel(p, [{ role: "user", content: "Responde solo con la palabra: listo" }], { prueba: true }, 300);
    return send(res, 200, out.err ? { ok: false, error: out.err, status: out.status, detail: out.detail ? String(out.detail).slice(0, 160) : undefined, provider: p.id } : { ok: true, provider: p.id, model: out.model, ms: Date.now() - t0, reply: out.text.slice(0, 40) });
  }
  if (req.method !== "POST") return send(res, 405, { error: "method" });
  if (!p) return send(res, 200, { ok: false, error: "not_configured" });
  if (!storeReady()) return send(res, 200, { ok: false, error: "no_store" }); // sin base de datos no se pueden aplicar límites de uso
  if (!sameOrigin(req)) return send(res, 403, { ok: false, error: "origin" });
  try {
    const u = await currentUser(req);
    if (!u) return send(res, 200, { ok: false, error: "no_session" });
    // Cuando existan suscripciones reales, aquí se comprobará en el servidor que la cuenta tiene Drop Ultra.
    const b = await readJSON(req, 60_000);
    let messages = (Array.isArray(b.messages) ? b.messages : []).slice(-12)
      .filter(m => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
      .map(m => ({ role: m.role, content: m.content.slice(0, 3000) }));
    if (!messages.length || messages[messages.length - 1].role !== "user") return send(res, 400, { ok: false, error: "bad_request" });
    messages = trimMessages(messages);
    let context = b.context && typeof b.context === "object" ? b.context : {};
    if (JSON.stringify(context).length > 9000) context = { aviso: "contexto recortado por tamaño", noDisponible: ["datos de DropStats (demasiado grandes para enviarlos)"] };
    const day = new Date().toISOString().slice(0, 10);
    if (await tooMany(`ai:ip:${clientIp(req)}:${day}`, LIMIT() * 2, 90000)) return send(res, 200, { ok: false, error: "rate_limited", remaining: 0 });
    if (await tooMany(`ai:all:${day}`, GLOBAL(), 90000)) return send(res, 200, { ok: false, error: "global_limit" });
    const used = await redis("INCR", `ai:u:${u.id}:${day}`); if (used === 1) await redis("EXPIRE", `ai:u:${u.id}:${day}`, 90000);
    if (used > LIMIT()) return send(res, 200, { ok: false, error: "rate_limited", remaining: 0 });
    const out = await callModel(p, messages, context);
    if (out.err) { await redis("DECR", `ai:u:${u.id}:${day}`); return send(res, 200, { ok: false, error: out.err }); }
    return send(res, 200, { ok: true, text: out.text, remaining: Math.max(0, LIMIT() - used), provider: p.id, model: out.model });
  } catch (e) {
    return send(res, e.code || 500, { ok: false, error: e.code === 413 ? "too_big" : "server" });
  }
}
