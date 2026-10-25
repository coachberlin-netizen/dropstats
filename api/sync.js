// Datos guardados de cada cuenta: favoritos, jugadores, historial, rutas, marcadores, recordatorios, precios y preferencias.
// GET → { data, updatedAt }    PUT { data } → { updatedAt }
import { storeReady, redis, send, sameOrigin, readJSON, currentUser } from "./_lib.js";

const KEYS = ["favs", "favPlayers", "history", "routes", "markers", "events", "prices", "prefs", "myPlayer"];

export default async function handler(req, res) {
  if (!storeReady()) return send(res, 503, { error: "not_configured" });
  try {
    const u = await currentUser(req);
    if (!u) return send(res, 401, { error: "no_session" });
    if (req.method === "GET") {
      const raw = await redis("GET", "data:" + u.id);
      return send(res, 200, raw ? JSON.parse(raw) : { data: null, updatedAt: 0 });
    }
    if (req.method === "PUT") {
      if (!sameOrigin(req)) return send(res, 403, { error: "origin" });
      const b = await readJSON(req, 400_000);
      if (!b.data || typeof b.data !== "object") return send(res, 400, { error: "bad_data" });
      const data = {};
      for (const k of KEYS) if (k in b.data) data[k] = b.data[k];
      const updatedAt = Date.now();
      await redis("SET", "data:" + u.id, JSON.stringify({ data, updatedAt }));
      return send(res, 200, { updatedAt });
    }
    return send(res, 405, { error: "method" });
  } catch (e) {
    return send(res, e.code || 500, { error: e.code === 413 ? "too_big" : "server" });
  }
}
