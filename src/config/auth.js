import fs from 'fs-extra';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config();

function parseCredentialsFromEnv() {
  const raw = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error('GOOGLE_APPLICATION_CREDENTIALS_JSON is not valid JSON.');
  }
}

export function getGoogleCredentials() {
  const jsonCredentials = parseCredentialsFromEnv();
  if (jsonCredentials) return jsonCredentials;

  const filePath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!filePath) return null;

  const resolved = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Google credentials file not found: ${resolved}`);
  }

  return JSON.parse(fs.readFileSync(resolved, 'utf8'));
}

export function getAppConfig() {
  return {
    spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID || '',
    spreadsheetName: process.env.GOOGLE_SPREADSHEET_NAME || 'Log Backup WA',
    driveRootFolderId: process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID || '',
    timezone: process.env.TIMEZONE || 'Asia/Jakarta',
    webpQuality: Number(process.env.WEBP_QUALITY || 80),
    tempFolder: process.env.TEMP_FOLDER || './temp',
    whatsappSessionFolder: process.env.WHATSAPP_SESSION_FOLDER || './src/auth',
    allowedGroupIds: process.env.ALLOWED_GROUP_IDS
      ? process.env.ALLOWED_GROUP_IDS.split(',').map((id) => id.trim()).filter(Boolean)
      : []
  };
}
