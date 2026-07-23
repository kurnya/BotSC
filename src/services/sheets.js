import { logger } from '../utils/logger.js';

let nextRowNumber = null;

const HEADER_ROW = ['No', 'Tanggal', 'Jam', 'Deskripsi', 'Link Foto'];

const BORDER_STYLE = {
  style: 'SOLID',
  width: 1,
  color: { red: 0, green: 0, blue: 0, alpha: 1 }
};

const FULL_BORDER = {
  top: BORDER_STYLE,
  bottom: BORDER_STYLE,
  left: BORDER_STYLE,
  right: BORDER_STYLE,
  innerHorizontal: BORDER_STYLE,
  innerVertical: BORDER_STYLE
};

// Lebar kolom fixed (piksel)
const COL_WIDTHS = [
  { index: 0, width: 50  },  // A: No
  { index: 1, width: 110 },  // B: Tanggal
  { index: 2, width: 100 },  // C: Jam
  { index: 3, width: 250 },  // D: Deskripsi
  { index: 4, width: 120 },  // E: Link Foto (teks "Lihat Foto", tidak perlu lebar)
];

const ROW_HEIGHT = 30; // tinggi baris data (piksel)

// Retry dengan exponential backoff untuk transient Google API errors
const RETRYABLE_CODES = new Set([429, 500, 502, 503, 504]);

async function withRetry(label, fn, maxAttempts = 4) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const status = error?.response?.status || error?.code;
      const isRetryable = RETRYABLE_CODES.has(Number(status));
      if (!isRetryable || attempt === maxAttempts) throw error;
      const delay = 1000 * 2 ** (attempt - 1);
      logger.warning(`${label} failed (${status}), retrying in ${delay}ms`, { attempt });
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

export async function ensureSpreadsheetHeader(sheets, spreadsheetId, sheetName = 'Sheet1') {
  // Ambil sheetId
  const meta = await withRetry('getSpreadsheet', () =>
    sheets.spreadsheets.get({ spreadsheetId })
  );
  const sheet = meta.data.sheets.find((s) => s.properties.title === sheetName);
  const sheetId = sheet?.properties?.sheetId ?? 0;

  // Cek header row
  const response = await withRetry('getHeaderRow', () =>
    sheets.spreadsheets.values.get({ spreadsheetId, range: `${sheetName}!A1:E1` })
  );

  const firstRow = response.data.values?.[0] || [];
  const isEmpty = firstRow.length === 0;
  const isDifferent = firstRow.join('|') !== HEADER_ROW.join('|');

  if (isEmpty || isDifferent) {
    await withRetry('updateHeader', () =>
      sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetName}!A1:E1`,
        valueInputOption: 'RAW',
        requestBody: { values: [HEADER_ROW] }
      })
    );
    logger.info('Spreadsheet header ensured');
  }

  // Format header + kolom B & C sebagai text (bukan auto-detect number)
  await withRetry('formatHeader', () =>
    sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          // Format header row (bold + background biru pastel)
          {
            repeatCell: {
              range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 5 },
              cell: {
                userEnteredFormat: {
                  backgroundColor: { red: 0.68, green: 0.85, blue: 0.9 }, // Biru pastel
                  textFormat: { bold: true },
                  horizontalAlignment: 'CENTER',
                  verticalAlignment: 'MIDDLE'
                }
              },
              fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)'
            }
          },
          // Format kolom B (Tanggal) sebagai TEXT
          {
            repeatCell: {
              range: { sheetId, startRowIndex: 1, endRowIndex: 10000, startColumnIndex: 1, endColumnIndex: 2 },
              cell: { userEnteredFormat: { numberFormat: { type: 'TEXT' } } },
              fields: 'userEnteredFormat.numberFormat'
            }
          },
          // Format kolom C (Jam) sebagai TEXT
          {
            repeatCell: {
              range: { sheetId, startRowIndex: 1, endRowIndex: 10000, startColumnIndex: 2, endColumnIndex: 3 },
              cell: { userEnteredFormat: { numberFormat: { type: 'TEXT' } } },
              fields: 'userEnteredFormat.numberFormat'
            }
          },
          // Format kolom D (Deskripsi) rata kiri
          {
            repeatCell: {
              range: { sheetId, startRowIndex: 1, endRowIndex: 10000, startColumnIndex: 3, endColumnIndex: 4 },
              cell: {
                userEnteredFormat: {
                  horizontalAlignment: 'LEFT',
                  verticalAlignment: 'MIDDLE'
                }
              },
              fields: 'userEnteredFormat(horizontalAlignment,verticalAlignment)'
            }
          },
          // Set lebar kolom fixed
          ...COL_WIDTHS.map(({ index, width }) => ({
            updateDimensionProperties: {
              range: { sheetId, dimension: 'COLUMNS', startIndex: index, endIndex: index + 1 },
              properties: { pixelSize: width },
              fields: 'pixelSize'
            }
          })),
          // Set tinggi header row
          {
            updateDimensionProperties: {
              range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: 1 },
              properties: { pixelSize: 35 },
              fields: 'pixelSize'
            }
          }
        ]
      }
    })
  );

  logger.info('Spreadsheet header formatted');
}

export async function initSheetCounter(sheets, spreadsheetId, sheetName = 'Sheet1') {
  const response = await withRetry('initCounter', () =>
    sheets.spreadsheets.values.get({ spreadsheetId, range: `${sheetName}!A:A` })
  );

  const rows = response.data.values || [];
  // Baris pertama adalah header, jadi counter mulai dari jumlah data (rows - 1)
  const dataRows = Math.max(rows.length - 1, 0);
  nextRowNumber = dataRows + 1;
  logger.info('Spreadsheet counter initialized', { nextRowNumber });
}

export async function appendBackupRow(sheets, spreadsheetId, row, sheetName = 'Sheet1') {
  if (nextRowNumber === null) {
    await initSheetCounter(sheets, spreadsheetId);
  }

  // Ambil sheetId untuk apply border
  const meta = await withRetry('getSheetMeta', () =>
    sheets.spreadsheets.get({ spreadsheetId })
  );
  const sheet = meta.data.sheets.find((s) => s.properties.title === sheetName);
  const sheetId = sheet?.properties?.sheetId ?? 0;

  // Ambil nomor baris saat ini dan langsung increment SEBELUM await apapun
  // agar tidak ada race condition jika dipanggil bersamaan
  const currentRow = nextRowNumber;
  nextRowNumber += 1;

  const rowIndex = currentRow; // baris data ke-N (1-based, header di baris 1)
  const values = [[currentRow, ...row]];

  // Tulis data tanpa link dulu (link akan diset via textFormat di step berikutnya)
  const rowValues = [[...values[0].slice(0, 4), 'Lihat Foto']];

  await withRetry('appendRow', () =>
    sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${sheetName}!A:E`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: rowValues }
    })
  );

  // Ambil URL asli dari parameter row (index 3 = link, karena row = [tanggal, jam, deskripsi, link])
  const linkUrl = row[3] || '';

  // Apply border + set tinggi baris + set hyperlink setelah data masuk
  await withRetry('formatRow', () =>
    sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          // Border pada baris baru
          {
            updateBorders: {
              range: {
                sheetId,
                startRowIndex: rowIndex,
                endRowIndex: rowIndex + 1,
                startColumnIndex: 0,
                endColumnIndex: 5
              },
              ...FULL_BORDER
            }
          },
          // Set tinggi baris data
          {
            updateDimensionProperties: {
              range: { sheetId, dimension: 'ROWS', startIndex: rowIndex, endIndex: rowIndex + 1 },
              properties: { pixelSize: ROW_HEIGHT },
              fields: 'pixelSize'
            }
          },
          // Set hyperlink di kolom E menggunakan textFormat (tidak pakai formula)
          linkUrl ? {
            updateCells: {
              range: {
                sheetId,
                startRowIndex: rowIndex,
                endRowIndex: rowIndex + 1,
                startColumnIndex: 4,
                endColumnIndex: 5
              },
              rows: [{
                values: [{
                  userEnteredValue: { stringValue: 'Lihat Foto' },
                  userEnteredFormat: {
                    textFormat: {
                      link: { uri: linkUrl },
                      foregroundColor: { blue: 1.0 }, // warna biru untuk link
                      underline: true
                    }
                  }
                }]
              }],
              fields: 'userEnteredValue,userEnteredFormat.textFormat'
            }
          } : null
        ].filter(Boolean)
      }
    })
  );
}
