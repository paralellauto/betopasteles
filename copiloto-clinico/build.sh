#!/bin/sh
set -e
cd "$(dirname "$0")"
mkdir -p dist
OUT=dist/copiloto-clinico.html
{
  cat src/head.html
  printf '<style>\n'
  cat src/style.css
  printf '</style>\n'
  cat src/body.html
  printf '<script>\n'
  cat src/js/00-core.js src/js/10-ai.js src/js/20-data.js src/js/30-views.js src/js/40-actions.js src/js/90-boot.js
  printf '</script>\n'
} > "$OUT"
# Comprobación de sintaxis del script combinado
cat src/js/00-core.js src/js/10-ai.js src/js/20-data.js src/js/30-views.js src/js/40-actions.js src/js/90-boot.js > dist/app.check.js
node --check dist/app.check.js
echo "built $OUT ($(wc -c < "$OUT") bytes)"
