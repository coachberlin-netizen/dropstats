// Drop AI: asistente de Fortnite con un modelo de IA real. Las claves viven en el servidor.
// Proveedores (el primero configurado):
//   GEMINI_API_KEY      Google Gemini (tiene nivel gratuito; modelo por defecto «gemini-flash-latest», cambiable con AI_MODEL)
//   ANTHROPIC_API_KEY   Claude (de pago; modelo por defecto «claude-haiku-5-5»)
//   AI_API_KEY + AI_BASE_URL + AI_MODEL   cualquier API compatible con OpenAI (Groq, OpenRouter…)
// Fuerza uno con AI_PROVIDER=gemini|anthropic|openai. Límite diario por cuenta: AI_DAILY_LIMIT (30 por defecto).
// GET  /api/ai → { configured, provider, model, limit }
// POST /api/ai { messages:[{role,content}], context:{...} } → { ok, text, remaining }
import { storeReady, redis, send, sameOrigin, readJSON, currentUser, clientIp, tooMany } from "./_lib.js";

function provider() {
  const e = process.env, want = (e.AI_PROVIDER || "").toLowerCase();
  const all = {
    gemini: e.GEMINI_API_KEY && { id: "gemini", model: e.AI_MODEL || "gemini-flash-latest" },
    anthropic: e.ANTHROPIC_API_KEY && { id: "anthropic", model: e.AI_MODEL || "claude-haiku-5-5" },
    openai: e.AI_API_KEY && e.AI_BASE_URL && e.AI_MODEL && { id: "openai", model: e.AI_MODEL }
  };
  return (want && all[want]) || all.gemini || all.anthropic || all.openai || null;
}
const LIMIT = () => Math.max(1, Math.min(500, +process.env.AI_DAILY_LIMIT || 30));

const SYSTEM = `Eres Drop AI, el asistente de DropStats, una app independiente de Fortnite (no afiliada a Epic Games).
Ayudas con estrategia, toma de decisiones, armas, mecánicas, rotaciones, mapa y puntos de interés, preparación de torneos, interpretación de estadísticas, comparaciones de jugadores, cosméticos y tienda, y novedades.
Reglas:
- Responde en español, claro y bien estructurado (párrafos cortos y listas cuando ayuden). Sé concreto y práctico.
- Recibirás un bloque CONTEXTO con datos reales que DropStats tiene ahora (estadísticas, estrategias, tienda, Meta Lab, torneos). Úsalo cuando sea relevante y di que lo usas ("según tus estadísticas en DropStats…").
- No inventes datos: si algo no está en el CONTEXTO ni es conocimiento general estable del juego, dilo y explica qué falta. No afirmes haber consultado nada que no esté en el CONTEXTO.
- Para cifras de armas, usa solo las de Meta Lab del CONTEXTO; si no están, habla en términos generales y advierte de que los valores cambian con cada parche.
- Torneos: distingue los recordatorios marcados como confirmados (comprobados por el usuario en la web oficial) de los no confirmados; nunca inventes fechas. Remite a fortnite.com/competitive para horarios oficiales.
- Tu conocimiento del juego puede estar desactualizado: avisa cuando hables de algo que cambia por temporada.
- No pidas ni aceptes contraseñas, y no ayudes con trampas, cuentas compartidas, compraventa de cuentas ni nada contra las normas de Epic.`;

async function callModel(p, messages, context) {
  const sys = SYSTEM + "\n\nCONTEXTO (JSON, datos reales de DropStats en este momento):\n" + JSON.stringify(context || {});
  const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 45000);
  try {
    if (p.id === "gemini") {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(p.model)}:generateContent`, {
        method: "POST", signal: ctl.signal, headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
        body: JSON.stringify({ systemInstruction: { parts: [{ text: sys }] }, contents: messages.map(m => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })), generationConfig: { maxOutputTokens: 1200, temperature: 0.6 } })
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return { err: r.status === 429 ? "provider_rate" : r.status === 400 || r.status === 404 ? "provider_config" : "provider_error", detail: j.error?.message };
      const text = (j.candidates?.[0]?.content?.parts || []).map(x => x.text || "").join("").trim();
      return text ? { text } : { err: "empty", detail: j.candidates?.[0]?.finishReason };
    }
    if (p.id === "anthropic") {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", signal: ctl.signal, headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: p.model, max_tokens: 1200, system: sys, messages })
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return { err: r.status === 429 ? "provider_rate" : r.status === 400 || r.status === 404 ? "provider_config" : "provider_error", detail: j.error?.message };
      const text = (j.content || []).filter(x => x.type === "text").map(x => x.text).join("").trim();
      return text ? { text } : { err: "empty" };
    }
    const r = await fetch(process.env.AI_BASE_URL.replace(/\/$/, "") + "/chat/completions", {
      method: "POST", signal: ctl.signal, headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.AI_API_KEY}` },
      body: JSON.stringify({ model: p.model, max_tokens: 1200, temperature: 0.6, messages: [{ role: "system", content: sys }, ...messages] })
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { err: r.status === 429 ? "provider_rate" : r.status === 400 || r.status === 404 ? "provider_config" : "provider_error", detail: j.error?.message };
    const text = String(j.choices?.[0]?.message?.content || "").trim();
    return text ? { text } : { err: "empty" };
  } catch (e) { return { err: e.name === "AbortError" ? "timeout" : "unreachable" }; }
  finally { clearTimeout(to); }
}

export default async function handler(req, res) {
  const p = provider();
  if (req.method === "GET") return send(res, 200, { configured: !!p, provider: p?.id || null, model: p?.model || null, limit: LIMIT(), needsLogin: storeReady() });
  if (req.method !== "POST") return send(res, 405, { error: "method" });
  if (!p) return send(res, 200, { ok: false, error: "not_configured" });
  if (!storeReady()) return send(res, 200, { ok: false, error: "no_store" }); // sin base de datos no se pueden aplicar límites de uso
  if (!sameOrigin(req)) return send(res, 403, { ok: false, error: "origin" });
  try {
    const u = await currentUser(req);
    if (!u) return send(res, 200, { ok: false, error: "no_session" });
    // Cuando existan suscripciones reales, aquí se comprobará que la cuenta tiene Drop Ultra.
    const b = await readJSON(req, 60_000);
    const messages = (Array.isArray(b.messages) ? b.messages : []).slice(-12)
      .filter(m => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
      .map(m => ({ role: m.role, content: m.content.slice(0, 3000) }));
    if (!messages.length || messages[messages.length - 1].role !== "user") return send(res, 400, { ok: false, error: "bad_request" });
    while (messages.length && messages[0].role !== "user") messages.shift();
    let context = b.context && typeof b.context === "object" ? b.context : {};
    if (JSON.stringify(context).length > 12_000) context = { aviso: "contexto recortado por tamaño" };
    const day = new Date().toISOString().slice(0, 10);
    if (await tooMany(`ai:ip:${clientIp(req)}:${day}`, LIMIT() * 2, 86400)) return send(res, 200, { ok: false, error: "rate_limited", remaining: 0 });
    const used = await redis("INCR", `ai:u:${u.id}:${day}`); if (used === 1) await redis("EXPIRE", `ai:u:${u.id}:${day}`, 90000);
    if (used > LIMIT()) return send(res, 200, { ok: false, error: "rate_limited", remaining: 0 });
    const out = await callModel(p, messages, context);
    if (out.err) { await redis("DECR", `ai:u:${u.id}:${day}`); return send(res, 200, { ok: false, error: out.err, detail: out.detail ? String(out.detail).slice(0, 200) : undefined }); }
    return send(res, 200, { ok: true, text: out.text, remaining: Math.max(0, LIMIT() - used), provider: p.id });
  } catch (e) {
    return send(res, e.code || 500, { ok: false, error: e.code === 413 ? "too_big" : "server" });
  }
}
