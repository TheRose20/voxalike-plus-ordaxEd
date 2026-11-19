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
      const g = cv.getContext('2d'), W = S * 2, c = W / 2, r = W * 0.36, a0 = Math.PI * 0.75, a1 = Math.PI * 2.25, t = to01(o.get());
      g.clearRect(0, 0, W, W); g.lineCap = 'round';
      g.lineWidth = 7; g.strokeStyle = '#2b2b33'; g.beginPath(); g.arc(c, c, r, a0, a1); g.stroke();
      g.strokeStyle = THEME.acc; g.shadowColor = THEME.acc; g.shadowBlur = 10; g.beginPath(); g.arc(c, c, r, a0, a0 + (a1 - a0) * t); g.stroke(); g.shadowBlur = 0;
      const grad = g.createRadialGradient(c - 8, c - 10, 4, c, c, r * 0.8); grad.addColorStop(0, '#34343d'); grad.addColorStop(1, '#16161b');
      g.fillStyle = grad; g.beginPath(); g.arc(c, c, r * 0.72, 0, Math.PI * 2); g.fill();
      const ang = a0 + (a1 - a0) * t; g.strokeStyle = '#fff'; g.lineWidth = 5; g.beginPath(); g.moveTo(c + Math.cos(ang) * r * 0.25, c + Math.sin(ang) * r * 0.25); g.lineTo(c + Math.cos(ang) * r * 0.62, c + Math.sin(ang) * r * 0.62); g.stroke();
      val.textContent = o.fmt(o.get());
    };
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

  const FX_PRESETS = () => [
    ['clean', tr('Чистый голос', 'Clean voice'), (f) => {
      Object.assign(f.eq[0], { on: true, f: 80 }); Object.assign(f.eq[2], { on: true, f: 280, g: -2.5, q: 1 }); Object.assign(f.eq[3], { on: true, f: 3200, g: 2, q: 0.9 }); Object.assign(f.eq[5], { on: true, f: 11000, g: 2.5 });
      Object.assign(f.comp, { on: true, thr: -22, ratio: 3, att: 12, rel: 120, knee: 8, makeup: 4 }); Object.assign(f.deess, { on: true, f: 6500, thr: -34, amt: 6 }); Object.assign(f.lim, { on: true, ceil: -1, gain: 1.5 });
    }],
    ['podcast', tr('Подкаст', 'Podcast'), (f) => {
      Object.assign(f.eq[0], { on: true, f: 90 }); Object.assign(f.eq[1], { on: true, f: 140, g: 2.5 }); Object.assign(f.eq[2], { on: true, f: 320, g: -3, q: 1.1 }); Object.assign(f.eq[3], { on: true, f: 4200, g: 3, q: 0.8 });
      Object.assign(f.comp, { on: true, thr: -26, ratio: 4, att: 8, rel: 150, knee: 6, makeup: 6 }); Object.assign(f.deess, { on: true, f: 7000, thr: -32, amt: 8 }); Object.assign(f.lim, { on: true, ceil: -1.5, gain: 3 });
    }],
    ['radio', tr('Рация / телефон', 'Radio / phone'), (f) => {
      Object.assign(f.eq[0], { on: true, f: 420 }); Object.assign(f.eq[3], { on: true, f: 1700, g: 4, q: 1.1 }); Object.assign(f.eq[5], { on: true, type: 'lp', f: 3400, q: 0.8 });
      Object.assign(f.comp, { on: true, thr: -20, ratio: 6, att: 4, rel: 90, knee: 4, makeup: 6 }); Object.assign(f.lim, { on: true, ceil: -1, gain: 3 });
    }],
    ['deess', tr('Только дэ-эссер', 'De-esser only'), (f) => { Object.assign(f.deess, { on: true, f: 6800, thr: -36, amt: 9 }); }],
  ];

  /** Окно ORDAX FX. target() → { model, apply } | null; commitFx() — применить к дублю. */
  function openFxStudio(target, commitFx) {
    if (qs('.vxp-fxs', hostDoc())) return;
    const fx = settings.fx;
    const st = { sr: 48000, inSpec: null, outSpec: null, live: null, ph: null, sel: 0, tr: null, x: null, drag: null };
    const model = () => { const t = target && target(); return t ? t.model : null; };
    const params = (patch) => { const m = model(); const p = { ...(m ? m.params : {}) }; for (const k of FX_KEYS) p[k] = cloneJ(fx[k]); return Object.assign(p, patch || {}); };
    const OFF = () => ({ eq: fx.eq.map((b) => ({ ...b, on: false })), comp: { ...fx.comp, on: false }, deess: { ...fx.deess, on: false }, lim: { ...fx.lim, on: false } });
    const knobs = [];
    const changed = (done) => { saveSettings(); if (done) { scheduleCommit(); } drawAll(); };
    let commitTimer = 0;
    function scheduleCommit() {
      clearTimeout(commitTimer);
      commitTimer = setTimeout(() => {
        try { commitFx && commitFx(); } catch (e) { console.warn('[Voxalike+OrdaxEd] fx commit', e); }
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
      } catch (e) { console.warn('[Voxalike+OrdaxEd] fx spectrum', e); }
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
    const grComp = grBar(), grDe = grBar(), grLim = grBar();
    const DEF_BY = defFx();
    const K = (grp, key, o) => { const k = knob({ get: () => fx[grp][key], set: (v, done) => { fx[grp][key] = v; changed(!!done); }, def: DEF_BY[grp][key], ...o }); knobs.push(k); return k; };
    const sw = (grp, label) => { const cb = h('input', { type: 'checkbox' }); cb.checked = !!fx[grp].on; cb.addEventListener('change', () => { fx[grp].on = cb.checked; changed(true); }); const el = h('label', { class: 'vxp-check' }, cb, label); el._sync = () => { cb.checked = !!fx[grp].on; }; return el; };
    const swC = sw('comp', tr('Вкл', 'On')), swD = sw('deess', tr('Вкл', 'On')), swL = sw('lim', tr('Вкл', 'On'));
    const dcard = (title, sub, swEl, knobsEl, gr) => h('div', { class: 'vxp-dcard' }, h('div', { class: 'vxp-dhead' }, h('div', null, h('b', null, title), h('small', null, sub)), swEl), h('div', { class: 'vxp-knobs' }, ...knobsEl), gr);
    const cards = h('div', { class: 'vxp-dcards' },
      dcard(tr('Компрессор', 'Compressor'), 'ORDAX COMP', swC, [
        K('comp', 'thr', { label: tr('Порог', 'Thresh'), min: -60, max: 0, fmt: (v) => v.toFixed(0) + ' ' + tr('дБ', 'dB'), title: tr('Выше этого уровня звук начинает сжиматься', 'Above this level the sound starts to be compressed') }),
        K('comp', 'ratio', { label: tr('Степень', 'Ratio'), min: 1, max: 20, log: true, fmt: (v) => v.toFixed(1) + ':1' }),
        K('comp', 'att', { label: tr('Атака', 'Attack'), min: 0.1, max: 100, log: true, fmt: (v) => v.toFixed(1) + ' ' + tr('мс', 'ms') }),
        K('comp', 'rel', { label: tr('Спад', 'Release'), min: 10, max: 1000, log: true, fmt: (v) => v.toFixed(0) + ' ' + tr('мс', 'ms') }),
        K('comp', 'knee', { label: tr('Колено', 'Knee'), min: 0, max: 24, fmt: (v) => v.toFixed(0) + ' ' + tr('дБ', 'dB') }),
        K('comp', 'makeup', { label: tr('Усиление', 'Makeup'), min: 0, max: 24, fmt: (v) => '+' + v.toFixed(1) })], grComp),
      dcard(tr('Дэ-эссер', 'De-esser'), 'ORDAX DE-ESS', swD, [
        K('deess', 'f', { label: tr('Частота', 'Freq'), min: 3000, max: 12000, log: true, fmt: (v) => fmtHz(v), title: tr('Где живут свистящие «с» и «ш»', 'Where the sibilant “s” and “sh” live') }),
        K('deess', 'thr', { label: tr('Порог', 'Thresh'), min: -60, max: -10, fmt: (v) => v.toFixed(0) + ' ' + tr('дБ', 'dB') }),
        K('deess', 'amt', { label: tr('Подавление', 'Reduction'), min: 0, max: 18, fmt: (v) => v.toFixed(1) + ' ' + tr('дБ', 'dB') })], grDe),
      dcard(tr('Лимитер', 'Limiter'), 'ORDAX LIMIT', swL, [
        K('lim', 'gain', { label: tr('Усиление', 'Gain'), min: 0, max: 18, fmt: (v) => '+' + v.toFixed(1) + ' ' + tr('дБ', 'dB') }),
        K('lim', 'ceil', { label: tr('Потолок', 'Ceiling'), min: -12, max: 0, fmt: (v) => v.toFixed(1) + ' ' + tr('дБ', 'dB'), title: tr('Громче этого уровня звук не уйдёт', 'The sound will not go above this level') })], grLim));

    // ---------- шапка, пресеты, кнопки ----------
    const presetSel = h('select', { class: 'vxp-select', title: tr('Готовые настройки: подставят значения во все блоки', 'Ready-made settings: fill in all blocks') }, h('option', { value: '' }, tr('Пресеты…', 'Presets…')), FX_PRESETS().map(([id, name]) => h('option', { value: id }, name)));
    function refreshAll() { syncBand(); knobs.forEach((k) => k._draw()); [swC, swD, swL].forEach((s) => s._sync()); drawAll(); }
    presetSel.addEventListener('change', () => {
      const p = FX_PRESETS().find((x) => x[0] === presetSel.value); presetSel.value = ''; if (!p) return;
      const d = defFx(); fx.eq = d.eq; fx.comp = d.comp; fx.deess = d.deess; fx.lim = d.lim; p[2](fx);
      fx.eq.forEach((b) => { if (b.type === 'hp') b.g = 0; });
      refreshAll(); changed(true);
    });
    const btnReset = h('button', { class: 'vxp-btn small', type: 'button', onclick: () => { const d = defFx(); fx.eq = d.eq; fx.comp = d.comp; fx.deess = d.deess; fx.lim = d.lim; refreshAll(); changed(true); } }, tr('Сбросить всё', 'Reset all'));
    const kw = W();
    const close = () => { clearTimeout(commitTimer); player.stop(); kw.removeEventListener('keydown', onKey, true); ro.disconnect(); off(); root.remove(); };
    const onKey = (e) => {
      if (e.target && /^(input|select|textarea)$/i.test(e.target.tagName) && e.key !== 'Escape') return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
      else if (e.key === ' ') { e.preventDefault(); e.stopPropagation(); playMine(true); }
      else e.stopPropagation();
    };
    kw.addEventListener('keydown', onKey, true);
    const root = h('div', { class: 'vxp-fxs', role: 'dialog', 'aria-label': 'ORDAX FX' },
      h('div', { class: 'vxp-fxcard' },
        h('div', { class: 'vxp-fxhead' }, brandBar(true), h('b', { class: 'vxp-fxtitle' }, 'ORDAX FX'), presetSel,
          h('div', { class: 'vxp-row', style: 'margin-left:auto' },
            h('button', { class: 'vxp-btn small primary', type: 'button', title: tr('Послушать мою дорожку с обработкой (Пробел)', 'Listen to my track with processing (Space)'), onclick: () => playMine(true) }, tr('▶ С обработкой', '▶ Processed')),
            h('button', { class: 'vxp-btn small', type: 'button', title: tr('Послушать без эквалайзера и динамики', 'Listen without EQ and dynamics'), onclick: () => playMine(false) }, tr('▶ Без неё', '▶ Bypassed')),
            btnReset, h('button', { class: 'vxp-btn icon small', type: 'button', title: tr('Закрыть (Esc)', 'Close (Esc)'), onclick: close }, '✕'))),
        h('div', { class: 'vxp-eqwrap' }, cvEq), bandRow, cards,
        h('div', { class: 'vxp-hint' }, tr('Серая линия — звук до обработки, цветная заливка — после, белая — живой спектр при воспроизведении. Изменения сразу идут в дубль; кнопка «Без неё» только для сравнения.', 'Grey line — sound before processing, colored fill — after, white — live spectrum during playback. Changes go into the take right away; “Bypassed” is for comparison only.'))));
    hostDoc().body.append(root);
    const ro = new ResizeObserver(() => drawAll()); ro.observe(cvEq);
    const off = (() => { const f = () => { knobs.forEach((k) => k._draw()); drawAll(); }; bus.addEventListener('theme', f); return () => bus.removeEventListener('theme', f); })();
    // живой спектр и GR
    function drawAll() {
      if (!root.isConnected) return;
      if (st.ph != null && st.x) { try { st.live = spectrumAt(st.x, Math.floor(st.ph * st.sr) - 1024); } catch {} }
      drawEq();
      const tr_ = st.tr; let gc = 0, gd = 0, gl = 0;
      if (tr_) {
        const at = (a) => { if (!a) return 0; if (st.ph != null) { const i = Math.floor((st.ph * st.sr) / TR_STEP); let v = 0; for (let j = Math.max(0, i - 2); j <= Math.min(a.length - 1, i + 2); j++) v = Math.min(v, a[j]); return v; } let v = 0; for (const q of a) if (q < v) v = q; return v; };
        gc = at(tr_.comp); gd = at(tr_.deess); gl = at(tr_.lim);
      }
      grComp._set(gc); grDe._set(gd); grLim._set(gl);
    }
    refreshAll(); recompute();
    raf(drawAll);
    return root;
  }
  VXP.openFxStudio = openFxStudio;

  /* ================================================================== */
  /*  Студия: запись реплик заранее                                      */
  /* ================================================================== */
