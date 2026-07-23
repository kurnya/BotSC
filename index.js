/**
 * Entry point untuk Pterodactyl Panel
 * Set MAIN_FILE = index.js di panel Startup
 *
 * File ini akan:
 * 1. Tulis credentials dari env vars ke file (untuk deploy via GitHub)
 * 2. Jalankan bot utama (src/index.js)
 */

import fs from 'fs-extra';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function setup() {
  // ── Tulis credentials dari environment variables ──────────────────────────
  // Berguna saat deploy via GitHub (file tidak ikut di repo)

  const writes = [
    {
      envKey: 'GOOGLE_CREDENTIALS_JSON',
      filePath: path.join(__dirname, 'credentials.json'),
      label: 'credentials.json'
    },
    {
      envKey: 'OAUTH_CLIENT_JSON',
      filePath: path.join(__dirname, 'oauth_client.json'),
      label: 'oauth_client.json'
    },
    {
      envKey: 'OAUTH_TOKEN_JSON',
      filePath: path.join(__dirname, 'src', 'auth', 'oauth_token.json'),
      label: 'src/auth/oauth_token.json'
    },
    {
      envKey: 'WA_CREDS_JSON',
      filePath: path.join(__dirname, 'src', 'auth', 'creds.json'),
      label: 'src/auth/creds.json'
    }
  ];

  for (const { envKey, filePath, label } of writes) {
    const value = process.env[envKey];
    if (!value) continue; // Skip jika env var tidak diset (file sudah ada di disk)

    // Jangan overwrite jika file sudah ada (prioritaskan file lokal)
    if (await fs.pathExists(filePath)) continue;

    try {
      await fs.ensureDir(path.dirname(filePath));
      await fs.writeFile(filePath, value, 'utf8');
      console.log(`[setup] ✅ ${label} written from env`);
    } catch (err) {
      console.error(`[setup] ❌ Failed to write ${label}:`, err.message);
    }
  }
}

// Setup dulu, lalu jalankan bot
setup().then(() => import('./src/index.js'));
