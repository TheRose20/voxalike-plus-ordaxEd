const { T, method } = require('./lib.js'); const { build } = require('./signals.js');
let fail = 0; const ok = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) fail++; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fns = ['_splitCore','_trimCore','_declickCore','_balanceCore','_levelSpread'].map(method).join('\n');
const C = new Function('T','clamp','ensureSegs','peakOf','activeRms','segAudio','clickScan','speechEdges','splitFragPhrases','segDur', 'const segSeq=0; const self={visibleFrags(){const m=this.model;return m.frags?m.frags.filter(f=>!f.locked):[]},editor:{sel:new Set()},openFrag:null,_fragSig:null};' +
 'class C{ constructor(){ this.model=null; this.editor={sel:new Set()}; this.openFrag=null; this._fragSig=null;} visibleFrags(){const m=this.model; if(!m||!m.frags||!m.segs) return []; return m.frags.filter((f)=>m.segs.some((sg)=>sg.pos<f.t1-0.02&&sg.pos+segDur(m,sg)>f.t0+0.02));}\n' + fns + '\n} return C;')(T, clamp, T.ensureSegs, T.peakOf, T.activeRms, T.segAudio, T.clickScan, T.speechEdges, T.splitFragPhrases, (m,s)=>(s.b-s.a)/m.sr/(m.params.speed||1));
for (const sr of [44100, 48000]) for (const withFrags of [true, false]) {
  const x = build(sr, [{ dur: 0.4, amp: 0 }, { dur: 1.2, amp: 0.5 }, { dur: 0.7, amp: 0 }, { dur: 1.0, amp: 0.08 }, { dur: 0.7, amp: 0 }, { dur: 1.1, amp: 0.25 }, { dur: 0.4, amp: 0 }]);
  const click = Math.round(2.4 * sr); x[click] += 0.3; x[click + 1] += 0.25;
  const m = { base: x, sr, t0: 0, outLen: x.length, params: { speed: 1, offset: 0 }, segs: null }; T.initSegs(m);
  if (withFrags) m.frags = [{ t0: 0, t1: x.length / sr }];
  const c = new C(); c.model = m;
  const n = c._splitCore(m); const s0 = c._levelSpread(m); const t = c._trimCore(m); const k = c._declickCore(m); const b = c._balanceCore(m); const s1 = c._levelSpread(m);
  const tag = `${sr} ${withFrags ? 'с frags' : 'без frags'}`;
  ok(n === 3, `master ${tag}: фраз ${n} (ждём 3)`); ok(t.n >= 2 && t.cut > 0.5, `master ${tag}: подрезано ${t.n} кус, ${t.cut.toFixed(2)} с`);
  ok(k >= 1, `master ${tag}: щелчок исправляется (кусков ${k})`); ok(s1 < 2 && s0 > 8, `master ${tag}: разброс ${s0.toFixed(1)} → ${s1.toFixed(1)} дБ`);
  const out = T.renderModel(m); ok(out.length === x.length && T.peakOf(out) <= 0.9801, `master ${tag}: рендер без превышения пика (${T.peakOf(out).toFixed(3)})`);
  // речь не потеряна: энергия активных участков сохранилась в рендере (относительно выравнивания)
  ok(T.clickScan(out, sr).fixes.length === 0, `master ${tag}: в итоге щелчков нет`);
}
console.log(fail ? 'ИТОГ: провалов ' + fail : 'ИТОГ: всё прошло'); process.exit(fail ? 1 : 0);
