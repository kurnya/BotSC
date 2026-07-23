# WhatsApp Drive Backup Bot

Bot WhatsApp untuk backup foto dari grup ke Google Drive dan Google Sheets secara otomatis.

## Fitur

- ✅ Backup foto dari grup WhatsApp ke Google Drive
- ✅ Catat metadata backup di Google Sheets
- ✅ Konversi gambar ke WebP untuk hemat storage
- ✅ Organisasi folder otomatis (Tahun/Bulan/Hari)
- ✅ Filter grup tertentu yang mau dibackup
- ✅ Queue system untuk hindari race condition
- ✅ Auto-retry untuk Google API errors
- ✅ Crash recovery & auto-reconnect

---

## Setup Awal

### 1. Install Dependencies

```bash
npm install
```

### 2. Konfigurasi Google API

#### a. Google Drive (OAuth2)
1. Buat OAuth 2.0 Client ID di [Google Cloud Console](https://console.cloud.google.com/)
2. Download credentials dan simpan sebagai `oauth_client.json`
3. Enable **Google Drive API**

#### b. Google Sheets (Service Account)
1. Buat Service Account di Google Cloud Console
2. Download credentials dan simpan sebagai `credentials.json`
3. Enable **Google Sheets API**
4. Buat spreadsheet baru, lalu **share** ke email service account dengan akses **Editor**

#### c. Google Drive Root Folder
1. Buat folder di Google Drive untuk backup
2. **Share** folder tersebut ke email service account dengan akses **Editor**
3. Copy ID folder dari URL (contoh: `https://drive.google.com/drive/folders/1wXkfVDeKl...` → ID-nya `1wXkfVDeKl...`)

### 3. Setup Environment Variables

Buat file `.env`:

```env
GOOGLE_APPLICATION_CREDENTIALS=./credentials.json
GOOGLE_DRIVE_ROOT_FOLDER_ID=your_folder_id_here
GOOGLE_SPREADSHEET_ID=your_spreadsheet_id_here
WEBP_QUALITY=80
TIMEZONE=Asia/Jakarta
TEMP_FOLDER=./temp
WHATSAPP_SESSION_FOLDER=./src/auth

# ID grup yang diizinkan, pisahkan dengan koma jika lebih dari satu
# Kosongkan untuk monitor SEMUA grup (tidak recommended)
ALLOWED_GROUP_IDS=
```

### 4. Login WhatsApp

```bash
npm start
```

Scan QR code yang muncul dari **WhatsApp > Linked Devices**.

Session akan tersimpan di `src/auth/` — tidak perlu scan ulang setelah restart.

---

## Testing Lokal

### 1. Cek Daftar Grup

Setelah login WhatsApp, cek ID grup yang bot sudah join:

```bash
npm run list-groups
```

Output:
```
📋 Found 2 group(s):

════════════════════════════════════════════════════════════════════════════════
1. Tim Marketing
   ID: 120363409575261790@g.us
   Members: 12
────────────────────────────────────────────────────────────────────────────────
2. Family Group
   ID: 120363287364291823@g.us
   Members: 8
────────────────────────────────────────────────────────────────────────────────

💡 Copy the ID above and paste it into .env as ALLOWED_GROUP_IDS
```

### 2. Update `.env`

Copy ID grup yang ingin dimonitor ke `.env`:

```env
ALLOWED_GROUP_IDS=120363409575261790@g.us
```

Atau monitor beberapa grup sekaligus:

```env
ALLOWED_GROUP_IDS=120363409575261790@g.us,120363287364291823@g.us
```

### 3. Jalankan Bot

```bash
npm start
```

Log akan menampilkan setiap pesan yang masuk dari grup:

```
📩 Message from group { groupId: '120363409575261790@g.us', groupName: 'Tim Marketing', hasImage: true }
✅ Image backup completed { fileName: 'laporan-harian.webp', folderPath: '2026/07 Juli/23 Kamis', fileId: '1abc...' }
```

### 4. Test Upload

Kirim foto ke grup yang sudah dikonfigurasi. Bot akan:
1. Log ID grup di terminal
2. Download foto
3. Konversi ke WebP
4. Upload ke Google Drive
5. Catat ke Google Sheets
6. Reply konfirmasi di grup

---

## Production (24/7)

### Jalankan via PM2

```bash
npm run pm2:start
```

### Monitoring

```bash
npm run pm2:status   # status bot
npm run pm2:logs     # log realtime
npm run pm2:restart  # restart bot
npm run pm2:stop     # stop bot
```

### Auto-start saat server reboot (Linux VPS)

```bash
pm2 startup   # generate systemd command
# jalankan command yang muncul (sudo env ...)
pm2 save      # simpan daftar proses
```

---

## Troubleshooting

### QR tidak muncul
- Pastikan terminal bisa render QR ASCII
- Atau gunakan `npm run list-groups` untuk test koneksi

### `ENOENT: no such file or directory 'src/auth'`
- Jalankan `npm start` dulu untuk login

### Upload gagal ke Drive
- Cek apakah folder root sudah dishare ke service account
- Cek quota Google Drive

### Upload gagal ke Sheets
- Cek apakah spreadsheet sudah dishare ke service account
- Pastikan `GOOGLE_SPREADSHEET_ID` benar

### Bot tidak proses foto dari grup tertentu
- Jalankan `npm run list-groups` untuk cek ID grup yang benar
- Pastikan ID di `.env` sama persis (termasuk `@g.us`)

---

## File Structure

```
BotSC/
├── src/
│   ├── config/        # Konfigurasi Google & auth
│   ├── handlers/      # Handler pesan WhatsApp
│   ├── services/      # Logic Drive, Sheets, Image
│   ├── utils/         # Logger, cache, queue, dll
│   └── index.js       # Entry point
├── scripts/
│   └── list-groups.js # Helper untuk list ID grup
├── logs/              # PM2 logs
├── temp/              # Temporary files
├── .env               # Environment variables (jangan commit!)
├── ecosystem.config.cjs  # PM2 config
└── package.json
```

---

## Tech Stack

- **@whiskeysockets/baileys** — WhatsApp Web API
- **googleapis** — Google Drive & Sheets API
- **sharp** — Image processing (WebP conversion)
- **PM2** — Process manager untuk production

---

## License

MIT
