// Proxy de imágenes de fortnite-api.com (mismo origen), para poder dibujarlas en un canvas y exportar estrategias como PNG.
export default async function handler(req, res) {
  const u = String(req.query.u || "");
  if (!/^https:\/\/fortnite-api\.com\/images\/[A-Za-z0-9_\-./]+\.(png|jpg|jpeg|webp)$/i.test(u)) { res.statusCode = 400; return res.end("URL no permitida"); }
  try {
    const r = await fetch(u, { headers: { "User-Agent": "DropStats/1.0" } });
    if (!r.ok) { res.statusCode = r.status; return res.end(); }
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 12 * 1024 * 1024) { res.statusCode = 413; return res.end(); }
    res.setHeader("Content-Type", r.headers.get("content-type") || "image/png");
    res.setHeader("Cache-Control", "public, s-maxage=86400, max-age=3600");
    res.statusCode = 200; return res.end(buf);
  } catch { res.statusCode = 502; return res.end(); }
}
