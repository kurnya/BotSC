#!/bin/bash
# ============================================================
# Pterodactyl Startup Script untuk BotSC
# Set MAIN_FILE = scripts/pterodactyl-start.sh di panel
# ============================================================

set -e

echo ""
echo "========================================"
echo "  BotSC - WhatsApp Drive Backup Bot"
echo "========================================"
echo ""

# ── 1. Decode credentials dari environment variable ──────────────────────────
# Pterodactyl tidak bisa upload file sensitif via git
# Simpan isi file JSON sebagai environment variable di panel Settings

if [ ! -z "$GOOGLE_CREDENTIALS_JSON" ]; then
  echo "[setup] Writing credentials.json from env..."
  echo "$GOOGLE_CREDENTIALS_JSON" > /home/container/credentials.json
  echo "[setup] credentials.json created ✅"
fi

if [ ! -z "$OAUTH_CLIENT_JSON" ]; then
  echo "[setup] Writing oauth_client.json from env..."
  echo "$OAUTH_CLIENT_JSON" > /home/container/oauth_client.json
  echo "[setup] oauth_client.json created ✅"
fi

# ── 2. Buat folder src/auth jika belum ada ─────────────────────────────────
mkdir -p /home/container/src/auth

if [ ! -z "$OAUTH_TOKEN_JSON" ]; then
  echo "[setup] Writing oauth_token.json from env..."
  echo "$OAUTH_TOKEN_JSON" > /home/container/src/auth/oauth_token.json
  echo "[setup] oauth_token.json created ✅"
fi

if [ ! -z "$WA_CREDS_JSON" ]; then
  echo "[setup] Writing WhatsApp creds.json from env..."
  echo "$WA_CREDS_JSON" > /home/container/src/auth/creds.json
  echo "[setup] creds.json created ✅"
fi

# ── 3. Buat .env dari environment variables panel ─────────────────────────────
echo "[setup] Writing .env file..."
cat > /home/container/.env << EOF
GOOGLE_APPLICATION_CREDENTIALS=./credentials.json
GOOGLE_DRIVE_ROOT_FOLDER_ID=${GOOGLE_DRIVE_ROOT_FOLDER_ID}
GOOGLE_SPREADSHEET_ID=${GOOGLE_SPREADSHEET_ID}
WEBP_QUALITY=${WEBP_QUALITY:-80}
TIMEZONE=${TIMEZONE:-Asia/Jakarta}
TEMP_FOLDER=./temp
WHATSAPP_SESSION_FOLDER=./src/auth
ALLOWED_GROUP_IDS=${ALLOWED_GROUP_IDS}
EOF
echo "[setup] .env created ✅"

# ── 4. Buat folder temp dan logs ───────────────────────────────────────────────
mkdir -p /home/container/temp
mkdir -p /home/container/logs

# ── 5. Jalankan bot ─────────────────────────────────────────────────────────
echo ""
echo "[start] Starting bot..."
echo ""
cd /home/container
exec /usr/local/bin/node src/index.js
