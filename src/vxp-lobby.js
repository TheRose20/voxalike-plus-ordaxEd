/*!
 * Voxalike+OrdaxEd — расширенная информация о моде в лобби.
 *
 * Progress:
 * - 2026-11-10: Phase 1 — room-state subscription, Workshop lookup cache,
 *   and current-pack details card.
 * - 2026-11-10: Phase 2 — local project.json extraction from installed ZIP
 *   blobs and per-character line counts.
 * - 2026-11-10: Phase 3 — wide (>=1280px) lobby layout that separates
 *   mod details, native host settings, players, and chat.
 * - 2026-11-10: Phase 4 — host-only pack-picker modal driven by the native
 *   select, with a full-text search and role-count range.
 */
(() => {
  'use strict';
  const NAME = 'lobby';

  const init = (api) => {
    const { h, tr, qsa, fetch: vxpFetch, onBus } = api;
    const lookupCache = new Map();
    const libraryCache = new Map();
    const lineCountCache = new Map();
    let currentRoom = window.__VXP__ && window.__VXP__.room && window.__VXP__.room.state;
    let renderQueued = false;

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

    function idbAllPacks() {
      return new Promise((resolve, reject) => {
        const request = indexedDB.open('project-echo-local-packs');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          let transaction;
          try { transaction = db.transaction('pack-sources', 'readonly'); } catch (err) { db.close(); reject(err); return; }
          const getAll = transaction.objectStore('pack-sources').getAll();
          getAll.onerror = () => { db.close(); reject(getAll.error); };
          getAll.onsuccess = () => { db.close(); resolve(getAll.result || []); };
        };
      });
    }
    function findLocalPack(records, pack, detail) {
      const workshopId = text(pack.workshopPackId || (detail && detail.id));
      const slug = text(pack.workshopPackSlug || (detail && detail.slug));
      return records.find((record) => {
        const summary = record && record.summary || {};
        return (workshopId && summary.workshopId === workshopId) || (slug && summary.workshopSlug === slug);
      }) || null;
    }
    async function readZipEntry(blob, wantedName) {
      if (!blob || !blob.size) return null;
      const tailStart = Math.max(0, blob.size - 0x10016);
      const tail = new Uint8Array(await blob.slice(tailStart).arrayBuffer());
      let eocd = -1;
      for (let i = tail.length - 22; i >= 0; i--) {
        if (tail[i] === 0x50 && tail[i + 1] === 0x4b && tail[i + 2] === 0x05 && tail[i + 3] === 0x06) { eocd = i; break; }
      }
      if (eocd < 0) throw new Error('ZIP end record not found');
      const end = new DataView(tail.buffer, tail.byteOffset + eocd);
      const directorySize = end.getUint32(12, true), directoryOffset = end.getUint32(16, true);
      const directory = new Uint8Array(await blob.slice(directoryOffset, directoryOffset + directorySize).arrayBuffer());
      const decoder = new TextDecoder('utf-8');
      for (let offset = 0; offset + 46 <= directory.length;) {
        const view = new DataView(directory.buffer, directory.byteOffset + offset);
        if (view.getUint32(0, true) !== 0x02014b50) throw new Error('Invalid ZIP central directory');
        const method = view.getUint16(10, true), compressedSize = view.getUint32(20, true);
        const nameLength = view.getUint16(28, true), extraLength = view.getUint16(30, true), commentLength = view.getUint16(32, true);
        const localOffset = view.getUint32(42, true);
        const name = decoder.decode(directory.slice(offset + 46, offset + 46 + nameLength));
        offset += 46 + nameLength + extraLength + commentLength;
        if (name !== wantedName) continue;
        const header = new Uint8Array(await blob.slice(localOffset, localOffset + 30).arrayBuffer());
        const local = new DataView(header.buffer, header.byteOffset);
        if (local.getUint32(0, true) !== 0x04034b50) throw new Error('Invalid ZIP local header');
        const dataStart = localOffset + 30 + local.getUint16(26, true) + local.getUint16(28, true);
        const compressed = await blob.slice(dataStart, dataStart + compressedSize).arrayBuffer();
        if (method === 0) return new Uint8Array(compressed);
        if (method === 8 && typeof DecompressionStream !== 'undefined') {
          const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
          return new Uint8Array(await new Response(stream).arrayBuffer());
        }
        throw new Error('Unsupported ZIP compression: ' + method);
      }
      return null;
    }
    async function loadLineCounts(pack, detail) {
      const key = text((detail && detail.packageHash) || pack.workshopPackId || pack.workshopPackSlug || pack.packId);
      if (!key) return null;
      if (lineCountCache.has(key)) return lineCountCache.get(key);
      const pending = idbAllPacks().then(async (records) => {
        const record = findLocalPack(records, pack, detail);
        const file = record && Array.isArray(record.files) && record.files.find((item) => item && item.blob);
        if (!file) return null;
        const bytes = await readZipEntry(file.blob, 'project.json');
        if (!bytes) return null;
        const project = JSON.parse(new TextDecoder('utf-8').decode(bytes));
        const names = new Map((project.characters || []).map((character) => [character.id, character.name]));
        const counts = {};
        for (const line of project.lines || []) {
          const name = names.get(line.characterId);
          if (name) counts[name] = (counts[name] || 0) + 1;
        }
        return counts;
      }).catch((err) => {
        console.warn('[Voxalike+OrdaxEd] lobby local pack', err);
        return null;
      });
      lineCountCache.set(key, pending);
      return pending;
    }

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
              h('small', { class: 'vxp-pack-rating' }, tr('Оценка: ', 'Rating: ') + (data.ratingAverage == null ? '—' : '★ ' + Number(data.ratingAverage).toFixed(1))),
              h('small', null, tr('Загрузки: ', 'Downloads: ') + formatNumber(data.downloadCount)),
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
      const body = h('div', { class: 'vxp-lobby-body' });
      body.append(h('div', { class: 'vxp-lobby-heading' },
        h('span', { class: 'vxp-lobby-kicker' }, tr('ИНФОРМАЦИЯ О МОДЕ', 'MOD INFORMATION')),
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
          slug ? h('a', { class: 'vxp-lobby-link', href: workshopUrl(slug), target: '_blank', rel: 'noopener' }, tr('Открыть в Workshop ↗', 'Open in Workshop ↗')) : null,
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
      if (slug && !(detail && detail.description)) body.append(h('a', { class: 'vxp-lobby-link', href: workshopUrl(slug), target: '_blank', rel: 'noopener' }, tr('Открыть в Workshop ↗', 'Open in Workshop ↗')));
      card.append(body);
      return card;
    }

    function render() {
      renderQueued = false;
      const room = currentRoom || (window.__VXP__ && window.__VXP__.room && window.__VXP__.room.state);
      const pack = room && room.status === 'lobby' && room.lobbyPack;
      installPackPicker();
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

    const css = `
      .room-pack-select-row>select._vxpPicker{display:none}.vxp-pack-picker-button{width:100%;min-height:38px;color:inherit;background:rgba(127,127,127,.14);border:1px solid rgba(127,127,127,.3);border-radius:7px;font:inherit;font-weight:700;cursor:pointer}.vxp-pack-picker-button:hover{background:rgba(127,127,127,.24)}
      .vxp-pack-modal{z-index:2147483647!important;background:rgba(0,0,0,.7);align-items:center!important;justify-content:center!important;padding:20px;display:flex!important;position:fixed!important;inset:0!important;overflow:hidden}.vxp-pack-dialog{box-sizing:border-box;background:#0b121d;color:#e9f5f4;border:1px solid #4ee7d266;border-radius:12px;box-shadow:0 25px 80px #000;grid-template-rows:auto auto minmax(0,1fr);gap:12px;width:min(900px,calc(100vw - 40px));height:min(780px,calc(100dvh - 40px));max-height:calc(100dvh - 40px);padding:18px;display:grid;overflow:hidden}.vxp-pack-dialog header{justify-content:space-between;align-items:center;display:flex}.vxp-pack-dialog h2{margin:0;font-size:20px}.vxp-pack-close{color:inherit;background:none;border:0;font-size:28px;line-height:1;cursor:pointer}.vxp-pack-filters{grid-template-columns:minmax(0,1fr) 115px 115px;gap:8px;display:grid}.vxp-pack-search,.vxp-pack-range{color:inherit;background:#00000040;border:1px solid #ffffff2b;border-radius:7px;min-width:0;padding:9px 10px;font:inherit}.vxp-pack-grid{grid-template-columns:repeat(3,270px);justify-content:center;align-content:start;gap:10px;min-height:0;overflow:auto}.vxp-pack-card{box-sizing:border-box;width:270px;min-width:0;color:inherit;text-align:left;background:#ffffff0a;border:1px solid #ffffff1c;border-radius:8px;gap:6px;padding:8px;display:grid;font:inherit;cursor:pointer;overflow:hidden}.vxp-pack-card:hover,.vxp-pack-card:focus-visible{background:#4ee7d21c;border-color:#4ee7d280;outline:none}.vxp-pack-card img{vertical-align:top;background:#0004;border-radius:5px;width:100%;aspect-ratio:16/9;height:auto;object-fit:cover}.vxp-pack-card strong{height:2.5em;text-align:left;line-height:1.25;overflow:hidden}.vxp-pack-card span{overflow:hidden;text-align:left;text-overflow:ellipsis;white-space:nowrap}.vxp-pack-author{opacity:.82}.vxp-pack-stats{display:block;margin-top:2px;text-align:left}.vxp-pack-stats small{opacity:.72}.vxp-pack-stats small+small:before{content:' · ';opacity:.6}.vxp-pack-stats .vxp-pack-rating{color:#ffd166;opacity:1}.vxp-pack-empty{opacity:.7}.vxp-preview-modal{z-index:2147483647;background:#000000c7;place-items:center;padding:20px;display:grid;position:fixed;inset:0}.vxp-preview-dialog{background:#0b121d;border:1px solid #4ee7d266;border-radius:10px;width:min(960px,100%);max-height:100%;padding:12px;display:grid;overflow:hidden}.vxp-preview-dialog header{color:#e9f5f4;justify-content:space-between;align-items:center;gap:12px;margin-bottom:8px;display:flex}.vxp-preview-dialog header button{color:inherit;background:none;border:0;font-size:25px;cursor:pointer}.vxp-preview-dialog video{background:#000;border-radius:6px;width:100%;max-height:calc(100dvh - 110px)}@media(max-width:900px){.vxp-pack-dialog{width:min(620px,calc(100vw - 40px))}.vxp-pack-grid{grid-template-columns:repeat(2,270px)}}@media(max-width:680px){.vxp-pack-modal{padding:10px}.vxp-pack-dialog{width:100%;height:calc(100dvh - 20px);max-height:calc(100dvh - 20px);padding:12px}.vxp-pack-filters{grid-template-columns:1fr 1fr}.vxp-pack-search{grid-column:1/-1}.vxp-pack-grid{grid-template-columns:270px}.vxp-pack-card{width:270px}}
      .vxp-lobby-info{display:flex;gap:12px;margin-top:12px;padding-top:12px;border-top:1px solid color-mix(in srgb,currentColor 16%,transparent);font-size:12px;line-height:1.4}
      .vxp-lobby-cover{width:92px;height:92px;object-fit:cover;border-radius:8px;background:rgba(0,0,0,.2);flex:none}
      .vxp-lobby-body{min-width:0;flex:1}.vxp-lobby-heading h3{margin:2px 0 0;font-size:15px;line-height:1.2}.vxp-lobby-kicker{opacity:.62;font-size:10px;font-weight:700;letter-spacing:.06em}.vxp-lobby-author{margin:3px 0 0;opacity:.76}
      .vxp-lobby-facts,.vxp-lobby-workshop,.vxp-lobby-tags{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}.vxp-lobby-facts span,.vxp-lobby-workshop span,.vxp-lobby-tags span{padding:2px 6px;border-radius:999px;background:rgba(127,127,127,.14)}
      .vxp-lobby-description-row{display:flex;align-items:flex-start;gap:8px;margin-top:9px}.vxp-lobby-description{white-space:pre-wrap;margin:0;opacity:.88;flex:1}.vxp-lobby-roles{margin-top:9px}.vxp-lobby-roles strong{display:block;margin-bottom:4px}.vxp-lobby-role-list{display:flex;gap:4px;flex-wrap:wrap}.vxp-lobby-role-list span{display:inline-flex;gap:4px;align-items:center;padding:2px 6px;border-radius:999px;background:rgba(127,127,127,.14)}.vxp-lobby-role-list em{font-style:normal;font-weight:700;opacity:.8}.vxp-lobby-link{display:inline-block;white-space:nowrap;color:inherit;font-weight:700}
      @media(min-width:1280px) and (min-height:721px){
        .joined-room-shell>.screen-toolbar{display:none}
        .joined-room-shell .joined-lobby-grid{height:100%;padding-top:0}
        .joined-room-shell .joined-lobby-grid .room-side-panel{display:grid;grid-template-rows:minmax(0,1fr) auto;gap:12px;overflow:hidden}
        .joined-room-shell .joined-lobby-grid .selected-pack-card{display:flex;flex-direction:column;min-height:0;height:100%;overflow:hidden}
        .joined-room-shell .joined-lobby-grid .selected-pack-cover{display:none}
        .joined-room-shell .joined-lobby-grid .selected-pack-content{display:contents}
        .joined-room-shell .joined-lobby-grid .selected-pack-content>span,.joined-room-shell .joined-lobby-grid .selected-pack-content>h2,.joined-room-shell .joined-lobby-grid .selected-pack-content>.selected-pack-creator,.joined-room-shell .joined-lobby-grid .selected-pack-content>.selected-pack-meta,.joined-room-shell .joined-lobby-grid .selected-pack-content>.selected-pack-roles{display:none}
        .joined-room-shell .joined-lobby-grid .vxp-lobby-info{display:block;min-height:0;flex:1;margin:0;padding:14px;overflow:hidden auto;border-top:0;border-bottom:1px solid color-mix(in srgb,currentColor 16%,transparent)}
        .joined-room-shell .joined-lobby-grid .vxp-lobby-cover{float:left;width:112px;height:112px;margin:0 12px 8px 0}
        .joined-room-shell .joined-lobby-grid .vxp-lobby-description-row,.joined-room-shell .joined-lobby-grid .vxp-lobby-tags,.joined-room-shell .joined-lobby-grid .vxp-lobby-roles{clear:both}
        .joined-room-shell .joined-lobby-grid .room-pack-select-row>select{display:none}
        .joined-room-shell .joined-lobby-grid .vxp-pack-picker-button{display:block}
        .joined-room-shell .joined-lobby-grid .room-leave-button{flex:none}
        .joined-room-shell .joined-lobby-grid .lobby-main-layout{position:relative;padding-right:396px}
        .joined-room-shell .joined-lobby-grid .room-invite-card{min-height:48px}
        .joined-room-shell .joined-lobby-grid .player-lobby-panel{display:grid;position:static;grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(0,1fr) auto;overflow:hidden}
        .joined-room-shell .joined-lobby-grid .player-lobby-panel>.lobby-player-grid{grid-column:1;grid-row:1;min-height:0;height:auto;padding-right:4px;overflow:hidden auto}
        .joined-room-shell .joined-lobby-grid .player-lobby-panel>.room-chat-panel{z-index:2;grid-column:auto;grid-row:auto;align-self:auto;width:380px;height:auto;min-height:0;max-height:none;display:grid;position:absolute;top:0;right:0;bottom:0;inset-inline-end:0;box-shadow:none}
        .joined-room-shell .joined-lobby-grid .player-lobby-panel>.room-chat-panel.open{height:auto}
        .joined-room-shell .joined-lobby-grid .player-lobby-panel>.room-chat-panel>.room-chat-label{flex:none;max-height:30px;min-height:30px;padding-block:5px;overflow:hidden}
        .joined-room-shell .joined-lobby-grid .player-lobby-panel>.room-chat-panel .room-chat-body{min-height:0;height:calc(100% - 30px);overflow:hidden;grid-template-rows:minmax(0,1fr) auto}
        .joined-room-shell .joined-lobby-grid .player-lobby-panel>.room-chat-panel .room-chat-compose{margin:0}
        .joined-room-shell .joined-lobby-grid .player-lobby-panel>.room-chat-panel .room-chat-error:empty{display:none}
        .joined-room-shell .joined-lobby-grid .player-lobby-panel>.room-chat-panel .room-chat-messages{min-height:0;overflow-y:auto}
        .joined-room-shell .joined-lobby-grid .player-lobby-panel>.lobby-action-dock{grid-column:1;grid-row:2}
      }
      @media(max-width:1279px),(max-height:720px){.vxp-lobby-info{max-height:none}}
      @media(max-width:560px){.vxp-lobby-info{display:block}.vxp-lobby-cover{float:left;margin:0 10px 8px 0;width:70px;height:70px}}
    `;
    const style = h('style', { id: 'vxp-lobby-style' }, css);
    (document.head || document.documentElement).append(style);

    const currentFetch = window.fetch;
    window.fetch = async function (input, init) {
      const response = await currentFetch.apply(this, arguments);
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      if (response.ok && /\/api\/library-sync(?:[/?]|$)/.test(url)) response.clone().json().then(ingestLibrary).catch(() => {});
      return response;
    };

    onBus('room', (room) => { currentRoom = room; scheduleRender(); });
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
