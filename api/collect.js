// Tarea diaria (Vercel Cron, ver vercel.json): registra los precios de la tienda del día aunque nadie abra la app.
import { recordShop, shopFromSource } from "./_prices.js";
import { send } from "./_lib.js";

export default async function handler(req, res) {
  // Si existe CRON_SECRET, Vercel la envía en la cabecera Authorization; sin ella la tarea sigue siendo inofensiva (solo lee la tienda).
  if (process.env.CRON_SECRET && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) return send(res, 401, { error: "unauthorized" });
  try {
    const n = await recordShop(await shopFromSource());
    return send(res, 200, { ok: true, recorded: n });
  } catch {
    return send(res, 200, { ok: false });
  }
}
