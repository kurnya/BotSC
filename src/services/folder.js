import path from 'node:path';
import { loadJsonCache, saveJsonCache } from '../utils/cache.js';
import { logger } from '../utils/logger.js';

const cacheFile = path.resolve(process.cwd(), 'temp', 'drive-folder-cache.json');

// Mutex sederhana untuk cegah concurrent folder creation / cache write
let _folderLock = Promise.resolve();

function makeKey(year, month, day) {
  return `${year}/${month}/${day}`;
}

async function findFolder(drive, parentId, name) {
  const query = [
    `'${parentId}' in parents`,
    `name = '${name.replace(/'/g, "\\'")}'`,
    "mimeType = 'application/vnd.google-apps.folder'",
    'trashed = false'
  ].join(' and ');

  const response = await drive.files.list({
    q: query,
    fields: 'files(id, name)',
    pageSize: 10,
    spaces: 'drive',
    includeItemsFromAllDrives: true,
    supportsAllDrives: true
  });

  return response.data.files?.[0] || null;
}

async function createFolder(drive, parentId, name) {
  const response = await drive.files.create({
    supportsAllDrives: true,
    requestBody: {
      name,
      parents: [parentId],
      mimeType: 'application/vnd.google-apps.folder'
    },
    fields: 'id, name'
  });
  return response.data;
}

export async function ensureDateFolder(drive, rootFolderId, year, month, day) {
  // Serialisasi akses ke cache dan Drive agar tidak ada duplikasi folder
  _folderLock = _folderLock.then(() => _ensureDateFolderInner(drive, rootFolderId, year, month, day));
  return _folderLock;
}

async function _ensureDateFolderInner(drive, rootFolderId, year, month, day) {
  const cache = await loadJsonCache(cacheFile, {});
  const key = makeKey(year, month, day);
  if (cache[key]) return cache[key];

  const yearKey = String(year);
  const monthKey = `${year}/${month}`;
  const dayKey = key;

  cache[yearKey] ||= null;
  cache[monthKey] ||= null;
  cache[dayKey] ||= null;

  let currentId = rootFolderId;
  for (const part of [yearKey, month, day]) {
    const folderKey = part === yearKey ? yearKey : part === month ? monthKey : dayKey;
    if (cache[folderKey]) {
      currentId = cache[folderKey];
      continue;
    }

    const name = String(part);
    let folder = await findFolder(drive, currentId, name);
    if (!folder) {
      folder = await createFolder(drive, currentId, name);
      logger.info(`Created Drive folder ${name}`, { folderId: folder.id });
    }

    cache[folderKey] = folder.id;
    currentId = folder.id;
  }

  cache[dayKey] = currentId;
  await saveJsonCache(cacheFile, cache);
  return currentId;
}
