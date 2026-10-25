#!/bin/bash
mkdir -p out/probe; B=https://dropstats.vercel.app
for q in "%C2%BFCu%C3%A1nto%20da%C3%B1o%20hace%20la%20escopeta%20m%C3%A1s%20com%C3%BAn%20de%20Fortnite%20en%20el%20parche%20actual%3F"; do
  curl -s -m 90 -w "\nHTTP %{http_code} en %{time_total}s\n" "$B/api/ai?op=web&q=$q" > out/probe/web1.txt
done
