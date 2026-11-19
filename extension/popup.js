// Окно расширения ESPERION: проверка микрофона (локально, без сети), справка, перезагрузка.
(function () {
  'use strict';
  var api = typeof browser !== 'undefined' && browser.runtime ? browser : chrome;
  var $ = function (id) { return document.getElementById(id); };
  var isRu = /^(ru|uk|be|kk)\b/.test((navigator.language || '').toLowerCase());
  var EN = {
    tag: 'extension for voxalike.com', open: 'Open Voxalike', tRec: 'Mic', tStudio: 'Studio', tNew: 'New', tKeys: 'Keys', tLook: 'Look',
    r30: 'ESPERION: a new look', r30a: 'Own design system: graphite layers, soft glow, new tabs, switches and sliders', r30b: '“Look” section in the studio: colour, surface, corners, glow, density', r30c: 'Configurable animations: intensity, speed, decorative effects, lite mode; the system “reduce motion” setting is honoured', r30d: 'New extension window and a new icon',
    lkAcc: 'Accent', lkCustom: 'Custom colour', lkFx: 'Glow & motion', lkGlow: 'Glow', lkAnim: 'Animations', lkLite: 'Lite mode', lkReset: 'Reset look', lkNote: 'This styles the extension window. The studio on the site is styled in the studio itself, “Look” tab.', lic: 'Licences',
    mic: 'Microphone check', idle: 'Not running', peak: 'Peak', rms: 'Level', noise: 'Noise', snr: 'Clarity', test: 'Check microphone',
    micNote: 'The check lasts 6 seconds and is fully local: audio is never sent or stored.',
    g1: 'Recording & editing', g2: 'Sound', g3: 'Check & release',
    f1h: 'Fragment recording', f1: 'Record a line in pieces, re-record and lock any fragment',
    f2h: 'Check against the original', f2: 'Shift, tempo and loudness versus the original, per fragment',
    f3h: 'Takes and phrase split', f3: 'Up to 6 takes per fragment; a recording is split at pauses',
    f4h: 'Voice processing', f4: 'EQ, compressor, de-esser, limiter, noise gate, de-hum, warmth, loudness leveling, neural denoise',
    f5h: 'Reliable recording', f5: 'Mic warm-up, gap-free timeline, disconnect detection and a complete tail',
    f6h: 'Look & feel', f6: 'Themes, custom accent, surface, corners, glow, density and configurable animations',
    f7h: 'Smart setup', f7: 'Analyses the recording and builds a matching chain',
    f8h: '20 presets + your own', f8: 'Save, update, rename, duplicate, export and import',
    f9h: 'Export loudness (LUFS)', f9: 'WAV is matched to −16 / −18 / −23 LUFS, peak never above −1 dB',
    f11h: 'Take check', f11: 'Clipping, clicks, dropouts and level jumps; marks on the track and one-click fixes',
    r29: 'Line master, clean joints', r29a: '“Line master” (G): phrases, silence, clicks, levels and a re-check in one step, undo with Ctrl+Z', r29b: 'Fixed a dip at the joint after cutting a piece in the middle of speech', r29c: '“Remove clicks” no longer promises to fix level “steps”: they are marked separately',
    f12h: 'Line master', f12: 'Phrase split, silence trim, click removal and level balance in one button, with a report', k15: 'line master',
    r28: 'Take repair, new window', r28a: '“Remove clicks” — non-destructive de-click per piece, undo with Ctrl+Z', r28b: '“Balance levels” right from the take check', r28c: 'New look for this window: groups, “What\'s new” tab, remembered tab, arrow keys',
    r27: 'Take check', r27a: '“Check take” (K): clipping, clicks, dropouts, level jumps',
    r26: 'Microphone diagnostics', r26a: 'Finds 50/60 Hz mains hum and clipping, several findings at once',
    r25: 'Export loudness', r25a: 'BS.1770 measurement and matching WAV to target LUFS',
    kg1: 'Recording', kg2: 'Editing', kg3: 'Checking',
    keysH: 'Studio hotkeys', k1: 'record / stop', k2: 'fragment effects', k3: 'marker', k4: 'fragment edges', k5: 'balance levels', k6: 'trim silence', k7: 'play', k8: 'all hotkeys', k9: 'split into phrases', k10: 'undo', k11: 'auto-align to the original', k12: 'nudge track (Shift — bigger)', k13: 'send the line', k14: 'check the take',
    reload: 'Reload extension',
    disc: 'Unofficial extension: runs on top of voxalike.com on the original servers and is not affiliated with the site\'s developers. Provided “as is”, without warranty.'
  };
  if (!isRu) {
    document.documentElement.lang = 'en';
    document.querySelectorAll('[data-i18n]').forEach(function (el) { var v = EN[el.getAttribute('data-i18n')]; if (v != null) el.textContent = v; });
  }
  var T = function (ru, en) { return isRu ? ru : en; };
  if (/[?&]full=1/.test(location.search)) document.body.classList.add('full');

  var ver = $('ver'), cur = (api.runtime.getManifest() || {}).version || '';
  if (ver && cur) ver.textContent = 'v' + cur;

  // индикатор активной вкладки
  var ind = document.querySelector('.ind');
  function placeInd() {
    var on = document.querySelector('.rail button.on'); if (!on || !ind) return;
    ind.style.height = on.offsetHeight + 'px'; ind.style.transform = 'translateY(' + (on.offsetTop - 5) + 'px)';
  }
  // вкладки: запоминаются, управляются стрелками
  var tabs = Array.prototype.slice.call(document.querySelectorAll('.rail button'));
  function showTab(name, focus) {
    var ok = tabs.some(function (b) { return b.dataset.tab === name; }); if (!ok) name = 'rec';
    tabs.forEach(function (b) { var on = b.dataset.tab === name; b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); b.tabIndex = on ? 0 : -1; if (on && focus) b.focus(); });
    document.querySelectorAll('.pane').forEach(function (p) { p.classList.toggle('on', p.id === 'pane-' + name); });
    try { localStorage.setItem('vxp_tab', name); } catch (e) {}
    placeInd();
  }
  tabs.forEach(function (b, i) {
    b.addEventListener('click', function () { showTab(b.dataset.tab); });
    b.addEventListener('keydown', function (e) {
      var d = (e.key === 'ArrowDown' || e.key === 'ArrowRight') ? 1 : (e.key === 'ArrowUp' || e.key === 'ArrowLeft') ? -1 : 0; if (!d) return;
      e.preventDefault(); showTab(tabs[(i + d + tabs.length) % tabs.length].dataset.tab, true);
    });
  });
  var lastTab = 'rec'; try { lastTab = localStorage.getItem('vxp_tab') || 'rec'; } catch (e) {}
  showTab(lastTab);

  /* ---------- оформление окна расширения (хранится локально в самом окне) ---------- */
  var LOOK_KEY = 'esperion_popup_look', LOOK_DEF = { a: '#8b5cf6', b: '#22d3ee', glow: 60, anim: true, lite: false, custom: false };
  var PRESETS = [['#8b5cf6', '#22d3ee'], ['#ff7a1a', '#ffb347'], ['#2fd8c2', '#6ff0de'], ['#ff4f8b', '#ff86b0'], ['#3d8bff', '#7db3ff'], ['#7fd100', '#b0ee4a']];
  var look = Object.assign({}, LOOK_DEF);
  try { Object.assign(look, JSON.parse(localStorage.getItem(LOOK_KEY)) || {}); } catch (e) {}
  var rgb = function (hx) { return [1, 3, 5].map(function (i) { return parseInt(hx.slice(i, i + 2), 16); }).join(','); };
  var mix = function (hx) { var c = rgb(hx).split(',').map(Number).map(function (v) { return Math.round(v + (255 - v) * 0.28).toString(16).padStart(2, '0'); }); return '#' + c.join(''); };
  function saveLook() { try { localStorage.setItem(LOOK_KEY, JSON.stringify(look)); } catch (e) {} }
  function applyLook() {
    var s = document.documentElement.style, on = look.anim && !look.lite;
    s.setProperty('--a', look.a); s.setProperty('--b', look.b); s.setProperty('--a3', rgb(look.a));
    s.setProperty('--glow', String(look.glow / 100)); s.setProperty('--t', on ? '1' : '0');
    document.body.classList.toggle('lite', !!look.lite);
    var gl = $('glow'); if (gl) gl.style.setProperty('--p', look.glow + '%');
  }
  function syncLook() {
    $('glow').value = look.glow; $('glowV').textContent = look.glow + '%'; $('anim').checked = !!look.anim; $('lite').checked = !!look.lite; $('accPick').value = look.a;
    Array.prototype.forEach.call($('swatches').children, function (b) { b.classList.toggle('on', !look.custom && b.dataset.a === look.a); b.setAttribute('aria-checked', b.classList.contains('on') ? 'true' : 'false'); });
    applyLook();
  }
  PRESETS.forEach(function (p, i) {
    var b = document.createElement('button'); b.type = 'button'; b.dataset.a = p[0]; b.setAttribute('role', 'radio'); b.title = p[0];
    b.style.background = 'linear-gradient(135deg,' + p[0] + ',' + p[1] + ')';
    b.addEventListener('click', function () { look.a = p[0]; look.b = p[1]; look.custom = false; saveLook(); syncLook(); });
    $('swatches').appendChild(b);
  });
  $('accPick').addEventListener('input', function () { look.a = this.value; look.b = mix(this.value); look.custom = true; applyLook(); });
  $('accPick').addEventListener('change', function () { saveLook(); syncLook(); });
  $('glow').addEventListener('input', function () { look.glow = +this.value; $('glowV').textContent = look.glow + '%'; applyLook(); });
  $('glow').addEventListener('change', function () { saveLook(); });
  $('anim').addEventListener('change', function () { look.anim = this.checked; saveLook(); applyLook(); });
  $('lite').addEventListener('change', function () { look.lite = this.checked; saveLook(); applyLook(); });
  $('lookReset').addEventListener('click', function () { look = Object.assign({}, LOOK_DEF); saveLook(); syncLook(); $('msg').textContent = T('Оформление сброшено', 'Look reset'); setTimeout(function () { $('msg').textContent = ''; }, 1800); });
  syncLook();
  window.addEventListener('load', placeInd);

  // перезагрузка
  var msg = $('msg');
  $('btnReload').addEventListener('click', function () {
    msg.textContent = T('Перезагружаю…', 'Reloading…');
    setTimeout(function () { api.runtime.reload(); }, 150);
  });

  /* ---------- проверка микрофона ---------- */
  var state = $('micState'), verdict = $('verdict'), btn = $('btnTest'), dev = $('dev');
  var cv = $('scope'), g = cv.getContext('2d');
  var stream = null, ctx = null, raf = 0, timer = 0, running = false;
  var db = function (x) { return x > 1e-5 ? 20 * Math.log10(x) : -100; };
  var fmt = function (d) { return d <= -99 ? '—' : d.toFixed(0) + ' dB'; };
  var setState = function (cls, txt) { state.className = 'state ' + cls; state.textContent = txt; };
  var say = function (cls, txt) { verdict.className = 'hint ' + cls; verdict.textContent = txt; };

  function fillDevices() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return Promise.resolve();
    return navigator.mediaDevices.enumerateDevices().then(function (l) {
      var prev = dev.value, ins = l.filter(function (d) { return d.kind === 'audioinput'; });
      dev.textContent = '';
      ins.forEach(function (d, i) { var o = document.createElement('option'); o.value = d.deviceId; o.textContent = d.label || T('Микрофон ', 'Microphone ') + (i + 1); dev.appendChild(o); });
      if (prev) dev.value = prev;
      dev.style.display = ins.length > 1 ? '' : 'none';
    }).catch(function () {});
  }
  dev.style.display = 'none';
  dev.addEventListener('change', function () { if (running) { stop(); start(); } });
  fillDevices();

  function stop(final) {
    cancelAnimationFrame(raf); clearTimeout(timer); running = false;
    if (stream) stream.getTracks().forEach(function (t) { t.stop(); }); stream = null;
    if (ctx) { try { ctx.close(); } catch (e) {} ctx = null; }
    btn.textContent = T('Проверить микрофон', 'Check microphone');
    $('lvl').style.width = '0';
    if (!final) setState('', T('Не запущена', 'Not running'));
  }

  /* 2.6: сетевой фон. spec — спектр в дБ (getFloatFrequencyData), n — fftSize. Возвращает { hz, excess } или null. */
  function humScore(spec, sr, n) {
    var bin = sr / n, best = null;
    [50, 60].forEach(function (f0) {
      var ex = [];
      for (var h = 1; h <= 4; h++) {
        var c = Math.round((f0 * h) / bin); if (c < 3 || c + 40 > spec.length) continue;
        var pk = -Infinity; for (var i = c - 1; i <= c + 1; i++) if (spec[i] > pk) pk = spec[i];
        var side = [], span = Math.max(3, Math.round(30 / bin)), gap = Math.max(2, Math.round(12 / bin));
        for (var j = c - span; j <= c + span; j++) if (Math.abs(j - c) > gap && j > 0 && j < spec.length) side.push(spec[j]);
        side.sort(function (a, b) { return a - b; });
        ex.push(pk - side[side.length >> 1]);
      }
      if (ex.length < 2) return;
      var m = ex.reduce(function (a, b) { return a + b; }, 0) / ex.length;
      if (!best || m > best.excess) best = { hz: f0, excess: m };
    });
    return best;
  }
  function avgSpectra(list, n) {
    var acc = new Float64Array(n), out = new Float32Array(n);
    list.forEach(function (s) { for (var i = 0; i < n; i++) acc[i] += Math.pow(10, s[i] / 10); });
    for (var k = 0; k < n; k++) out[k] = 10 * Math.log10(Math.max(1e-14, acc[k] / Math.max(1, list.length)));
    return out;
  }

  function analyse(frames) {
    // frames: массив RMS по блокам по ~50 мс и общий пик
    var r = frames.rms.slice().sort(function (a, b) { return a - b; });
    var n = r.length; if (n < 10) return null;
    var noise = r[Math.floor(n * 0.1)], loud = r[Math.floor(n * 0.9)];
    var res = { peak: db(frames.peak), rms: db(loud), noise: db(noise), snr: db(loud) - db(noise), clipped: frames.clipped || 0, hum: null };
    if (frames.spec && frames.spec.length === n && res.noise > -80) {
      var idx = r.map(function (v, i) { return i; }), q = frames.rms;
      idx.sort(function (a, b) { return q[a] - q[b]; });
      var quiet = idx.slice(0, Math.max(3, Math.floor(n * 0.3))).map(function (i) { return frames.spec[i]; });
      var hs = humScore(avgSpectra(quiet, quiet[0].length), frames.sr, 8192);
      if (hs && hs.excess >= 10) res.hum = hs;
    }
    return res;
  }

  function start() {
    var constraints = { audio: { deviceId: dev.value ? { exact: dev.value } : undefined, echoCancellation: false, noiseSuppression: false, autoGainControl: false } };
    say('', T('Запрашиваю доступ к микрофону…', 'Requesting microphone access…'));
    navigator.mediaDevices.getUserMedia(constraints).then(function (s) {
      stream = s; running = true; fillDevices();
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      var src = ctx.createMediaStreamSource(s), an = ctx.createAnalyser(); an.fftSize = 2048; src.connect(an);
      var an2 = ctx.createAnalyser(); an2.fftSize = 8192; an2.smoothingTimeConstant = 0; src.connect(an2);
      var sbuf = new Float32Array(an2.frequencyBinCount);
      var buf = new Float32Array(an.fftSize), hist = new Float32Array(160), hp = 0;
      var fr = { rms: [], peak: 0, spec: [], clipped: 0, sr: ctx.sampleRate }, held = 0, heldAt = 0, lastBlock = 0, t0 = performance.now();
      btn.textContent = T('Остановить', 'Stop');
      setState('live', T('Идёт проверка · 6 с', 'Testing · 6 s'));
      say('', T('Скажите несколько слов обычным голосом, затем помолчите.', 'Say a few words normally, then stay quiet.'));
      var W = cv.width, H = cv.height;
      var loop = function (now) {
        if (!running) return;
        an.getFloatTimeDomainData(buf);
        var pk = 0, sum = 0; for (var i = 0; i < buf.length; i++) { var v = Math.abs(buf[i]); if (v > pk) pk = v; sum += v * v; }
        var rms = Math.sqrt(sum / buf.length);
        if (now - lastBlock >= 50) { fr.rms.push(rms); lastBlock = now; an2.getFloatFrequencyData(sbuf); fr.spec.push(new Float32Array(sbuf)); }
        if (pk >= 0.995) fr.clipped++;
        if (pk > fr.peak) fr.peak = pk;
        if (pk > held || now - heldAt > 900) { held = pk; heldAt = now; }
        hist[hp = (hp + 1) % hist.length] = pk;
        $('lvl').style.width = Math.min(100, Math.pow(pk, 0.5) * 100) + '%';
        $('pk').style.left = Math.min(99, Math.pow(held, 0.5) * 100) + '%';
        $('vPeak').textContent = fmt(db(fr.peak)); $('vRms').textContent = fmt(db(rms));
        g.clearRect(0, 0, W, H);
        g.strokeStyle = 'rgba(255,255,255,.07)'; g.beginPath(); g.moveTo(0, H / 2); g.lineTo(W, H / 2); g.stroke();
        var grad = g.createLinearGradient(0, 0, W, 0); grad.addColorStop(0, look.a); grad.addColorStop(1, look.b);
        g.fillStyle = grad;
        var bw = W / hist.length;
        for (var k = 0; k < hist.length; k++) { var a = Math.min(1, Math.pow(hist[(hp + 1 + k) % hist.length], 0.55)) * (H / 2 - 2); g.fillRect(k * bw, H / 2 - a, Math.max(1, bw - 1), Math.max(1, a * 2)); }
        if (now - t0 > 6000) { finish(fr); return; }
        raf = requestAnimationFrame(loop);
      };
      var track = s.getAudioTracks()[0];
      track.addEventListener('ended', function () { if (running) { stop(); setState('err', T('Отключён', 'Disconnected')); say('r', T('Микрофон отключился во время проверки.', 'The microphone disconnected during the test.')); } });
      if (ctx.state === 'suspended') ctx.resume();
      raf = requestAnimationFrame(loop);
    }).catch(function (e) {
      stop(true);
      setState('err', T('Нет доступа', 'No access'));
      if (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) {
        say('w', T('Браузер не дал доступ из окна расширения. Откройте проверку во вкладке и разрешите микрофон.', 'The browser blocked access from the popup. Open the check in a tab and allow the microphone.'));
        if (!document.body.classList.contains('full') && api.tabs && api.tabs.create) {
          var b = document.createElement('button'); b.className = 'btn'; b.type = 'button'; b.textContent = T('Открыть во вкладке', 'Open in a tab');
          b.onclick = function () { api.tabs.create({ url: api.runtime.getURL('popup.html?full=1') }); };
          verdict.after(b);
        }
      } else if (e && e.name === 'NotFoundError') say('r', T('Микрофон не найден. Подключите устройство.', 'No microphone found. Plug one in.'));
      else if (e && e.name === 'NotReadableError') say('r', T('Микрофон занят другим приложением или недоступен.', 'The microphone is busy or unavailable.'));
      else say('r', T('Ошибка: ', 'Error: ') + (e && e.message || e));
    });
  }

  function finds(list) {
    var ul = $('finds'); if (!ul) return; ul.textContent = '';
    list.forEach(function (x) { var li = document.createElement('li'); li.className = x[0]; li.textContent = x[1]; ul.appendChild(li); });
  }
  function finish(fr) {
    var a = analyse(fr); stop(true);
    if (!a) { setState('', T('Не запущена', 'Not running')); return; }
    $('vPeak').textContent = fmt(a.peak); $('vRms').textContent = fmt(a.rms); $('vNoise').textContent = fmt(a.noise); $('vSnr').textContent = a.snr.toFixed(0) + ' dB';
    setState('', T('Готово', 'Done'));
    var f = [];
    if (a.peak < -60) { say('r', T('Звука нет: микрофон молчит или заглушён. Проверьте выбор устройства и системную громкость.', 'No signal: the mic is silent or muted. Check the device and system volume.')); finds([]); return; }
    if (a.peak > -1 || a.clipped >= 3) f.push(['r', T('Перегруз: голос «клиппит»' + (a.clipped ? ' (' + a.clipped + ' кадров)' : '') + '. Уменьшите усиление микрофона или отодвиньтесь.', 'Clipping' + (a.clipped ? ' (' + a.clipped + ' frames)' : '') + ': lower the mic gain or move back.')]);
    if (a.rms < -38) f.push(['w', T('Слишком тихо. Придвиньтесь к микрофону или добавьте усиление.', 'Too quiet. Move closer or raise the gain.')]);
    else if (a.rms > -9 && a.peak <= -1) f.push(['w', T('Громковато: запас до перегруза мал. Лучше убавить усиление.', 'A bit loud: little headroom left. Lower the gain.')]);
    if (a.hum) f.push(['w', T('Гул сети ' + a.hum.hz + ' Гц (+' + a.hum.excess.toFixed(0) + ' дБ над фоном). В студии: FX → пресет «Фон 50/60 Гц» или Де-хам.', 'Mains hum at ' + a.hum.hz + ' Hz (+' + a.hum.excess.toFixed(0) + ' dB above the floor). In the studio: FX → the 50/60 Hz preset or De-hum.')]);
    if (a.snr < 20) f.push(['w', T('Много фонового шума (чистота ' + a.snr.toFixed(0) + ' dB). Включите шумодав в студии.', 'Noisy background (clarity ' + a.snr.toFixed(0) + ' dB). Enable denoise in the studio.')]);
    $('vPeak').className = a.peak > -1 ? 'r' : ''; $('vRms').className = a.rms < -38 || a.rms > -9 ? 'w' : 'ok'; $('vSnr').className = a.snr < 15 ? 'r' : a.snr < 20 ? 'w' : 'ok';
    if (!f.length) say('ok', T('Хороший сигнал: запись можно начинать.', 'Good signal: ready to record.'));
    else say(f[0][0], f[0][1]);
    finds(f.slice(1));
  }

  btn.addEventListener('click', function () {
    var old = verdict.nextSibling; if (old && old.tagName === 'BUTTON') old.remove();
    if (running) { stop(); say('', ''); return; }
    ['vPeak', 'vRms', 'vNoise', 'vSnr'].forEach(function (i) { $(i).textContent = '—'; $(i).className = ''; }); finds([]);
    start();
  });
  window.addEventListener('pagehide', function () { stop(true); });
})();
