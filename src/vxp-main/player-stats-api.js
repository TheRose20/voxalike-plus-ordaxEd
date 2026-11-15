  /*  Горячие клавиши на сцене                                           */
  /* ================================================================== */
  document.addEventListener('keydown', (e) => {
    if (!settings.hotkeys || studio || isTyping(e.target) || e.ctrlKey || e.metaKey) return;
    if (!panel.root || !panel.root.isConnected) return;
    const ed = panel.editor;
    if (e.key === '[' || e.key === 'х') { ed.nudge(e.shiftKey ? -50 : -10); e.preventDefault(); }
    else if (e.key === ']' || e.key === 'ъ') { ed.nudge(e.shiftKey ? 50 : 10); e.preventDefault(); }
  }, true);

  /* ================================================================== */
  /*  Статистика мультиплеера игроков в лобби                            */
  /* ================================================================== */
  /* Берём id игрока из аватарки карточки (/auth/avatar/usr_…), читаем публичную страницу профиля
     (/workshop/creators/usr_…) и ставим рядом с ником значки: Co-op и PvP. Результат кешируется. */
  const PS_TTL = 10 * 60 * 1000;
  const psCache = new Map(), psQueue = [];
  let psBusy = false;
  const RX = {
    head: /multiplayer stats|статистика мультиплеера/i,
    coopGames: /completed games|заверш[её]нные игры/i,
    coopAvg: /average line score|средняя оценка реплик/i,
    pvpAvg: /average battle score|средний боевой балл/i,
    val: /^(\d+(?:[.,]\d+)?|[—–-])$/,
  };
  function parseProfile(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const leaves = [];
    const walk = (el) => {
      if (!el.children.length) { const t = (el.textContent || '').replace(/\s+/g, ' ').trim(); if (t) leaves.push(t); return; }
      for (const n of el.childNodes) { if (n.nodeType === 3) { const t = n.textContent.replace(/\s+/g, ' ').trim(); if (t) leaves.push(t); } else if (n.nodeType === 1 && !/^(script|style|noscript)$/i.test(n.tagName)) walk(n); }
    };
    walk(doc.body || doc.documentElement);
    let from = leaves.findIndex((t) => RX.head.test(t)); if (from < 0) from = 0;
    const val = (i) => { for (let k = i + 1; k < Math.min(leaves.length, i + 4); k++) if (RX.val.test(leaves[k])) return leaves[k]; return null; };
    const conv = (v) => (v == null ? null : /^[—–-]$/.test(v) ? 0 : +v.replace(',', '.'));
    const games = [], out = { coopGames: null, coopAvg: null, pvpGames: null, pvpAvg: null };
    for (let i = from; i < leaves.length; i++) {
      const t = leaves[i];
      if (RX.coopGames.test(t)) games.push(conv(val(i)));
      else if (RX.coopAvg.test(t) && out.coopAvg == null) out.coopAvg = val(i);
      else if (RX.pvpAvg.test(t) && out.pvpAvg == null) out.pvpAvg = val(i);
    }
    out.coopGames = games[0] == null ? null : games[0]; out.pvpGames = games[1] == null ? null : games[1];
    if (out.coopGames == null && out.pvpGames == null && out.coopAvg == null && out.pvpAvg == null) return null;
    return out;
  }
  async function psLoad(id) {
    const r = await origFetch.call(window, '/workshop/creators/' + encodeURIComponent(id), { credentials: 'same-origin', headers: { accept: 'text/html' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return parseProfile(await r.text());
  }
  function psGet(id, cb) {
    const c = psCache.get(id);
    if (c && (c.data || c.err) && Date.now() - c.t < (c.err ? 60000 : PS_TTL)) return cb(c);
    if (c && c.pending) { c.cbs.push(cb); return; }
    const e = { pending: true, cbs: [cb], t: Date.now() }; psCache.set(id, e);
    psQueue.push(id); psPump();
  }
  async function psPump() {
    if (psBusy) return; psBusy = true;
    while (psQueue.length) {
      const id = psQueue.shift(), e = psCache.get(id);
      try { e.data = await psLoad(id); e.err = e.data ? null : 'parse'; } catch (x) { e.data = null; e.err = String(x.message || x); }
      e.pending = false; e.t = Date.now();
      const cbs = e.cbs.splice(0); cbs.forEach((f) => { try { f(e); } catch {} });
      await sleep(250);
    }
    psBusy = false;
  }
  const fmtAvg = (v) => (v == null || /^[—–-]$/.test(String(v)) ? '—' : String(v).replace(',', '.'));
  const avgCls = (v) => { const n = parseFloat(v); return isNaN(n) ? 'x' : n >= 85 ? 'g' : n >= 70 ? '' : 'w'; };
  function psRender(box, e) {
    box.textContent = '';
    box.classList.toggle('load', !!e.pending);
    if (e.pending) { box.append(h('span', null, '…')); return; }
    const d = e.data;
    if (!d) { box.append(h('span', { class: 'x', title: tr('Не удалось получить статистику: ', 'Could not get the stats: ') + (e.err || '') }, tr('статистика недоступна', 'stats unavailable'))); return; }
    box.append(
      h('span', { class: avgCls(d.coopAvg), title: tr('Co-op: завершённые игры · средняя оценка реплик', 'Co-op: completed games · average line score') }, h('em', null, 'Co-op'), h('b', null, d.coopGames == null ? '—' : d.coopGames), '·', h('b', null, '★ ' + fmtAvg(d.coopAvg))),
      h('span', { class: avgCls(d.pvpAvg), title: tr('PvP: завершённые игры · средний боевой балл', 'PvP: completed games · average battle score') }, h('em', null, 'PvP'), h('b', null, d.pvpGames == null ? '—' : d.pvpGames), '·', h('b', null, '★ ' + fmtAvg(d.pvpAvg))));
  }
  const AV = 'a[href*="/workshop/creators/usr_"] img, img[src*="/auth/avatar/usr_"]';
  const AVID = (img) => { const a = img.closest('a[href*="/workshop/creators/usr_"]'); const m = /usr_[\w-]+/.exec((a && a.getAttribute('href')) || img.getAttribute('src') || ''); return m ? m[0] : null; };
  const cardCtxs = [], cardHooks = [];
  function psEnsureBox(ctx) {
    if (!settings.lobbyStats) { if (ctx.box) { ctx.box.remove(); ctx.box = null; } return; }
    if (ctx.box && ctx.box.isConnected) return;
    const box = h('div', { class: 'vxp-pst', 'data-id': ctx.id });
    try { const cs = getComputedStyle(ctx.host); if (cs.display.includes('flex') && cs.flexDirection.startsWith('row')) { ctx.host.style.flexWrap = 'wrap'; box.style.flex = '0 0 100%'; } } catch {}
    ctx.host.append(box); ctx.box = box;
    psRender(box, { pending: true });
    psGet(ctx.id, (e) => { if (box.isConnected) psRender(box, e); });
  }
  function psScan() {
    if (document.hidden || /^\/workshop\/creators\//.test(location.pathname)) return;
    for (let k = cardCtxs.length - 1; k >= 0; k--) if (!cardCtxs[k].host.isConnected) cardCtxs.splice(k, 1);
    for (const img of qsa(AV)) {
      if (img.closest('.vxp-studio,.vxp-panel,.vxp-fxs')) continue;
      const id = AVID(img); if (!id) continue;
      const w = img.getBoundingClientRect().width; if (w < 36) continue;
      const old = img._vxpCtx;
      if (old && old.slot.isConnected && old.id === id) { psEnsureBox(old); continue; }
      // верхний предок, в котором только эта картинка и нет текста (ссылка-аватарка, обёртка)
      let wrap = img;
      while (wrap.parentElement && wrap.parentElement !== document.body && qsa(AV, wrap.parentElement).length === 1 && !(wrap.parentElement.textContent || '').trim()) wrap = wrap.parentElement;
      let host = wrap.nextElementSibling && (wrap.nextElementSibling.textContent || '').trim() ? wrap.nextElementSibling : wrap.parentElement;
      if (!host || (host.textContent || '').trim().length > 120 || qsa(AV, host).length > 1) continue;
      qsa('.vxp-pst,.vxp-slot', host).forEach((x) => x.remove());
      const slot = h('div', { class: 'vxp-slot' });
      host.append(slot);
      const ctx = { id, img, host, slot, box: null, card: (host.parentElement && host.parentElement.closest('article,[class*="player-card"]')) || host.parentElement };
      try { const cs = getComputedStyle(host); if (cs.display.includes('flex') && cs.flexDirection.startsWith('row')) { host.style.flexWrap = 'wrap'; slot.style.flex = '0 0 100%'; } } catch {}
      img._vxpCtx = ctx; cardCtxs.push(ctx);
      psEnsureBox(ctx);
      for (const f of cardHooks) { try { f(ctx); } catch (e) { console.warn('[Voxalike+OrdaxEd] module', e); } }
    }
  }
  setInterval(() => { try { psScan(); } catch (e) { console.warn('[Voxalike+OrdaxEd] stats', e); } }, 1500);
  VXP.pstats = { cache: psCache, parse: parseProfile, scan: psScan };

  /* ================================================================== */
  /*  Разъём для модулей (отдельные файлы, например vxp-fx.js)        */
  /* ================================================================== */
  /* Модуль подключается отдельным скриптом в том же окружении, что и основной файл.
     Порядок загрузки не важен: если модуль пришёл раньше, он ждёт в window.__VXP_PLUGINS__. */
  VXP.modules = {}; VXP.settingsExtras = []; VXP.fxExtras = [];
  VXP.api = {
    version: VERSION, myId: () => myId() || null, icon: (n) => svgIcon(n), h, tr, qs, qsa, toast, settings, saveSettings, checkbox, onBus, emit,
    fetch: (...a) => origFetch.apply(window, a),
    /** cb({id, host, slot, card, img}) — для каждой карточки игрока в лобби (и для уже найденных). slot — свободный блок под ник. */
    onPlayerCard(cb) { cardHooks.push(cb); for (const c of cardCtxs) { try { cb(c); } catch (e) { console.warn('[Voxalike+OrdaxEd] module', e); } } },
    /** fn() → элемент для раздела «Настройки» панели. */
    addSettings(fn) { VXP.settingsExtras.push(fn); },
    slider, syncWidgets, widgets, hostDoc, dsp: VXP.dsp,
    /** {id, build(ctx) → элемент}: блок в панели «Обработка» (ctx: commit(), ab(patch)). */
    addFxExtra(e) { VXP.fxExtras.push(e); for (const hst of fxExtraHosts) { if (!hst.isConnected) { fxExtraHosts.delete(hst); continue; } hst._fill(); } },
  };
  VXP.registerModule = (name, init) => {
    if (VXP.modules[name]) return;
    VXP.modules[name] = { name, at: Date.now() };
    try { init(VXP.api); } catch (e) { VXP.modules[name].error = String(e && e.message || e); console.warn('[Voxalike+OrdaxEd] module ' + name, e); }
  };
  for (const m of (window.__VXP_PLUGINS__ || [])) VXP.registerModule(m.name, m.init);

  console.info('%cVoxalike+OrdaxEd ' + VERSION + ' loaded', 'color:#ff5a00;font-weight:bold');
})();
