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
// POST /api/ai { …, stream:true } → streaming real en NDJSON (Groq); con otros proveedores responde en JSON como siempre
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
- Recibirás un bloque CONTEXTO con datos reales que DropStats tiene ahora (estadísticas, estrategias, tienda, torneos). Úsalo cuando sea relevante y di que lo usas ("según tus estadísticas en DropStats…").
- "noDisponible" lista lo que DropStats NO ha podido darte: no inventes esos datos y, si hacen falta, di cómo conseguirlos en la app.
- No inventes datos: si algo no está en el CONTEXTO ni es conocimiento general estable del juego, dilo. No afirmes haber consultado nada que no esté en el CONTEXTO. No tienes acceso a internet.
- Nunca atribuyas a DropStats datos, estadísticas o tendencias que no aparezcan literalmente en el CONTEXTO (por ejemplo, no digas «según DropStats, los jugadores que caen en X…»). DropStats no tiene datos de otros jugadores ni de zonas del mapa salvo los del CONTEXTO.
- No cites nombres de lugares del mapa como actuales salvo que estén en "lugaresDelMapa" del CONTEXTO; si hablas de lugares, aclara que dependen de la temporada.
- Cifras de armas (daño, cadencia, cargador…) y cambios de parche: no las des de memoria. Si en esta conversación tienes búsqueda web, búscalas; si no, dilo y habla solo en términos generales.
- Torneos: distingue los recordatorios marcados como confirmados (comprobados por el usuario en la web oficial) de los no confirmados; nunca inventes fechas. Remite a fortnite.com/competitive para horarios oficiales.
- Tu conocimiento del juego puede estar desactualizado: avisa cuando hables de algo que cambia por temporada.
- Planes de DropStats: Gratis, Pro, Elite y Drop Ultra. Mapa, stats esenciales, tienda, catálogo y torneos están en todos los planes; Pro y Elite añaden funciones avanzadas; Widgets y Drop AI son exclusivos de Drop Ultra.
- No pidas ni aceptes contraseñas, y no ayudes con trampas, cuentas compartidas, compraventa de cuentas ni nada contra las normas de Epic.`;

// Le dice al modelo exactamente qué datos de DropStats tiene en esta conversación, para que no atribuya a la app nada más
const INFO_KEYS = { misEstadisticas: "estadísticas del usuario", jugadorConsultado: "un jugador consultado", estrategias: "estrategias guardadas", mapaSinGuardar: "mapa sin guardar", lugaresDelMapa: "lugares del mapa", tiendaHoy: "tienda de hoy", torneos: "torneos del usuario", novedadesOficiales: "novedades oficiales", favoritos: "favoritos" };
// Búsqueda web (herramienta browser_search de Groq, solo modelos gpt-oss): se activa para preguntas sobre armas o datos actuales
const WEB_RE = /(da[ñn]o|dps|cadencia|cargador|recarga|headshot|cabeza|nerf|buff|parche|actualizaci[oó]n|temporada actual|esta temporada|ahora mismo|actualmente|\bmeta\b|qu[eé] arma|mejor(es)? arma|armas?\b|bot[ií]n|loot|vault|escopeta|rifle|subfusil|\bsmg\b|francotirador|sniper|pistola|lanzacohetes|ballesta|minigun)/i;
const needsWeb = messages => process.env.AI_WEB_SEARCH !== "off" && WEB_RE.test(messages[messages.length - 1]?.content || "");
const canSearch = (p, model) => p.id === "groq" && /gpt-oss/.test(model);
const WEB_RULES = `\n\nBÚSQUEDA WEB: en esta pregunta tienes una herramienta de búsqueda web. Úsala para datos actuales (daño y estadísticas de armas, cambios de parche, botín de la temporada).
- Fuentes fiables, por este orden: notas de parche oficiales de Epic (fortnite.com, epicgames.com), Fortnite Wiki (fortnite.fandom.com) y Fortnite.GG (fortnite.gg). No uses foros, vídeos, redes sociales ni webs de trucos.
- Di de qué parche o fecha son los datos. Si las fuentes no coinciden o son antiguas, dilo. El daño suele variar según la rareza: indícalo por rareza si la fuente lo da.
- Si no encuentras un dato en una fuente fiable, dilo claramente: no inventes cifras.
- Termina con una línea «Fuentes:» y los enlaces que has usado en formato markdown [título](url). No uses marcas de cita como 【1】.`;
const NO_WEB = `\n\nBÚSQUEDA WEB NO DISPONIBLE ahora (límite del servicio gratuito). Si te piden cifras actuales, di que no has podido buscarlas y que vuelvan a intentarlo en un minuto; habla solo en términos generales.`;
function buildSystem(context) {
  const c = context && typeof context === "object" ? context : {};
  const have = Object.keys(INFO_KEYS).filter(k => k in c && !(k === "torneos" && typeof c.torneos === "string")).map(k => INFO_KEYS[k]);
  return SYSTEM + `\n\nDATOS DE DROPSTATS EN ESTA CONVERSACIÓN: ${have.length ? have.join(", ") : "ninguno"}. ` +
    `Todo lo que no esté en esa lista NO lo sabes por DropStats: no escribas «según DropStats», «DropStats indica» ni nada parecido salvo para citar esos datos. Para lo demás usa tu conocimiento general y dilo así («en general…»).` +
    "\n\nCONTEXTO (JSON, datos reales de DropStats en este momento):\n" + JSON.stringify(c);
}
const errOf = (status, msg) => status === 429 ? "provider_rate" : status === 401 || status === 403 ? "provider_key" : status === 400 || status === 404 ? "provider_config" : "provider_error";
async function callOnce(p, model, sys, messages, maxTokens, signal) {
  if (p.id === "gemini") {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST", signal, headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: sys }] }, contents: messages.map(m => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })), generationConfig: { maxOutputTokens: maxTokens, temperature: 0.4 } })
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
  const body = { model, temperature: 0.4, messages: [{ role: "system", content: sys }, ...messages] };
  if (p.id === "groq") { body.max_completion_tokens = maxTokens; if (/gpt-oss/.test(model)) { body.reasoning_effort = "low"; body.include_reasoning = false; } }
  else body.max_tokens = maxTokens;
  const r = await fetch(p.url + "/chat/completions", { method: "POST", signal, headers: { "Content-Type": "application/json", Authorization: `Bearer ${p.key}` }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return { err: errOf(r.status), status: r.status, detail: j.error?.message };
  const text = String(j.choices?.[0]?.message?.content || "").trim();
  return text ? { text } : { err: "empty", detail: j.choices?.[0]?.finish_reason };
}
async function callModel(p, messages, context, maxTokens = 1100) {
  const sys = buildSystem(context);
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
// Streaming real (Groq y APIs compatibles con OpenAI): se reenvía al navegador cada trozo de texto según llega,
// en líneas JSON (NDJSON): {"t":"delta","d":"…"} · {"t":"done",…} · {"t":"error","error":"…"}
const canStream = p => p.id === "groq" || p.id === "openai";
async function openStream(p, model, sys, messages, maxTokens, signal, web) {
  const body = { model, temperature: 0.4, stream: true, messages: [{ role: "system", content: sys + (web ? WEB_RULES : "") }, ...messages] };
  if (web) { body.tools = [{ type: "browser_search" }]; body.tool_choice = "required"; }
  if (p.id === "groq") { body.max_completion_tokens = maxTokens; if (/gpt-oss/.test(model)) { body.reasoning_effort = "low"; body.include_reasoning = false; } }
  else body.max_tokens = maxTokens;
  if (web) body.max_completion_tokens = Math.max(maxTokens, 1600);
  const r = await fetch(p.url + "/chat/completions", { method: "POST", signal, headers: { "Content-Type": "application/json", Authorization: `Bearer ${p.key}`, Accept: "text/event-stream" }, body: JSON.stringify(body) });
  if (!r.ok || !r.body) { const j = await r.json().catch(() => ({})); return { err: errOf(r.status), status: r.status, detail: j.error?.message }; }
  return { reader: r.body.getReader() };
}
async function streamReply(req, res, p, messages, context, onFail, onOk) {
  const sys = buildSystem(context), web = needsWeb(messages);
  const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 58000);
  let closed = false; res.on("close", () => { if (!res.writableEnded) { closed = true; ctl.abort(); } }); // el usuario ha pulsado «Detener» o se ha ido
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8"); res.setHeader("Cache-Control", "no-store, no-transform"); res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();
  const line = o => { if (!closed) res.write(JSON.stringify(o) + "\n"); };
  // intentos: primero con búsqueda web (si hace falta), después sin ella con los modelos de reserva
  const tries = [];
  if (web) p.models.filter(m => canSearch(p, m)).forEach(m => tries.push([m, true]));
  p.models.forEach(m => tries.push([m, false]));
  let opened = null, model = null, usedWeb = false, webFailed = false;
  if (web && tries[0]?.[1]) line({ t: "status", d: "search" });
  try {
    for (const [m, w] of tries) {   // antes de enviar texto, si un modelo está agotado se prueba el siguiente
      const o = await openStream(p, m, w ? sys : sys + (web ? NO_WEB : ""), messages, 1100, ctl.signal, w);
      if (!o.err) { opened = o; model = m; usedWeb = w; break; }
      opened = o; if (w) { webFailed = true; continue; }
      if (!["provider_rate", "provider_config"].includes(o.err)) break;
    }
  } catch (e) { clearTimeout(to); if (!closed) { await onFail(); line({ t: "error", error: e.name === "AbortError" ? "timeout" : "unreachable" }); } return res.end(); }
  if (!opened?.reader) { clearTimeout(to); await onFail(); line({ t: "error", error: opened?.err || "provider_error" }); return res.end(); }
  if (web && !usedWeb) line({ t: "status", d: "nosearch" });
  const dec = new TextDecoder(); let buf = "", text = "", finish = null;
  try {
    while (true) {
      const { value, done } = await opened.reader.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const ln = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (!ln.startsWith("data:")) continue;
        const data = ln.slice(5).trim(); if (data === "[DONE]") continue;
        let j; try { j = JSON.parse(data); } catch { continue; }
        if (j.error) { line({ t: "error", error: "provider_error" }); finish = "error"; continue; }
        const d = j.choices?.[0]?.delta?.content; if (d) { text += d; line({ t: "delta", d }); }
        if (j.choices?.[0]?.finish_reason) finish = j.choices[0].finish_reason;
      }
    }
  } catch (e) { if (!closed) line({ t: "error", error: e.name === "AbortError" ? "timeout" : "unreachable" }); }
  clearTimeout(to);
  if (closed) { if (!text) await onFail(); return; }               // detenida por el usuario: si ya llegó texto, cuenta como mensaje usado
  if (!text.trim()) { await onFail(); line({ t: "error", error: "empty" }); return res.end(); }
  line({ t: "done", model, finish, web: usedWeb, webFailed: web && !usedWeb ? webFailed || true : undefined, remaining: await onOk(), stream: true });
  res.end();
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
    if (req.query.op !== "ping" && req.query.op !== "web") return send(res, 200, { configured: !!p, provider: p?.id || null, model: p?.models[0] || null, limit: LIMIT(), needsLogin: storeReady() });
    // prueba real mínima: confirma que la clave y el modelo funcionan; no devuelve datos de nadie
    if (!p) return send(res, 200, { ok: false, error: "not_configured" });
    if (!storeReady()) return send(res, 200, { ok: false, error: "no_store" });
    const day = new Date().toISOString().slice(0, 10);
    if (await tooMany(`ai:ping:${day}`, Math.max(1, +process.env.AI_PING_LIMIT || 20), 90000)) return send(res, 200, { ok: false, error: "ping_limit" });
    const t0 = Date.now();
    if (req.query.op === "web") { // prueba real de la búsqueda web (sin datos de nadie)
      const model = p.models.find(m => canSearch(p, m)); if (!model) return send(res, 200, { ok: false, error: "no_search_model" });
      const body = { model, temperature: 0.2, max_completion_tokens: 1600, reasoning_effort: "low", include_reasoning: false, tools: [{ type: "browser_search" }], tool_choice: "required",
        messages: [{ role: "system", content: SYSTEM + WEB_RULES }, { role: "user", content: String(req.query.q || "¿Cuánto daño hace la escopeta más común de Fortnite en el parche actual?").slice(0, 200) }] };
      const r = await fetch(p.url + "/chat/completions", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${p.key}` }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      return send(res, 200, r.ok ? { ok: true, model, ms: Date.now() - t0, usage: j.usage, tools: (j.choices?.[0]?.message?.executed_tools || []).length, text: String(j.choices?.[0]?.message?.content || "").slice(0, 3000) } : { ok: false, status: r.status, error: errOf(r.status), detail: String(j.error?.message || "").slice(0, 300) });
    }
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
    const fail = () => redis("DECR", `ai:u:${u.id}:${day}`);
    if (b.stream && canStream(p)) return await streamReply(req, res, p, messages, context, fail, async () => Math.max(0, LIMIT() - used));
    const out = await callModel(p, messages, context);
    if (out.err) { await redis("DECR", `ai:u:${u.id}:${day}`); return send(res, 200, { ok: false, error: out.err }); }
    return send(res, 200, { ok: true, text: out.text, remaining: Math.max(0, LIMIT() - used), provider: p.id, model: out.model });
  } catch (e) {
    return send(res, e.code || 500, { ok: false, error: e.code === 413 ? "too_big" : "server" });
  }
}
