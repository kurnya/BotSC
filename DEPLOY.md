# Deploy Bot ke VPS Node.js

## File yang perlu diupload ke VPS

### ✅ File Wajib
```
src/                       # Semua kode bot
scripts/                   # Helper scripts
logs/.gitkeep             # Folder log (kosong)
credentials.json          # Service Account Sheets
oauth_client.json         # OAuth client Drive
src/auth/                 # Session WA + OAuth token (SEMUA file .json)
package.json
package-lock.json
ecosystem.config.cjs      # PM2 config
README.md
.gitignore
```

### ❌ JANGAN upload
```
node_modules/             # Install ulang di server
temp/                     # Akan dibuat otomatis
logs/*.log               # File log lama
.env                     # Buat baru di server
```

---

## Langkah Deploy di VPS

### 1. Connect ke VPS via SSH

```bash
ssh user@your-vps-ip
# Masukkan password
```

### 2. Install Node.js (jika belum ada)

```bash
# Check versi Node.js
node -v

# Jika belum ada atau versi < 18, install Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verifikasi
node -v   # Harus >= 18
npm -v
```

### 3. Upload file ke VPS

**Cara A: Pakai FTP/SFTP (FileZilla, WinSCP)**
- Upload semua file (kecuali node_modules) ke folder `/home/user/BotSC`

**Cara B: Pakai Git (jika punya repo private)**
```bash
cd ~
git clone https://github.com/username/BotSC.git
cd BotSC

# Upload manual file credentials yang tidak masuk git:
# - credentials.json
# - oauth_client.json
# - src/auth/*.json
```

**Cara C: Pakai rsync dari Windows (PowerShell)**
```powershell
# Dari Windows
rsync -avz --exclude 'node_modules' --exclude 'temp' --exclude 'logs/*.log' ^
  D:\01Projek\DEV\BotSC\ user@your-vps-ip:/home/user/BotSC/
```

### 4. Setup di VPS

```bash
cd ~/BotSC

# Install dependencies
npm install --omit=dev

# Buat file .env
nano .env
```

Paste isi `.env` (sama seperti di lokal):
```env
GOOGLE_APPLICATION_CREDENTIALS=./credentials.json
GOOGLE_DRIVE_ROOT_FOLDER_ID=1wXkfVDeKlVxSqGxNfNHeXgDveI9xu9fH
GOOGLE_SPREADSHEET_ID=1QCzwL_wrhjNlVgrl0Y-LmlHLmsOGdPGhrL_8CJu1_hs
WEBP_QUALITY=80
TIMEZONE=Asia/Jakarta
TEMP_FOLDER=./temp
WHATSAPP_SESSION_FOLDER=./src/auth
ALLOWED_GROUP_IDS=120363409575261790@g.us
```

Save: `Ctrl+X` → `Y` → `Enter`

### 5. Test bot dulu

```bash
npm start
```

Lihat log:
- ✅ Jika muncul "WhatsApp bot connected" → berhasil
- ❌ Jika muncul QR code → berarti session WA belum terupload, logout dan scan ulang

Jika berhasil, `Ctrl+C` untuk stop.

### 6. Install PM2

```bash
# Install PM2 global
sudo npm install -g pm2

# Verifikasi
pm2 -v
```

### 7. Jalankan bot dengan PM2

```bash
# Start bot
npm run pm2:start

# Cek status
pm2 status

# Lihat log realtime
pm2 logs botsc

# Stop log (Ctrl+C), bot tetap jalan
```

### 8. Setup auto-restart saat VPS reboot

```bash
# Generate startup script
pm2 startup

# Jalankan command yang muncul (biasanya dimulai dengan sudo)
# Contoh output:
# sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u user --hp /home/user

# Setelah jalankan command di atas, save PM2 process list
pm2 save
```

Sekarang bot akan otomatis start saat VPS reboot.

---

## Monitoring di VPS

### Cek status bot
```bash
pm2 status
```

### Lihat log
```bash
pm2 logs botsc          # Log realtime
pm2 logs botsc --lines 100   # 100 baris terakhir
```

### Restart bot
```bash
pm2 restart botsc
```

### Stop bot
```bash
pm2 stop botsc
```

### Hapus bot dari PM2
```bash
pm2 delete botsc
```

---

## Troubleshooting

### Bot tidak connect ke WhatsApp
```bash
# Cek log
pm2 logs botsc

# Jika muncul QR, artinya session belum valid
# Stop bot, scan QR di lokal, lalu upload ulang folder src/auth/
pm2 stop botsc
```

### Upload gagal ke Drive
```bash
# Cek apakah oauth_token.json ada
ls -la src/auth/oauth_token.json

# Jika tidak ada, login di lokal lalu upload file tersebut
```

### Error "ENOSPC: no space left on device"
```bash
# Cek disk space
df -h

# Bersihkan log lama
pm2 flush
```

---

## Update Bot di VPS

Jika ada perubahan kode:

```bash
# 1. Stop bot
pm2 stop botsc

# 2. Pull changes (jika pakai git)
git pull

# Atau upload file manual via SFTP

# 3. Install dependencies baru (jika ada)
npm install --omit=dev

# 4. Restart bot
pm2 restart botsc
```

---

## Backup Penting

Backup file berikut secara berkala:

```bash
# Di VPS
cd ~/BotSC
tar -czf backup-$(date +%Y%m%d).tar.gz \
  src/auth/ \
  credentials.json \
  oauth_client.json \
  .env

# Download backup ke lokal
scp user@vps-ip:~/BotSC/backup-*.tar.gz D:\Backup\
```

---

## Port yang Dibutuhkan

Bot tidak butuh port terbuka dari luar. Tapi jika OAuth perlu re-login di server:
- Port 3000 (localhost only) untuk OAuth callback

Jika ingin login OAuth di server tanpa browser:
```bash
# Forward port 3000 ke lokal via SSH tunnel
ssh -L 3000:localhost:3000 user@vps-ip

# Jalankan bot di VPS
npm start

# Buka browser di Windows
# http://localhost:3000 akan forward ke VPS
```

---

## Resource yang Dibutuhkan

Bot ini sangat ringan:
- RAM: ~150-200MB
- CPU: Minimal
- Disk: ~100MB (tanpa node_modules ~20MB)

VPS minimal: **512MB RAM, 1 vCPU** sudah cukup.
