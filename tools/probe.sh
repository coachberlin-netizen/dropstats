#!/bin/bash
# Comprueba sin claves que los servicios existen y qué responden (código HTTP y cabeceras)
mkdir -p out/probe
for u in "https://prod.api-fortnite.com/api/v2/weapons/patches" "https://prod.api-fortnite.com/api/v2/weapons" "https://api.groq.com/openai/v1/models" "https://generativelanguage.googleapis.com/v1beta/models"; do
  n=$(echo "$u" | sed 's#https://##; s#[/?=&]#_#g')
  curl -s -m 25 -D out/probe/$n.h -o out/probe/$n.b "$u"; echo "$u $(head -1 out/probe/$n.h)" >> out/probe/summary.txt
done
