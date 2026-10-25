// Base de precios compartida: guarda el precio original (regularPrice) de cada objeto que aparece
// solo (no en lote) en la tienda. Se rellena con la tarea diaria (api/collect) y cada vez que alguien abre la tienda.
import { storeReady, redis } from "./_lib.js";

export async function recordShop(shopJson) {
  if (!storeReady() || shopJson?.status !== 200 || !shopJson.data) return 0;
  const hash = shopJson.data.hash || shopJson.data.date;
  if (hash && (await redis("GET", "prices:last")) === hash) return 0; // esta tienda ya se registró
  const fields = [];
  for (const e of shopJson.data.entries || []) {
    const items = e.brItems || [];
    if (e.bundle || items.length !== 1 || !Number.isFinite(e.regularPrice) || e.regularPrice <= 0) continue;
    fields.push(items[0].id.toLowerCase(), String(e.regularPrice));
  }
  if (fields.length) await redis("HSET", "prices", ...fields);
  if (hash) await redis("SET", "prices:last", hash);
  await redis("SET", "prices:updated", String(Date.now()));
  return fields.length / 2;
}

export async function shopFromSource() {
  const headers = { "User-Agent": "DropStats/1.0" };
  if (process.env.FORTNITE_API_KEY) headers.Authorization = process.env.FORTNITE_API_KEY;
  const r = await fetch("https://fortnite-api.com/v2/shop?language=es", { headers });
  return r.json();
}
