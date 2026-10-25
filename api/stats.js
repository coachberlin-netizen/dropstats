// Estadísticas de Battle Royale vía fortnite-api.com.
// La clave vive solo en el servidor (variable de entorno FORTNITE_API_KEY); el navegador nunca la ve.
export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  const key = process.env.FORTNITE_API_KEY;
  if (!key) return res.status(503).json({ status: 503, error: "missing_key" });

  const name = String(req.query.name || "").trim();
  const accountType = String(req.query.accountType || "epic");
  const timeWindow = req.query.timeWindow === "season" ? "season" : "lifetime";
  if (!name || name.length > 40) return res.status(400).json({ status: 400, error: "Nombre no válido" });
  if (!["epic", "psn", "xbl"].includes(accountType)) return res.status(400).json({ status: 400, error: "Plataforma no válida" });

  try {
    const qs = new URLSearchParams({ name, accountType, timeWindow });
    const r = await fetch(`https://fortnite-api.com/v2/stats/br/v2?${qs}`, { headers: { Authorization: key, "User-Agent": "DropStats/1.0" } });
    res.setHeader("Cache-Control", "s-maxage=120");
    return res.status(r.status).send(await r.text());
  } catch {
    return res.status(502).json({ status: 502, error: "No se pudo contactar con fortnite-api.com" });
  }
}
