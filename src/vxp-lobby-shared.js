// Voxalike+OrdaxEd — общие утилиты лобби: чтение локальных ZIP-архивов модов,
// подсчёт реплик по ролям и игрокам. Используется vxp-lobby.js и vxp-lobby-roles.js.
// Загружается раньше них (см. extension/manifest.json). Экспорт: window.__VXP_LOBBY_SHARED__.

(() => {
  'use strict';

  if (window.__VXP_LOBBY_SHARED__) return;

  const DB_NAME = 'project-echo-local-packs';
  const STORE = 'pack-sources';
  const lineCountCache = new Map();
  const portraitCache = new Map();

  const text = (value) => String(value == null ? '' : value);

  function idbAllPacks() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        let transaction;
        try { transaction = db.transaction(STORE, 'readonly'); } catch (err) { db.close(); reject(err); return; }
        const getAll = transaction.objectStore(STORE).getAll();
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

  // Читает project.json локального мода и возвращает { project, characters: Map(id→name) } или null.
  async function loadLocalProject(pack, detail) {
    const records = await idbAllPacks();
    const record = findLocalPack(records, pack, detail);
    const file = record && Array.isArray(record.files) && record.files.find((item) => item && item.blob);
    if (!file) return null;
    const bytes = await readZipEntry(file.blob, 'project.json');
    if (!bytes) return null;
    const project = JSON.parse(new TextDecoder('utf-8').decode(bytes));
    return project;
  }

  // Кеш по ключу пака: { byRole: {имя роли: число реплик}, byCharacterId: {...} }.
  function loadLineCounts(pack, detail) {
    const key = text((detail && detail.packageHash) || pack.workshopPackId || pack.workshopPackSlug || pack.packId);
    if (!key) return Promise.resolve(null);
    if (lineCountCache.has(key)) return lineCountCache.get(key);
    const pending = loadLocalProject(pack, detail).then((project) => {
      if (!project) return null;
      const names = new Map((project.characters || []).map((character) => [character.id, character.name]));
      const byRole = {}, byCharacterId = {};
      for (const line of project.lines || []) {
        byCharacterId[line.characterId] = (byCharacterId[line.characterId] || 0) + 1;
        const name = names.get(line.characterId);
        if (name) byRole[name] = (byRole[name] || 0) + 1;
      }
      return { byRole, byCharacterId, characters: project.characters || [] };
    }).catch((err) => {
      console.warn('[Voxalike+OrdaxEd] lobby local pack', err);
      return null;
    });
    lineCountCache.set(key, pending);
    return pending;
  }

  // MIME по расширению: мод обычно хранит PNG, но портрет может быть пересобран в webp,
  // поэтому тип берём из имени файла, а не из предположения.
  const MIME_BY_EXT = {
    png: 'image/png', webp: 'image/webp', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    gif: 'image/gif', avif: 'image/avif', bmp: 'image/bmp', svg: 'image/svg+xml',
  };
  function mimeFor(name) {
    const ext = text(name).split('.').pop().toLowerCase();
    return MIME_BY_EXT[ext] || 'application/octet-stream';
  }

  // Читает файл портрета из локального архива мода и возвращает Blob с верным MIME.
  // portraitName берётся из project.json (character.portrait) — формат не предполагается.
  async function loadPortraits(pack, detail) {
    const key = text((detail && detail.packageHash) || pack.workshopPackId || pack.workshopPackSlug || pack.packId);
    if (!key) return null;
    if (portraitCache.has(key)) return portraitCache.get(key);
    const pending = loadLocalProject(pack, detail).then(async (project) => {
      if (!project) return null;
      const records = await idbAllPacks();
      const record = findLocalPack(records, pack, detail);
      const file = record && Array.isArray(record.files) && record.files.find((item) => item && item.blob);
      if (!file) return null;
      const out = new Map();
      for (const character of project.characters || []) {
        const name = text(character && character.name);
        const portrait = text(character && character.portrait);
        if (!name || !portrait) continue;
        try {
          const bytes = await readZipEntry(file.blob, portrait);
          if (bytes) out.set(name, new Blob([bytes], { type: mimeFor(portrait) }));
        } catch (err) {
          console.warn('[Voxalike+OrdaxEd] lobby portrait', portrait, err);
        }
      }
      return out.size ? out : null;
    }).catch((err) => {
      console.warn('[Voxalike+OrdaxEd] lobby portraits', err);
      return null;
    });
    portraitCache.set(key, pending);
    return pending;
  }

  window.__VXP_LOBBY_SHARED__ = {
    text, idbAllPacks, findLocalPack, readZipEntry, loadLocalProject, loadLineCounts, loadPortraits, mimeFor,
  };
})();
