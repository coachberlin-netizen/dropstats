#!/bin/bash
mkdir -p out/probe; B=https://dropstats.vercel.app; curl -s -m 20 $B/api/billing > out/probe/0_billing.json; curl -s -m 20 -o /dev/null -w "%{http_code}" $B/api/meta > out/probe/0_meta_status.txt; O="Origin: $B"; J="Content-Type: application/json"
E="prueba-$(date +%s)@dropstats-test.invalid"; P="Prueba-$(openssl rand -hex 8)"
curl -s -m 20 -c c.txt -H "$O" -H "$J" -d "{\"action\":\"register\",\"email\":\"$E\",\"password\":\"$P\"}" $B/api/auth > out/probe/1_register.json
for q in "¿Cuánto daño hace la escopeta a la cabeza?" "¿Qué tal la escopeta táctica legendaria?"; do
python3 - "{\"messages\":[{\"role\":\"user\",\"content\":\"$q\"}],\"context\":{\"app\":\"DropStats\"},\"stream\":true}" <<'PY' >> out/probe/2_chat.txt
import sys, time, json, http.cookiejar, urllib.request
cj=http.cookiejar.MozillaCookieJar("c.txt"); cj.load(ignore_discard=True, ignore_expires=True)
op=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
r=urllib.request.Request("https://dropstats.vercel.app/api/ai", data=sys.argv[1].encode(), headers={"Content-Type":"application/json","Origin":"https://dropstats.vercel.app"})
t0=time.time(); res=op.open(r, timeout=70); n=0; text=""; ev=[]
for ln in res:
    o=json.loads(ln); t=round(time.time()-t0,2)
    if o["t"]=="delta": n+=1; text+=o["d"]; ev.append(("d",t)) if n==1 else None
    else: ev.append((o["t"],o.get("d") or o.get("error") or o.get("wiki"),t))
print("=== ", json.loads(sys.argv[1])["messages"][0]["content"], ev, "· deltas", n); print(text); print()
PY
sleep 20; done
curl -s -m 20 -b c.txt -H "$O" -H "$J" -d "{\"action\":\"delete\",\"password\":\"$P\"}" $B/api/auth > out/probe/6_delete.json; rm -f c.txt
