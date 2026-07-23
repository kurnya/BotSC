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

  // Format header: bold + background abu-abu + auto resize
  await withRetry('formatHeader', () =>
    sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            repeatCell: {
              range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 5 },
              cell: {
                userEnteredFormat: {
                  backgroundColor: { red: 0.85, green: 0.85, blue: 0.85 },
                  textFormat: { bold: true },
                  horizontalAlignment: 'CENTER',
                  verticalAlignment: 'MIDDLE'
                }
              },
              fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)'
            }
          },
          {
            autoResizeDimensions: {
              dimensions: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 5 }
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

  // Tulis data
  await withRetry('appendRow', () =>
    sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${sheetName}!A:E`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values }
    })
  );

  // Apply border + auto resize kolom setelah data masuk
  await withRetry('formatRow', () =>
    sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
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
          {
            autoResizeDimensions: {
              dimensions: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 5 }
            }
          }
        ]
      }
    })
  );
}
