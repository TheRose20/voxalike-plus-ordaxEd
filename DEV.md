# Разработка (форк Voxalike+OrdaxEd)

Структура:
- `src/vxp-main/` — основной модуль, разделённый на смысловые фрагменты; их явный порядок склейки задан в `scripts/build-main.js`
- `src/vxp-bg.js`, `vxp-fx.js`, `vxp-room.js` и `vxp-denoise.src.js` — дополнительные модули
- `src/models/*.wasm` — модели шумоподавления (gtcrn, RNNoise); в `vxp-denoise.js` вставляются как base64 при сборке
- `extension/` — manifest, popup, иконки
- `scripts/build-main.js` — сборка единого `vxp-main.js` из фрагментов
- `scripts/embed-models.js` — подстановка моделей в денойзер

Сборка: `./build.sh` (нужен Node.js и zip). Результат:
- `extension-build/` — для chrome://extensions → «Загрузить распакованное»
- `dist/voxalike-plus-ordaxed-chrome-vX.zip` — Chrome / Edge / Яндекс / Opera / Brave
- `dist/voxalike-plus-ordaxed-firefox-vX.xpi` — Firefox 128+ (манифест генерируется из `extension/manifest.json` скриптом `scripts/make-firefox-manifest.js`)
- `dist/voxalike-plus-ordaxed.user.js` — юзерскрипт (`scripts/make-userscript.js` склеивает модули в порядке `content_scripts`)

При добавлении нового модуля впиши его в `content_scripts[0].js` в `extension/manifest.json` и в цикл копирования в `build.sh` — Firefox-манифест и юзерскрипт подхватят его сами.

Правьте основной код в `src/vxp-main/`, а дополнительные модули — в `src/vxp-*.js`; не редактируйте `extension-build/` и `dist/`, поскольку сборка их пересоздаёт.
