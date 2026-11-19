  /*  Дубли игры: модель, обработка, буфер                              */
  /* ================================================================== */
  const takeOrig = new WeakMap();   // playerAudio -> исходные сэмплы игры
  const takeModels = new WeakMap(); // playerAudio -> model
  const ownUrls = new Set();        // URL дублей, созданные модом (старые освобождаем)
  function origSamplesOf(pa) {
    let o = takeOrig.get(pa);
    if (!o) { o = new Float32Array(pa.samples); takeOrig.set(pa, o); }
    return o;
  }
  function nativeModel(pa) {
    let m = takeModels.get(pa);
    if (!m) {
      m = { base: origSamplesOf(pa), sr: pa.sampleRate, t0: 0, outLen: pa.samples.length, params: defaultParams(), ext: false };
      initSegs(m);
      takeModels.set(pa, m);
    }
    return m;
  }
  function applyNative(entry) {
    const pa = entry && entry.playerAudio;
    if (!pa) return;
    const m = nativeModel(pa);
    pa.samples.set(isDefaultModel(m) ? origSamplesOf(pa) : renderModel(m));
    const old = entry.playerUrl;
    const url = URL.createObjectURL(encodeWav(pa.samples, pa.sampleRate));
    ownUrls.add(url);
    if (old) {
      urlRedirect.set(old, url);
      if (ownUrls.has(old)) { ownUrls.delete(old); setTimeout(() => URL.revokeObjectURL(old), 4000); }
    }
    entry.playerUrl = url; // новый ключ → игра заново кодирует и отправит обработанный дубль
    qsa('audio').forEach((a) => {
      const s = a.currentSrc || a.src;
      if (s && s !== url && resolveUrl(s) === url) { const paused = a.paused; a.src = url; if (!paused) a.play().catch(() => {}); }
    });
  }
  /** Подключить расширенную запись (с буфером) к дублю игры. */
  function attachExt(pa, ext, expectSec) {
    const m = nativeModel(pa);
    if (!segsPristine(m)) return false; // пользователь уже смонтировал дубль — не трогаем
    const big = resample(ext.samples, ext.sr, pa.sampleRate);
    const orig = origSamplesOf(pa);
    if (big.length < orig.length * 0.8) return false;
    const L = locate(orig, big, pa.sampleRate, expectSec); // orig[0] == big[L]
    const r1 = rms(orig), r2 = rms(big, Math.max(0, L), Math.min(big.length, L + orig.length));
    const k = r2 > 1e-5 ? clamp(r1 / r2, 0.25, 8) : 1;
    if (k !== 1) for (let i = 0; i < big.length; i++) big[i] *= k;
    m.base = big; m.t0 = -L / pa.sampleRate; m.ext = true; m.extTail = (big.length - L - orig.length) / pa.sampleRate;
    initSegs(m);
    return true;
  }

  /** Параллельная запись к родной записи игры: живая волна + буфер после реплики. */
  const nativeRec = {
    cap: null, takeBefore: null, anchorCtx: null, phase: 'idle', tailTimer: 0, tailEnd: 0, pre: false,
    async preStart() {
      // во время отсчёта: начинаем захват заранее, если микрофон игры уже открыт
      const m = app.mic(); const tr = m && m.stream && m.stream.getAudioTracks && m.stream.getAudioTracks()[0];
      if (!tr || tr.readyState !== 'live') return;
      this.reset();
      try { this.cap = await Capture.open(tr.clone(), { noMonitor: true }); this.pre = true; this.phase = 'pre'; this.bindLive(); } catch (e) { console.warn('[Voxalike+OrdaxEd] pre capture', e); }
    },
    async onStart(stream) {
      this.takeBefore = (currentTake() || {}).playerAudio || null;
      this.anchorCtx = null;
      if (!(this.cap && this.pre && !this.cap.stopped && performance.now() - this.cap.openedPerf < 15000)) {
        this.reset();
        const tr = stream.getAudioTracks && stream.getAudioTracks()[0];
        if (!tr) return;
        try { this.cap = await Capture.open(tr.clone(), { noMonitor: true }); } catch (e) { console.warn('[Voxalike+OrdaxEd] capture', e); return; }
        this.bindLive();
      }
      this.pre = false; this.phase = 'rec';
      const startPerf = performance.now();
      const vid = qs('.talk-stage-frame video') || qs('main video');
      if (vid) {
        const mark = () => { if (this.cap && this.anchorCtx == null) this.anchorCtx = this.cap.perfToCtx(performance.now()); };
        vid.addEventListener('playing', mark, { once: true });
        setTimeout(() => { if (this.cap && this.anchorCtx == null) this.anchorCtx = this.cap.perfToCtx(startPerf + 650); }, 1500);
      }
    },
    onStop() {
      if (!this.cap || this.phase !== 'rec') return;
      const tail = settings.tailSec;
      this.phase = 'tail'; this.tailEnd = performance.now() + tail * 1000;
      wct(this.tailTimer);
      this.tailTimer = wst(() => this.finish(), tail * 1000);
      emit('native-rec');
    },
    bindLive() {
      const cap = this.cap;
      cap.onData = () => emit('native-live', cap);
    },
    liveView() {
      const cap = this.cap;
      if (!cap || cap.startCtx == null || this.phase === 'idle') return null;
      const anchor = this.anchorCtx != null ? this.anchorCtx : cap.startCtx + (this.phase === 'pre' ? settings.countdown + 0.6 : 0.6);
      const s = app.session();
      const dur = s && s.referenceAudio ? s.referenceAudio.samples.length / s.referenceAudio.sampleRate : 0;
      return { buf: cap.buf, len: cap.len, sr: cap.sr, t0: cap.startCtx - anchor, winEnd: dur ? dur + 0.4 : 0 };
    },
    async finish() {
      wct(this.tailTimer);
      const cap = this.cap; if (!cap) return;
      this.cap = null; this.phase = 'idle';
      const ext = await cap.stop();
      const expect = this.anchorCtx != null && ext.startCtx != null ? this.anchorCtx - ext.startCtx : null;
      emit('native-rec');
      // ждём, пока игра создаст новый дубль
      let pa = null;
      for (let i = 0; i < 30; i++) {
        const t = currentTake();
        if (t && t.playerAudio && t.playerAudio !== this.takeBefore) { pa = t.playerAudio; break; }
        await sleep(150);
      }
      if (!pa || !ext.samples.length) return;
      try {
        if (attachExt(pa, ext, expect)) {
          const t = currentTake();
          if (t && t.playerAudio === pa && !isDefaultModel(nativeModel(pa))) applyNative(t);
          emit('native-ext', pa);
        }
      } catch (e) { console.warn('[Voxalike+OrdaxEd] attach', e); }
    },
    reset() {
      wct(this.tailTimer);
      if (this.cap) { this.cap.abort(); this.cap = null; }
      this.phase = 'idle'; this.pre = false;
    },
  };
  VXP.nativeRec = nativeRec;

  /* ---------- отсчёт перед родной кнопкой «Записать» ---------- */
  let passClick = false, counting = false;
  document.addEventListener('click', async (e) => {
    const btn = e.target && e.target.closest && e.target.closest('.stage-record-button');
    if (!btn || passClick || btn.disabled) return;
    if (!settings.countdown && !settings.tailSec) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (counting) return;
    counting = true;
    try {
      nativeRec.preStart();
      const ok = await countdown(settings.countdown, { rectEl: qs('.talk-stage-frame') || qs('.single-performance-stage') });
      if (!ok) { nativeRec.reset(); emit('native-rec'); return; }
      passClick = true;
      try { btn.click(); } finally { passClick = false; }
    } finally { counting = false; }
  }, true);

  /* ================================================================== */
  /*  Очередь заранее записанных реплик (сетевая игра «Совместно»)       */
  /* ================================================================== */
  const queue = new Map(); // key -> {index, clipId, model, status, error}
  VXP.queue = queue;
  const gameKey = (g) => (room.state ? room.state.roomId : '?') + '|' + (g && g.startedAt);
  const qKey = (g, i) => gameKey(g) + '|' + i;

  /* ---------- очередь переживает F5: копия в IndexedDB ---------- */
  const qdb = {
    db: null,
    open() {
      if (this.p) return this.p;
      return (this.p = new Promise((res) => {
        try {
          const rq = indexedDB.open('vxp-queue', 1);
          rq.onupgradeneeded = () => rq.result.createObjectStore('q', { keyPath: 'key' });
          rq.onsuccess = () => res((this.db = rq.result));
          rq.onerror = () => res(null);
        } catch { res(null); }
      }));
    },
    async tx(mode, fn) {
      const db = await this.open(); if (!db) return null;
      return new Promise((res) => {
        try {
          const t = db.transaction('q', mode), out = fn(t.objectStore('q'));
          t.oncomplete = () => res(out && 'result' in out ? out.result : true);
          t.onerror = t.onabort = () => res(null);
        } catch { res(null); }
      });
    },
    put(key, q, g) {
      const m = q.model;
      return this.tx('readwrite', (st) => st.put({
        key, roomId: room.state && room.state.roomId, startedAt: g && g.startedAt, playerId: myId(), index: q.index, clipId: q.clipId, savedAt: q.savedAt || Date.now(),
        model: { base: m.base, sr: m.sr, t0: m.t0, outLen: m.outLen, ext: !!m.ext, params: JSON.parse(JSON.stringify(m.params)), segs: (m.segs || []).map((x) => ({ ...x })) },
      }));
    },
    del(key) { return this.tx('readwrite', (st) => st.delete(key)); },
    all() { return this.tx('readonly', (st) => st.getAll()); },
  };
  const persistDel = (key) => { qdb.del(key).catch(() => {}); };
  const restoredGames = new Set();
  async function restoreQueue() {
    const g = room.state && room.state.game, me = myId();
    if (!g || !me || g.mode !== 'coop') return;
    const gk = gameKey(g);
    if (restoredGames.has(gk)) return;
    restoredGames.add(gk);
    const rows = await qdb.all();
    if (!Array.isArray(rows)) return;
    let n = 0;
    for (const r of rows) {
      if (Date.now() - (r.savedAt || 0) > 36e5 * 24) { persistDel(r.key); continue; }
      if (!r.key.startsWith(gk + '|')) continue;
      const done = g.completedAt || g.takes.some((t) => t.assignmentIndex === r.index);
      if (done || r.playerId !== me) { if (done) persistDel(r.key); continue; }
      if (queue.has(r.key)) continue;
      const m = r.model;
      m.params = Object.assign(defaultParams(), m.params);
      for (const sg of m.segs) segSeq = Math.max(segSeq, (sg.id || 0) + 1);
      m._segInit = segSig(m);
      queue.set(r.key, { index: r.index, clipId: r.clipId, model: m, status: 'ready', savedAt: r.savedAt, restored: true });
      n++;
    }
    if (n) { toast(tr('Восстановлено реплик из очереди: ' + n, 'Restored lines from the queue: ' + n)); emit('queue'); trySubmit(); }
  }
  const myId = () => room.playerId || (room.state && room.state.playerId);
  function myLines() {
    const g = room.state && room.state.game, me = myId();
    if (!g || !me || g.mode !== 'coop') return [];
    return g.assignments.filter((a) => a.playerId === me);
  }
  function lineStatus(g, a) {
    if (g.takes.some((t) => t.assignmentIndex === a.index)) return 'sent';
    const q = queue.get(qKey(g, a.index));
    if (q && q.status === 'sending') return 'sending';
    if (q && q.status === 'ready') return 'ready';
    if (g.currentAssignmentIndex === a.index) return 'now';
    return 'todo';
  }
  const statusText = (st) => ({ sent: tr('Отправлено', 'Sent'), ready: tr('В очереди', 'Queued'), now: tr('Сейчас', 'Now'), todo: tr('Не записано', 'Not recorded'), sending: tr('Отправка…', 'Sending…') })[st];

  let submitBusy = false;
  async function trySubmit() {
    if (submitBusy || !settings.autoSubmit) return;
    syncRoomFromApp();
    const r = room.state, g = r && r.game;
    if (!g || g.completedAt || g.mode !== 'coop' || !room.token) return;
    const i = g.currentAssignmentIndex, a = g.assignments[i];
    if (!a || a.playerId !== myId()) return;
    if (g.takes.some((t) => t.assignmentIndex === i)) return;
    const q = queue.get(qKey(g, i));
    if (!q || q.status !== 'ready') return;
    submitBusy = true; q.status = 'sending'; emit('queue');
    try {
      const up = prepareUpload(renderModel(q.model), q.model.sr);
      const meta = {
        roomCode: r.roomCode, playerToken: room.token, assignmentIndex: i, clipId: a.clipId,
        turnKey: JSON.stringify([g.startedAt, i, a.clipId, a.playerId, g.lastRedoAt ?? '']), stage: 'final',
      };
      const fd = new FormData();
      fd.set('metadata', JSON.stringify(meta));
      fd.set('audio', encodeWav(up.samples, up.sampleRate), 'room-take.wav');
      const res = await window.fetch('/api/rooms/audio', { method: 'POST', headers: { 'x-voxalike-request-id': crypto.randomUUID() }, body: fd });
      if (!res.ok) { let msg = res.statusText; try { msg = (await res.json()).error || msg; } catch {} throw new Error(msg); }
      q.status = 'sent'; persistDel(qKey(g, i));
      toast(tr('✓ Реплика #' + (i + 1) + ' отправлена автоматически', '✓ Line #' + (i + 1) + ' sent automatically'));
    } catch (e) {
      q.status = 'ready'; q.error = e.message;
      toast(tr('Не удалось отправить #', 'Failed to send #') + (i + 1) + ': ' + e.message, 'err');
      await sleep(2500);
    } finally { submitBusy = false; emit('queue'); setTimeout(trySubmit, 300); }
  }
  onBus('room', () => { trySubmit(); turnNotify(); });
  let lastAppRoom = null;
  setInterval(() => {
    try {
      const r = app.room();
      if (r && r !== lastAppRoom) {
        lastAppRoom = r;
        if (r.playerToken) room.token = r.playerToken;
        if (r.playerId) room.playerId = r.playerId;
        const cur = room.state && room.state.game, nxt = r.game;
        const newer = !cur || !nxt || cur.startedAt !== nxt.startedAt ||
          nxt.currentAssignmentIndex > cur.currentAssignmentIndex || nxt.takes.length > cur.takes.length || !!nxt.completedAt !== !!cur.completedAt;
        if (room.state === null || room.state.roomCode !== r.roomCode || newer) ingestRoom(r);
      }
    } catch {}
    restoreQueue().catch(() => {});
    trySubmit();
  }, 1000);

  /* ---------- уведомление о ходе ---------- */
  let notifiedKey = '', titleTimer = 0, origTitle = '';
  function turnNotify() {
    if (!settings.notifyTurn) return;
    const g = room.state && room.state.game;
    if (!g || g.completedAt) return;
    const a = g.assignments[g.currentAssignmentIndex];
    if (!a || a.playerId !== myId()) return;
    const k = qKey(g, a.index);
    if (notifiedKey === k || queue.has(k)) return;
    notifiedKey = k;
    if (document.hidden) {
      beep(880, 0.35, 0.15);
      origTitle = origTitle || document.title;
      let on = false; clearInterval(titleTimer);
      titleTimer = setInterval(() => { document.title = (on = !on) ? tr('🎙 Ваш ход!', '🎙 Your turn!') : origTitle; }, 900);
    }
  }
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && titleTimer) { clearInterval(titleTimer); titleTimer = 0; if (origTitle) document.title = origTitle; }
  });

  /* ================================================================== */
  /*  Панель на сцене озвучки                                            */
  /* ================================================================== */
  /** Выбор языка интерфейса (Авто / Русский / English). */
  function langControl() {
    const sel = h('select', { class: 'vxp-select', title: tr('Язык интерфейса мода', 'Mod interface language') },
      [['auto', tr('Авто', 'Auto')], ['ru', 'Русский'], ['en', 'English']].map(([v, t]) => h('option', { value: v }, t)));
    sel.value = settings.lang;
    sel.addEventListener('change', () => { settings.lang = sel.value; saveSettings(); relocalize(); });
    return h('label', { class: 'vxp-inline' }, h('span', null, '🌐 ' + tr('Язык', 'Language')), sel);
  }
  /** Пересобрать интерфейс на новом языке. */
  function relocalize() {
    let idx = null;
    if (studio) { idx = studio.index; if (studio.dirty && studio.model) studio.save(false); studio.close(); }
    const p = qs('#vxp-panel'); if (p) p.remove();
    panel.root = null;
    ensureMounted();
    if (idx != null) openStudio(idx);
  }
