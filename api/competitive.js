// Competitivo: Power Ranking (PR) y earnings (premios en torneos). Las claves viven solo en el servidor.
// PR       → api-fortnite.com (Power Rankings oficiales de Epic, top 10.000), clave APIFORTNITE_API_KEY (o METALAB_API_KEY).
//            Solo se usan las consultas que NO necesitan la cuenta de Epic del jugador (archivo por ID y búsqueda por nombre).
// Earnings → Esports Earnings (base de datos comunitaria con fuentes citadas), clave ESPORTSEARNINGS_API_KEY.
//            No usa cuentas de Epic: se busca el nombre exacto entre los jugadores de Fortnite con premios registrados.
// GET /api/competitive?op=pr&accountId=…&name=…   → { status, pr:{…} } | { status:404, error:"not_ranked" }
// GET /api/competitive?op=earnings&name=…          → { status, matches:[…], player:{…}, tournaments:[…] }
// Nunca se inventan valores: si la fuente no responde, se devuelve el error tal cual.
import { storeReady, redis, send } from "./_lib.js";

const AF = "https://prod.api-fortnite.com";
const EE = "https://api.esportsearnings.com/v0";
const EE_FORTNITE = 534;                 // id de Fortnite en Esports Earnings (esportsearnings.com/games/534-fortnite)
const sleep = ms => new Promise(r => setTimeout(r, ms));
const isId = s => /^[0-9a-f]{32}$/i.test(String(s || ""));

/* ---------------- Power Ranking ---------------- */
const afKey = () => process.env.APIFORTNITE_API_KEY || process.env.METALAB_API_KEY || "";
async function af(path) {
  const r = await fetch(AF + path, { headers: { "x-api-key": afKey(), Accept: "application/json", "User-Agent": "DropStats/1.0" } });
  const j = await r.json().catch(() => null);
  return { status: r.status, j };
}
const prOf = (e, src) => ({ accountId: e.accountId || null, displayName: e.displayName || null, rank: e.rank ?? null, pr: e.score ?? null, bestRank: e.bestRank ?? null,
  peakPr: e.peakPr ?? null, deltaPr: e.deltaPr ?? null, countingEvents: e.countingEvents ?? null, lastUpdated: e.lastUpdated || null, season: e.seasonLabel || null, source: src });
async function powerRanking(accountId, name) {
  if (!afKey()) return { status: 503, error: "missing_key" };
  if (isId(accountId)) {
    const { status, j } = await af(`/api/v1/events/powerrankings/archive/${accountId.toLowerCase()}`);
    if (status === 200 && j) return { status: 200, pr: prOf(j, "archive") };
    if (status === 401) return { status, error: "invalid_key" };
    if (status === 403) return { status, error: "plan_required" };
    if (status !== 404) return { status, error: "source_error" };
  }
  if (name) { // búsqueda por nombre en el índice del top 10.000 (solo coincidencia exacta, para no mostrar a otra persona)
    const { status, j } = await af(`/api/v1/events/powerrankings/search?q=${encodeURIComponent(name)}&limit=10`);
    if (status === 401) return { status, error: "invalid_key" };
    if (status === 403) return { status, error: "plan_required" };
    if (status !== 200 || !j) return { status, error: "source_error" };
    const hit = (j.results || []).find(r => String(r.displayName || "").toLowerCase() === String(name).toLowerCase() && (!isId(accountId) || String(r.accountId).toLowerCase() === accountId.toLowerCase()));
    if (hit) return { status: 200, pr: prOf(hit, "search") };
  }
  return { status: 404, error: "not_ranked" };
}

/* ---------------- Earnings (Esports Earnings) ---------------- */
const eeKey = () => process.env.ESPORTSEARNINGS_API_KEY || "";
let lastEE = 0;
async function ee(method, params) { // la API permite una llamada por segundo
  const wait = 1050 - (Date.now() - lastEE); if (wait > 0) await sleep(wait);
  lastEE = Date.now();
  const qs = new URLSearchParams({ apikey: eeKey(), format: "json", ...params });
  let r; try { r = await fetch(`${EE}/${method}?${qs}`, { headers: { "User-Agent": "DropStats/1.0" } }); } catch { r = await fetch(`${EE.replace("https:", "http:")}/${method}?${qs}`, { headers: { "User-Agent": "DropStats/1.0" } }); }
  const j = await r.json().catch(() => null);
  if (!r.ok || !j) throw Object.assign(new Error("ee_http"), { code: r.status });
  if (!Array.isArray(j) && j.ErrorCode) throw Object.assign(new Error("ee_" + j.ErrorCode), { ee: j.ErrorCode });
  return j;
}
async function earnersIndex() { // índice de jugadores de Fortnite con premios (se rehace cada 7 días)
  const raw = await redis("GET", "ee:fn:index"); const idx = raw ? JSON.parse(raw) : null;
  if (idx && Date.now() - idx.at < 7 * 86400e3) return idx;
  if (!(await redis("SET", "ee:fn:lock", "1", "NX", "EX", 120))) return idx; // otro proceso lo está creando
  const pages = Math.max(1, Math.min(30, +process.env.EE_INDEX_PAGES || 12)), players = [];
  try {
    for (let p = 0; p < pages; p++) {
      const list = await ee("LookupHighestEarningPlayersByGame", { gameid: EE_FORTNITE, offset: p * 100 });
      const arr = Array.isArray(list) ? list : [];
      arr.forEach(x => players.push({ id: x.PlayerId, h: x.CurrentHandle || "", c: x.CountryCode || "", t: x.TotalUSDPrize ?? null }));
      if (arr.length < 100) break;
    }
  } finally { await redis("DEL", "ee:fn:lock"); }
  if (!players.length) return idx;
  const out = { at: Date.now(), players };
  await redis("SET", "ee:fn:index", JSON.stringify(out));
  return out;
}
async function earnings(name, pick) {
  if (!eeKey()) return { status: 503, error: "missing_key" };
  if (!storeReady()) return { status: 503, error: "no_store" };
  const norm = s => String(s || "").toLowerCase().replace(/\s+/g, "");
  let idx; try { idx = await earnersIndex(); } catch (e) { return { status: 502, error: e.ee === 1010 ? "invalid_key" : e.ee === 1011 ? "rate_limited" : "source_error" }; }
  if (!idx) return { status: 503, error: "index_building" };
  const matches = idx.players.filter(p => norm(p.h) === norm(name)).slice(0, 5);
  if (!matches.length) return { status: 404, error: "not_found", indexed: idx.players.length, indexedAt: idx.at };
  const chosen = matches.find(m => String(m.id) === String(pick)) || (matches.length === 1 ? matches[0] : null);
  if (!chosen) return { status: 300, matches: matches.map(m => ({ id: m.id, handle: m.h, country: m.c, totalUSD: m.t })) };
  const ck = `ee:p:${chosen.id}`; const c = await redis("GET", ck); if (c) return JSON.parse(c);
  try {
    const pl = await ee("LookupPlayerById", { playerid: chosen.id });
    const tours = [];
    for (let off = 0; off < 300; off += 100) { const t = await ee("LookupPlayerTournaments", { playerid: chosen.id, offset: off }); const arr = Array.isArray(t) ? t : []; tours.push(...arr); if (arr.length < 100) break; }
    const out = { status: 200, match: "name", player: { id: chosen.id, handle: pl.CurrentHandle || chosen.h, country: pl.CountryCode || chosen.c, totalUSD: pl.TotalUSDPrize ?? null, tournaments: pl.TotalTournaments ?? null, worldRanking: pl.WorldRanking ?? null, url: `https://www.esportsearnings.com/players/${chosen.id}` },
      tournaments: tours.filter(t => !t.GameId || +t.GameId === EE_FORTNITE).map(t => ({ name: t.TournamentName, date: t.EndDate, place: t.RankText, prize: t.Prize, currency: t.CurrencyCode, usd: t.ExchangeRate && t.Prize != null ? +(t.Prize * t.ExchangeRate).toFixed(2) : t.CurrencyCode === "USD" ? t.Prize : null })),
      fetchedAt: Date.now(), source: "Esports Earnings" };
    await redis("SET", ck, JSON.stringify(out), "EX", 12 * 3600);
    return out;
  } catch (e) { return { status: 502, error: e.ee === 1010 ? "invalid_key" : e.ee === 1011 ? "rate_limited" : "source_error" }; }
}

export default async function handler(req, res) {
  try {
    const op = String(req.query.op || "");
    const name = String(req.query.name || "").trim().slice(0, 40);
    if (op === "pr") { const out = await powerRanking(String(req.query.accountId || ""), name); if (out.status === 200) res.setHeader("Cache-Control", "s-maxage=1800, stale-while-revalidate=600"); return send(res, 200, out); }
    if (op === "earnings") { if (!name) return send(res, 400, { status: 400, error: "bad_request" }); return send(res, 200, await earnings(name, req.query.pick)); }
    return send(res, 400, { status: 400, error: "bad_op" });
  } catch { return send(res, 200, { status: 502, error: "unreachable" }); }
}
