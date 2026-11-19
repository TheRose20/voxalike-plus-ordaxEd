  /* ================================================================== */
  /*  Перехват ввода микрофона: усиление, мониторинг, детект записи      */
  /* ================================================================== */
  const audioHook = { nodes: new Set(), last: null };
  VXP.audioHook = audioHook;
  function applyGainAll() {
    for (const n of audioHook.nodes) { try { n.gain.gain.setTargetAtTime(dbToLin(settings.gainDb), n.ctx.currentTime, 0.02); } catch {} }
  }
  function updateMonitor(n) {
    const want = settings.monitorSelf && n.recording && !n.src.__vxpNoMonitor;
    try {
      if (want && !n.monitor) {
        n.monitor = n.ctx.createGain(); n.monitor.gain.value = settings.monitorVol;
        n.gain.connect(n.monitor); n.monitor.connect(n.ctx.destination);
      } else if (!want && n.monitor) {
        n.monitor.disconnect(); try { n.gain.disconnect(n.monitor); } catch {}
        n.monitor = null;
      }
    } catch {}
  }
  const updateMonitorAll = () => audioHook.nodes.forEach(updateMonitor);
  (function patchAudio() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC || !AC.prototype.createMediaStreamSource) return;
    const orig = AC.prototype.createMediaStreamSource;
    const origConnect = AudioNode.prototype.connect;
    const origDisconnect = AudioNode.prototype.disconnect;
    const nrLoaded = new WeakMap();
    const loadNR = (ctx) => {
      if (!nrLoaded.has(ctx)) {
        const url = URL.createObjectURL(new Blob([NR_WORKLET], { type: 'text/javascript' }));
        nrLoaded.set(ctx, ctx.audioWorklet.addModule(url).finally(() => setTimeout(() => URL.revokeObjectURL(url), 5000)));
      }
      return nrLoaded.get(ctx);
    };
    /** Шумодав между микрофоном и усилителем: включается/выключается на лету. */
    function applyNR(node) {
      if (node.dead) return;
      if (settings.nr && !node.nrNode && !node.nrPending) {
        if (!node.ctx.audioWorklet || typeof AudioWorkletNode === 'undefined') return;
        node.nrPending = true;
        loadNR(node.ctx).then(() => {
          node.nrPending = false;
          if (node.dead || !settings.nr || node.nrNode) return;
          const nn = new AudioWorkletNode(node.ctx, 'vxp-nr', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1], channelCount: 1, channelCountMode: 'explicit' });
          nn.port.onmessage = (e) => { if (e.data && e.data.r != null) node.nrRed = e.data.r; };
          nn.port.postMessage({ s: settings.nrStrength / 100 });
          if (settings.nrProf) nn.port.postMessage({ prof: settings.nrProf.p, sr: settings.nrProf.sr });
          origConnect.call(node.src, nn); origConnect.call(nn, node.gain); origDisconnect.call(node.src, node.gain);
          node.nrNode = nn;
        }).catch((e) => { node.nrPending = false; console.warn('[Voxalike+OrdaxEd] noise suppressor', e); });
      } else if (!settings.nr && node.nrNode) {
        const nn = node.nrNode; node.nrNode = null; node.nrRed = 0;
        try { origConnect.call(node.src, node.gain); } catch {}
        try { origDisconnect.call(node.src, nn); } catch {}
        try { nn.disconnect(); } catch {}
      }
    }
    audioHook.applyNR = () => audioHook.nodes.forEach(applyNR);
    audioHook.setProf = () => audioHook.nodes.forEach((n) => { if (n.nrNode) n.nrNode.port.postMessage(settings.nrProf ? { prof: settings.nrProf.p, sr: settings.nrProf.sr } : { prof: null }); });
    /** Отдельная короткая запись тишины для профиля шума (не зависит от игры). */
    audioHook.learn = async (secs = 2.5) => {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = new AC();
      try {
        await ctx.resume(); await loadNR(ctx);
        const src = orig.call(ctx, stream);
        const nn = new AudioWorkletNode(ctx, 'vxp-nr', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1], channelCount: 1, channelCountMode: 'explicit' });
        const zero = ctx.createGain(); zero.gain.value = 0;
        origConnect.call(src, nn); origConnect.call(nn, zero); origConnect.call(zero, ctx.destination);
        const frames = Math.round((secs * ctx.sampleRate) / 128);
        return await new Promise((res, rej) => {
          const to = setTimeout(() => rej(new Error('timeout')), (secs + 5) * 1000);
          nn.port.onmessage = (e) => { if (e.data && e.data.done) { clearTimeout(to); res(e.data); } };
          nn.port.postMessage({ s: 0, learn: frames });
        });
      } finally {
        try { stream.getTracks().forEach((t) => t.stop()); } catch {}
        try { ctx.close(); } catch {}
      }
    };
    audioHook.setNR = () => audioHook.nodes.forEach((n) => { if (n.nrNode) n.nrNode.port.postMessage({ s: settings.nrStrength / 100 }); });
    AC.prototype.createMediaStreamSource = function (stream) {
      const src = orig.call(this, stream);
      try {
        const ctx = this, gain = ctx.createGain();
        gain.gain.value = dbToLin(settings.gainDb);
        origConnect.call(src, gain);
        const node = { ctx, src, gain, monitor: null, recording: false, analyser: null, nrNode: null, nrPending: false, nrRed: 0, dead: false };
        audioHook.nodes.add(node); audioHook.last = node;
        applyNR(node);
        src.connect = function (dest, ...rest) {
          if (typeof AudioWorkletNode !== 'undefined' && dest instanceof AudioWorkletNode && !node.recording) {
            node.recording = true; updateMonitor(node);
            if (!src.__vxpOwn) { try { nativeRec.onStart(stream); } catch (e) { console.warn('[Voxalike+OrdaxEd]', e); } }
          }
          return gain.connect(dest, ...rest);
        };
        src.disconnect = function (...args) {
          if (!args.length) {
            const was = node.recording;
            node.recording = false; updateMonitor(node);
            node.dead = true;
            if (node.nrNode) { try { node.nrNode.disconnect(); } catch {} node.nrNode = null; }
            try { origDisconnect.call(gain); } catch {}
            audioHook.nodes.delete(node);
            if (audioHook.last === node) audioHook.last = null;
            if (was && !src.__vxpOwn) { try { nativeRec.onStop(); } catch (e) { console.warn('[Voxalike+OrdaxEd]', e); } }
            return origDisconnect.call(src);
          }
          return gain.disconnect(...args);
        };
      } catch (e) { console.warn('[Voxalike+OrdaxEd] mic hook', e); }
      return src;
    };
  })();
  /* ---------- «чистый микрофон»: без эхо/шумоподавления браузера ---------- */
  // Игра открывает микрофон с echoCancellation (и в режиме по умолчанию с noiseSuppression):
  // эти фильтры браузера приглушают голос, пока играет звук, и «съедают» слоги — отсюда провалы.
  const micTracks = new Set();
  const rawConstraints = (raw) => ({ echoCancellation: !raw, noiseSuppression: !raw, autoGainControl: false });
  (function patchGUM() {
    const md = navigator.mediaDevices;
    if (!md || !md.getUserMedia) return;
    const orig = md.getUserMedia.bind(md);
    md.getUserMedia = function (c) {
      try {
        if (c && c.audio) {
          const a = typeof c.audio === 'object' ? { ...c.audio } : {};
          if (settings.rawMic) Object.assign(a, rawConstraints(true));
          else a.autoGainControl = false; // автоусиление браузера выравнивает громкость сам: крик тише, тихое громче
          c = { ...c, audio: a };
        }
      } catch {}
      return orig(c).then((s) => {
        try { s.getAudioTracks().forEach((t) => { micTracks.add(t); t.addEventListener('ended', () => micTracks.delete(t)); }); } catch {}
        return s;
      });
    };
  })();
  function applyRawMic() {
    for (const t of micTracks) {
      if (t.readyState !== 'live') { micTracks.delete(t); continue; }
      try { t.applyConstraints(rawConstraints(settings.rawMic)).catch(() => {}); } catch {}
    }
  }
  function meterLevel() {
    const n = audioHook.last;
    if (!n || n.ctx.state === 'closed') return null;
    try {
      if (!n.analyser) { n.analyser = n.ctx.createAnalyser(); n.analyser.fftSize = 1024; n.gain.connect(n.analyser); n.buf = new Float32Array(1024); }
      n.analyser.getFloatTimeDomainData(n.buf);
      return peakOf(n.buf);
    } catch { return null; }
  }

  /* ================================================================== */
  /*  Подмена URL дубля после обработки                                  */
  /* ================================================================== */
  const urlRedirect = new Map();
  const resolveUrl = (u) => { let x = u, g = 0; while (urlRedirect.has(x) && g++ < 50) x = urlRedirect.get(x); return x; };
  (function patchMedia() {
    const P = HTMLMediaElement.prototype, op = P.play;
    P.play = function () {
      try { const s = this.currentSrc || this.src; if (s && urlRedirect.has(s)) { const t = this.currentTime; this.src = resolveUrl(s); try { this.currentTime = t; } catch {} } } catch {}
      return op.apply(this, arguments);
    };
  })();

  /* ================================================================== */
  /*  Состояние комнаты: fetch + WebSocket                               */
  /* ================================================================== */
  const room = { state: null, token: null, playerId: null, code: null };
  VXP.room = room;
  function ingestRoom(obj) {
    if (!obj || typeof obj !== 'object') return;
    const r = obj.room && obj.room.roomCode ? obj.room : obj;
    if (!r || !r.roomCode || !Array.isArray(r.players)) return;
    if (room.code && room.code !== r.roomCode && !r.playerToken) { room.token = null; room.playerId = null; }
    room.code = r.roomCode;
    if (r.playerToken) room.token = r.playerToken;
    if (r.playerId) room.playerId = r.playerId;
    room.state = r;
    emit('room', r);
  }
  const origFetch = window.fetch;
  window.fetch = async function (input, init) {
    let url = typeof input === 'string' ? input : (input && input.url) || String(input || '');
    if (url.startsWith('blob:') && urlRedirect.has(url)) return origFetch.call(this, resolveUrl(url), init);
    const isRooms = url.includes('/api/rooms/');
    if (isRooms) {
      try {
        const b = init && init.body;
        let j = null;
        if (typeof b === 'string') j = JSON.parse(b);
        else if (typeof FormData !== 'undefined' && b instanceof FormData && b.get('metadata')) j = JSON.parse(b.get('metadata'));
        if (j && j.playerToken) { room.token = j.playerToken; if (j.roomCode) room.code = j.roomCode; }
      } catch {}
    }
    const res = await origFetch.apply(this, arguments);
    if (isRooms && res.ok && !url.includes('/public')) res.clone().json().then(ingestRoom).catch(() => {});
    return res;
  };
  (function patchWS() {
    const OWS = window.WebSocket;
    if (!OWS) return;
    class VxpWS extends OWS {
      constructor(...a) {
        super(...a);
        try {
          if (String(a[0]).includes('/api/rooms/socket')) {
            this.addEventListener('message', (e) => {
              if (typeof e.data !== 'string' || !e.data.includes('"room-state"')) return;
              try { const j = JSON.parse(e.data); if (j.type === 'room-state' && j.room) ingestRoom(j.room); } catch {}
            });
          }
        } catch {}
      }
    }
    window.WebSocket = VxpWS;
  })();

  /* ================================================================== */
  /*  Доступ к состоянию React-приложения (по форме данных)              */
  /* ================================================================== */
  function fiberOf(el) {
    if (!el) return null;
    const k = Object.keys(el).find((k) => k.startsWith('__reactFiber$'));
    return k ? el[k] : null;
  }
  function scanHooks(pred) {
    const start = qs('.single-stage-control-deck') || qs('main') || qs('#root > *');
    let f = fiberOf(start), d = 0;
    while (f && d < 90) {
      if (f.memoizedState && (f.tag === 0 || f.tag === 11 || f.tag === 15)) {
        let hk = f.memoizedState, i = 0;
        while (hk && i < 2000) {
          const v = hk.memoizedState;
          try { if (v && typeof v === 'object' && pred(v)) return v; } catch {}
          hk = hk.next; i++;
        }
      }
      f = f.return; d++;
    }
    return null;
  }
  const isTakeMap = (o) => o && typeof o === 'object' && !Array.isArray(o) &&
    Object.values(o).some((x) => x && x.playerAudio && x.playerAudio.samples instanceof Float32Array);
  const app = {
    takeMap: () => scanHooks((v) => 'current' in v && Object.keys(v).length === 1 && isTakeMap(v.current))?.current || null,
    session: () => scanHooks((v) => v.referenceAudio && v.referenceAudio.samples && v.data && v.data.clip),
    pack: () => scanHooks((v) => Array.isArray(v.clips) && v.clips.length && v.clips[0] && 'videoStartSeconds' in v.clips[0] && 'caption' in v.clips[0]),
    room: () => scanHooks((v) => v.roomCode && v.playerToken && Array.isArray(v.players)),
    mic: () => scanHooks((v) => 'selectedDeviceId' in v && 'devices' in v),
  };
  VXP.app = app;
  function syncRoomFromApp() {
    if (room.token && room.playerId && room.state) return;
    const r = app.room();
    if (r) { room.token = room.token || r.playerToken; room.playerId = room.playerId || r.playerId; if (!room.state || room.state.roomCode !== r.roomCode) ingestRoom(r); }
  }
  function currentClip() {
    const s = app.session(), p = app.pack();
    if (!s || !p) return null;
    return p.clips.find((c) => c.audioUrl && c.audioUrl === s.referenceAudioUrl) ||
      p.clips.find((c) => c.caption === s.data.clip.caption) || null;
  }
  function currentTake() {
    const map = app.takeMap();
    if (!map) return null;
    const clip = currentClip();
    const entries = Object.values(map).filter((e) => e && e.playerAudio);
    return (clip && entries.find((e) => e.clipId === clip.id)) || null;
  }

  /* ================================================================== */
  /*  Аудио-движок: контексты, захват, плеер                             */
  /* ================================================================== */
  let vctx = null;
  const getCtx = () => (vctx && vctx.state !== 'closed' ? vctx : (vctx = new (window.AudioContext || window.webkitAudioContext)()));
  const ctxByRate = new Map();
  function makeBuffer(samples, sr) {
    const ctx = getCtx(), b = ctx.createBuffer(1, Math.max(1, samples.length), sr);
    b.copyToChannel(samples, 0);
    return b;
  }
  const decodeCache = new WeakMap();
  async function decodeBlob(blobOrUrl) {
    let blob = blobOrUrl;
    if (typeof blobOrUrl === 'string') blob = await (await origFetch(blobOrUrl)).blob();
    if (decodeCache.has(blob)) return decodeCache.get(blob);
    const buf = await getCtx().decodeAudioData(await blob.arrayBuffer());
    const res = { samples: mixToMono(buf), sampleRate: buf.sampleRate, duration: buf.duration };
    decodeCache.set(blob, res);
    return res;
  }
  const worklets = new WeakMap();
  function ensureWorklet(ctx) {
    if (worklets.has(ctx)) return worklets.get(ctx);
    const code = `class VxpRec extends AudioWorkletProcessor{constructor(){super();this.b=new Float32Array(1024);this.n=0;this.s=-1;this.port.onmessage=e=>{if(e.data==='flush'){if(this.n)this.port.postMessage({f:this.s,d:this.b.slice(0,this.n)});this.n=0;this.port.postMessage('done')}}}
process(inp){const x=inp[0];if(x&&x.length){const L=x[0].length;for(let i=0;i<L;i++){if(this.n===0)this.s=currentFrame+i;let v=0;for(let c=0;c<x.length;c++)v+=x[c][i];this.b[this.n++]=v/x.length;if(this.n===this.b.length){this.port.postMessage({f:this.s,d:this.b.slice()});this.n=0}}}return true}}
registerProcessor('vxp-rec',VxpRec);`;
    const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
    const p = ctx.audioWorklet.addModule(url);
    worklets.set(ctx, p);
    return p;
  }
  /** Захват микрофона с живыми данными. */
  class Capture {
    static async open(track, { noMonitor = false } = {}) {
      const stream = new MediaStream([track]);
      const rate = (track.getSettings && track.getSettings().sampleRate) || 0;
      let ctx = getCtx(), src;
      const tryCtx = async (c) => { await c.resume().catch(() => {}); await ensureWorklet(c); return c.createMediaStreamSource(stream); };
      try {
        if (IS_FF && rate && rate !== ctx.sampleRate) throw new Error('rate');
        src = await tryCtx(ctx);
      } catch {
        const r = rate || 48000;
        ctx = ctxByRate.get(r) || new (window.AudioContext || window.webkitAudioContext)({ sampleRate: r });
        ctxByRate.set(r, ctx);
        src = await tryCtx(ctx);
      }
      const cap = new Capture();
      Object.assign(cap, { ctx, track, src, sr: ctx.sampleRate, buf: new Float32Array(ctx.sampleRate * 12), len: 0, startFrame: null, onData: null, stopped: false, openedPerf: performance.now() });
      src.__vxpOwn = true; src.__vxpNoMonitor = noMonitor;
      cap.node = new AudioWorkletNode(ctx, 'vxp-rec');
      cap.zero = ctx.createGain(); cap.zero.gain.value = 0;
      cap.node.port.onmessage = (e) => {
        if (e.data === 'done') { cap._done && cap._done(); return; }
        if (cap.stopped) return;
        if (cap.startFrame == null) cap.startFrame = e.data.f;
        cap.push(e.data.d);
        cap.onData && cap.onData(cap);
      };
      src.connect(cap.node); cap.node.connect(cap.zero).connect(ctx.destination);
      return cap;
    }
    push(d) {
      if (this.len + d.length > this.buf.length) { const nb = new Float32Array(this.buf.length * 2); nb.set(this.buf.subarray(0, this.len)); this.buf = nb; }
      this.buf.set(d, this.len); this.len += d.length;
    }
    get startCtx() { return this.startFrame == null ? null : this.startFrame / this.sr; }
    perfToCtx(perf) {
      const ts = this.ctx.getOutputTimestamp ? this.ctx.getOutputTimestamp() : null;
      if (ts && ts.contextTime != null && ts.performanceTime) return ts.contextTime + (perf - ts.performanceTime) / 1000;
      return this.ctx.currentTime - (performance.now() - perf) / 1000;
    }
    get seconds() { return this.len / this.sr; }
    async stop() {
      if (this.stopped) return this.result;
      await new Promise((res) => { this._done = res; try { this.node.port.postMessage('flush'); } catch { res(); } setTimeout(res, 300); });
      this.stopped = true;
      try { this.src.disconnect(); this.node.disconnect(); this.zero.disconnect(); } catch {}
      try { this.track.stop(); } catch {}
      this.result = { samples: this.buf.slice(0, this.len), sr: this.sr, startCtx: this.startCtx };
      return this.result;
    }
    abort() { this.stopped = true; try { this.src.disconnect(); this.node.disconnect(); this.zero.disconnect(); } catch {} try { this.track.stop(); } catch {} }
  }

  /* ---------- плеер ---------- */
  const player = {
    nodes: [], els: [], t0: 0, dur: 0, playing: false, raf: 0, onTick: null, onEnd: null, args: null, startAt: 0,
    stop() {
      this.nodes.forEach((n) => { try { n.stop(); } catch {} try { n.disconnect(); } catch {} });
      this.els.forEach((e) => { try { e.pause(); } catch {} });
      this.nodes = []; this.els = [];
      caf(this.raf);
      const was = this.playing; this.playing = false; this.args = null;
      const end = this.onEnd; this.onTick = this.onEnd = null;
      if (was && end) end();
    },
    async play(args) {
      const { tracks = [], media = [], dur, onTick, onEnd, startAt = 0 } = args;
      this.stop(); this.args = args; this.startAt = startAt;
      const ctx = getCtx(); await ctx.resume();
      for (const m of media) { try { m.el.currentTime = (m.from || 0) + startAt; m.el.muted = !!m.muted; if (m.vol != null) m.el.volume = m.vol; } catch {} }
      const at = ctx.currentTime + 0.12;
      for (const t of tracks) {
        if (!t || !t.samples) continue;
        const src = ctx.createBufferSource(); src.buffer = makeBuffer(t.samples, t.sr);
        const g = ctx.createGain(); g.gain.value = t.gain ?? 1;
        src.connect(g).connect(ctx.destination);
        const ts = t.startSec - startAt;
        if (ts >= 0) src.start(at + ts); else src.start(at, -ts);
        this.nodes.push(src);
      }
      setTimeout(() => { media.forEach((m) => { this.els.push(m.el); m.el.play().catch(() => {}); }); }, 120);
      this.t0 = performance.now() + 120; this.dur = dur; this.playing = true; this.onTick = onTick; this.onEnd = onEnd;
      const loop = () => {
        const t = (performance.now() - this.t0) / 1000 + startAt;
        if (this.onTick) this.onTick(Math.max(startAt, t));
        if (t >= this.dur) {
          if (settings.loopPlay && this.args === args) { this.onEnd = null; this.stop(); this.play(args); return; } // зацикливание: играем заново с той же точки
          return this.stop();
        }
        this.raf = raf(loop);
      };
      this.raf = raf(loop);
    },
  };
  function beep(freq = 880, dur = 0.12, vol = 0.12) {
    try {
      const ctx = getCtx(); ctx.resume();
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = freq; g.gain.value = 0.0001;
      o.connect(g).connect(ctx.destination);
      const t = ctx.currentTime; g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.start(t); o.stop(t + dur + 0.02);
    } catch {}
  }

