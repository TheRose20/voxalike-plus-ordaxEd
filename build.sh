#!/usr/bin/env bash
# Сборка Voxalike+OrdaxEd:
#   dist/voxalike-plus-ordaxed-chrome-vX.zip   — Chrome / Edge / Яндекс / Opera / Brave
#   dist/voxalike-plus-ordaxed-firefox-vX.xpi  — Firefox 128+ (без подписи: временная загрузка / Developer Edition)
#   dist/voxalike-plus-ordaxed.user.js         — Tampermonkey / Violentmonkey (любой браузер)
#   extension-build/                           — распакованная папка для «Загрузить распакованное»
set -euo pipefail
cd "$(dirname "$0")"
VER=$(node -p "require('./extension/manifest.json').version")
command -v zip >/dev/null || { echo 'Не найдена утилита zip: установите её перед сборкой.' >&2; exit 1; }

for f in src/vxp-{bg,fx,room,lobby,lobby-shared,lobby-roles,denoise.src}.js scripts/build-main.js; do node --check "$f"; done
node --check scripts/make-userscript.js
[ -f src/vxp-lobby.css ] || { echo 'Не найден src/vxp-lobby.css.' >&2; exit 1; }

rm -rf dist build && mkdir -p dist build/chrome build/firefox
for d in chrome firefox; do
  cp -rp extension/icons extension/popup.html extension/popup.js build/$d/
  cp README.md build/$d/README.md
  node scripts/build-main.js "build/$d/vxp-main.js"
  node --check "build/$d/vxp-main.js"
  for f in bg fx room lobby lobby-shared lobby-roles; do cp -p "src/vxp-$f.js" "build/$d/vxp-$f.js"; done
  cp -p src/vxp-lobby.css "build/$d/vxp-lobby.css"
  node scripts/embed-models.js "build/$d/vxp-denoise.js"
  node --check "build/$d/vxp-denoise.js"
done
cp -p extension/manifest.json build/chrome/manifest.json
node scripts/make-firefox-manifest.js extension/manifest.json build/firefox/manifest.json

# Юзерскрипт из тех же файлов, что и расширение
node scripts/make-userscript.js build/chrome dist/voxalike-plus-ordaxed.user.js
node --check dist/voxalike-plus-ordaxed.user.js

# Воспроизводимые архивы: фиксированное время и порядок файлов
find build -exec touch -h -t 202601010000 {} +
zip_repro() { (cd "$1" && find . -type f | LC_ALL=C sort | zip -qrX "../../dist/$2" -@); }
zip_repro build/chrome  "voxalike-plus-ordaxed-chrome-v${VER}.zip"
zip_repro build/firefox "voxalike-plus-ordaxed-firefox-v${VER}.xpi"

rm -rf extension-build && cp -rp build/chrome extension-build && rm -rf build
echo "Built v${VER}:"; ls -la dist
