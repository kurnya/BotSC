import fs from 'fs-extra';
import path from 'node:path';
import sharp from 'sharp';
import { getAppConfig } from '../config/auth.js';

export async function prepareTempFolder() {
  const { tempFolder } = getAppConfig();
  await fs.ensureDir(path.resolve(process.cwd(), tempFolder));
}

export async function downloadMediaToTemp({ downloadBuffer, fileName }) {
  const { tempFolder } = getAppConfig();
  const resolvedDir = path.resolve(process.cwd(), tempFolder);
  await fs.ensureDir(resolvedDir);

  const originalPath = path.join(resolvedDir, fileName);
  await fs.writeFile(originalPath, downloadBuffer);
  return originalPath;
}

export async function convertToWebp(inputPath, outputPath, quality = 80) {
  await sharp(inputPath)
    .webp({ quality, effort: 6 })
    .toFile(outputPath);
}

export async function getFileSize(filePath) {
  const stat = await fs.stat(filePath);
  return stat.size;
}

export async function removeFile(filePath) {
  await fs.remove(filePath).catch(() => {});
}

