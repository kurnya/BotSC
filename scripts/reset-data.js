/**
 * Script untuk reset data bot (bersihkan cache + reset counter Sheets)
 * Jalankan: node scripts/reset-data.js
 *
 * Yang dilakukan:
 * - Hapus cache folder Drive
 * - Hapus semua baris data di Sheets (baris 2 ke bawah)
 * - Reset format header Sheets
 *
 * Yang TIDAK dilakukan:
 * - Tidak hapus file di Google Drive (lakukan manual)
 * - Tidak hapus session WhatsApp
 */

import fs from 'fs-extra';
import path from 'node:path';
import dotenv from 'dotenv';
import { getGoogleClients } from '../src/config/google.js';
import { ensureSpreadsheetHeader, initSheetCounter } from '../src/services/sheets.js';

dotenv.config();

const CACHE_FILE = path.resolve(process.cwd(), 'temp', 'drive-folder-cache.json');

async function resetData() {
  console.log('\n🔄 Resetting bot data...\n');

  // ── 1. Hapus cache folder Drive ──────────────────────────────────────────
  if (await fs.pathExists(CACHE_FILE)) {
    await fs.remove(CACHE_FILE);
    console.log('✅ Drive folder cache cleared');
  } else {
    console.log('ℹ️  Drive folder cache already empty');
  }

  // ── 2. Reset Sheets ───────────────────────────────────────────────────────
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  if (!spreadsheetId) {
    console.log('⚠️  GOOGLE_SPREADSHEET_ID not set, skipping Sheets reset');
  } else {
    console.log('🔄 Connecting to Google Sheets...');
    const { sheets } = await getGoogleClients();
    const sheetName = 'Sheet1';

    // Ambil jumlah baris yang ada
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A:A`
    });

    const rowCount = response.data.values?.length || 0;

    if (rowCount > 1) {
      // Hapus semua baris data (baris 2 ke bawah), biarkan header
      await sheets.spreadsheets.values.clear({
        spreadsheetId,
        range: `${sheetName}!A2:E`
      });
      console.log(`✅ Cleared ${rowCount - 1} data rows from Sheets`);
    } else {
      console.log('ℹ️  Sheets already empty');
    }

    // Re-apply format header agar tetap rapi
    await ensureSpreadsheetHeader(sheets, spreadsheetId);
    console.log('✅ Sheets header re-formatted');
  }

  console.log('\n✅ Reset complete!\n');
  console.log('📝 Reminder: Hapus manual folder 2026/ di Google Drive root backup folder.');
  console.log('   Buka: https://drive.google.com/drive/folders/' + (process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID || 'YOUR_FOLDER_ID'));
  console.log('\n🚀 Sekarang jalankan: npm start\n');

  process.exit(0);
}

resetData().catch((error) => {
  console.error('\n❌ Reset failed:', error.message);
  process.exit(1);
});
