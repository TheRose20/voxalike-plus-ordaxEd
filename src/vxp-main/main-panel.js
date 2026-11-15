  const panel = { root: null, editor: null, takeRef: null, refRef: null, lastQueueSig: '', bufInfo: null };

  function section(id, title, ...body) {
    const sec = h('div', { class: 'vxp-sec' + (settings.collapsed[id] ? ' collapsed' : ''), 'data-sec': id });
    const t = h('div', { class: 'vxp-title', onclick: () => { settings.collapsed[id] = !settings.collapsed[id]; sec.classList.toggle('collapsed', settings.collapsed[id]); saveSettings(); } },
      h('span', null, title), h('span', { class: 'vxp-caret' }, '▾'));
    sec.append(t, ...body);
    return sec;
  }
  function guideCheckbox() {
    const cb = h('input', { type: 'checkbox' });
    const lab = h('label', { class: 'vxp-check' }, cb, tr('Слушать оригинал при записи', 'Hear the original while recording'));
    cb.addEventListener('change', () => {
      const nat = qs('.recording-guide-toggle');
      if (!nat || nat.disabled) { cb.checked = false; return; }
      if ((nat.getAttribute('aria-pressed') === 'true') !== cb.checked) nat.click();
    });
    lab._sync = () => {
      const nat = qs('.recording-guide-toggle'), ok = nat && !nat.disabled;
      cb.disabled = !ok; lab.classList.toggle('disabled', !ok);
      lab.title = ok ? tr('Во время записи в наушниках звучит оригинальная реплика', 'The original line plays in your headphones while recording') : tr('Сейчас недоступно (не ваш ход или режим игры не поддерживает)', 'Unavailable now (not your turn, or the game mode doesn\'t support it)');
      cb.checked = !!(nat && nat.getAttribute('aria-pressed') === 'true');
    };
    widgets.add(lab);
    return lab;
  }
  const nativeTarget = () => { const t = currentTake(); return t && t.playerAudio ? { model: nativeModel(t.playerAudio), apply: () => { applyNative(t); refreshPanel(true); } } : null; };

  function diagRows() {
    const deck = qs('.single-stage-control-deck'), rows = [];
    const add = (label, st, note) => rows.push([label, st, note || '']);
    const sess = app.session(), pack = app.pack(), take = currentTake(), mic = app.mic();
    add(tr('Панель игры', 'Game panel'), deck ? 'ok' : 'wait', deck ? '' : tr('откройте сцену озвучки', 'open the voice-over stage'));
    add(tr('Кнопка «Записать»', 'Record button'), qs('.stage-record-button') ? 'ok' : 'wait', '');
    add('React', fiberOf(deck || qs('main') || qs('#root > *')) ? 'ok' : 'bad', tr('если ✗ — сайт изменился', 'if ✗ — the site has changed'));
    add(tr('Сессия озвучки', 'Session'), sess ? 'ok' : 'wait', '');
    add(tr('Данные клипов', 'Clip data'), pack ? 'ok' : 'wait', '');
    add(tr('Микрофон игры', 'Game mic'), mic ? 'ok' : 'wait', '');
    add(tr('Мой дубль', 'My take'), take ? 'ok' : 'wait', take ? '' : tr('после записи', 'after recording'));
    add(tr('Перехват микрофона', 'Mic hook'), audioHook.nodes.size ? 'ok' : 'wait', audioHook.nodes.size ? '' : tr('при записи', 'while recording'));
    const wk = typeof AudioWorkletNode !== 'undefined' && !!(window.AudioContext || window.webkitAudioContext);
    add(tr('Шумодав (AudioWorklet)', 'Noise suppressor'), !wk ? 'bad' : (audioHook.last && audioHook.last.nrNode ? 'ok' : (settings.nr ? 'wait' : 'wait')), !wk ? tr('браузер не поддерживает', 'not supported') : settings.nr ? '' : tr('выключен', 'off'));
    add(tr('Комната (сеть)', 'Room'), room.state ? 'ok' : 'wait', '');
    return rows;
  }
  function diagControls() {
    const list = h('div', { class: 'vxp-diag' });
    const verdict = h('div', { class: 'vxp-hint' });
    let rows = [], last = 0;
    const sym = { ok: '✓', wait: '…', bad: '✗' };
    const render = () => {
      rows = diagRows();
      list.replaceChildren(...rows.map(([l, st, n]) => h('div', { class: st }, h('i'), h('span', null, l), h('span', { class: 'n' }, n))));
      const bad = rows.filter((r) => r[1] === 'bad').length;
      verdict.className = 'vxp-hint' + (bad ? ' warn' : '');
      verdict.textContent = bad ? tr('Что-то не найдено — вероятно, сайт обновился. Скопируйте отчёт и пришлите его.', 'Something was not found — the site has probably been updated. Copy the report and send it.') : tr('Всё нужное найдено (… — появится позже, это нормально).', 'Everything needed was found (… appears later, that is normal).');
    };
    const wrap = h('div', { style: 'display:grid;gap:7px' }, list, verdict,
      h('div', { class: 'vxp-row' }, h('button', { class: 'vxp-btn small', type: 'button', onclick: async () => {
        render();
        const txt = 'Voxalike+OrdaxEd v' + VERSION + '\n' + navigator.userAgent + '\n' + location.href + '\n' + rows.map(([l, st, n]) => sym[st] + ' ' + l + (n ? ' (' + n + ')' : '')).join('\n');
        try { await navigator.clipboard.writeText(txt); toast(tr('Отчёт скопирован', 'Report copied')); }
        catch { const ta = h('textarea', { style: 'position:fixed;opacity:0' }, txt); document.body.append(ta); ta.select(); try { document.execCommand('copy'); toast(tr('Отчёт скопирован', 'Report copied')); } catch {} ta.remove(); }
      } }, tr('📋 Скопировать отчёт', '📋 Copy report'))));
    wrap._sync = () => { if (wrap.closest('.vxp-sec.collapsed')) return; const now = performance.now(); if (now - last < 1500) return; last = now; render(); };
    widgets.add(wrap);
    return wrap;
  }
  function brandBar(small) {
    return h('div', { class: 'vxp-brand' + (small ? ' sm' : '') }, h('span', { class: 'vxp-logo' }), h('b', null, 'VOXALIKE+'), h('i', null, 'ORDAXED'), small ? null : h('span', { class: 'vxp-ver' }, 'v' + VERSION));
  }
  function buildPanel(deck) {
    const editor = new TrackEditor({
      onChange: () => { const t = currentTake(); if (t && t.playerAudio && panel.editor.model === takeModels.get(t.playerAudio)) applyNative(t); },
      onPlay: () => playNativeTogether(),
    });
    panel.editor = editor;
    panel.bufInfo = h('div', { class: 'vxp-hint' });
    panel.queueBox = h('div', { class: 'vxp-sec', 'data-sec': 'queue', style: 'display:none' });
    const fxPanel = fxControls(nativeTarget);
    const root = h('div', { class: 'vxp-panel', id: 'vxp-panel' },
      brandBar(false),
      section('tracks', tr('Дорожки', 'Tracks'), editor.root, panel.bufInfo),
      section('fx', tr('Обработка звука', 'Sound processing'), fxPanel.main),
      section('space', tr('Пространство', 'Space'), fxPanel.space),
      section('effector', tr('Эффектор голоса', 'Voice effector'), fxPanel.effector),
      section('pro', tr('Эквалайзер и динамика', 'EQ and dynamics'), fxPanel.pro),
      section('mic', tr('Запись', 'Recording'), micControls(), guideCheckbox(), timingControls()),
      section('nr', tr('Шумодав', 'Noise suppression'), nrControls()),
      panel.queueBox,
      section('diag', tr('Диагностика', 'Diagnostics'), diagControls()),
      section('app', tr('Настройки', 'Settings'), checkbox({ label: tr('Статистика игроков в лобби', 'Player stats in the lobby'), get: () => settings.lobbyStats, set: (v) => { settings.lobbyStats = v; saveSettings(); if (!v) qsa('.vxp-pst').forEach((x) => x.remove()); psScan(); }, title: tr('Co-op и PvP рядом с профилем игрока', 'Co-op and PvP next to the player profile') }), themeControl(), langControl(), ...VXP.settingsExtras.map((f) => { try { return f(); } catch { return null; } }), h('div', { class: 'vxp-hint' }, 'Voxalike+OrdaxEd v' + VERSION + tr(' · основано на Voxalike+ (BeshkekArt, MIT)', ' · based on Voxalike+ (BeshkekArt, MIT)'))));
    deck.append(root);
    panel.root = root;
    panel.lastQueueSig = '';
    refreshPanel(true);
  }

  function playNativeTogether() {
    if (player.playing) return player.stop();
    const ed = panel.editor;
    const startAt = ed.playStart();
    if (!ed.ref) return toast(tr('Нет оригинала', 'No original'));
    const t = currentTake();
    const tracks = [{ samples: ed.ref.samples, sr: ed.ref.sr, startSec: 0, gain: 0.55 }];
    let dur = ed.ref.samples.length / ed.ref.sr;
    if (t && t.playerAudio) { const pa = t.playerAudio; tracks.push({ samples: pa.samples, sr: pa.sampleRate, startSec: 0, gain: 1 }); dur = Math.max(dur, pa.samples.length / pa.sampleRate); }
    ed.setPlaying(true);
    player.play({ tracks, dur: dur + 0.1, startAt, onTick: (x) => { ed.playhead = x; ed.draw(); }, onEnd: () => { ed.playhead = null; ed.setPlaying(false); ed.draw(); } });
  }

  function refreshPanel(force) {
    if (!panel.root || !panel.root.isConnected) return;
    const s = app.session(), t = currentTake();
    const refObj = s && s.referenceAudio, pa = t && t.playerAudio;
    const live = nativeRec.liveView();
    if (live && (nativeRec.phase === 'rec' || nativeRec.phase === 'tail' || nativeRec.phase === 'pre')) {
      if (refObj !== panel.refRef) { panel.refRef = refObj; panel.editor.ref = refObj ? { samples: refObj.samples, sr: refObj.sampleRate } : null; }
      panel.editor.setLive(live);
    } else {
      if (panel.editor.live) { panel.editor.live = null; force = true; }
      if (force || refObj !== panel.refRef || pa !== panel.takeRef) {
        const isNew = pa && pa !== panel.takeRef && !takeModels.has(pa);
        panel.refRef = refObj; panel.takeRef = pa;
        if (player.playing) player.stop();
        if (isNew) { const m = nativeModel(pa); if (!isDefaultModel(m)) applyNative(t); }
        const m = pa ? nativeModel(pa) : null;
        panel.editor.set(refObj ? { samples: refObj.samples, sr: refObj.sampleRate } : null, m);
      }
    }
    // строка о буфере
    let info = '', warn = false;
    if (nativeRec.phase === 'tail') { info = tr('● Буфер: дописываю ещё ', '● Buffer: still recording ') + Math.max(0, Math.ceil((nativeRec.tailEnd - performance.now()) / 1000)) + tr(' с — можно продолжать говорить', ' s — you can keep talking'); warn = true; }
    else if (pa && takeModels.get(pa) && takeModels.get(pa).ext) info = tr('Буфер +', 'Buffer +') + Math.round(takeModels.get(pa).extTail) + tr(' с: опоздавшую фразу тяните влево, в светлое окно.', ' s: drag a late phrase left, into the light window.');
    else info = tr('Тяните свою дорожку мышью. В игру уходит то, что в светлом окне.', 'Drag your track with the mouse. What goes into the game is what is in the light window.');
    if (panel.bufInfo.textContent !== info) panel.bufInfo.textContent = info;
    panel.bufInfo.classList.toggle('warn', warn);
    syncWidgets();
    renderQueueBox();
  }
  onBus('native-live', () => {
    if (!panel.editor || !panel.root || !panel.root.isConnected) return;
    const live = nativeRec.liveView();
    if (live) panel.editor.setLive(live);
  });
  onBus('native-rec', () => refreshPanel(true));
  onBus('native-ext', () => { panel.takeRef = null; refreshPanel(true); toast(tr('Буфер записи добавлен к дублю', 'Recording buffer added to the take')); });

  function renderQueueBox() {
    const box = panel.queueBox; if (!box) return;
    syncRoomFromApp();
    const g = room.state && room.state.game, mine = myLines();
    if (!g || g.completedAt || !mine.length) { box.style.display = 'none'; return; }
    const sig = JSON.stringify([g.currentAssignmentIndex, g.takes.length, [...queue.entries()].map(([k, v]) => k + v.status), settings.autoSubmit, settings.collapsed.queue]);
    if (sig === panel.lastQueueSig && box.childElementCount) return;
    panel.lastQueueSig = sig;
    box.style.display = '';
    box.classList.toggle('collapsed', !!settings.collapsed.queue);
    const done = mine.filter((a) => ['sent', 'ready'].includes(lineStatus(g, a))).length;
    const cur = g.assignments[g.currentAssignmentIndex];
    const left = mine.filter((a) => ['todo', 'now'].includes(lineStatus(g, a)));
    const cb = h('input', { type: 'checkbox' }); cb.checked = settings.autoSubmit;
    cb.addEventListener('change', () => { settings.autoSubmit = cb.checked; saveSettings(); trySubmit(); });
    box.replaceChildren(
      h('div', { class: 'vxp-title', onclick: () => { settings.collapsed.queue = !settings.collapsed.queue; saveSettings(); panel.lastQueueSig = ''; renderQueueBox(); } },
        h('span', null, tr('Мои реплики', 'My lines') + ' ', h('span', { class: 'vxp-badge' }, done + '/' + mine.length)), h('span', { class: 'vxp-caret' }, '▾')),
      h('div', { class: 'vxp-status' }, cur ? (cur.playerId === myId() ? h('b', null, tr('Сейчас ваш ход', 'It\'s your turn')) : [tr('Ход: ', 'Turn: '), h('b', null, cur.playerName || tr('игрок', 'player')), tr(' · реплика ', ' · line ') + (g.currentAssignmentIndex + 1) + '/' + g.assignments.length]) : ''),
      h('div', { class: 'vxp-lines' }, mine.map((a) => {
        const st = lineStatus(g, a);
        return h('div', { class: 'vxp-line' + (st === 'now' ? ' active' : ''), title: a.caption, onclick: () => { if (st !== 'sent') openStudio(a.index); } },
          h('span', { class: 'n' }, '#' + (a.index + 1)), h('span', { class: 'c' }, a.caption || a.title || a.clipId), h('span', { class: 'vxp-chip ' + st }, statusText(st)));
      })),
      h('div', { class: 'vxp-row' },
        h('button', { class: 'vxp-btn primary wide', type: 'button', disabled: !left.length, onclick: () => openStudio(left[0] && left[0].index) }, left.length ? tr('🎙 Записать все заранее (', '🎙 Record all in advance (') + left.length + ')' : tr('✓ Все реплики готовы', '✓ All lines ready'))),
      h('label', { class: 'vxp-check', title: tr('Когда подходит ваша очередь, заранее записанная реплика отправляется сама', 'When your turn comes, a pre-recorded line is submitted automatically') }, cb, tr('Авто-отправка в мой ход', 'Auto-submit on my turn')));
  }
  onBus('queue', () => { panel.lastQueueSig = ''; renderQueueBox(); studio && studio.renderList(); });
  onBus('room', () => { renderQueueBox(); studio && studio.renderList(); });

  /* ---------- монтирование ---------- */
  let mountScheduled = false;
  function ensureMounted() {
    mountScheduled = false;
    applyTheme();
    const deck = qs('.single-stage-control-deck');
    if (deck && !qs('#vxp-panel', deck)) {
      try { buildPanel(deck); } catch (e) { console.warn('[Voxalike+OrdaxEd] panel', e); }
    } else if (deck && panel.root && deck.lastElementChild !== panel.root) {
      deck.append(panel.root); // элементы игры всегда выше панели мода
    }
    if (!deck && nativeRec.phase !== 'idle' && nativeRec.phase !== 'tail') nativeRec.reset();
  }
  // setTimeout, а не rAF: в фоновой вкладке rAF не срабатывает
  const mo = new MutationObserver(() => { if (!mountScheduled) { mountScheduled = true; setTimeout(ensureMounted, 30); } });
  const startObserver = () => { mo.observe(document.documentElement, { childList: true, subtree: true }); ensureMounted(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startObserver); else startObserver();
  setInterval(() => { try { refreshPanel(false); } catch (e) { console.warn('[Voxalike+OrdaxEd]', e); } }, 400);

  /* ================================================================== */
  /*  ORDAX FX: окно эквалайзера и динамики                              */
