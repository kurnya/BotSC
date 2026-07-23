import fs from 'fs-extra';
import path from 'node:path';

export async function loadJsonCache(filePath, fallback = {}) {
  if (!(await fs.pathExists(filePath))) return fallback;
  return fs.readJson(filePath).catch(() => fallback);
}

export async function saveJsonCache(filePath, data) {
  await fs.ensureDir(path.dirname(filePath));
  await fs.writeJson(filePath, data, { spaces: 2 });
}

