#!/usr/bin/env node
// Собирает юзерскрипт (Tampermonkey / Violentmonkey) из тех же файлов, что и расширение:
// берёт список и порядок скриптов из content_scripts манифеста и склеивает их в один.
// Код внедряется тегом <script>, поэтому всегда выполняется в контексте страницы.
// Использование: node scripts/make-userscript.js <папка-сборки-chrome> <выход.user.js>
const fs = require('fs'), path = require('path');
const [dir, out] = process.argv.slice(2);
if (!dir || !out) { console.error('Укажите папку сборки и выходной файл'); process.exit(1); }
const m = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
const files = m.content_scripts[0].js;
const cssFiles = m.content_scripts[0].css || [];
const css = cssFiles.map((f) => fs.readFileSync(path.join(dir, f), 'utf8').replace(/\s+$/, '')).join('\n');
const code = files.map((f) => fs.readFileSync(path.join(dir, f), 'utf8').replace(/\s+$/, '')).join('\n;\n') + '\n';
const head = `// ==UserScript==
// @name         ESPERION
// @namespace    esperion-voxalike
// @version      ${m.version}
// @description  ESPERION для voxalike.com: запись по фрагментам, FX, пресеты, Мастер реплики, проверка записи, шумодав, эквалайзер, LUFS
// @description:en  ESPERION for voxalike.com: fragment recording, FX, presets, line master, take check, neural denoise, EQ, LUFS
// @match        https://voxalike.com/*
// @match        https://www.voxalike.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==
`;
const body = `(function () {
  var css = ${JSON.stringify(css)};
  if (css) {
    var style = document.createElement("style");
    style.id = "vxp-extra-style";
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
  }
  var code = ${JSON.stringify(code)};
  var s = document.createElement("script");
  s.textContent = code;
  (document.head || document.documentElement).appendChild(s);
  s.remove();
})();
`;
fs.writeFileSync(out, head + body);
