  /* ================================================================== */
  /*  Тосты и стили                                                      */
  /* ================================================================== */
  let toastBox = null;
  function toast(msg, kind = '') {
    const hd = hostDoc();
    if (!hd.body) return;
    if (!toastBox || !toastBox.isConnected || toastBox.ownerDocument !== hd) { toastBox = h('div', { class: 'vxp-toasts' }); hd.body.append(toastBox); }
    const t = h('div', { class: 'vxp-toast ' + kind }, msg);
    toastBox.append(t);
    setTimeout(() => t.classList.add('out'), 2600);
    setTimeout(() => t.remove(), 3000);
  }
  VXP.toast = toast;

  /* ================================================================== */
  /*  Общие виджеты: микрофон, обработка, отсчёт/буфер                   */
  /* ================================================================== */
  const widgets = new Set(); // элементы с ._sync()
  function syncWidgets() { for (const w of widgets) { if (!w.isConnected) { widgets.delete(w); continue; } try { w._sync(); } catch {} } }
  function slider({ label, min, max, step = 1, get, set, fmt, title, onCommit, def = 0 }) {
    const out = h('output');
    const range = h('input', { type: 'range', min: String(min), max: String(max), step: String(step), title });
    const show = (v) => { out.textContent = fmt(v); range.style.setProperty('--p', clamp(((v - min) / (max - min)) * 100, 0, 100) + '%'); };
    range.addEventListener('input', () => { set(+range.value, false); show(+range.value); });
    range.addEventListener('change', () => { set(+range.value, true); onCommit && onCommit(+range.value); });
    range.addEventListener('dblclick', () => { range.value = String(def); set(def, true); show(def); onCommit && onCommit(def); });
    const el = h('label', { class: 'vxp-slider', title }, h('span', null, label), range, out);
    el._sync = () => { const v = get(); if (document.activeElement !== range) range.value = String(v); show(v); };
    el._sync(); widgets.add(el);
    return el;
  }
  function checkbox({ label, get, set, title }) {
    const cb = h('input', { type: 'checkbox' });
    cb.addEventListener('change', () => { set(cb.checked); syncWidgets(); });
    const el = h('label', { class: 'vxp-check', title }, cb, label);
    el._sync = () => { cb.checked = !!get(); };
    el._sync(); widgets.add(el);
    return el;
  }
  function selectRow({ label, options, get, set, title }) {
    const sel = h('select', { class: 'vxp-select', title }, options.map(([v, t]) => h('option', { value: String(v) }, t)));
    sel.addEventListener('change', () => { set(+sel.value); saveSettings(); syncWidgets(); });
    const el = h('label', { class: 'vxp-inline', title }, h('span', null, label), sel);
    el._sync = () => { sel.value = String(get()); };
    el._sync(); widgets.add(el);
    return el;
  }
  function micControls() {
    const meter = h('div', { class: 'vxp-meter idle', title: tr('Уровень микрофона (виден во время записи)', 'Mic level (shown while recording)') }, h('i'));
    meters.add(meter);
    return h('div', { style: 'display:grid;gap:7px' },
      slider({ label: tr('🎙 Микрофон', '🎙 Microphone'), min: -12, max: 12, get: () => settings.gainDb, set: (v) => { settings.gainDb = v; applyGainAll(); saveSettings(); }, fmt: (v) => fmtSigned(v, tr('дБ', 'dB')) || tr('0 дБ', '0 dB'), title: tr('Усиление микрофона — действует сразу, даже во время записи. Двойной клик — сброс', 'Mic gain — applies instantly, even while recording. Double-click — reset') }),
      meter,
      checkbox({ label: tr('Слушать себя при записи', 'Hear myself while recording'), get: () => settings.monitorSelf, set: (v) => { settings.monitorSelf = v; saveSettings(); updateMonitorAll(); }, title: tr('Свой голос в наушниках во время записи', 'Your own voice in headphones while recording') }),
    );
  }
  function timingControls() {
    return h('div', { style: 'display:grid;gap:6px' },
      selectRow({ label: tr('Отсчёт перед записью', 'Countdown before recording'), options: [[0, tr('нет', 'none')], [3, tr('3 с', '3 s')], [5, tr('5 с', '5 s')]], get: () => settings.countdown, set: (v) => { settings.countdown = v; }, title: tr('Обратный отсчёт 3-2-1 после нажатия «Записать»', '3-2-1 countdown after you press Record') }),
      selectRow({ label: tr('Буфер после реплики', 'Buffer after the line'), options: [[0, tr('нет', 'none')], [3, tr('3 с', '3 s')], [5, tr('5 с', '5 s')], [8, tr('8 с', '8 s')]], get: () => settings.tailSec, set: (v) => { settings.tailSec = v; }, title: tr('Запись продолжается после конца реплики — опоздавшую фразу можно перетащить влево', 'Recording continues after the line ends — drag a late phrase to the left') }),
      checkbox({ label: tr('Звук отсчёта', 'Countdown beeps'), get: () => settings.countBeep, set: (v) => { settings.countBeep = v; saveSettings(); } }),
    );
  }
  /** Прослушать дубль без шумодава / с ним (для сравнения). */
  function abPlay(target, withFx) {
    const t = target(); if (!t) return toast(tr('Нет записи', 'No take'), 'err');
    if (player.playing) return player.stop();
    const m = t.model, p = { ...m.params };
    if (withFx && !p.denoise) return toast(tr('Сначала поднимите «Шумодав» выше 0', 'Raise “Denoise” above 0 first'), 'err');
    if (!withFx) p.denoise = 0;
    const x = renderModel(Object.assign({}, m, { params: p, _rk: null, _r: null }));
    player.play({ tracks: [{ samples: x, sr: m.sr, startSec: 0, gain: 1 }], dur: x.length / m.sr + 0.1 });
  }
  /** Прослушать дорожку с подменой параметров (для модулей: «с эффектом» / «без»). */
  function abPatch(target, patch) {
    const t = target(); if (!t) return toast(tr('Нет записи', 'No take'), 'err');
    if (player.playing) return player.stop();
    const m = t.model, p = Object.assign({}, m.params, patch);
    const x = renderModel(Object.assign({}, m, { params: p, _rk: null, _r: null }));
    player.play({ tracks: [{ samples: x, sr: m.sr, startSec: 0, gain: 1 }], dur: x.length / m.sr + 0.1 });
  }
  /** Выбор «движка» шумодава: обычный или нейросеть (если подключён vxp-denoise.js). */
  function nnMode(commit) {
    const opts = [['', tr('Обычный', 'Classic')], ['gtcrn', tr('Нейросеть · сильная', 'Neural · strong')], ['rnnoise', tr('Нейросеть · лёгкая', 'Neural · light')]];
    const sel = h('select', { class: 'vxp-select', title: tr('Классический шумодав хорош против ровного шума. Нейросети отличают голос от шума по звуку: сильная лучше против клавиатуры, мышки и посторонних голосов, лёгкая быстрее', 'Classic suits steady noise. Neural nets tell voice from noise by sound: strong handles keyboard, mouse and other voices, light is faster') }, opts.map(([v, t]) => h('option', { value: v }, t)));
    sel.addEventListener('change', () => {
      settings.fx.nn = sel.value; saveSettings();
      if (sel.value && !nnReady(sel.value)) {
        if (VXP.nn) { toast(tr('Нейросеть ещё загружается, пока работает обычный шумодав. Повторите через несколько секунд', 'The neural net is still loading, classic denoise is used meanwhile. Try again in a few seconds'), 'warn'); VXP.nn.load(sel.value).then(() => { if (settings.fx.nn === sel.value) commit(); }); }
        else toast(tr('Модуль нейросети (vxp-denoise.js) не подключён', 'The neural module (vxp-denoise.js) is not installed'), 'err');
      }
      commit();
    });
    const el = h('label', { class: 'vxp-inline', title: sel.title }, h('span', null, tr('Режим шумодава', 'Denoise mode')), sel);
    el._sync = () => { sel.value = settings.fx.nn || ''; };
    el._sync(); widgets.add(el);
    return el;
  }
  const fmtSemi = (v) => (v ? fmtSigned(v, tr('пт', 'st')) : '0');
  /** Обработка: target() → {model, apply()} | null */
  function fxControls(target) {
    let timer = 0;
    const commit = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const t = target(); if (!t) return;
        for (const k of FX_KEYS) t.model.params[k] = cloneJ(settings.fx[k]);
        t.apply();
      }, 60);
    };
    const set = (k) => (v, done) => { settings.fx[k] = v; if (done) { saveSettings(); commit(); } };
    const flag = (k, label, title) => checkbox({ label, get: () => settings.fx[k], set: (v) => { settings.fx[k] = v; saveSettings(); commit(); }, title });
    const fxBtn = h('button', { class: 'vxp-btn primary wide', type: 'button', title: tr('Эквалайзер со спектром, компрессор, дэ-эссер и лимитер для вашей дорожки', 'Spectrum EQ, compressor, de-esser and limiter for your track'), onclick: () => openFxStudio(target, commit) }, '🎛 ORDAX FX · ' + tr('эквалайзер и динамика', 'EQ & dynamics'));
    const lowcut = flag('lowcut', tr('Срез низов', 'Low cut'), tr('Убирает гул и стук: фильтр высоких частот 90 Гц', 'Removes rumble and thumps: 90 Hz high-pass filter'));
    const spaceSet = (patch, done) => { settings.fx.space = Object.assign({}, settings.fx.space, patch); if (done) { saveSettings(); commit(); } };
    const typeBtns = [['room', tr('Комната', 'Room')], ['hall', tr('Зал', 'Hall')], ['echo', tr('Эхо', 'Echo')]].map(([t, l]) =>
      h('button', { class: 'vxp-btn small', type: 'button', 'data-t': t, title: { room: tr('Небольшое помещение — голос «живее»', 'A small room — a livelier voice'), hall: tr('Большой зал с длинным хвостом', 'A big hall with a long tail'), echo: tr('Повторы с затухающим тоном', 'Repeats that fade and darken') }[t], onclick: () => { spaceSet({ type: t }, true); if (!settings.fx.space.mix) spaceSet({ mix: 25 }, true); syncWidgets(); } }, l));
    const spaceBox = h('div', { style: 'display:grid;gap:7px' },
      h('div', { class: 'vxp-title', style: 'cursor:default' }, h('span', null, tr('Пространство', 'Space'))),
      h('div', { class: 'vxp-row' }, ...typeBtns),
      slider({ label: tr('🌌 Количество', '🌌 Amount'), min: 0, max: 100, step: 1, def: 0, get: () => settings.fx.space.mix, set: (v, d) => spaceSet({ mix: v }, d), fmt: (v) => (v ? v + '%' : tr('выкл', 'off')), title: tr('Сколько «пространства» добавить. Двойной клик — выключить', 'How much space to add. Double-click — off') }),
      slider({ label: tr('📐 Размер', '📐 Size'), min: 0, max: 100, step: 1, def: 50, get: () => settings.fx.space.size, set: (v, d) => spaceSet({ size: v }, d), fmt: (v) => v + '%', title: tr('Размер помещения / время между повторами', 'Room size / time between repeats') }));
    spaceBox._sync = () => { const sp = settings.fx.space; typeBtns.forEach((b) => b.classList.toggle('primary', b.dataset.t === sp.type && !!sp.mix)); };
    spaceBox._sync(); widgets.add(spaceBox);
    const extraHost = h('div', { style: 'display:grid;gap:7px' });
    extraHost._fill = () => { extraHost.textContent = ''; for (const e of VXP.fxExtras) { try { extraHost.appendChild(e.build({ commit, target, ab: (patch) => abPatch(target, patch) })); } catch (er) { console.warn('[Voxalike+OrdaxEd] fx extra', er); } } };
    extraHost._fill(); fxExtraHosts.add(extraHost);
    const reset = h('button', { class: 'vxp-btn small', type: 'button', onclick: () => { settings.fx = defFx(); saveSettings(); syncWidgets(); commit(); } }, tr('Сбросить', 'Reset'));
    return h('div', { style: 'display:grid;gap:7px' },
      slider({ label: tr('🔊 Громкость', '🔊 Volume'), min: -12, max: 12, get: () => settings.fx.gain, set: set('gain'), fmt: (v) => fmtSigned(v, tr('дБ', 'dB')) || tr('0 дБ', '0 dB'), title: tr('Громкость моей дорожки (с защитой от перегруза). Двойной клик — сброс', 'Volume of my track (overload-protected). Double-click — reset') }),
      slider({ label: tr('🎚 Питч', '🎚 Pitch'), min: -12, max: 12, step: 1, get: () => settings.fx.pitch, set: set('pitch'), fmt: fmtSemi, title: tr('Высота голоса в полутонах, длительность не меняется. Двойной клик — сброс', 'Voice pitch in semitones, duration unchanged. Double-click — reset') }),
      slider({ label: tr('⏩ Скорость', '⏩ Speed'), min: 0.5, max: 2, step: 0.05, def: 1, get: () => settings.fx.speed, set: set('speed'), fmt: (v) => '×' + (+v).toFixed(2), title: tr('Темп моей дорожки: быстрее — короче, медленнее — длиннее. Высота голоса не меняется. Двойной клик — сброс', 'Tempo of my track: faster — shorter, slower — longer. Pitch unchanged. Double-click — reset') }),
      slider({ label: tr('🧹 Шумодав', '🧹 Denoise'), min: 0, max: 100, step: 5, def: 0, get: () => settings.fx.denoise, set: set('denoise'), fmt: (v) => (v ? v + '%' : tr('выкл', 'off')), title: tr('Убирает постоянный фон с готовой записи: шипение, гул, вентилятор. Двойной клик — выключить', 'Removes steady background from the finished take: hiss, hum, fan. Double-click — off') }),
      nnMode(commit),
      h('div', { class: 'vxp-row' },
        h('button', { class: 'vxp-btn small', type: 'button', title: tr('Послушать мою дорожку без шумодава (повторный клик — стоп)', 'Listen to my track without denoise (click again to stop)'), onclick: () => abPlay(target, false) }, tr('▶ Без шумодава', '▶ No denoise')),
        h('button', { class: 'vxp-btn small', type: 'button', title: tr('Послушать мою дорожку с шумодавом', 'Listen to my track with denoise'), onclick: () => abPlay(target, true) }, tr('▶ С шумодавом', '▶ With denoise'))),
      h('div', { class: 'vxp-row' }, fxBtn),
      h('div', { class: 'vxp-fxflags' }, lowcut, flag('underwater', tr('Под водой', 'Underwater'), tr('Глухой «подводный» звук с лёгким плаванием', 'Muffled “underwater” sound with a slight wobble'))),
      spaceBox,
      extraHost,
      h('div', { class: 'vxp-inline', style: 'justify-content:flex-end' }, reset),
      h('div', { class: 'vxp-hint' }, tr('Обработка применяется к записи и сохраняется для следующих дублей.', 'Processing is applied to the take and kept for the next takes.')));
  }
  const fxExtraHosts = new Set();
  const meters = new Set();
  const nrStats = new Set();
  /** Шумодав микрофона: переключатель, сила, живой индикатор подавления. */
  function nrControls() {
    return h('div', { style: 'display:grid;gap:8px' },
      profileRow(),
      h('div', { class: 'vxp-hint' }, tr('Шумодав применяется к записанному дублю: сила настраивается в обработке («Шумодав»). «Запомнить шум» делает очистку точнее.', 'Denoise is applied to the recorded take: set its strength in processing (“Denoise”). “Learn noise” makes it more precise.')));
  }
  function profileRow() {
    const info = h('div', { class: 'vxp-hint' });
    info._sync = () => { info.textContent = settings.nrProf ? tr('Профиль шума: запомнен. Шумодав знает ваш фон с первой секунды.', 'Noise profile: learned. The suppressor knows your background from the first second.') : tr('Профиль шума: нет, фон определяется автоматически (на старте чуть хуже).', 'Noise profile: none, background is detected automatically (slightly worse at the start).'); };
    info._sync(); widgets.add(info);
    const learn = h('button', { class: 'vxp-btn small', type: 'button', title: tr('Молчите 2,5 секунды: шумодав запомнит ваш фон и будет убирать его точнее. Нужен доступ к микрофону', 'Stay silent for 2.5 s: the suppressor learns your background and removes it more precisely. Needs microphone access') }, tr('🎯 Запомнить шум', '🎯 Learn noise'));
    const clear = h('button', { class: 'vxp-btn small', type: 'button', title: tr('Забыть профиль', 'Forget the profile'), onclick: () => { settings.nrProf = null; saveSettings(); audioHook.setProf && audioHook.setProf(); syncWidgets(); toast(tr('Профиль шума сброшен', 'Noise profile cleared')); } }, tr('Сбросить', 'Clear'));
    learn.addEventListener('click', async () => {
      if (learn.disabled || !audioHook.learn) return;
      learn.disabled = true;
      const label = learn.textContent;
      toast(tr('Молчите 2,5 секунды…', 'Stay silent for 2.5 s…'));
      let left = 3, t = setInterval(() => { learn.textContent = '… ' + Math.max(0, --left) + ' ' + tr('с', 's'); }, 1000);
      learn.textContent = '… 3 ' + tr('с', 's');
      try {
        const r = await audioHook.learn(2.5);
        settings.nrProf = { sr: r.sr, p: r.prof.map((v) => +v.toPrecision(4)) };
        saveSettings(); audioHook.setProf && audioHook.setProf(); syncWidgets();
        toast(tr('Шум запомнен', 'Noise learned'));
      } catch (e) { toast(tr('Не удалось: нужен доступ к микрофону', 'Failed: microphone access is required'), 'err'); console.warn('[Voxalike+OrdaxEd] learn', e); }
      clearInterval(t); learn.textContent = label; learn.disabled = false;
    });
    return h('div', { style: 'display:grid;gap:6px' }, h('div', { class: 'vxp-row' }, learn, clear), info);
  }
  function tickNR() {
    const n = audioHook.last, on = !!(n && n.nrNode);
    for (const st of nrStats) {
      if (!st.isConnected) { nrStats.delete(st); continue; }
      st.classList.toggle('on', on);
      const red = on ? clamp(n.nrRed, 0, 30) : 0;
      st.firstChild.firstChild.style.width = (red / 30 * 100) + '%';
      st.lastChild.textContent = !settings.nr ? tr('выключен', 'off') : on ? tr('подавление −', 'reduction −') + red.toFixed(1) + ' ' + tr('дБ', 'dB') : tr('включится при записи', 'starts on recording');
    }
  }
  function tickMeters() {
    tickNR();
    const lvl = meterLevel();
    for (const m of meters) {
      if (!m.isConnected) { meters.delete(m); continue; }
      m.classList.toggle('idle', lvl == null);
      if (lvl != null) { m.firstChild.style.width = clamp(Math.sqrt(lvl) * 100, 0, 100) + '%'; m.style.setProperty('--w', m.clientWidth + 'px'); }
    }
    raf(tickMeters);
  }
  raf(tickMeters);

  /* ---------- отсчёт ---------- */
  /** Показывает 3-2-1 поверх rectEl (или внутри host). Возвращает true, если не отменён. */
  function countdown(secs, { rectEl, host } = {}) {
    return new Promise((resolve) => {
      if (!secs) return resolve(true);
      const num = h('b'), el = h('div', { class: 'vxp-count' + (host ? ' in' : ''), title: tr('Клик или Esc — отмена', 'Click or Esc — cancel') }, num, h('small', null, tr('Приготовьтесь · Esc — отмена', 'Get ready · Esc — cancel')));
      if (host) host.append(el);
      else {
        const r = (rectEl && rectEl.getBoundingClientRect()) || { left: innerWidth / 2 - 150, top: innerHeight / 2 - 100, width: 300, height: 200 };
        Object.assign(el.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
        hostDoc().body.append(el);
      }
      const hd = hostDoc();
      let n = secs, timer = 0, done = false;
      const finish = (ok) => { if (done) return; done = true; wct(timer); el.remove(); hd.removeEventListener('keydown', onKey, true); resolve(ok); };
      const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); } };
      hd.addEventListener('keydown', onKey, true);
      el.addEventListener('click', () => finish(false));
      const tick = () => {
        if (n <= 0) { if (settings.countBeep) beep(1320, 0.18, 0.14); finish(true); return; }
        num.textContent = String(n);
        num.style.animation = 'none'; void num.offsetWidth; num.style.animation = '';
        if (settings.countBeep) beep(880, 0.1, 0.1);
        n--; timer = wst(tick, 1000);
      };
      tick();
    });
  }

  /* ================================================================== */
