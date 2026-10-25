// Estadísticas de Battle Royale vía fortnite-api.com.
// La clave vive solo en el servidor (variable de entorno FORTNITE_API_KEY); el navegador nunca la ve.
// Acepta un nombre de Epic/PSN/Xbox (name + accountType) o un ID de cuenta de Epic (id, 32 caracteres hexadecimales).
export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  const key = process.env.FORTNITE_API_KEY;
  if (!key) return res.status(200).json({ status: 503, error: "missing_key" });

  const id = String(req.query.id || "").trim().toLowerCase();
  const name = String(req.query.name || "").trim();
  const accountType = String(req.query.accountType || "epic");
  const timeWindow = req.query.timeWindow === "season" ? "season" : "lifetime";
  if (id && !/^[0-9a-f]{32}$/.test(id)) return res.status(200).json({ status: 400, error: "El ID de cuenta debe tener 32 caracteres (0-9, a-f)." });
  if (!id && (!name || name.length > 40)) return res.status(200).json({ status: 400, error: "Escribe un nombre de jugador válido." });
  if (!["epic", "psn", "xbl"].includes(accountType)) return res.status(200).json({ status: 400, error: "Plataforma no válida." });

  const url = id
    ? `https://fortnite-api.com/v2/stats/br/v2/${id}?${new URLSearchParams({ timeWindow })}`
    : `https://fortnite-api.com/v2/stats/br/v2?${new URLSearchParams({ name, accountType, timeWindow })}`;
  try {
    const r = await fetch(url, { headers: { Authorization: key, "User-Agent": "DropStats/1.0" } });
    const body = await r.text();
    let j;
    try { j = JSON.parse(body); } catch { return res.status(200).json({ status: 502, error: "Respuesta no válida de fortnite-api.com" }); }
    if (r.status === 401 || (r.status === 403 && /api key|unauthori/i.test(j.error || ""))) return res.status(200).json({ status: 401, error: "invalid_key" });
    // Se responde siempre 200 al navegador; el estado real va en el campo status.
    return res.status(200).json(j);
  } catch {
    return res.status(200).json({ status: 502, error: "No se pudo contactar con fortnite-api.com" });
  }
}
