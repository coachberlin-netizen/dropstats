#!/usr/bin/env python3
"""Descarga la tienda actual, el mapa y las novedades de fortnite-api.com con sus imágenes
y los guarda en public/data/ para publicarlos junto a la página.

Sirve para entornos donde el navegador no puede conectarse a fortnite-api.com (por ejemplo,
el visor de artifacts de Claude). La app solo usa la copia de la tienda si se obtuvo después
del último cambio de tienda (00:00 UTC); si no, muestra el error en lugar de una tienda antigua.

Uso:  python3 scripts/snapshot.py [--base https://fortnite-api.com] [--lang es]
Requiere: Pillow (pip install pillow)
"""
import argparse, hashlib, io, json, os, sys, time, urllib.request
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument("--base", default="https://fortnite-api.com")
ap.add_argument("--lang", default="es")
ap.add_argument("--out", default=os.path.join(os.path.dirname(__file__), "..", "public", "data"))
ap.add_argument("--max-new", type=int, default=120)
args = ap.parse_args()
OUT = os.path.abspath(args.out)
IMG = os.path.join(OUT, "img")
os.makedirs(IMG, exist_ok=True)
UA = {"User-Agent": "DropStats-snapshot/1.0"}
kept = set()

def get(url, raw=False):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=40) as r:
        b = r.read()
    return b if raw else json.loads(b)

def img(url, size=512, q=82):
    """Descarga una imagen, la pasa a WebP y devuelve la ruta relativa (o None si falla)."""
    if not url or not url.startswith("http"):
        return None
    name = hashlib.sha1(f"{url}|{size}".encode()).hexdigest()[:16] + ".webp"
    path = os.path.join(IMG, name)
    if not os.path.exists(path):
        try:
            im = Image.open(io.BytesIO(get(url, raw=True)))
            im = im.convert("RGBA")
            im.thumbnail((size, size), Image.LANCZOS)
            im.save(path, "WEBP", quality=q, method=6)
        except Exception as e:
            print("  imagen no descargada:", url, e, file=sys.stderr)
            return None
    kept.add(name)
    return "data/img/" + name

def stamp(j):
    j["_snapshot"] = {"fetchedAt": int(time.time() * 1000), "source": args.base}
    return j

def write(name, j):
    with open(os.path.join(OUT, name), "w", encoding="utf-8") as f:
        json.dump(j, f, ensure_ascii=False, separators=(",", ":"))
    print(f"{name}: {os.path.getsize(os.path.join(OUT, name)) // 1024} KB")

def item_imgs(it):
    ims = it.get("images") or {}
    it["images"] = {"icon": img(ims.get("icon") or ims.get("smallIcon"), 384)}

# ---- tienda ----
shop = get(f"{args.base}/v2/shop?language={args.lang}")
assert shop.get("status") == 200, shop
for e in shop["data"].get("entries", []):
    nda = e.get("newDisplayAsset") or {}
    for r in nda.get("renderImages") or []:
        r["image"] = img(r.get("image"), 512)
    nda["renderImages"] = (nda.get("renderImages") or [])[:1]
    if e.get("bundle"):
        e["bundle"]["image"] = img(e["bundle"].get("image"), 512)
    for it in e.get("brItems") or []:
        item_imgs(it)
        if isinstance(it.get("series"), dict):
            it["series"].pop("image", None)
    for t in e.get("tracks") or []:
        t["albumArt"] = img(t.get("albumArt"), 512)
    for k in ("cars", "instruments", "legoKits"):
        for x in e.get(k) or []:
            ims = x.get("images") or {}
            x["images"] = {"large": img(ims.get("large") or ims.get("small"), 512)}
shop["data"].pop("vbuckIcon", None)
write("shop.json", stamp(shop))

# ---- mapa ----
mp = get(f"{args.base}/v1/map?language={args.lang}")
assert mp.get("status") == 200, mp
ims = mp["data"].get("images") or {}
mp["data"]["images"] = {"blank": img(ims.get("blank"), 2048, 80), "pois": img(ims.get("pois"), 2048, 80)}
write("map.json", stamp(mp))

# ---- novedades del catálogo ----
nw = get(f"{args.base}/v2/cosmetics/new?language={args.lang}")
if nw.get("status") == 200:
    br = (nw["data"].get("items") or {}).get("br") or []
    br = br[: args.max_new]
    for it in br:
        item_imgs(it)
        if isinstance(it.get("series"), dict):
            it["series"].pop("image", None)
    nw["data"]["items"] = {"br": br}
    write("new.json", stamp(nw))

# limpiar imágenes que ya no se usan
for f in os.listdir(IMG):
    if f not in kept:
        os.remove(os.path.join(IMG, f))
print(f"{len(kept)} imágenes en {IMG}")
