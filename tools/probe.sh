#!/bin/bash
# Prueba real de streaming de Drop AI en producción con cuenta temporal (se borra al final)
mkdir -p out/probe; B=https://dropstats.vercel.app; O="Origin: $B"; J="Content-Type: application/json"
E="prueba-$(date +%s)@dropstats-test.invalid"; P="Prueba-$(openssl rand -hex 8)"
curl -s -m 20 -c c.txt -H "$O" -H "$J" -d "{\"action\":\"register\",\"email\":\"$E\",\"password\":\"$P\"}" $B/api/auth > out/probe/1_register.json
Q='{"messages":[{"role":"user","content":"Dame 6 consejos detallados para mejorar las rotaciones en Fortnite, uno por párrafo."}],"context":{"app":"DropStats"},"stream":true}'
# 1) streaming con 3 preguntas: ¿atribuye a DropStats datos que no tiene?
for q in "Dame 6 consejos detallados para mejorar las rotaciones en Fortnite, uno por párrafo." "¿Dónde me recomiendas aterrizar esta temporada?" "¿Qué arma es la mejor ahora mismo?"; do
python3 - "{\"messages\":[{\"role\":\"user\",\"content\":\"$q\"}],\"context\":{\"app\":\"DropStats\",\"noDisponible\":[\"estadísticas del jugador\",\"Meta Lab\"]},\"stream\":true}" <<'PY' >> out/probe/2_stream.txt
import sys, time, json, re, http.cookiejar, urllib.request
cj=http.cookiejar.MozillaCookieJar("c.txt"); cj.load(ignore_discard=True, ignore_expires=True)
op=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
r=urllib.request.Request("https://dropstats.vercel.app/api/ai", data=sys.argv[1].encode(), headers={"Content-Type":"application/json","Origin":"https://dropstats.vercel.app"})
t0=time.time(); res=op.open(r, timeout=70); n=0; first=None; text=""; done=None
for ln in res:
    o=json.loads(ln)
    if o["t"]=="delta": n+=1; text+=o["d"]; first=first or time.time()-t0
    else: done=o
print("=== deltas", n, "· primer trozo", round(first or -1,2), "s · total", round(time.time()-t0,2), "s ·", done)
print("menciones a DropStats:", [text[max(0,m.start()-60):m.end()+80].replace("\n"," ") for m in re.finditer("DropStats", text)])
print(text[:700].replace("\n"," | ")); print()
PY
done
exit_after_stream=1
# 2) detener: se corta a los 1,5 s
python3 - "$Q" <<'PY' > out/probe/3_stop.txt
import sys, time, json, http.cookiejar, urllib.request
cj=http.cookiejar.MozillaCookieJar("c.txt"); cj.load(ignore_discard=True, ignore_expires=True)
op=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
r=urllib.request.Request("https://dropstats.vercel.app/api/ai", data=sys.argv[1].encode(), headers={"Content-Type":"application/json","Origin":"https://dropstats.vercel.app"})
t0=time.time(); res=op.open(r, timeout=70); n=0
for ln in res:
    n+=1
    if time.time()-t0>1.5: break
res.close(); print("cortado tras", n, "líneas a", round(time.time()-t0,2), "s")
PY
# 3) sin streaming (compatibilidad) y sin sesión
curl -s -m 60 -b c.txt -H "$O" -H "$J" -d '{"messages":[{"role":"user","content":"Di hola en una frase"}],"context":{}}' $B/api/ai > out/probe/4_json.json
curl -s -m 20 -H "$O" -H "$J" -d '{"messages":[{"role":"user","content":"hola"}],"stream":true}' $B/api/ai > out/probe/5_nosession.json
curl -s -m 20 -b c.txt -H "$O" -H "$J" -d "{\"action\":\"delete\",\"password\":\"$P\"}" $B/api/auth > out/probe/6_delete.json
rm -f c.txt
