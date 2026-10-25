#!/bin/bash
mkdir -p out/probe; W=https://fortnite.fandom.com/api.php
for t in Pump_Shotgun Assault_Rifle Hand_Cannon Tactical_Shotgun Sniper_Rifle; do
curl -s -m 30 -A "DropStats/1.0 (dropstats.vercel.app)" "$W?action=parse&page=$t&prop=wikitext&redirects=1&format=json&formatversion=2" > out/probe/w_$t.json; done
