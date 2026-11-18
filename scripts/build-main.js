#!/usr/bin/env node
// Собирает единый vxp-main.js из упорядоченных исходных фрагментов.
// Использование: node scripts/build-main.js <выходной-файл>
const fs = require('fs'), path = require('path');

const root = path.join(__dirname, '..');
const out = process.argv[2];
if (!out) {
  console.error('Укажите выходной файл');
  process.exit(1);
}

const sourceDir = path.join(root, 'src', 'vxp-main');
// Фрагменты не являются ES-модулями: после склейки они работают в одном scope.
// Поэтому порядок здесь — часть контракта между ними.
const files = [
  'bootstrap.js',
  'brand-logo.js',
  'audio-dsp.js',
  'smart-align.js',
  'game-audio.js',
  'track-editor.js',
  'ui-controls.js',
  'recording-queue.js',
  'main-panel.js',
  'fx-studio.js',
  'recording-studio.js',
  'player-stats-api.js',
];
const missing = files.filter((name) => !fs.existsSync(path.join(sourceDir, name)));
if (missing.length) {
  console.error('Не найдены фрагменты src/vxp-main/: ' + missing.join(', '));
  process.exit(1);
}

const code = files
  .map((name) => fs.readFileSync(path.join(sourceDir, name), 'utf8').replace(/\s+$/, ''))
  .join('\n\n') + '\n';
fs.writeFileSync(out, code);
