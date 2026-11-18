  let studio = null;
  /* Отдельное окно студии (одного источника с игрой — поэтому доступ к микрофону и состоянию игры общий). */
  function openStagePopup() {
    let w = null;
    try { w = window.open('', 'vxp-studio-window'); } catch {}
    if (!w) return null;
    try {
      w.document.open();
      w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Voxalike+ OrdaxEd — ' + tr('студия', 'studio') + '</title></head><body style="margin:0;background:#07070a;overflow:hidden"></body></html>');
      w.document.close();
      for (const id of ['vxp-style', 'vxp-theme']) { const e = qs('#' + id); if (e) w.document.head.append(e.cloneNode(true)); }
      w.focus();
    } catch { try { w.close(); } catch {} return null; }
    return w;
  }
  /* «Тишина на сайте»: пока студия открыта, глушим чужие звуки на вкладке игры. */
  const quiet = { t: 0, saved: new Map() };
  const MUTED = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'muted');
  /* Глушим по-настоящему, но «желание» сайта запоминаем: если сайт сам включил звук, пока студия была открыта,
     после закрытия возвращаем именно его выбор, а не то, что было в момент первого глушения. */
  function quietHold(m) {
    if (quiet.saved.has(m)) return;
    let want = MUTED.get.call(m);
    try { Object.defineProperty(m, 'muted', { configurable: true, get() { return want; }, set(v) { want = !!v; } }); } catch { quiet.saved.set(m, { get: () => want, own: false }); MUTED.set.call(m, true); return; }
    quiet.saved.set(m, { get: () => want, own: true });
    MUTED.set.call(m, true);
  }
  function quietOn() {
    if (quiet.t || !settings.quietSite) return;
    const sweep = () => { for (const m of qsa('audio,video')) { if (m.closest('.vxp-studio,.vxp-panel,.vxp-fxs')) continue; quietHold(m); MUTED.set.call(m, true); } };
    sweep(); quiet.t = setInterval(sweep, 300);
  }
  function quietOff() {
    clearInterval(quiet.t); quiet.t = 0;
    for (const [m, rec] of quiet.saved) { try { if (rec.own) delete m.muted; MUTED.set.call(m, !!rec.get()); } catch {} }
    quiet.saved.clear();
  }
  VXP._quiet = { on: quietOn, off: quietOff };
  function openStudio(index, opts) {
    syncRoomFromApp();
    const g = room.state && room.state.game, pack = app.pack();
    if (!g) return toast(tr('Игра ещё не началась', 'The game hasn\'t started yet'), 'err');
    if (!pack) return toast(tr('Мод с клипами не загружен на этой странице', 'Clip data isn\'t loaded on this page'), 'err');
    if (studio) studio.close();
    const want = false; // отдельная вкладка отключена по просьбе пользователя
    let popup = null;
    if (want) {
      popup = openStagePopup();
      if (!popup) toast(tr('Браузер заблокировал новую вкладку — разрешите всплывающие окна для сайта. Открываю прямо на странице.', 'The browser blocked the new tab — allow pop-ups for this site. Opening in the page instead.'), 'err');
    }
    stageWin = popup;
    studio = new Studio(pack, popup);
    quietOn();
    studio.select(index != null ? index : (myLines()[0] || {}).index);
  }
  VXP.openStudio = openStudio;

  function studioSec(id, title, ...kids) {
    const key = 'st_' + id;
    const sec = h('div', { class: 'vxp-sec' + (settings.collapsed[key] ? ' collapsed' : '') });
    sec.append(h('div', { class: 'vxp-title', onclick: () => { settings.collapsed[key] = !settings.collapsed[key]; sec.classList.toggle('collapsed', settings.collapsed[key]); saveSettings(); } },
      h('span', null, title), h('span', { class: 'vxp-caret' }, '▾')), ...kids);
    return sec;
  }

  class Studio {
    constructor(pack, popup) {
      this.popup = popup || null; this.doc = popup ? popup.document : document;
      this.pack = pack; this.index = null; this.clip = null; this.ref = null; this.model = null; this.rec = null; this.dirty = false;
      this.saving = false; this.starting = false;
      this.video = h('video', { playsinline: true, preload: 'auto' });
      this.video.muted = true;
      this.backing = pack.backingTrackUrl ? h('audio', { preload: 'auto', src: pack.backingTrackUrl }) : null;
      this.guideEl = h('audio', { preload: 'auto' });
      this.cue = h('div', { class: 'vxp-cue' });
      this.videoBox = h('div', { class: 'vxp-video' }, this.video, this.cue);
      this.subSpeaker = h('span'); this.subText = h('p');
      this.editor = new TrackEditor({
        onChange: () => { if (this.model) this.dirty = true; this.applyLevel && this.applyLevel(); this.updateLoud && this.updateLoud(); },
        onPlay: () => this.playMine(true),
      });
      this.editor.canvas.classList.add('big');
      
      this.btnRecord = h('button', { class: 'vxp-recbtn', title: tr('Запись / стоп (клавиша R)', 'Record / stop (R key)'), type: 'button', 'aria-label': tr('Записать', 'Record'), onclick: () => this.doRecord(false) }, (() => { const NS = 'http://www.w3.org/2000/svg', s = this.doc.createElementNS(NS, 'svg'); s.setAttribute('viewBox', '0 0 48 48'); s.setAttribute('width', '100%'); s.setAttribute('height', '100%'); s.innerHTML = '<circle cx="24" cy="24" r="21" fill="none" stroke="#ee4452" stroke-width="3"/><circle class="d" cx="24" cy="24" r="14" fill="#ee4452"/><rect class="q" x="16" y="16" width="16" height="16" rx="4" fill="#ee4452"/>'; return s; })());
      this.recLbl = h('b', { class: 'vxp-reclbl-t' }, tr('Записать', 'Record'));
      this.btnRerecord = h('button', { class: 'vxp-btn vxp-tb', title: tr('Перезаписать реплику с начала (Shift+R)', 'Re-record the line from the start (Shift+R)'), type: 'button', onclick: () => this.askRerecord() }, tr('⟲ Перезаписать', '⟲ Re-record'));
      
      this.btnOrig = h('button', { class: 'vxp-btn', type: 'button', onclick: () => this.playOriginal() }, tr('▶ Оригинал', '▶ Original'));
      this.btnMine = h('button', { class: 'vxp-btn', type: 'button', onclick: () => this.playMine(false) }, tr('▶ Моя запись', '▶ My take'));
      
      this.punchInfo = h('span', { class: 'vxp-hint', style: 'align-self:center' });
      this.punchChk = checkbox({ label: tr('Заменять то, что под записью', 'Replace what is under the recording'), get: () => settings.punchReplace, set: (v) => { settings.punchReplace = v; saveSettings(); }, title: tr('Вкл — старый звук под новым куском вырезается; выкл — новый кусок накладывается сверху', 'On — the old sound under the new piece is cut out; off — the new piece is layered on top') });
      this.punchRow = h('div', { class: 'vxp-punch' }, h('div', { class: 'vxp-recrow' }, h('div', { class: 'vxp-reclbl' }, this.recLbl, this.punchInfo), this.btnRerecord));
      
      this.editor.onMarker = () => this.updateButtons();
      this.btnSave = h('button', { class: 'vxp-btn primary wide big', title: tr('Отправить в очередь и перейти к следующей реплике (Enter)', 'Queue it and go to the next line (Enter)'), type: 'button', onclick: () => this.save(true) }, tr('✓ Сохранить → далее', '✓ Save → next'));
      this.btnDel = h('button', { class: 'vxp-btn', type: 'button', title: tr('Удалить из очереди', 'Remove from queue'), onclick: () => this.remove() }, '🗑');
      // нижняя часть студии по референсу (только студия: редактор на странице не меняется)
      { const ed = this.editor, btn = (cls, ic, txt, title, fn) => h('button', { class: 'vxp-btn ' + cls, type: 'button', title, onclick: fn }, ic ? svgIcon(ic) : null, txt || null);
        this.timeEl = h('span', { class: 'vxp-time' }, '0:00.0 / 0:00.0');
        ed.hideTags = true; this.src = 'mine';
        this.laneO = h('button', { class: 'vxp-lane o', type: 'button', onclick: () => this.setSrc('orig') }, h('i'), tr('Оригинал', 'Original'));
        this.laneM = h('button', { class: 'vxp-lane m on', type: 'button', onclick: () => this.setSrc('mine') }, h('i'), tr('Моя запись', 'My take'));
        // скрытые носители логики: кнопки «Оригинал» и «Моя запись» продолжают управлять воспроизведением
        this.loudO = h('span', { class: 'vxp-loud o' }); this.loudM = h('span', { class: 'vxp-loud m' });
        this.btnOrig.style.display = 'none'; this.btnMine.style.display = 'none';
        this.tPlay = h('button', { class: 'vxp-btn vxp-tplay', type: 'button', onclick: () => (this.src === 'orig' ? this.btnOrig : this.btnMine).click() });
        const syncPlay = () => {
          const stop = /■/.test(this.btnOrig.textContent + this.btnMine.textContent);
          this.tPlay.replaceChildren(svgIcon(stop ? 'stop' : 'play')); this.tPlay.classList.toggle('playing', stop);
          this.tPlay.disabled = (this.src === 'orig' ? this.btnOrig : this.btnMine).disabled && !stop;
          this.tPlay.title = this.src === 'orig' ? tr('Играть оригинал', 'Play the original') : tr('Играть мою запись', 'Play my take');
        };
        this.syncPlay = syncPlay;
        new MutationObserver(syncPlay).observe(this.btnOrig, { childList: true, characterData: true, subtree: true, attributes: true });
        new MutationObserver(syncPlay).observe(this.btnMine, { childList: true, characterData: true, subtree: true, attributes: true });
        syncPlay();
        ed.btnCut.className = 'vxp-btn vxp-tb'; ed.btnCut.replaceChildren(svgIcon('cut'), tr('Обрезать', 'Cut'));
        ed.btnDel.className = 'vxp-btn vxp-tb'; ed.btnDel.replaceChildren(svgIcon('trash'), tr('Удалить', 'Delete'));
        ed.btnUndo.className = 'vxp-btn vxp-tb ico'; ed.btnUndo.replaceChildren(svgIcon('undo'));
        ed.btnReset.className = 'vxp-btn vxp-tb ico'; ed.btnReset.replaceChildren(svgIcon('reset'));
        ed.btnAuto.className = 'vxp-btn vxp-tb'; ed.btnAuto.replaceChildren(svgIcon('sync'), tr('Авто', 'Auto'));
        const bp = ed.btnPlay; bp.className = 'vxp-btn vxp-tb'; bp.title = tr('Оригинал и моя запись вместе', 'Original and my take together');
        ed.setPlaying = (p) => bp.replaceChildren(svgIcon(p ? 'stop' : 'phones'), p ? tr('Стоп', 'Stop') : tr('Слушать вместе', 'Listen together'));
        ed.setPlaying(false);
        const toStart = btn('vxp-tb ico', 'skipb', '', tr('Метку в начало', 'Marker to start'), () => { ed.marker = 0; ed.draw(); ed.onMarker && ed.onMarker(); });
        const toEnd = btn('vxp-tb ico', 'skipf', '', tr('Метку в конец', 'Marker to end'), () => { ed.marker = this.clip ? this.clipDur() : 0; ed.draw(); ed.onMarker && ed.onMarker(); });
        this.nudgePop = h('div', { class: 'vxp-nudgepop' }, h('div', { class: 'vxp-tgrp' }, ed.btnNudgeL, ed.label, ed.btnNudgeR), ed.playOpts, this.punchChk, this.btnCueClr, checkbox({ label: tr('Выравнивать громкость', 'Auto-level volume'), get: () => settings.autoLevel, set: (v) => { settings.autoLevel = v; saveSettings(); this.applyLevel(); this.updateLoud(); }, title: tr('Подгоняет среднюю громкость моей записи под среднюю громкость оригинала (при записи и сохранении)', 'Matches the average loudness of my take to the original') }));
        ed.onCues = (arr) => { try { const s = settings.cues = settings.cues || {}; if (this.clip) { if (arr.length) s[this.clip.id] = arr; else delete s[this.clip.id]; const ks = Object.keys(s); if (ks.length > 80) delete s[ks[0]]; saveSettings(); } } catch {} };
        this.btnCue = btn('vxp-tb', 'flag', '', tr('Метка в текущей точке (M). Двойной клик по линейке — тоже. Рядом с меткой — убирает', 'Marker at the current point (M). Double-click the ruler too. Near a marker — removes it'), () => this.addCue());
        this.btnCueClr = h('button', { class: 'vxp-btn small', type: 'button', onclick: () => ed.clearCues() }, tr('Убрать все метки', 'Clear all markers'));
        const gear = btn('vxp-tb ico', 'cog', '', tr('Сдвиг, зацикливание, воспроизведение с метки', 'Shift, loop, play from marker'), () => this.nudgePop.classList.toggle('open'));
        this.doc.addEventListener('mousedown', (e) => { if (this.nudgePop.classList.contains('open') && !e.target.closest('.vxp-nudgewrap')) this.nudgePop.classList.remove('open'); }, true);
        const draw0 = ed.draw.bind(ed); ed.draw = () => { draw0(); this.updateTime(); };
        ed.root.replaceChildren(
          h('div', { class: 'vxp-wavebox' }, ed.canvas, this.laneO, this.loudO, this.laneM, this.loudM, this.timeEl),
          h('div', { class: 'vxp-transport' },
            h('div', { class: 'vxp-tgrp' }, ed.btnCut, this.btnCue, ed.btnDel, ed.btnUndo, ed.btnReset),
            h('i', { class: 'vxp-sep' }),
            h('div', { class: 'vxp-tgrp' }, this.btnRecord, toStart, this.tPlay, toEnd),
            h('i', { class: 'vxp-sep' }),
            h('div', { class: 'vxp-tgrp' }, ed.btnAuto, bp, h('div', { class: 'vxp-nudgewrap' }, gear, this.nudgePop)))); }
      this.title = h('h3'); this.kicker = h('small', { class: 'vxp-cnt', title: tr('Записано реплик из всех ваших', 'Lines recorded out of all yours') });
      this.stepEls = [tr('Запиши', 'Record'), tr('Послушай', 'Listen'), tr('Сохрани', 'Save')].map((t, i) => h('div', { class: 'vxp-step' }, h('b', null, String(i + 1)), t));
      this.steps = h('div', { class: 'vxp-steps' }, ...this.stepEls);
      this.btnPrev = h('button', { class: 'vxp-btn', type: 'button', title: tr('Предыдущая моя реплика', 'Previous line of mine'), onclick: () => this.go(-1) }, tr('◀ Назад', '◀ Prev'));
      this.btnNext = h('button', { class: 'vxp-btn', type: 'button', title: tr('Следующая моя реплика', 'Next line of mine'), onclick: () => this.go(1) }, tr('Дальше ▶', 'Next ▶'));
      this.navMid = h('div', { class: 'vxp-navmid' });
      this.navRow = h('div', { class: 'vxp-navrow' }, this.btnPrev, this.navMid, this.btnNext);
      this.list = h('div', { class: 'vxp-lines' });
      this.chatSlot = h('div', { class: 'vxp-chatslot' });
      this.chatBadge = h('i', { class: 'vxp-chbadge' });
      this.chatFab = h('button', { class: 'vxp-chfab', type: 'button', title: tr('Чат комнаты', 'Room chat'), 'aria-label': tr('Чат комнаты', 'Room chat'), onclick: () => this.toggleChat() }, svgIcon('chat'), this.chatBadge);
      this.chatDock = h('div', { class: 'vxp-chatdock' + (settings.studioChat ? ' open' : '') },
        h('div', { class: 'vxp-chpanel' },
          h('div', { class: 'vxp-chhead' }, svgIcon('chat'), h('b', null, tr('Чат комнаты', 'Room chat')),
            h('button', { class: 'vxp-chmin', type: 'button', title: tr('Свернуть', 'Collapse'), 'aria-label': tr('Свернуть', 'Collapse'), onclick: () => this.toggleChat(false) }, '–')),
          this.chatSlot),
        this.chatFab);
      const guide = checkbox({ label: tr('Слушать оригинал при записи', 'Hear the original while recording'), get: () => settings.studioGuide, set: (v) => { settings.studioGuide = v; saveSettings(); }, title: 'Нужны наушники' });
      const fx = fxControls(() => this.model ? { model: this.model, apply: () => { this.dirty = true; this.refreshEditor(); } } : null);
      this.root = h('div', { class: 'vxp-studio', role: 'dialog', 'aria-label': tr('Запись реплик заранее', 'Record lines in advance') },
        h('div', { class: 'vxp-card' },
          h('div', { class: 'vxp-card-head' },
            h('div', { class: 'vxp-headl' }, brandLogo('head')),
            h('div', { class: 'vxp-row' },
              h('button', { class: 'vxp-btn icon', type: 'button', title: tr('Закрыть (Esc)', 'Close (Esc)'), onclick: () => this.close() }, '✕'))),
          h('div', { class: 'vxp-left' }, brandLogo('side'),
            h('div', { class: 'vxp-sec' }, h('div', { class: 'vxp-title' }, h('span', null, tr('Мои реплики', 'My lines')), this.kicker), this.list)),
          h('div', { class: 'vxp-stagebox' },
            this.navRow,
            this.videoBox,
            h('div', { class: 'vxp-sub' }, this.subSpeaker, this.subText),
            this.editor.root,
            this.punchRow,
            h('div', { class: 'vxp-saverow' }, this.btnSave, this.btnDel),
            h('details', { class: 'vxp-keys' }, h('summary', null, svgIcon('keys'), tr('Горячие клавиши', 'Hotkeys')), h('p', null, tr('Клавиши: R — запись/стоп · Shift+R — перезапись · M — метка-ориентир · Пробел — моя запись · Enter — сохранить и далее · [ ] — сдвиг · A — авто · Esc — закрыть', 'Keys: R — record/stop · Shift+R — re-record · Space — my take · Enter — save and next · [ ] — shift · A — auto · Esc — close')))),
          h('div', { class: 'vxp-side' },
            h('div', { class: 'vxp-sec' }, h('div', { class: 'vxp-title' }, h('span', null, tr('Обработка звука', 'Sound processing'))), fx.main),
            studioSec('space', tr('Пространство', 'Space'), fx.space),
            studioSec('effector', tr('Эффектор голоса', 'Voice effector'), fx.effector),
            studioSec('pro', tr('Эквалайзер и динамика', 'EQ and dynamics'), fx.pro),
            studioSec('rec', tr('Запись', 'Recording'), micControls(), guide, timingControls()),
            studioSec('set', tr('Настройки', 'Settings'),
              checkbox({ label: tr('Тишина на сайте, пока студия открыта', 'Silence the site while the studio is open'), get: () => settings.quietSite, set: (v) => { settings.quietSite = v; saveSettings(); v ? quietOn() : quietOff(); }, title: tr('Глушит чужие аудио и видео на вкладке игры (звук из игры через Web Audio не затрагивается)', 'Mutes other audio/video on the game tab (Web Audio output of the game is not affected)') }),
              themeControl(), langControl()),
            h('div', { class: 'vxp-sec' }, h('div', { class: 'vxp-hint' },
              tr('Записанные реплики ждут в очереди и отправляются сами, как только подходит ваш ход. Очередь сохраняется на диск и переживает F5, но вкладку лучше не закрывать до конца игры.', 'Recorded lines wait in the queue and are sent automatically when your turn comes. The queue is kept on disk and survives F5, but keep the tab open until the game ends.'))))));
      this.keyHandler = (e) => this.onKey(e);
      this.doc.addEventListener('keydown', this.keyHandler, true);
      this.root.append(this.chatDock);
      this.doc.body.append(this.root);
      if (!this.popup) this.dockChat();
      if (this.popup) {
        this.themeSync = setInterval(() => { try { const a = qs('#vxp-theme'), b = this.doc.getElementById('vxp-theme'); if (a && b && b.textContent !== a.textContent) b.textContent = a.textContent; } catch {} }, 400);
        this.popup.addEventListener('pagehide', () => { if (studio === this && !this.closing) this.close(); });
        this.popup.addEventListener('focus', () => {});
      }
      this.renderList();
    }
    moveTo(popout) {
      const idx = this.index;
      if (this.dirty && this.model) this.save(false);
      this.close();
      openStudio(idx, { popout });
    }
    /** Родной чат комнаты Voxalike (aside.room-chat-panel внутри .in-game-room-chat) переносим в студию целиком (React-узел не пересоздаём), при закрытии возвращаем на место. */
    dockChat(tries = 0) {
      try {
        if (this.closing || this.chatNode) return;
        const chat = document.querySelector('.in-game-room-chat .room-chat-panel') || document.querySelector('.room-chat-panel');
        if (!chat) {
          // чат свёрнут и не отрисован: нажимаем родную кнопку «Чат комнаты» и пробуем ещё раз
          if (tries === 0) { const t = [...document.querySelectorAll('.in-game-room-chat-actions button')].find((b) => /чат|chat/i.test(b.textContent || '')); if (t) t.click(); }
          if (tries < 8) this.chatTimer = setTimeout(() => this.dockChat(tries + 1), 150);
          return;
        }
        if (this.root.contains(chat)) return;
        this.chatHome = document.createComment('vxp-room-chat');
        chat.replaceWith(this.chatHome);
        this.chatNode = chat;
        this.chatSlot.append(chat);
        if (!chat.classList.contains('open')) { const lb = chat.querySelector('.room-chat-label'); if (lb) lb.click(); }
        this.chatDock.classList.add('has');
        this.chatSeen = chat.querySelectorAll('.room-chat-message').length;
        this.chatObs = new MutationObserver(() => this.chatUnread());
        this.chatObs.observe(chat, { childList: true, subtree: true });
      } catch (e) { console.warn('[Voxalike+OrdaxEd] chat dock', e); }
    }
    chatUnread() {
      const n = this.chatNode ? this.chatNode.querySelectorAll('.room-chat-message').length : 0;
      if (this.chatDock.classList.contains('open')) { this.chatSeen = n; this.chatBadge.textContent = ''; this.chatFab.classList.remove('new'); return; }
      const u = Math.max(0, n - (this.chatSeen || 0));
      this.chatBadge.textContent = u > 99 ? '99+' : u ? String(u) : '';
      this.chatFab.classList.toggle('new', u > 0);
    }
    toggleChat(open) {
      const on = open == null ? !this.chatDock.classList.contains('open') : open;
      this.chatDock.classList.toggle('open', on);
      settings.studioChat = on; saveSettings();
      this.chatUnread();
      if (on) { const m = this.chatNode && this.chatNode.querySelector('.room-chat-messages'); if (m) m.scrollTop = m.scrollHeight; }
    }
    undockChat() {
      clearTimeout(this.chatTimer);
      try { this.chatObs && this.chatObs.disconnect(); } catch {}
      try {
        if (this.chatNode && this.chatHome && this.chatHome.parentNode) this.chatHome.replaceWith(this.chatNode);
        else if (this.chatNode) this.chatNode.remove();
      } catch {}
      this.chatNode = null; this.chatHome = null; this.chatObs = null;
    }
    close() {
      if (this.closing) return; this.closing = true;
      this.stopRec(true); player.stop();
      this.saving = false; this.starting = false;
      clearInterval(this.themeSync);
      this.doc.removeEventListener('keydown', this.keyHandler, true);
      this.undockChat();
      this.root.remove();
      if (studio === this) studio = null;
      if (!studio) quietOff();
      const pw = this.popup; stageWin = null;
      if (pw) { try { pw.close(); } catch {} }
      emit('queue');
    }
    addCue() {
      const ed = this.editor, t = ed.playhead != null ? ed.playhead : ed.marker != null ? ed.marker : 0;
      ed.toggleCue(t);
    }
    onKey(e) {
      if (isTyping(e.target) || this.counting) return;
      const k = e.key, ctrl = e.ctrlKey || e.metaKey, ed = this.editor;
      if (k === 'Escape' && (ed.sel.size || ed.tool !== 'move')) { ed.handleKey(e); e.preventDefault(); }
      else if (k === 'Escape') { e.preventDefault(); this.close(); }
      else if (ctrl) { if (ed.handleKey(e)) e.preventDefault(); else return; }
      else if ('rRкК'.includes(k)) { e.preventDefault(); e.shiftKey ? this.askRerecord() : this.doRecord(false); }
      else if ('mMьЬ'.includes(k)) { e.preventDefault(); this.addCue(); }
      else if (k === ' ') { e.preventDefault(); this.playMine(false); }
      else if (k === 'Enter') { e.preventDefault(); this.save(true); }
      else if (k === '[' || k === 'х') { e.preventDefault(); this.editor.nudge(e.shiftKey ? -50 : -10); }
      else if (k === ']' || k === 'ъ') { e.preventDefault(); this.editor.nudge(e.shiftKey ? 50 : 10); }
      else if (this.editor.handleKey(e)) { e.preventDefault(); }
      else if ('aAфФ'.includes(k)) { e.preventDefault(); this.editor.auto(); }
      else return;
      e.stopPropagation();
    }
    renderList() {
      const g = room.state && room.state.game; if (!g) return;
      const mine = myLines();
      this.list.replaceChildren(...mine.map((a) => {
        const st = lineStatus(g, a);
        return h('div', { class: 'vxp-line' + (a.index === this.index ? ' active' : ''), title: a.caption, onclick: () => { if (st !== 'sent' && st !== 'sending') this.select(a.index); } },
          h('span', { class: 'n' }, '#' + (a.index + 1)), h('span', { class: 'c' }, a.caption || a.clipId), h('span', { class: 'vxp-chip ' + st }, statusText(st)));
      }));
      const done = mine.filter((a) => ['sent', 'ready'].includes(lineStatus(g, a))).length;
      this.kicker.textContent = done + ' / ' + mine.length;
    }
    refreshEditor() { this.editor.set(this.ref, this.model); this.updateButtons(); this.updateLoud && this.updateLoud(); }
    async select(index) {
      const g = room.state && room.state.game; if (!g || index == null) return;
      if (this.dirty && this.model) this.save(false);
      this.stopRec(true); player.stop();
      const a = g.assignments[index]; if (!a) return;
      this.index = index; this.assignment = a;
      this.clip = this.pack.clips.find((c) => c.id === a.clipId);
      this.editor.cues = ((settings.cues || {})[a.clipId] || []).slice();
      if (!this.clip) { toast(tr('Клип ' + a.clipId + ' не найден в моде', 'Clip ' + a.clipId + ' not found in the mod'), 'err'); return; }
      this.title.textContent = '#' + (index + 1) + ' · ' + (a.title || this.clip.title || '');
      this.subSpeaker.textContent = this.speakerName();
      this.subText.textContent = a.caption || this.clip.caption || '';
      if (this.video.src !== this.clip.videoUrl) this.video.src = this.clip.videoUrl;
      this.guideEl.src = this.clip.audioUrl || '';
      const seek = () => { try { this.video.currentTime = this.clip.videoStartSeconds || 0; } catch {} };
      if (this.video.readyState >= 1) seek(); else this.video.addEventListener('loadedmetadata', seek, { once: true });
      this.ref = null;
      try {
        const d = await decodeBlob(this.clip.audioFile || this.clip.audioUrl);
        if (this.index !== index) return;
        this.ref = { samples: d.samples, sr: d.sampleRate, duration: d.duration };
      } catch (e) { console.warn('[Voxalike+OrdaxEd] ref decode', e); }
      const q = queue.get(qKey(g, index));
      this.model = q ? q.model : null; this.dirty = false;
      this.refreshEditor();
      this.renderList();
    }
    speakerName() {
      const list = (this.clip && this.clip.speakers) || [];
      const ch = Array.isArray(this.pack.characters) ? this.pack.characters : [];
      return list.map((sp) => {
        if (typeof sp === 'string' && !/^\d+$/.test(sp)) return sp;
        const c = ch[+sp] ?? ch.find((x) => x && x.id === sp);
        return c == null ? '' : typeof c === 'string' ? c : c.name || c.title || '';
      }).filter(Boolean).join(' · ');
    }
    /** Средняя громкость (RMS, дБ отн. полной шкалы) по звучащим окнам 50 мс; для моей записи — по всем кускам вместе с усилением. */
    /** Средняя громкость (RMS по звучащим окнам 50 мс, дБ): оригинал и моя запись (без авто-подгонки). */
    measureLoud() {
      const m = this.model, ref = this.ref;
      const meas = (parts, sr, gainDb) => {
        const W = Math.max(64, Math.round(sr * 0.05)); let sum = 0, n = 0;
        for (const [x, a, b] of parts) for (let i = a; i + W <= b; i += W) { let e = 0; for (let k = i; k < i + W; k++) e += x[k] * x[k]; e /= W; if (e > 1e-5) { sum += e; n++; } }
        return n ? 10 * Math.log10(sum / n) + gainDb : null;
      };
      const parts = m ? (m.segs || [{ a: 0, b: m.base.length }]).map((q) => [m.base, q.a, Math.min(q.b, m.base.length)]) : [];
      return {
        o: ref ? meas([[ref.samples, 0, ref.samples.length]], ref.sr, 0) : null,
        m: m ? meas(parts, m.sr, (m.params.gain || 0)) : null,
        peak: () => { let pk = 0; for (const [x, a, b] of parts) for (let i = a; i < b; i++) { const v = Math.abs(x[i]); if (v > pk) pk = v; } return pk; },
      };
    }
    /** Выравнивание: m.params.level (дБ) подгоняет мою запись под среднюю громкость оригинала; без пережима (пик ≤ −0.5 дБ). */
    applyLevel() {
      try {
        const m = this.model; if (!m) return;
        let lv = 0;
        if (settings.autoLevel && this.ref) {
          const r = this.measureLoud();
          if (r.o != null && r.m != null) {
            lv = Math.max(-18, Math.min(12, r.o - r.m));
            const pk = r.peak(); if (pk > 0 && lv > 0) lv = Math.min(lv, -0.5 - 20 * Math.log10(pk * Math.pow(10, (m.params.gain || 0) / 20)));
            lv = Math.round(lv * 10) / 10;
          }
        }
        if ((m.params.level || 0) !== lv) { m.params.level = lv; this._loudKey = null; }
      } catch {}
    }
    updateLoud() {
      try {
        const m = this.model, ref = this.ref;
        const key = this.index + '|' + (ref ? ref.samples.length : 0) + '|' + (m ? m.segs && JSON.stringify(m.segs.map((q) => [q.a, q.b])) + '|' + (m.params.gain || 0) + '|' + (m.params.level || 0) : '');
        if (key === this._loudKey) return; this._loudKey = key;
        const r = this.measureLoud();
        const fmt = (v) => v == null ? '' : tr('средняя ', 'avg ') + v.toFixed(1).replace('-', '−') + ' ' + tr('дБ', 'dB');
        this.loudO.textContent = fmt(r.o);
        this.loudM.textContent = r.m == null ? '' : fmt(r.m + (m.params.level || 0)) + (m.params.level ? ' (' + (m.params.level > 0 ? '+' : '−') + Math.abs(m.params.level).toFixed(1) + ')' : '');
      } catch {}
    }
    setSrc(k) {
      this.src = k; this.laneO.classList.toggle('on', k === 'orig'); this.laneM.classList.toggle('on', k === 'mine');
      this.syncPlay && this.syncPlay();
    }
    updateTime() {
      try {
        const ed = this.editor, f = (t) => { t = Math.max(0, t || 0); const m = Math.floor(t / 60); return m + ':' + (t - m * 60).toFixed(1).padStart(4, '0'); };
        this.timeEl.textContent = f(ed.playhead != null ? ed.playhead : ed.marker != null ? ed.marker : 0) + ' / ' + f(this.clip ? this.clipDur() : 0);
      } catch {}
    }
    clipDur() { return Math.max(0.5, this.ref ? this.ref.duration : (this.clip.videoEndSeconds - this.clip.videoStartSeconds) || 3); }
    updateButtons() {
      const recOn = !!this.rec;
      const busy = this.saving || this.starting;
      this.btnRecord.classList.toggle('live', recOn);
      this.btnRerecord.classList.toggle('live', recOn);
      { const g0 = room.state && room.state.game, queued = !!(g0 && queue.has(qKey(g0, this.index)) && !this.dirty);
        const cur = recOn || !this.model ? 0 : queued ? 3 : 1;
        this.stepEls.forEach((e, i) => { e.classList.toggle('now', i === cur); e.classList.toggle('done', i < cur || (queued && i === 2)); });
        const mine = myLines().filter((a) => lineStatus(g0, a) !== 'sent'); const pos = mine.findIndex((a) => a.index === this.index);
        this.navMid.textContent = mine.length ? tr('Реплика ', 'Line ') + (pos + 1 || '–') + ' / ' + mine.length : '';
        this.btnPrev.disabled = recOn || busy || mine.length < 2; this.btnNext.disabled = recOn || busy || mine.length < 2; }
      
      if (recOn) {
        this.recLbl.textContent = tr('Стоп', 'Stop'); this.btnRecord.classList.add('stop');
        this.btnRecord.disabled = false;
        this.btnRerecord.textContent = tr('■ Стоп', '■ Stop');
        this.btnRerecord.disabled = true;
      } else {
        this.recLbl.textContent = this.model ? tr('Запись с метки', 'Record at marker') : tr('Записать', 'Record'); this.btnRecord.classList.remove('stop');
        this.btnRecord.disabled = busy || this.counting;
        this.btnRerecord.textContent = this.rerecPending ? tr('⚠ Точно перезаписать?', '⚠ Really re-record?') : tr('⟲ Перезаписать', '⟲ Re-record');
        this.btnRerecord.classList.toggle('ask', !!this.rerecPending);
        this.btnRerecord.disabled = busy || this.counting || !this.model;
      }
      
      this.btnMine.disabled = recOn || busy || this.counting || !this.model;
      this.btnOrig.disabled = recOn || busy || this.counting;
      this.btnSave.disabled = recOn || busy || this.counting || !this.model;
      
      this.punchInfo.textContent = this.editor.marker == null ? tr('метка: клик/тяните линейку', 'marker: click/drag ruler') : tr('метка ', 'marker ') + this.editor.marker.toFixed(2) + tr(' с', ' s');
      
      const g = room.state && room.state.game;
      this.btnDel.disabled = recOn || busy || !(g && queue.has(qKey(g, this.index)));
    }
    playOriginal() {
      if (player.playing) return player.stop();
      const c = this.clip; if (!c) return;
      const dur = (c.videoEndSeconds || c.videoStartSeconds + this.clipDur()) - c.videoStartSeconds;
      const ed = this.editor, label = this.btnOrig.textContent;
      this.btnOrig.textContent = tr('■ Стоп', '■ Stop');
      // Звук оригинала берём из отдельных дорожек мода (vocal + backing), а не из видео:
      // в модах, где аудио вырезано из видеоряда, у <video> звука нет. Видео играет без звука.
      // Если вокальная дорожка не декодировалась — запасной вариант: звук самого видео.
      const useTracks = !!(this.ref && this.ref.samples);
      const media = [{ el: this.video, from: c.videoStartSeconds, muted: useTracks, vol: 1 }];
      if (useTracks && this.backing) media.push({ el: this.backing, from: c.videoStartSeconds, vol: 0.6 });
      const tracks = useTracks ? [{ samples: this.ref.samples, sr: this.ref.sr, startSec: 0, gain: 1 }] : [];
      player.play({ tracks, media, dur, startAt: ed.playStart(),
        onTick: (t) => { ed.playhead = t; ed.draw(); },
        onEnd: () => { ed.playhead = null; ed.draw(); this.btnOrig.textContent = tr('▶ Оригинал', '▶ Original'); this.video.pause(); this.video.muted = true; try { this.video.currentTime = c.videoStartSeconds; } catch {} } });
    }
    playMine(withRef) {
      if (player.playing) { player.stop(); return; }
      if (!this.model) return;
      const startAt = this.editor.playStart();
      const c = this.clip, ed = this.editor, out = renderModel(this.model);
      const dur = Math.max(out.length / this.model.sr, (c.videoEndSeconds || 0) - c.videoStartSeconds);
      const media = [{ el: this.video, from: c.videoStartSeconds, muted: true }];
      if (!withRef && this.backing) media.push({ el: this.backing, from: c.videoStartSeconds, vol: 0.6 });
      const tracks = [{ samples: out, sr: this.model.sr, startSec: 0, gain: 1 }];
      if (withRef && this.ref) tracks.push({ samples: this.ref.samples, sr: this.ref.sr, startSec: 0, gain: 0.55 });
      ed.setPlaying(withRef);
      this.btnMine.textContent = withRef ? tr('▶ Моя запись', '▶ My take') : tr('■ Стоп', '■ Stop');
      player.play({ tracks, media, dur, startAt,
        onTick: (t) => { ed.playhead = t; ed.draw(); },
        onEnd: () => { ed.playhead = null; ed.setPlaying(false); ed.draw(); this.btnMine.textContent = tr('▶ Моя запись', '▶ My take'); this.video.pause(); try { this.video.currentTime = c.videoStartSeconds; } catch {} } });
    }
    /** Перезапись затирает текущий дубль, поэтому просим подтвердить вторым нажатием (3,5 с). */
    askRerecord() {
      if (!this.model || this.rec || this.rerecPending) { this.rerecPending = false; clearTimeout(this.rerecTimer); return this.doRecord(true); }
      this.rerecPending = true; this.updateButtons();
      this.rerecTimer = setTimeout(() => { this.rerecPending = false; this.updateButtons(); }, 3500);
    }
    async doRecord(isRerecord) {
      if (this.counting || this.starting || this.saving) return;
      if (this.rec) { this.stopRec(false); return; }
      this.starting = true;
      this.updateButtons();
      try {
        if (isRerecord) {
          await this.startRec(null);
        } else {
          if (!this.model) {
            await this.startRec(null);
          } else {
            const ed = this.editor;
            if (ed.marker == null) {
              this.starting = false;
              this.updateButtons();
              return toast(tr('Поставьте метку на линейке, чтобы дозаписать', 'Set a marker on the ruler to punch-in'), 'warn');
            }
            const pos = clamp(ed.marker - this.model.params.offset / 1000, 0, Math.max(0, this.clipDur() - 0.1));
            await this.startRec(pos);
          }
        }
      } finally {
        this.starting = false;
        this.updateButtons();
      }
    }
    async startRec(punchPos) {
      if (!this.clip) return;
      player.stop();
      let track;
      try {
        const m = app.mic();
        const gameTrack = m && m.stream && m.stream.getAudioTracks && m.stream.getAudioTracks()[0];
        if (gameTrack && gameTrack.readyState === 'live') {
          track = gameTrack.clone();
        } else {
          const dev = app.mic(); const id = dev && dev.selectedDeviceId;
          const stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: id && id !== 'default' ? { exact: id } : undefined, echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
          track = stream.getAudioTracks()[0];
        }
      } catch (e) { toast(tr('Микрофон недоступен: ', 'Microphone unavailable: ') + e.message, 'err'); return; }
      let cap;
      try { cap = await Capture.open(track, { noMonitor: false }); } catch (e) { track.stop(); toast(tr('Не удалось начать запись: ', 'Could not start recording: ') + e.message, 'err'); return; }
      const c = this.clip, dur = this.clipDur(), C = settings.countdown, vOff = punchPos != null ? punchPos : 0, start = (c.videoStartSeconds || 0) + vOff;
      const rec = this.rec = { cap, videoCtx: null, timers: [], punch: punchPos != null, punchPos, vOff };
      const winEndTL = dur + 0.4, winEnd = Math.max(0.5, winEndTL - vOff);
      const plannedPerf = performance.now() + C * 1000;
      const liveT0 = () => (cap.startCtx == null ? vOff : vOff + cap.startCtx - (rec.videoCtx != null ? rec.videoCtx : cap.perfToCtx(plannedPerf)));
      cap.onData = () => this.editor.setLive({ buf: cap.buf, len: cap.len, sr: cap.sr, t0: liveT0(), winEnd: winEndTL });
      this.editor.setLive({ buf: cap.buf, len: 0, sr: cap.sr, t0: vOff - C, winEnd: winEndTL });
      this.updateButtons();
      this.video.muted = true;
      // предпрокрутка видео во время отсчёта
      const from = Math.max(0, start - C), delay = Math.max(0, C - (start - from));
      try { this.video.currentTime = from; } catch {}
      const mark = (perf) => {
        if (rec.videoCtx != null || this.rec !== rec) return;
        rec.videoCtx = cap.perfToCtx(perf);
        this.cue.className = 'vxp-cue on rec'; this.cue.textContent = tr('● ЗАПИСЬ', '● REC');
        if (settings.studioGuide && c.audioUrl) { this.guideEl.currentTime = vOff; this.guideEl.volume = settings.guideVol; this.guideEl.play().catch(() => {}); }
        const tail = settings.tailSec;
        rec.timers.push(wst(() => {
          if (this.rec !== rec) return;
          if (!tail) return this.stopRec(false);
          const tEnd = performance.now() + tail * 1000;
          this.cue.className = 'vxp-cue on tail';
          const upd = () => { if (this.rec !== rec) return; const s = Math.ceil((tEnd - performance.now()) / 1000); this.cue.textContent = tr('● БУФЕР ', '● BUFFER ') + s + tr(' с · R — стоп', ' s · R — stop'); if (s > 0) rec.timers.push(wst(upd, 250)); };
          upd();
          rec.timers.push(wst(() => this.stopRec(false), tail * 1000));
        }, winEnd * 1000 - Math.max(0, performance.now() - perf)));
      };
      const watchStart = () => {
        if (this.video.requestVideoFrameCallback) {
          const onFrame = (now, meta) => {
            if (this.rec !== rec || rec.videoCtx != null) return;
            if (meta.mediaTime >= start - 0.017) mark(meta.expectedDisplayTime - (meta.mediaTime - start) * 1000);
            else this.video.requestVideoFrameCallback(onFrame);
          };
          this.video.requestVideoFrameCallback(onFrame);
        }
        this.video.addEventListener('playing', () => {
          const t = this.video.currentTime, p = performance.now();
          rec.timers.push(wst(() => mark(p + Math.max(0, start - t) * 1000), Math.max(0, (start - t) * 1000) + 120));
        }, { once: true });
      };
      rec.timers.push(wst(() => { if (this.rec !== rec) return; watchStart(); this.video.play().catch(() => {}); }, delay * 1000));
      this.counting = true;
      const ok = await countdown(C, { host: this.videoBox });
      this.counting = false;
      if (!ok) { this.stopRec(true); return; }
      if (rec.videoCtx == null && this.rec === rec) { this.cue.className = 'vxp-cue on rec'; this.cue.textContent = tr('● ЗАПИСЬ', '● REC'); }
    }
    stopRec(discard) {
      const rec = this.rec; if (!rec) return;
      this.rec = null;
      if (!discard) this.saving = true;
      rec.timers.forEach(wct);
      rec.cap.onData = null; // последний кусок после остановки не должен включать живой режим
      this.video.pause(); this.guideEl.pause();
      this.cue.className = 'vxp-cue';
      this.editor.setLive(null);
      this.updateButtons();
      rec.cap.stop().then((res) => {
        if (!discard) this.saving = false;
        if (this.rec !== null) return; // если началась новая запись, игнорируем старую
        if (discard || rec.videoCtx == null || res.startCtx == null || !res.samples.length) {
          if (!discard && rec.videoCtx == null) toast(tr('Запись отменена (слишком рано остановлена)', 'Recording cancelled (stopped too early)'), 'warn');
          this.refreshEditor(); return;
        }
        if (rec.punch && this.model) { this.punchMerge(res, rec); return; }
        const fx = settings.fx;
        this.model = {
          base: normalizeTake(res.samples), sr: res.sr, t0: res.startCtx - rec.videoCtx,
          outLen: Math.round((this.clipDur() + 0.4) * res.sr),
          params: defaultParams(),
        };
        initSegs(this.model);
        this.dirty = true;
        this.applyLevel();
        this.refreshEditor();
        this.setSrc('mine');
        this.markEnd(this.model.t0 + res.samples.length / res.sr);
        try { this.video.currentTime = this.clip.videoStartSeconds; } catch {}
      });
    }
    /** По окончании записи метка сама встаёт в конец записанного (не дальше конца реплики) — следующая дозапись продолжит оттуда. */
    markEnd(t) {
      const ed = this.editor; if (!this.model) return;
      ed.marker = Math.max(0, Math.min(t, this.clipDur()));
      ed.draw(); ed.onMarker && ed.onMarker();
    }
    punchMerge(res, rec) {
      const m = this.model, ed = this.editor, sr = m.sr;
      if (res.sr !== sr) { toast(tr('Частота записи не совпала с дублем — дозапись отменена', 'Sample rate differs from the take — punch-in cancelled'), 'err'); this.refreshEditor(); return; }
      const pos0 = (res.startCtx - rec.videoCtx) + rec.vOff;
      const idx = Math.max(0, Math.round((rec.punchPos - pos0) * sr));
      const nw = normalizeTake(res.samples).subarray(idx);
      if (nw.length < sr * 0.05) { toast(tr('Дозапись слишком короткая', 'The punch-in is too short'), 'err'); this.refreshEditor(); return; }
      if (peakOf(nw) < 0.005) { toast(tr('Дозапись пустая: микрофон молчит', 'Punch-in is empty: mic is silent'), 'err'); this.refreshEditor(); return; }
      ed.pushHist();
      const old = m.base, base = new Float32Array(old.length + nw.length);
      base.set(old); base.set(nw, old.length);
      m.base = base;
      ensureSegs(m);
      const pos = pos0 + idx / sr, dur = nw.length / sr / (m.params.speed || 1);
      if (settings.punchReplace) m.segs = carveSegs(m, pos, pos + dur);
      const seg = { id: segSeq++, a: old.length, b: base.length, pos };
      m.segs.push(seg);
      ed.sel.clear(); ed.sel.add(seg.id);
      this.dirty = true;
      this.refreshEditor();
      this.markEnd(pos + dur);
      toast(tr('Дозапись вставлена в дубль', 'Punch-in added to the take'));
      try { this.video.currentTime = this.clip.videoStartSeconds; } catch {}
    }
    save(next) {
      const g = room.state && room.state.game;
      if (!g || !this.model || this.index == null) return;
      if (g.takes.some((t) => t.assignmentIndex === this.index)) { toast(tr('Эта реплика уже отправлена', 'This line has already been sent'), 'err'); return; }
      this.applyLevel();
      { const key = qKey(g, this.index), q = { index: this.index, clipId: this.assignment.clipId, model: this.model, status: 'ready', savedAt: Date.now() };
        queue.set(key, q); qdb.put(key, q, g).then((ok) => { if (ok === null && !qdb.warned) { qdb.warned = true; toast(tr('Браузер не даёт сохранить очередь на диск — после F5 она пропадёт', 'The browser won\'t store the queue on disk — it will be lost on F5'), 'err'); } }); }
      this.dirty = false;
      emit('queue');
      trySubmit();
      if (!next) return;
      this.setSrc('orig');
      toast(tr('Реплика #' + (this.index + 1) + ' в очереди', 'Line #' + (this.index + 1) + ' queued'));
      const mine = myLines().filter((a) => ['todo', 'now'].includes(lineStatus(g, a)) && a.index !== this.index);
      const nxt = mine.find((a) => a.index > this.index) || mine[0];
      if (nxt) this.select(nxt.index); else { toast(tr('Все ваши реплики готовы — ждём остальных 🎉', 'All your lines are ready — waiting for the others 🎉')); this.close(); }
    }
    go(dir) {
      const g = room.state && room.state.game; if (!g || this.rec || this.saving || this.starting) return;
      const mine = myLines().filter((a) => lineStatus(g, a) !== 'sent'); if (mine.length < 2) return;
      const pos = mine.findIndex((a) => a.index === this.index);
      this.select(mine[(pos + dir + mine.length) % mine.length].index);
    }
    remove() {
      const g = room.state && room.state.game; if (!g) return;
      queue.delete(qKey(g, this.index)); persistDel(qKey(g, this.index));
      this.model = null; this.dirty = false;
      this.refreshEditor(); emit('queue');
    }
  }

  /* ================================================================== */
