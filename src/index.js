import fs from 'fs-extra';
import path from 'node:path';
import makeWASocket, { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import { getAppConfig } from './config/auth.js';
import { getGoogleClients, createSpreadsheet } from './config/google.js';
import { initSheetCounter, ensureSpreadsheetHeader } from './services/sheets.js';
import { handleImageMessage } from './handlers/imageHandler.js';
import { logger } from './utils/logger.js';
import { MessageQueue } from './utils/queue.js';
import { createDocumentServer } from './server.js';

// ── Global crash handler ────────────────────────────────────────────────────
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { error: error.message, stack: error.stack });
  // Jangan exit — biarkan bot tetap jalan kecuali error fatal
});

process.on('unhandledRejection', (reason) => {
  const message = reason instanceof Error ? reason.message : String(reason);
  logger.error('Unhandled promise rejection', { reason: message });
});

// ── Inisialisasi Google clients sekali saja — tidak diulang saat reconnect ──
let drive, sheets, spreadsheetId;

// Antrian pesan untuk cegah race condition concurrent upload
const messageQueue = new MessageQueue();

async function initGoogle() {
  const config = getAppConfig();
  logger.info('Initializing Google clients...');
  const clients = await getGoogleClients(); // Restore await
  logger.info('Clients received', { hasDrive: !!clients.drive, hasSheets: !!clients.sheets });
  drive = clients.drive;
  sheets = clients.sheets;
  spreadsheetId = config.spreadsheetId;

  if (!spreadsheetId) {
    const created = await createSpreadsheet(sheets, config.spreadsheetName);
    spreadsheetId = created.spreadsheetId;
    logger.success('Spreadsheet created automatically', { spreadsheetId });
    logger.warning('Set GOOGLE_SPREADSHEET_ID in .env to keep using this spreadsheet after restart');
  }

  await ensureSpreadsheetHeader(sheets, spreadsheetId);
  await initSheetCounter(sheets, spreadsheetId);
}

// Bersihkan file temp sisa dari crash sebelumnya
async function cleanupTempFolder() {
  const config = getAppConfig();
  const tempDir = path.resolve(process.cwd(), config.tempFolder);
  await fs.ensureDir(tempDir);

  try {
    const files = await fs.readdir(tempDir);
    const stale = files.filter((f) => f !== 'drive-folder-cache.json');
    await Promise.all(stale.map((f) => fs.remove(path.join(tempDir, f)).catch(() => {})));
    if (stale.length > 0) {
      logger.info('Cleaned up stale temp files', { count: stale.length });
    }
  } catch (error) {
    logger.warning('Could not clean temp folder', { error: error.message });
  }
}

// Reconnect dengan exponential backoff untuk hindari infinite loop cepat
let reconnectAttempts = 0;
const MAX_RECONNECT_DELAY_MS = 60_000;

function getReconnectDelay() {
  const delay = Math.min(1000 * 2 ** reconnectAttempts, MAX_RECONNECT_DELAY_MS);
  reconnectAttempts = Math.min(reconnectAttempts + 1, 10);
  return delay;
}

// Socket aktif saat ini (null saat terputus) — dipakai server HTTP pengirim dokumen
let activeSock = null;
let serverStarted = false;

function startDocumentServer() {
  if (serverStarted) return;
  const token = process.env.SEND_TOKEN;
  const groupId = process.env.SEND_GROUP_ID;
  const port = process.env.PORT || process.env.SERVER_PORT;
  if (!token || !groupId || !port) {
    logger.warning('Server kirim dokumen nonaktif: set SEND_TOKEN, SEND_GROUP_ID, dan PORT/SERVER_PORT');
    return;
  }
  serverStarted = true;
  createDocumentServer({ getSock: () => activeSock, token, groupId, corsOrigin: process.env.CORS_ORIGIN || '*' })
    .listen(port, () => logger.info('Server kirim dokumen aktif', { port }));
}

async function startBot() {
  const config = getAppConfig();
  await fs.ensureDir(path.resolve(process.cwd(), config.whatsappSessionFolder));

  const { state, saveCreds } = await useMultiFileAuthState(config.whatsappSessionFolder);

  let version;
  try {
    const result = await fetchLatestBaileysVersion();
    version = result.version;
    logger.info('Baileys version fetched', { version });
  } catch {
    version = [2, 3000, 1023565401];
    logger.warning('Could not fetch Baileys version, using fallback', { version });
  }

  logger.info('Starting WhatsApp socket...');
  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: process.env.BAILEYS_LOG_LEVEL || 'silent' }),
    browser: ['WA Drive Backup', 'Chrome', '1.0.0'],
    connectTimeoutMs: 60_000,
    defaultQueryTimeoutMs: 60_000
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\nScan QR berikut dari WhatsApp > Linked Devices:\n');
      qrcode.generate(qr, { small: true });
      console.log('');
    }

    if (connection === 'open') {
      reconnectAttempts = 0; // reset backoff setelah berhasil connect
      activeSock = sock;
      startDocumentServer();
      logger.success('WhatsApp bot connected');
      
      // Log konfigurasi grup yang dimonitor
      const { allowedGroupIds } = getAppConfig();
      if (allowedGroupIds.length === 0) {
        logger.warning('⚠️  ALLOWED_GROUP_IDS is empty — monitoring ALL groups');
      } else {
        logger.info('✅ Monitoring specific groups', { 
          count: allowedGroupIds.length,
          groupIds: allowedGroupIds 
        });
      }
    }

    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = code !== DisconnectReason.loggedOut;
      if (activeSock === sock) activeSock = null;
      logger.warning('Connection closed', { code, shouldReconnect });

      if (shouldReconnect) {
        const delay = getReconnectDelay();
        logger.info(`Reconnecting in ${delay}ms (attempt ${reconnectAttempts})...`);
        setTimeout(() => {
          startBot().catch((error) => logger.error('Reconnect failed', { error: error.message }));
        }, delay);
      } else {
        logger.error('Bot logged out. Scan QR again to reconnect.');
      }
    }
  });

  sock.ev.on('messages.upsert', ({ messages, type }) => {
    if (type !== 'notify') return;

    const { allowedGroupIds } = getAppConfig();

    for (const msg of messages) {
      const remoteJid = msg.key?.remoteJid || '';

      // Hanya proses pesan dari grup
      if (!remoteJid.endsWith('@g.us')) continue;

      // Log ID grup setiap ada pesan masuk (untuk debugging dan setup)
      const groupName = msg.pushName || 'Unknown Group';
      logger.info('📩 Message from group', { 
        groupId: remoteJid, 
        groupName,
        hasImage: !!msg.message?.imageMessage 
      });

      // Filter grup tertentu jika ALLOWED_GROUP_IDS diset
      if (allowedGroupIds.length > 0 && !allowedGroupIds.includes(remoteJid)) {
        logger.info('⏭️  Skipped: group not in allowed list', { groupId: remoteJid });
        continue;
      }

      const imageMessage = msg.message?.imageMessage;
      if (!imageMessage) continue;

      // Masukkan ke antrian agar tidak race condition saat concurrent upload
      messageQueue.enqueue(() =>
        handleImageMessage({ msg, client: sock, drive, sheets, spreadsheetId })
      );
    }
  });
}

// Jalankan: init Google dulu, cleanup temp, baru start bot
initGoogle()
  .then(() => cleanupTempFolder())
  .then(() => startBot())
  .catch((error) => {
    logger.error('Bot failed to start', {
      error: error.message,
      stack: error.stack,
      response: error.response?.data || null
    });
    process.exitCode = 1;
  });
