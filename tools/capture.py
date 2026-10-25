# Capturas de DropStats para el vídeo v2 (pantalla de iPhone 390x844, 1080 px de ancho).
import json, os, math, time, urllib.request
from playwright.sync_api import sync_playwright
BASE = "https://dropstats.vercel.app/"
OUT = "out"; [os.makedirs(f"{OUT}/{d}", exist_ok=True) for d in ("", "route", "img")]
DSF = 1080 / 390; VW, VH = 390, 844
meta = {"dsf": DSF, "vw": VW, "vh": VH}
def shot(pg, name): pg.screenshot(path=f"{OUT}/{name}.png"); print("ok", name, flush=True)
def bbox(pg, sel):
    b = pg.locator(sel).first.bounding_box(); return [b["x"] + b["width"] / 2, b["y"] + b["height"] / 2] if b else None
def wait_imgs(pg, sel="main .art", n=4, timeout=15):
    t0 = time.time()
    while time.time() - t0 < timeout:
        k = pg.evaluate(f"""() => {{ const a=[...document.querySelectorAll('{sel}')].filter(e=>{{const r=e.getBoundingClientRect();return r.bottom>0&&r.top<innerHeight&&r.width>0}}); return [a.length, a.filter(e=>e.classList.contains('ld')||e.classList.contains('noimg')).length] }}""")
        if k[0] and k[1] >= min(n, k[0]): break
        pg.wait_for_timeout(300)
    pg.wait_for_timeout(700)
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": VW, "height": VH}, device_scale_factor=DSF, locale="es-ES", timezone_id="Europe/Madrid")
    pg = ctx.new_page()
    pg.goto(BASE + "#home"); pg.wait_for_selector(".hero .big", timeout=40000); wait_imgs(pg, ".strip .art", 4)
    meta["nav"] = {k: bbox(pg, f".nav [data-go={k}]") for k in ("home", "shop", "catalog", "map", "stats")}
    meta["favbtn"] = bbox(pg, "#favbtn")
    shot(pg, "home")
    # tienda
    pg.click(".nav [data-go=shop]"); wait_imgs(pg); shot(pg, "shop")
    pg.evaluate("document.querySelectorAll('img').forEach(i=>i.loading='eager')")
    pg.set_viewport_size({"width": VW, "height": 3400}); wait_imgs(pg, "main .art", 40, 30); shot(pg, "shop_tall")
    pg.set_viewport_size({"width": VW, "height": VH}); pg.wait_for_timeout(600)
    # una skin vistosa (atuendo con imagen) visible arriba
    idx = pg.evaluate("""() => { const t=[...document.querySelectorAll('main [data-act=entry]')]; const i=t.findIndex(b=>/Traje|Atuendo/i.test(b.querySelector('.mt')?.textContent||'') && b.getBoundingClientRect().top < 700); return i<0?0:i }""")
    tile = pg.locator("main [data-act=entry]").nth(idx); meta["tap_detail"] = bbox(pg, f"main [data-act=entry] >> nth={idx}")
    tile.click(); pg.wait_for_timeout(3800); shot(pg, "detail")
    pg.evaluate("document.querySelector('#sheet').scrollTo({top:430})"); pg.wait_for_timeout(1200); shot(pg, "detail2")
    pg.click("#sheet [data-act=close]"); pg.wait_for_timeout(600)
    entries = pg.evaluate("""() => SHOP.entries.filter(e=>e.img && e.type==='outfit').slice(0,10).map(e=>({img:e.img,name:e.name,price:e.price,c1:e.c1,c2:e.c2,key:e.key,item:e.items[0]?.id}))""")
    for i, e in enumerate(entries):
        try: urllib.request.urlretrieve(e["img"], f"{OUT}/img/{i}.png"); e["file"] = f"img/{i}.png"
        except Exception as ex: print("img", ex)
    meta["entries"] = entries; meta["count"] = pg.evaluate("SHOP.entries.length")
    # catálogo
    pg.click(".nav [data-go=catalog]"); pg.wait_for_selector("main .tile", timeout=40000); wait_imgs(pg); shot(pg, "catalog")
    pg.set_viewport_size({"width": VW, "height": 2600}); wait_imgs(pg, "main .art", 20, 20); shot(pg, "catalog_tall")
    pg.set_viewport_size({"width": VW, "height": VH}); pg.wait_for_timeout(600)
    j = pg.evaluate("""() => { const t=[...document.querySelectorAll('main [data-act=item]')]; const i=t.findIndex(b=>b.querySelector('.tag.today') && b.getBoundingClientRect().top>0 && b.getBoundingClientRect().bottom<780); return i<0?0:i }""")
    meta["tap_cat"] = bbox(pg, f"main [data-act=item] >> nth={j}")
    pg.locator("main [data-act=item]").nth(j).click(); pg.wait_for_timeout(3500); shot(pg, "cat_detail")
    pg.click("#sheet [data-act=close]"); pg.wait_for_timeout(600)
    # mapa
    pg.click(".nav [data-go=map]"); pg.wait_for_selector("#mapimg:not([hidden])", timeout=40000); pg.wait_for_timeout(1500); shot(pg, "map")
    bx = pg.locator("#mapwrap").bounding_box(); meta["mapbox"] = bx
    meta["tool_pin"] = bbox(pg, "[data-mode=pin]"); meta["tool_draw"] = bbox(pg, "[data-mode=draw]")
    pg.click("[data-mode=pin]"); pg.wait_for_timeout(2400)
    pins = [(0.30, 0.34), (0.70, 0.66)]; meta["pins"] = []
    for k, (fx, fy) in enumerate(pins):
        x, y = bx["x"] + bx["width"] * fx, bx["y"] + bx["height"] * fy; meta["pins"].append([x, y])
        pg.mouse.click(x, y); pg.wait_for_timeout(2400); shot(pg, f"map_pin{k + 1}")
    pg.click("[data-mode=draw]"); pg.wait_for_timeout(2400)
    (sx, sy), (ex, ey) = meta["pins"]; n = 36; meta["route_pts"] = []
    pg.mouse.move(sx, sy + 4); pg.mouse.down()
    for i in range(1, n + 1):
        f = i / n; x = sx + (ex - sx) * f + 55 * math.sin(f * math.pi); y = sy + (ey - sy) * f - 40 * math.sin(f * math.pi * 1.3)
        pg.mouse.move(x, y, steps=2); meta["route_pts"].append([x, y])
        pg.screenshot(path=f"{OUT}/route/{i:02d}.png")
    pg.mouse.up(); pg.wait_for_timeout(500)
    pg.fill("#rname", "Caída rápida"); pg.click("form[data-form=newroute] .btn.pri"); pg.wait_for_timeout(2400); shot(pg, "map_route")
    # favoritos (solo en este navegador, sin cuenta)
    pg.evaluate("""() => { SHOP.entries.filter(e=>e.type==='outfit' && e.items.length===1).slice(0,6).forEach(e=>{ if(!S.favs[e.items[0].id]) toggleFav(e.items[0].id) }) }""")
    pg.wait_for_timeout(500); pg.click("#favbtn"); wait_imgs(pg); pg.wait_for_timeout(1500); shot(pg, "favs")
    # estadísticas
    pg.click(".nav [data-go=stats]"); pg.wait_for_timeout(1200); shot(pg, "stats")
    pg.click("#statq"); pg.keyboard.type("TuNombreDeEpic", delay=40); pg.wait_for_timeout(400); shot(pg, "stats_typed")
    pg.click(".nav [data-go=home]"); pg.wait_for_timeout(1500); wait_imgs(pg, ".hscroll .art", 3); shot(pg, "home2")
    ctx.close(); b.close()
json.dump(meta, open(OUT + "/meta.json", "w"), ensure_ascii=False, indent=1)
print(json.dumps(meta, ensure_ascii=False)[:800])
