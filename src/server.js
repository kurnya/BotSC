import http from 'node:http';
import crypto from 'node:crypto';
import { logger } from './utils/logger.js';

const MAX_BODY_BYTES = 12 * 1024 * 1024; // JSON + base64 (PDF ± 9 MB)
const MAX_PDF_BYTES = 8 * 1024 * 1024;
const RATE_LIMIT = { windowMs: 60_000, max: 10 };

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

const SIGNATURE_MAX_AGE_MS = 5 * 60_000;

// Tanda tangan harus sama persis dengan yang dibuat di apps-script/WhatsApp.gs (waTandaTangan_).
export function sign(token, ts, { fileName = '', caption = '', pdfBase64 = '' }) {
  return crypto
    .createHmac('sha256', String(token))
    .update([ts, fileName, caption, pdfBase64].join('\n'))
    .digest('hex');
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('Ukuran file terlalu besar'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/**
 * Server HTTP kecil agar web SISKOWAL bisa mengirim dokumen ke grup WA.
 * getSock: fungsi yang mengembalikan socket Baileys aktif (atau null saat terputus).
 */
export function createDocumentServer({ getSock, token, groupId, corsOrigin = '*' }) {
  const hits = [];
  const usedSignatures = new Map();

  function send(res, status, body) {
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': corsOrigin,
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS'
    });
    res.end(JSON.stringify(body));
  }

  function limited() {
    const now = Date.now();
    while (hits.length && now - hits[0] > RATE_LIMIT.windowMs) hits.shift();
    if (hits.length >= RATE_LIMIT.max) return true;
    hits.push(now);
    return false;
  }

  return http.createServer(async (req, res) => {
    try {
      if (req.method === 'OPTIONS') return send(res, 204, {});
      if (req.method === 'GET' && req.url === '/health') {
        return send(res, 200, { ok: true, connected: !!getSock() });
      }
      if (req.method !== 'POST' || req.url !== '/send-document') {
        return send(res, 404, { ok: false, error: 'Not found' });
      }

      let payload;
      try {
        payload = JSON.parse(await readBody(req));
      } catch (error) {
        if (error.status) return send(res, error.status, { ok: false, error: error.message });
        return send(res, 400, { ok: false, error: 'Body bukan JSON yang valid' });
      }

      // Permintaan ditandatangani (HMAC-SHA256) oleh Apps Script; rahasia tidak pernah ikut dikirim,
      // jadi aman walau lewat http. Waktu dibatasi dan tanda tangan sekali pakai agar tidak bisa diputar ulang.
      const ts = Number(payload.ts);
      const sig = String(payload.sig || '');
      const sigOk = Number.isFinite(ts) && sig && safeEqual(sig, sign(token, ts, payload));
      if (!sigOk || Math.abs(Date.now() - ts) > SIGNATURE_MAX_AGE_MS || usedSignatures.has(sig)) {
        return send(res, 401, { ok: false, error: 'Tanda tangan tidak valid atau kedaluwarsa' });
      }
      usedSignatures.set(sig, Date.now());
      for (const [key, waktu] of usedSignatures) {
        if (Date.now() - waktu > SIGNATURE_MAX_AGE_MS) usedSignatures.delete(key);
      }
      if (limited()) return send(res, 429, { ok: false, error: 'Terlalu banyak permintaan, coba lagi sebentar' });

      const fileName = String(payload.fileName || 'dokumen.pdf').replace(/[\\/:*?"<>|]/g, '_').slice(0, 120);
      const caption = String(payload.caption || '').slice(0, 1000);
      const buffer = Buffer.from(String(payload.pdfBase64 || ''), 'base64');
      if (!buffer.length || buffer.subarray(0, 4).toString() !== '%PDF') {
        return send(res, 400, { ok: false, error: 'File bukan PDF yang valid' });
      }
      if (buffer.length > MAX_PDF_BYTES) {
        return send(res, 413, { ok: false, error: 'Ukuran PDF melebihi 8 MB' });
      }

      const sock = getSock();
      if (!sock) return send(res, 503, { ok: false, error: 'Bot WhatsApp sedang terputus, coba lagi nanti' });

      await sock.sendMessage(groupId, {
        document: buffer,
        mimetype: 'application/pdf',
        fileName,
        caption
      });
      logger.success('Dokumen dikirim ke grup', { fileName, bytes: buffer.length });
      return send(res, 200, { ok: true });
    } catch (error) {
      logger.error('Gagal mengirim dokumen', { error: error.message });
      return send(res, 500, { ok: false, error: 'Gagal mengirim ke WhatsApp' });
    }
  });
}
