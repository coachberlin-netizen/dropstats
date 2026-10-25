// GET /api/prices → { prices: { idEnMinúsculas: paVos }, count, updatedAt }
import { storeReady, redis, send } from "./_lib.js";

export default async function handler(req, res) {
  if (!storeReady()) return send(res, 200, { prices: {}, count: 0, updatedAt: 0, configured: false });
  try {
    const flat = (await redis("HGETALL", "prices")) || [];
    const prices = {};
    for (let i = 0; i < flat.length; i += 2) prices[flat[i]] = +flat[i + 1];
    const updatedAt = +(await redis("GET", "prices:updated")) || 0;
    res.setHeader("Cache-Control", "s-maxage=600, stale-while-revalidate=3600");
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.end(JSON.stringify({ prices, count: flat.length / 2, updatedAt, configured: true }));
  } catch {
    return send(res, 200, { prices: {}, count: 0, updatedAt: 0, error: "server" });
  }
}
