  /* ================================================================== */
  /*  Редактор двух дорожек                                             */
  /* ================================================================== */
  class TrackEditor {
    /** onChange(kind) — модель изменена (kind: move | offset | cut | delete | undo | reset | auto) */
    constructor({ onChange, onPlay }) {
      this.ref = null; this.model = null; this.live = null; this.playhead = null; this.marker = null; this.onMarker = null; this.cues = []; this.onCues = null;
      this.sel = new Set(); this.tool = 'move'; this.hist = []; this.hoverT = null;
      this.onChange = onChange; this.onPlay = onPlay;
      this.canvas = h('canvas', { class: 'vxp-tracks', tabindex: '0', title: tr('Клик — выбрать кусок, тянуть — двигать. Ножницы — разрезать. Delete — удалить, Ctrl+Z — отменить', 'Click — select a piece, drag — move. Scissors — cut. Delete — remove, Ctrl+Z — undo') });
      this.label = h('span', { class: 'vxp-offset' }, fmtMs(0));
      const B = (txt, title, fn, cls = 'icon') => h('button', { class: 'vxp-btn ' + cls, type: 'button', title, onclick: fn }, txt);
      this.btnMove = B('↔', tr('Выбор и перемещение кусков (V). Shift+клик — выбрать несколько', 'Select and move pieces (V). Shift+click — select several'), () => this.setTool('move'));
      this.btnCut = B('✂', tr('Ножницы: клик по своей дорожке — разрезать (S)', 'Scissors: click your track to cut (S)'), () => this.setTool('cut'));
      this.btnDel = B('🗑', tr('Удалить выбранные куски (Delete)', 'Delete selected pieces (Delete)'), () => this.deleteSel());
      this.btnUndo = B('↶', tr('Отменить (Ctrl+Z)', 'Undo (Ctrl+Z)'), () => this.undo());
      this.btnReset = B('⟲', tr('Сбросить монтаж и сдвиг', 'Reset edits and shift'), () => this.resetEdit());
      this.btnFix = B('iFix', tr('Обработка выбранного куска: реверберация, громкость, питч и другое', 'Processing for the selected piece: reverb, volume, pitch and more'), () => this.toggleFix(), 'primary');
      this.btnFix.style.display = 'none'; this.fixOpen = false; this.fixBox = null;
      this.btnPlay = B(tr('▶ Вместе', '▶ Together'), tr('Оригинал + моя запись вместе', 'Original + my take together'), () => this.onPlay && this.onPlay(), '');
      this.playOpts = h('div', { class: 'vxp-row vxp-playopts' },
        checkbox({ label: tr('Зацикливание', 'Loop'), get: () => settings.loopPlay, set: (v) => { settings.loopPlay = v; saveSettings(); }, title: tr('По окончании отрезка проигрывать заново', 'Start playing again when the section ends') }),
        checkbox({ label: tr('Играть с метки', 'Play from marker'), get: () => settings.playFromMarker, set: (v) => { settings.playFromMarker = v; saveSettings(); }, title: tr('Все кнопки воспроизведения начинают с метки (метка — клик по линейке времени над дорожкой)', 'All play buttons start at the marker (set it by clicking the time ruler above the track)') }));
      this.toolbar = h('div', { class: 'vxp-editbar' },
        (this.rowTools = h('div', { class: 'vxp-row vxp-tools' }, this.btnMove, this.btnCut, this.btnDel, this.btnUndo, this.btnReset, this.btnFix)),
        (this.rowNudge = h('div', { class: 'vxp-row vxp-tools' },
          (this.btnNudgeL = B('◀', tr('Сдвинуть влево (−10 мс, Shift −50). Если выбраны куски — только их', 'Shift left (−10 ms, Shift −50). With pieces selected — only them'), (e) => this.nudge(e.shiftKey ? -50 : -10))),
          this.label,
          (this.btnNudgeR = B('▶', tr('Сдвинуть вправо (+10 мс, Shift +50). Если выбраны куски — только их', 'Shift right (+10 ms, Shift +50). With pieces selected — only them'), (e) => this.nudge(e.shiftKey ? 50 : 10))),
          (this.btnAuto = B(tr('Авто', 'Auto'), tr('Автоподгонка к оригиналу', 'Auto-align to the original'), () => this.auto(), '')),
          this.btnPlay)),
        this.playOpts);
      this.root = h('div', { class: 'vxp-editor' }, this.canvas, this.toolbar);
      this.bindPointer();
      this.canvas.addEventListener('keydown', (e) => { if (this.handleKey(e)) { e.preventDefault(); e.stopPropagation(); } });
      new ResizeObserver(() => this.draw()).observe(this.canvas);
      this._rafPending = false;
      this.updateUi();
    }
    set(ref, model) {
      this.ref = ref;
      if (model !== this.model) { this.sel.clear(); this.hist = []; this.marker = null; }
      this.model = model;
      if (model) ensureSegs(model);
      this.updateUi(); this.draw();
    }
    setLive(live) { this.live = live; this.requestDraw(); }
    requestDraw() { if (this._rafPending) return; this._rafPending = true; raf(() => { this._rafPending = false; this.draw(); }); }
    setPlaying(p) { this.btnPlay.textContent = p ? tr('■ Стоп', '■ Stop') : tr('▶ Вместе', '▶ Together'); }
    /** Откуда играть: с метки, если включён тумблер 📍 и метка стоит; иначе с начала. */
    playStart() { return settings.playFromMarker && this.marker != null && this.model ? Math.max(0, this.marker) : 0; }
    get offset() { return this.model ? this.model.params.offset : 0; }
    setTool(t) { this.tool = t; this.hoverT = null; this.updateUi(); this.draw(); }
    updateUi() {
      const m = this.model;
      this.btnMove.classList.toggle('active', this.tool === 'move');
      this.btnCut.classList.toggle('active', this.tool === 'cut');
      this.canvas.classList.toggle('cut', this.tool === 'cut');
      this.btnDel.disabled = !this.sel.size;
      this.btnUndo.disabled = !this.hist.length;
      this.btnReset.disabled = !m || isDefaultModelEdit(m);
      this.btnFix.style.display = this.sel.size ? '' : 'none';
      this.btnFix.classList.toggle('active', this.fixOpen && !!this.sel.size);
      if (this.fixBox) { const show = this.fixOpen && !!this.sel.size && !!m; this.fixBox.style.display = show ? '' : 'none'; if (show) { this.fixTitle.textContent = 'iFix · ' + this.sel.size + ' ' + tr('кус.', 'pcs'); syncWidgets(); } }
      this.label.textContent = this.sel.size ? this.sel.size + ' ' + tr('выбр.', 'sel.') : fmtMs(this.offset);
    }
    fxOf() {
      const m = this.model, sg = m && m.segs.find((x) => this.sel.has(x.id)), f = (sg && sg.fx) || {};
      return { gain: f.gain || 0, pitch: f.pitch || 0, lowcut: !!f.lowcut, denoise: f.denoise || 0, space: Object.assign({ type: 'room', mix: 0, size: 50 }, f.space) };
    }
    setFx(patch, done) {
      const m = this.model; if (!m || !this.sel.size) return;
      if (!this._fxg) { this.pushHist(); this._fxg = true; }
      const cur = this.fxOf(), nf = Object.assign({}, cur, patch);
      if (patch.space) nf.space = Object.assign({}, cur.space, patch.space);
      const act = segFxActive(nf);
      for (const sg of m.segs) if (this.sel.has(sg.id)) sg.fx = act ? nf : undefined;
      if (done) { this._fxg = false; this.commit('ifix'); } else this.requestDraw();
    }
    toggleFix() {
      this.fixOpen = !this.fixOpen;
      if (this.fixOpen && !this.fixBox) this.buildFix();
      this.updateUi();
    }
    playSel() {
      const m = this.model; if (!m || !this.sel.size) return;
      if (player.playing) { player.stop(); return; }
      const segs = m.segs.filter((x) => this.sel.has(x.id));
      const out = renderModel(Object.assign({}, m, { segs, _rk: null, _r: null }));
      const first = Math.min(...segs.map((x) => x.pos + m.params.offset / 1000)); // играем с начала куска
      const from = Math.max(0, Math.floor((first - 0.05) * m.sr)), ed = this;
      player.play({ tracks: [{ samples: out.subarray(from), sr: m.sr, startSec: 0, gain: 1 }], dur: (out.length - from) / m.sr + 0.1,
        onTick: (t) => { ed.playhead = t + from / m.sr; ed.draw(); }, onEnd: () => { ed.playhead = null; ed.draw(); } });
    }
    buildFix() {
      const f = () => this.fxOf();
      const typeBtns = [['room', tr('Комната', 'Room')], ['hall', tr('Зал', 'Hall')], ['echo', tr('Эхо', 'Echo')]].map(([t, l]) =>
        h('button', { class: 'vxp-btn small', type: 'button', 'data-t': t, onclick: () => { const sp = f().space; this.setFx({ space: { type: t, mix: sp.mix || 25 } }, true); } }, l));
      const typeRow = h('div', { class: 'vxp-row' }, ...typeBtns);
      typeRow._sync = () => { const sp = f().space; typeBtns.forEach((b) => b.classList.toggle('primary', b.dataset.t === sp.type && !!sp.mix)); };
      widgets.add(typeRow);
      this.fixTitle = h('b', null, 'iFix');
      this.fixBox = h('div', { class: 'vxp-ifix', style: 'display:none' },
        h('div', { class: 'vxp-row', style: 'justify-content:space-between;align-items:center' }, this.fixTitle,
          h('div', { class: 'vxp-row' },
            h('button', { class: 'vxp-btn small', type: 'button', title: tr('Прослушать только выбранные куски', 'Listen to the selected pieces only'), onclick: () => this.playSel() }, tr('▶ Кусок', '▶ Piece')),
            h('button', { class: 'vxp-btn small', type: 'button', onclick: () => { this.setFx({ gain: 0, pitch: 0, lowcut: false, denoise: 0, space: { mix: 0 } }, true); } }, tr('Сбросить', 'Reset')),
            h('button', { class: 'vxp-btn icon small', type: 'button', onclick: () => { this.fixOpen = false; this.updateUi(); } }, '✕'))),
        slider({ label: tr('🔊 Громкость', '🔊 Volume'), min: -18, max: 12, step: 0.5, get: () => f().gain, set: (v, d) => this.setFx({ gain: v }, d), fmt: (v) => (v ? (v > 0 ? '+' : '−') + Math.abs(v) + ' ' + tr('дБ', 'dB') : '0 ' + tr('дБ', 'dB')) }),
        slider({ label: tr('🎚 Питч', '🎚 Pitch'), min: -12, max: 12, step: 1, get: () => f().pitch, set: (v, d) => this.setFx({ pitch: v }, d), fmt: (v) => (v ? (v > 0 ? '+' : '−') + Math.abs(v) : '0') }),
        slider({ label: tr('🧹 Шумодав', '🧹 Denoise'), min: 0, max: 100, step: 5, get: () => f().denoise, set: (v, d) => this.setFx({ denoise: v }, d), fmt: (v) => (v ? v + '%' : tr('выкл', 'off')) }),
        checkbox({ label: tr('Срез низов', 'Low cut'), get: () => f().lowcut, set: (v) => this.setFx({ lowcut: v }, true), title: tr('Убирает гул и стук (90 Гц)', 'Removes rumble and thumps (90 Hz)') }),
        h('div', { class: 'vxp-title', style: 'cursor:default' }, h('span', null, tr('Пространство', 'Space'))),
        typeRow,
        slider({ label: tr('🌌 Количество', '🌌 Amount'), min: 0, max: 100, step: 1, get: () => f().space.mix, set: (v, d) => this.setFx({ space: { mix: v } }, d), fmt: (v) => (v ? v + '%' : tr('выкл', 'off')) }),
        slider({ label: tr('📐 Размер', '📐 Size'), min: 0, max: 100, step: 1, def: 50, get: () => f().space.size, set: (v, d) => this.setFx({ space: { size: v } }, d), fmt: (v) => v + '%' }),
        h('div', { class: 'vxp-hint' }, tr('Действует только на выбранные куски. Хвост реверберации виден на дорожке.', 'Applies to the selected pieces only. The reverb tail is shown on the track.')));
      this.root.append(this.fixBox);
    }
    snapshot() { const m = this.model; return { segs: m.segs.map((s) => ({ ...s })), offset: m.params.offset }; }
    pushHist() { if (!this.model) return; this.hist.push(this.snapshot()); if (this.hist.length > 60) this.hist.shift(); }
    commit(kind) { this.updateUi(); this.draw(); if (this.onChange) this.onChange(kind); }
    undo() {
      const s = this.hist.pop(); if (!s || !this.model) return;
      this.model.segs = s.segs; this.model.params.offset = s.offset;
      const ids = new Set(s.segs.map((x) => x.id)); for (const id of [...this.sel]) if (!ids.has(id)) this.sel.delete(id);
      this.commit('undo');
    }
    nudge(d) {
      const m = this.model; if (!m) return;
      this.pushHist();
      if (this.sel.size) for (const s of m.segs) { if (this.sel.has(s.id)) s.pos += d / 1000; }
      else m.params.offset = clamp(Math.round(m.params.offset + d), -9000, 9000);
      this.commit('offset');
    }
    setOffset(ms) { if (!this.model) return; this.pushHist(); this.model.params.offset = clamp(Math.round(ms), -9000, 9000); this.commit('offset'); }
    auto() {
      if (!this.ref || !this.model) return toast(tr('Нет записи для подгонки', 'No recording to align'));
      this.pushHist();
      const ms = Math.round(alignOffset(this.model, this.ref));
      this.model.params.offset = clamp(ms, -9000, 9000);
      this.commit('auto');
      toast(tr('Автоподгонка: ', 'Auto-align: ') + fmtMs(ms));
    }
    deleteSel() {
      const m = this.model;
      if (!m || !this.sel.size) return toast(tr('Сначала выберите кусок: клик по нему', 'Select a piece first: click it'));
      if (this.sel.size >= m.segs.length) return toast(tr('Нельзя удалить всю запись — оставьте хотя бы один кусок', 'You can\'t delete the whole take — keep at least one piece'));
      this.pushHist();
      m.segs = m.segs.filter((s) => !this.sel.has(s.id));
      this.sel.clear();
      this.commit('delete');
    }
    resetEdit() {
      const m = this.model; if (!m) return;
      this.pushHist();
      initSegs(m); m.params.offset = 0; this.sel.clear();
      this.commit('reset');
    }
    selectAll() { if (!this.model) return; this.model.segs.forEach((s) => this.sel.add(s.id)); this.updateUi(); this.draw(); }
    /** Разрезать кусок в точке t (сек таймлайна, с учётом сдвига). */
    split(t) {
      const m = this.model; if (!m) return false;
      const seg = this.segAt(t); if (!seg) return false;
      const off = m.params.offset / 1000, start = seg.pos + off, sp = m.params.speed || 1;
      if (t - start < 0.02 || start + segDur(m, seg) - t < 0.02) return false;
      const k = seg.a + Math.round((t - start) * m.sr * sp);
      this.pushHist();
      const right = { id: segSeq++, a: k, b: seg.b, pos: seg.pos + (k - seg.a) / m.sr / sp };
      if (seg.fx) right.fx = seg.fx;
      seg.b = k;
      m.segs.splice(m.segs.indexOf(seg) + 1, 0, right);
      this.commit('cut');
      return true;
    }
    segAt(t) {
      const m = this.model; if (!m) return null;
      const off = m.params.offset / 1000;
      for (let i = m.segs.length - 1; i >= 0; i--) { const s = m.segs[i], a = s.pos + off; if (t >= a && t <= a + segDur(m, s)) return s; }
      return null;
    }
    handleKey(e) {
      const k = e.key, ctrl = e.ctrlKey || e.metaKey;
      if ((k === 'Delete' || k === 'Backspace') && this.sel.size) { this.deleteSel(); return true; }
      if (ctrl && (k === 'z' || k === 'Z' || k === 'я' || k === 'Я')) { this.undo(); return true; }
      if (ctrl && (k === 'a' || k === 'A' || k === 'ф' || k === 'Ф')) { this.selectAll(); return true; }
      if (!ctrl && 'sSыЫ'.includes(k)) { this.setTool(this.tool === 'cut' ? 'move' : 'cut'); return true; }
      if (!ctrl && 'vVмМ'.includes(k)) { this.setTool('move'); return true; }
      if (k === 'Escape' && (this.sel.size || this.tool !== 'move')) { this.sel.clear(); this.setTool('move'); return true; }
      return false;
    }
    view() {
      const rd = this.ref ? this.ref.samples.length / this.ref.sr : 0;
      let start = -0.3, end = Math.max(rd, 1) + 0.3;
      const ext = (lo, hi, winEnd) => {
        start = Math.min(start, Math.max(-4, lo - 0.1));
        end = Math.max(end, (winEnd || 0) + 0.3, Math.min(hi + 0.1, 14));
      };
      if (this.live) ext(this.live.t0, this.live.t0 + this.live.len / this.live.sr, this.live.winEnd);
      else if (this.model && this.model.segs && this.model.segs.length) {
        const m = this.model, off = m.params.offset / 1000;
        let lo = Infinity, hi = -Infinity;
        for (const s of m.segs) { lo = Math.min(lo, s.pos + off); hi = Math.max(hi, s.pos + off + segDur(m, s)); }
        ext(lo, hi, m.outLen / m.sr);
      }
      return { start, end };
    }
    /** Метки-ориентиры (как маркеры в DAW): ставит/убирает метку в точке t (сек); рядом (≤0.1 c) — убирает. */
    toggleCue(t) {
      if (t == null || !isFinite(t)) return;
      t = Math.round(Math.max(0, t) * 100) / 100;
      const i = this.cues.findIndex((q) => Math.abs(q - t) <= 0.1);
      if (i >= 0) this.cues.splice(i, 1); else { this.cues.push(t); this.cues.sort((a, b) => a - b); }
      this.draw(); this.onCues && this.onCues(this.cues.slice());
    }
    clearCues() { if (!this.cues.length) return; this.cues = []; this.draw(); this.onCues && this.onCues([]); }
    tAt(e, v) { const r = this.canvas.getBoundingClientRect(); return v.start + ((e.clientX - r.left) / r.width) * (v.end - v.start); }
    bindPointer() {
      let drag = null;
      const c = this.canvas;
      c.addEventListener('dblclick', (e) => {
        if (this.live || e.clientY - c.getBoundingClientRect().top > 18) return;
        this.toggleCue(this.tAt(e, this.view()));
      });
      c.addEventListener('pointerdown', (e) => {
        try { c.focus({ preventScroll: true }); } catch {}
        if (this.live || (!this.model && !this.ref)) return;
        const v = this.view(), t = this.tAt(e, v);
        
        // Если клик по верхней панели (линейке) — двигаем метку
        if (e.clientY - c.getBoundingClientRect().top <= 18) {
          this.marker = Math.max(0, t);
          drag = { kind: 'marker', v, x: e.clientX, moved: false };
          c.setPointerCapture(e.pointerId);
          this.draw(); this.onMarker && this.onMarker();
          return;
        }
        if (!this.model) return;

        if (this.tool === 'cut') { if (!this.split(t)) toast(tr('Режьте внутри своей дорожки', 'Cut inside your own track')); return; }
        const seg = this.segAt(t);
        if (!seg) {
          if (!e.shiftKey) this.sel.clear();
          drag = { kind: 'offset', x: e.clientX, o: this.model.params.offset, v, moved: false };
        } else {
          if (e.shiftKey) { if (this.sel.has(seg.id)) this.sel.delete(seg.id); else this.sel.add(seg.id); }
          else if (!this.sel.has(seg.id)) { this.sel.clear(); this.sel.add(seg.id); }
          const orig = new Map(this.model.segs.filter((s) => this.sel.has(s.id)).map((s) => [s.id, s.pos]));
          drag = { kind: 'segs', x: e.clientX, orig, v, moved: false };
        }
        c.setPointerCapture(e.pointerId);
        c.classList.add('dragging');
        this.updateUi(); this.draw();
      });
      c.addEventListener('pointermove', (e) => {
        if (!drag) {
          if (this.tool === 'cut' && this.model && !this.live) { this.hoverT = this.tAt(e, this.view()); this.requestDraw(); }
          return;
        }
        if (drag.kind === 'marker') {
          this.marker = Math.max(0, this.tAt(e, drag.v));
          drag.moved = true;
          this.draw(drag.v);
          return;
        }
        const r = c.getBoundingClientRect();
        let dt = ((e.clientX - drag.x) / r.width) * (drag.v.end - drag.v.start);
        if (!e.altKey) dt = Math.round(dt * 200) / 200; // шаг 5 мс
        if (!drag.moved && Math.abs(e.clientX - drag.x) < 2) return;
        if (!drag.moved) { this.pushHist(); drag.moved = true; }
        if (drag.kind === 'segs') { for (const s of this.model.segs) if (drag.orig.has(s.id)) s.pos = drag.orig.get(s.id) + dt; }
        else this.model.params.offset = clamp(Math.round(drag.o + dt * 1000), -9000, 9000);
        this.updateUi();
        this.draw(drag.v);
      });
      const end = () => {
        if (!drag) return;
        const d = drag; drag = null;
        c.classList.remove('dragging');
        if (d.kind === 'marker') {
          this.draw();
          this.onMarker && this.onMarker();
        } else if (d.moved) {
          this.commit(d.kind === 'segs' ? 'move' : 'offset');
        } else {
          this.updateUi(); this.draw();
        }
      };
      c.addEventListener('pointerup', end);
      c.addEventListener('pointercancel', end);
      c.addEventListener('pointerleave', () => { if (this.hoverT != null) { this.hoverT = null; this.requestDraw(); } });
    }
    draw(fixedView) {
      const c = this.canvas, dpr = window.devicePixelRatio || 1;
      const W = Math.max(50, c.clientWidth), H = Math.max(40, c.clientHeight);
      if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
      const g = c.getContext('2d');
      if (!g) return;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, W, H);
      const v = fixedView || this.view(), span = v.end - v.start, x = (t) => ((t - v.start) / span) * W;
      const ruler = 14, laneH = (H - ruler - 6) / 2;
      g.font = '600 9px Nunito Variable, system-ui, sans-serif';
      const step = span > 10 ? 2 : span > 5 ? 1 : 0.5;
      for (let t = Math.ceil(v.start / step) * step; t <= v.end; t += step) {
        const X = Math.round(x(t)) + 0.5;
        g.fillStyle = 'rgba(247,247,255,.35)'; g.fillRect(X, ruler - 4, 1, 4);
        if (Math.abs(t - Math.round(t)) < 1e-6) g.fillText(Math.round(t) + tr('с', 's'), X + 2, 9);
      }
      g.fillStyle = 'rgba(' + THEME.rgb + ',.5)'; g.fillRect(Math.round(x(0)), ruler, 1, H - ruler);
      const wave = (y0, s, len, sr, offSec, color) => {
        const mid = y0 + laneH / 2;
        g.fillStyle = color;
        const a0 = x(offSec), a1 = x(offSec + len / sr);
        for (let px = Math.max(0, Math.floor(a0)); px < Math.min(W, Math.ceil(a1)); px++) {
          const t0 = v.start + (px / W) * span - offSec, t1 = t0 + span / W;
          const i0 = Math.max(0, Math.floor(t0 * sr)), i1 = Math.min(len, Math.ceil(t1 * sr));
          let mx = 0; const stp = Math.max(1, Math.floor((i1 - i0) / 48));
          for (let k = i0; k < i1; k += stp) { const a = s[k] < 0 ? -s[k] : s[k]; if (a > mx) mx = a; }
          const hh = Math.max(1, Math.min(1, Math.sqrt(mx) * 1.05) * (laneH / 2 - 2));
          g.fillRect(px, mid - hh, 1, hh * 2);
        }
        return [a0, a1];
      };
      const tag = (y0, name, color) => {
        if (this.hideTags) return;
        g.font = '900 9px Nunito Variable, system-ui, sans-serif';
        g.fillStyle = 'rgba(5,8,14,.78)'; g.fillRect(3, y0 + 3, g.measureText(name).width + 10, 14);
        g.fillStyle = color; g.fillText(name, 8, y0 + 13);
      };
      // дорожка 1 — оригинал
      const y1 = ruler + 2;
      g.fillStyle = 'rgba(154,166,184,.06)'; g.fillRect(0, y1, W, laneH);
      if (this.ref) wave(y1, this.ref.samples, this.ref.samples.length, this.ref.sr, 0, '#9aa6b8');
      else { g.fillStyle = 'rgba(247,247,255,.28)'; g.font = '700 10px Nunito Variable, system-ui, sans-serif'; g.fillText(tr('Нет оригинала', 'No original'), 8, y1 + laneH / 2 + 3); }
      tag(y1, tr('ОРИГИНАЛ', 'ORIGINAL'), '#9aa6b8');
      // дорожка 2 — моя
      const y2 = ruler + 4 + laneH;
      g.fillStyle = 'rgba(' + THEME.mineRGB + ',.07)'; g.fillRect(0, y2, W, laneH);
      let winEnd = null;
      const m = this.model;
      if (this.live) {
        wave(y2, this.live.buf, this.live.len, this.live.sr, this.live.t0, '#ff4d5e');
        winEnd = this.live.winEnd;
        const xe = x(this.live.t0 + this.live.len / this.live.sr);
        g.fillStyle = '#ff4d5e'; g.fillRect(Math.round(xe), y2, 2, laneH);
        tag(y2, tr('● ЗАПИСЬ', '● REC'), '#ff4d5e');
      } else if (m && m.segs && m.segs.length) {
        const off = m.params.offset / 1000, multi = m.segs.length > 1;
        for (const s of m.segs) {
          const a = segAudio(m, s), selected = this.sel.has(s.id), p0 = s.pos + off;
          const xa = x(p0), xb = x(p0 + a.length / m.sr);
          g.fillStyle = selected ? 'rgba(' + THEME.mineRGB + ',.2)' : multi ? 'rgba(' + THEME.mineRGB + ',.08)' : 'rgba(' + THEME.mineRGB + ',0)';
          g.fillRect(xa, y2 + 1, xb - xa, laneH - 2);
          wave(y2, a, a.length, m.sr, p0, selected ? THEME.sel : THEME.mine);
          g.strokeStyle = selected ? THEME.sel : 'rgba(' + THEME.mineRGB + ',.75)'; g.lineWidth = selected ? 2 : 1;
          g.strokeRect(Math.round(xa) + 0.5, y2 + 0.5, Math.max(1, Math.round(xb - xa) - 1), laneH - 1);
        }
        winEnd = m.outLen / m.sr;
        tag(y2, tr('МОЯ', 'MINE') + (m.segs.length > 1 ? ' · ' + m.segs.length + ' ' + tr('кус.', 'pcs') : '') + (m.params.offset ? ' ' + fmtMs(m.params.offset) : ''), THEME.mine);
      } else {
        g.fillStyle = 'rgba(247,247,255,.28)'; g.font = '700 10px Nunito Variable, system-ui, sans-serif'; g.fillText(tr('Не записано', 'Not recorded'), 8, y2 + laneH / 2 + 3);
        tag(y2, tr('МОЯ', 'MINE'), THEME.mine);
      }
      // окно, которое уходит в игру
      if (winEnd) {
        const xa = x(0), xb = x(winEnd);
        g.fillStyle = 'rgba(2,4,8,.62)';
        if (xa > 0) g.fillRect(0, y2, xa, laneH);
        if (xb < W) g.fillRect(xb, y2, W - xb, laneH);
        g.fillStyle = 'rgba(245,196,81,.8)'; g.fillRect(Math.round(xb), ruler, 1, H - ruler);
      }
      // линия ножниц
      if (this.tool === 'cut' && this.hoverT != null && !this.live) {
        const X = Math.round(x(this.hoverT)) + 0.5;
        g.strokeStyle = '#f7f7ff'; g.lineWidth = 1; g.setLineDash([3, 3]);
        g.beginPath(); g.moveTo(X, y2); g.lineTo(X, y2 + laneH); g.stroke(); g.setLineDash([]);
      }
      if (this.playhead != null) {
        const px = Math.round(x(this.playhead));
        g.fillStyle = THEME.acc; g.fillRect(px, 6, 2, H - 6);
        g.beginPath(); g.arc(px + 1, 6, 4.5, 0, Math.PI * 2); g.fill();
      }
      if (this.cues.length) {
        g.save(); g.font = '700 10px system-ui,sans-serif'; g.textBaseline = 'middle';
        this.cues.forEach((q, i) => {
          const cx = Math.round(x(q)); if (cx < -20 || cx > W + 20) return;
          g.strokeStyle = 'rgba(82,199,255,.8)'; g.lineWidth = 1; g.beginPath(); g.moveTo(cx + 0.5, 12); g.lineTo(cx + 0.5, H); g.stroke();
          g.fillStyle = '#52c7ff'; g.fillRect(cx, 2, 15, 12); g.beginPath(); g.moveTo(cx, 14); g.lineTo(cx + 5, 14); g.lineTo(cx, 19); g.closePath(); g.fill();
          g.fillStyle = '#06222e'; g.fillText(String(i + 1), cx + 3, 8.5);
        });
        g.restore();
      }
      if (this.marker != null && (m || this.ref)) {
        const mx = Math.round(x(this.marker));
        g.save(); g.strokeStyle = THEME.acc; g.fillStyle = THEME.acc; g.lineWidth = 1.5; g.setLineDash([4, 3]);
        g.beginPath(); g.moveTo(mx + 0.5, 0); g.lineTo(mx + 0.5, H); g.stroke(); g.setLineDash([]);
        g.beginPath(); g.moveTo(mx - 6, 0); g.lineTo(mx + 6, 0); g.lineTo(mx, 9); g.closePath(); g.fill(); g.restore();
      }
    }
  }
  const isDefaultModelEdit = (m) => segsPristine(m) && !m.params.offset;
  VXP.TrackEditor = TrackEditor;
