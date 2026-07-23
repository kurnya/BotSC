# Deploy BotSC ke Pterodactyl via GitHub

## Konsep

File sensitif (credentials, session WA) TIDAK masuk GitHub.
Semua file sensitif disimpan sebagai **Environment Variables** di panel Pterodactyl,
lalu script startup akan menulisnya ke file saat server start.

```
GitHub Repo (kode saja)
         ↓ auto pull
Pterodactyl Server
         ↓ baca env vars
Script startup tulis credentials ke file
         ↓
Bot jalan 24/7
```

---

## Langkah 1: Push ke GitHub

### Buat repo GitHub baru (private)

1. Buka [github.com/new](https://github.com/new)
2. Repository name: `BotSC` (atau nama lain)
3. Visibility: **Private** ⚠️ (jangan public karena ada kode sensitif)
4. Klik **Create repository**

### Push dari Windows (PowerShell/CMD)

```bash
cd D:\01Projek\DEV\BotSC

# Init git (jika belum)
git init
git add .
git commit -m "Initial commit"

# Push ke GitHub
git remote add origin https://github.com/USERNAME/BotSC.git
git branch -M main
git push -u origin main
```

---

## Langkah 2: Siapkan isi Environment Variables

Anda perlu menyiapkan isi dari file-file berikut dalam format JSON string.

### a. GOOGLE_CREDENTIALS_JSON
Isi dari file `credentials.json` (Service Account):
- Buka `credentials.json`
- Copy SEMUA isinya (termasuk kurung kurawal)
- Paste ke env var di panel

### b. OAUTH_CLIENT_JSON
Isi dari file `oauth_client.json`:
- Buka `oauth_client.json`
- Copy SEMUA isinya
- Paste ke env var di panel

### c. OAUTH_TOKEN_JSON
Isi dari file `src/auth/oauth_token.json`:
- Buka `src/auth/oauth_token.json`
- Copy SEMUA isinya
- Paste ke env var di panel

### d. WA_CREDS_JSON
Isi dari file `src/auth/creds.json`:
- Buka `src/auth/creds.json`
- Copy SEMUA isinya
- Paste ke env var di panel

> ⚠️ PENTING: File `src/auth/creds.json` adalah session WhatsApp.
> Jika tidak ada, bot akan minta scan QR ulang.

---

## Langkah 3: Setup di Panel Pterodactyl

### Tab Startup

| Variable | Value |
|---|---|
| **MAIN FILE** | `src/index.js` |
| **GIT REPO ADDRESS** | `https://github.com/USERNAME/BotSC.git` |
| **INSTALL BRANCH** | `main` |
| **AUTO UPDATE** | `ON` (agar otomatis pull saat restart) |
| **USER UPLOADED FILES** | `OFF` |
| **GIT USERNAME** | username GitHub Anda |
| **GIT ACCESS TOKEN** | Personal Access Token GitHub |

### Tab Settings → Environment Variables

Tambahkan semua variabel berikut:

| Variable | Value |
|---|---|
| `GOOGLE_DRIVE_ROOT_FOLDER_ID` | `1wXkfVDeKlVxSqGxNfNHeXgDveI9xu9fH` |
| `GOOGLE_SPREADSHEET_ID` | `1QCzwL_wrhjNlVgrl0Y-LmlHLmsOGdPGhrL_8CJu1_hs` |
| `ALLOWED_GROUP_IDS` | `120363409575261790@g.us` |
| `WEBP_QUALITY` | `80` |
| `TIMEZONE` | `Asia/Jakarta` |
| `GOOGLE_CREDENTIALS_JSON` | *(isi credentials.json)* |
| `OAUTH_CLIENT_JSON` | *(isi oauth_client.json)* |
| `OAUTH_TOKEN_JSON` | *(isi src/auth/oauth_token.json)* |
| `WA_CREDS_JSON` | *(isi src/auth/creds.json)* |

---

## Langkah 4: Buat GitHub Personal Access Token

Diperlukan agar Pterodactyl bisa pull repo private.

1. Buka [github.com/settings/tokens](https://github.com/settings/tokens)
2. Klik **Generate new token (classic)**
3. Note: `Pterodactyl BotSC`
4. Expiration: **No expiration**
5. Centang scope: **repo** (full)
6. Klik **Generate token**
7. Copy token, paste ke **GIT ACCESS TOKEN** di panel Startup

---

## Langkah 5: Start Server

1. Klik **Start** di panel Pterodactyl
2. Server akan:
   - Pull kode dari GitHub
   - `npm install`
   - Tulis credentials dari env vars ke file
   - Jalankan `node src/index.js`
3. Lihat Console untuk memastikan bot connect ke WhatsApp

---

## Update Kode (Cara Kerja Setelah Setup)

Setiap ada update kode:

```bash
# Di Windows
git add .
git commit -m "Update: deskripsi perubahan"
git push
```

Di panel Pterodactyl:
- Klik **Restart** → otomatis pull kode terbaru dari GitHub → bot jalan dengan kode baru

---

## Update Session WhatsApp (Jika Perlu Scan QR Ulang)

Jika session expired atau ganti nomor:

1. Di lokal: hapus `src/auth/`, jalankan `npm start`, scan QR baru
2. Copy isi `src/auth/creds.json` yang baru
3. Di panel Pterodactyl → Settings → Update env var `WA_CREDS_JSON`
4. Copy juga isi `src/auth/oauth_token.json` → update env var `OAUTH_TOKEN_JSON`
5. Restart server

---

## Troubleshooting

### Bot minta scan QR di console
→ `WA_CREDS_JSON` kosong atau expired
→ Update env var dengan isi `src/auth/creds.json` yang baru dari lokal

### Upload Drive gagal: invalid_grant
→ `OAUTH_TOKEN_JSON` expired
→ Di lokal: `npm start` agar token di-refresh, copy isi baru ke env var

### npm install error: install scripts blocked
→ Sudah ditangani oleh `.npmrc` di repo
→ Jika masih error, di console jalankan: `npm install --foreground-scripts`
