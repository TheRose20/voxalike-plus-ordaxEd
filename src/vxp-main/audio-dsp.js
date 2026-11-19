  /* ================================================================== */
  /*  DSP                                                                */
  /* ================================================================== */
  function encodeWav(samples, sr) {
    const n = samples.length, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
    const s = (o, t) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
    s(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); s(8, 'WAVE'); s(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    s(36, 'data'); v.setUint32(40, n * 2, true);
    let o = 44;
    for (let i = 0; i < n; i++) { const x = clamp(samples[i], -1, 1); v.setInt16(o, x < 0 ? x * 32768 : x * 32767, true); o += 2; }
    return new Blob([buf], { type: 'audio/wav' });
  }
  /** Чтение с шагом step (step>1 — быстрее/выше). */
  function resampleStep(x, step, outLen) {
    const n = outLen ?? Math.max(1, Math.floor(x.length / step)), out = new Float32Array(n), last = x.length - 1;
    for (let i = 0; i < n; i++) {
      const p = i * step, a = Math.floor(p);
      if (a >= last) { out[i] = a === last ? x[last] : 0; continue; }
      const f = p - a; out[i] = x[a] * (1 - f) + x[a + 1] * f;
    }
    return out;
  }
  const resample = (x, from, to) => (from === to ? x : resampleStep(x, from / to, Math.max(1, Math.round((x.length * to) / from))));
  function prepareUpload(samples, sr) {
    const maxSamples = Math.floor((2.5e6 - 44) / 2), dur = samples.length / sr;
    let rate = Math.min(sr, 32000);
    if (dur * rate > maxSamples) rate = Math.floor(maxSamples / dur);
    rate = [32000, 24000, 22050, 16000, 12000, 11025, 8000].find((r) => r <= rate) || Math.max(1, rate);
    return { samples: resample(samples, sr, rate), sampleRate: rate };
  }
  /** Сдвиг: положительный — позже. Результат длины outLen. */
  function shiftSamples(src, sr, offsetMs, outLen) {
    const out = new Float32Array(outLen ?? src.length);
    const shift = Math.round((offsetMs / 1000) * sr);
    for (let i = Math.max(0, shift), j = i - shift; i < out.length && j < src.length; i++, j++) out[i] = src[j];
    return out;
  }
  function envelope(samples, sr, frameMs = 10) {
    const fl = Math.max(1, Math.round((sr * frameMs) / 1000)), n = Math.floor(samples.length / fl), e = new Float32Array(n);
    for (let i = 0; i < n; i++) { let s = 0; for (let j = i * fl, k = j + fl; j < k; j++) s += samples[j] * samples[j]; e[i] = Math.sqrt(s / fl); }
    return e;
  }
  function zNorm(x) {
    let m = 0; for (const v of x) m += v; m /= x.length || 1;
    let sd = 0; for (let i = 0; i < x.length; i++) { x[i] -= m; sd += x[i] * x[i]; }
    sd = Math.sqrt(sd) || 1; for (let i = 0; i < x.length; i++) x[i] /= sd;
    return x;
  }
  /** Лаг L (в кадрах), при котором a[i] ≈ b[i+L]. */
  function bestLag(a, b, minLag, maxLag) {
    let best = 0, bestS = -Infinity;
    for (let L = minLag; L <= maxLag; L++) {
      let s = 0;
      const i0 = Math.max(0, -L), i1 = Math.min(a.length, b.length - L);
      for (let i = i0; i < i1; i++) s += a[i] * b[i + L];
      if (s > bestS) { bestS = s; best = L; }
    }
    return best;
  }
  /** На сколько мс сдвинуть take (начинающийся в takeT0 сек), чтобы совпасть с ref (с 0). */
  function autoAlign(ref, refSr, take, takeSr, takeT0 = 0) {
    const a = zNorm(envelope(ref, refSr)), b = zNorm(envelope(take, takeSr));
    const L = bestLag(a, b, -Math.round(1.2 * 100), b.length - 1); // a[i] ≈ b[i+L]: take-кадр j=i+L на месте i
    // позиция take: кадр j совпадает с ref-кадром j-L → take начинается в −L*10 мс
    return -L * 10 - takeT0 * 1000;
  }
  /** Найти, где short лежит внутри long (в сэмплах long). expectSec — ожидаемое место (ограничивает поиск). */
  function locate(short, long, sr, expectSec = null, radiusSec = 0.4) {
    const a = zNorm(envelope(short, sr, 10)), b = zNorm(envelope(long, sr, 10));
    let lo = -50, hi = Math.max(-50, b.length - a.length + 50);
    if (expectSec != null && isFinite(expectSec)) {
      const e = Math.round(expectSec * 100), r = Math.round(radiusSec * 100);
      lo = Math.max(lo, e - r); hi = Math.min(hi, e + r);
      if (lo > hi) { lo = -50; hi = Math.max(-50, b.length - a.length + 50); }
    }
    const L10 = bestLag(a, b, lo, hi);
    const a1 = zNorm(envelope(short, sr, 1)), b1 = zNorm(envelope(long, sr, 1));
    const L1 = bestLag(a1, b1, L10 * 10 - 12, L10 * 10 + 12);
    return Math.round((L1 * sr) / 1000);
  }
  function rms(x, a = 0, b = x.length) { let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i]; return Math.sqrt(s / Math.max(1, b - a)); }
  function peakOf(x) { let p = 0; for (const v of x) { const a = v < 0 ? -v : v; if (a > p) p = a; } return p; }
  /* ===== 2.5: измерение громкости (по ITU-R BS.1770, моно) и мастеринг при экспорте ===== */
  /** Интегральная громкость в LUFS (K-взвешивание, окна 400 мс с шагом 100 мс, гейты −70 LUFS и −10 LU). −Infinity для тишины. */
  function loudnessLufs(x, sr) {
    if (!x || !x.length) return -Infinity;
    const k1 = biquadCoefs('highshelf', 1681.97, 4.0, 0.7072, sr), k2 = biquadCoefs('hp', 38.135, 0, 0.5003, sr);
    const y = biquadRun(biquadRun(x, k1), k2);
    const win = Math.max(1, Math.round(0.4 * sr)), step = Math.max(1, Math.round(0.1 * sr));
    const pw = new Float64Array(y.length + 1);
    for (let i = 0; i < y.length; i++) pw[i + 1] = pw[i] + y[i] * y[i];
    const blocks = [];
    if (y.length < win) blocks.push(pw[y.length] / Math.max(1, y.length));
    else for (let a = 0; a + win <= y.length; a += step) blocks.push((pw[a + win] - pw[a]) / win);
    const toL = (z) => -0.691 + 10 * Math.log10(Math.max(1e-12, z));
    const abs = blocks.filter((z) => toL(z) > -70);
    if (!abs.length) return -Infinity;
    const rel = toL(abs.reduce((q, z) => q + z, 0) / abs.length) - 10;
    const g = abs.filter((z) => toL(z) > rel);
    if (!g.length) return -Infinity;
    return toL(g.reduce((q, z) => q + z, 0) / g.length);
  }
  /** Подгоняет громкость к target LUFS, не поднимая пик выше ceilDb. Возвращает { out, lufs, gainDb, limited } (out — новая копия или тот же массив при gainDb = 0). */
  function masterToLufs(x, sr, target, ceilDb = -1) {
    const lufs = loudnessLufs(x, sr);
    if (!isFinite(lufs) || !target) return { out: x, lufs, gainDb: 0, limited: false, peakDb: 20 * Math.log10(Math.max(1e-9, peakOf(x))) };
    const pk = Math.max(1e-9, peakOf(x));
    let gainDb = target - lufs, limited = false;
    const maxDb = ceilDb - 20 * Math.log10(pk);
    if (gainDb > maxDb) { gainDb = maxDb; limited = true; }
    const gl = dbToLin(gainDb), out = new Float32Array(x.length);
    for (let i = 0; i < x.length; i++) out[i] = x[i] * gl;
    return { out, lufs, gainDb, limited, peakDb: 20 * Math.log10(pk) + gainDb };
  }
  /* ===== 2.7: проверка записи — ищет клиппинг, щелчки, провалы звука и «прыжки» громкости между фразами ===== */
  /** 2.7: убирает короткие щелчки (выброс до ~2 мс с возвратом к сигналу) линейной вставкой. Остальное не трогает. */
  function clickScan(x, sr) {
    // 2.9: единый детектор для де-клика и проверки записи. fixes — выбросы до ~2 мс с возвратом к сигналу (их можно убрать),
    // steps — резкие скачки без возврата («ступеньки»): это не щелчки, автоматически не чинятся.
    const n = x.length, fixes = [], steps = [];
    if (n < 64) return { fixes, steps };
    const pk = peakOf(x), dTh = Math.max(0.03, 0.2 * pk), w = Math.max(8, Math.round(0.0013 * sr)), maxLen = Math.max(4, Math.round(0.002 * sr));
    const d = new Float32Array(n), ps = new Float64Array(n + 1);
    for (let i = 1; i < n; i++) d[i] = Math.abs(x[i] - x[i - 1]);
    for (let i = 0; i < n; i++) ps[i + 1] = ps[i] + d[i];
    for (let i = w; i < n - w; i++) {
      if (d[i] < dTh) continue;
      const lm = (ps[i + w + 1] - ps[i - w] - d[i]) / (2 * w);
      if (d[i] <= 12 * lm) continue;
      let k = -1; const back = Math.max(dTh * 0.5, d[i] * 0.4);
      for (let q = i + 1; q <= i + maxLen && q < n; q++) if (d[q] >= back && (x[q] - x[q - 1]) * (x[i] - x[i - 1]) < 0) { k = q; break; }
      if (k < 0) { steps.push(i); continue; }
      fixes.push({ a: i - 1, b: k }); i = k;
    }
    return { fixes, steps };
  }
  function declick(x, sr) {
    const y = new Float32Array(x);
    for (const f of clickScan(x, sr).fixes) { const ya = x[f.a], yb = x[f.b]; for (let q = f.a + 1; q < f.b; q++) y[q] = ya + ((yb - ya) * (q - f.a)) / (f.b - f.a); }
    return y;
  }
  function scanTake(x, sr) {
    const out = [];
    if (!x || x.length < sr * 0.2) return out;
    const add = (kind, t, dur, text) => out.push({ kind, t, dur, text });
    const merge = (arr, gapS) => { const r = []; for (const e of arr) { const l = r[r.length - 1]; if (l && e.a - l.b < gapS * sr) { l.b = e.b; l.n += e.n; if (e.v > l.v) l.v = e.v; if (e.rep) l.rep = true; } else r.push({ ...e }); } return r; };
    // 1) клиппинг: плоские «полки» на самом пике (≥4 одинаковых отсчёта); рендер нормирует пик до 0,98, поэтому порог относительный
    const pk = peakOf(x);
    if (pk >= 0.9) { const th = pk * 0.998, runs = []; let i = 1;
      while (i < x.length) { if (Math.abs(x[i]) >= th && Math.abs(x[i] - x[i - 1]) <= 0.0003) { let j = i; while (j < x.length && Math.abs(x[j]) >= th && Math.abs(x[j] - x[j - 1]) <= 0.0003) j++; if (j - i >= 3) runs.push({ a: i - 1, b: j, n: j - i, v: 0 }); i = j; } else i++; }
      for (const r of merge(runs, 0.05)) add('clip', r.a / sr, (r.b - r.a) / sr, tr('Перегруз (клиппинг): уменьшите громкость куска или перепишите потише', 'Clipping: lower the piece gain or re-record quieter'));
    }
    // 2) щелчки (с возвратом, их можно убрать) и «ступеньки» (скачок без возврата: послушать, автоматически не чинится)
    { const cs = clickScan(x, sr), hits = [];
      cs.fixes.forEach((f) => hits.push({ a: f.a, b: f.a + 1, n: 1, v: 1, rep: true }));
      cs.steps.forEach((i) => hits.push({ a: i, b: i + 1, n: 1, v: 0, rep: false }));
      hits.sort((p, q) => p.a - q.a);
      for (const r of merge(hits, 0.03)) if (!out.some((o) => o.kind === 'clip' && r.a / sr >= o.t - 0.05 && r.a / sr <= o.t + o.dur + 0.05))
        add(r.rep ? 'click' : 'step', r.a / sr, 0.01, r.rep ? tr('Щелчок или треск: «Убрать щелчки» исправит его, или перепишите фрагмент', 'Click or pop: “Remove clicks” can fix it, or re-record the fragment') : tr('Резкий скачок уровня без возврата (не щелчок, автоматически не убирается): послушайте это место', 'Abrupt level step (not a click, cannot be removed automatically): listen here'));
    }
    // кадры по 20 мс для уровней
    const F = Math.max(1, Math.round(0.02 * sr)), nf = Math.floor(x.length / F), fdb = new Float32Array(nf);
    for (let k = 0; k < nf; k++) { let q = 0; for (let i = k * F; i < (k + 1) * F; i++) q += x[i] * x[i]; fdb[k] = 10 * Math.log10(Math.max(1e-12, q / F)); }
    if (nf < 5) return out.sort((a, b) => a.t - b.t);
    const srt = Array.from(fdb).sort((a, b) => a - b), floor = srt[Math.floor(nf * 0.1)], thr = Math.max(-55, floor + 12);
    // 3) провалы: цифровая тишина ≥6 мс посреди звучащей речи
    { const minRun = Math.max(2, Math.round(0.006 * sr)), nb = Math.round(0.02 * sr), hits = []; let i = 0;
      const rmsAt = (a, b) => { a = Math.max(0, a); b = Math.min(x.length, b); let q = 0; for (let k = a; k < b; k++) q += x[k] * x[k]; return Math.sqrt(q / Math.max(1, b - a)); };
      while (i < x.length) {
        if (Math.abs(x[i]) < 2e-5) { let j = i; while (j < x.length && Math.abs(x[j]) < 2e-5) j++; if (j - i >= minRun && i > nb && j + nb < x.length && rmsAt(i - nb, i) > 0.01 && rmsAt(j, j + nb) > 0.01) hits.push({ a: i, b: j, n: 1, v: 0 }); i = j; } else i++;
      }
      for (const r of merge(hits, 0.05)) add('drop', r.a / sr, (r.b - r.a) / sr, tr('Провал звука посреди речи (' + Math.round(((r.b - r.a) / sr) * 1000) + ' мс): возможна потеря записи или стык кусков', 'Dropout inside speech (' + Math.round(((r.b - r.a) / sr) * 1000) + ' ms): lost audio or a piece joint'));
    }
    // 4) «прыжки» громкости между фразами
    { const ph = []; let a = -1, gap = 0;
      for (let k = 0; k < nf; k++) {
        if (fdb[k] > thr) { if (a < 0) a = k; gap = 0; } else if (a >= 0 && ++gap > 15) { ph.push([a, k - gap]); a = -1; gap = 0; }
      }
      if (a >= 0) ph.push([a, nf - 1 - gap]);
      const lv = ph.filter(([p, q]) => q - p >= 12).map(([p, q]) => { let z = 0, c = 0; for (let k = p; k <= q; k++) if (fdb[k] > thr) { z += Math.pow(10, fdb[k] / 10); c++; } return { t: (p * F) / sr, db: 10 * Math.log10(z / Math.max(1, c)) }; });
      if (lv.length >= 2) {
        const sd = lv.map((e) => e.db).sort((u, v) => u - v), med = lv.length > 2 ? sd[sd.length >> 1] : null;
        for (const e of lv) {
          const dv = med == null ? e.db - Math.max(...lv.map((z) => z.db)) : e.db - med;
          if (Math.abs(dv) > (med == null ? 8 : 7) && (med != null || dv < 0)) add('level', e.t, 0.3, dv < 0 ? tr('Фраза тише остальных на ' + Math.abs(dv).toFixed(0) + ' дБ: «Выровнять громкость» (B)', 'Phrase is ' + Math.abs(dv).toFixed(0) + ' dB quieter than the rest: “Balance levels” (B)') : tr('Фраза громче остальных на ' + dv.toFixed(0) + ' дБ: «Выровнять громкость» (B)', 'Phrase is ' + dv.toFixed(0) + ' dB louder than the rest: “Balance levels” (B)'));
        }
      }
    }
    // края провала — тоже скачки: отдельным «щелчком» не показываем
    const drops = out.filter((o) => o.kind === 'drop');
    return out.filter((o) => (o.kind !== 'click' && o.kind !== 'step') || !drops.some((q) => o.t >= q.t - 0.03 && o.t <= q.t + q.dur + 0.03)).sort((u, v) => u.t - v.t);
  }
  function normalizeTake(samples) {
    const peak = peakOf(samples);
    if (peak < 0.01) return samples;
    const g = Math.min(dbToLin(12), 0.89 / peak);
    if (Math.abs(g - 1) < 0.02) return samples;
    const out = new Float32Array(samples.length);
    for (let i = 0; i < samples.length; i++) out[i] = samples[i] * g;
    return out;
  }
  function mixToMono(buffer) {
    const n = buffer.length, out = new Float32Array(n), c = buffer.numberOfChannels;
    for (let ch = 0; ch < c; ch++) { const d = buffer.getChannelData(ch); for (let i = 0; i < n; i++) out[i] += d[i] / c; }
    return out;
  }
  function highpass(x, sr, f0 = 90, Q = 0.707) {
    const w0 = (2 * Math.PI * f0) / sr, c = Math.cos(w0), al = Math.sin(w0) / (2 * Q);
    const a0 = 1 + al, b0 = (1 + c) / 2 / a0, b1 = -(1 + c) / a0, b2 = b0, a1 = (-2 * c) / a0, a2 = (1 - al) / a0;
    const y = new Float32Array(x.length);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < x.length; i++) {
      const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
    }
    return y;
  }
  /** WSOLA: растянуть x во времени (factor>1 — длиннее), длина результата outLen. */
  function timeStretch(x, factor, outLen, sr) {
    const N = Math.max(256, Math.round(sr * 0.04) & ~1), Hs = N >> 1, Ha = Hs / factor, tol = Math.round(sr * 0.008);
    const win = new Float32Array(N);
    for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);
    const out = new Float32Array(outLen + N), norm = new Float32Array(outLen + N);
    const at = (i) => (i >= 0 && i < x.length ? x[i] : 0);
    let prev = 0;
    for (let k = 0, op = 0; op < outLen; k++, op += Hs) {
      let pos = Math.round(k * Ha);
      if (k > 0) {
        const nat = prev + Hs;
        let best = pos, bestC = -Infinity;
        for (let c = pos - tol; c <= pos + tol; c += 2) {
          if (c < 0) continue;
          let s = 0;
          for (let i = 0; i < N; i += 6) s += at(c + i) * at(nat + i);
          if (s > bestC) { bestC = s; best = c; }
        }
        pos = best;
      }
      for (let i = 0; i < N; i++) { out[op + i] += at(pos + i) * win[i]; norm[op + i] += win[i]; }
      prev = pos;
    }
    const res = new Float32Array(outLen);
    for (let i = 0; i < outLen; i++) res[i] = norm[i] > 1e-3 ? out[i] / norm[i] : out[i];
    return res;
  }
  function pitchShift(x, sr, semis) {
    if (!semis) return x;
    const p = Math.pow(2, semis / 12);
    const y = resampleStep(x, p);
    return timeStretch(y, p, x.length, sr);
  }

  function lowpass(x, sr, f0 = 700, Q = 0.8) {
    const w0 = (2 * Math.PI * f0) / sr, c = Math.cos(w0), al = Math.sin(w0) / (2 * Q);
    const a0 = 1 + al, b0 = (1 - c) / 2 / a0, b1 = (1 - c) / a0, b2 = b0, a1 = (-2 * c) / a0, a2 = (1 - al) / a0;
    const y = new Float32Array(x.length);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < x.length; i++) {
      const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
    }
    return y;
  }
  /** «Под водой»: плавающая задержка (лёгкое вибрато) + глухой фильтр. */
  function underwater(x, sr) {
    const n = x.length, y = new Float32Array(n), base = 0.007 * sr, depth = 0.0035 * sr, w = (2 * Math.PI * 0.8) / sr;
    for (let i = 0; i < n; i++) {
      const p = i - (base + depth * Math.sin(w * i)), a = Math.floor(p), f = p - a;
      const s0 = a >= 0 && a < n ? x[a] : 0, s1 = a + 1 >= 0 && a + 1 < n ? x[a + 1] : 0;
      y[i] = 0.75 * (s0 * (1 - f) + s1 * f) + 0.25 * x[i];
    }
    return lowpass(lowpass(y, sr, 650, 0.9), sr, 900, 0.7);
  }
  /** Небольшое эхо: задержка 180 мс с затуханием. */
  function echo(x, sr, delaySec = 0.18, fb = 0.33, mix = 0.32) {
    const D = Math.round(delaySec * sr), n = x.length, d = new Float32Array(n), y = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const v = i >= D ? x[i - D] + fb * d[i - D] : 0;
      d[i] = v; y[i] = x[i] + mix * v;
    }
    return y;
  }

  /** Пространство: «комната» и «зал» (ревербератор на гребенчатых и all-pass фильтрах) или эхо с затемнением повторов.
   *  o = { type: 'room'|'hall'|'echo', mix: 0..100, size: 0..100 }. Хвост обрезается по длине дорожки. */
  function space(x, sr, o) {
    const n = x.length, m = clamp((o.mix || 0) / 100, 0, 1), sz = clamp((o.size == null ? 50 : o.size) / 100, 0, 1);
    if (!m || !n) return x;
    const y = new Float32Array(n), wet = new Float32Array(n);
    if (o.type === 'echo') {
      const D = Math.max(1, Math.round((0.1 + 0.45 * sz) * sr)), d = new Float32Array(n), fb = 0.4;
      let lp = 0;
      for (let i = 0; i < n; i++) {
        const src = i >= D ? x[i - D] + fb * d[i - D] : 0;
        lp += 0.55 * (src - lp); d[i] = lp; wet[i] = lp;
      }
      for (let i = 0; i < n; i++) y[i] = x[i] + m * 0.9 * wet[i];
      return y;
    }
    const hall = o.type === 'hall';
    const sc = (sr / 44100) * (hall ? 1.0 + 0.9 * sz : 0.45 + 0.55 * sz);
    const fb = hall ? 0.84 + 0.09 * sz : 0.72 + 0.12 * sz, damp = hall ? 0.22 : 0.38;
    const preD = Math.round((hall ? 0.028 : 0.012) * sr);
    const combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617].map((L) => ({ b: new Float32Array(Math.max(8, Math.round(L * sc))), i: 0, f: 0 }));
    const aps = [556, 441, 341, 225].map((L) => ({ b: new Float32Array(Math.max(8, Math.round(L * sc))), i: 0 }));
    let hpx = 0, hpy = 0;
    const hpA = Math.exp(-2 * Math.PI * 180 / sr);
    for (let i = 0; i < n; i++) {
      const inp = (i >= preD ? x[i - preD] : 0) * 0.03;
      let acc = 0;
      for (const c of combs) {
        const o2 = c.b[c.i];
        c.f = o2 * (1 - damp) + c.f * damp;
        c.b[c.i] = inp + c.f * fb;
        if (++c.i >= c.b.length) c.i = 0;
        acc += o2;
      }
      for (const a of aps) {
        const bo = a.b[a.i], out = bo - acc;
        a.b[a.i] = acc + bo * 0.5;
        if (++a.i >= a.b.length) a.i = 0;
        acc = out;
      }
      const hy = hpA * (hpy + acc - hpx); hpx = acc; hpy = hy; // срез низа в «мокрой» части, чтобы не гудело
      wet[i] = hy;
    }
    // уровень «мокрой» части подгоняем под дорожку, чтобы ползунок «Количество» работал одинаково для любого размера
    let ew = 0, ex = 0;
    for (let i = 0; i < n; i++) { ew += wet[i] * wet[i]; ex += x[i] * x[i]; }
    const g = ew > 1e-12 ? (hall ? 0.8 : 0.7) * Math.sqrt(ex / ew) : 0;
    for (let i = 0; i < n; i++) y[i] = x[i] * (1 - 0.25 * m) + wet[i] * m * g;
    return y;
  }

  /* ---------- шумодав: спектральное вычитание (STFT 512/128), один код для живого микрофона и дорожки ---------- */
  class VxpNRCore {
    constructor(sr) {
      const N = 512, H = 128, B = N / 2 + 1;
      this.N = N; this.H = H; this.B = B; this.sr = sr || 48000;
      this.win = new Float32Array(N);
      for (let i = 0; i < N; i++) this.win[i] = Math.sqrt(0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
      this.cs = new Float32Array(N / 2); this.sn = new Float32Array(N / 2);
      for (let i = 0; i < N / 2; i++) { this.cs[i] = Math.cos((2 * Math.PI * i) / N); this.sn[i] = -Math.sin((2 * Math.PI * i) / N); }
      this.rev = new Uint16Array(N);
      for (let i = 0, bits = Math.log2(N); i < N; i++) { let r = 0; for (let b = 0; b < bits; b++) if (i & (1 << b)) r |= 1 << (bits - 1 - b); this.rev[i] = r; }
      this.re = new Float32Array(N); this.im = new Float32Array(N);
      this.inb = new Float32Array(N); this.w = 0; this.cnt = 0;
      this.acc = new Float32Array(N); this.outb = new Float32Array(H); this.fo = 0;
      this.ps = new Float32Array(B); this.pn = new Float32Array(B); this.pw = new Float32Array(B); this.cm = new Float32Array(B); this.mins = new Float32Array(4 * B); this.nz = new Float32Array(B); this.g = new Float32Array(B).fill(1); this.gs = new Float32Array(B);
      this.pf = new Float32Array(B); this.prof = null; this.lf = 0; this.lc = 0; this.lacc = new Float32Array(B); this.learnDone = false;
      this.frames = 0; this.red = 0; this.setStrength(0.55);
    }
    /** Запомнить шум: усреднить спектр за n кадров (молчание). */
    startLearn(n) { this.lf = Math.max(8, n | 0); this.lc = 0; this.lacc.fill(0); this.learnDone = false; }
    /** Применить сохранённый профиль (power по бинам при частоте srFrom). */
    setProfile(arr, srFrom) {
      if (!arr || !arr.length) { this.prof = null; return; }
      const B = this.B, out = new Float32Array(B), ratio = (srFrom || this.sr) / this.sr;
      for (let k = 0; k < B; k++) {
        const q = Math.min(arr.length - 1, k * ratio), a = Math.floor(q), f = q - a;
        out[k] = arr[a] * (1 - f) + arr[Math.min(arr.length - 1, a + 1)] * f;
      }
      this.prof = out;
    }
    setStrength(s) {
      this.s = Math.max(0, Math.min(1, s));
      this.alpha = 0.9 + 1.6 * this.s;
      this.gmin = Math.pow(10, -(8 + 22 * this.s) / 20);
    }
    fft(re, im, inv) {
      const N = this.N, rev = this.rev;
      if (inv) for (let i = 0; i < N; i++) im[i] = -im[i];
      for (let i = 0; i < N; i++) { const j = rev[i]; if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
      for (let size = 2; size <= N; size <<= 1) {
        const half = size >> 1, step = N / size;
        for (let i = 0; i < N; i += size) {
          for (let j = 0, k = 0; j < half; j++, k += step) {
            const a = i + j, b = a + half, wr = this.cs[k], wi = this.sn[k];
            const tr = re[b] * wr - im[b] * wi, ti = re[b] * wi + im[b] * wr;
            re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
          }
        }
      }
      if (inv) for (let i = 0; i < N; i++) im[i] = -im[i];
    }
    frame() {
      const { N, H, B, re, im, win, inb, ps, pn, nz, g, gs } = this;
      for (let i = 0; i < N; i++) { re[i] = inb[(this.w + i) % N] * win[i]; im[i] = 0; }
      this.fft(re, im, false);
      const first = this.frames++ === 0;
      if (this.lf > 0 && this.frames > 12) {
        for (let k = 0; k < B; k++) this.lacc[k] += this.pf[k];
        if (++this.lc >= this.lf) {
          const pr = new Float32Array(B); for (let k = 0; k < B; k++) pr[k] = this.lacc[k] / this.lc;
          this.prof = pr; this.lf = 0; this.learnDone = true;
        }
      }
      let sumG = 0;
      const cm = this.cm;
      if (this.frames % 112 === 0 && !first) { const u = ((this.frames / 112) | 0) % 4; for (let k = 0; k < B; k++) { this.mins[u * B + k] = cm[k]; cm[k] = pn[k]; } }
      const pw = this.pw;
      for (let k = 0; k < B; k++) pw[k] = re[k] * re[k] + im[k] * im[k];
      for (let k = 0; k < B; k++) {
        const p = (pw[k > 1 ? k - 2 : 0] + 2 * pw[k > 0 ? k - 1 : 0] + 3 * pw[k] + 2 * pw[k < B - 1 ? k + 1 : B - 1] + pw[k < B - 2 ? k + 2 : B - 1]) / 9;
        this.pf[k] = p;
        ps[k] = first ? p : 0.6 * ps[k] + 0.4 * p;
        pn[k] = first ? p : 0.93 * pn[k] + 0.07 * p;
        if (first) { cm[k] = pn[k]; for (let u = 0; u < 4; u++) this.mins[u * B + k] = 1e30; }
        else if (pn[k] < cm[k]) cm[k] = pn[k];
        let mn = cm[k];
        for (let u = 0; u < 4; u++) { const v = this.mins[u * B + k]; if (v < mn) mn = v; }
        let al = this.alpha;
        if (this.fixed && this.prof) {
          nz[k] = Math.max(this.prof[k] * 1.3, mn * 1.2);
          const snr = ps[k] / Math.max(1e-12, nz[k]);
          al = this.alpha * (1 - 0.55 * Math.min(1, Math.max(0, (snr - 2) / 14))); // где голос заметно сильнее шума — вычитаем меньше
        } else nz[k] = this.prof ? Math.max(mn * 1.7, this.prof[k] * 1.25) : mn * 1.7;
        const gt = ps[k] > 1e-12 ? Math.sqrt(Math.max(this.gmin * this.gmin, 1 - (al * nz[k]) / ps[k])) : this.gmin;
        g[k] = gt > g[k] ? 0.4 * g[k] + 0.6 * gt : 0.88 * g[k] + 0.12 * gt;
      }
      for (let k = 0; k < B; k++) {
        const a = g[k > 0 ? k - 1 : 0], c = g[k < B - 1 ? k + 1 : B - 1];
        gs[k] = (a + 2 * g[k] + c) * 0.25; sumG += gs[k];
      }
      for (let k = 0; k < B; k++) { re[k] *= gs[k]; im[k] *= gs[k]; if (k > 0 && k < N / 2) { re[N - k] *= gs[k]; im[N - k] *= gs[k]; } }
      this.fft(re, im, true);
      const sc = 0.5 / N, acc = this.acc;
      for (let i = 0; i < N; i++) acc[(this.w + i) % N] += re[i] * win[i] * sc;
      for (let j = 0; j < H; j++) { const p = (this.w + j) % N; this.outb[j] = acc[p]; acc[p] = 0; }
      const mg = Math.max(1e-4, sumG / B);
      this.red = 0.92 * this.red + 0.08 * (-20 * Math.log10(mg));
    }
    /** Обработать блок (любой длины). Задержка = 512 сэмплов. */
    process(x, y) {
      const N = this.N, H = this.H;
      for (let i = 0; i < x.length; i++) {
        y[i] = this.outb[this.fo++];
        this.inb[this.w] = x[i]; this.w = (this.w + 1) % N;
        if (++this.cnt === H) { this.cnt = 0; this.frame(); this.fo = 0; }
      }
    }
  }

  /** Код AudioWorklet шумодава: ядро + процессор (один и тот же алгоритм, что и для дорожки). */
  const NR_WORKLET = VxpNRCore.toString() + `
class VxpNRProc extends AudioWorkletProcessor{constructor(){super();this.c=[];this.s=0.55;this.t=0;this.pr=null;this.port.onmessage=e=>{const d=e.data||{};if(d.s!=null){this.s=d.s;this.c.forEach(c=>c.setStrength(this.s))}if('prof' in d){this.pr=d.prof?{a:Float32Array.from(d.prof),sr:d.sr}:null;this.c.forEach(c=>c.setProfile(this.pr&&this.pr.a,this.pr&&this.pr.sr))}if(d.learn){this.ln=d.learn;this.c.forEach(c=>c.startLearn(d.learn))}}}
process(inp,out){const x=inp[0],y=out[0];if(!x||!x.length)return true;for(let ch=0;ch<y.length;ch++){const src=x[ch]||x[0];if(!this.c[ch]){this.c[ch]=new VxpNRCore(sampleRate);this.c[ch].setStrength(this.s);if(this.pr)this.c[ch].setProfile(this.pr.a,this.pr.sr);if(this.ln)this.c[ch].startLearn(this.ln)}this.c[ch].process(src,y[ch])}if(this.c[0]&&this.c[0].learnDone){this.c[0].learnDone=false;this.ln=0;this.port.postMessage({done:true,prof:Array.from(this.c[0].prof),sr:sampleRate})}if(++this.t%25===0&&this.c[0])this.port.postMessage({r:this.c[0].red});return true}}
registerProcessor('vxp-nr',VxpNRProc);`;
  /** Шумодав дорожки (офлайн): strength 0..1. Задержку ядра (512 сэмплов) компенсируем. */
  /** Оценка шума по всей записи: средний спектр самых тихих кадров (паузы между репликами). */
  function estimateNoise(x, sr) {
    const core = new VxpNRCore(sr), N = core.N, B = core.B, hop = core.H * 3, re = core.re, im = core.im, win = core.win;
    const frames = [];
    for (let i = 0; i + N <= x.length; i += hop) {
      for (let j = 0; j < N; j++) { re[j] = x[i + j] * win[j]; im[j] = 0; }
      core.fft(re, im, false);
      const pw = new Float32Array(B); let e = 0;
      for (let k = 0; k < B; k++) { pw[k] = re[k] * re[k] + im[k] * im[k]; e += pw[k]; }
      frames.push({ e, pw });
    }
    if (frames.length < 24) return null;
    const alive = frames.filter((f) => f.e > 1e-9).sort((a, b) => a.e - b.e);
    if (alive.length < 16) return null;
    const take = alive.slice(0, Math.max(8, Math.floor(alive.length * 0.1)));
    const pr = new Float32Array(B);
    for (const f of take) for (let k = 0; k < B; k++) pr[k] += f.pw[k] / take.length;
    const sm = new Float32Array(B);
    for (let k = 0; k < B; k++) sm[k] = (pr[k > 1 ? k - 2 : 0] + 2 * pr[k > 0 ? k - 1 : 0] + 3 * pr[k] + 2 * pr[k < B - 1 ? k + 1 : B - 1] + pr[k < B - 2 ? k + 2 : B - 1]) / 9;
    return sm;
  }
  function denoiseTrack(x, sr, strength) {
    if (!strength) return x;
    const core = new VxpNRCore(sr), D = core.N, n = x.length;
    core.setStrength(strength);
    if (settings.nrProf && settings.nrProf.p) { core.setProfile(Float32Array.from(settings.nrProf.p), settings.nrProf.sr); core.fixed = true; }
    else { const pr = estimateNoise(x, sr); if (pr) { core.setProfile(pr, sr); core.fixed = true; } }
    const xin = new Float32Array(n + D); xin.set(x);
    const y = new Float32Array(n + D);
    for (let i = 0; i < xin.length; i += core.H) core.process(xin.subarray(i, Math.min(i + core.H, xin.length)), y.subarray(i, Math.min(i + core.H, xin.length)));
    return y.slice(D, D + n);
  }

  /* ---------- ESPERION FX: эквалайзер, компрессор, дэ-эссер, лимитер (офлайн, для дорожки) ---------- */
  /** Коэффициенты бикуада (RBJ): [b0,b1,b2,a1,a2]. type: bell | lowshelf | highshelf | hp | lp | bp */
  function biquadCoefs(type, f, gDb, q, sr) {
    const w0 = (2 * Math.PI * clamp(f, 10, sr * 0.45)) / sr, c = Math.cos(w0), sn = Math.sin(w0);
    const A = Math.pow(10, gDb / 40), al = sn / (2 * Math.max(0.1, q));
    let b0, b1, b2, a0, a1, a2;
    if (type === 'lowshelf') {
      const s = 2 * Math.sqrt(A) * al;
      b0 = A * ((A + 1) - (A - 1) * c + s); b1 = 2 * A * ((A - 1) - (A + 1) * c); b2 = A * ((A + 1) - (A - 1) * c - s);
      a0 = (A + 1) + (A - 1) * c + s; a1 = -2 * ((A - 1) + (A + 1) * c); a2 = (A + 1) + (A - 1) * c - s;
    } else if (type === 'highshelf') {
      const s = 2 * Math.sqrt(A) * al;
      b0 = A * ((A + 1) + (A - 1) * c + s); b1 = -2 * A * ((A - 1) + (A + 1) * c); b2 = A * ((A + 1) + (A - 1) * c - s);
      a0 = (A + 1) - (A - 1) * c + s; a1 = 2 * ((A - 1) - (A + 1) * c); a2 = (A + 1) - (A - 1) * c - s;
    } else if (type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = (1 + c) / 2; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; }
    else if (type === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = (1 - c) / 2; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; }
    else if (type === 'bp') { b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; }
    else { b0 = 1 + al * A; b1 = -2 * c; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * c; a2 = 1 - al / A; }
    return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
  }
  function biquadRun(x, k) {
    const y = new Float32Array(x.length), [b0, b1, b2, a1, a2] = k;
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < x.length; i++) {
      const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
    }
    return y;
  }
  /** АЧХ бикуада в дБ на частоте f. */
  function biquadDb(k, f, sr) {
    const w = (2 * Math.PI * f) / sr, c1 = Math.cos(w), s1 = Math.sin(w), c2 = Math.cos(2 * w), s2 = Math.sin(2 * w);
    const nr = k[0] + k[1] * c1 + k[2] * c2, ni = -(k[1] * s1 + k[2] * s2);
    const dr = 1 + k[3] * c1 + k[4] * c2, di = -(k[3] * s1 + k[4] * s2);
    return 10 * Math.log10(Math.max(1e-12, (nr * nr + ni * ni) / Math.max(1e-12, dr * dr + di * di)));
  }
  const eqBandDb = (b, f, sr) => (b && b.on ? biquadDb(biquadCoefs(b.type, b.f, b.g, b.q, sr), f, sr) : 0);
  function applyEq(x, sr, bands) {
    let y = x;
    for (const b of bands) if (b && b.on) y = biquadRun(y, biquadCoefs(b.type, b.f, b.g, b.q, sr));
    return y;
  }
  const TR_STEP = 256;
  /** Компрессор (feed-forward, мягкое колено). Возвращает { y, gr } — gr в дБ (≤0) по блокам TR_STEP. */
  function compress(x, sr, c) {
    const n = x.length, y = new Float32Array(n), gr = new Float32Array(Math.ceil(n / TR_STEP) + 1);
    const at = Math.exp(-1 / (sr * Math.max(0.05, c.att) / 1000)), rl = Math.exp(-1 / (sr * Math.max(1, c.rel) / 1000));
    const thr = c.thr, ratio = Math.max(1, c.ratio), knee = Math.max(0, c.knee), mk = dbToLin(c.makeup || 0), slope = 1 / ratio - 1;
    let g = 0;
    for (let i = 0; i < n; i++) {
      const a = x[i] < 0 ? -x[i] : x[i], lvl = a > 1e-6 ? 20 * Math.log10(a) : -120, over = lvl - thr;
      let t;
      if (2 * over < -knee) t = 0;
      else if (2 * Math.abs(over) <= knee) t = (slope * (over + knee / 2) * (over + knee / 2)) / (2 * knee);
      else t = slope * over;
      g = t < g ? at * g + (1 - at) * t : rl * g + (1 - rl) * t;
      y[i] = x[i] * dbToLin(g) * mk;
      const bi = (i / TR_STEP) | 0; if (g < gr[bi]) gr[bi] = g;
    }
    return { y, gr };
  }
  /** Дэ-эссер: подавляет полосу вокруг частоты f, когда её уровень выше порога. */
  function deEss(x, sr, d) {
    const n = x.length, y = new Float32Array(n), gr = new Float32Array(Math.ceil(n / TR_STEP) + 1);
    const band = biquadRun(x, biquadCoefs('bp', d.f, 0, 1.2, sr));
    const at = Math.exp(-1 / (sr * 0.0006)), rl = Math.exp(-1 / (sr * 0.03));
    let env = 0, g = 0;
    const maxRed = Math.max(0, d.amt);
    for (let i = 0; i < n; i++) {
      const a = band[i] < 0 ? -band[i] : band[i];
      env = a > env ? at * env + (1 - at) * a : rl * env + (1 - rl) * a;
      const lvl = env > 1e-6 ? 20 * Math.log10(env) : -120, over = lvl - d.thr;
      const t = over > 0 ? -Math.min(maxRed, over * 0.75) : 0;
      g = t < g ? 0.6 * g + 0.4 * t : 0.995 * g + 0.005 * t;
      y[i] = x[i] - band[i] * (1 - dbToLin(g));
      const bi = (i / TR_STEP) | 0; if (g < gr[bi]) gr[bi] = g;
    }
    return { y, gr };
  }

  /** Шумовой гейт (экспандер с удержанием): глушит паузы между фразами на depth дБ, без «хлопков» — плавные атака/спад. */
  function noiseGate(x, sr, g) {
    const n = x.length, y = new Float32Array(n), gr = new Float32Array(Math.ceil(n / TR_STEP) + 1);
    const lookA = Math.round(sr * 0.004), thr = dbToLin(g.thr), floor = dbToLin(-Math.abs(g.depth));
    const at = Math.exp(-1 / (sr * Math.max(0.5, g.att) / 1000)), rl = Math.exp(-1 / (sr * Math.max(10, g.rel) / 1000));
    const hold = Math.round(sr * Math.max(0, g.hold) / 1000), env = new Float32Array(n), ea = Math.exp(-1 / (sr * 0.002)), er = Math.exp(-1 / (sr * 0.02));
    let e = 0; for (let i = 0; i < n; i++) { const a = Math.abs(x[i]); e = a > e ? ea * e + (1 - ea) * a : er * e + (1 - er) * a; env[i] = e; }
    let gain = floor, hc = 0;
    for (let i = 0; i < n; i++) {
      const open = env[Math.min(n - 1, i + lookA)] > thr; // упреждение: начало слова не срезается
      if (open) hc = hold; else if (hc > 0) hc--;
      const target = open || hc > 0 ? 1 : floor;
      gain = target > gain ? at * gain + (1 - at) * target : rl * gain + (1 - rl) * target;
      y[i] = x[i] * gain;
      const bi = (i / TR_STEP) | 0, d = gain > 1e-4 ? 20 * Math.log10(gain) : -80; if (d < gr[bi]) gr[bi] = d;
    }
    return { y, gr };
  }
  /** Де-хам: узкие вырезы на частоте сети и её гармониках (50/60 Гц). */
  function deHum(x, sr, hm) {
    let y = x; const hz = hm.hz || 50, N = clamp(Math.round(hm.harm || 4), 1, 8);
    for (let k = 1; k <= N; k++) { const f = hz * k; if (f > sr * 0.4) break; y = biquadRun(y, notchCoefs(f, Math.max(2, hm.q || 25), sr)); }
    return y;
  }
  function notchCoefs(f, q, sr) {
    const w0 = (2 * Math.PI * f) / sr, c = Math.cos(w0), al = Math.sin(w0) / (2 * q), a0 = 1 + al;
    return [1 / a0, (-2 * c) / a0, 1 / a0, (-2 * c) / a0, (1 - al) / a0];
  }
  /** Тёплое насыщение (мягкий клиппинг tanh, 2× передискретизация, DC-фильтр) + наклон тембра tone (−6..+6 дБ). */
  function saturate(x, sr, sa) {
    const n = x.length, y = new Float32Array(n), drv = dbToLin(clamp(sa.drive, 0, 24)), mix = clamp(sa.mix, 0, 100) / 100, norm = 1 / Math.tanh(drv * 0.6 + 1e-6);
    let prev = 0, dcx = 0, dcy = 0;
    for (let i = 0; i < n; i++) {
      const v = x[i], mid = (v + prev) * 0.5;                 // линейная интерполяция до 2× — меньше алиасинга
      const w = 0.5 * (Math.tanh(drv * 0.6 * mid) + Math.tanh(drv * 0.6 * v)) * norm * 0.9;
      prev = v;
      const o = dcy * 0.995 + w - dcx; dcx = w; dcy = o;     // убираем постоянную составляющую
      y[i] = v * (1 - mix) + o * mix;
    }
    return sa.tone ? biquadRun(y, biquadCoefs('highshelf', 3000, clamp(sa.tone, -6, 6), 0.7, sr)) : y;
  }
  /** Нормализация громкости речи: подгоняет RMS по активным участкам (речи, не пауз) к целевому уровню. */
  function normalizeSpeech(x, sr, nm) {
    const blk = Math.max(64, Math.round(sr * 0.02)), nb = Math.floor(x.length / blk), r = [];
    for (let b = 0; b < nb; b++) { let s = 0; for (let i = b * blk; i < (b + 1) * blk; i++) s += x[i] * x[i]; r.push(s / blk); }
    if (!r.length) return x;
    const pk = Math.max(...r), gateP = pk * 1e-4; let s = 0, c = 0; for (const v of r) if (v > gateP) { s += v; c++; }
    if (!c) return x;
    const cur = 10 * Math.log10(s / c + 1e-12), g = dbToLin(clamp(nm.target - cur, -24, 24)), y = new Float32Array(x.length);
    for (let i = 0; i < x.length; i++) y[i] = x[i] * g;
    return y;
  }
  function slidingMin(a, half) {
    const n = a.length, out = new Float32Array(n), dq = new Int32Array(n);
    let hd = 0, tl = 0, r = 0;
    for (let i = 0; i < n; i++) {
      for (const lim = Math.min(n - 1, i + half); r <= lim; r++) { while (tl > hd && a[dq[tl - 1]] >= a[r]) tl--; dq[tl++] = r; }
      while (dq[hd] < i - half) hd++;
      out[i] = a[dq[hd]];
    }
    return out;
  }
  /** Лимитер с упреждением 2 мс: пик не выше ceil (дБ). gain — входное усиление (дБ). */
  function limiter(x, sr, l) {
    const n = x.length, L = Math.max(8, Math.round(sr * 0.002)), ce = dbToLin(Math.min(0, l.ceil)), ig = dbToLin(l.gain || 0);
    const req = new Float32Array(n);
    for (let i = 0; i < n; i++) { const a = Math.abs(x[i] * ig); req[i] = a > ce ? ce / a : 1; }
    const mn = slidingMin(req, L - 1), pre = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) pre[i + 1] = pre[i] + mn[i];
    const half = L >> 1, y = new Float32Array(n), gr = new Float32Array(Math.ceil(n / TR_STEP) + 1), rel = Math.exp(-1 / (sr * 0.08));
    let g = 1;
    for (let i = 0; i < n; i++) {
      const lo = Math.max(0, i - half), hi = Math.min(n, i + half + 1);
      const sm = (pre[hi] - pre[lo] + (L - (hi - lo))) / L;      // за краями считаем 1
      const smv = Math.min(1, sm);
      g = Math.min(smv, g + (1 - g) * (1 - rel));
      y[i] = x[i] * ig * g;
      const bi = (i / TR_STEP) | 0, d = 20 * Math.log10(Math.max(1e-6, g)); if (d < gr[bi]) gr[bi] = d;
    }
    return { y, gr };
  }
  /** Спектр (дБFS) окна size сэмплов с позиции start, Hann + FFT. */
  const fftCache = new Map();
  function fftPlan(N) {
    let p = fftCache.get(N);
    if (!p) {
      const rev = new Uint32Array(N), bits = Math.log2(N), cs = new Float32Array(N / 2), sn = new Float32Array(N / 2), win = new Float32Array(N);
      for (let i = 0; i < N; i++) { let r = 0; for (let b = 0; b < bits; b++) if (i & (1 << b)) r |= 1 << (bits - 1 - b); rev[i] = r; win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N); }
      for (let i = 0; i < N / 2; i++) { cs[i] = Math.cos((2 * Math.PI * i) / N); sn[i] = -Math.sin((2 * Math.PI * i) / N); }
      p = { N, rev, cs, sn, win, re: new Float32Array(N), im: new Float32Array(N) };
      fftCache.set(N, p);
    }
    return p;
  }
  /** Добавляет в acc (Float32Array N/2) мощность окна. */
  function spectrumAdd(x, start, N, acc) {
    const { rev, cs, sn, win, re, im } = fftPlan(N);
    for (let i = 0; i < N; i++) { const j = start + i; re[rev[i]] = j >= 0 && j < x.length ? x[j] * win[i] : 0; im[rev[i]] = 0; }
    for (let size = 2; size <= N; size <<= 1) {
      const half = size >> 1, step = N / size;
      for (let i = 0; i < N; i += size) for (let j = 0, k = 0; j < half; j++, k += step) {
        const a = i + j, b = a + half, tr_ = re[b] * cs[k] - im[b] * sn[k], ti = re[b] * sn[k] + im[b] * cs[k];
        re[b] = re[a] - tr_; im[b] = im[a] - ti; re[a] += tr_; im[a] += ti;
      }
    }
    for (let k = 0; k < N / 2; k++) acc[k] += re[k] * re[k] + im[k] * im[k];
  }
  /** Средний спектр дорожки в дБFS (массив N/2), по окнам с шагом N. */
  function avgSpectrum(x, N = 2048) {
    const acc = new Float32Array(N / 2); let cnt = 0;
    const hop = Math.max(N, Math.floor(x.length / 80));
    for (let s = 0; s + N <= x.length; s += hop) {
      let e = 0; for (let i = s; i < s + N; i += 8) e += x[i] * x[i];
      if (e / (N / 8) < 1e-7) continue; // тишину не учитываем
      spectrumAdd(x, s, N, acc); cnt++;
    }
    const out = new Float32Array(N / 2), norm = (N / 4) * (N / 4);
    for (let k = 0; k < N / 2; k++) out[k] = 10 * Math.log10(Math.max(1e-12, cnt ? acc[k] / cnt / norm : 0));
    return out;
  }
  function spectrumAt(x, start, N = 2048) {
    const acc = new Float32Array(N / 2); spectrumAdd(x, start, N, acc);
    const out = new Float32Array(N / 2), norm = (N / 4) * (N / 4);
    for (let k = 0; k < N / 2; k++) out[k] = 10 * Math.log10(Math.max(1e-12, acc[k] / norm));
    return out;
  }
  const chainOn = (p) => !!((p.eq && p.eq.some((b) => b.on)) || (p.comp && p.comp.on) || (p.deess && p.deess.on) || (p.lim && p.lim.on) || (p.gate && p.gate.on) || (p.hum && p.hum.on) || (p.sat && p.sat.on) || (p.norm && p.norm.on));

  /* ---------- модель дубля (неразрушающая обработка и монтаж) ---------- */
  // model = { base:Float32Array, sr, t0 (сек, где base[0] относительно старта видео),
  //           outLen (сэмплов в окне для игры),
  //           params:{offset, pitch, gain, lowcut, speed, underwater, echo},
  //           segs:[{id, a, b, pos}] — куски base[a..b), стоящие на таймлайне с позиции pos (сек) }
  const FX_KEYS = ['pitch', 'gain', 'lowcut', 'speed', 'underwater', 'echo', 'space', 'denoise', 'eq', 'comp', 'deess', 'lim', 'gate', 'hum', 'sat', 'norm', 'vox', 'nn', 'room'];
  const defaultParams = () => ({ offset: 0, ...cloneJ(settings.fx) });
  const isDefaultParams = (p) => !p.offset && !p.pitch && !p.gain && !p.lowcut && (p.speed || 1) === 1 && !p.underwater && !p.echo && !(p.space && p.space.mix) && !p.denoise && !(p.vox && p.vox.on) && !(p.room && p.room.on) && !chainOn(p);
  let segSeq = 1;
  const segSig = (m) => JSON.stringify(m.segs.map((s) => [s.a, s.b, +s.pos.toFixed(5), s.fx || 0]));
  function initSegs(m) {
    m.segs = [{ id: segSeq++, a: 0, b: m.base.length, pos: m.t0 }];
    m._segInit = segSig(m);
    m._sc = null; m._r = null;
    return m.segs;
  }
  const ensureSegs = (m) => m.segs || initSegs(m);
  const segsPristine = (m) => !m.segs || segSig(m) === m._segInit;
  const isDefaultModel = (m) => isDefaultParams(m.params) && segsPristine(m);
  const segDur = (m, s) => (s.b - s.a) / m.sr / (m.params.speed || 1);
  /** Звук куска с учётом скорости (темп без изменения высоты). */
  function segAudio(m, s) {
    const sp = m.params.speed || 1, key = s.a + '|' + s.b + '|' + sp;
    if (!m._sc || m._scBase !== m.base) { m._sc = new Map(); m._scBase = m.base; }
    let x = m._sc.get(key);
    if (!x) {
      x = sp === 1 ? m.base.subarray(s.a, s.b) : timeStretch(m.base.slice(s.a, s.b), 1 / sp, Math.max(1, Math.round((s.b - s.a) / sp)), m.sr);
      if (m._sc.size > 80) m._sc.clear();
      m._sc.set(key, x);
    }
    if (!segFxActive(s.fx)) return x;
    const k2 = key + '|fx' + JSON.stringify(s.fx);
    let y = m._sc.get(k2);
    if (!y) { y = applySegFx(x, m.sr, s.fx); if (m._sc.size > 80) m._sc.clear(); m._sc.set(k2, y); }
    return y;
  }
  /** Вырезать из раскладки отрезок [t0, t1) (сек): куски, попавшие под него, подрезаются или делятся. */
  function carveSegs(m, t0, t1) {
    const sr = m.sr, sp = m.params.speed || 1, out = [], minD = 0.01;
    for (const sg of ensureSegs(m)) {
      const st = sg.pos, en = sg.pos + segDur(m, sg);
      if (en <= t0 || st >= t1) { out.push(sg); continue; }
      if (st < t0 - minD) out.push({ ...sg, b: sg.a + Math.round((t0 - st) * sr * sp) });
      if (en > t1 + minD) out.push({ ...sg, id: segSeq++, a: sg.a + Math.round((t1 - st) * sr * sp), pos: t1 });
    }
    return out;
  }
  /* Эффекты куска (iFix) и фрагмента: громкость, авто-выравнивание (bal), питч, срез низов, шумодав,
     пространство {type,mix,size}, эхо 0..100, «под водой» (under), «радио» (radio), задом наперёд (rev). */
  const segFxActive = (f) => !!f && !!(f.declick || f.gain || f.bal || f.pitch || f.lowcut || f.denoise || f.echo || f.under || f.radio || f.rev || (f.space && f.space.mix));
  /** «Радио / телефон»: полоса ~380–3300 Гц и мягкая перегрузка. */
  function radioFx(x, sr) {
    const y = lowpass(highpass(x, sr, 380, 0.8), sr, 3300, 0.8);
    for (let i = 0; i < y.length; i++) y[i] = Math.tanh(y[i] * 2.4) * 0.72;
    return y;
  }
  const ECHO_DELAY = 0.24;
  function applySegFx(x, sr, f) {
    let y = f.declick ? declick(x, sr) : new Float32Array(x);
    if (f.rev) y.reverse();
    if (f.denoise) y = denoiseTrack(y, sr, f.denoise / 100);
    if (f.pitch) y = pitchShift(y, sr, f.pitch);
    if (f.lowcut) y = highpass(y, sr);
    if (f.radio) y = radioFx(y, sr);
    if (f.under) y = underwater(y, sr);
    const sp = f.space, ec = clamp((f.echo || 0) / 100, 0, 1);
    let tail = ec ? ECHO_DELAY * 6 : 0;
    if (sp && sp.mix) {
      const sz = (sp.size == null ? 50 : sp.size) / 100;
      tail = Math.max(tail, sp.type === 'hall' ? 1.8 : sp.type === 'echo' ? (0.1 + 0.45 * sz) * 3.5 : 0.9);
    }
    if (tail) { const pad = new Float32Array(y.length + Math.round(tail * sr)); pad.set(y); y = pad; }
    if (ec) y = echo(y, sr, ECHO_DELAY, 0.3 + 0.3 * ec, 0.15 + 0.6 * ec);
    if (sp && sp.mix) y = space(y, sr, sp);
    const db = (f.gain || 0) + (f.bal || 0);
    if (db) { const g = dbToLin(db); for (let i = 0; i < y.length; i++) y[i] *= g; }
    return y;
  }

  /* ---- Фрагменты записи: у каждого свои эффекты (хранятся в кусках, которые под ним лежат) ---- */
  const FRAG_COLORS = ['#8b5cf6', '#22d3ee', '#f59e0b', '#34d399', '#f43f5e', '#ec4899', '#60a5fa', '#a3e635'];
  /* [ключ, значок, русское имя, английское имя, эффекты] */
  const FRAG_PRESETS = [
    ['clean', '✨', 'Чисто', 'Clean', null],
    ['echo', '🔁', 'Эхо', 'Echo', { echo: 50 }],
    ['hall', '🏛', 'Зал', 'Hall', { space: { type: 'hall', mix: 40, size: 65 } }],
    ['up', '⬆', 'Питч +4', 'Pitch +4', { pitch: 4 }],
    ['down', '⬇', 'Питч −4', 'Pitch −4', { pitch: -4 }],
    ['monster', '👹', 'Монстр', 'Monster', { pitch: -7, gain: 1, space: { type: 'room', mix: 25, size: 50 } }],
    ['ghost', '👻', 'Призрак', 'Ghost', { pitch: 3, echo: 60, space: { type: 'hall', mix: 30, size: 70 } }],
    ['radio', '📻', 'Радио', 'Radio', { radio: true }],
    ['water', '🌊', 'Под водой', 'Underwater', { under: true }],
    ['rev', '⏪', 'Задом наперёд', 'Reverse', { rev: true }],
  ];
  const FID = new WeakMap(); let fidSeq = 0;
  const fid = (f) => { let v = FID.get(f); if (!v) FID.set(f, (v = ++fidSeq)); return v; };
  /** Куски фрагмента: по середине куска; если таких нет — по любому перекрытию. */
  function fragSegsOf(m, f) {
    if (!m || !m.segs) return [];
    const mid = m.segs.filter((sg) => { const c = sg.pos + segDur(m, sg) / 2; return c >= f.t0 - 0.02 && c <= f.t1 + 0.02; });
    return mid.length ? mid : m.segs.filter((sg) => sg.pos < f.t1 - 0.02 && sg.pos + segDur(m, sg) > f.t0 + 0.02);
  }
  /** Эффекты фрагмента (по первому его куску) с заполненными значениями по умолчанию. */
  function fragFxOf(m, f) {
    const sg = fragSegsOf(m, f)[0], x = (sg && sg.fx) || {};
    return Object.assign({}, x, {
      gain: x.gain || 0, pitch: x.pitch || 0, echo: x.echo || 0, denoise: x.denoise || 0,
      lowcut: !!x.lowcut, under: !!x.under, radio: !!x.radio, rev: !!x.rev,
      space: Object.assign({ type: 'room', mix: 0, size: 50 }, x.space),
    });
  }
  /** Только «ручные» эффекты (без авто-выравнивания bal) — для копирования между фрагментами. */
  const fxManual = (x) => ({ gain: x.gain, pitch: x.pitch, echo: x.echo, denoise: x.denoise, lowcut: x.lowcut, under: x.under, radio: x.radio, rev: x.rev, space: Object.assign({}, x.space) });


  /* ---- Сверка фрагмента с оригиналом: старт, длина, громкость ---- */
  /** Звук фрагмента в его окне [t0, t1] (секунды клипа, без сдвига дорожки). dry — без эффектов. */
  function fragAudio(m, f, dry) {
    const segs = fragSegsOf(m, f).map((sg) => { if (!dry || !sg.fx) return sg; const c = { ...sg }; delete c.fx; return c; });
    return assemble(Object.assign({}, m, { segs }), f.t0, Math.max(1, Math.round((f.t1 - f.t0) * m.sr)), false);
  }
  /** Где в x есть звук: первый и последний «громкий» кадр, секунды от начала x. */
  function activeSpan(x, sr, frameMs = 10) {
    const e = envelope(x, sr, frameMs); let mx = 0; for (const v of e) if (v > mx) mx = v;
    if (mx < 1e-3) return null;
    const thr = mx * 0.12; let i = 0, j = e.length - 1;
    while (i < j && e[i] < thr) i++;
    while (j > i && e[j] < thr) j--;
    return { s: (i * frameMs) / 1000, e: ((j + 1) * frameMs) / 1000 };
  }
  function corrAt(a, b, L) {
    let s = 0, sa = 0, sb = 0; const i0 = Math.max(0, -L), i1 = Math.min(a.length, b.length - L);
    for (let i = i0; i < i1; i++) { const p = a[i], q = b[i + L]; s += p * q; sa += p * p; sb += q * q; }
    return sa > 0 && sb > 0 ? s / Math.sqrt(sa * sb) : 0;
  }
  /** Сравнение фрагмента с оригиналом. shiftMs > 0 — мой фрагмент раньше оригинала (надо сдвинуть позже).
   *  durRatio = длина речи оригинала / моей; levelDb > 0 — я громче оригинала. */
  function fragSync(m, f, ref) {
    if (!m || !f || !ref || !ref.samples) return null;
    const mine = fragAudio(m, f, true), spM = activeSpan(mine, m.sr);
    if (!spM) return null;
    const rEnd = ref.samples.length / ref.sr, r0 = Math.max(0, f.t0 - 0.8), r1 = Math.min(rEnd, f.t1 + 0.8);
    if (r1 - r0 < 0.3) return null;
    const refW = ref.samples.subarray(Math.floor(r0 * ref.sr), Math.floor(r1 * ref.sr));
    if (!activeSpan(refW, ref.sr)) return { noRef: true };
    const a = zNorm(envelope(refW, ref.sr)), b = zNorm(envelope(mine, m.sr));
    const base = (r0 - f.t0) * 100, L = bestLag(a, b, Math.round(base - 80), Math.round(base + 80));
    const shift = (r0 - f.t0) - L * 0.01, score = clamp(corrAt(a, b, L), 0, 1);
    // оригинальная речь вокруг того места, куда «встанет» мой фрагмент
    const w0 = Math.max(0, f.t0 + spM.s + shift - 0.35), w1 = Math.min(rEnd, f.t0 + spM.e + shift + 0.35);
    const ref2 = w1 - w0 > 0.2 ? ref.samples.subarray(Math.floor(w0 * ref.sr), Math.floor(w1 * ref.sr)) : null;
    const sp2 = ref2 && activeSpan(ref2, ref.sr), dm = spM.e - spM.s;
    const durRatio = sp2 && dm > 0.2 && sp2.e - sp2.s > 0.2 ? (sp2.e - sp2.s) / dm : null;
    let levelDb = null;
    if (ref2) {
      const wet = fragAudio(m, f, false), lm = activeRms(wet, 0, wet.length), lr = activeRms(ref2, 0, ref2.length);
      if (lm > 1e-5 && lr > 1e-5) levelDb = 20 * Math.log10(lm / lr);
    }
    return { shiftMs: shift * 1000, score, durRatio, levelDb, mineStart: f.t0 + spM.s };
  }

  /* ---- Разбивка на фразы по паузам ---- */
  /** Границы фраз (в сэмплах base) внутри куска [a, b): середины пауз длиннее minGap сек. */
  function findPauses(base, a, b, sr, minGap = 0.35) {
    const fl = Math.max(1, Math.round(sr * 0.01)), n = Math.floor((b - a) / fl);
    if (n < 20) return [];
    const e = new Float32Array(n);
    for (let i = 0; i < n; i++) { let s = 0; for (let j = a + i * fl, k = j + fl; j < k; j++) s += base[j] * base[j]; e[i] = Math.sqrt(s / fl); }
    const srt = Array.from(e).sort((x, y) => x - y), p90 = srt[Math.floor(n * 0.9)] || 0;
    if (p90 < 0.002) return [];
    const thr = Math.max(0.0012, p90 * 0.1), minF = Math.round(minGap * 100), cuts = [];
    for (let i = 0; i < n;) {
      if (e[i] >= thr) { i++; continue; }
      let j = i; while (j < n && e[j] < thr) j++;
      if (j - i >= minF && i > 0 && j < n) cuts.push(Math.round((i + j) / 2));
      i = j;
    }
    // «фраза» короче 0,15 с (щелчок, вдох) фразой не считается — склеиваем с соседней
    const active = (x, y) => { let c = 0; for (let k = x; k < y; k++) if (e[k] >= thr) c++; return c; };
    for (let guard = 0; guard < 100 && cuts.length; guard++) {
      const edges = [0, ...cuts, n]; let bad = -1;
      for (let k = 0; k < edges.length - 1; k++) if (active(edges[k], edges[k + 1]) < 15) { bad = k; break; }
      if (bad < 0) break;
      cuts.splice(Math.min(bad, cuts.length - 1), 1);
    }
    return cuts.map((c) => a + c * fl);
  }
  /** Границы звучащей части [a, b) куска в сэмплах base: по огибающей (кадры 5 мс, порог от 95-го процентиля).
   *  Звучанием считаются минимум 2 кадра подряд — одиночный щелчок или всплеск в тишине границу не двигает. null — звука нет. */
  function speechEdges(base, a, b, sr) {
    const fl = Math.max(1, Math.round(sr * 0.005)), n = Math.floor((b - a) / fl);
    if (n < 6) return null;
    const e = new Float32Array(n);
    for (let i = 0; i < n; i++) { let q = 0; for (let j = a + i * fl, k = j + fl; j < k; j++) q += base[j] * base[j]; e[i] = Math.sqrt(q / fl); }
    const srt = Array.from(e).sort((x, y) => x - y), ref = srt[Math.floor((n - 1) * 0.95)] || 0;
    if (ref < 0.002) return null;
    const thr = Math.max(0.0012, ref * 0.05);
    let i = 0, j = n - 1;
    while (i < n - 1 && !(e[i] >= thr && e[i + 1] >= thr)) i++;
    while (j > 0 && !(e[j] >= thr && e[j - 1] >= thr)) j--;
    if (j <= i) return null;
    return { a: a + i * fl, b: a + (j + 1) * fl };
  }
  /** План разбивки фрагмента: { remove, segs, frags } или null, если пауз нет. */
  function splitFragPhrases(m, f, minGap) {
    const sp = m.params.speed || 1, src = fragSegsOf(m, f); if (!src.length) return null;
    const outSegs = []; let cutT = [];
    for (const sg of src) {
      const cuts = findPauses(m.base, sg.a, sg.b, m.sr, minGap);
      if (!cuts.length) { outSegs.push(sg); continue; }
      const edges = [sg.a, ...cuts, sg.b];
      for (let k = 0; k < edges.length - 1; k++) outSegs.push({ ...sg, id: segSeq++, a: edges[k], b: edges[k + 1], pos: sg.pos + (edges[k] - sg.a) / m.sr / sp });
      for (const c of cuts) cutT.push(sg.pos + (c - sg.a) / m.sr / sp);
    }
    cutT = cutT.filter((t) => t > f.t0 + 0.05 && t < f.t1 - 0.05).sort((x, y) => x - y);
    const bounds = [f.t0, ...cutT, f.t1], frags = [];
    for (let k = 0; k < bounds.length - 1; k++) if (bounds[k + 1] - bounds[k] > 0.05) frags.push({ t0: bounds[k], t1: bounds[k + 1] });
    return frags.length < 2 ? null : { remove: src, segs: outSegs, frags };
  }
  /** Дубль фрагмента: снимок его кусков и границ (звук лежит в base, поэтому ничего не копируется). */
  let takeSeq = 1;
  const takeOf = (m, f) => ({ id: takeSeq++, t0: f.t0, t1: f.t1, segs: fragSegsOf(m, f).map((s) => ({ ...s })) });
  /** Собрать куски на таймлайн в окно [fromSec, fromSec + len/sr). Края кусков — короткие фейды без щелчков. */
  /* 2.9: куски, идущие встык (разрез посреди речи, тот же исходный звук подряд, эффекты поэлементные), не затухают на стыке:
     раньше каждый край получал свой 4 мс фейд, и на месте разреза возникал провал ~8 мс. Фейды остаются у всех остальных краёв. */
  const seamlessFx = (f) => !f || !(f.pitch || f.lowcut || f.denoise || f.echo || f.under || f.radio || f.rev || (f.space && f.space.mix));
  function assemble(m, fromSec, len, withOffset = true) {
    const out = new Float32Array(len), off = withOffset ? m.params.offset / 1000 : 0, sr = m.sr, segs = ensureSegs(m);
    const xs = segs.map((s) => segAudio(m, s)), st = segs.map((s) => Math.round((s.pos + off - fromSec) * sr)), plain = (m.params.speed || 1) === 1;
    const lv = (f, k) => (f && f[k]) || 0;
    const joined = (p, q) => plain && p !== q && segs[p].b === segs[q].a && seamlessFx(segs[p].fx) && seamlessFx(segs[q].fx)
      && lv(segs[p].fx, 'gain') === lv(segs[q].fx, 'gain') && lv(segs[p].fx, 'bal') === lv(segs[q].fx, 'bal') && Math.abs(st[p] + xs[p].length - st[q]) <= 2;
    segs.forEach((s, qi) => {
      const x = xs[qi], L = x.length, start = st[qi], fade = Math.min(Math.round(0.004 * sr), L >> 1);
      let fIn = fade, fOut = fade;
      for (let pi = 0; pi < segs.length; pi++) { if (joined(pi, qi)) fIn = 0; if (joined(qi, pi)) fOut = 0; }
      const i0 = Math.max(0, -start), i1 = Math.min(L, len - start);
      for (let i = i0; i < i1; i++) {
        let g = 1;
        if (i < fIn) g = i / fIn; else if (i > L - fOut) g = (L - i) / fOut;
        out[start + i] += x[i] * g;
      }
    });
    return out;
  }
  /** Шумодав дорожки: нейросеть (модуль vxp-denoise.js), если выбрана и готова; иначе обычный. */
  const nnReady = (n) => !!(n && VXP.nn && VXP.nn.ok && VXP.nn.ok(n));
  function denoiseAny(x, sr, strength, nn) {
    if (nnReady(nn)) { try { return VXP.nn.denoise(x, sr, strength, nn); } catch (e) { console.warn('[ESPERION] нейросеть', e); } }
    return denoiseTrack(x, sr, strength);
  }
  function renderModel(m) {
    const p = m.params, key = segSig({ segs: ensureSegs(m) }) + JSON.stringify(p) + (p.denoise ? JSON.stringify((settings.nrProf || {}).p ? settings.nrProf.p[3] : 0) + (nnReady(p.nn) ? 'N' : '') : '') + m.outLen + '|' + m.base.length;
    if (m._rk === key && m._r) return m._r;
    let x = assemble(m, 0, m.outLen);
    if (p.room && p.room.on && VXP.roomfx) { try { x = VXP.roomfx.process(x, m.sr, p.room); } catch (e) { console.warn('[ESPERION] дереверб', e); } }
    if (p.hum && p.hum.on) x = deHum(x, m.sr, p.hum);
    if (p.denoise) x = denoiseAny(x, m.sr, p.denoise / 100, p.nn);
    const trc = {};
    if (p.gate && p.gate.on) { const r = noiseGate(x, m.sr, p.gate); x = r.y; trc.gate = r.gr; }
    if (p.pitch) x = pitchShift(x, m.sr, p.pitch);
    if (p.lowcut) x = highpass(x, m.sr);
    if (p.vox && p.vox.on && VXP.voxfx) { try { x = VXP.voxfx.process(x, m.sr, p.vox); } catch (e) { console.warn('[ESPERION] эффектор', e); } }
    if (p.eq && p.eq.some((b) => b.on)) x = applyEq(x, m.sr, p.eq);
    if (p.deess && p.deess.on) { const r = deEss(x, m.sr, p.deess); x = r.y; trc.deess = r.gr; }
    if (p.comp && p.comp.on) { const r = compress(x, m.sr, p.comp); x = r.y; trc.comp = r.gr; }
    if (p.sat && p.sat.on) x = saturate(x, m.sr, p.sat);
    if (p.underwater) x = underwater(x, m.sr);
    if (p.echo) x = echo(x, m.sr);
    if (p.space && p.space.mix) x = space(x, m.sr, p.space);
    if (p.norm && p.norm.on) x = normalizeSpeech(x, m.sr, p.norm);
    if (p.gain) { const g = dbToLin(p.gain); for (let i = 0; i < x.length; i++) x[i] *= g; }
    if (p.lim && p.lim.on) { const r = limiter(x, m.sr, p.lim); x = r.y; trc.lim = r.gr; }
    const pk = peakOf(x);
    if (pk > 0.98) { const k = 0.98 / pk; for (let i = 0; i < x.length; i++) x[i] *= k; }
    m._rk = key; m._r = x; m._tr = trc;
    return x;
  }
  /** Сдвиг (мс), при котором собранная дорожка лучше всего совпадает с оригиналом. */
  function alignOffset(m, ref) {
    let lo = Infinity, hi = -Infinity;
    for (const s of ensureSegs(m)) { lo = Math.min(lo, s.pos); hi = Math.max(hi, s.pos + segDur(m, s)); }
    if (!isFinite(lo)) return m.params.offset;
    const wide = assemble(m, lo, Math.max(1, Math.round((hi - lo) * m.sr)), false);
    return autoAlign(ref.samples, ref.sr, wide, m.sr, lo);
  }
  VXP.analyzeVoice = analyzeVoice;
  VXP.dsp = { noiseGate, deHum, saturate, normalizeSpeech, applyEq, compress, deEss, limiter, avgSpectrum, spectrumAt, biquadCoefs, biquadDb, denoiseTrack, VxpNRCore, pitchShift, timeStretch, highpass, lowpass, underwater, echo, space, renderModel, assemble, autoAlign, alignOffset, locate, initSegs, segsPristine, isDefaultModel };
