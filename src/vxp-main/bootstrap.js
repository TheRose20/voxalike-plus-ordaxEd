/*!
 * Voxalike+OrdaxEd — редакция ORDAX для https://voxalike.com
 * Основано на Voxalike+ (https://github.com/BeshkekArt/voxalike-plus · MIT License · © 2026 BeshkekArt).
 * Изменения OrdaxEd: новый дизайн в стиле ORDAX, шумодав микрофона и дорожки,
 *   профиль шума («Запомнить шум»), сравнение до/после, панель диагностики,
 *   10 тем оформления (включая светлую и «Радугу»),
 *   ORDAX FX: эквалайзер со спектром, компрессор, дэ-эссер, лимитер, пресеты.
 * Не связан с разработчиками Voxalike. Предоставляется «как есть», без гарантий.
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
  const VERSION = '1.34.2';
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
    deess: { on: false, f: 6500, thr: -34, amt: 6 }, lim: { on: false, ceil: -1, gain: 0 }, vox: { on: false }, nn: '', room: { on: false } });
  const settings = Object.assign(
    {
      gainDb: 0, monitorSelf: false, monitorVol: 0.8, rawMic: true,
      nr: false, nrStrength: 55, theme: 'ordax',
      studioGuide: true, guideVol: 0.55, studioPopout: false, quietSite: true,
      countdown: 3, countBeep: true, tailSec: 5,
      autoSubmit: true, notifyTurn: true, hotkeys: true, lobbyStats: true, punchReplace: true, loopPlay: false, playFromMarker: false,
      fx: defFx(),
      collapsed: {},
      lang: 'auto', // auto | ru | en
    },
    (() => { try { return JSON.parse(localStorage.getItem(SKEY)) || {}; } catch { return {}; } })()
  );
  settings.rawMic = false; // функция «Чистый микрофон» убрана: микрофон игры не трогаем
  settings.fx = Object.assign(defFx(), settings.fx || {});
  settings.nr = false; // шумодав в реальном времени убран из интерфейса
  if (!settings.nrPostMig) { // шумодав теперь работает ПОСЛЕ записи; в реальном времени — только если включить вручную
    settings.nrPostMig = 1; settings.nr = false; if (!settings.fx.denoise) settings.fx.denoise = 40;
    try { localStorage.setItem(SKEY, JSON.stringify(settings)); } catch {}
  }
  { const d = defFx(); if (!Array.isArray(settings.fx.eq) || settings.fx.eq.length !== 6) settings.fx.eq = d.eq; for (const k of ['comp', 'deess', 'lim', 'space']) settings.fx[k] = Object.assign(d[k], settings.fx[k] || {}); if (settings.fx.echo) { settings.fx.echo = false; settings.fx.space = { type: 'echo', mix: 40, size: 25 }; } }
  if (!settings.flagsMig) { // кнопки «Срез низов» и «Под водой» убраны: срез низов переезжает в эквалайзер, «под водой» теперь пресет
    settings.flagsMig = 1;
    if (settings.fx.lowcut && !settings.fx.eq[0].on) Object.assign(settings.fx.eq[0], { on: true, f: 90, q: 0.71 });
    settings.fx.lowcut = false; settings.fx.underwater = false;
    try { localStorage.setItem(SKEY, JSON.stringify(settings)); } catch {}
  }
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

  /* ================================================================== */
  /*  Темы оформления                                                    */
  /* ================================================================== */
  const THEMES = [
    ['ordax', 'ORDAX', 'ORDAX', '#ff5a00', '#ff8a3d'],
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
  const THEME = { id: 'ordax', acc: '#ff5a00', acc2: '#ff8a3d', rgb: '255,90,0', mine: '#ff8a3d', mineRGB: '255,138,61', sel: '#ffd9bf' };
  function themeStyleText() {
    const light = THEME.id === 'light';
    return '.vxp-panel,.vxp-studio,.vxp-toasts,.vxp-count{--va:' + THEME.acc + ';--va2:' + THEME.acc2 + ';--va3:' + THEME.rgb + ';' + (light ? LIGHT_VARS : '') + '}.vxp-fxs{--va:' + THEME.acc + ';--va2:' + THEME.acc2 + ';--va3:' + THEME.rgb + '}';
  }
  function computeTheme() {
    let spec = THEMES.find((t) => t[0] === settings.theme) || THEMES[0], acc = spec[3], acc2 = spec[4];
    if (spec[0] === 'rainbow') { const hue = (Date.now() / 45) % 360; acc = hsl(hue, 1, 0.55); acc2 = hsl((hue + 28) % 360, 1, 0.65); }
    THEME.id = spec[0]; THEME.acc = acc; THEME.acc2 = acc2;
    THEME.rgb = hexRgb(acc).join(','); THEME.mine = acc2; THEME.mineRGB = hexRgb(acc2).join(',');
    THEME.sel = rgbHex(hexRgb(acc2).map((v) => v + (255 - v) * 0.6));
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
  const themeName = (t) => tr(t[1], t[2]);
  function themeControl() {
    const box = h('div', { class: 'vxp-themes' });
    const sws = THEMES.map((t) => {
      const bg = t[0] === 'rainbow' ? 'conic-gradient(#ff3b3b,#ffd23b,#4be36a,#3dc4ff,#9b6bff,#ff3b3b)' : t[0] === 'light' ? 'linear-gradient(135deg,#ffffff 45%,' + t[3] + ' 55%)' : 'linear-gradient(135deg,' + t[3] + ',' + t[4] + ')';
      const b = h('button', { class: 'vxp-sw', type: 'button', title: themeName(t), style: 'background:' + bg, onclick: () => { settings.theme = t[0]; saveSettings(); applyTheme(); syncWidgets(); } });
      b._id = t[0]; return b;
    });
    box.append(...sws);
    const el = h('div', { style: 'display:grid;gap:6px' }, h('div', { class: 'vxp-inline' }, h('span', null, '🎨 ' + tr('Тема', 'Theme'))), box);
    el._sync = () => sws.forEach((b) => b.classList.toggle('on', b._id === settings.theme));
    el._sync(); widgets.add(el);
    return el;
  }

  const bus = new EventTarget();
  const emit = (n, d) => bus.dispatchEvent(new CustomEvent(n, { detail: d }));
  const onBus = (n, f) => bus.addEventListener(n, (e) => f(e.detail));
  onBus('theme', () => { try { panel.editor && panel.editor.draw(); studio && studio.editor && studio.editor.draw(); } catch {} });
