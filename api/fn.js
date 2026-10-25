// Proxy de solo lectura hacia fortnite-api.com (fuente no oficial y gratuita).
// Solo permite rutas públicas concretas; añade caché en el borde de Vercel.
const ALLOW = [
  /^v2\/shop$/,
  /^v1\/map$/,
  /^v2\/news\/br$/,
  /^v2\/cosmetics\/new$/,
  /^v2\/cosmetics\/br\/search\/all$/,
  /^v2\/cosmetics\/br\/[A-Za-z0-9_\-]{1,120}$/
];
const PARAMS = new Set(["language", "searchLanguage", "name", "matchMethod", "type", "rarity", "id"]);

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  const { p, ...rest } = req.query;
  if (!p || !ALLOW.some(r => r.test(p))) {
    return res.status(400).json({ status: 400, error: "Ruta no permitida" });
  }
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(rest)) if (PARAMS.has(k) && typeof v === "string" && v.length <= 80) qs.set(k, v);
  const headers = { "User-Agent": "DropStats/1.0" };
  if (process.env.FORTNITE_API_KEY) headers.Authorization = process.env.FORTNITE_API_KEY;
  try {
    const r = await fetch(`https://fortnite-api.com/${p}${qs.size ? "?" + qs : ""}`, { headers });
    const body = await r.text();
    res.setHeader("Cache-Control", p === "v2/shop" ? "s-maxage=120, stale-while-revalidate=60" : "s-maxage=3600, stale-while-revalidate=600");
    return res.status(r.status).send(body);
  } catch {
    return res.status(502).json({ status: 502, error: "No se pudo contactar con fortnite-api.com" });
  }
}
