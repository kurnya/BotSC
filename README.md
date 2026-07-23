# WA Drive Backup

Bot WhatsApp berbasis Node.js dan Baileys untuk membackup foto ke Google Drive, lalu mencatat detail upload ke Google Sheets.

## Fitur

- Menerima `imageMessage` dari WhatsApp
- Konversi otomatis ke WebP dengan `sharp`
- Upload ke folder Google Drive bertingkat `Tahun/Bulan/Tanggal`
- Cache folder ID agar query Drive tidak berulang
- Append log upload ke Google Sheets
- Hitung SHA-256 file WebP
- Balasan sukses/gagal ke pengirim

## Struktur Project

```text
wa-drive-backup/
src/
├── config/
├── services/
├── handlers/
├── utils/
├── temp/
├── index.js
├── .env
├── package.json
└── README.md
```

## Instalasi

1. Pastikan Node.js 18+ terpasang.
2. Jalankan:

```bash
npm install
```

3. Isi file `.env`.

## Setup Google Cloud

1. Buat Google Cloud Project.
2. Aktifkan Google Drive API.
3. Aktifkan Google Sheets API.
4. Buat Service Account.
5. Unduh file JSON credential.
6. Beri akses Editor atau Content Manager ke folder Drive tujuan dan spreadsheet untuk service account email.

## Menentukan Folder ID

1. Buat folder utama di Google Drive, misalnya `Backup Foto WA`.
2. Buka folder tersebut di browser.
3. Salin bagian ID dari URL.

Contoh:

```text
https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUvWxYz
```

Nilai `1AbCdEfGhIjKlMnOpQrStUvWxYz` adalah `GOOGLE_DRIVE_ROOT_FOLDER_ID`.

## Konfigurasi `.env`

```env
GOOGLE_APPLICATION_CREDENTIALS=./credentials.json
GOOGLE_DRIVE_ROOT_FOLDER_ID=
GOOGLE_SPREADSHEET_ID=
WEBP_QUALITY=80
TIMEZONE=Asia/Jakarta
TEMP_FOLDER=./temp
WHATSAPP_SESSION_FOLDER=./src/auth
```

## Menjalankan Bot

```bash
npm start
```

Saat pertama kali dijalankan, terminal akan menampilkan QR code. Scan memakai WhatsApp yang akan menjadi akun bot.

## Alur Kerja

1. Bot menerima gambar.
2. Gambar diunduh ke folder sementara.
3. File dikonversi ke WebP.
4. File diunggah ke folder Drive sesuai tanggal.
5. Data dicatat ke spreadsheet.
6. File sementara dihapus.

## Catatan Spreadsheet

Kolom yang diisi:

- No
- Timestamp
- Nama WA
- Nomor WA
- Nama File
- Caption
- Tahun
- Bulan
- Tanggal
- Folder Path
- Google Drive File ID
- Google Drive Link
- MIME Type
- Ukuran Sebelum
- Ukuran Sesudah
- Rasio Kompresi
- SHA256
- Status
- Error

## Troubleshooting

- Bot tidak bisa login:
  - Hapus folder session di `src/auth`, lalu login ulang.
- Upload gagal:
  - Pastikan service account punya akses ke folder root dan spreadsheet.
- Folder tidak ditemukan:
  - Pastikan `GOOGLE_DRIVE_ROOT_FOLDER_ID` diisi dengan benar.
- Spreadsheet tidak terisi:
  - Pastikan `GOOGLE_SPREADSHEET_ID` benar dan API Sheets aktif.
- Foto tidak diproses:
  - Bot hanya memproses `imageMessage`.

## Pengembangan Lanjutan

- Tambahkan deduplikasi berdasarkan SHA-256
- Tambahkan retry dengan exponential backoff
- Tambahkan observability untuk produksi

