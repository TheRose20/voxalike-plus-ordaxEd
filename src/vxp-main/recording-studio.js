  /* ================================================================== */
  /*  Студия: запись реплик заранее                                      */
  /* ================================================================== */
  let studio = null;
  /* Отдельное окно студии (одного источника с игрой — поэтому доступ к микрофону и состоянию игры общий). */
  function openStagePopup() {
    let w = null;
    try { w = window.open('', 'vxp-studio-window'); } catch {}
    if (!w) return null;
    try {
      w.document.open();
      w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>ESPERION — ' + tr('студия', 'studio') + '</title></head><body style="margin:0;background:#07070a;overflow:hidden"></body></html>');
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
    if (studio) studio.close(true);
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
        onChange: (kind) => { if (this.model) { this.dirty = true; this.clearCheck(); if (kind !== 'fragfx') this._fragSig = null; this.renderFrags(); } },
        onPlay: () => this.playMine(true),
      });
      this.editor.canvas.classList.add('big');
      
      this.btnRecord = h('button', { class: 'vxp-btn rec wide big', title: tr('Запись / стоп (клавиша R)', 'Record / stop (R key)'), type: 'button', onclick: () => this.doRecord(false) }, tr('● Записать', '● Record'));
      this.btnRerecord = h('button', { class: 'vxp-btn wide big', title: tr('Перезаписать реплику с начала (Shift+R)', 'Re-record the line from the start (Shift+R)'), type: 'button', onclick: () => this.doRecord(true) }, tr('⟲ Перезаписать', '⟲ Re-record'));
      
      this.btnOrig = h('button', { class: 'vxp-btn', type: 'button', onclick: () => this.playOriginal() }, tr('▶ Оригинал', '▶ Original'));
      this.btnMine = h('button', { class: 'vxp-btn', type: 'button', onclick: () => this.playMine(false) }, tr('▶ Моя запись', '▶ My take'));
      
      this.punchInfo = h('span', { class: 'vxp-hint', style: 'align-self:center' });
      this.punchRow = h('div', { class: 'vxp-row', style: 'align-items:center;flex-wrap:wrap;justify-content:center' }, this.btnRecord, this.btnRerecord, this.punchInfo,
        checkbox({ label: tr('Заменять то, что под записью', 'Replace what is under the recording'), get: () => settings.punchReplace, set: (v) => { settings.punchReplace = v; saveSettings(); }, title: tr('Вкл — старый звук под новым куском вырезается; выкл — новый кусок накладывается сверху', 'On — the old sound under the new piece is cut out; off — the new piece is layered on top') }));
      
      this.openFrag = null; this._fragSig = null; this.nextFx = '';
      const nfSel = h('select', { class: 'vxp-select', title: tr('Эффект применится к фрагменту сразу после записи. Позже его можно изменить кнопкой FX у фрагмента', 'The effect is applied to the fragment right after recording. You can change it later with the FX button of the fragment'), onchange: () => { this.nextFx = nfSel.value; } },
        h('option', { value: '' }, tr('без эффекта', 'no effect')),
        h('option', { value: 'same' }, tr('как у прошлого фрагмента', 'same as the previous fragment')),
        h('option', { value: 'char' }, '🎭 ' + tr('профиль персонажа', 'character profile')),
        ...FRAG_PRESETS.filter((p) => p[0] !== 'clean').map((p) => h('option', { value: p[0] }, p[1] + ' ' + tr(p[2], p[3]))));
      this.nfSel = nfSel;
      this.nextFxRow = h('label', { class: 'vxp-nextfx' }, h('span', null, '✨ ' + tr('Эффект для следующего фрагмента', 'Effect for the next fragment')), nfSel);
      this.fragList = h('div', { class: 'vxp-lines vxp-frags' });
      this.fragBox = h('div', { class: 'vxp-sec', style: 'display:none' },
        h('div', { class: 'vxp-title' }, h('span', null, tr('Фрагменты записи', 'Recorded fragments'))),
        this.fragList,
        h('div', { class: 'vxp-hint' }, tr('Запись → Стоп → снова «Следующий фрагмент»: метка сама встаёт в конец прошлого куска. Метку можно перетащить на линейке.', 'Record → Stop → press “Next fragment” again: the marker jumps to the end of the last piece. You can drag the marker on the ruler.')));
      const tb = (label, title, fn) => h('button', { class: 'vxp-btn', type: 'button', title, onclick: fn }, label);
      this.btnBalance = tb('⚖ ' + tr('Выровнять громкость', 'Balance levels'), tr('Подгоняет громкость всех кусков к средней, чтобы фрагменты не «прыгали» (B)', 'Matches the loudness of all pieces so fragments do not jump (B)'), () => this.balance());
      this.btnTrim = tb('✂ ' + tr('Подрезать тишину', 'Trim silence'), tr('Убирает тишину в начале и конце кусков, звук остаётся на своих местах (T)', 'Cuts silence at the start/end of pieces; audio stays in place (T)'), () => this.trimSilence());
      this.btnMaster = tb('🧙 ' + tr('Мастер реплики', 'Line master'), tr('Всё сразу: делит на фразы, подрезает тишину, убирает щелчки, выравнивает громкость и проверяет результат. Один шаг отмены Ctrl+Z (G)', 'All at once: splits into phrases, trims silence, removes clicks, balances levels and re-checks the result. One Ctrl+Z step (G)'), () => this.masterLine());
      this.btnSplit = tb('✂ ' + tr('Разбить на фразы', 'Split into phrases'), tr('Находит паузы между фразами и делит запись на отдельные фрагменты — чтобы обрабатывать, сдвигать и переписывать каждую фразу отдельно (P)', 'Finds pauses between phrases and splits the take into separate fragments so each phrase can be processed, shifted and re-recorded on its own (P)'), () => this.splitPhrases());
      this.btnCheck = tb('🔎 ' + tr('Проверить запись', 'Check take'), tr('Ищет перегруз, щелчки, провалы звука и фразы, заметно тише или громче остальных. Места отмечаются на дорожке; клик по строке ставит туда метку (K)', 'Finds clipping, clicks, dropouts and phrases clearly quieter or louder than the rest. Spots are marked on the track; click a row to put the marker there (K)'), () => this.checkTake());
      this.checkBox = h('div', { class: 'vxp-check', style: 'display:none' });
      this.btnWav = tb('⬇ WAV', tr('Скачать свою запись файлом', 'Download your take as a file'), () => this.exportWav());
      this.btnKeys = tb('⌨ ' + tr('Клавиши', 'Keys'), tr('Шпаргалка по горячим клавишам (H или ?)', 'Hotkey cheat-sheet (H or ?)'), () => this.toggleKeys());
      this.toolsRow = h('div', { class: 'vxp-row vxp-tools' }, this.btnMaster, this.btnSplit, this.btnBalance, this.btnTrim, this.btnCheck, this.btnWav, this.btnKeys);
      this.keysEl = null;
      this.editor.onMarker = () => this.updateButtons();
      this.btnSave = h('button', { class: 'vxp-btn primary wide big', title: tr('Отправить в очередь и перейти к следующей реплике (Enter)', 'Queue it and go to the next line (Enter)'), type: 'button', onclick: () => this.save(true) }, tr('✓ Сохранить → далее', '✓ Save → next'));
      this.btnDel = h('button', { class: 'vxp-btn', type: 'button', title: tr('Удалить из очереди', 'Remove from queue'), onclick: () => this.remove() }, '🗑');
      this.title = h('h3'); this.kicker = h('small');
      this.stepEls = [tr('Запиши', 'Record'), tr('Послушай', 'Listen'), tr('Сохрани', 'Save')].map((t, i) => h('div', { class: 'vxp-step' }, h('b', null, String(i + 1)), t));
      this.steps = h('div', { class: 'vxp-steps' }, ...this.stepEls);
      this.btnPrev = h('button', { class: 'vxp-btn', type: 'button', title: tr('Предыдущая моя реплика', 'Previous line of mine'), onclick: () => this.go(-1) }, tr('◀ Назад', '◀ Prev'));
      this.btnNext = h('button', { class: 'vxp-btn', type: 'button', title: tr('Следующая моя реплика', 'Next line of mine'), onclick: () => this.go(1) }, tr('Дальше ▶', 'Next ▶'));
      this.navMid = h('div', { class: 'vxp-navmid' });
      this.navRow = h('div', { class: 'vxp-navrow' }, this.btnPrev, this.navMid, this.btnNext);
      this.list = h('div', { class: 'vxp-lines' });
      const guide = checkbox({ label: tr('Слушать оригинал при записи', 'Hear the original while recording'), get: () => settings.studioGuide, set: (v) => { settings.studioGuide = v; saveSettings(); }, title: 'Нужны наушники' });
      const fx = fxControls(() => this.model ? { model: this.model, apply: () => { this.dirty = true; this.refreshEditor(); } } : null);
      this.root = h('div', { class: 'vxp-studio', role: 'dialog', 'aria-label': tr('Запись реплик заранее', 'Record lines in advance') },
        h('div', { class: 'vxp-card' },
          h('div', { class: 'vxp-card-head' },
            h('div', null, brandBar(true), this.kicker, this.title),
            h('div', { class: 'vxp-row' },
              h('button', { class: 'vxp-btn icon', type: 'button', title: tr('Закрыть (Esc)', 'Close (Esc)'), onclick: () => this.close() }, '✕'))),
          h('div', { class: 'vxp-stagebox' },
            this.navRow,
            this.videoBox,
            h('div', { class: 'vxp-sub' }, this.subSpeaker, this.subText),
            this.steps,
            this.editor.root,
            h('div', { class: 'vxp-row' }, this.btnOrig, this.btnMine),
            this.punchRow,
            this.nextFxRow,
            this.fragBox,
            this.toolsRow,
            this.checkBox,
            h('div', { class: 'vxp-row' }, this.btnSave, this.btnDel),
            h('div', { class: 'vxp-hint', title: tr('Горячие клавиши', 'Hotkeys') }, tr('Клавиши: R — запись/стоп · Shift+R — перезапись · M — метка · , . — границы · Пробел — слушать · B — громкость · T — тишина · H — все клавиши · Enter — сохранить', 'Keys: R — record/stop · Shift+R — re-record · M — marker · , . — edges · Space — play · B — balance · T — trim · H — all keys · Enter — save'))),
          h('div', { class: 'vxp-side' },
            h('div', { class: 'vxp-sec' }, h('div', { class: 'vxp-title' }, h('span', null, tr('Мои реплики', 'My lines'))), this.list),
            h('div', { class: 'vxp-sec' }, h('div', { class: 'vxp-title' }, h('span', null, tr('Обработка', 'Processing'))), fx),
            studioSec('rec', tr('Запись', 'Recording'), micControls(), guide, timingControls()),
            studioSec('nr', tr('Шумодав', 'Noise suppression'), nrControls()),
            studioSec('set', tr('Настройки', 'Settings'),
              checkbox({ label: tr('Авто-метка: после «Стоп» ставить метку в конец записанного', 'Auto-marker: after “Stop” move the marker to the end of what was recorded'), get: () => settings.autoMarker, set: (v) => { settings.autoMarker = v; saveSettings(); } }),
              checkbox({ label: tr('Сразу прослушивать записанный фрагмент', 'Auto-play the fragment after recording'), get: () => settings.autoPreview, set: (v) => { settings.autoPreview = v; saveSettings(); } }),
              checkbox({ label: tr('Предупреждать о тихой записи и перегрузе', 'Warn about too-quiet or clipping recordings'), get: () => settings.levelCheck, set: (v) => { settings.levelCheck = v; saveSettings(); } }),
              checkbox({ label: tr('Тишина на сайте, пока студия открыта', 'Silence the site while the studio is open'), get: () => settings.quietSite, set: (v) => { settings.quietSite = v; saveSettings(); v ? quietOn() : quietOff(); }, title: tr('Глушит чужие аудио и видео на вкладке игры (звук из игры через Web Audio не затрагивается)', 'Mutes other audio/video on the game tab (Web Audio output of the game is not affected)') }),
              selectRow({ label: tr('Громкость экспорта WAV', 'WAV export loudness'), options: [[0, tr('не менять', 'unchanged')], [-16, '−16 LUFS · ' + tr('речь, подкасты', 'speech, podcasts')], [-18, '−18 LUFS · ' + tr('тише, с запасом', 'quieter, more headroom')], [-23, '−23 LUFS · EBU R128']], get: () => settings.exportTarget || 0, set: (v) => { settings.exportTarget = v; },
                title: tr('При скачивании WAV громкость подгоняется к выбранной (измерение по BS.1770, моно). Пик не поднимается выше −1 дБ. На запись в игре не влияет', 'When downloading WAV, loudness is matched to the target (BS.1770 measurement, mono). Peak never exceeds −1 dB. Does not affect what is sent to the game') }),
              langControl()),
            studioSec('look', tr('Оформление', 'Look & feel'), personalizeControl()),
            h('div', { class: 'vxp-sec' }, h('div', { class: 'vxp-hint' },
              tr('Записанные реплики ждут в очереди и отправляются сами, как только подходит ваш ход. Очередь сохраняется на диск и переживает F5, но вкладку лучше не закрывать до конца игры.', 'Recorded lines wait in the queue and are sent automatically when your turn comes. The queue is kept on disk and survives F5, but keep the tab open until the game ends.'))))));
      this.buildSideTabs();
      this.keyHandler = (e) => this.onKey(e);
      this.doc.addEventListener('keydown', this.keyHandler, true);
      this.unloadH = (e) => { if (this.dirty && this.model) { e.preventDefault(); e.returnValue = ''; } };
      window.addEventListener('beforeunload', this.unloadH);
      if (this.popup) { try { this.popup.addEventListener('beforeunload', this.unloadH); } catch {} }
      this.draftTimer = setInterval(() => this.saveDraft(), 6000);
      this.doc.body.append(this.root);
      if (this.popup) {
        this.themeSync = setInterval(() => { try { const a = qs('#vxp-theme'), b = this.doc.getElementById('vxp-theme'); if (a && b && b.textContent !== a.textContent) b.textContent = a.textContent; } catch {} }, 400);
        this.popup.addEventListener('pagehide', () => { if (studio === this && !this.closing) this.close(); });
        this.popup.addEventListener('focus', () => {});
      }
      this.renderList();
    }
    /** Правая колонка студии — вкладками: реплики / эффекты / запись / настройки. */
    buildSideTabs() {
      const side = this.root.querySelector('.vxp-side'); if (!side) return;
      const kids = [...side.children];
      const groups = [['lines', '▤', tr('Реплики', 'Lines'), [0]], ['fx', '◐', tr('Эффекты', 'Effects'), [1]], ['rec', '●', tr('Запись', 'Record'), [2, 3]], ['look', '✦', tr('Вид', 'Look'), [4]], ['set', '⚙', tr('Опции', 'Options'), [5, 6]]];
      groups.forEach(([k, , , idx]) => idx.forEach((i) => { if (kids[i]) kids[i].dataset.tab = k; }));
      const ind = h('span', { class: 've-ind' });
      const tabs = groups.map(([k, ico, label]) => h('button', { class: 'vxp-tab', type: 'button', 'data-k': k, title: label, onclick: () => show(k) }, h('i', null, ico), label));
      const place = () => { const on = tabs.find((b) => b.classList.contains('on')); if (!on || !on.offsetWidth) return; ind.style.width = on.offsetWidth + 'px'; ind.style.transform = 'translateX(' + on.offsetLeft + 'px)'; };
      const show = (k, first) => {
        settings.studioTab = k; saveSettings();
        kids.forEach((el) => { if (el.dataset.tab) { const on = el.dataset.tab === k; el.style.display = on ? '' : 'none'; if (on && !first) { el.classList.remove('ve-tabin'); void el.offsetWidth; el.classList.add('ve-tabin'); } } });
        tabs.forEach((b) => b.classList.toggle('on', b.dataset.k === k));
        place();
      };
      side.prepend(h('div', { class: 'vxp-tabbar' }, ...tabs, ind));
      try { new ResizeObserver(place).observe(side); } catch {}
      show(groups.some((g) => g[0] === settings.studioTab) ? settings.studioTab : 'lines', true);
      setTimeout(place, 60);
    }
    moveTo(popout) {
      const idx = this.index;
      if (this.dirty && this.model) this.save(false);
      this.close(true);
      openStudio(idx, { popout });
    }
    close(instant) {
      if (this.closing) return; this.closing = true;
      this.stopRec(true); player.stop();
      this.saving = false; this.starting = false;
      clearInterval(this.themeSync); clearInterval(this.draftTimer);
      window.removeEventListener('beforeunload', this.unloadH);
      this.doc.removeEventListener('keydown', this.keyHandler, true);
      const rootEl = this.root;
      if (!instant && !this.popup && settings.ve && settings.ve.anim && !settings.ve.lite && !settings.reduceMotion) { rootEl.classList.add('ve-out'); setTimeout(() => rootEl.remove(), 220 / (clamp(+settings.ve.speed || 100, 50, 200) / 100)); } else rootEl.remove();
      if (studio === this) studio = null;
      if (!studio) quietOff();
      const pw = this.popup; stageWin = null;
      if (pw) { try { pw.close(); } catch {} }
      emit('queue');
    }
    onKey(e) {
      if (isTyping(e.target) || this.counting) return;
      const k = e.key, ctrl = e.ctrlKey || e.metaKey, ed = this.editor;
      if (k === 'Escape' && (ed.sel.size || ed.tool !== 'move')) { ed.handleKey(e); e.preventDefault(); }
      else if (k === 'Escape') { e.preventDefault(); this.close(); }
      else if (ctrl) { if (ed.handleKey(e)) e.preventDefault(); else return; }
      else if ('rRкК'.includes(k)) { e.preventDefault(); this.doRecord(e.shiftKey); }
      else if ('hHрР?'.includes(k)) { e.preventDefault(); this.toggleKeys(); }
      else if ('mMьЬ'.includes(k)) { e.preventDefault(); this.markerHere(); }
      else if (k === ',' || k === 'б' || k === 'Б') { e.preventDefault(); this.jumpMarker(-1); }
      else if (k === '.' || k === 'ю' || k === 'Ю') { e.preventDefault(); this.jumpMarker(1); }
      else if ('pPзЗ'.includes(k)) { e.preventDefault(); this.splitPhrases(); }
      else if ('eEуУ'.includes(k)) { e.preventDefault(); this.toggleFragFxHere(); }
      else if ('bBиИ'.includes(k)) { e.preventDefault(); this.balance(); }
      else if ('tTеЕ'.includes(k)) { e.preventDefault(); this.trimSilence(); }
      else if ('kKлЛ'.includes(k)) { e.preventDefault(); this.checkTake(); }
      else if ('gGпП'.includes(k)) { e.preventDefault(); this.masterLine(); }
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
      this.kicker.textContent = tr('Запись заранее · готово ', 'Recording ahead · done ') + done + '/' + mine.length;
    }
    refreshEditor() { this.clearCheck(); this.editor.set(this.ref, this.model); this.updateButtons(); this.renderFrags(); }
    /** Куски, в которых ещё есть звук (после удаления/монтажа пустые прячем). */
    visibleFrags() {
      const m = this.model; if (!m || !m.frags || !m.segs) return [];
      return m.frags.filter((f) => m.segs.some((sg) => sg.pos < f.t1 - 0.02 && sg.pos + segDur(m, sg) > f.t0 + 0.02));
    }
    renderFrags() {
      if (!this.fragList) return;
      const fr = this.visibleFrags(), m = this.model;
      this.fragBox.style.display = fr.length ? '' : 'none';
      const recOn = !!this.rec, busy = this.saving || this.starting || this.counting;
      this.fragList.classList.toggle('busy', recOn || busy);
      if (this.openFrag && !fr.some((f) => f.t0.toFixed(3) === this.openFrag)) this.openFrag = null;
      // Перестраиваем список только когда изменился состав фрагментов — иначе при правке эффектов слетал бы фокус слайдера
      const sig = fr.map((f) => fid(f) + ':' + f.t0.toFixed(3) + ':' + f.t1.toFixed(3) + (f.locked ? 'L' : '')).join('|') + '#' + (recOn ? 1 : 0) + (busy ? 1 : 0) + '#' + (this.openFrag || '');
      if (sig === this._fragSig && this.fragList.firstChild) { this.updateFragBadges(); syncWidgets(); return; }
      this._fragSig = sig;
      this._fragByKey = new Map();
      const rows = fr.map((f, i) => {
        const key = f.t0.toFixed(3), open = this.openFrag === key, col = FRAG_COLORS[i % FRAG_COLORS.length];
        this._fragByKey.set(key, f);
        const btn = (cls, title, fn, txt) => h('button', { class: 'vxp-btn icon' + cls, type: 'button', disabled: recOn || busy, title, onclick: fn }, txt);
        const head = h('div', { class: 'vxp-line vxp-fraghead' },
          h('span', { class: 'n' }, '#' + (i + 1)),
          h('span', { class: 'c' }, f.t0.toFixed(2) + ' – ' + f.t1.toFixed(2) + tr(' с', ' s') + ' · ' + (f.t1 - f.t0).toFixed(1) + (f.locked ? ' 🔒' : ''), h('em', { class: 'vxp-fxb', 'data-k': key })),
          btn(open ? ' active' : '', tr('Эффекты этого фрагмента (E)', 'Effects of this fragment (E)'), () => this.toggleFragFx(f), 'FX'),
          btn('', f.locked ? tr('Открепить', 'Unlock') : tr('Закрепить: запись не перезапишет этот фрагмент и остановится перед ним', 'Lock: recording will not overwrite it and will stop before it'), () => { f.locked = !f.locked; this.dirty = true; this.renderFrags(); }, f.locked ? '🔓' : '🔒'),
          btn('', tr('Прослушать фрагмент', 'Play fragment'), () => this.playFrag(f), '▶'),
          btn('', tr('Перезаписать этот фрагмент (с его начала)', 'Re-record this fragment (from its start)'), () => this.rerecordFrag(f), '⟲'),
          btn('', tr('Удалить фрагмент', 'Delete fragment'), () => this.deleteFrag(f), '🗑'));
        return h('div', { class: 'vxp-frag' + (open ? ' open' : ''), style: '--fc:' + col }, head, open ? this.fragFxPanel(f) : null);
      });
      this.fragList.replaceChildren(...rows);
      this.updateFragBadges();
      syncWidgets();
    }
    /** Подписи с эффектами у фрагментов и подсветка открытого фрагмента на дорожке. */
    updateFragBadges() {
      const m = this.model; if (!m || !this._fragByKey) return;
      for (const el of this.fragList.querySelectorAll('.vxp-fxb')) {
        const f = this._fragByKey.get(el.dataset.k); el.textContent = f ? this.fragBadge(f) : '';
      }
      const hi = this.openFrag ? this._fragByKey.get(this.openFrag) || null : null;
      if (hi !== this.editor.fragHi) { this.editor.fragHi = hi; this.editor.draw(); }
    }
    fragBadge(f) {
      const x = fragFxOf(this.model, f), p = [];
      if (x.rev) p.push('⏪');
      if (x.pitch) p.push('♪' + (x.pitch > 0 ? '+' : '−') + Math.abs(x.pitch));
      if (x.echo) p.push('🔁' + x.echo + '%');
      if (x.space.mix) p.push('🏛' + x.space.mix + '%');
      if (x.radio) p.push('📻');
      if (x.under) p.push('🌊');
      if (x.lowcut) p.push('⌁');
      if (x.denoise) p.push('🧹');
      if (x.gain) p.push((x.gain > 0 ? '+' : '−') + Math.abs(x.gain) + tr(' дБ', ' dB'));
      return p.join(' ');
    }
    toggleFragFx(f) {
      const key = f.t0.toFixed(3);
      this.openFrag = this.openFrag === key ? null : key;
      this.renderFrags();
    }
    /** Клавиша E: эффекты фрагмента под меткой (или последнего). */
    toggleFragFxHere() {
      const m = this.model; if (!m || this.rec) return;
      if (this.openFrag) { this.openFrag = null; this.renderFrags(); return; }
      const fr = this.visibleFrags(); if (!fr.length) return;
      const t = this.editor.marker == null ? null : this.editor.marker - m.params.offset / 1000;
      const f = (t != null && fr.find((g) => t >= g.t0 - 0.02 && t <= g.t1 + 0.02)) || fr[fr.length - 1];
      this.openFrag = f.t0.toFixed(3); this.renderFrags();
    }
    /** Панель одного фрагмента: эффекты · сверка с оригиналом · дубли. */
    fragFxPanel(f) {
      const x = () => fragFxOf(this.model, f), set = (p, d) => this.setFragFx(f, p, d);
      const chips = FRAG_PRESETS.map(([k, ic, ru, en]) => h('button', { class: 'vxp-chipbtn', type: 'button', title: tr(ru, en), onclick: () => this.applyFragPreset(f, k) }, h('i', null, ic), tr(ru, en)));
      const types = [['room', 'Комната', 'Room'], ['hall', 'Зал', 'Hall']].map(([t, ru, en]) =>
        h('button', { class: 'vxp-btn small', type: 'button', 'data-t': t, onclick: () => { const sp = x().space; set({ space: { type: t, mix: sp.mix || 30 } }, true); } }, tr(ru, en)));
      const typeRow = h('div', { class: 'vxp-row' }, ...types);
      typeRow._sync = () => { const sp = x().space; types.forEach((b) => b.classList.toggle('primary', b.dataset.t === sp.type && !!sp.mix)); };
      widgets.add(typeRow);
      const pct = (v) => (v ? v + '%' : tr('выкл', 'off'));
      const act = (label, title, fn) => h('button', { class: 'vxp-btn small', type: 'button', title, onclick: fn }, label);
      const ck = this.charKey(), hasProf = !!(ck && settings.charFx && settings.charFx[ck]);
      const takes = f.takes || [];
      return h('div', { class: 'vxp-fxp' },
        h('div', { class: 'vxp-sh' }, tr('Эффекты', 'Effects')),
        h('div', { class: 'vxp-chips' }, ...chips),
        slider({ label: tr('🔊 Громкость', '🔊 Volume'), min: -18, max: 12, step: 0.5, get: () => x().gain, set: (v, d) => set({ gain: v }, d), fmt: (v) => (v ? (v > 0 ? '+' : '−') + Math.abs(v) + ' ' + tr('дБ', 'dB') : '0 ' + tr('дБ', 'dB')) }),
        slider({ label: tr('🎚 Питч', '🎚 Pitch'), min: -12, max: 12, step: 1, get: () => x().pitch, set: (v, d) => set({ pitch: v }, d), fmt: (v) => (v ? (v > 0 ? '+' : '−') + Math.abs(v) : '0') }),
        slider({ label: tr('🔁 Эхо', '🔁 Echo'), min: 0, max: 100, step: 5, get: () => x().echo, set: (v, d) => set({ echo: v }, d), fmt: pct }),
        slider({ label: tr('🏛 Реверберация', '🏛 Reverb'), min: 0, max: 100, step: 5, get: () => x().space.mix, set: (v, d) => set({ space: { mix: v } }, d), fmt: pct }),
        typeRow,
        h('div', { class: 'vxp-fxflags' },
          checkbox({ label: tr('Срез низов', 'Low cut'), get: () => x().lowcut, set: (v) => set({ lowcut: v }, true) }),
          checkbox({ label: tr('Радио', 'Radio'), get: () => x().radio, set: (v) => set({ radio: v }, true) }),
          checkbox({ label: tr('Под водой', 'Underwater'), get: () => x().under, set: (v) => set({ under: v }, true) }),
          checkbox({ label: tr('Задом наперёд', 'Reverse'), get: () => x().rev, set: (v) => set({ rev: v }, true) })),
        h('div', { class: 'vxp-row' },
          act('▶ ' + tr('С эффектами', 'With effects'), tr('Прослушать фрагмент с эффектами', 'Play the fragment with its effects'), () => this.playFrag(f)),
          act('▷ ' + tr('Без эффектов', 'Dry'), tr('Сравнить: тот же фрагмент без эффектов', 'Compare: the same fragment without effects'), () => this.playFrag(f, true)),
          act('⧉ ' + tr('На все', 'To all'), tr('Скопировать эти эффекты на все остальные фрагменты', 'Copy these effects to all other fragments'), () => this.copyFragFx(f)),
          act('⟲ ' + tr('Сбросить', 'Reset'), tr('Убрать эффекты фрагмента', 'Remove this fragment\'s effects'), () => this.applyFragPreset(f, 'clean'))),
        h('div', { class: 'vxp-row' },
          act('🎭 ' + tr('Запомнить для персонажа', 'Save for the character'), ck ? tr('Эти эффекты станут профилем персонажа «' + ck + '» и будут применяться к его фрагментам', 'These effects become the profile of "' + ck + '" and are applied to its fragments') : tr('У реплики не указан персонаж', 'This line has no character'), () => this.saveCharFx(f)),
          hasProf ? act('✕ ' + tr('Забыть профиль', 'Forget profile'), tr('Удалить профиль эффектов персонажа', 'Delete the character\'s effect profile'), () => this.forgetCharFx()) : null),
        h('div', { class: 'vxp-sh' }, tr('Сверка с оригиналом', 'Check against the original')),
        this.buildSyncBox(f),
        takes.length ? h('div', { class: 'vxp-sh' }, tr('Дубли этого фрагмента', 'Takes of this fragment')) : null,
        takes.length ? h('div', { class: 'vxp-takes' }, ...takes.map((tk, i) => h('div', { class: 'vxp-take' },
          h('span', null, tr('Дубль ', 'Take ') + (i + 1) + ' · ' + (tk.t1 - tk.t0).toFixed(1) + tr(' с', ' s')),
          act('▶', tr('Послушать этот дубль', 'Listen to this take'), () => this.playTake(tk)),
          act(tr('Взять', 'Use'), tr('Поставить этот дубль вместо текущего (текущий сохранится как дубль)', 'Use this take instead of the current one (the current one is kept as a take)'), () => this.useTake(f, tk))))) : null);
    }
    /* ---- сверка ---- */
    buildSyncBox(f) {
      const box = h('div', { class: 'vxp-sync' }); this._syncBox = box; this._syncF = f; this.fillSyncBox(); return box;
    }
    refreshSyncBox() { if (this._syncBox && this._syncBox.isConnected !== false && this._syncF) this.fillSyncBox(); }
    fillSyncBox() {
      const f = this._syncF, m = this.model, box = this._syncBox; if (!box || !m || !f) return;
      const row = (ic, text, btn) => h('div', { class: 'vxp-syncrow' }, h('i', null, ic), h('span', null, text), btn || null);
      const go = (label, title, fn) => h('button', { class: 'vxp-btn small', type: 'button', title, onclick: fn }, label);
      const refresh = go('↻', tr('Пересчитать', 'Recalculate'), () => this.refreshSyncBox());
      let r = null;
      try { r = this.ref ? fragSync(m, f, this.ref) : null; } catch (e) { console.warn('[ESPERION] сверка', e); }
      if (!this.ref) { box.replaceChildren(row('ⓘ', tr('Оригинал ещё не загружен', 'The original is not loaded yet'))); return; }
      if (!r || r.noRef) { box.replaceChildren(row('ⓘ', r && r.noRef ? tr('В этом месте оригинал молчит — сверять не с чем', 'The original is silent here — nothing to compare with') : tr('Слишком мало звука для сверки', 'Not enough audio to compare'), refresh)); return; }
      const kids = [];
      const ms = Math.round(r.shiftMs), early = ms > 0;
      kids.push(Math.abs(ms) < 25 ? row('⏱', tr('Старт: в такт с оригиналом', 'Start: in sync with the original'))
        : row('⏱', tr('Старт: ' + (early ? 'раньше' : 'позже') + ' оригинала на ' + Math.abs(ms) + ' мс', 'Start: ' + Math.abs(ms) + ' ms ' + (early ? 'earlier' : 'later') + ' than the original'),
          go(tr('Сдвинуть', 'Shift'), tr('Сдвинуть только этот фрагмент так, чтобы он лёг на оригинал', 'Shift only this fragment so it lines up with the original'), () => this.syncShift(f, r.shiftMs / 1000))));
      if (r.durRatio != null) {
        const p = Math.round((r.durRatio - 1) * 100), ok = r.durRatio >= 0.75 && r.durRatio <= 1.33;
        kids.push(Math.abs(p) < 4 ? row('↔', tr('Длина: совпадает с оригиналом', 'Length: matches the original'))
          : row('↔', tr('Длина: ваша фраза ' + (p > 0 ? 'короче' : 'длиннее') + ' оригинала на ' + Math.abs(p) + '%' + (ok ? '' : ' (слишком много для растяжки)'), 'Length: your phrase is ' + Math.abs(p) + '% ' + (p > 0 ? 'shorter' : 'longer') + ' than the original' + (ok ? '' : ' (too much to stretch)')),
            ok ? go(p > 0 ? tr('Растянуть', 'Stretch') : tr('Сжать', 'Squeeze'), tr('Изменить темп фрагмента без изменения высоты, начало остаётся на месте', 'Change the tempo without changing pitch; the start stays in place'), () => this.syncStretch(f, r.durRatio)) : null));
      }
      if (r.levelDb != null) {
        const db = Math.round(r.levelDb * 10) / 10;
        kids.push(Math.abs(db) < 1.5 ? row('🔊', tr('Громкость: как у оригинала', 'Level: like the original'))
          : row('🔊', tr('Громкость: на ' + Math.abs(db) + ' дБ ' + (db > 0 ? 'громче' : 'тише') + ' оригинала', 'Level: ' + Math.abs(db) + ' dB ' + (db > 0 ? 'louder' : 'quieter') + ' than the original'),
            go(tr('Подогнать', 'Match'), tr('Подогнать громкость фрагмента под оригинал', 'Match the fragment level to the original'), () => this.syncLevel(f, db))));
      }
      kids.push(row('≈', tr('Совпадение ритма с оригиналом: ' + Math.round(r.score * 100) + '%', 'Rhythm match with the original: ' + Math.round(r.score * 100) + '%'), refresh));
      box.replaceChildren(...kids);
    }
    syncShift(f, d) {
      const m = this.model, ed = this.editor; if (!m || this.rec) return;
      if (f.locked) return toast(tr('Фрагмент закреплён 🔒 — сначала открепите', 'Fragment is locked 🔒 — unlock it first'), 'warn');
      const segs = fragSegsOf(m, f), n0 = f.t0 + d, n1 = f.t1 + d;
      if (!segs.length) return;
      if (this.visibleFrags().some((g) => g !== f && g.t0 < n1 - 0.02 && g.t1 > n0 + 0.02)) return toast(tr('Сдвинутый фрагмент налезет на соседний — сначала подвиньте соседний', 'The shifted fragment would overlap its neighbour'), 'warn');
      ed.pushHist();
      segs.forEach((s) => { s.pos += d; });
      f.t0 = n0; f.t1 = n1; this.openFrag = f.t0.toFixed(3);
      this._fragSig = null; ed.commit('move');
      toast(tr('Фрагмент сдвинут на ' + Math.round(d * 1000) + ' мс (Ctrl+Z — отмена)', 'Fragment shifted by ' + Math.round(d * 1000) + ' ms (Ctrl+Z to undo)'));
    }
    /** Изменить темп цельного фрагмента (без смены высоты). Начало речи остаётся на месте. */
    syncStretch(f, ratio) {
      const m = this.model, ed = this.editor; if (!m || this.rec || !this.ref) return;
      if (f.locked) return toast(tr('Фрагмент закреплён 🔒 — сначала открепите', 'Fragment is locked 🔒 — unlock it first'), 'warn');
      const segs = fragSegsOf(m, f);
      if (segs.length !== 1) return toast(tr('Растянуть можно только цельный фрагмент (без разрезов)', 'Only a whole fragment (no cuts) can be stretched'), 'warn');
      const sg = segs[0], sp = m.params.speed || 1, r = clamp(ratio, 0.75, 1.33), sy = fragSync(m, f, this.ref);
      if (!sy || sy.noRef) return;
      const len = Math.max(1, Math.round((sg.b - sg.a) * r)), pivot = sy.mineStart;
      const pos = pivot - (pivot - sg.pos) * r, end = pos + len / m.sr / sp;
      const others = this.visibleFrags().filter((g) => g !== f);
      if (others.some((g) => g.t0 < Math.max(f.t1, end) - 0.02 && g.t1 > Math.min(f.t0, pos) + 0.02)) return toast(tr('Растянутый фрагмент налезет на соседний', 'The stretched fragment would overlap its neighbour'), 'warn');
      ed.pushHist(); m.multi = true;
      const st = timeStretch(m.base.slice(sg.a, sg.b), r, len, m.sr), old = m.base.length, base = new Float32Array(old + st.length);
      base.set(m.base); base.set(st, old); m.base = base;
      m.segs = m.segs.map((s) => (s === sg ? { ...sg, id: segSeq++, a: old, b: base.length, pos } : s));
      f.t0 = Math.min(f.t0, pos); f.t1 = Math.max(f.t1, end); this.openFrag = f.t0.toFixed(3);
      this._fragSig = null; ed.commit('stretch');
      toast(tr('Темп фрагмента изменён ×' + r.toFixed(2) + ' (Ctrl+Z — отмена)', 'Fragment tempo changed ×' + r.toFixed(2) + ' (Ctrl+Z to undo)'));
    }
    syncLevel(f, levelDb) {
      const g = fragFxOf(this.model, f).gain;
      this.setFragFx(f, { gain: clamp(Math.round((g - levelDb) * 2) / 2, -18, 12) }, true); syncWidgets();
    }
    /* ---- дубли ---- */
    playTake(tk) { this.previewSegs(tk.segs, tk.t0); }
    useTake(f, tk) {
      const m = this.model, ed = this.editor; if (!m || this.rec) return;
      if (f.locked) return toast(tr('Фрагмент закреплён 🔒 — сначала открепите', 'Fragment is locked 🔒 — unlock it first'), 'warn');
      if (this.visibleFrags().some((g) => g !== f && g.t0 < tk.t1 - 0.02 && g.t1 > tk.t0 + 0.02)) return toast(tr('Этот дубль длиннее и налезает на соседний фрагмент', 'This take is longer and overlaps a neighbouring fragment'), 'warn');
      const cur = takeOf(m, f), rest = (f.takes || []).filter((t) => t !== tk);
      ed.pushHist();
      m.segs = carveSegs(m, Math.min(f.t0, tk.t0), Math.max(f.t1, tk.t1));
      tk.segs.forEach((s) => m.segs.push({ ...s, id: segSeq++ }));
      const nf = { t0: tk.t0, t1: tk.t1, takes: [...rest, cur].slice(-6) };
      if (f.locked) nf.locked = true;
      m.frags = (m.frags || []).map((g) => (g === f ? nf : g)).sort((a, b) => a.t0 - b.t0);
      ed.sel.clear(); this.openFrag = nf.t0.toFixed(3); this._fragSig = null; ed.commit('take');
      toast(tr('Дубль поставлен (прежний сохранён как дубль)', 'Take applied (the previous one is kept as a take)'));
    }
    /** Проиграть только указанные куски (без остального). */
    previewSegs(segs, fromT) {
      const m = this.model; if (!m) return;
      if (player.playing) { player.stop(); return; }
      const out = renderModel(Object.assign({}, m, { segs, _rk: null, _r: null }));
      const from = Math.max(0, Math.floor((fromT + m.params.offset / 1000 - 0.1) * m.sr)), ed = this.editor;
      player.play({ tracks: [{ samples: out.subarray(from), sr: m.sr, startSec: 0, gain: 1 }], dur: (out.length - from) / m.sr + 0.1,
        onTick: (t) => { ed.playhead = t + from / m.sr; ed.draw(); }, onEnd: () => { ed.playhead = null; ed.draw(); } });
    }
    /* ---- разбивка на фразы ---- */
    /** Ядро разбивки: делит неблокированные фрагменты по паузам, без истории и уведомлений. Возвращает число новых фрагментов (0 — делить нечего). */
    _splitCore(m) {
      ensureSegs(m);
      if (!this.visibleFrags().length && m.segs.length) { // запись без границ фрагментов (одним куском или из старого сохранения): считаем её одним фрагментом
        const t0 = Math.min(...m.segs.map((q) => q.pos)), t1 = Math.max(...m.segs.map((q) => q.pos + segDur(m, q)));
        if (t1 - t0 > 0.1) m.frags = [{ t0, t1 }];
      }
      const plans = this.visibleFrags().filter((f) => !f.locked).map((f) => ({ f, r: splitFragPhrases(m, f, 0.35) })).filter((p) => p.r);
      if (!plans.length) return 0;
      const rm = new Set(); plans.forEach((p) => p.r.remove.forEach((x) => rm.add(x)));
      m.segs = m.segs.filter((x) => !rm.has(x)).concat(plans.flatMap((p) => p.r.segs));
      const gone = new Set(plans.map((p) => p.f)), made = plans.flatMap((p) => p.r.frags);
      m.frags = (m.frags || []).filter((f) => !gone.has(f)).concat(made).sort((x, y) => x.t0 - y.t0);
      this.editor.sel.clear(); this.openFrag = null; this._fragSig = null;
      return made.length;
    }
    splitPhrases() {
      const m = this.model; if (!m || this.rec) return;
      this.editor.pushHist();
      const n = this._splitCore(m);
      if (!n) { this.editor.dropHist(); return toast(tr('Пауз для разбивки не нашлось (нужна пауза от 0,35 с между фразами)', 'No pauses to split at (need a pause of at least 0.35 s between phrases)'), 'warn'); }
      this.editor.commit('split');
      toast(tr('Запись разбита на фразы: ' + n + ' (Ctrl+Z — отмена)', 'Split into phrases: ' + n + ' (Ctrl+Z to undo)'));
    }
    /* ---- профиль персонажа ---- */
    charKey() { try { return (this.speakerName() || '').trim(); } catch { return ''; } }
    saveCharFx(f) {
      const k = this.charKey(); if (!k) return toast(tr('У этой реплики не указан персонаж', 'This line has no character'), 'warn');
      settings.charFx = settings.charFx || {}; settings.charFx[k] = fxManual(fragFxOf(this.model, f)); saveSettings();
      this.nextFx = 'char'; if (this.nfSel) this.nfSel.value = 'char'; this._fragSig = null; this.renderFrags();
      toast(tr('Эффекты запомнены для «' + k + '» и будут применяться к его новым фрагментам', 'Effects saved for "' + k + '" and will be applied to its new fragments'));
    }
    forgetCharFx() {
      const k = this.charKey(); if (!k || !settings.charFx) return;
      delete settings.charFx[k]; saveSettings();
      if (this.nextFx === 'char') { this.nextFx = ''; if (this.nfSel) this.nfSel.value = ''; }
      this._fragSig = null; this.renderFrags(); toast(tr('Профиль персонажа удалён', 'Character profile removed'));
    }
    /** При выборе реплики: если у персонажа есть профиль — он включается для новых фрагментов сам. */
    autoCharFx() {
      const k = this.charKey(), has = !!(k && settings.charFx && settings.charFx[k]);
      if (has) this.nextFx = 'char'; else if (this.nextFx === 'char') this.nextFx = '';
      if (this.nfSel) this.nfSel.value = this.nextFx;
    }
    /* ---- суфлёр: слова реплики подсвечиваются по времени оригинала ---- */
    setCaption(text) {
      this.words = String(text || '').split(/\s+/).filter(Boolean);
      const kids = []; this.words.forEach((w, i) => { kids.push(h('span', { class: 'vxp-w' }, w)); if (i < this.words.length - 1) kids.push(' '); });
      this.subText.replaceChildren(...kids); this.wordEls = kids.filter((k) => k.nodeType === 1);
      this.wordT = null; this.buildPrompter();
    }
    buildPrompter() {
      this.wordT = null;
      if (!this.words || !this.words.length || !this.ref) return;
      const sp = activeSpan(this.ref.samples, this.ref.sr); if (!sp || sp.e - sp.s < 0.3) return;
      const wt = this.words.map((w) => w.length + 2 + (/[,.!?…;:]$/.test(w) ? 3 : 0)), tot = wt.reduce((a, b) => a + b, 0);
      let t = sp.s; this.wordT = wt.map((x) => { const d = ((sp.e - sp.s) * x) / tot, r = { s: t, e: t + d }; t += d; return r; });
    }
    updatePrompter(t) {
      if (!this.wordEls) return;
      this.wordEls.forEach((el, i) => {
        const w = this.wordT && this.wordT[i];
        el.classList.toggle('done', !!(t != null && w && t >= w.e));
        el.classList.toggle('now', !!(t != null && w && t >= w.s - 0.08 && t < w.e));
      });
    }
    /** Изменить эффекты фрагмента. patch мерджится в каждый его кусок (авто-выравнивание bal сохраняется). */
    setFragFx(f, patch, done, opts) {
      const m = this.model, ed = this.editor; if (!m || this.rec) return;
      const segs = fragSegsOf(m, f); if (!segs.length) return;
      if (!(opts && opts.noHist) && !this._fxg) { ed.pushHist(); this._fxg = true; }
      for (const sg of segs) {
        const own = sg.fx || {}, mg = Object.assign({}, own, patch);
        if (patch.space) mg.space = Object.assign({ type: 'room', mix: 0, size: 50 }, own.space, patch.space);
        sg.fx = segFxActive(mg) ? mg : undefined;
      }
      if (done) { this._fxg = false; ed.commit('fragfx'); this.refreshSyncBox(); } else { ed.requestDraw(); this.updateFragBadges(); }
    }
    applyFragPreset(f, key, opts) {
      const pr = FRAG_PRESETS.find((p) => p[0] === key); if (!pr) return;
      const base = { gain: 0, pitch: 0, lowcut: false, denoise: 0, echo: 0, under: false, radio: false, rev: false, space: { mix: 0 } };
      this.setFragFx(f, Object.assign(base, pr[4] || {}), true, opts);
      syncWidgets();
    }
    copyFragFx(f) {
      const m = this.model, others = this.visibleFrags().filter((g) => g !== f);
      if (!m || !others.length) return toast(tr('Других фрагментов нет', 'There are no other fragments'));
      const patch = fxManual(fragFxOf(m, f));
      this.editor.pushHist();
      others.forEach((g) => this.setFragFx(g, patch, false, { noHist: true }));
      this._fxg = false; this.editor.commit('fragfx'); syncWidgets();
      toast(tr('Эффекты скопированы на все фрагменты (Ctrl+Z — отмена)', 'Effects copied to all fragments (Ctrl+Z to undo)'));
    }
    /** После записи: применить «эффект для следующего фрагмента». */
    applyNextFx(nf, all) {
      const key = this.nextFx; if (!key) return;
      if (key === 'char') {
        const pr = settings.charFx && settings.charFx[this.charKey()];
        if (pr) this.setFragFx(nf, Object.assign({}, pr, { space: Object.assign({}, pr.space) }), true, { noHist: true });
      } else if (key === 'same') {
        const prev = all.filter((g) => g !== nf && g.t1 <= nf.t0 + 0.05).pop();
        if (!prev) return;
        this.setFragFx(nf, fxManual(fragFxOf(this.model, prev)), true, { noHist: true });
      } else this.applyFragPreset(nf, key, { noHist: true });
      syncWidgets();
    }
    playFrag(f, dry) {
      if (player.playing) { player.stop(); return; }
      const m = this.model; if (!m) return;
      const off = m.params.offset / 1000, fx = fragFxOf(m, f);
      if (!dry) {
        const tail = Math.min(2, (fx.echo ? 1.4 : 0) + (fx.space.mix ? (fx.space.type === 'hall' ? 1.8 : 0.9) : 0));
        this.playMine(false, Math.max(0, f.t0 + off - 0.15));
        wst(() => { if (player.playing) player.stop(); }, (f.t1 - f.t0 + 0.4 + tail) * 1000);
        return;
      }
      // сравнение «до/после»: тот же фрагмент, но без эффектов
      this.previewSegs(fragSegsOf(m, f).map((sg) => { const c = { ...sg }; delete c.fx; return c; }), f.t0);
    }
    async rerecordFrag(f) {
      if (this.rec || this.counting || this.starting || this.saving || !this.model) return;
      if (f.locked) return toast(tr('Фрагмент закреплён 🔒 — сначала открепите', 'Fragment is locked 🔒 — unlock it first'), 'warn');
      this.editor.marker = f.t0 + this.model.params.offset / 1000; this.editor.draw();
      this.starting = true; this.updateButtons();
      const takes = [...(f.takes || []), takeOf(this.model, f)].slice(-6);
      try { await this.startRec(clamp(f.t0, 0, Math.max(0, this.clipDur() - 0.1)), { forceReplace: true, takes }); }
      finally { this.starting = false; this.updateButtons(); }
    }
    deleteFrag(f) {
      const m = this.model; if (!m || this.rec) return;
      if (f.locked) return toast(tr('Фрагмент закреплён 🔒 — сначала открепите', 'Fragment is locked 🔒 — unlock it first'), 'warn');
      this.editor.pushHist();
      m.segs = carveSegs(m, f.t0, f.t1);
      m.frags = (m.frags || []).filter((x) => x !== f);
      this.dirty = true;
      this.refreshEditor();
      toast(tr('Фрагмент удалён (Ctrl+Z — вернуть)', 'Fragment deleted (Ctrl+Z to undo)'));
    }
    /** После записи: помечаем фрагмент и ставим метку в его конец — следующий фрагмент пишется сразу.
     *  Границы фрагментов хранятся в тех же секундах, что и позиции кусков (без сдвига дорожки). */
    afterFragment(rec, t0, replaced = true) {
      const m = this.model, ed = this.editor; if (!m) return;
      const dur = this.clipDur(), off = m.params.offset / 1000;
      const end = clamp(rec.stopT || 0, t0, dur);
      // новый фрагмент вытесняет старые в своём диапазоне (если включена замена): перекрытые обрезаем
      let fr = [];
      for (const f of (m.frags || [])) {
        if (!replaced || f.t1 <= t0 + 0.01 || f.t0 >= end - 0.01) { fr.push(f); continue; }
        const { takes: _tk, ...rest } = f;
        if (f.t0 < t0 - 0.05) fr.push({ ...rest, t1: t0 });
        if (f.t1 > end + 0.05) fr.push({ ...rest, t0: end });
      }
      if (end - t0 > 0.05) { const nfr = { t0, t1: end }; if (rec.takes && rec.takes.length) nfr.takes = rec.takes; fr.push(nfr); }
      fr.sort((a, b) => a.t0 - b.t0);
      m.frags = fr;
      if (settings.autoMarker || ed.marker == null) ed.marker = end + off;
      ed.draw();
      this._fragSig = null;
      this.renderFrags(); this.updateButtons();
      const nf = fr.find((f) => f.t0 === t0);
      if (nf && this.nextFx) this.applyNextFx(nf, fr);
      if (settings.autoPreview && nf) setTimeout(() => { if (!this.rec && !player.playing && this.model === m) this.playFrag(nf); }, 350);
    }
    /** Метка: под курсор воспроизведения, а если не играет — в конец последнего фрагмента. */
    markerHere() {
      const ed = this.editor, m = this.model; if (!m || this.rec) return;
      let t = ed.playhead;
      if (t == null) { const fr = this.visibleFrags(); t = fr.length ? fr[fr.length - 1].t1 + m.params.offset / 1000 : 0; }
      ed.marker = clamp(t, 0, this.clipDur()); ed.draw(); this.updateButtons();
    }
    /** Метка на границу предыдущего / следующего фрагмента (клавиши , и .). */
    jumpMarker(dir) {
      const ed = this.editor; if (!this.model || this.rec) return;
      const off = this.model.params.offset / 1000, b = new Set([0]);
      this.visibleFrags().forEach((f) => { b.add(f.t0 + off); b.add(f.t1 + off); });
      const list = [...b].sort((x, y) => x - y), cur = ed.marker == null ? 0 : ed.marker;
      const t = dir > 0 ? list.find((x) => x > cur + 0.02) : [...list].reverse().find((x) => x < cur - 0.02);
      if (t == null) return;
      ed.marker = clamp(t, 0, this.clipDur()); ed.draw(); this.updateButtons();
    }
    /** Ядро де-клика: включает флаг у кусков, где в самом звуке есть щелчок, который можно убрать (с возвратом к сигналу). Возвращает число кусков. */
    _declickCore(m) {
      let n = 0;
      m.segs = ensureSegs(m).map((sg) => {
        if (sg.fx && sg.fx.declick) return sg;
        if (!clickScan(segAudio(m, { a: sg.a, b: sg.b }), m.sr).fixes.length) return sg;
        n++; return { ...sg, fx: Object.assign({}, sg.fx || {}, { declick: true }) };
      });
      return n;
    }
    /** «Убрать щелчки»: кусок меняется только там, где щелчок реально найден и исправим; отмена — Ctrl+Z. */
    fixClicks() {
      const m = this.model; if (!m || this.rec) return;
      this.editor.pushHist();
      const n = this._declickCore(m);
      if (!n) { this.editor.dropHist(); return toast(tr('Автоматически убрать нечего: этот щелчок не лежит в звуке куска (появился после эффектов) или это не щелчок. Послушайте место и при необходимости перепишите фрагмент', 'Nothing to remove automatically: this click is not in the piece audio (it appears after effects) or it is not a click. Listen to the spot and re-record if needed'), 'warn'); }
      this.dirty = true; this.refreshEditor();
      toast(tr('Щелчки убраны в кусках: ' + n + ' (Ctrl+Z — отмена)', 'Clicks removed in ' + n + ' piece(s) (Ctrl+Z to undo)'));
      this.checkTake();
    }
    /** Разброс громкости между кусками (дБ, по звучащим участкам с учётом их эффектов); null, если кусков меньше двух. */
    _levelSpread(m) {
      const db = ensureSegs(m).filter((sg) => (sg.b - sg.a) > m.sr * 0.15).map((sg) => { const x = segAudio(m, sg); return activeRms(x, 0, x.length); }).filter((r) => r > 1e-4).map((r) => 20 * Math.log10(r));
      return db.length < 2 ? null : Math.max(...db) - Math.min(...db);
    }
    /** 2.9 «Мастер реплики»: разбивка на фразы → подрезка тишины → удаление щелчков → выравнивание громкости → повторная проверка и отчёт. Один шаг отмены (Ctrl+Z). */
    masterLine() {
      const m = this.model; if (!m || this.rec || this.saving || this.starting) return;
      const ed = this.editor; ed.pushHist(); const keepSegs = ed.hist[ed.hist.length - 1].segs;
      const r = { phrases: 0, trimN: 0, cut: 0, clicks: 0, bal: null, s0: null, s1: null };
      try {
        r.phrases = this._splitCore(m);
        r.s0 = this._levelSpread(m);
        const t = this._trimCore(m); r.trimN = t.n; r.cut = t.cut;
        r.clicks = this._declickCore(m);
        r.bal = this._balanceCore(m);
        r.s1 = this._levelSpread(m);
      } catch (e) {
        ed.undo(); ed.redoStack = [];
        return toast(tr('Мастер реплики не смог завершить работу, всё возвращено как было: ', 'Line master could not finish, everything was restored: ') + e.message, 'err');
      }
      const moved = r.bal ? r.bal.moved : 0, changed = !!(r.phrases || r.trimN || r.clicks || moved);
      if (!changed) { ed.dropHist(); m.segs = keepSegs; }
      else { this.dirty = true; this.refreshEditor(); }
      const row = (ic, tx) => h('div', { class: 'vxp-line' }, h('span', { class: 'n' }, ic), h('span', { class: 'c' }, tx));
      const db = (v) => v.toFixed(1).replace('.', tr(',', '.')) + ' ' + tr('дБ', 'dB');
      const rep = [
        h('div', { class: 'vxp-title' }, h('span', null, '🧙 ' + tr('Мастер реплики', 'Line master'))),
        row(r.phrases ? '✔' : '–', r.phrases ? tr('Разбито на фразы: ' + r.phrases, 'Split into phrases: ' + r.phrases) : tr('Разбивка: пауз от 0,35 с не нашлось, фрагменты не менялись', 'Split: no pauses of 0.35 s or more, fragments unchanged')),
        row(r.trimN ? '✔' : '–', r.trimN ? tr('Подрезана тишина: ' + r.cut.toFixed(2) + ' с в ' + r.trimN + ' кус.', 'Silence trimmed: ' + r.cut.toFixed(2) + ' s in ' + r.trimN + ' piece(s)') : tr('Подрезка: лишней тишины по краям нет', 'Trim: no extra silence at the edges')),
        row(r.clicks ? '✔' : '–', r.clicks ? tr('Щелчки убраны в кусках: ' + r.clicks, 'Clicks removed in ' + r.clicks + ' piece(s)') : tr('Щелчки: исправимых не найдено', 'Clicks: none that can be fixed')),
        row(moved ? '✔' : '–', r.bal ? (moved ? tr('Громкость выровнена в кусках: ' + moved, 'Levels balanced in ' + moved + ' piece(s)') : tr('Громкость: куски уже ровные', 'Levels: pieces are already even')) : tr('Громкость: нужно минимум 2 куска', 'Levels: need at least 2 pieces'))
          + (r.bal && r.s0 != null && r.s1 != null && moved ? tr(' (разброс ' + db(r.s0) + ' → ' + db(r.s1) + ')', ' (spread ' + db(r.s0) + ' → ' + db(r.s1) + ')') : ''),
      ];
      rep.push(h('div', { class: 'vxp-hint' }, changed ? tr('Всё одним шагом: Ctrl+Z вернёт запись как была. Ниже — повторная проверка результата.', 'All in one step: Ctrl+Z restores the take. Below is the re-check of the result.') : tr('Здесь нечего улучшать автоматически. Ниже — проверка записи.', 'Nothing to improve automatically here. Below is the take check.')));
      const left = this.checkTake(rep, true) || [];
      const hard = left.filter((it) => it.kind === 'clip' || it.kind === 'drop').length;
      toast(changed ? tr('Мастер реплики готов' + (left.length ? ': осталось мест — ' + left.length : ': проблем не найдено') + ' (Ctrl+Z — отмена)', 'Line master done' + (left.length ? ': spots left — ' + left.length : ': no problems found') + ' (Ctrl+Z to undo)') : tr('Мастер: автоматически улучшать нечего', 'Master: nothing to improve automatically'), hard ? 'warn' : '');
    }
    clearCheck() { this.editor.issues = null; if (this.checkBox) { this.checkBox.style.display = 'none'; this.checkBox.replaceChildren(); } }
    /** Проверка записи: список проблем с переходом меткой и отметками на дорожке. */
    checkTake(extra, quiet) {
      const m = this.model; if (!m || this.rec) return;
      let list;
      try { list = scanTake(renderModel(m), m.sr); } catch (e) { return toast(tr('Не удалось проверить запись: ', 'Could not check the take: ') + e.message, 'err'); }
      const ed = this.editor, box = this.checkBox, MAX = 12, shown = list.slice(0, MAX);
      ed.issues = shown; this._scan = list; ed.draw();
      const head = h('div', { class: 'vxp-title' }, h('span', null, tr('Проверка записи', 'Take check')), h('button', { class: 'vxp-btn icon small', type: 'button', title: tr('Скрыть', 'Hide'), onclick: () => this.clearCheck() }, '✕'));
      const rows = shown.length ? shown.map((it) => h('div', { class: 'vxp-line vxp-issue ' + ((it.kind === 'level' || it.kind === 'step') ? 'w' : 'r'), title: tr('Поставить метку сюда', 'Put the marker here'),
        onclick: () => { ed.marker = clamp(it.t, 0, this.clipDur()); ed.draw(); this.updateButtons(); } },
        h('span', { class: 'n' }, fmtT(it.t)), h('span', { class: 'c' }, it.text)))
        : [h('div', { class: 'vxp-hint' }, '✔ ' + tr('Явных проблем не найдено: перегруза, щелчков, провалов и прыжков громкости нет.', 'No obvious problems: no clipping, clicks, dropouts or level jumps.'))];
      if (list.length > MAX) rows.push(h('div', { class: 'vxp-hint' }, tr('…и ещё ' + (list.length - MAX) + ' — исправьте найденное и проверьте снова', '…and ' + (list.length - MAX) + ' more — fix these and check again')));
      const nClick = list.filter((it) => it.kind === 'click').length, nLevel = list.filter((it) => it.kind === 'level').length, acts = [];
      if (nClick) acts.push(h('button', { class: 'vxp-btn small', type: 'button', title: tr('Убирает короткие щелчки (до ~2 мс) в кусках, где они найдены. Звук куска не обрезается, отмена — Ctrl+Z', 'Removes short clicks (up to ~2 ms) in the pieces where they were found. The piece is not trimmed; undo with Ctrl+Z'), onclick: () => this.fixClicks() }, '🩹 ' + tr('Убрать щелчки (' + nClick + ')', 'Remove clicks (' + nClick + ')')));
      if (nLevel) acts.push(h('button', { class: 'vxp-btn small', type: 'button', title: tr('Подгоняет громкость кусков к средней (то же, что B)', 'Matches piece loudness to the middle value (same as B)'), onclick: () => { this.balance(); this.checkTake(); } }, '⚖ ' + tr('Выровнять громкость', 'Balance levels')));
      box.replaceChildren(head, ...(extra || []), ...rows, ...(acts.length ? [h('div', { class: 'vxp-row' }, ...acts)] : [])); box.style.display = '';
      if (!quiet) toast(shown.length ? tr('Найдено мест: ' + list.length, 'Spots found: ' + list.length) : tr('Запись в порядке', 'The take looks fine'));
      return list;
    }
    /** Ядро выравнивания: подгоняет куски к медианной громкости (через усиление куска). Возвращает { n — кусков, moved — у скольких усиление изменилось от 0,5 дБ } или null, если кусков меньше двух. */
    _balanceCore(m) {
      const info = ensureSegs(m).map((sg) => ({ sg, r: activeRms(m.base, sg.a, sg.b) })).filter((x) => x.r > 1e-4 && (x.sg.b - x.sg.a) > m.sr * 0.15);
      if (info.length < 2) return null;
      const sorted = info.map((x) => x.r).sort((a, b) => a - b), tgt = sorted[sorted.length >> 1]; let moved = 0;
      m.segs = m.segs.map((sg) => {
        const it = info.find((x) => x.sg === sg); if (!it) return sg;
        const fx = Object.assign({}, sg.fx || {}), old = fx.bal || 0; fx.bal = Math.round(clamp(20 * Math.log10(tgt / it.r), -9, 9) * 10) / 10;
        if (Math.abs(fx.bal - old) >= 0.5) moved++;
        return { ...sg, fx };
      });
      return { n: info.length, moved };
    }
    balance() {
      const m = this.model; if (!m || this.rec) return;
      this.editor.pushHist();
      if (!this._balanceCore(m)) { this.editor.dropHist(); return toast(tr('Для выравнивания нужно минимум 2 куска', 'Need at least 2 pieces to balance'), 'warn'); }
      this.dirty = true; this.refreshEditor();
      toast(tr('Громкость кусков выровнена (Ctrl+Z — отмена)', 'Piece levels balanced (Ctrl+Z to undo)'));
    }
    /** Ядро подрезки: срезает тишину по краям кусков (с запасом 60 мс), звук остаётся на своих местах. Возвращает { n, cut } (cut — секунд). */
    _trimCore(m) {
      const sr = m.sr, sp = m.params.speed || 1, pad = Math.round(0.06 * sr), next = []; let cut = 0, n = 0;
      for (const sg of ensureSegs(m)) {
        const len = sg.b - sg.a;
        if (len < sr * 0.3) { next.push(sg); continue; }
        const e = speechEdges(m.base, sg.a, sg.b, sr);
        if (!e) { next.push(sg); continue; }
        const na = Math.max(sg.a, e.a - pad), nb = Math.min(sg.b, e.b + pad);
        if (nb - na < sr * 0.05 || (na === sg.a && nb === sg.b)) { next.push(sg); continue; }
        cut += (len - (nb - na)) / sr / sp; n++;
        next.push({ ...sg, a: na, b: nb, pos: sg.pos + (na - sg.a) / sr / sp });
      }
      if (!n || cut < 0.05) return { n: 0, cut: 0 };
      m.segs = next;
      return { n, cut };
    }
    trimSilence() {
      const m = this.model; if (!m || this.rec) return;
      this.editor.pushHist();
      const { n, cut } = this._trimCore(m);
      if (!n) { this.editor.dropHist(); return toast(tr('Тишины для обрезки не нашлось', 'No silence to trim')); }
      this.dirty = true; this.refreshEditor();
      toast(tr('Подрезано кусков: ' + n + ', убрано ' + cut.toFixed(2) + ' с тишины (Ctrl+Z — отмена)', 'Trimmed ' + n + ' piece(s), removed ' + cut.toFixed(2) + ' s of silence (Ctrl+Z to undo)'));
    }
    exportWav() {
      const m = this.model; if (!m) return;
      try {
        let out = renderModel(m), info = null;
        if (settings.exportTarget) { info = masterToLufs(out, m.sr, settings.exportTarget, -1); out = info.out; }
        const blob = encodeWav(out, m.sr), a = this.doc.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'voxalike-esperion-line-' + ((this.index || 0) + 1) + '.wav';
        this.doc.body.append(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        if (info && isFinite(info.lufs)) {
          const f1 = (v) => (v < 0 ? '−' : v > 0 ? '+' : '') + Math.abs(v).toFixed(1);
          toast(tr('WAV сохранён: было ' + f1(info.lufs) + ' LUFS, стало ' + f1(info.lufs + info.gainDb) + ' LUFS (' + f1(info.gainDb) + ' дБ)' + (info.limited ? ' — выше не поднято: упёрлись в пик −1 дБ' : ''),
            'WAV saved: was ' + f1(info.lufs) + ' LUFS, now ' + f1(info.lufs + info.gainDb) + ' LUFS (' + f1(info.gainDb) + ' dB)' + (info.limited ? ' — capped by the −1 dB peak ceiling' : '')));
        } else if (settings.exportTarget) toast(tr('WAV сохранён без изменения громкости: в записи не найдено речи для измерения', 'WAV saved unchanged: no speech found to measure'));
        else toast(tr('WAV сохранён в загрузки', 'WAV saved to downloads'));
      } catch (e) { toast(tr('Не удалось сохранить WAV: ', 'Could not save WAV: ') + e.message, 'err'); }
    }
    toggleKeys() {
      if (this.keysEl) { this.keysEl.remove(); this.keysEl = null; return; }
      const rows = [
        ['R', tr('запись / стоп / следующий фрагмент', 'record / stop / next fragment')], ['Shift+R', tr('перезаписать всю реплику', 're-record the whole line')],
        ['M', tr('метка под курсор / в конец последнего фрагмента', 'marker at playhead / end of last fragment')], [', .', tr('метка на предыдущую / следующую границу фрагмента', 'marker to previous / next fragment edge')],
        ['E', tr('эффекты фрагмента под меткой', 'effects of the fragment at the marker')], ['Space', tr('прослушать свою запись', 'play my take')], ['B', tr('выровнять громкость кусков', 'balance piece levels')], ['T', tr('подрезать тишину', 'trim silence')], ['G', tr('«Мастер реплики»: всё одним шагом', 'Line master: everything in one step')], ['K', tr('проверить запись на проблемы', 'check the take for problems')], ['P', tr('разбить запись на фразы', 'split the take into phrases')],
        ['A', tr('авто-подгонка под оригинал', 'auto-align to the original')], ['[  ]', tr('сдвиг дорожки', 'nudge track')], ['Ctrl+Z', tr('отмена', 'undo')], ['Ctrl+Shift+Z / Ctrl+Y', tr('повторить', 'redo')],
        ['Enter', tr('сохранить и далее', 'save and next')], ['Esc', tr('закрыть', 'close')]];
      this.keysEl = h('div', { class: 'vxp-keys', onclick: () => this.toggleKeys() },
        h('div', { class: 'vxp-keys-card' }, h('b', null, tr('Горячие клавиши', 'Hotkeys')), ...rows.map(([a, b]) => h('div', { class: 'vxp-keyrow' }, h('kbd', null, a), h('span', null, b))), h('small', null, tr('Нажмите H или кликните, чтобы закрыть', 'Press H or click to close'))));
      this.root.append(this.keysEl);
    }
    levelWarn(samples) {
      if (!settings.levelCheck) return;
      const pk = peakOf(samples);
      if (pk < 0.03) toast(tr('Запись очень тихая — поднимите усиление микрофона', 'The recording is very quiet — raise the mic gain'), 'warn');
      else if (pk >= 0.995) toast(tr('Перегруз (клиппинг) — снизьте усиление микрофона и перепишите', 'Clipping — lower the mic gain and re-record'), 'warn');
    }
    saveDraft() {
      const g = room.state && room.state.game, m = this.model;
      if (!g || !m || this.index == null || !this.dirty || this.rec || this.saving) return;
      const sig = segSig({ segs: ensureSegs(m) }) + JSON.stringify(m.params).length + '|' + m.base.length + '|' + JSON.stringify(m.frags || []);
      if (sig === this._draftSig) return;
      this._draftSig = sig;
      drafts.put(qKey(g, this.index), m).catch(() => {});
    }
    async loadDraft(index) {
      const g = room.state && room.state.game; if (!g) return;
      const d = await drafts.get(qKey(g, index));
      if (!d || !d.model || this.index !== index || this.model || this.rec) return;
      if (Date.now() - (d.savedAt || 0) > 48 * 36e5) { drafts.del(d.key); return; }
      const m = d.model; m.params = Object.assign(defaultParams(), m.params);
      for (const sg of m.segs) segSeq = Math.max(segSeq, (sg.id || 0) + 1);
      m._segInit = m.multi ? '' : JSON.stringify([[0, m.base.length, +(+m.t0).toFixed(5), 0]]);
      this.model = m; this.dirty = true; this.refreshEditor();
      toast(tr('Восстановлен несохранённый черновик реплики', 'Restored an unsaved draft of this line'));
    }
    async select(index) {
      const g = room.state && room.state.game; if (!g || index == null) return;
      if (this.dirty && this.model) this.save(false);
      this.stopRec(true); player.stop();
      const a = g.assignments[index]; if (!a) return;
      this.index = index; this.assignment = a;
      this.clip = this.pack.clips.find((c) => c.id === a.clipId);
      if (!this.clip) { toast(tr('Клип ' + a.clipId + ' не найден в моде', 'Clip ' + a.clipId + ' not found in the mod'), 'err'); return; }
      this.title.textContent = '#' + (index + 1) + ' · ' + (a.title || this.clip.title || '');
      this.subSpeaker.textContent = this.speakerName(); this.autoCharFx();
      this.ref = null; this.setCaption(a.caption || this.clip.caption || '');
      if (this.video.src !== this.clip.videoUrl) this.video.src = this.clip.videoUrl;
      this.guideEl.src = this.clip.audioUrl || '';
      const seek = () => { try { this.video.currentTime = this.clip.videoStartSeconds || 0; } catch {} };
      if (this.video.readyState >= 1) seek(); else this.video.addEventListener('loadedmetadata', seek, { once: true });
      this.ref = null;
      try {
        const d = await decodeBlob(this.clip.audioFile || this.clip.audioUrl);
        if (this.index !== index) return;
        this.ref = { samples: d.samples, sr: d.sampleRate, duration: d.duration }; this.buildPrompter();
      } catch (e) { console.warn('[ESPERION] ref decode', e); }
      const q = queue.get(qKey(g, index));
      this.model = q ? q.model : null; this.dirty = false; this._draftSig = null; this.openFrag = null; this._fragSig = null;
      this.refreshEditor();
      this.renderList();
      if (!q) this.loadDraft(index);
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
        this.btnRecord.textContent = tr('■ Стоп', '■ Stop');
        this.btnRecord.disabled = false;
        this.btnRerecord.textContent = tr('■ Стоп', '■ Stop');
        this.btnRerecord.disabled = true;
      } else {
        this.btnRecord.textContent = this.model ? tr('➕ Следующий фрагмент', '➕ Next fragment') : tr('● Записать', '● Record');
        this.btnRecord.disabled = busy || this.counting;
        this.btnRerecord.textContent = tr('⟲ Перезаписать', '⟲ Re-record');
        this.btnRerecord.disabled = busy || this.counting || !this.model;
      }
      
      this.btnMine.disabled = recOn || busy || this.counting || !this.model;
      [this.btnMaster, this.btnSplit, this.btnBalance, this.btnTrim, this.btnCheck, this.btnWav].forEach((b) => { b.disabled = recOn || busy || this.counting || !this.model; });
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
        onTick: (t) => { ed.playhead = t; ed.draw(); this.updatePrompter(t); },
        onEnd: () => { ed.playhead = null; ed.draw(); this.updatePrompter(null); this.btnOrig.textContent = tr('▶ Оригинал', '▶ Original'); this.video.pause(); this.video.muted = true; try { this.video.currentTime = c.videoStartSeconds; } catch {} } });
    }
    playMine(withRef, startOverride) {
      if (player.playing) { player.stop(); return; }
      if (!this.model) return;
      const startAt = startOverride != null ? startOverride : this.editor.playStart();
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
            if (ed.marker == null && this.model.frags && this.model.frags.length) ed.marker = this.model.frags[this.model.frags.length - 1].t1 + this.model.params.offset / 1000;
            if (ed.marker != null && ed.marker >= this.clipDur() - 0.15) {
              this.starting = false;
              this.updateButtons();
              return toast(tr('Метка в конце реплики — передвиньте её назад, чтобы записать фрагмент', 'The marker is at the end of the line — move it back to record a fragment'), 'warn');
            }
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
    async startRec(punchPos, opts) {
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
      // прогрев: убеждаемся, что микрофон реально отдаёт данные, до отсчёта (без искусственной задержки — ждём факт, а не таймер)
      await cap.ready;
      if (cap.health.trackEnded || track.readyState !== 'live') { cap.abort(); toast(tr('Микрофон отключился до начала записи. Проверьте устройство и повторите.', 'The microphone disconnected before recording. Check the device and try again.'), 'err'); return; }
      if (cap.startFrame == null) { cap.abort(); toast(tr('Микрофон не передаёт звук (нет данных). Проверьте, что он выбран и не занят другим приложением.', 'The microphone is not delivering audio. Make sure it is selected and not used by another app.'), 'err'); return; }
      const c = this.clip, dur = this.clipDur(), C = settings.countdown, vOff = punchPos != null ? punchPos : 0, start = (c.videoStartSeconds || 0) + vOff;
      const rec = this.rec = { cap, videoCtx: null, timers: [], punch: punchPos != null, punchPos, vOff, forceReplace: !!(opts && opts.forceReplace), takes: opts && opts.takes };
      // закреплённый фрагмент впереди: запись остановится прямо перед ним
      const lockF = punchPos != null && this.model ? (this.model.frags || []).filter((f) => f.locked && f.t0 > vOff + 0.05).sort((a, b) => a.t0 - b.t0)[0] : null;
      rec.lockT = lockF ? lockF.t0 : null;
      const winEndTL = dur + 0.4, winEnd = Math.max(0.3, (lockF ? Math.min(winEndTL, lockF.t0) : winEndTL) - vOff);
      const plannedPerf = performance.now() + C * 1000;
      const liveT0 = () => (cap.startCtx == null ? vOff : vOff + cap.startCtx - (rec.videoCtx != null ? rec.videoCtx : cap.perfToCtx(plannedPerf)));
      cap.onHealth = (hh) => {
        if (this.rec !== rec) return;
        if (hh.trackEnded) { toast(tr('Микрофон отключился — сохраняю записанное до этого момента', 'Microphone disconnected — keeping what was recorded so far'), 'warn'); this.stopRec(false); }
        else if (hh.muted) { this.cue.textContent = tr('● МИКРОФОН ЗАГЛУШЁН СИСТЕМОЙ', '● MIC MUTED BY SYSTEM'); }
        else if (hh.suspended) { this.cue.textContent = tr('● АУДИО ПРИОСТАНОВЛЕНО', '● AUDIO SUSPENDED'); }
      };
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
        const tail = rec.lockT != null ? 0 : settings.tailSec;
        const tick = () => {
          if (this.rec !== rec) return;
          if (this.cue.className.indexOf('tail') < 0) this.cue.textContent = tr('● ЗАПИСЬ ', '● REC ') + fmtT(vOff + (performance.now() - perf) / 1000) + (rec.lockT != null ? tr('  · до 🔒', '  · to 🔒') : '');
          rec.timers.push(wst(tick, 200));
        };
        tick();
        { const pt = () => { if (this.rec !== rec) return; this.updatePrompter(vOff + (performance.now() - perf) / 1000); rec.timers.push(wst(pt, 80)); }; pt(); }
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
      try { rec.stopT = this.video.currentTime - ((this.clip && this.clip.videoStartSeconds) || 0); } catch { rec.stopT = 0; }
      if (!discard) this.saving = true;
      rec.timers.forEach(wct);
      rec.cap.onData = null; rec.cap.onHealth = null; // последний кусок после остановки не должен включать живой режим
      this.video.pause(); this.guideEl.pause();
      this.cue.className = 'vxp-cue';
      this.updatePrompter(null);
      this.editor.setLive(null);
      this.updateButtons();
      rec.cap.stop().then((res) => {
        if (!discard) this.saving = false;
        if (this.rec !== null) return; // если началась новая запись, игнорируем старую
        if (discard || rec.videoCtx == null || res.startCtx == null || !res.samples.length) {
          if (!discard && rec.videoCtx == null) toast(tr('Запись отменена (слишком рано остановлена)', 'Recording cancelled (stopped too early)'), 'warn');
          else if (!discard && (res.startCtx == null || !res.samples.length)) toast(tr('В записи нет звука: микрофон не передал данных', 'The recording has no audio: the microphone delivered no data'), 'err');
          this.refreshEditor(); return;
        }
        this.levelWarn(res.samples);
        if (rec.punch && this.model) { this.punchMerge(res, rec); return; }
        const fx = settings.fx;
        this.model = {
          base: normalizeTake(res.samples), sr: res.sr, t0: res.startCtx - rec.videoCtx,
          outLen: Math.round((this.clipDur() + 0.4) * res.sr),
          params: defaultParams(),
        };
        initSegs(this.model);
        this.dirty = true;
        this.refreshEditor();
        this.afterFragment(rec, 0);
        try { this.video.currentTime = this.clip.videoStartSeconds; } catch {}
      });
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
      m.multi = true; // в base теперь несколько дублей подряд
      const old = m.base, base = new Float32Array(old.length + nw.length);
      base.set(old); base.set(nw, old.length);
      m.base = base;
      ensureSegs(m);
      const pos = pos0 + idx / sr, dur = nw.length / sr / (m.params.speed || 1);
      if (settings.punchReplace || rec.forceReplace) m.segs = carveSegs(m, pos, pos + dur);
      const seg = { id: segSeq++, a: old.length, b: base.length, pos };
      m.segs.push(seg);
      ed.sel.clear(); ed.sel.add(seg.id);
      this.dirty = true;
      this.refreshEditor();
      this.afterFragment(rec, rec.punchPos, !!(settings.punchReplace || rec.forceReplace));
      toast(tr('Фрагмент добавлен — метка перенесена в конец, можно писать дальше', 'Fragment added — marker moved to its end, keep recording'));
      try { this.video.currentTime = this.clip.videoStartSeconds; } catch {}
    }
    save(next) {
      const g = room.state && room.state.game;
      if (!g || !this.model || this.index == null) return;
      if (g.takes.some((t) => t.assignmentIndex === this.index)) { toast(tr('Эта реплика уже отправлена', 'This line has already been sent'), 'err'); return; }
      { const key = qKey(g, this.index), q = { index: this.index, clipId: this.assignment.clipId, model: this.model, status: 'ready', savedAt: Date.now() };
        queue.set(key, q); qdb.put(key, q, g).then((ok) => { if (ok === null && !qdb.warned) { qdb.warned = true; toast(tr('Браузер не даёт сохранить очередь на диск — после F5 она пропадёт', 'The browser won\'t store the queue on disk — it will be lost on F5'), 'err'); } }); }
      this.dirty = false;
      drafts.del(qKey(g, this.index)).catch(() => {});
      emit('queue');
      trySubmit();
      if (!next) return;
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
      queue.delete(qKey(g, this.index)); persistDel(qKey(g, this.index)); drafts.del(qKey(g, this.index)).catch(() => {});
      this.model = null; this.dirty = false;
      this.refreshEditor(); emit('queue');
    }
  }
