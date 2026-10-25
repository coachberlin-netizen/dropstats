#!/bin/bash
mkdir -p out/probe; cd out/probe
for u in https://prod.api-fortnite.com/swagger https://prod.api-fortnite.com/swagger/v1/swagger.json https://prod.api-fortnite.com/swagger.json https://prod.api-fortnite.com/swagger/doc.json https://prod.api-fortnite.com/api-docs https://prod.api-fortnite.com/openapi.json https://prod.api-fortnite.com/swagger-ui/swagger.json https://prod.api-fortnite.com/swagger/swagger.json https://prod.api-fortnite.com/docs/json https://prod.api-fortnite.com/api/v2/weapons?version=current; do
  f=$(echo "$u" | sed 's#https://##; s#[/?=]#_#g'); code=$(curl -sL -m 20 -o "$f" -w "%{http_code} %{content_type}" "$u"); echo "$u -> $code $(wc -c < "$f")" | tee -a index.txt
done
# si la UI de swagger referencia un JSON, intentar descargarlo
grep -ohE '"[^"]*\.json"|url: ?"[^"]+"|"/[a-z/_-]*swagger[^"]*"' prod.api-fortnite.com_swagger 2>/dev/null | head -20 >> index.txt
