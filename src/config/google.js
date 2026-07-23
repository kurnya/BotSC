import path from 'node:path';
import fs from 'fs-extra';
import http from 'node:http';
import { google } from 'googleapis';
import { getGoogleCredentials } from './auth.js';
import { logger } from '../utils/logger.js';

const OAUTH_CLIENT_PATH = path.resolve(process.cwd(), 'oauth_client.json');
const OAUTH_TOKEN_PATH = path.resolve(process.cwd(), 'src/auth/oauth_token.json');
const DRIVE_SCOPES = ['https://www.googleapis.com/auth/drive'];
const REDIRECT_PORT = 3000;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}`;

let cachedDriveClient = null;
let cachedSheetsClient = null;

// ── OAuth2 untuk Drive ──────────────────────────────────────────────────────

function createOAuthClient() {
  const raw = fs.readFileSync(OAUTH_CLIENT_PATH, 'utf8');
  const keys = JSON.parse(raw);
  const key = keys.installed || keys.web;
  return new google.auth.OAuth2(key.client_id, key.client_secret, REDIRECT_URI);
}

async function loadSavedToken(oAuth2Client) {
  try {
    const content = await fs.readFile(OAUTH_TOKEN_PATH, 'utf8');
    const token = JSON.parse(content);
    oAuth2Client.setCredentials({
      access_token: token.access_token,
      refresh_token: token.refresh_token,
      expiry_date: token.expiry_date,
      token_type: token.token_type,
      scope: token.scope
    });
    return true;
  } catch {
    return false;
  }
}

async function saveToken(oAuth2Client) {
  const creds = oAuth2Client.credentials;
  let existing = {};
  try {
    existing = JSON.parse(await fs.readFile(OAUTH_TOKEN_PATH, 'utf8'));
  } catch {}

  const toSave = {
    access_token: creds.access_token || existing.access_token,
    refresh_token: creds.refresh_token || existing.refresh_token,
    scope: creds.scope || existing.scope,
    token_type: creds.token_type || existing.token_type,
    expiry_date: creds.expiry_date || existing.expiry_date
  };

  await fs.ensureDir(path.dirname(OAUTH_TOKEN_PATH));
  await fs.writeFile(OAUTH_TOKEN_PATH, JSON.stringify(toSave, null, 2));
}

async function runOAuthFlow(oAuth2Client) {
  return new Promise((resolve, reject) => {
    const authUrl = oAuth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: DRIVE_SCOPES,
      prompt: 'consent'
    });

    console.log('\n========================================');
    console.log('Buka URL berikut di browser untuk otorisasi Google Drive:');
    console.log('\n' + authUrl + '\n');
    console.log('Menunggu callback di http://localhost:' + REDIRECT_PORT + ' ...');
    console.log('========================================\n');

    const server = http.createServer(async (req, res) => {
      try {
        const url = new URL(req.url, REDIRECT_URI);
        const code = url.searchParams.get('code');
        if (!code) {
          res.end('Tidak ada code. Coba lagi.');
          return;
        }

        res.end('<h2>Otorisasi berhasil! Tutup tab ini dan kembali ke terminal.</h2>');
        server.close();

        const { tokens } = await oAuth2Client.getToken(code);
        oAuth2Client.setCredentials(tokens);
        await saveToken(oAuth2Client);
        logger.info('OAuth token berhasil disimpan — tidak perlu login lagi');
        resolve();
      } catch (err) {
        server.close();
        reject(err);
      }
    });

    server.listen(REDIRECT_PORT, () => {
      logger.info(`OAuth server listening on port ${REDIRECT_PORT}`);
    });

    server.on('error', reject);
  });
}

async function getOAuthDriveClient() {
  if (cachedDriveClient) return cachedDriveClient;

  const oAuth2Client = createOAuthClient();
  const hasToken = await loadSavedToken(oAuth2Client);

  if (!hasToken) {
    // Hanya terjadi sekali — pertama kali setup
    await runOAuthFlow(oAuth2Client);
  }

  // Auto-refresh token otomatis saat expired, tidak perlu interaksi user
  oAuth2Client.on('tokens', async (tokens) => {
    const updated = { ...oAuth2Client.credentials, ...tokens };
    oAuth2Client.setCredentials(updated);
    await saveToken(oAuth2Client);
    logger.info('OAuth token di-refresh otomatis');
  });

  cachedDriveClient = google.drive({ version: 'v3', auth: oAuth2Client });
  return cachedDriveClient;
}

// ── Service Account untuk Sheets ───────────────────────────────────────────

function getSheetsClient() {
  if (cachedSheetsClient) return cachedSheetsClient;

  const credentials = getGoogleCredentials();
  if (!credentials) throw new Error('Google credentials are not configured.');

  const auth = new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });

  cachedSheetsClient = google.sheets({ version: 'v4', auth });
  return cachedSheetsClient;
}

// ── Export ──────────────────────────────────────────────────────────────────

export async function getGoogleClients() {
  const drive = await getOAuthDriveClient();
  const sheets = getSheetsClient();
  return { drive, sheets };
}

export async function createSpreadsheet(sheets, title) {
  const response = await sheets.spreadsheets.create({
    requestBody: { properties: { title } },
    fields: 'spreadsheetId'
  });
  return response.data;
}
