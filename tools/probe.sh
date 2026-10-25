#!/bin/bash
mkdir -p out/probe; W=https://fortnite.fandom.com/api.php
curl -s -m 30 -A "DropStats/1.0 (dropstats.vercel.app)" "$W?action=query&list=search&srsearch=Pump%20Shotgun&srlimit=5&format=json" > out/probe/f_search.json
curl -s -m 30 -A "DropStats/1.0 (dropstats.vercel.app)" "$W?action=parse&page=Pump_Shotgun&prop=wikitext&format=json&formatversion=2" > out/probe/f_wikitext.json
curl -s -m 30 -A "DropStats/1.0 (dropstats.vercel.app)" "$W?action=parse&page=Pump_Shotgun&prop=sections&format=json&formatversion=2" > out/probe/f_sections.json
curl -s -m 30 -A "DropStats/1.0 (dropstats.vercel.app)" "$W?action=query&list=search&srsearch=Escopeta%20de%20corredera&srlimit=3&format=json" > out/probe/f_search_es.json
curl -s -m 30 -A "DropStats/1.0" "https://fortnite.fandom.com/es/api.php?action=query&list=search&srsearch=escopeta&srlimit=5&format=json" > out/probe/f_es_wiki.json
