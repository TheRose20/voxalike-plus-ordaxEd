  /* ================================================================== */
  /*  Умная автоподгонка («Авто»): общий сдвиг + раздельная подгонка фраз */
  /*  Работает в общем scope (см. scripts/build-main.js): использует     */
  /*  envelope, alignOffset, ensureSegs, segDur, segSeq из audio-dsp.js. */
  /* ================================================================== */

  /** Огибающая громкости (корень из RMS, кадры по 10 мс) — меньше зависит от общей громкости, чем линейная. */
  const saEnv = (x, sr) => { const e = envelope(x, sr, 10); for (let i = 0; i < e.length; i++) e[i] = Math.sqrt(e[i]); return e; };

  /** Корреляция Пирсона между a[0..n) и b[bo..bo+n). */
  function saPearson(a, b, bo, n) {
    let ma = 0, mb = 0;
    for (let i = 0; i < n; i++) { ma += a[i]; mb += b[bo + i]; }
    ma /= n; mb /= n;
    let sab = 0, saa = 0, sbb = 0;
    for (let i = 0; i < n; i++) { const da = a[i] - ma, db = b[bo + i] - mb; sab += da * db; saa += da * da; sbb += db * db; }
    return saa > 1e-12 && sbb > 1e-12 ? sab / Math.sqrt(saa * sbb) : 0;
  }

  /** Если дубль ещё не резали — режет его по паузам (≥0.3 с тишины внутри), чтобы фразы подгонялись по отдельности. Возвращает число разрезов. */
  function saSplitOnPauses(m) {
    if (m.segs.length !== 1 || (m.params.speed || 1) !== 1) return 0;
    const sg = m.segs[0], x = m.base, sr = m.sr, fl = Math.max(1, Math.round(sr * 0.02));
    const n = Math.floor((sg.b - sg.a) / fl); if (n < 20) return 0;
    const r = new Float32Array(n); let pk = 0;
    for (let i = 0; i < n; i++) { let s = 0; for (let j = sg.a + i * fl, k = j + fl; j < k; j++) s += x[j] * x[j]; r[i] = Math.sqrt(s / fl); if (r[i] > pk) pk = r[i]; }
    const thr = Math.max(pk * 0.04, 0.002), minRun = 15, minPiece = 8;
    const cuts = []; let i = 0, lastCut = 0;
    while (i < n && r[i] < thr) i++;            // тишина в начале — не пауза между фразами
    while (i < n && cuts.length < 12) {
      if (r[i] >= thr) { i++; continue; }
      let j = i; while (j < n && r[j] < thr) j++;
      if (j < n && j - i >= minRun) {
        const mid = Math.round((i + j) / 2);
        if (mid - lastCut >= minPiece && n - mid >= minPiece) { cuts.push(mid); lastCut = mid; }
      }
      i = j;
    }
    if (!cuts.length) return 0;
    const pts = [0, ...cuts, n], segs = [];
    for (let k = 0; k < pts.length - 1; k++) {
      const a = sg.a + pts[k] * fl, b = k === pts.length - 2 ? sg.b : sg.a + pts[k + 1] * fl;
      const piece = { id: k === 0 ? sg.id : segSeq++, a, b, pos: sg.pos + (a - sg.a) / sr };
      if (sg.fx) piece.fx = sg.fx;
      segs.push(piece);
    }
    m.segs = segs;
    return cuts.length;
  }

  /** Подгонка каждого куска отдельно (±0.6 с от общего положения). Двигает только при заметном улучшении. Возвращает число сдвинутых. */
  function saAlignPieces(m, ref) {
    if (m.segs.length < 2 || (m.params.speed || 1) !== 1) return 0;
    const sr = m.sr, off = m.params.offset / 1000, W = 60, rE = saEnv(ref.samples, ref.sr);
    const rEnv = new Float32Array(rE.length + 2 * W); rEnv.set(rE, W);   // за краями оригинала — тишина
    let moved = 0, prevEnd = -Infinity, prev = null;
    for (const sg of [...m.segs].sort((p, q) => p.pos - q.pos)) {
      const dur = (sg.b - sg.a) / sr, a = saEnv(m.base.subarray(sg.a, sg.b), sr), n = a.length, e0 = Math.round((sg.pos + off) * 100);
      if (n >= 20) {
        let best = null, bestS = -2, s0 = null;
        for (let L = -W; L <= W; L++) {
          const bo = e0 + L + W; if (bo < 0 || bo + n > rEnv.length) continue;
          const s = saPearson(a, rEnv, bo, n);
          if (L === 0) s0 = s;
          if (s > bestS) { bestS = s; best = L; }
        }
        if (best != null && best !== 0 && bestS > 0.25 && bestS - (s0 == null ? 0 : s0) > 0.05) { sg.pos += best * 0.01; moved++; }
      }
      if (sg.pos < prevEnd && prev) {                // наезд: подрезаем хвост (обычно тишину) предыдущего куска
        const ov = prevEnd - sg.pos, pd = (prev.b - prev.a) / sr;
        if (pd - ov >= 0.1) prev.b -= Math.round(ov * sr); else sg.pos = prevEnd;
      }
      prev = sg; prevEnd = sg.pos + (sg.b - sg.a) / sr;
    }
    return moved;
  }

  /** «Авто»: [резка по паузам] → общий сдвиг → подгонка фраз. Меняет модель на месте. */
  function smartAlign(m, ref) {
    ensureSegs(m);
    const splits = saSplitOnPauses(m);
    m.params.offset = clamp(Math.round(alignOffset(m, ref)), -9000, 9000);
    const moved = saAlignPieces(m, ref);
    return { offset: m.params.offset, splits, moved, pieces: m.segs.length };
  }
