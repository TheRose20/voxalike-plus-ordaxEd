// Voxalike+OrdaxEd — расширенная информация о моде в лобби.

(() => {
  'use strict';
  const NAME = 'lobby';

  const init = (api) => {
    const { h, tr, qsa, fetch: vxpFetch, onBus } = api;
    const lookupCache = new Map();
    const libraryCache = new Map();
    let currentRoom = window.__VXP__ && window.__VXP__.room && window.__VXP__.room.state;
    let renderQueued = false;

    const SETTINGS_KEY = 'vxp-lobby:settings:v1';
    function loadSettings() {
      try {
        const raw = localStorage.getItem(SETTINGS_KEY);
        return raw ? JSON.parse(raw) : {};
      } catch (err) {
        console.warn('[Voxalike+OrdaxEd] lobby settings load', err);
        return {};
      }
    }
    function saveSettings(settings) {
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      } catch (err) {
        console.warn('[Voxalike+OrdaxEd] lobby settings save', err);
      }
    }
    // Настройки комнаты (режим, лимит игроков, назначение, re-records).
    // Селекторы сверены с разметкой снапшота chat/not grid.
    const roomSettingControls = () => {
      return {
        modeButtons: [...qsa('.room-mode-select')],
        playerLimit: document.querySelector('#room-player-limit'),
        playerLimitConfirm: document.querySelector('.room-player-limit-confirm'),
        assignment: document.querySelector('.room-assignment-mode-field select.select-input'),
        reRecords: document.querySelector('button.claim-mode-switch[aria-label="Enable re-records"]'),
      };
    };
    const nativeSetter = (el, value) => {
      const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    function readRoomSettings() {
      const c = roomSettingControls();
      const selectedMode = c.modeButtons.find((b) => b.getAttribute('aria-pressed') === 'true');
      const settings = {};
      if (selectedMode) settings.mode = selectedMode.textContent.trim();
      if (c.playerLimit) settings.playerLimit = c.playerLimit.value;
      if (c.assignment) settings.assignment = c.assignment.value;
      if (c.reRecords) settings.reRecords = c.reRecords.getAttribute('aria-pressed') === 'true';
      return settings;
    }
    function captureSettings() {
      const current = readRoomSettings();
      if (Object.keys(current).length) saveSettings({ ...loadSettings(), ...current });
    }
    function applyRoomSettings(settings) {
      const c = roomSettingControls();
      if (settings.mode) {
        const target = c.modeButtons.find((b) => b.textContent.trim() === settings.mode);
        if (target && target.getAttribute('aria-pressed') !== 'true') target.click();
      }
      if (settings.assignment && c.assignment && c.assignment.value !== settings.assignment) {
        nativeSetter(c.assignment, settings.assignment);
      }
      if (settings.playerLimit && c.playerLimit && c.playerLimit.value !== String(settings.playerLimit)) {
        nativeSetter(c.playerLimit, String(settings.playerLimit));
        if (c.playerLimitConfirm && !c.playerLimitConfirm.disabled) c.playerLimitConfirm.click();
      }
      if (typeof settings.reRecords === 'boolean' && c.reRecords && (c.reRecords.getAttribute('aria-pressed') === 'true') !== settings.reRecords) {
        c.reRecords.click();
      }
    }
    function restoreSettings() {
      const settings = loadSettings();
      if (settings && typeof settings === 'object') applyRoomSettings(settings);
    }
    function installSettingsCapture() {
      const c = roomSettingControls();
      const targets = [...c.modeButtons, c.playerLimit, c.playerLimitConfirm, c.assignment, c.reRecords].filter(Boolean);
      for (const el of targets) {
        if (el._vxpSettingsCapture) continue;
        el._vxpSettingsCapture = true;
        el.addEventListener('click', () => setTimeout(captureSettings, 0));
        el.addEventListener('change', captureSettings);
      }
    }

    const text = (value) => String(value == null ? '' : value);
    const plural = (n, one, few, many) => {
      const d = Math.abs(Number(n) || 0) % 100, last = d % 10;
      return d > 10 && d < 20 ? many : last === 1 ? one : last >= 2 && last <= 4 ? few : many;
    };
    const formatDuration = (seconds) => {
      const value = Number(seconds);
      if (!Number.isFinite(value) || value < 0) return '—';
      const total = Math.round(value), min = Math.floor(total / 60), sec = total % 60;
      return min + ':' + String(sec).padStart(2, '0');
    };
    const formatSize = (bytes) => {
      const value = Number(bytes);
      if (!Number.isFinite(value) || value < 0) return '—';
      if (value < 1024 * 1024) return Math.round(value / 1024) + ' KB';
      return (value / (1024 * 1024)).toLocaleString(undefined, { maximumFractionDigits: 1 }) + ' MB';
    };
    const formatNumber = (value) => Number(value || 0).toLocaleString();
    const workshopUrl = (slug) => slug ? '/workshop/' + encodeURIComponent(slug) : '';

    function ingestLibrary(data) {
      const packs = data && Array.isArray(data.packs) ? data.packs : [];
      for (const pack of packs) {
        if (!pack || typeof pack !== 'object') continue;
        if (pack.id) libraryCache.set(pack.id, pack);
        if (pack.slug) libraryCache.set('slug:' + pack.slug, pack);
      }
    }
    function libraryDetail(pack) {
      return libraryCache.get(text(pack.workshopPackId)) || libraryCache.get('slug:' + text(pack.workshopPackSlug)) || null;
    }

    function lookup(pack) {
      const cached = libraryDetail(pack);
      if (cached) return Promise.resolve(cached);
      const id = text(pack && pack.workshopPackId);
      const slug = text(pack && pack.workshopPackSlug);
      if (!id && !slug) return Promise.resolve(null);
      const key = id || slug;
      const old = lookupCache.get(key);
      if (old) return old;
      const query = id ? 'id=' + encodeURIComponent(id) : 'slug=' + encodeURIComponent(slug);
      const pending = vxpFetch('/api/workshop/lookup?kind=dub&' + query, {
        credentials: 'same-origin', headers: { accept: 'application/json' },
      }).then(async (res) => {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        return data && data.pack ? data.pack : null;
      }).catch((err) => {
        console.warn('[Voxalike+OrdaxEd] lobby lookup', err);
        return null;
      });
      lookupCache.set(key, pending);
      return pending;
    }

    // Общие утилиты лежат в vxp-lobby-shared.js (загружается раньше этого модуля).
    const shared = () => window.__VXP_LOBBY_SHARED__;
    const idbAllPacks = () => shared() ? shared().idbAllPacks() : Promise.reject(new Error('lobby-shared missing'));
    const loadLineCounts = (pack, detail) => shared()
      ? shared().loadLineCounts(pack, detail).then((counts) => (counts ? counts.byRole : null))
      : Promise.resolve(null);

    function openPreview(url, title) {
      if (!url) return;
      const modal = h('div', { class: 'vxp-preview-modal', role: 'dialog', 'aria-modal': 'true' });
      const close = () => modal.remove();
      const video = h('video', { src: url, controls: true, autoplay: true, playsinline: true });
      modal.append(h('div', { class: 'vxp-preview-dialog' },
        h('header', null, h('strong', null, title), h('button', { type: 'button', title: tr('Закрыть', 'Close'), onclick: close }, '×')),
        video,
      ));
      modal.addEventListener('click', (event) => { if (event.target === modal) close(); });
      document.body.append(modal);
    }

    function normalizeSearch(value) {
      return text(value).toLocaleLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
    }
    async function openPackPicker(select) {
      const records = await idbAllPacks().catch(() => []);
      const localById = new Map(records.map((record) => [record.id, record.summary || {}]));
      const packs = [...select.options].filter((option) => option.value).map((option) => {
        const summary = localById.get(option.value) || {};
        return {
          packId: option.value, packTitle: option.textContent.trim(), creator: summary.creator || '',
          workshopPackId: summary.workshopId || '', workshopPackSlug: summary.workshopSlug || '',
          characters: Array.isArray(summary.characters) ? summary.characters : [], clipCount: summary.clipCount,
          videoDurationSeconds: summary.videoDurationSeconds, summary,
        };
      });
      const modal = h('div', { class: 'vxp-pack-modal', role: 'dialog', 'aria-modal': 'true' });
      const query = h('input', { class: 'vxp-pack-search', type: 'search', placeholder: tr('Поиск: название, автор, теги, описание, роли…', 'Search title, creator, tags, description, roles…') });
      const min = h('input', { class: 'vxp-pack-range', type: 'number', min: '0', placeholder: tr('Ролей от', 'Roles from') });
      const max = h('input', { class: 'vxp-pack-range', type: 'number', min: '0', placeholder: tr('Ролей до', 'Roles to') });
      const grid = h('div', { class: 'vxp-pack-grid' });
      const close = () => modal.remove();
      const choose = (pack) => {
        select.value = pack.packId;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        close();
      };
      const fill = () => {
        const words = normalizeSearch(query.value).split(' ').filter(Boolean);
        const low = Math.max(0, Number(min.value) || 0), high = Math.max(0, Number(max.value) || Infinity);
        grid.textContent = '';
        const shown = packs.filter((pack) => {
          const data = pack.detail || libraryDetail(pack) || pack.summary || {};
          const haystack = normalizeSearch([pack.packTitle, pack.creator, data.creator, data.description, data.language, ...(data.tags || []), ...(data.characters || pack.characters || [])].join(' '));
          const count = (data.characters || pack.characters || []).length;
          return count >= low && count <= high && words.every((word) => haystack.includes(word));
        });
        if (!shown.length) grid.append(h('p', { class: 'vxp-pack-empty' }, tr('Ничего не найдено', 'No packs found')));
        for (const pack of shown) {
          const data = pack.detail || libraryDetail(pack) || pack.summary || {};
          const card = h('div', { class: 'vxp-pack-card', role: 'button', tabindex: '0', onclick: () => choose(pack), onkeydown: (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(pack); } } });
          if (data.coverUrl) card.append(h('img', { src: data.coverUrl, alt: '' }));
          const roles = (data.characters || pack.characters || []).length;
          card.append(h('strong', { title: pack.packTitle }, pack.packTitle),
            h('span', { class: 'vxp-pack-author' }, tr('Автор: ', 'Author: ') + (data.creator || pack.creator || '—')),
            h('div', { class: 'vxp-pack-stats' },
              h('small', null, tr('Роли: ', 'Roles: ') + roles),
              h('small', null, tr('Длина: ', 'Length: ') + formatDuration(data.videoDurationSeconds || pack.videoDurationSeconds)),
              h('small', null, tr('Размер: ', 'Size: ') + formatSize(data.packageSize)),
              h('small', null, tr('Реплики: ', 'Lines: ') + formatNumber(data.clipCount != null ? data.clipCount : pack.clipCount)),
              h('small', null, (data.ratingAverage == null ? '—' : '★ ' + Number(data.ratingAverage).toFixed(1))),
              h('small', null, tr('↓ ', '↓ ') + formatNumber(data.downloadCount)),
            ));
          grid.append(card);
        }
      };
      modal.append(h('div', { class: 'vxp-pack-dialog' },
        h('header', null, h('h2', null, tr('Выбрать мод', 'Choose a mod')), h('button', { type: 'button', class: 'vxp-pack-close', title: tr('Закрыть', 'Close'), onclick: close }, '×')),
        h('div', { class: 'vxp-pack-filters' }, query, min, max), grid,
      ));
      query.addEventListener('input', fill); min.addEventListener('input', fill); max.addEventListener('input', fill);
      modal.addEventListener('click', (event) => { if (event.target === modal) close(); });
      document.body.append(modal); query.focus(); fill();
      for (const pack of packs) {
        const cached = libraryDetail(pack);
        if (cached) { pack.detail = cached; continue; }
        lookup(pack).then((detail) => { if (detail) { pack.detail = detail; fill(); } });
      }
    }

    function installPackPicker() {
      const select = document.querySelector('#joined-room-pack-select');
      if (!select || select._vxpPicker) return;
      select._vxpPicker = true;
      select.classList.add('_vxpPicker');
      const row = select.closest('.room-pack-select-row') || select.parentElement;
      if (!row) return;
      const button = h('button', { class: 'vxp-pack-picker-button', type: 'button', onclick: () => openPackPicker(select) }, tr('Выбрать мод…', 'Choose a mod…'));
      row.append(button);
    }

    function infoCard(pack, detail, lineCounts) {
      const roles = Array.isArray(pack.characters) ? pack.characters : (detail && detail.characters) || [];
      const clipCount = pack.clipCount != null ? pack.clipCount : detail && detail.clipCount;
      const duration = pack.videoDurationSeconds != null ? pack.videoDurationSeconds : detail && detail.videoDurationSeconds;
      const tags = detail && Array.isArray(detail.tags) ? detail.tags : [];
      const slug = text(pack.workshopPackSlug || (detail && detail.slug));
      const card = h('section', { class: 'vxp-lobby-info', 'data-pack-id': text(pack.packId) });
      const cover = detail && detail.coverUrl;
      if (cover) {
        const image = h('img', { class: 'vxp-lobby-cover', src: cover, alt: '' });
        card.append(detail.previewVideoUrl ? h('button', { class: 'vxp-lobby-preview', type: 'button', title: tr('Посмотреть видео-предпросмотр', 'Watch preview'), onclick: () => openPreview(detail.previewVideoUrl, text(pack.packTitle || detail.title)) }, image) : image);
      }
      if (slug) card.append(h('a', { class: 'vxp-lobby-link vxp-lobby-workshop-link', href: workshopUrl(slug), target: '_blank', rel: 'noopener' }, tr('Открыть в Workshop ↗', 'Open in Workshop ↗')));
      const body = h('div', { class: 'vxp-lobby-body' });
      body.append(h('div', { class: 'vxp-lobby-heading' },
        h('h3', null, text(pack.packTitle || (detail && detail.title) || tr('Неизвестный мод', 'Unknown mod'))),
        h('p', { class: 'vxp-lobby-author' }, tr('Автор: ', 'By ') + text(pack.creator || (detail && detail.creator) || '—')),
      ));
      body.append(h('div', { class: 'vxp-lobby-facts' },
        h('span', null, formatNumber(clipCount) + ' ' + tr(plural(clipCount, 'реплика', 'реплики', 'реплик'), 'lines')),
        h('span', null, formatDuration(duration)),
        h('span', null, roles.length + ' ' + tr(plural(roles.length, 'роль', 'роли', 'ролей'), 'roles')),
      ));
      if (detail) {
        body.append(h('div', { class: 'vxp-lobby-workshop' },
          h('span', { title: tr('Средняя оценка', 'Average rating') }, '★ ' + (Number.isFinite(Number(detail.ratingAverage)) ? Number(detail.ratingAverage).toFixed(1) : '—') + ' (' + formatNumber(detail.ratingCount) + ')'),
          h('span', { title: tr('Загрузки', 'Downloads') }, '↓ ' + formatNumber(detail.downloadCount)),
          h('span', { title: tr('Размер архива', 'Package size') }, formatSize(detail.packageSize)),
        ));
        if (detail.description) body.append(h('div', { class: 'vxp-lobby-description-row' },
          h('p', { class: 'vxp-lobby-description' }, text(detail.description)),
        ));
        if (tags.length) body.append(h('div', { class: 'vxp-lobby-tags' }, ...tags.map((tag) => h('span', null, text(tag)))));
      }
      if (roles.length) body.append(h('div', { class: 'vxp-lobby-roles' },
        h('strong', null, tr('Роли и реплики', 'Roles and lines')),
        h('div', { class: 'vxp-lobby-role-list' }, ...roles.map((role) => {
          const count = lineCounts && lineCounts[role];
          return h('span', null, text(role), h('em', null, '[' + (count == null ? '—' : count) + ']'));
        })),
      ));
      card.append(body);
      return card;
    }

    function render() {
      renderQueued = false;
      const room = currentRoom || (window.__VXP__ && window.__VXP__.room && window.__VXP__.room.state);
      const pack = room && room.status === 'lobby' && room.lobbyPack;
      installPackPicker();
      installSettingsCapture();
      for (const old of qsa('.vxp-lobby-info')) old.remove();
      if (!pack) return;
      const hosts = qsa('.selected-pack-card');
      if (!hosts.length) return;
      const token = text(pack.packId) + '|' + text(pack.workshopPackId) + '|' + text(pack.workshopPackSlug);
      for (const host of hosts) {
        const loading = infoCard(pack, null, null);
        loading.setAttribute('data-vxp-pack-token', token);
        host.append(loading);
      }
      lookup(pack).then((detail) => {
        for (const host of qsa('.selected-pack-card')) {
          const old = host.querySelector('.vxp-lobby-info[data-vxp-pack-token="' + CSS.escape(token) + '"]');
          if (old) old.replaceWith(infoCard(pack, detail, null));
        }
        loadLineCounts(pack, detail).then((lineCounts) => {
          if (!lineCounts) return;
          for (const host of qsa('.selected-pack-card')) {
            const old = host.querySelector('.vxp-lobby-info[data-pack-id="' + CSS.escape(text(pack.packId)) + '"]');
            if (old) old.replaceWith(infoCard(pack, detail, lineCounts));
          }
        });
      });
    }
    function scheduleRender() {
      if (renderQueued) return;
      renderQueued = true;
      requestAnimationFrame(render);
    }

    const style = document.getElementById('vxp-lobby-style');
    if (style) style.remove();

    const currentFetch = window.fetch;
    window.fetch = async function (input, init) {
      const response = await currentFetch.apply(this, arguments);
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      if (response.ok && /\/api\/library-sync(?:[/?]|$)/.test(url)) response.clone().json().then(ingestLibrary).catch(() => {});
      return response;
    };

    onBus('room', (room) => {
      currentRoom = room;
      if (room && room.status === 'lobby') {
        setTimeout(restoreSettings, 100);
      }
      scheduleRender();
    });
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        const ownTarget = record.target.nodeType === 1 && record.target.closest('.vxp-lobby-info');
        const externalNode = [...record.addedNodes, ...record.removedNodes].some((node) => {
          return node.nodeType !== 1 || !node.matches('.vxp-lobby-info, .vxp-lobby-info *');
        });
        if (!ownTarget && externalNode) { scheduleRender(); return; }
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    scheduleRender();
  };

  const plugin = { name: NAME, init };
  if (window.__VXP__ && window.__VXP__.registerModule) window.__VXP__.registerModule(NAME, init);
  else (window.__VXP_PLUGINS__ ||= []).push(plugin);
})();
