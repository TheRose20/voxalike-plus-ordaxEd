// Voxalike+OrdaxEd — сводка по ролям на экране выбора ролей.
// Показывает игроков с захваченными ролями и суммой реплик: «hessus 2/48».
// Источник: roleClaims + players из состояния комнаты; реплики — из локального
// project.json через общий модуль vxp-lobby-shared.js. Встраивается в .role-selection-stage.

(() => {
  'use strict';
  const NAME = 'lobby-roles';

  const init = (api) => {
    const { h, tr, qsa, onBus } = api;
    let currentRoom = window.__VXP__ && window.__VXP__.room && window.__VXP__.room.state;
    let renderQueued = false;
    let loadToken = 0;

    const shared = () => window.__VXP_LOBBY_SHARED__;
    const text = (value) => String(value == null ? '' : value);

    // { playerId, name, roles: [роль…], lines: число реплик или null, known: bool }
    function buildPlayerSummary(room, lineCounts) {
      const players = Array.isArray(room.players) ? room.players : [];
      const claims = Array.isArray(room.roleClaims) ? room.roleClaims : [];
      const byPlayer = new Map(players.map((player) => [player.id, { playerId: player.id, name: text(player.name), roles: [], lines: 0 }]));
      for (const claim of claims) {
        if (!claim || !claim.playerId) continue;
        if (!byPlayer.has(claim.playerId)) {
          byPlayer.set(claim.playerId, { playerId: claim.playerId, name: text(claim.playerName), roles: [], lines: 0 });
        }
        const entry = byPlayer.get(claim.playerId);
        entry.roles.push(text(claim.role));
        const count = lineCounts && lineCounts.byRole ? lineCounts.byRole[claim.role] : null;
        if (typeof count === 'number') entry.lines += count;
      }
      return [...byPlayer.values()];
    }

    function playerRow(entry, known) {
      return h('li', { class: 'vxp-roles-row', 'data-player-id': entry.playerId },
        h('strong', { class: 'vxp-roles-name', title: entry.name }, entry.name || '—'),
        h('span', { class: 'vxp-roles-count', title: tr('Роли / реплики', 'Roles / lines') },
          entry.roles.length + '/' + (known ? entry.lines : '—')),
        h('span', { class: 'vxp-roles-roles', title: entry.roles.join(', ') }, entry.roles.join(', ')),
      );
    }

    function panel(entries, known) {
      return h('section', { class: 'vxp-roles-panel', 'data-vxp-roles': '1' },
        h('header', { class: 'vxp-roles-head' },
          h('strong', null, tr('Роли игроков', 'Player roles')),
          h('span', null, tr('роли / реплики', 'roles / lines')),
        ),
        h('ul', { class: 'vxp-roles-list' }, ...entries.map((entry) => playerRow(entry, known))),
      );
    }

    function stage() {
      return document.querySelector('.role-selection-stage');
    }
    // Панель вставляется в .role-selection-layout, чтобы не ломать сетку stage
    // (stage — grid с фиксированными строками; лишний прямой ребёнок создал бы новую строку).
    function mount(node) {
      const host = stage();
      if (!host) return;
      const layout = host.querySelector('.role-selection-layout');
      (layout || host).append(node);
    }

    function render() {
      renderQueued = false;
      for (const old of qsa('.vxp-roles-panel')) old.remove();
      const room = currentRoom || (window.__VXP__ && window.__VXP__.room && window.__VXP__.room.state);
      if (!stage() || !room || room.status !== 'lobby') return;
      const claims = Array.isArray(room.roleClaims) ? room.roleClaims : [];
      if (!claims.length) return;

      const immediate = buildPlayerSummary(room, null).filter((entry) => entry.roles.length);
      if (!immediate.length) return;
      mount(panel(immediate, false));

      const token = ++loadToken;
      if (!shared()) return;
      shared().loadLineCounts(room.lobbyPack, null).then((lineCounts) => {
        if (token !== loadToken || !lineCounts) return;
        const filled = buildPlayerSummary(room, lineCounts).filter((entry) => entry.roles.length);
        for (const old of qsa('.vxp-roles-panel')) old.replaceWith(panel(filled, true));
      });
    }

    function scheduleRender() {
      if (renderQueued) return;
      renderQueued = true;
      requestAnimationFrame(render);
    }

    onBus('room', (room) => { currentRoom = room; scheduleRender(); });

    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.target.nodeType === 1 && record.target.closest('.vxp-roles-panel')) continue;
        const changed = [...record.addedNodes, ...record.removedNodes].some((node) => {
          if (node.nodeType !== 1) return true;
          if (node.matches('.vxp-roles-panel, .vxp-roles-panel *')) return false;
          return node.matches('.role-selection-stage, .role-selection-stage *') || !!node.querySelector?.('.role-selection-stage');
        });
        if (changed) { scheduleRender(); return; }
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    scheduleRender();
  };

  if (window.__VXP__ && window.__VXP__.registerModule) window.__VXP__.registerModule(NAME, init);
  else (window.__VXP_PLUGINS__ ||= []).push({ name: NAME, init });
})();
