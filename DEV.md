# Разработка (форк Voxalike+OrdaxEd)

Структура:
- `src/vxp-brand-logo.png` — исходник логотипа (встроен в `src/vxp-main/brand-logo.js`)
- `src/vxp-main/` — основной модуль, разделённый на смысловые фрагменты; их явный порядок склейки задан в `scripts/build-main.js`
- `src/vxp-lobby.js`, `vxp-lobby.css` — расширение лобби; `vxp-lobby-sandbox.html` — полностью локальный макет выбора мода для правки CSS без подключения к Voxalike
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


Для правки сетки выбора мода откройте `src/vxp-lobby-sandbox.html` в браузере. Макет подключает рядом лежащий `vxp-lobby.css`, не выполняет JavaScript и не обращается к Voxalike; после изменения CSS достаточно обновить страницу.
