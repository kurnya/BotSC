import fs from 'fs-extra';
import { logger } from '../utils/logger.js';

// Retry dengan exponential backoff untuk transient Google API errors (429, 500, 503)
const RETRYABLE_CODES = new Set([429, 500, 502, 503, 504]);
const RETRYABLE_MESSAGES = ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'socket hang up', 'network'];

async function withRetry(label, fn, maxAttempts = 4) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const status = error?.response?.status || error?.code;
      const message = error?.message || '';
      const isRetryableCode = RETRYABLE_CODES.has(Number(status));
      const isRetryableMessage = RETRYABLE_MESSAGES.some((m) => message.includes(m));
      const isRetryable = isRetryableCode || isRetryableMessage;
      if (!isRetryable || attempt === maxAttempts) throw error;
      const delay = 1000 * 2 ** (attempt - 1); // 1s, 2s, 4s
      logger.warning(`${label} failed (${status || message}), retrying in ${delay}ms`, { attempt });
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

export async function uploadWebpToDrive(drive, filePath, fileName, folderId) {
  return withRetry('uploadWebpToDrive', () =>
    drive.files.create({
      supportsAllDrives: true,
      requestBody: {
        name: fileName,
        parents: [folderId]
      },
      media: {
        mimeType: 'image/webp',
        body: fs.createReadStream(filePath)
      },
      fields: 'id, name, webViewLink, mimeType, size'
    }).then((r) => r.data)
  );
}

export async function makeAnyoneReadable(drive, fileId) {
  return withRetry('makeAnyoneReadable', () =>
    drive.permissions.create({
      fileId,
      supportsAllDrives: true,
      requestBody: {
        role: 'reader',
        type: 'anyone'
      }
    })
  );
}
