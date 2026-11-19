const { T } = require('./lib.js'); const { build } = require('./signals.js');
let fail = 0; const ok = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) fail++; };
const sr = 44100;
const hash = (a) => { let h = 2166136261; for (let i = 0; i < a.length; i += 7) h = Math.imul(h ^ ((a[i] * 1e6) | 0), 16777619); return h >>> 0; };
const mkm = (base, params) => { const m = { base, sr, t0: 0, outLen: base.length, params: Object.assign({ speed: 1, offset: 0 }, params || {}), segs: null }; T.initSegs(m); return m; };
// 1) исходная запись не меняется ни при каком рендере
{ const x = build(sr, [{ dur: 1, amp: 0.5 }, { dur: 0.5, amp: 0 }, { dur: 1, amp: 0.4 }]); const h0 = hash(x), copy = new Float32Array(x);
  const m = mkm(x, { gain: 3, lowcut: true, comp: { on: true }, deess: { on: true }, eq: [{ on: true, type: 'peak', f: 3000, g: 4, q: 1 }], sat: { on: true }, norm: { on: true }, lim: { on: true }, gate: { on: true }, hum: { on: true }, space: { mix: 30, type: 'room', size: 50 }, pitch: 2, denoise: 40 });
  let e = null; try { T.renderModel(m); } catch (er) { e = er; }
  ok(!e, 'render со всеми эффектами без исключений ' + (e ? e.stack.split('\n').slice(0,3).join(' | ') : ''));
  m.segs = [{ id: 5, a: 0, b: x.length, pos: 0, fx: { gain: 3, rev: true, declick: true, lowcut: true, under: true, radio: true, echo: 30, pitch: 3, space: { type: 'room', mix: 30, size: 50 } } }]; m._sc = null; m._rk = null;
  try { T.renderModel(m); } catch (er) { e = er; }
  ok(!e, 'render с fx куска без исключений ' + (e ? e.stack.split('\n').slice(0,3).join(' | ') : ''));
  ok(hash(x) === h0 && x.every((v, i) => v === copy[i]), 'исходный base не изменился после рендера'); }
// 2) стык кусков встык (разрез посреди речи) не даёт провала
{ const x = build(sr, [{ dur: 2, amp: 0.5 }]); const m = mkm(x); const cut = Math.round(0.9 * sr);
  m.segs = [{ id: 1, a: 0, b: cut, pos: 0 }, { id: 2, a: cut, b: x.length, pos: cut / sr }]; m._sc = null;
  const y = T.assemble(m, 0, x.length); let worst = 0; for (let i = cut - 200; i < cut + 200; i++) worst = Math.max(worst, Math.abs(y[i] - x[i]));
  ok(worst < 1e-6, `стык встык: макс. отклонение ${worst.toExponential(2)}`); }
// 3) стык кусков с разным bal — скачок усиления: считаем размер ступеньки
{ const x = build(sr, [{ dur: 2, amp: 0.5 }]); const m = mkm(x); const cut = Math.round(0.9 * sr);
  m.segs = [{ id: 1, a: 0, b: cut, pos: 0, fx: { bal: 6 } }, { id: 2, a: cut, b: x.length, pos: cut / sr, fx: { bal: -6 } }]; m._sc = null;
  const y = T.assemble(m, 0, x.length); let mn = 1; for (let i = cut - 100; i < cut + 100; i++) mn = Math.min(mn, Math.abs(y[i]));
  let jump = 0; for (let i = cut - 50; i < cut + 50; i++) jump = Math.max(jump, Math.abs(y[i] - y[i - 1]));
  console.log('INFO стык с разным bal: макс. скачок между соседними отсчётами', jump.toFixed(3)); }
// 4) bal применён? сколько даёт segAudio при fx.bal
{ const x = build(sr, [{ dur: 1, amp: 0.3 }]); const m = mkm(x); m.segs[0].fx = { bal: 6 }; const y = T.segAudio(m, m.segs[0]);
  const r = T.rms(y) / T.rms(x); ok(Math.abs(20 * Math.log10(r) - 6) < 0.3, `fx.bal=+6 дБ даёт ${(20 * Math.log10(r)).toFixed(2)} дБ`); }
console.log(fail ? `ИТОГ: провалов ${fail}` : 'ИТОГ: всё прошло'); process.exit(fail ? 1 : 0);
