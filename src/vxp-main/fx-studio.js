  /* ================================================================== */
  /*  ESPERION FX: окно эквалайзера и динамики                              */
  /* ================================================================== */
  const F_MIN = 20, F_MAX = 20000, EQ_RANGE = 18;
  const BAND_COL = ['#ff5a5a', '#ffa23a', '#e8e23a', '#4be36a', '#3dc4ff', '#b17aff'];
  const logX = (f, W) => (W * Math.log(f / F_MIN)) / Math.log(F_MAX / F_MIN);
  const xLog = (x, W) => F_MIN * Math.pow(F_MAX / F_MIN, x / W);
  const fmtHz = (f) => (f >= 1000 ? (f / 1000).toFixed(f >= 10000 ? 1 : 2).replace(/\.?0+$/, '') + ' ' + tr('кГц', 'kHz') : Math.round(f) + ' ' + tr('Гц', 'Hz'));
  const fmtDb = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(1) + ' ' + tr('дБ', 'dB');
  const eqTypeName = (t) => ({ hp: tr('Срез НЧ', 'High-pass'), lowshelf: tr('Полка НЧ', 'Low shelf'), bell: tr('Колокол', 'Bell'), highshelf: tr('Полка ВЧ', 'High shelf'), lp: tr('Срез ВЧ', 'Low-pass') }[t] || t);

  /** Круглая ручка: тянуть по вертикали, колесо, двойной клик — сброс. */
  function knob(o) {
    const S = 56, cv = h('canvas', { width: S * 2, height: S * 2, class: 'vxp-knobcv' });
    cv.style.width = S + 'px'; cv.style.height = S + 'px';
    const val = h('div', { class: 'vxp-kval' }), lab = h('div', { class: 'vxp-klab' }, o.label);
    const el = h('div', { class: 'vxp-knob', title: o.title || '' }, cv, val, lab);
    const to01 = (v) => clamp(o.log ? Math.log(v / o.min) / Math.log(o.max / o.min) : (v - o.min) / (o.max - o.min), 0, 1);
    const from01 = (t) => { t = clamp(t, 0, 1); let v = o.log ? o.min * Math.pow(o.max / o.min, t) : o.min + t * (o.max - o.min); if (o.step) v = Math.round(v / o.step) * o.step; return clamp(v, o.min, o.max); };
    const draw = () => {
      const g = cv.getContext('2d'), W = S * 2, c = W / 2, r = W * 0.325, a0 = Math.PI * 0.75, a1 = Math.PI * 2.25, t = to01(o.get());
      const bip = o.min < 0 && o.max > 0 && !o.log, z = bip ? to01(0) : 0, ang = a0 + (a1 - a0) * t, angZ = a0 + (a1 - a0) * z;
      g.clearRect(0, 0, W, W); g.lineCap = 'round';
      // шкала-засечки
      for (let i = 0; i <= 10; i++) { const a = a0 + ((a1 - a0) * i) / 10, big = i % 5 === 0; g.strokeStyle = 'rgba(255,255,255,' + (big ? 0.28 : 0.13) + ')'; g.lineWidth = big ? 3 : 2; g.beginPath(); g.moveTo(c + Math.cos(a) * (r + 10), c + Math.sin(a) * (r + 10)); g.lineTo(c + Math.cos(a) * (r + (big ? 17 : 14)), c + Math.sin(a) * (r + (big ? 17 : 14))); g.stroke(); }
      g.lineWidth = 8; g.strokeStyle = 'rgba(255,255,255,.08)'; g.beginPath(); g.arc(c, c, r, a0, a1); g.stroke();
      const lo = Math.min(ang, angZ), hi = Math.max(ang, angZ);
      if (hi - lo > 0.004) { const gr = g.createLinearGradient(0, W, W, 0); gr.addColorStop(0, THEME.acc); gr.addColorStop(1, THEME.acc2); g.strokeStyle = gr; g.shadowColor = THEME.acc; g.shadowBlur = el.matches(':hover,:focus-visible') ? 16 : 9; g.beginPath(); g.arc(c, c, r, lo, hi); g.stroke(); g.shadowBlur = 0; }
      const cap = g.createRadialGradient(c - 10, c - 14, 3, c, c, r * 0.78); cap.addColorStop(0, '#3a3a46'); cap.addColorStop(0.6, '#1c1c24'); cap.addColorStop(1, '#101015');
      g.fillStyle = cap; g.beginPath(); g.arc(c, c, r * 0.7, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(255,255,255,.14)'; g.lineWidth = 2; g.beginPath(); g.arc(c, c, r * 0.7, 0, Math.PI * 2); g.stroke();
      g.strokeStyle = '#fff'; g.lineWidth = 5; g.beginPath(); g.moveTo(c + Math.cos(ang) * r * 0.32, c + Math.sin(ang) * r * 0.32); g.lineTo(c + Math.cos(ang) * r * 0.58, c + Math.sin(ang) * r * 0.58); g.stroke();
      val.textContent = o.fmt(o.get());
      el.setAttribute('aria-valuenow', String(o.get()));
    };
    el.tabIndex = 0; el.setAttribute('role', 'slider'); el.setAttribute('aria-label', o.label); el.setAttribute('aria-valuemin', String(o.min)); el.setAttribute('aria-valuemax', String(o.max));
    el.addEventListener('focus', () => draw()); el.addEventListener('blur', () => draw()); el.addEventListener('pointerenter', () => draw()); el.addEventListener('pointerleave', () => draw());
    el.addEventListener('keydown', (e) => {
      const k = e.key, st = (e.shiftKey ? 0.01 : 0.05), cur = to01(o.get());
      let nt = null;
      if (k === 'ArrowUp' || k === 'ArrowRight') nt = cur + st; else if (k === 'ArrowDown' || k === 'ArrowLeft') nt = cur - st; else if (k === 'Home') nt = 0; else if (k === 'End') nt = 1; else if (k === 'Delete' || k === 'Backspace') { o.set(o.def, true); draw(); e.preventDefault(); e.stopPropagation(); return; }
      if (nt == null) return; e.preventDefault(); e.stopPropagation();
      let v = from01(nt); if (o.step == null && Math.abs(v - o.get()) < 1e-9) v = o.get();
      o.set(v, true); draw();
    });
    let dragY = null, startT = 0;
    cv.addEventListener('pointerdown', (e) => { dragY = e.clientY; startT = to01(o.get()); cv.setPointerCapture(e.pointerId); e.preventDefault(); });
    cv.addEventListener('pointermove', (e) => { if (dragY == null) return; const k = e.shiftKey ? 900 : 180; o.set(from01(startT + (dragY - e.clientY) / k), false); draw(); });
    const up = () => { if (dragY == null) return; dragY = null; o.set(o.get(), true); };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', (e) => { e.preventDefault(); o.set(from01(to01(o.get()) + (e.deltaY < 0 ? 0.02 : -0.02) * (e.shiftKey ? 0.25 : 1)), true); draw(); }, { passive: false });
    cv.addEventListener('dblclick', () => { o.set(o.def, true); draw(); });
    el._draw = draw; draw();
    return el;
  }

  const CHAIN_KEYS = ['eq', 'comp', 'deess', 'lim', 'gate', 'hum', 'sat', 'norm'];
  const resetChain = (f) => { const d = defFx(); for (const k of CHAIN_KEYS) f[k] = d[k]; };
  const cloneChain = (f) => { const o = {}; for (const k of CHAIN_KEYS) o[k] = cloneJ(f[k]); return o; };
  /** Привести цепочку (из файла/пресета) к безопасному виду: только известные поля, числа в допустимых пределах. */
  function sanitizeChain(c) {
    const d = defFx(), o = {};
    if (!c || typeof c !== 'object') return null;
    const num = (v, def, a, b) => (Number.isFinite(+v) ? clamp(+v, a, b) : def);
    o.eq = d.eq.map((b, i) => { const s0 = (c.eq && c.eq[i]) || {}; return { type: ['hp', 'lowshelf', 'bell', 'highshelf', 'lp'].includes(s0.type) ? s0.type : b.type, f: num(s0.f, b.f, 20, 20000), g: num(s0.g, 0, -18, 18), q: num(s0.q, b.q, 0.2, 12), on: !!s0.on }; });
    const R = { comp: { thr: [-60, 0], ratio: [1, 20], att: [0.1, 100], rel: [10, 1000], knee: [0, 24], makeup: [0, 24] }, deess: { f: [3000, 12000], thr: [-60, -10], amt: [0, 18] },
      lim: { ceil: [-12, 0], gain: [0, 18] }, gate: { thr: [-80, -20], depth: [0, 60], att: [0.5, 50], hold: [0, 500], rel: [10, 1000] }, hum: { hz: [40, 70], harm: [1, 8], q: [2, 60] },
      sat: { drive: [0, 24], mix: [0, 100], tone: [-6, 6] }, norm: { target: [-40, -6] } };
    for (const k of Object.keys(R)) { const s0 = c[k] || {}; o[k] = { on: !!s0.on }; for (const f of Object.keys(R[k])) o[k][f] = num(s0[f], d[k][f], R[k][f][0], R[k][f][1]); }
    return o;
  }
  const userPresets = () => (settings.userPresets = Array.isArray(settings.userPresets) ? settings.userPresets : []);
  /** Готовые пресеты. Каждый задаёт собственные параметры EQ, динамики, очистки и тембра. [id, название, применить, группа] */
  const FX_PRESETS = () => {
    const E = (f, i, o) => Object.assign(f.eq[i], { on: true }, o);
    const G = (f, k, o) => Object.assign(f[k], { on: true }, o);
    const V = tr('Голос', 'Voice'), C = tr('Очистка', 'Repair'), S = tr('Стиль', 'Style');
    return [
      ['clean', tr('Чистый голос', 'Clean voice'), (f) => {
        E(f, 0, { f: 80 }); E(f, 2, { f: 280, g: -2.5, q: 1 }); E(f, 3, { f: 3200, g: 2, q: 0.9 }); E(f, 5, { f: 11000, g: 2.5 });
        G(f, 'comp', { thr: -22, ratio: 3, att: 12, rel: 120, knee: 8, makeup: 4 }); G(f, 'deess', { f: 6500, thr: -34, amt: 6 }); G(f, 'lim', { ceil: -1, gain: 1.5 });
      }, V],
      ['podcast', tr('Подкаст', 'Podcast'), (f) => {
        E(f, 0, { f: 90 }); E(f, 1, { f: 140, g: 2.5 }); E(f, 2, { f: 320, g: -3, q: 1.1 }); E(f, 3, { f: 4200, g: 3, q: 0.8 });
        G(f, 'comp', { thr: -26, ratio: 4, att: 8, rel: 150, knee: 6, makeup: 6 }); G(f, 'deess', { f: 7000, thr: -32, amt: 8 }); G(f, 'lim', { ceil: -1.5, gain: 3 });
      }, V],
      ['broadcast', tr('Диктор / эфир', 'Broadcast announcer'), (f) => {
        E(f, 0, { f: 75 }); E(f, 1, { f: 120, g: 3.5, q: 0.8 }); E(f, 2, { f: 300, g: -2, q: 1.2 }); E(f, 3, { f: 5200, g: 2.5, q: 0.9 }); E(f, 5, { f: 12000, g: 2 });
        G(f, 'gate', { thr: -52, depth: 18, att: 3, hold: 120, rel: 220 }); G(f, 'comp', { thr: -24, ratio: 4.5, att: 6, rel: 110, knee: 6, makeup: 6 });
        G(f, 'deess', { f: 7200, thr: -32, amt: 8 }); G(f, 'sat', { drive: 3, mix: 40, tone: 0 }); G(f, 'norm', { target: -18 }); G(f, 'lim', { ceil: -1, gain: 0 });
      }, V],
      ['warm', tr('Тёплый баритон', 'Warm baritone'), (f) => {
        E(f, 0, { f: 70 }); E(f, 1, { f: 160, g: 3.5, q: 0.7 }); E(f, 3, { f: 2600, g: -2, q: 1 }); E(f, 5, { f: 9000, g: -2.5 });
        G(f, 'comp', { thr: -20, ratio: 2.5, att: 18, rel: 200, knee: 10, makeup: 3 }); G(f, 'sat', { drive: 8, mix: 55, tone: -2 }); G(f, 'lim', { ceil: -1.5, gain: 1 });
      }, V],
      ['bright', tr('Чёткий и яркий', 'Crisp & bright'), (f) => {
        E(f, 0, { f: 100 }); E(f, 2, { f: 250, g: -3, q: 1 }); E(f, 3, { f: 3600, g: 3.5, q: 0.8 }); E(f, 4, { f: 7500, g: 1.5, q: 1 }); E(f, 5, { f: 10500, g: 3.5 });
        G(f, 'comp', { thr: -22, ratio: 3.2, att: 10, rel: 100, knee: 6, makeup: 4 }); G(f, 'deess', { f: 7000, thr: -34, amt: 9 }); G(f, 'lim', { ceil: -1, gain: 1 });
      }, V],
      ['cinema', tr('Кино-трейлер', 'Cinematic trailer'), (f) => {
        E(f, 0, { f: 60 }); E(f, 1, { f: 100, g: 5, q: 0.7 }); E(f, 2, { f: 400, g: -3, q: 1 }); E(f, 3, { f: 4200, g: 2, q: 1 }); E(f, 5, { f: 9000, g: 2 });
        G(f, 'comp', { thr: -24, ratio: 3.5, att: 15, rel: 160, knee: 8, makeup: 5 }); G(f, 'sat', { drive: 5, mix: 50, tone: 1 }); G(f, 'norm', { target: -17 }); G(f, 'lim', { ceil: -1, gain: 0 });
      }, S],
      ['anime', tr('Звонкий (аниме)', 'Bright (anime)'), (f) => {
        E(f, 0, { f: 150 }); E(f, 2, { f: 500, g: -2.5, q: 1 }); E(f, 3, { f: 3000, g: 3, q: 0.9 }); E(f, 5, { f: 9500, g: 4.5 });
        G(f, 'comp', { thr: -21, ratio: 4, att: 6, rel: 90, knee: 5, makeup: 5 }); G(f, 'deess', { f: 7800, thr: -36, amt: 10 }); G(f, 'lim', { ceil: -1, gain: 2 });
      }, S],
      ['radio', tr('Рация / телефон', 'Radio / phone'), (f) => {
        E(f, 0, { f: 420 }); E(f, 3, { f: 1700, g: 4, q: 1.1 }); E(f, 5, { type: 'lp', f: 3400, q: 0.8 });
        G(f, 'comp', { thr: -20, ratio: 6, att: 4, rel: 90, knee: 4, makeup: 6 }); G(f, 'sat', { drive: 6, mix: 35, tone: 0 }); G(f, 'lim', { ceil: -1, gain: 3 });
      }, S],
      ['lofi', tr('Старая запись', 'Old recording'), (f) => {
        E(f, 0, { f: 280, q: 0.9 }); E(f, 3, { f: 1200, g: 3.5, q: 0.8 }); E(f, 5, { type: 'lp', f: 4200, q: 0.9 });
        G(f, 'comp', { thr: -22, ratio: 5, att: 5, rel: 120, knee: 4, makeup: 6 }); G(f, 'sat', { drive: 14, mix: 65, tone: -3 }); G(f, 'lim', { ceil: -1.5, gain: 2 });
      }, S],
      ['shout', tr('Крик без перегруза', 'Shout without clipping'), (f) => {
        E(f, 0, { f: 110 }); E(f, 3, { f: 3200, g: -2.5, q: 1 }); E(f, 4, { f: 6200, g: -2, q: 1.4 });
        G(f, 'comp', { thr: -16, ratio: 8, att: 2, rel: 110, knee: 4, makeup: 2 }); G(f, 'deess', { f: 6600, thr: -30, amt: 10 }); G(f, 'sat', { drive: 4, mix: 45, tone: 0 }); G(f, 'lim', { ceil: -2, gain: 0 });
      }, S],
      ['whisper', tr('Тихий голос / шёпот', 'Quiet voice / whisper'), (f) => {
        E(f, 0, { f: 100 }); E(f, 3, { f: 3400, g: 2, q: 0.8 }); E(f, 5, { f: 9000, g: 1.5 });
        G(f, 'gate', { thr: -58, depth: 14, att: 4, hold: 140, rel: 260 }); G(f, 'comp', { thr: -34, ratio: 3.5, att: 10, rel: 200, knee: 10, makeup: 9 }); G(f, 'deess', { f: 7000, thr: -38, amt: 8 }); G(f, 'norm', { target: -21 }); G(f, 'lim', { ceil: -1.5, gain: 0 });
      }, V],
      ['noisyroom', tr('Шумная комната', 'Noisy room'), (f) => {
        E(f, 0, { f: 120, q: 0.8 }); E(f, 2, { f: 350, g: -3, q: 1 }); E(f, 3, { f: 3000, g: 2, q: 0.9 });
        G(f, 'hum', { hz: 50, harm: 4, q: 25 }); G(f, 'gate', { thr: -42, depth: 30, att: 3, hold: 90, rel: 160 }); G(f, 'comp', { thr: -24, ratio: 3.5, att: 10, rel: 130, knee: 6, makeup: 5 }); G(f, 'norm', { target: -20 }); G(f, 'lim', { ceil: -1, gain: 0 });
      }, C],
      ['hum50', tr('Фон сети 50 Гц', 'Mains hum 50 Hz'), (f) => { E(f, 0, { f: 60 }); G(f, 'hum', { hz: 50, harm: 6, q: 30 }); }, C],
      ['hum60', tr('Фон сети 60 Гц', 'Mains hum 60 Hz'), (f) => { E(f, 0, { f: 70 }); G(f, 'hum', { hz: 60, harm: 6, q: 30 }); }, C],
      ['cheapmic', tr('Дешёвый микрофон', 'Cheap microphone'), (f) => {
        E(f, 0, { f: 95 }); E(f, 2, { f: 220, g: -4, q: 1.1 }); E(f, 3, { f: 1000, g: -2, q: 1.6 }); E(f, 4, { f: 4600, g: 4, q: 0.9 }); E(f, 5, { f: 11000, g: 3 });
        G(f, 'gate', { thr: -50, depth: 20, att: 3, hold: 100, rel: 180 }); G(f, 'comp', { thr: -23, ratio: 3.5, att: 10, rel: 120, knee: 6, makeup: 5 }); G(f, 'deess', { f: 6800, thr: -34, amt: 8 }); G(f, 'lim', { ceil: -1, gain: 1.5 });
      }, C],
      ['boomy', tr('Убрать бубнёж', 'Remove boominess'), (f) => { E(f, 0, { f: 85 }); E(f, 2, { f: 250, g: -4.5, q: 1.2 }); E(f, 3, { f: 520, g: -2, q: 1.5 }); }, C],
      ['nasal', tr('Убрать гнусавость', 'Remove nasal tone'), (f) => { E(f, 0, { f: 80 }); E(f, 2, { f: 900, g: -4, q: 2 }); E(f, 3, { f: 3500, g: 1.5, q: 1 }); }, C],
      ['harsh', tr('Смягчить резкость', 'Tame harshness'), (f) => { E(f, 3, { f: 3200, g: -3, q: 1.4 }); E(f, 4, { f: 6500, g: -2.5, q: 1.6 }); G(f, 'deess', { f: 6800, thr: -36, amt: 10 }); }, C],
      ['deess', tr('Только дэ-эссер', 'De-esser only'), (f) => { G(f, 'deess', { f: 6800, thr: -36, amt: 9 }); }, C],
      ['loud', tr('Выровнять громкость', 'Level the loudness'), (f) => { G(f, 'norm', { target: -20 }); G(f, 'comp', { thr: -24, ratio: 3, att: 12, rel: 140, knee: 8, makeup: 4 }); G(f, 'lim', { ceil: -1, gain: 0 }); }, C],
    ];
  };

  /** Анализ записи и подбор настроек: шум, фон сети, свист, «бубнёж», разброс громкости. Возвращает { chain, notes }. */
  function analyzeVoice(x, sr) {
    const notes = [], d = defFx(), c = {}; for (const k of CHAIN_KEYS) c[k] = cloneJ(d[k]);
    const blk = Math.max(64, Math.round(sr * 0.02)), nb = Math.floor(x.length / blk), db = [];
    for (let b = 0; b < nb; b++) { let q = 0; for (let i = b * blk; i < (b + 1) * blk; i++) q += x[i] * x[i]; db.push(10 * Math.log10(q / blk + 1e-12)); }
    if (nb < 10) return { chain: c, notes: [tr('Запись слишком короткая для анализа', 'The recording is too short to analyse')] };
    const sorted = db.slice().sort((a, b) => a - b), pc = (q) => sorted[Math.min(nb - 1, Math.floor(nb * q))];
    const noise = pc(0.1), speech = pc(0.9), mid = pc(0.5), range = speech - pc(0.25), pk = peakOf(x);
    if (pk > 0.985) notes.push(tr('Исходная запись клиппит — это не исправить обработкой, лучше убавить усиление микрофона', 'The source clips — processing cannot fix that, lower the mic gain'));
    // фон сети: узкий пик на 50/60 Гц и кратных против соседних частот
    // фон ищем в паузах (непрерывные тихие участки от 0,2 с): речь не маскирует гул; участки анализируем по отдельности, чтобы стыки не давали ложных пиков
    const qt = pc(0.35), runs = []; { let st0 = -1; for (let b = 0; b <= nb; b++) { const q = b < nb && db[b] <= qt; if (q && st0 < 0) st0 = b; if (!q && st0 >= 0) { if ((b - st0) * blk >= sr * 0.2) runs.push(x.subarray(st0 * blk, b * blk)); st0 = -1; } } }
    if (!runs.length) runs.push(x.subarray(0, Math.min(x.length, sr * 4)));
    const tone = (f) => { let acc = 0, tot = 0; for (const r of runs) { const N = r.length, w = (2 * Math.PI * f) / sr; let re = 0, im = 0; for (let i = 0; i < N; i++) { const wn = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N); re += r[i] * wn * Math.cos(w * i); im += r[i] * wn * Math.sin(w * i); } const a = (Math.hypot(re, im) / N) * 2; acc += a * a * N; tot += N; } return Math.sqrt(acc / (tot || 1)); };
    let humHz = 0, humDb = 0;
    for (const hz of [50, 60]) { let sum = 0; for (const k of [1, 2, 3]) { const f = hz * k, a = tone(f), nbh = (tone(f - 20) + tone(f + 20) + tone(f - 30) + tone(f + 30)) / 4; sum += 20 * Math.log10((a + 1e-9) / (nbh + 1e-9)); } if (sum / 3 > humDb) { humDb = sum / 3; humHz = hz; } }
    if (humDb > 9) { c.hum = { on: true, hz: humHz, harm: 5, q: 28 }; notes.push(tr('Найден фон сети ' + humHz + ' Гц (+' + humDb.toFixed(0) + ' дБ) — включён де-хам', 'Mains hum at ' + humHz + ' Hz (+' + humDb.toFixed(0) + ' dB) — de-hum on')); }
    // шум в паузах
    if (speech - noise > 22 && noise > -75) { c.gate = { on: true, thr: clamp(Math.round(noise + 9), -70, -30), depth: clamp(Math.round((speech - noise) * 0.5), 14, 36), att: 3, hold: 100, rel: 180 }; notes.push(tr('Шум в паузах ' + noise.toFixed(0) + ' дБ — включён гейт', 'Pause noise ' + noise.toFixed(0) + ' dB — gate on')); }
    // тембровые полосы
    const band = (f, q) => { const y = biquadRun(x, biquadCoefs('bp', f, 0, q, sr)); let e = 0; for (let i = 0; i < y.length; i++) e += y[i] * y[i]; return 10 * Math.log10(e / y.length + 1e-12); };
    const eMud = band(300, 1.1), eMid = band(2200, 1.0), eSib = band(7000, 1.2), eLow = band(60, 1.2), eBody = band(180, 1.0);
    c.eq[0] = { type: 'hp', f: eLow - eBody > -6 ? 100 : 80, g: 0, q: 0.71, on: true };
    if (eMud - eMid > 5) { const g = -clamp((eMud - eMid - 3) * 0.55, 2, 5); c.eq[2] = { type: 'bell', f: 280, g: Math.round(g * 10) / 10, q: 1.1, on: true }; notes.push(tr('Много «бубнежа» около 300 Гц — срез ' + g.toFixed(1) + ' дБ', 'Boxy build-up near 300 Hz — cut ' + g.toFixed(1) + ' dB')); }
    if (eMid - eSib > 14) { c.eq[5] = { type: 'highshelf', f: 10000, g: 2.5, q: 0.7, on: true }; notes.push(tr('Голосу не хватает «воздуха» — добавлена полка ВЧ', 'Lacking air — high shelf added')); }
    if (eSib - eMid > -9) { c.deess = { on: true, f: 7000, thr: -34, amt: clamp(Math.round((eSib - eMid + 12) * 1.5), 4, 12) }; notes.push(tr('Заметные свистящие — включён дэ-эссер', 'Noticeable sibilance — de-esser on')); }
    // динамика и громкость
    if (range > 12) { c.comp = { on: true, thr: Math.round(pc(0.75) + 2), ratio: range > 20 ? 4.5 : range > 15 ? 3.5 : 2.5, att: 10, rel: 130, knee: 8, makeup: 4 }; notes.push(tr('Разброс громкости ' + range.toFixed(0) + ' дБ — включён компрессор', 'Level spread ' + range.toFixed(0) + ' dB — compressor on')); }
    c.norm = { on: true, target: -20 }; c.lim = { on: true, ceil: -1, gain: 0 };
    notes.push(tr('Громкость речи ' + speech.toFixed(0) + ' дБ → цель −20 дБ, лимитер −1 дБ', 'Speech level ' + speech.toFixed(0) + ' dB → target −20 dB, limiter −1 dB'));
    void mid; return { chain: c, notes };
  }
  /** Окно ESPERION FX. target() → { model, apply } | null; commitFx() — применить к дублю. */
  function openFxStudio(target, commitFx) {
    if (qs('.vxp-fxs', hostDoc())) return;
    const fx = settings.fx;
    const st = { sr: 48000, inSpec: null, outSpec: null, live: null, ph: null, sel: 0, tr: null, x: null, drag: null };
    const model = () => { const t = target && target(); return t ? t.model : null; };
    const params = (patch) => { const m = model(); const p = { ...(m ? m.params : {}) }; for (const k of FX_KEYS) p[k] = cloneJ(fx[k]); return Object.assign(p, patch || {}); };
    const OFF = () => { const o = { eq: fx.eq.map((b) => ({ ...b, on: false })) }; for (const k of CHAIN_KEYS) if (k !== 'eq') o[k] = { ...fx[k], on: false }; return o; };
    const knobs = [];
    const changed = (done) => { saveSettings(); if (done) { scheduleCommit(); } drawAll(); };
    let commitTimer = 0;
    function scheduleCommit() {
      clearTimeout(commitTimer);
      commitTimer = setTimeout(() => {
        try { commitFx && commitFx(); } catch (e) { console.warn('[ESPERION] fx commit', e); }
        recompute();
        if (player.playing) playMine(true);
      }, 140);
    }
    // ---------- спектр ----------
    function recompute() {
      const m = model();
      if (!m) { st.inSpec = st.outSpec = null; drawAll(); return; }
      st.sr = m.sr;
      try {
        const a = Object.assign({}, m, { params: params(OFF()), _rk: null, _r: null });
        const b = Object.assign({}, m, { params: params(), _rk: null, _r: null });
        st.inSpec = avgSpectrum(renderModel(a)); st.x = renderModel(b); st.tr = b._tr || null; st.outSpec = avgSpectrum(st.x);
      } catch (e) { console.warn('[ESPERION] fx spectrum', e); }
      drawAll();
    }
    // ---------- воспроизведение ----------
    function playMine(withFx) {
      const m = model(); if (!m) return toast(tr('Нет записи — сначала запишите дубль', 'No take — record one first'), 'err');
      if (player.playing && withFx !== true) return player.stop();
      const cp = Object.assign({}, m, { params: withFx === false ? params(OFF()) : params(), _rk: null, _r: null });
      const x = renderModel(cp); st.x = x; st.tr = cp._tr || null; st.sr = m.sr;
      player.play({ tracks: [{ samples: x, sr: m.sr, startSec: 0, gain: 1 }], dur: x.length / m.sr + 0.1,
        onTick: (t) => { st.ph = t; drawAll(); }, onEnd: () => { st.ph = null; st.live = null; drawAll(); } });
    }
    // ---------- эквалайзер ----------
    const cvEq = h('canvas', { class: 'vxp-eqcv', title: tr('Тяните точки: влево-вправо — частота, вверх-вниз — усиление. Колесо — добротность. Двойной клик — включить/добавить полосу', 'Drag the dots: left-right — frequency, up-down — gain. Wheel — Q. Double-click — toggle/add a band') });
    const yOfDb = (d, H) => H / 2 - (d / EQ_RANGE) * (H / 2) * 0.88;
    const dbOfY = (y, H) => clamp(-((y - H / 2) / ((H / 2) * 0.88)) * EQ_RANGE, -EQ_RANGE, EQ_RANGE);
    const ySpec = (d, H) => H - clamp((d + 100) / 85, 0, 1) * H * 0.9 - 4;
    function specPath(g, spec, W, H) {
      const nb = spec.length, binHz = st.sr / 2 / nb; let first = true;
      for (let x = 0; x <= W; x += 2) {
        const f = xLog(x, W), c = f / binHz, lo = Math.max(1, Math.floor(c * 0.94)), hi = Math.min(nb - 1, Math.max(lo, Math.ceil(c * 1.06)));
        let s = 0, n = 0; for (let k = lo; k <= hi; k++) { s += spec[k]; n++; }
        const y = ySpec(n ? s / n : -120, H);
        if (first) { g.moveTo(x, y); first = false; } else g.lineTo(x, y);
      }
    }
    function drawEq() {
      const cv = cvEq, dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
      if (!W || !H) return;
      if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
      const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#0d0d12'); bg.addColorStop(1, '#07070a'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
      g.font = '700 10px system-ui,sans-serif'; g.textBaseline = 'top';
      for (const f of [30, 50, 100, 200, 500, 1000, 2000, 5000, 10000]) { const x = Math.round(logX(f, W)) + 0.5; g.fillStyle = 'rgba(255,255,255,.06)'; g.fillRect(x, 0, 1, H); g.fillStyle = 'rgba(255,255,255,.35)'; g.fillText(f >= 1000 ? f / 1000 + 'k' : String(f), x + 3, H - 14); }
      for (const d of [-12, -6, 0, 6, 12]) { const y = Math.round(yOfDb(d, H)) + 0.5; g.fillStyle = d === 0 ? 'rgba(255,255,255,.14)' : 'rgba(255,255,255,.05)'; g.fillRect(0, y, W, 1); g.fillStyle = 'rgba(255,255,255,.35)'; g.fillText((d > 0 ? '+' : '') + d, 4, y + 2); }
      if (st.outSpec) { g.beginPath(); specPath(g, st.outSpec, W, H); g.lineTo(W, H); g.lineTo(0, H); g.closePath(); const fg = g.createLinearGradient(0, 0, 0, H); fg.addColorStop(0, 'rgba(' + THEME.rgb + ',.34)'); fg.addColorStop(1, 'rgba(' + THEME.rgb + ',.02)'); g.fillStyle = fg; g.fill(); }
      if (st.inSpec) { g.beginPath(); specPath(g, st.inSpec, W, H); g.strokeStyle = 'rgba(154,166,184,.55)'; g.lineWidth = 1.2; g.stroke(); }
      if (st.live) { g.beginPath(); specPath(g, st.live, W, H); g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = 1.2; g.stroke(); }
      // суммарная кривая
      const pts = []; for (let x = 0; x <= W; x += 3) { const f = xLog(x, W); let d = 0; for (const b of fx.eq) d += eqBandDb(b, f, st.sr); pts.push([x, yOfDb(clamp(d, -EQ_RANGE * 1.2, EQ_RANGE * 1.2), H)]); }
      g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.lineTo(W, yOfDb(0, H)); g.lineTo(0, yOfDb(0, H)); g.closePath(); g.fillStyle = 'rgba(' + THEME.rgb + ',.13)'; g.fill();
      g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.strokeStyle = THEME.acc; g.lineWidth = 2.6; g.lineJoin = 'round'; g.shadowColor = THEME.acc; g.shadowBlur = 12; g.stroke(); g.shadowBlur = 0;
      // точки
      fx.eq.forEach((b, i) => {
        const x = logX(b.f, W), y = (b.type === 'hp' || b.type === 'lp') ? yOfDb(0, H) : yOfDb(b.g, H), col = BAND_COL[i];
        g.beginPath(); g.arc(x, y, i === st.sel ? 9 : 7, 0, Math.PI * 2);
        if (b.on) { g.fillStyle = col; g.shadowColor = col; g.shadowBlur = i === st.sel ? 14 : 6; g.fill(); g.shadowBlur = 0; } else { g.fillStyle = 'rgba(0,0,0,.5)'; g.fill(); g.strokeStyle = col; g.lineWidth = 1.5; g.stroke(); }
        if (i === st.sel) { g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, 12, 0, Math.PI * 2); g.stroke(); }
        g.fillStyle = b.on ? '#101014' : col; g.font = '900 9px system-ui,sans-serif'; g.textBaseline = 'middle'; g.textAlign = 'center'; g.fillText(String(i + 1), x, y + 0.5); g.textAlign = 'left'; g.textBaseline = 'top';
      });
    }
    function hit(e) {
      const r = cvEq.getBoundingClientRect(), W = r.width, H = r.height, px = e.clientX - r.left, py = e.clientY - r.top;
      let best = -1, bd = 14;
      fx.eq.forEach((b, i) => { const x = logX(b.f, W), y = (b.type === 'hp' || b.type === 'lp') ? yOfDb(0, H) : yOfDb(b.g, H), d = Math.hypot(px - x, py - y); if (d < bd) { bd = d; best = i; } });
      return { i: best, px, py, W, H };
    }
    cvEq.addEventListener('pointerdown', (e) => {
      const k = hit(e); if (k.i < 0) return;
      st.sel = k.i; st.drag = k.i; fx.eq[k.i].on = true; cvEq.setPointerCapture(e.pointerId); syncBand(); changed(false); e.preventDefault();
    });
    cvEq.addEventListener('pointermove', (e) => {
      if (st.drag == null) { cvEq.style.cursor = hit(e).i >= 0 ? 'grab' : 'default'; return; }
      const r = cvEq.getBoundingClientRect(), b = fx.eq[st.drag];
      b.f = Math.round(clamp(xLog(clamp(e.clientX - r.left, 0, r.width), r.width), F_MIN, F_MAX));
      if (b.type !== 'hp' && b.type !== 'lp') b.g = Math.round(dbOfY(e.clientY - r.top, r.height) * 10) / 10;
      syncBand(); changed(false);
    });
    const endDrag = () => { if (st.drag == null) return; st.drag = null; changed(true); };
    cvEq.addEventListener('pointerup', endDrag); cvEq.addEventListener('pointercancel', endDrag);
    cvEq.addEventListener('wheel', (e) => {
      const k = hit(e); const i = k.i >= 0 ? k.i : st.sel; e.preventDefault();
      const b = fx.eq[i]; b.q = Math.round(clamp(b.q * (e.deltaY < 0 ? 1.1 : 0.9), 0.2, 12) * 100) / 100; if (k.i >= 0) { st.sel = i; b.on = true; }
      syncBand(); changed(true);
    }, { passive: false });
    cvEq.addEventListener('dblclick', (e) => {
      const k = hit(e);
      if (k.i >= 0) { fx.eq[k.i].on = !fx.eq[k.i].on; st.sel = k.i; }
      else { const i = fx.eq.findIndex((b) => !b.on); if (i >= 0) { const b = fx.eq[i]; b.on = true; b.f = Math.round(clamp(xLog(k.px, k.W), F_MIN, F_MAX)); if (b.type !== 'hp' && b.type !== 'lp') b.g = Math.round(dbOfY(k.py, k.H) * 10) / 10 || 3; st.sel = i; } }
      syncBand(); changed(true);
    });
    // строка выбранной полосы
    const chips = fx.eq.map((b, i) => h('button', { class: 'vxp-bchip', type: 'button', style: '--bc:' + BAND_COL[i], onclick: () => { st.sel = i; syncBand(); drawAll(); } }, String(i + 1)));
    const typeSel = h('select', { class: 'vxp-select' }, ['hp', 'lowshelf', 'bell', 'highshelf', 'lp'].map((t) => h('option', { value: t }, eqTypeName(t))));
    const num = (key, step, min, max) => h('input', { class: 'vxp-num', type: 'number', step: String(step), min: String(min), max: String(max) });
    const inF = num('f', 1, F_MIN, F_MAX), inG = num('g', 0.1, -EQ_RANGE, EQ_RANGE), inQ = num('q', 0.05, 0.2, 12);
    const onCb = h('input', { type: 'checkbox' }); const onLab = h('label', { class: 'vxp-check' }, onCb, tr('Вкл', 'On'));
    typeSel.addEventListener('change', () => { fx.eq[st.sel].type = typeSel.value; fx.eq[st.sel].on = true; syncBand(); changed(true); });
    const numChange = (inp, key, lo, hi) => inp.addEventListener('change', () => { const v = parseFloat(inp.value); if (isFinite(v)) { fx.eq[st.sel][key] = clamp(v, lo, hi); fx.eq[st.sel].on = true; } syncBand(); changed(true); });
    numChange(inF, 'f', F_MIN, F_MAX); numChange(inG, 'g', -EQ_RANGE, EQ_RANGE); numChange(inQ, 'q', 0.2, 12);
    onCb.addEventListener('change', () => { fx.eq[st.sel].on = onCb.checked; syncBand(); changed(true); });
    function syncBand() {
      const b = fx.eq[st.sel];
      chips.forEach((c, i) => { c.classList.toggle('sel', i === st.sel); c.classList.toggle('on', !!fx.eq[i].on); });
      typeSel.value = b.type; inF.value = Math.round(b.f); inG.value = b.g.toFixed(1); inQ.value = b.q.toFixed(2); onCb.checked = !!b.on;
      inG.disabled = b.type === 'hp' || b.type === 'lp';
    }
    const bandRow = h('div', { class: 'vxp-bandrow' }, h('div', { class: 'vxp-row' }, ...chips), typeSel,
      h('label', { class: 'vxp-nl' }, tr('Гц', 'Hz'), inF), h('label', { class: 'vxp-nl' }, tr('дБ', 'dB'), inG), h('label', { class: 'vxp-nl' }, 'Q', inQ), onLab);

    // ---------- динамика ----------
    const grBar = (cls) => { const u = h('u'), t = h('span', null, '0.0 ' + tr('дБ', 'dB')); const el = h('div', { class: 'vxp-gr ' + (cls || '') }, h('i', null, u), t); el._set = (v) => { u.style.width = clamp((-v / 24) * 100, 0, 100) + '%'; t.textContent = (v ? '−' + Math.abs(v).toFixed(1) : '0.0') + ' ' + tr('дБ', 'dB'); }; return el; };
    const grComp = grBar(), grDe = grBar(), grLim = grBar(), grGate = grBar('gate');
    const DEF_BY = defFx();
    const K = (grp, key, o) => { const k = knob({ get: () => fx[grp][key], set: (v, done) => { fx[grp][key] = v; changed(!!done); }, def: DEF_BY[grp][key], ...o }); knobs.push(k); return k; };
    const sw = (grp, label) => { const cb = h('input', { type: 'checkbox' }); cb.checked = !!fx[grp].on; cb.addEventListener('change', () => { fx[grp].on = cb.checked; changed(true); }); const el = h('label', { class: 'vxp-check' }, cb, label); el._sync = () => { cb.checked = !!fx[grp].on; }; return el; };
    const swC = sw('comp', tr('Вкл', 'On')), swD = sw('deess', tr('Вкл', 'On')), swL = sw('lim', tr('Вкл', 'On')), swG = sw('gate', tr('Вкл', 'On')), swH = sw('hum', tr('Вкл', 'On')), swS = sw('sat', tr('Вкл', 'On')), swN = sw('norm', tr('Вкл', 'On'));
    const humSel = h('select', { class: 'vxp-select', title: tr('Частота сети в вашей стране: 50 Гц (Европа, СНГ) или 60 Гц (США)', 'Mains frequency: 50 Hz (Europe) or 60 Hz (Americas)'), onchange: () => { fx.hum.hz = +humSel.value; changed(true); } }, [50, 60].map((v) => h('option', { value: v }, v + ' ' + tr('Гц', 'Hz'))));
    humSel._sync = () => { humSel.value = String(Math.round(fx.hum.hz) === 60 ? 60 : 50); };
    const dcard = (title, sub, swEl, knobsEl, gr) => h('div', { class: 'vxp-dcard' }, h('div', { class: 'vxp-dhead' }, h('div', null, h('b', null, title), h('small', null, sub)), swEl), h('div', { class: 'vxp-knobs' }, ...knobsEl), gr);
    const cards = h('div', { class: 'vxp-dcards' },
      dcard(tr('Компрессор', 'Compressor'), 'ESPERION COMP', swC, [
        K('comp', 'thr', { label: tr('Порог', 'Thresh'), min: -60, max: 0, fmt: (v) => v.toFixed(0) + ' ' + tr('дБ', 'dB'), title: tr('Выше этого уровня звук начинает сжиматься', 'Above this level the sound starts to be compressed') }),
        K('comp', 'ratio', { label: tr('Степень', 'Ratio'), min: 1, max: 20, log: true, fmt: (v) => v.toFixed(1) + ':1' }),
        K('comp', 'att', { label: tr('Атака', 'Attack'), min: 0.1, max: 100, log: true, fmt: (v) => v.toFixed(1) + ' ' + tr('мс', 'ms') }),
        K('comp', 'rel', { label: tr('Спад', 'Release'), min: 10, max: 1000, log: true, fmt: (v) => v.toFixed(0) + ' ' + tr('мс', 'ms') }),
        K('comp', 'knee', { label: tr('Колено', 'Knee'), min: 0, max: 24, fmt: (v) => v.toFixed(0) + ' ' + tr('дБ', 'dB') }),
        K('comp', 'makeup', { label: tr('Усиление', 'Makeup'), min: 0, max: 24, fmt: (v) => '+' + v.toFixed(1) })], grComp),
      dcard(tr('Дэ-эссер', 'De-esser'), 'ESPERION DE-ESS', swD, [
        K('deess', 'f', { label: tr('Частота', 'Freq'), min: 3000, max: 12000, log: true, fmt: (v) => fmtHz(v), title: tr('Где живут свистящие «с» и «ш»', 'Where the sibilant “s” and “sh” live') }),
        K('deess', 'thr', { label: tr('Порог', 'Thresh'), min: -60, max: -10, fmt: (v) => v.toFixed(0) + ' ' + tr('дБ', 'dB') }),
        K('deess', 'amt', { label: tr('Подавление', 'Reduction'), min: 0, max: 18, fmt: (v) => v.toFixed(1) + ' ' + tr('дБ', 'dB') })], grDe),
      dcard(tr('Лимитер', 'Limiter'), 'ESPERION LIMIT', swL, [
        K('lim', 'gain', { label: tr('Усиление', 'Gain'), min: 0, max: 18, fmt: (v) => '+' + v.toFixed(1) + ' ' + tr('дБ', 'dB') }),
        K('lim', 'ceil', { label: tr('Потолок', 'Ceiling'), min: -12, max: 0, fmt: (v) => v.toFixed(1) + ' ' + tr('дБ', 'dB'), title: tr('Громче этого уровня звук не уйдёт', 'The sound will not go above this level') })], grLim));

    const cards2 = h('div', { class: 'vxp-dcards two' },
      dcard(tr('Шумовой гейт', 'Noise gate'), 'ESPERION GATE', swG, [
        K('gate', 'thr', { label: tr('Порог', 'Thresh'), min: -80, max: -20, fmt: (v) => v.toFixed(0) + ' ' + tr('дБ', 'dB'), title: tr('Ниже этого уровня (паузы, дыхание, шум) звук приглушается', 'Below this level (pauses, breath, noise) the sound is attenuated') }),
        K('gate', 'depth', { label: tr('Глубина', 'Depth'), min: 0, max: 60, fmt: (v) => '−' + v.toFixed(0) + ' ' + tr('дБ', 'dB') }),
        K('gate', 'att', { label: tr('Атака', 'Attack'), min: 0.5, max: 50, log: true, fmt: (v) => v.toFixed(1) + ' ' + tr('мс', 'ms') }),
        K('gate', 'hold', { label: tr('Удержание', 'Hold'), min: 0, max: 500, fmt: (v) => v.toFixed(0) + ' ' + tr('мс', 'ms'), title: tr('Сколько держать открытым после речи, чтобы не обрезать хвосты слов', 'How long to stay open after speech so word endings are not cut') }),
        K('gate', 'rel', { label: tr('Спад', 'Release'), min: 10, max: 1000, log: true, fmt: (v) => v.toFixed(0) + ' ' + tr('мс', 'ms') })], grGate),
      dcard(tr('Фон сети', 'De-hum'), 'ESPERION HUM', swH, [
        h('div', { class: 'vxp-knob' }, humSel, h('div', { class: 'vxp-klab' }, tr('Сеть', 'Mains'))),
        K('hum', 'harm', { label: tr('Гармоник', 'Harmonics'), min: 1, max: 8, step: 1, fmt: (v) => String(Math.round(v)), title: tr('Сколько кратных частот вырезать (100, 150, 200 Гц…)', 'How many multiples to notch (100, 150, 200 Hz…)') }),
        K('hum', 'q', { label: tr('Узость', 'Q'), min: 4, max: 60, log: true, fmt: (v) => v.toFixed(0), title: tr('Чем выше — тем уже вырез и меньше вред голосу', 'Higher = narrower notch, less harm to the voice') })]),
      dcard(tr('Тепло', 'Saturation'), 'ESPERION WARM', swS, [
        K('sat', 'drive', { label: tr('Нагрузка', 'Drive'), min: 0, max: 24, fmt: (v) => v.toFixed(1) + ' ' + tr('дБ', 'dB') }),
        K('sat', 'mix', { label: tr('Микс', 'Mix'), min: 0, max: 100, fmt: (v) => v.toFixed(0) + '%' }),
        K('sat', 'tone', { label: tr('Тембр', 'Tone'), min: -6, max: 6, fmt: (v) => fmtDb(v), title: tr('Наклон верхних частот после насыщения', 'High-frequency tilt after saturation') })]),
      dcard(tr('Громкость речи', 'Speech level'), 'ESPERION LEVEL', swN, [
        K('norm', 'target', { label: tr('Цель', 'Target'), min: -40, max: -6, fmt: (v) => v.toFixed(0) + ' ' + tr('дБ', 'dB'), title: tr('Средний уровень речи (RMS по звучащим участкам); паузы не учитываются', 'Average speech level (RMS over spoken parts); pauses are ignored') })]));

    // ---------- шапка, пресеты, кнопки ----------
    const presetSel = h('select', { class: 'vxp-select vxp-presetsel', title: tr('Пресет подставляет значения во все блоки: у каждого свои параметры EQ, динамики, очистки и тембра', 'A preset fills every block: each has its own EQ, dynamics, repair and tone settings') });
    let curUser = null; // id выбранного пользовательского пресета
    function fillPresets(sel) {
      presetSel.textContent = '';
      presetSel.append(h('option', { value: '' }, tr('Пресеты…', 'Presets…')));
      const groups = new Map();
      FX_PRESETS().forEach(([id, name, , g]) => { if (!groups.has(g)) groups.set(g, []); groups.get(g).push(h('option', { value: 'b:' + id }, name)); });
      groups.forEach((opts, g) => presetSel.append(h('optgroup', { label: g }, ...opts)));
      const up = userPresets();
      if (up.length) presetSel.append(h('optgroup', { label: tr('Мои пресеты', 'My presets') }, ...up.map((u) => h('option', { value: 'u:' + u.id }, u.name))));
      presetSel.value = sel || '';
      const isU = !!curUser;
      [bUpd, bRen, bDup, bDel].forEach((b) => { if (b) b.disabled = !isU; });
    }
    function refreshAll() { syncBand(); knobs.forEach((k) => k._draw()); [swC, swD, swL, swG, swH, swS, swN, humSel].forEach((s) => s._sync()); drawAll(); }
    function loadChain(c) { for (const k of CHAIN_KEYS) fx[k] = cloneJ(c[k]); refreshAll(); changed(true); }
    presetSel.addEventListener('change', () => {
      const v = presetSel.value; if (!v) return;
      if (v[0] === 'u') { const u = userPresets().find((x) => x.id === v.slice(2)); if (!u) return; curUser = u.id; loadChain(sanitizeChain(u.chain)); fillPresets(v); return; }
      const p = FX_PRESETS().find((x) => x[0] === v.slice(2)); if (!p) return;
      curUser = null; resetChain(fx); p[2](fx); fx.eq.forEach((b) => { if (b.type === 'hp') b.g = 0; });
      refreshAll(); changed(true); fillPresets(v);
    });
    const askName = (def) => { const n = (window.prompt(tr('Название пресета:', 'Preset name:'), def || '') || '').trim().slice(0, 40); return n; };
    const uid = () => 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const pbtn = (label, title, fn) => h('button', { class: 'vxp-btn small', type: 'button', title, onclick: fn }, label);
    const bNew = pbtn(tr('Сохранить как…', 'Save as…'), tr('Сохранить текущие настройки как новый пресет', 'Save the current settings as a new preset'), () => {
      const n = askName(); if (!n) return; const u = { id: uid(), name: n, chain: cloneChain(fx) }; userPresets().push(u); curUser = u.id; saveSettings(); fillPresets('u:' + u.id); toast(tr('Пресет сохранён: ', 'Preset saved: ') + n, 'ok');
    });
    const bUpd = pbtn(tr('Обновить', 'Update'), tr('Записать текущие настройки в выбранный свой пресет', 'Write the current settings into the selected custom preset'), () => {
      const u = userPresets().find((x) => x.id === curUser); if (!u) return; u.chain = cloneChain(fx); saveSettings(); toast(tr('Пресет обновлён', 'Preset updated'), 'ok');
    });
    const bRen = pbtn(tr('Переименовать', 'Rename'), '', () => { const u = userPresets().find((x) => x.id === curUser); if (!u) return; const n = askName(u.name); if (!n) return; u.name = n; saveSettings(); fillPresets('u:' + u.id); });
    const bDup = pbtn(tr('Дублировать', 'Duplicate'), '', () => { const u = userPresets().find((x) => x.id === curUser); if (!u) return; const d = { id: uid(), name: (u.name + ' ' + tr('копия', 'copy')).slice(0, 40), chain: cloneJ(u.chain) }; userPresets().push(d); curUser = d.id; saveSettings(); fillPresets('u:' + d.id); });
    const bDel = pbtn(tr('Удалить', 'Delete'), '', () => { const u = userPresets().find((x) => x.id === curUser); if (!u || !window.confirm(tr('Удалить пресет «', 'Delete preset “') + u.name + tr('»?', '”?'))) return; settings.userPresets = userPresets().filter((x) => x.id !== u.id); curUser = null; saveSettings(); fillPresets(''); });
    const bExp = pbtn(tr('Экспорт', 'Export'), tr('Скачать все свои пресеты файлом .json', 'Download all your presets as a .json file'), () => {
      const list = userPresets(); if (!list.length) return toast(tr('Нет своих пресетов для экспорта', 'No custom presets to export'), 'warn');
      const url = URL.createObjectURL(new Blob([JSON.stringify({ vxp: 'presets', v: 1, presets: list }, null, 1)], { type: 'application/json' }));
      const a = h('a', { href: url, download: 'voxalike-presets.json' }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 3000);
    });
    const fileIn = h('input', { type: 'file', accept: '.json,application/json', style: 'display:none', onchange: async () => {
      const f = fileIn.files && fileIn.files[0]; fileIn.value = ''; if (!f) return;
      try {
        if (f.size > 2e6) throw new Error('size');
        const j = JSON.parse(await f.text()); const src = Array.isArray(j) ? j : j && j.presets; if (!Array.isArray(src)) throw new Error('format');
        let n = 0; for (const it of src.slice(0, 100)) { const c = sanitizeChain(it && it.chain); if (c) { userPresets().push({ id: uid(), name: String((it && it.name) || tr('Импорт', 'Imported')).slice(0, 40), chain: c }); n++; } }
        saveSettings(); fillPresets(presetSel.value); toast(tr('Импортировано пресетов: ', 'Presets imported: ') + n, 'ok');
      } catch { toast(tr('Не удалось прочитать файл пресетов', 'Could not read the presets file'), 'err'); }
    } });
    const bAuto = h('button', { class: 'vxp-btn small primary', type: 'button', title: tr('Анализирует вашу запись (шум, фон сети, свист, «бубнёж», громкость) и подбирает настройки под неё', 'Analyses your recording (noise, hum, sibilance, boominess, level) and sets the chain to fit it'), onclick: () => {
      const m = model(); if (!m) return toast(tr('Нет записи — сначала запишите дубль', 'No take — record one first'), 'err');
      try {
        const dry = renderModel(Object.assign({}, m, { params: params(OFF()), _rk: null, _r: null }));
        const r = analyzeVoice(dry, m.sr); curUser = null; loadChain(r.chain); fillPresets('');
        toast(tr('Умная настройка: ', 'Smart setup: ') + r.notes.join(' · '), 'ok');
      } catch (e) { console.warn('[ESPERION] analyse', e); toast(tr('Не удалось проанализировать запись', 'Could not analyse the recording'), 'err'); }
    } }, tr('Умная настройка', 'Smart setup'));
    const bImp = pbtn(tr('Импорт', 'Import'), tr('Загрузить пресеты из файла .json', 'Load presets from a .json file'), () => fileIn.click());
    const presetBar = h('div', { class: 'vxp-presetbar' }, presetSel, bAuto, h('span', { class: 'vxp-sep' }), bNew, bUpd, bRen, bDup, bDel, h('span', { class: 'vxp-sep' }), bExp, bImp, fileIn);
    // A/B: две независимые настройки для быстрого сравнения на слух
    const ab = { cur: 'A', A: null, B: null };
    const abBtns = ['A', 'B'].map((k) => h('button', { class: 'vxp-seg' + (k === 'A' ? ' on' : ''), type: 'button', title: tr('Слот сравнения ', 'Comparison slot ') + k + tr(': при первом переключении копирует текущие настройки', ': first switch copies the current settings'), onclick: () => {
      if (ab.cur === k) return;
      ab[ab.cur] = cloneChain(fx); const prev = ab.cur; ab.cur = k;
      if (ab[k]) loadChain(ab[k]); else ab[k] = cloneChain(fx);
      abBtns.forEach((b) => b.classList.toggle('on', b.textContent === k)); if (player.playing) playMine(true); void prev;
    } }, k));
    const abBox = h('div', { class: 'vxp-segs', title: tr('A/B-сравнение двух вариантов настройки', 'A/B comparison of two settings') }, h('span', null, 'A/B'), ...abBtns);
    fillPresets('');
    const btnReset = h('button', { class: 'vxp-btn small', type: 'button', onclick: () => { resetChain(fx); curUser = null; fillPresets(''); refreshAll(); changed(true); } }, tr('Сбросить всё', 'Reset all'));
    const kw = W();
    const close = () => { clearTimeout(commitTimer); player.stop(); kw.removeEventListener('keydown', onKey, true); ro.disconnect(); off(); root.remove(); };
    const onKey = (e) => {
      if (e.target && /^(input|select|textarea)$/i.test(e.target.tagName) && e.key !== 'Escape') return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
      else if (e.key === ' ') { e.preventDefault(); e.stopPropagation(); playMine(true); }
      else e.stopPropagation();
    };
    kw.addEventListener('keydown', onKey, true);
    const root = h('div', { class: 'vxp-fxs', role: 'dialog', 'aria-label': 'ESPERION FX' },
      h('div', { class: 'vxp-fxcard' },
        h('div', { class: 'vxp-fxhead' }, brandBar(true), h('b', { class: 'vxp-fxtitle' }, tr('Эффекты · FX', 'Effects · FX')), abBox,
          h('div', { class: 'vxp-row', style: 'margin-left:auto' },
            h('button', { class: 'vxp-btn small primary', type: 'button', title: tr('Послушать мою дорожку с обработкой (Пробел)', 'Listen to my track with processing (Space)'), onclick: () => playMine(true) }, tr('▶ С обработкой', '▶ Processed')),
            h('button', { class: 'vxp-btn small', type: 'button', title: tr('Послушать без эквалайзера и динамики', 'Listen without EQ and dynamics'), onclick: () => playMine(false) }, tr('▶ Без неё', '▶ Bypassed')),
            btnReset, h('button', { class: 'vxp-btn icon small', type: 'button', title: tr('Закрыть (Esc)', 'Close (Esc)'), onclick: close }, '✕'))),
        presetBar, h('div', { class: 'vxp-eqwrap' }, cvEq), bandRow, cards, cards2,
        h('div', { class: 'vxp-hint' }, tr('Серая линия — звук до обработки, цветная заливка — после, белая — живой спектр при воспроизведении. Изменения сразу идут в дубль; кнопка «Без неё» только для сравнения.', 'Grey line — sound before processing, colored fill — after, white — live spectrum during playback. Changes go into the take right away; “Bypassed” is for comparison only.'))));
    hostDoc().body.append(root);
    const ro = new ResizeObserver(() => drawAll()); ro.observe(cvEq);
    const off = (() => { const f = () => { knobs.forEach((k) => k._draw()); drawAll(); }; bus.addEventListener('theme', f); return () => bus.removeEventListener('theme', f); })();
    // живой спектр и GR
    function drawAll() {
      if (!root.isConnected) return;
      if (st.ph != null && st.x) { try { st.live = spectrumAt(st.x, Math.floor(st.ph * st.sr) - 1024); } catch {} }
      drawEq();
      const tr_ = st.tr; let gc = 0, gd = 0, gl = 0, gg = 0;
      if (tr_) {
        const at = (a) => { if (!a) return 0; if (st.ph != null) { const i = Math.floor((st.ph * st.sr) / TR_STEP); let v = 0; for (let j = Math.max(0, i - 2); j <= Math.min(a.length - 1, i + 2); j++) v = Math.min(v, a[j]); return v; } let v = 0; for (const q of a) if (q < v) v = q; return v; };
        gc = at(tr_.comp); gd = at(tr_.deess); gl = at(tr_.lim); gg = at(tr_.gate);
      }
      grComp._set(gc); grDe._set(gd); grLim._set(gl); grGate._set(tr_ ? gg : 0);
    }
    refreshAll(); recompute();
    raf(drawAll);
    return root;
  }
  VXP.openFxStudio = openFxStudio;
