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
    // Прогрев: оценщик минимумов стартует с первого кадра, поэтому сначала прогоняем развёрнутое начало дорожки (до 1.5 с) и отбрасываем результат
    const P = Math.min(n, Math.round(sr * 1.5));
    const xin = new Float32Array(P + n + D);
    for (let i = 0; i < P; i++) xin[i] = x[P - 1 - i];
    xin.set(x, P);
    const y = new Float32Array(xin.length);
    for (let i = 0; i < xin.length; i += core.H) core.process(xin.subarray(i, Math.min(i + core.H, xin.length)), y.subarray(i, Math.min(i + core.H, xin.length)));
    return y.slice(P + D, P + D + n);
  }

  /* ---------- ORDAX FX: эквалайзер, компрессор, дэ-эссер, лимитер (офлайн, для дорожки) ---------- */
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
  const chainOn = (p) => !!((p.eq && p.eq.some((b) => b.on)) || (p.comp && p.comp.on) || (p.deess && p.deess.on) || (p.lim && p.lim.on));

  /* ---------- модель дубля (неразрушающая обработка и монтаж) ---------- */
  // model = { base:Float32Array, sr, t0 (сек, где base[0] относительно старта видео),
  //           outLen (сэмплов в окне для игры),
  //           params:{offset, pitch, gain, lowcut, speed, underwater, echo},
  //           segs:[{id, a, b, pos}] — куски base[a..b), стоящие на таймлайне с позиции pos (сек) }
  const FX_KEYS = ['pitch', 'gain', 'lowcut', 'speed', 'underwater', 'echo', 'space', 'denoise', 'eq', 'comp', 'deess', 'lim', 'vox', 'nn', 'room'];
  const defaultParams = () => ({ offset: 0, ...cloneJ(settings.fx) });
  const isDefaultParams = (p) => !p.offset && !p.pitch && !p.gain && !p.level && !p.lowcut && (p.speed || 1) === 1 && !p.underwater && !p.echo && !(p.space && p.space.mix) && !p.denoise && !(p.vox && p.vox.on) && !(p.room && p.room.on) && !chainOn(p);
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
  /* iFix: обработка отдельного куска (громкость, питч, срез низов, шумодав, пространство) */
  const segFxActive = (f) => !!f && !!(f.gain || f.pitch || f.lowcut || f.denoise || (f.space && f.space.mix));
  function applySegFx(x, sr, f) {
    let y = new Float32Array(x);
    if (f.denoise) y = denoiseTrack(y, sr, f.denoise / 100);
    if (f.pitch) y = pitchShift(y, sr, f.pitch);
    if (f.lowcut) y = highpass(y, sr);
    const sp = f.space;
    if (sp && sp.mix) {
      const sz = (sp.size == null ? 50 : sp.size) / 100;
      const tail = sp.type === 'hall' ? 1.8 : sp.type === 'echo' ? (0.1 + 0.45 * sz) * 3.5 : 0.9;
      const pad = new Float32Array(y.length + Math.round(tail * sr)); pad.set(y);
      y = space(pad, sr, sp);
    }
    if (f.gain) { const g = dbToLin(f.gain); for (let i = 0; i < y.length; i++) y[i] *= g; }
    return y;
  }
  /** Собрать куски на таймлайн в окно [fromSec, fromSec + len/sr). Края кусков — короткие фейды без щелчков. */
  function assemble(m, fromSec, len, withOffset = true) {
    const out = new Float32Array(len), off = withOffset ? m.params.offset / 1000 : 0, sr = m.sr;
    for (const s of ensureSegs(m)) {
      const x = segAudio(m, s), L = x.length, start = Math.round((s.pos + off - fromSec) * sr);
      const fade = Math.min(Math.round(0.004 * sr), L >> 1);
      const i0 = Math.max(0, -start), i1 = Math.min(L, len - start);
      for (let i = i0; i < i1; i++) {
        let g = 1;
        if (i < fade) g = i / fade; else if (i > L - fade) g = (L - i) / fade;
        out[start + i] += x[i] * g;
      }
    }
    return out;
  }
  /** Шумодав дорожки: нейросеть (модуль vxp-denoise.js), если выбрана и готова; иначе обычный. */
  const nnReady = (n) => !!(n && VXP.nn && VXP.nn.ok && VXP.nn.ok(n));
  function denoiseAny(x, sr, strength, nn) {
    if (nnReady(nn)) { try { return VXP.nn.denoise(x, sr, strength, nn); } catch (e) { console.warn('[Voxalike+OrdaxEd] нейросеть', e); } }
    return denoiseTrack(x, sr, strength);
  }
  function renderModel(m) {
    const p = m.params, key = segSig({ segs: ensureSegs(m) }) + JSON.stringify(p) + (p.denoise ? JSON.stringify((settings.nrProf || {}).p ? settings.nrProf.p[3] : 0) + (nnReady(p.nn) ? 'N' : '') : '') + m.outLen + '|' + m.base.length;
    if (m._rk === key && m._r) return m._r;
    let x = assemble(m, 0, m.outLen);
    if (p.room && p.room.on && VXP.roomfx) { try { x = VXP.roomfx.process(x, m.sr, p.room); } catch (e) { console.warn('[Voxalike+OrdaxEd] дереверб', e); } }
    if (p.denoise) x = denoiseAny(x, m.sr, p.denoise / 100, p.nn);
    if (p.pitch) x = pitchShift(x, m.sr, p.pitch);
    if (p.lowcut) x = highpass(x, m.sr);
    if (p.vox && p.vox.on && VXP.voxfx) { try { x = VXP.voxfx.process(x, m.sr, p.vox); } catch (e) { console.warn('[Voxalike+OrdaxEd] эффектор', e); } }
    const trc = {};
    if (p.eq && p.eq.some((b) => b.on)) x = applyEq(x, m.sr, p.eq);
    if (p.deess && p.deess.on) { const r = deEss(x, m.sr, p.deess); x = r.y; trc.deess = r.gr; }
    if (p.comp && p.comp.on) { const r = compress(x, m.sr, p.comp); x = r.y; trc.comp = r.gr; }
    if (p.underwater) x = underwater(x, m.sr);
    if (p.echo) x = echo(x, m.sr);
    if (p.space && p.space.mix) x = space(x, m.sr, p.space);
    if (p.gain || p.level) { const g = dbToLin((p.gain || 0) + (p.level || 0)); for (let i = 0; i < x.length; i++) x[i] *= g; }
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
  VXP.dsp = { applyEq, compress, deEss, limiter, avgSpectrum, spectrumAt, biquadCoefs, biquadDb, denoiseTrack, VxpNRCore, pitchShift, timeStretch, highpass, lowpass, underwater, echo, space, renderModel, assemble, autoAlign, alignOffset, locate, initSegs, segsPristine, isDefaultModel };
