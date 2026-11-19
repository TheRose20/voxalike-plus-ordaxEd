const { T, method } = require('./lib.js'); const { build } = require('./signals.js');
let fail = 0; const ok = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) fail++; };
for (const sr of [44100, 48000]) {
  for (const [name, amp, floor] of [['обычная', 0.5, 0.0005], ['тихая (пик~0.04)', 0.06, 0.0003], ['шумная', 0.5, 0.012], ['очень тихая (пик~0.015)', 0.02, 0.0002]]) {
    const x = build(sr, [{ dur: 0.3, amp: 0 }, { dur: 1.0, amp }, { dur: 0.6, amp: 0 }, { dur: 1.2, amp }, { dur: 0.6, amp: 0 }, { dur: 0.9, amp }, { dur: 0.3, amp: 0 }]);
    const cuts = T.findPauses(x, 0, x.length, sr, 0.35);
    ok(cuts.length === 2, `split ${sr} ${name}: найдено разрезов ${cuts.length} (ждём 2) пик=${T.peakOf(x).toFixed(3)}`);
    if (cuts.length === 2) {
      const t = cuts.map((c) => c / sr);
      ok(Math.abs(t[0] - 1.6) < 0.15 && Math.abs(t[1] - 3.4) < 0.15, `   позиции ${t.map((v) => v.toFixed(2))} (ждём ~1.6 и ~3.4, в паузах)`);
    }
  }
}
// короткие/пустые
for (const n of [0, 1, 10, 100, 4000, 8000]) { let e = null; try { T.findPauses(new Float32Array(n), 0, n, 44100, 0.35); T.scanTake(new Float32Array(n), 44100); T.clickScan(new Float32Array(n), 44100); } catch (er) { e = er; } ok(!e, `edge длина ${n}: без исключений ${e ? e.message : ''}`); }
// тишина целиком
ok(T.findPauses(new Float32Array(44100 * 3), 0, 44100 * 3, 44100, 0.35).length === 0, 'тишина: разрезов нет');
// шумовой пол без речи
{ const x = build(44100, [{ dur: 3, amp: 0 }], { floor: 0.02 }); ok(T.findPauses(x, 0, x.length, 44100, 0.35).length === 0, 'только шум: разрезов нет'); }
// пауза внутри фразы 0.2 с — не резать
{ const x = build(44100, [{ dur: 1, amp: 0.5 }, { dur: 0.2, amp: 0 }, { dur: 1, amp: 0.5 }]); ok(T.findPauses(x, 0, x.length, 44100, 0.35).length === 0, 'пауза 0.2 с не режется'); }
console.log(fail ? `ИТОГ: провалов ${fail}` : 'ИТОГ: всё прошло'); process.exit(fail ? 1 : 0);
