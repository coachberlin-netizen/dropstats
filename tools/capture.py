# Capturas reales de DropStats para el vídeo (1080 px de ancho).
import json, os, time, urllib.request
from playwright.sync_api import sync_playwright
BASE = "https://dropstats.vercel.app/"
OUT = "out"; os.makedirs(OUT + "/frames", exist_ok=True); os.makedirs(OUT + "/img", exist_ok=True)
DSF = 1080 / 390
meta = {}
def shot(pg, name): pg.screenshot(path=f"{OUT}/{name}.png"); print("ok", name)
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 390, "height": 693}, device_scale_factor=DSF, locale="es-ES", timezone_id="Europe/Madrid",
                        record_video_dir=OUT + "/rec", record_video_size={"width": 1080, "height": 1920})
    pg = ctx.new_page()
    pg.goto(BASE + "#home"); pg.wait_for_selector(".hero .big", timeout=30000); pg.wait_for_timeout(2500)
    shot(pg, "home")
    # tienda: captura alta para hacer un barrido
    pg.click(".nav [data-go=shop]"); pg.wait_for_timeout(2500)
    shot(pg, "shop")
    pg.set_viewport_size({"width": 390, "height": 2600}); pg.wait_for_timeout(2500)
    pg.evaluate("document.querySelectorAll('img').forEach(i=>i.loading='eager')"); pg.wait_for_timeout(3000)
    shot(pg, "shop_tall")
    pg.set_viewport_size({"width": 390, "height": 693}); pg.wait_for_timeout(800)
    # scroll suave grabado
    for y in range(0, 1400, 35):
        pg.evaluate(f"document.querySelector('main').scrollTo(0,{y})"); pg.wait_for_timeout(40)
    pg.evaluate("document.querySelector('main').scrollTo(0,0)"); pg.wait_for_timeout(600)
    # ficha de un atuendo
    t = pg.locator("main [data-act=entry]").first
    t.click(); pg.wait_for_timeout(3500)
    shot(pg, "detail")
    pg.evaluate("document.querySelector('#sheet').scrollTo(0,420)"); pg.wait_for_timeout(1200)
    shot(pg, "detail2")
    pg.click("#sheet [data-act=close]"); pg.wait_for_timeout(600)
    # imágenes de la tienda (renders) para planos grandes
    entries = pg.evaluate("""() => [...document.querySelectorAll('main [data-act=entry]')].slice(0,14).map(b => ({
        img: b.querySelector('img')?.src || '', name: b.querySelector('.nm')?.textContent || '', price: b.querySelector('.vb')?.childNodes[1]?.textContent?.trim() || '',
        bg: getComputedStyle(b.querySelector('.art')).getPropertyValue('--c1'), bg2: getComputedStyle(b.querySelector('.art')).getPropertyValue('--c2') }))""")
    for i, e in enumerate(entries):
        if e["img"]:
            try:
                urllib.request.urlretrieve(e["img"], f"{OUT}/img/{i}.png"); e["file"] = f"img/{i}.png"
            except Exception as ex: print("img fail", ex)
    meta["entries"] = entries
    meta["count"] = pg.evaluate("document.querySelector('.pill')?.textContent || ''")
    # catálogo
    pg.click(".nav [data-go=catalog]"); pg.wait_for_selector("main .tile", timeout=30000); pg.wait_for_timeout(3500)
    shot(pg, "catalog")
    pg.fill("#catq", "peely"); pg.press("#catq", "Enter"); pg.wait_for_selector("main .tile", timeout=30000); pg.wait_for_timeout(4000)
    shot(pg, "catalog_search")
    # mapa + dibujo de ruta
    pg.click(".nav [data-go=map]"); pg.wait_for_selector("#mapimg:not([hidden])", timeout=30000); pg.wait_for_timeout(1500)
    shot(pg, "map")
    pg.click("[data-mode=pin]"); bx = pg.locator("#mapwrap").bounding_box()
    for (fx, fy) in [(0.32, 0.38), (0.66, 0.62)]:
        pg.mouse.click(bx["x"] + bx["width"] * fx, bx["y"] + bx["height"] * fy); pg.wait_for_timeout(250)
    pg.wait_for_timeout(2300)
    shot(pg, "map_pins")
    pg.click("[data-mode=draw]"); pg.wait_for_timeout(2300)
    sx, sy = bx["x"] + bx["width"] * 0.32, bx["y"] + bx["height"] * 0.38
    ex_, ey = bx["x"] + bx["width"] * 0.66, bx["y"] + bx["height"] * 0.62
    pg.mouse.move(sx, sy); pg.mouse.down()
    n = 24
    for i in range(1, n + 1):
        f = i / n
        x = sx + (ex_ - sx) * f + 40 * __import__("math").sin(f * 3.14)
        y = sy + (ey - sy) * f - 30 * __import__("math").sin(f * 3.14)
        pg.mouse.move(x, y, steps=2)
        if i % 3 == 0: pg.screenshot(path=f"{OUT}/frames/route_{i:02d}.png")
    pg.mouse.up(); pg.wait_for_timeout(600)
    pg.fill("#rname", "Caída rápida"); pg.click("form[data-form=newroute] .btn.pri"); pg.wait_for_timeout(2400)
    shot(pg, "map_route")
    # estadísticas (pantalla de búsqueda) y cuenta
    pg.click(".nav [data-go=stats]"); pg.wait_for_timeout(1500); shot(pg, "stats")
    pg.click(".top [data-go=account]"); pg.wait_for_timeout(2000); shot(pg, "account")
    pg.click(".nav [data-go=home]"); pg.wait_for_timeout(1500)
    ctx.close(); b.close()
json.dump(meta, open(OUT + "/meta.json", "w"), ensure_ascii=False, indent=1)
print(json.dumps(meta, ensure_ascii=False)[:1500])
