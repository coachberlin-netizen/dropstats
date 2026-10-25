// Meta Lab: armas por parche desde api-fortnite.com (no oficial). La clave vive en el servidor: METALAB_API_KEY.
// GET /api/meta?op=weapons[&patch=41.00][&gamemode=BattleRoyale]   → { status, patch, items:[...] }
// GET /api/meta?op=patches                                         → { status, patches:[...], current }
// GET /api/meta?op=probe                                           → nombres de campos recibidos (diagnóstico, sin valores)
import { send } from "./_lib.js";
const BASE = "https://prod.api-fortnite.com";

const num = v => typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v.trim()) ? +v : null;
function flatStats(stats, rarity) {
  const out = {};
  if (!stats || typeof stats !== "object") return out;
  let src = stats;
  // si las estadísticas vienen por rareza ({ rare: {...}, epic: {...} }), se usa la de esta arma o la primera
  const vals = Object.values(stats);
  if (vals.length && vals.every(v => v && typeof v === "object" && !Array.isArray(v))) {
    const k = Object.keys(stats).find(x => x.toLowerCase() === String(rarity || "").toLowerCase());
    src = stats[k] || vals[0];
  }
  for (const [k, v] of Object.entries(src)) {
    const n = num(v);
    if (n != null) out[k] = n;
    else if (v && typeof v === "object" && !Array.isArray(v)) for (const [k2, v2] of Object.entries(v)) { const n2 = num(v2); if (n2 != null) out[`${k}.${k2}`] = n2; }
    if (Object.keys(out).length >= 40) break;
  }
  return out;
}
function firstImage(images) {
  if (!images) return "";
  if (typeof images === "string") return images;
  if (Array.isArray(images)) return images.find(x => typeof x === "string") || "";
  const pref = Object.keys(images).sort((a, b) => (/icon|large|full/i.test(b) ? 1 : 0) - (/icon|large|full/i.test(a) ? 1 : 0));
  for (const k of pref) { const v = images[k]; if (typeof v === "string" && /^https?:\/\//.test(v)) return v; }
  return "";
}
function normalize(w) {
  return {
    id: String(w.id || ""), name: String(w.displayName || w.name || w.id || ""), desc: String(w.description || "").slice(0, 300),
    rarity: String(w.rarity || "").toLowerCase(), type: String(w.type || ""), category: String(w.category || ""),
    ammo: String(w.ammoType || ""), trigger: String(w.triggerType || ""), inPool: !!w.inCurrentLootPool,
    modes: Array.isArray(w.gamemodes) ? w.gamemodes.slice(0, 8).map(String) : [], patch: String(w.patch || ""),
    image: firstImage(w.images), stats: flatStats(w.stats, w.rarity)
  };
}
export default async function handler(req, res) {
  const key = process.env.METALAB_API_KEY;
  if (!key) return send(res, 200, { status: 503, error: "missing_key" });
  const op = String(req.query.op || "weapons");
  const headers = { "x-api-key": key, "User-Agent": "DropStats/1.0", Accept: "application/json" };
  try {
    if (op === "patches") {
      const r = await fetch(`${BASE}/api/v2/weapons/patches`, { headers });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j) return send(res, 200, { status: r.status, error: r.status === 401 ? "invalid_key" : "source_error" });
      const list = Array.isArray(j) ? j : Array.isArray(j.patches) ? j.patches : [];
      const patches = list.map(p => typeof p === "string" ? { patch: p } : { patch: String(p.patch || p.version || p.name || ""), current: !!(p.current || p.isCurrent), date: p.date || p.releaseDate || null }).filter(p => p.patch);
      res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=600");
      return send(res, 200, { status: 200, patches, current: (patches.find(p => p.current) || patches[0] || {}).patch || null });
    }
    const qs = new URLSearchParams({ lang: "es" });
    const patch = String(req.query.patch || ""), gm = String(req.query.gamemode || "");
    if (/^\d{1,3}\.\d{1,3}$/.test(patch)) qs.set("patch", patch);
    if (/^[A-Za-z]{2,30}$/.test(gm)) qs.set("gamemode", gm);
    const r = await fetch(`${BASE}/api/v2/weapons?${qs}`, { headers });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j) return send(res, 200, { status: r.status, error: r.status === 401 ? "invalid_key" : r.status === 429 ? "rate_limited" : "source_error" });
    const raw = Array.isArray(j) ? j : Array.isArray(j.data) ? j.data : Array.isArray(j.items) ? j.items : [];
    if (op === "probe") return send(res, 200, { status: 200, count: raw.length, fields: raw[0] ? Object.keys(raw[0]) : [], statKeys: raw[0] ? Object.keys(flatStats(raw[0].stats, raw[0].rarity)) : [], imageKeys: raw[0]?.images && typeof raw[0].images === "object" ? Object.keys(raw[0].images) : [] });
    const items = raw.map(normalize).filter(x => x.id && x.name);
    res.setHeader("Cache-Control", "s-maxage=1800, stale-while-revalidate=600");
    return send(res, 200, { status: 200, patch: items[0]?.patch || patch || null, items, source: "api-fortnite.com" });
  } catch {
    return send(res, 200, { status: 502, error: "unreachable" });
  }
}
