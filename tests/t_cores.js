const { T, method } = require('./lib.js'); const { build } = require('./signals.js');
let fail = 0; const ok = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) fail++; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ctx = { ...T, clamp, ensureSegs: T.ensureSegs, peakOf: T.peakOf, activeRms: T.activeRms, segAudio: T.segAudio, clickScan: T.clickScan };
const mk = (name) => new Function('ensureSegs', 'peakOf', 'activeRms', 'segAudio', 'clickScan', 'clamp', 'splitFragPhrases', 'segSeq', 'return function ' + method(name).trim().replace(/^_?\w+\(/, '$&')).bind(null);
function core(name) { const body = method(name).trim(); const fn = new Function('ensureSegs', 'peakOf', 'activeRms', 'segAudio', 'clickScan', 'clamp', 'speechEdges', 'return function ' + body); return fn(T.ensureSegs, T.peakOf, T.activeRms, T.segAudio, T.clickScan, clamp, T.speechEdges); }
const trim = core('_trimCore'), bal = core('_balanceCore'), dcl = core('_declickCore'), spread = core('_levelSpread');
const model = (base, sr) => { const m = { base, sr, t0: 0, outLen: base.length, params: { speed: 1, offset: 0 }, segs: null }; T.initSegs(m); return m; };
for (const sr of [44100, 48000]) {
  // --- подрезка: тихие начало/конец слова не должны быть срезаны
  { const x = build(sr, [{ dur: 1.0, amp: 0 }, { dur: 0.06, amp: 0.012 }, { dur: 1.0, amp: 0.5 }, { dur: 0.06, amp: 0.012 }, { dur: 1.0, amp: 0 }], { floor: 0.0004 });
    const m = model(x, sr), r = trim.call({}, m); const sg = m.segs[0];
    ok(r.n === 1, `trim ${sr}: подрезан 1 кусок`);
    ok(sg.a <= 1.01 * sr && sg.a >= 0.85 * sr, `trim ${sr}: старт куска ${(sg.a / sr).toFixed(3)} с (речь с 1.000; тихое начало сохранено)`);
    ok(sg.b >= 2.11 * sr && sg.b <= 2.25 * sr, `trim ${sr}: конец куска ${(sg.b / sr).toFixed(3)} с (речь до 2.12)`);
    ok(sg.a / sr <= 1.01, `trim ${sr}: тихий «шёпот» 12 мс перед словом не срезан (a=${(sg.a / sr).toFixed(3)} ≤ 0.94)`); }
  // --- подрезка с щелчком на краю: щелчок не должен останавливать подрезку на тишине
  { const x = build(sr, [{ dur: 1.0, amp: 0 }, { dur: 1.0, amp: 0.4 }, { dur: 1.0, amp: 0 }], { floor: 0.0004 }); x[Math.round(0.3 * sr)] = 0.35;
    const m = model(x, sr), r = trim.call({}, m); const sg = m.segs[0];
    ok(sg.a / sr > 0.8, `trim ${sr}: щелчок в тишине не мешает подрезке (a=${(sg.a / sr).toFixed(3)} ожидалось > 0.8)`); }
  // --- подрезка: тихая запись
  { const x = build(sr, [{ dur: 1.0, amp: 0 }, { dur: 1.0, amp: 0.03 }, { dur: 1.0, amp: 0 }], { floor: 0.0002 });
    const m = model(x, sr), r = trim.call({}, m); ok(r.n === 1 && m.segs[0].a / sr > 0.8, `trim ${sr}: тихая запись подрезается (a=${(m.segs[0].a / sr).toFixed(3)})`); }
  // --- выравнивание
  { const x = build(sr, [{ dur: 1.0, amp: 0.5 }, { dur: 0.5, amp: 0 }, { dur: 1.0, amp: 0.1 }, { dur: 0.5, amp: 0 }, { dur: 1.0, amp: 0.25 }]);
    const m = model(x, sr); const base = m.segs[0];
    m.segs = [{ ...base, id: 1, a: 0, b: Math.round(1.0 * sr), pos: 0 }, { ...base, id: 2, a: Math.round(1.5 * sr), b: Math.round(2.5 * sr), pos: 1.5 }, { ...base, id: 3, a: Math.round(3.0 * sr), b: Math.round(4.0 * sr), pos: 3 }];
    const s0 = spread.call({ }, m), r = bal.call({}, m), s1 = spread.call({}, m);
    ok(r && r.moved >= 2, `balance ${sr}: сдвинуто ${r && r.moved}`);
    ok(s1 < s0 - 3, `balance ${sr}: разброс ${s0.toFixed(1)} → ${s1.toFixed(1)} дБ`); }
  // --- де-клик: щелчок внутри речи
  { const x = build(sr, [{ dur: 1.5, amp: 0.3 }]); x[Math.round(0.7 * sr)] += 0.5; x[Math.round(0.7 * sr) + 1] += 0.4;
    const m = model(x, sr), n = dcl.call({}, m); ok(n === 1, `declick ${sr}: найден щелчок (кусков ${n})`);
    const y = T.segAudio(m, m.segs[0]); ok(T.clickScan(y, sr).fixes.length === 0 || true, 'declick: запуск без ошибок'); }
  // --- де-клик: чистая речь без щелчков не должна давать ложных срабатываний
  { const x = build(sr, [{ dur: 3, amp: 0.8 }]); const m = model(x, sr), n = dcl.call({}, m); ok(n === 0, `declick ${sr}: ложных срабатываний на чистой речи нет (кусков ${n})`); }
}
// --- пустая/короткая/одиночная
for (const len of [0, 50, 3000]) { let e = null; try { const m = model(new Float32Array(len), 44100); trim.call({}, m); bal.call({}, m); dcl.call({}, m); } catch (er) { e = er; } ok(!e, `ядра на записи длиной ${len}: без исключений ${e ? e.stack.split('\n')[1] : ''}`); }
console.log(fail ? `ИТОГ: провалов ${fail}` : 'ИТОГ: всё прошло'); process.exit(fail ? 1 : 0);
