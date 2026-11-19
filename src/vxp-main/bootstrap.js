/*!
 * ESPERION 3.0 — расширение для https://voxalike.com
 * Запись по фрагментам, FX-движок, Мастер реплики, проверка записи, пресеты.
 * Не связано с разработчиками Voxalike. Предоставляется «как есть», без гарантий.
 * Лицензии и уведомления об авторстве сторонних компонентов — в файле NOTICE.md
 * (в т.ч. исходный проект Voxalike+, MIT License · © 2026 BeshkekArt).
 *
 * Работает на оригинальных серверах: ничего не подменяет на сервере,
 * только улучшает интерфейс и логику клиента.
 *
 *  • Сцена озвучки: 2 дорожки (оригинал / моя запись), сдвиг моей дорожки,
 *    автоподгонка, прослушивание «вместе», волна в реальном времени.
 *  • Обработка: питч, громкость дорожки, срез низов, шумодав (неразрушающая).
 *  • Шумодав микрофона: спектральное вычитание в реальном времени (AudioWorklet),
 *    сила регулируется, работает при записи и в студии.
 *  • Запись: усиление микрофона, мониторинг, «слушать оригинал»,
 *    отсчёт 3-2-1, буфер после реплики (~5 с).
 *  • Сетевая игра «Совместно»: запиши все свои реплики заранее — мод
 *    отправит каждую мгновенно, когда подойдёт твоя очередь.
 *  • Chrome / Edge / Яндекс / Opera / Firefox.
 */
(() => {
  'use strict';
  if (window.__VXP__) return;
  const VERSION = '3.0.0';
  const VXP = (window.__VXP__ = { version: VERSION });
  const IS_FF = /firefox/i.test(navigator.userAgent);

  /* ================================================================== */
  /*  Утилиты                                                            */
  /* ================================================================== */
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const dbToLin = (db) => Math.pow(10, db / 20);
  const qs = (s, r = document) => r.querySelector(s);
  const qsa = (s, r = document) => [...r.querySelectorAll(s)];
  /* Окно студии: если студия вынесена в отдельное окно, документ, кадры и таймеры берём оттуда
     (фоновая вкладка игры не тормозит интерфейс студии). */
  let stageWin = null;
  const W = () => (stageWin && !stageWin.closed ? stageWin : window);
  const hostDoc = () => W().document;
  const raf = (f) => W().requestAnimationFrame(f);
  const caf = (id) => W().cancelAnimationFrame(id);
  const wst = (f, ms) => W().setTimeout(f, ms);
  const wct = (id) => W().clearTimeout(id);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  function h(tag, props, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'style') e.style.cssText = v;
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else if (v === true) e.setAttribute(k, '');
      else e.setAttribute(k, v);
    }
    for (const c of kids.flat()) {
      if (c == null || c === false) continue;
      e.append(c.nodeType ? c : document.createTextNode(String(c)));
    }
    return e;
  }
  const fmtMs = (ms) => { const r = Math.round(ms); return (r > 0 ? '+' : r < 0 ? '−' : '±') + Math.abs(r) + ' ' + tr('мс', 'ms'); };
  const fmtSigned = (v, unit) => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v) + ' ' + unit;
  const isTyping = (t) =>
    t && (t.isContentEditable || /^(textarea|select)$/i.test(t.tagName) ||
      (t.tagName === 'INPUT' && !/^(range|checkbox|button)$/i.test(t.type)));

  /* ================================================================== */
  /*  Настройки                                                          */
  /* ================================================================== */
  const SKEY = 'vxp:settings:v1';
  const cloneJ = (o) => JSON.parse(JSON.stringify(o));
  const defEq = () => [
    { type: 'hp', f: 80, g: 0, q: 0.71, on: false }, { type: 'lowshelf', f: 150, g: 0, q: 0.7, on: false },
    { type: 'bell', f: 400, g: 0, q: 1, on: false }, { type: 'bell', f: 2500, g: 0, q: 1, on: false },
    { type: 'bell', f: 6000, g: 0, q: 1.2, on: false }, { type: 'highshelf', f: 10000, g: 0, q: 0.7, on: false }];
  const defFx = () => ({
    pitch: 0, gain: 0, lowcut: false, speed: 1, underwater: false, echo: false, denoise: 0, space: { type: 'room', mix: 0, size: 50 },
    eq: defEq(), comp: { on: false, thr: -24, ratio: 3, att: 10, rel: 120, knee: 6, makeup: 0 },
    deess: { on: false, f: 6500, thr: -34, amt: 6 }, lim: { on: false, ceil: -1, gain: 0 }, vox: { on: false }, nn: '', room: { on: false },
    gate: { on: false, thr: -48, depth: 24, att: 4, hold: 80, rel: 180 }, hum: { on: false, hz: 50, harm: 4, q: 25 },
    sat: { on: false, drive: 6, mix: 70, tone: 0 }, norm: { on: false, target: -20 } });
  const settings = Object.assign(
    {
      gainDb: 0, monitorSelf: false, monitorVol: 0.8, rawMic: true,
      nr: false, nrStrength: 55, theme: 'esperion',
      studioGuide: true, guideVol: 0.55, studioPopout: false, quietSite: true,
      countdown: 3, countBeep: true, tailSec: 5,
      autoSubmit: true, notifyTurn: true, hotkeys: true, lobbyStats: true, punchReplace: true, loopPlay: false, playFromMarker: false, autoMarker: true, autoPreview: false, levelCheck: true,
      fx: defFx(),
      collapsed: {},
      charFx: {},
      lang: 'auto', // auto | ru | en
    exportTarget: 0, // 2.5: целевая громкость экспорта WAV, LUFS (0 — не менять)
    },
    (() => { try { return JSON.parse(localStorage.getItem(SKEY)) || {}; } catch { return {}; } })()
  );
  if (!settings.espMig) { settings.espMig = 1; settings.theme = 'esperion'; try { localStorage.setItem(SKEY, JSON.stringify(settings)); } catch {} }
  settings.rawMic = false; // функция «Чистый микрофон» убрана: микрофон игры не трогаем
  settings.fx = Object.assign(defFx(), settings.fx || {});
  settings.nr = false; // шумодав в реальном времени убран из интерфейса
  if (!settings.nrPostMig) { // шумодав теперь работает ПОСЛЕ записи; в реальном времени — только если включить вручную
    settings.nrPostMig = 1; settings.nr = false; if (!settings.fx.denoise) settings.fx.denoise = 40;
    try { localStorage.setItem(SKEY, JSON.stringify(settings)); } catch {}
  }
  { const d = defFx(); if (!Array.isArray(settings.fx.eq) || settings.fx.eq.length !== 6) settings.fx.eq = d.eq; for (const k of ['comp', 'deess', 'lim', 'space', 'gate', 'hum', 'sat', 'norm']) settings.fx[k] = Object.assign(d[k], settings.fx[k] || {}); if (settings.fx.echo) { settings.fx.echo = false; settings.fx.space = { type: 'echo', mix: 40, size: 25 }; } }
  /* ESPERION 3.0: оформление и анимации */
  const VE_DEF = { surface: 'graphite', glow: 60, radius: 'soft', anim: true, int: 60, speed: 100, decor: true, lite: false };
  settings.ve = Object.assign({}, VE_DEF, settings.ve || {});
  if (!settings.veMig) { settings.veMig = 1; if (settings.reduceMotion) settings.ve.lite = true; try { localStorage.setItem(SKEY, JSON.stringify(settings)); } catch {} }
  if (settings.collapsed.app === undefined) settings.collapsed.app = true;
  if (settings.collapsed.diag === undefined) settings.collapsed.diag = true;
  for (const k of ['st_rec', 'st_nr', 'st_set']) if (settings.collapsed[k] === undefined) settings.collapsed[k] = true;
  /** Язык интерфейса: 'auto' — по языку браузера (ru/uk/be/kk → русский, иначе English). */
  const curLang = () => (settings.lang === 'ru' || settings.lang === 'en' ? settings.lang
    : /^(ru|uk|be|kk)\b/i.test(navigator.language || '') ? 'ru' : 'en');
  /** tr(русский, english) — строка на текущем языке. */
  const tr = (ru, en) => (curLang() === 'en' ? en : ru);
  const saveSettings = () => { try { localStorage.setItem(SKEY, JSON.stringify(settings)); } catch {} };
  VXP.settings = settings;
  VXP.ui = {}; // внутренние точки входа интерфейса (для проверок)

  /* ================================================================== */
  /*  Темы оформления                                                    */
  /* ================================================================== */
  const THEMES = [
    ['esperion', 'ESPERION', 'ESPERION', '#8b5cf6', '#22d3ee'],
    ['ember', 'Янтарь', 'Ember', '#ff7a1a', '#ffb347'],
    ['cyan', 'Бирюза', 'Cyan', '#2fd8c2', '#6ff0de'],
    ['violet', 'Фиолет', 'Violet', '#9b6bff', '#c2a0ff'],
    ['rose', 'Роза', 'Rose', '#ff4f8b', '#ff86b0'],
    ['blue', 'Синий', 'Blue', '#3d8bff', '#7db3ff'],
    ['lime', 'Лайм', 'Lime', '#7fd100', '#b0ee4a'],
    ['gold', 'Золото', 'Gold', '#ffb020', '#ffd060'],
    ['mono', 'Моно', 'Mono', '#e8e8ee', '#ffffff'],
    ['light', 'Светлая', 'Light', '#e84d00', '#ff7a2e'],
    ['rainbow', 'Радуга', 'Rainbow', '#ff3b3b', '#ffd23b'],
  ];
  const hexRgb = (hx) => [1, 3, 5].map((i) => parseInt(hx.slice(i, i + 2), 16));
  const rgbHex = (r) => '#' + r.map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
  const hsl = (hh, ss, ll) => { const a = ss * Math.min(ll, 1 - ll), f = (n) => { const k = (n + hh / 30) % 12; return ll - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); }; return rgbHex([f(0) * 255, f(8) * 255, f(4) * 255]); };
  const LIGHT_VARS = '--vb:#f4f4f7;--v1:#ffffff;--v2:#f1f1f5;--v3:#e7e7ee;--vl:rgba(0,0,0,.1);--vl2:rgba(0,0,0,.2);--vt:#16161c;--vd:rgba(22,22,28,.62);--vtr:#d3d3dd;--vtr2:#dcdce4;--vh:#dcdce6;--vp0:#ffffff;--vp1:#f0f0f5;--vcard:#fafafc;--vov:rgba(235,235,242,.86);--vok:#0aa66a;--vw:#c77d00;--vr:#d62c3e;--vo:#5d6b80;';
  /** Текущие цвета темы (для canvas и CSS). */
  const THEME = { btn: '#fff', id: 'esperion', acc: '#8b5cf6', acc2: '#22d3ee', rgb: '139,92,246', mine: '#22d3ee', mineRGB: '34,211,238', sel: '#ffd9bf' };
  const DENSITY_CSS = {
    compact: '.vxp-panel,.vxp-studio{--vgap:6px}.vxp-btn{height:28px!important;padding:0 9px!important;font-size:11px!important;border-radius:9px!important}.vxp-panel{padding:9px!important;gap:8px!important}.vxp-sec{padding:9px!important;gap:7px!important;border-radius:14px!important}.vxp-dcard{padding:8px!important;gap:6px!important}.vxp-knob{width:60px!important}.vxp-fxcard{padding:12px!important;gap:9px!important}.vxp-title{font-size:10px!important}',
    roomy: '.vxp-btn{height:40px!important;font-size:13px!important}.vxp-panel{padding:18px!important;gap:16px!important}.vxp-sec{padding:18px!important;gap:13px!important}.vxp-dcard{padding:16px!important}.vxp-knob{width:80px!important}',
  };
  const VE_SURF = {
    graphite: '--vb:#0d0e13;--v1:#14151b;--v2:#1a1c23;--v3:#22242d;--vp0:#181a21;--vp1:#0e0f14;--vcv:#08090d;--vcard:#101117;--vtr:#2c2f3a;--vtr2:#1e2028;--vh:#292c37;--vl:rgba(255,255,255,.07);--vl2:rgba(255,255,255,.14);--vov:rgba(5,6,10,.84)',
    obsidian: '--vb:#050507;--v1:#0a0a0e;--v2:#0f1014;--v3:#16171d;--vp0:#0d0d12;--vp1:#060608;--vcv:#030304;--vcard:#08080b;--vtr:#23252d;--vtr2:#15161b;--vh:#1d1f27;--vl:rgba(255,255,255,.06);--vl2:rgba(255,255,255,.12);--vov:rgba(1,1,3,.9)',
    slate: '--vb:#0e1320;--v1:#141b2b;--v2:#1a2236;--v3:#222c44;--vp0:#182033;--vp1:#0d1220;--vcv:#080c16;--vcard:#101727;--vtr:#2b3652;--vtr2:#1c2438;--vh:#28324c;--vl:rgba(190,210,255,.09);--vl2:rgba(190,210,255,.17);--vov:rgba(5,8,16,.86)',
  };
  const VE_RAD = { sharp: 0.55, soft: 1, round: 1.4 };
  const VE_SEL = '.vxp-panel,.vxp-studio,.vxp-toasts,.vxp-count,.vxp-fxs';
  function veVars(light) {
    const v = settings.ve || VE_DEF, on = v.anim && !v.lite, sp = clamp(+v.speed || 100, 50, 200) / 100;
    return VE_SEL + '{--ve-t:' + (on ? (1 / sp).toFixed(3) : 0) + ';--ve-glow:' + (clamp(+v.glow, 0, 100) / 100).toFixed(2) + ';--ve-int:' + (on ? (clamp(+v.int, 0, 100) / 100).toFixed(2) : 0) + ';--ve-r:' + (VE_RAD[v.radius] || 1) + ';--ve-decor:' + (v.decor && on ? 'block' : 'none') + ';' + (light ? '' : (VE_SURF[v.surface] || VE_SURF.graphite)) + '}';
  }
  function veRefresh() { if (themeEl && themeEl.isConnected) themeEl.textContent = themeStyleText(); }
  function themeStyleText() {
    const light = THEME.id === 'light';
    return '.vxp-panel,.vxp-studio,.vxp-toasts,.vxp-count{--va:' + THEME.acc + ';--va2:' + THEME.acc2 + ';--va3:' + THEME.rgb + ';--vbtn:' + THEME.btn + ';' + (light ? LIGHT_VARS : '') + '}.vxp-fxs{--vbtn:' + THEME.btn + ';--va:' + THEME.acc + ';--va2:' + THEME.acc2 + ';--va3:' + THEME.rgb + '}' + veVars(light) + (DENSITY_CSS[settings.density] || '') + ((settings.reduceMotion || (settings.ve && settings.ve.lite)) ? '.vxp-panel *,.vxp-studio *,.vxp-fxs *,.vxp-toasts *{animation:none!important;transition:none!important}' : '');
  }
  function computeTheme() {
    let spec = THEMES.find((t) => t[0] === settings.theme) || THEMES[0], acc = spec[3], acc2 = spec[4];
    if (spec[0] === 'rainbow') { const hue = (Date.now() / 45) % 360; acc = hsl(hue, 1, 0.55); acc2 = hsl((hue + 28) % 360, 1, 0.65); }
    if (/^#[0-9a-f]{6}$/i.test(settings.customAcc || '') && spec[0] !== 'rainbow' && spec[0] !== 'light') {
      acc = settings.customAcc; const [r, g, b] = hexRgb(acc); acc2 = rgbHex([r + (255 - r) * 0.28, g + (255 - g) * 0.28, b + (255 - b) * 0.28]);
    }
    THEME.id = spec[0]; THEME.acc = acc; THEME.acc2 = acc2;
    THEME.rgb = hexRgb(acc).join(','); THEME.mine = acc2; THEME.mineRGB = hexRgb(acc2).join(',');
    THEME.sel = rgbHex(hexRgb(acc2).map((v) => v + (255 - v) * 0.6));
    { const [r, g, b] = hexRgb(acc); THEME.btn = (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62 ? '#10101a' : '#ffffff'; }
  }
  let themeEl = null, rainbowTimer = 0, rainbowDraw = 0;
  function applyTheme() {
    computeTheme();
    if (!themeEl || !themeEl.isConnected) { themeEl = h('style', { id: 'vxp-theme' }); (document.head || document.documentElement).append(themeEl); }
    themeEl.textContent = themeStyleText();
    clearInterval(rainbowTimer); rainbowTimer = 0;
    if (THEME.id === 'rainbow') {
      rainbowTimer = setInterval(() => {
        if (document.hidden) return;
        computeTheme(); themeEl.textContent = themeStyleText();
        if (++rainbowDraw % 6 === 0) emit('theme');
      }, 180);
    }
    emit('theme');
  }

  /** Ряд сегментных кнопок (общий для «Оформления»). */
  function segRow(label, options, get, set, title) {
    const bs = options.map(([v, tx]) => { const b = h('button', { class: 'vxp-seg', type: 'button', onclick: () => { set(v); saveSettings(); veRefresh(); syncWidgets(); } }, tx); b._v = v; return b; });
    const el = h('div', { class: 'vxp-inline', title }, h('span', null, label), h('div', { class: 'vxp-dens' }, ...bs));
    el._sync = () => bs.forEach((b) => b.classList.toggle('on', get() === b._v));
    el._sync(); widgets.add(el); return el;
  }
  const veGroup = (title, ...kids) => h('div', { class: 've-group' }, h('div', { class: 've-gt' }, title), ...kids);
  /** Раздел «Оформление»: цвет, поверхности, форма, свечение, анимации. Всё сохраняется и применяется сразу ко всем окнам. */
  function personalizeControl() {
    const ve = settings.ve, st = (k) => (v, commit) => { ve[k] = v; veRefresh(); if (commit) saveSettings(); };
    const reset = h('button', { class: 'vxp-btn small', type: 'button', title: tr('Вернуть стандартное оформление ESPERION: тема, цвета, поверхности, свечение, анимации', 'Restore the default ESPERION look'),
      onclick: () => { settings.ve = Object.assign({}, VE_DEF); Object.assign(ve, VE_DEF); settings.theme = 'esperion'; settings.customAcc = ''; settings.density = ''; settings.reduceMotion = false; saveSettings(); applyTheme(); syncWidgets(); toast(tr('Оформление сброшено', 'Look reset'), 'ok'); } }, tr('Сбросить оформление', 'Reset look'));
    const anim = checkbox({ label: tr('Анимации интерфейса', 'Interface animations'), get: () => ve.anim, set: (v) => { ve.anim = v; saveSettings(); veRefresh(); }, title: tr('Выключает все переходы и эффекты движения', 'Turns all motion off') });
    return h('div', { class: 've-pers' },
      veGroup(tr('Цвет', 'Colour'), themeControl()),
      veGroup(tr('Поверхности и форма', 'Surfaces & shape'),
        segRow(tr('Фон', 'Surface'), [['graphite', tr('Графит', 'Graphite')], ['obsidian', tr('Обсидиан', 'Obsidian')], ['slate', tr('Сланец', 'Slate')]], () => ve.surface, (v) => { ve.surface = v; }, tr('Оттенок тёмных поверхностей (в светлой теме не действует)', 'Tint of dark surfaces (not used by the light theme)')),
        segRow(tr('Углы', 'Corners'), [['sharp', tr('Строгие', 'Sharp')], ['soft', tr('Мягкие', 'Soft')], ['round', tr('Круглые', 'Round')]], () => ve.radius, (v) => { ve.radius = v; }),
        slider({ label: tr('Свечение', 'Glow'), min: 0, max: 100, step: 5, def: VE_DEF.glow, get: () => ve.glow, set: st('glow'), fmt: (v) => v + '%', title: tr('Сила свечения акцентов и панелей. Двойной клик — по умолчанию', 'Accent and panel glow strength. Double-click — default') })),
      veGroup(tr('Анимации', 'Animations'), anim,
        slider({ label: tr('Интенсивность', 'Intensity'), min: 0, max: 100, step: 5, def: VE_DEF.int, get: () => ve.int, set: st('int'), fmt: (v) => v + '%', title: tr('Амплитуда движения: подъём окон, смещение вкладок', 'Motion amplitude') }),
        slider({ label: tr('Скорость', 'Speed'), min: 50, max: 200, step: 10, def: VE_DEF.speed, get: () => ve.speed, set: st('speed'), fmt: (v) => v + '%', title: tr('Скорость переходов: выше — быстрее', 'Transition speed: higher is faster') }),
        checkbox({ label: tr('Декоративные эффекты (свечение фона)', 'Decorative effects (ambient glow)'), get: () => ve.decor, set: (v) => { ve.decor = v; saveSettings(); veRefresh(); }, title: tr('Медленно движущийся световой фон студии. Не влияет на функции', 'Slow ambient light behind the studio') }),
        checkbox({ label: tr('Упрощённый режим (без анимаций и эффектов)', 'Lite mode (no animations or effects)'), get: () => ve.lite, set: (v) => { ve.lite = v; saveSettings(); veRefresh(); }, title: tr('Для слабых компьютеров: убирает анимации и фоновые эффекты. Системная настройка «уменьшить движение» учитывается всегда', 'For slower PCs. The system “reduce motion” setting is always honoured') })),
      h('div', { class: 'vxp-row' }, reset));
  }
  VXP.ui.personalizeControl = personalizeControl;
  const themeName = (t) => tr(t[1], t[2]);
  function themeControl() {
    const box = h('div', { class: 'vxp-themes' });
    const sws = THEMES.map((t) => {
      const bg = t[0] === 'rainbow' ? 'conic-gradient(#ff3b3b,#ffd23b,#4be36a,#3dc4ff,#9b6bff,#ff3b3b)' : t[0] === 'light' ? 'linear-gradient(135deg,#ffffff 45%,' + t[3] + ' 55%)' : 'linear-gradient(135deg,' + t[3] + ',' + t[4] + ')';
      const b = h('button', { class: 'vxp-sw', type: 'button', title: themeName(t), style: 'background:' + bg, onclick: () => { settings.theme = t[0]; settings.customAcc = ''; saveSettings(); applyTheme(); syncWidgets(); } });
      b._id = t[0]; return b;
    });
    box.append(...sws);
    const pick = h('input', { type: 'color', class: 'vxp-accpick', title: tr('Свой акцентный цвет', 'Custom accent colour'), value: /^#[0-9a-f]{6}$/i.test(settings.customAcc || '') ? settings.customAcc : THEME.acc,
      oninput: () => { settings.customAcc = pick.value; applyTheme(); }, onchange: () => { settings.customAcc = pick.value; saveSettings(); applyTheme(); } });
    const rst = h('button', { class: 'vxp-btn small', type: 'button', title: tr('Вернуть цвет темы', 'Back to the theme colour'), onclick: () => { settings.customAcc = ''; saveSettings(); applyTheme(); pick.value = THEME.acc; } }, tr('Сброс', 'Reset'));
    const accRow = h('div', { class: 'vxp-inline' }, h('span', null, tr('Свой акцент', 'Custom accent')), h('span', { style: 'display:flex;gap:6px;align-items:center' }, pick, rst));
    const dens = [['compact', tr('Компакт', 'Compact')], ['', tr('Обычная', 'Normal')], ['roomy', tr('Свободная', 'Roomy')]].map(([v, t]) => {
      const b = h('button', { class: 'vxp-seg', type: 'button', onclick: () => { settings.density = v; saveSettings(); applyTheme(); syncWidgets(); } }, t); b._v = v; return b;
    });
    const rm = h('input', { type: 'checkbox', onchange: () => { settings.reduceMotion = rm.checked; saveSettings(); applyTheme(); } });
    const densRow = h('div', { class: 'vxp-inline' }, h('span', null, tr('Плотность', 'Density')), h('div', { class: 'vxp-dens' }, ...dens));
    const rmRow = h('label', { class: 'vxp-check', title: tr('Отключает переходы и анимации интерфейса: меньше нагрузка и отвлечения', 'Turns off interface transitions and animations') }, rm, tr('Меньше анимации', 'Reduce motion'));
    const el = h('div', { style: 'display:grid;gap:8px' }, h('div', { class: 'vxp-inline' }, h('span', null, tr('Тема', 'Theme'))), box, accRow, densRow);
    el._sync = () => { dens.forEach((b) => b.classList.toggle('on', (settings.density || '') === b._v)); rm.checked = !!settings.reduceMotion; sws.forEach((b) => b.classList.toggle('on', b._id === settings.theme)); try { if (document.activeElement !== pick) pick.value = /^#[0-9a-f]{6}$/i.test(settings.customAcc || '') ? settings.customAcc : THEME.acc; } catch {} };
    el._sync(); widgets.add(el);
    return el;
  }

  const bus = new EventTarget();
  const emit = (n, d) => bus.dispatchEvent(new CustomEvent(n, { detail: d }));
  const onBus = (n, f) => bus.addEventListener(n, (e) => f(e.detail));
  onBus('theme', () => { try { panel.editor && panel.editor.draw(); studio && studio.editor && studio.editor.draw(); } catch {} });
