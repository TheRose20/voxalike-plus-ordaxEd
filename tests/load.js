// Загружает НАСТОЯЩИЙ код vxp-main.js (строки до экспорта VXP.dsp) в песочницу и отдаёт внутренние функции.
const fs = require('fs'), vm = require('vm');
module.exports = function load(file) {
  const src = fs.readFileSync(file || require('path').join(__dirname, '..', 'extension-build', 'vxp-main.js'), 'utf8').split('\n');
  const end = src.findIndex((l) => l.includes('VXP.analyzeVoice = analyzeVoice'));
  let code = src.slice(0, end).join('\n');
  const a0 = src.findIndex((l) => l.startsWith('  function activeRms')); let a1 = a0; while (src[a1] !== '  }') a1++;
  code += '\n' + src.slice(a0, a1 + 1).join('\n');
  code += `\nVXP._t = { clickScan, declick, scanTake, findPauses, speechEdges, splitFragPhrases, activeRms, activeSpan, assemble, segAudio, renderModel, initSegs, ensureSegs, fragSegsOf, peakOf, rms, loudnessLufs, masterToLufs, carveSegs, segFxActive, envelope, get segSeq(){return segSeq;}, set segSeq(v){segSeq=v;} };\n})();`;
  const store = {};
  const stub = new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => '' : k === 'length' ? 0 : stub), apply: () => stub, construct: () => stub, set: () => true });
  const win = { addEventListener() {}, location: { href: 'https://voxalike.com/', hostname: 'voxalike.com' }, localStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem() {} }, matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }), navigator: { userAgent: 'chrome', language: 'ru' }, chrome: undefined, postMessage() {} };
  win.window = win;
  const doc = new Proxy({}, { get: (t, k) => (k === 'readyState' ? 'loading' : k === 'documentElement' || k === 'head' || k === 'body' ? stub : () => stub) });
  const ctx = vm.createContext({ window: win, document: doc, navigator: win.navigator, localStorage: win.localStorage, console, setTimeout, clearTimeout, setInterval, clearInterval, requestAnimationFrame: () => 0, cancelAnimationFrame() {}, performance, EventTarget, Float32Array, Float64Array, Math, JSON, Map, Set, WeakMap, Promise, Uint8Array, Int16Array, Uint32Array, Array, Object, Date, Symbol, Error, URL, TextEncoder, TextDecoder, AudioContext: undefined, indexedDB: undefined, chrome: undefined, MutationObserver: class { observe() {} disconnect() {} }, CustomEvent: class {}, Event: class {}, location: win.location, getComputedStyle: () => ({}), Worker: undefined, Blob: class {}, fetch: undefined });
  vm.runInContext(code, ctx, { filename: 'vxp-main.js' });
  return win.__VXP__._t;
};
