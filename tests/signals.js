// синтетика: «слог» = гармоники 120 Гц + формантный наклон, огибающая с атакой/спадом
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1; }
function build(sr, parts, { floor = 0.0005, seed = 1 } = {}) {
  // parts: [{dur, amp}] amp=0 -> пауза (шум)
  const total = parts.reduce((s, p) => s + p.dur, 0), n = Math.round(total * sr), x = new Float32Array(n), r = rng(seed);
  let i0 = 0;
  for (const p of parts) {
    const L = Math.round(p.dur * sr);
    for (let i = 0; i < L; i++) {
      const t = i / sr; let v = floor * r();
      if (p.amp) {
        const syl = 0.5 + 0.5 * Math.sin(2 * Math.PI * 4 * t - 1.2), att = Math.min(1, i / (0.02 * sr), (L - i) / (0.03 * sr));
        let h = 0; for (let k = 1; k <= 8; k++) h += Math.sin(2 * Math.PI * 120 * k * t) / k;
        v += p.amp * (0.25 + 0.75 * syl) * att * h * 0.6;
      }
      x[i0 + i] = v;
    }
    i0 += L;
  }
  return x;
}
module.exports = { build, rng };
