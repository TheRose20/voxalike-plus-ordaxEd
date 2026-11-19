# Разработка ESPERION

Основа — форк Voxalike+OrdaxEd (ветка `dev`), поверх которого ESPERION 3.0 добавляет Мастер реплики, проверку записи, FX-движок, редизайн и экспорт LUFS. Этот репозиторий пересобран из готового расширения `esperion-chrome-v3.0.1.zip`: сборка воспроизводит его файл в файл (`vxp-main.js` — с точностью до пустой строки на стыке двух фрагментов).

## Структура

- `src/vxp-main/` — фрагменты основного модуля. Это не ES-модули: `scripts/build-main.js` склеивает их в один `vxp-main.js` в порядке из списка `files`, дальше они работают в общем scope. Порядок — часть контракта.
  - `bootstrap.js` — глобальный VXP, настройки, темы, шина событий
  - `audio-dsp.js` — DSP, рендер дорожек, EQ, динамика, классический шумодав, анализ записи
  - `game-audio.js` — перехват микрофона, Web Audio, захват, проигрыватель
  - `track-editor.js` — модель кусков и редактор дорожек (Undo/Redo)
  - `ui-controls.js` — стили (CSS внутри JS), элементы управления, тосты
  - `recording-queue.js` — запись, очередь в IndexedDB, автоотправка
  - `main-panel.js` — панель на странице игры
  - `fx-studio.js` — окно FX: EQ, компрессор, лимитер
  - `recording-studio.js` — студия, запись реплик заранее, Мастер реплики
  - `player-stats-api.js` — горячие клавиши сцены, публичный API модуля
- `src/vxp-bg.js`, `vxp-fx.js`, `vxp-room.js` — остальные скрипты страницы
- `src/vxp-denoise.src.js` + `src/models/*.wasm` — шумодав; при сборке `@@MODEL:имя@@` заменяется на base64 модели (`scripts/embed-models.js`)
- `extension/` — manifest, popup (html/css/js), иконки
- `tests/` — тесты алгоритмов на настоящем коде (см. ниже)

## Сборка и проверка

```
./build.sh        # нужен Node.js и zip
tests/run.sh      # после сборки
```

Результат: `extension-build/` (для «Загрузить распакованное»), `dist/esperion-chrome-vX.zip`, `dist/esperion-firefox-vX.xpi`, `dist/esperion.user.js`.

Правь код в `src/` и `extension/`, не в `extension-build/` — её пересоздаёт сборка. Новый скрипт страницы впиши в `content_scripts[0].js` в `extension/manifest.json` и в цикл копирования в `build.sh`.

## Тесты

`tests/` загружает `extension-build/vxp-main.js` в песочницу Node (без браузера) и проверяет на синтетической речи: разбивку на фразы, подрезку тишины, удаление щелчков, выравнивание громкости, неизменность исходной записи, стыки кусков, Undo/Redo и конвейер Мастера целиком. DOM, микрофон и интерфейс эти тесты не покрывают — их нужно проверять вручную на voxalike.com.

## Что осталось от `dev` и не подключено

В `src/` лежат модули лобби (`vxp-lobby*.js`, `vxp-lobby.css`, `vxp-lobby-sandbox.html`, если есть) из ветки `dev`. В ESPERION 3.0 их не было, под новый дизайн они не адаптированы, поэтому в манифест и `build.sh` они не входят. Файл `ui-controls.css` из `dev` удалён: в ESPERION стили живут внутри `ui-controls.js`. Старый журнал изменений OrdaxEd — в `CHANGELOG-ordaxed-1.x.md`.
