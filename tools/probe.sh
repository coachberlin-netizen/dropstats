#!/bin/bash
# Prueba real de Drop AI en producción con una cuenta temporal que se borra al final
mkdir -p out/probe; B=https://dropstats.vercel.app; O="Origin: $B"; J="Content-Type: application/json"
E="prueba-$(date +%s)@dropstats-test.invalid"; P="Prueba-$(openssl rand -hex 8)"
curl -s -m 20 -c c.txt -H "$O" -H "$J" -d "{\"action\":\"register\",\"email\":\"$E\",\"password\":\"$P\"}" $B/api/auth > out/probe/1_register.json
CTX='{"app":"DropStats","plan":"Drop Ultra","misEstadisticas":{"jugador":"PruebaReal","periodo":"total","general":{"victorias":120,"eliminaciones":3400,"partidas":1800,"kd":2.03,"porcentajeVictorias":6.67}},"noDisponible":["Meta Lab (no configurado)"],"torneos":"El usuario no tiene recordatorios de torneos."}'
for q in "Interpreta mis estadísticas en 3 puntos breves" "¿Qué daño hace la escopeta del parche actual?"; do
  curl -s -m 60 -b c.txt -H "$O" -H "$J" -d "{\"messages\":[{\"role\":\"user\",\"content\":\"$q\"}],\"context\":$CTX}" $B/api/ai >> out/probe/2_chat.jsonl; echo >> out/probe/2_chat.jsonl
done
curl -s -m 20 -H "$O" -H "$J" -d '{"messages":[{"role":"user","content":"hola"}]}' $B/api/ai > out/probe/3_nosession.json
curl -s -m 20 -b c.txt -H "$O" -H "$J" -d "{\"action\":\"delete\",\"password\":\"$P\"}" $B/api/auth > out/probe/4_delete.json
rm -f c.txt
