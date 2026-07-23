import path from 'node:path';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import 'dayjs/locale/id.js';
import { downloadContentFromMessage } from '@whiskeysockets/baileys';
import { getAppConfig } from '../config/auth.js';
import { buildBaseFilename } from '../utils/filename.js';
import { sha256File } from '../utils/hash.js';
import { uploadWebpToDrive, makeAnyoneReadable } from '../services/drive.js';
import { ensureDateFolder } from '../services/folder.js';
import { appendBackupRow } from '../services/sheets.js';
import { convertToWebp, getFileSize, removeFile } from '../services/image.js';
import { logger } from '../utils/logger.js';
import fs from 'fs-extra';

dayjs.extend(utc);
dayjs.extend(timezone);

function formatRatio(beforeSize, afterSize) {
  if (!beforeSize || !afterSize) return '0%';
  return `${(((beforeSize - afterSize) / beforeSize) * 100).toFixed(2)}%`;
}

export async function handleImageMessage({ msg, client, drive, sheets, spreadsheetId: runtimeSpreadsheetId }) {
  const { timezone: tz, webpQuality, driveRootFolderId } = getAppConfig();
  if (!driveRootFolderId || !runtimeSpreadsheetId) {
    throw new Error('GOOGLE_DRIVE_ROOT_FOLDER_ID and GOOGLE_SPREADSHEET_ID must be configured.');
  }

  const timestamp = dayjs().tz(tz).locale('id');
  const year = timestamp.format('YYYY');
  const month = timestamp.format('MM MMMM');      // contoh: 07 Juli
  const day = timestamp.format('DD dddd');         // contoh: 17 Jumat
  const folderPath = `${year}/${month}/${day}`;

  const tanggal = timestamp.format('DD/MM/YYYY');
  const jam = timestamp.format('HH:mm:ss');

  const media = msg.message?.imageMessage;
  if (!media) return;

  const caption = media.caption || '';
  const baseFilename = buildBaseFilename({ caption, timestamp: timestamp.toDate() });
  const originalFileName = `${baseFilename}.jpg`;
  const webpFileName = `${baseFilename}.webp`;
  const tempDir = path.resolve(process.cwd(), getAppConfig().tempFolder);
  let inputPath = '';
  let outputPath = '';

  try {
    const folderId = await ensureDateFolder(drive, driveRootFolderId, year, month, day);
    const buffer = await downloadContentFromMessage(media, 'image');
    const chunks = [];
    for await (const chunk of buffer) chunks.push(chunk);
    const inputBuffer = Buffer.concat(chunks);

    const uniqueSuffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    inputPath = path.join(tempDir, `${uniqueSuffix}-${originalFileName}`);
    outputPath = path.join(tempDir, `${uniqueSuffix}-${webpFileName}`);

    await fs.writeFile(inputPath, inputBuffer);
    const sizeBefore = await getFileSize(inputPath);
    await convertToWebp(inputPath, outputPath, webpQuality);
    const sizeAfter = await getFileSize(outputPath);

    const uploadName = webpFileName;
    const uploaded = await uploadWebpToDrive(drive, outputPath, uploadName, folderId);
    await makeAnyoneReadable(drive, uploaded.id).catch(() => {});

    const link = uploaded.webViewLink || `https://drive.google.com/file/d/${uploaded.id}/view`;

    // Hanya catat ke spreadsheet jika berhasil
    await appendBackupRow(sheets, runtimeSpreadsheetId, [
      tanggal,
      jam,
      caption || uploadName,
      link
    ]);

    await client.sendMessage(msg.key.remoteJid, {
      text: `Gambar *${uploadName}* berhasil di backup ✅`
    }, { quoted: msg });

    logger.success('Image backup completed', { fileName: uploadName, folderPath, fileId: uploaded.id });
  } catch (error) {
    logger.error('Image backup failed', { error: error.message });

    await client.sendMessage(msg.key.remoteJid, {
      text: '❌ Upload gagal.\n\nSilakan coba kembali.'
    }, { quoted: msg }).catch(() => {});
  } finally {
    await removeFile(inputPath);
    await removeFile(outputPath);
  }
}
