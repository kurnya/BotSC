/**
 * Script untuk list semua grup yang bot join
 * Jalankan: node scripts/list-groups.js
 */

import makeWASocket, { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import pino from 'pino';
import { getAppConfig } from '../src/config/auth.js';

const config = getAppConfig();

async function listGroups() {
  console.log('🔄 Connecting to WhatsApp...\n');

  const { state } = await useMultiFileAuthState(config.whatsappSessionFolder);

  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    browser: ['WA Group Lister', 'Chrome', '1.0.0']
  });

  return new Promise((resolve, reject) => {
    sock.ev.on('connection.update', async ({ connection, lastDisconnect }) => {
      if (connection === 'open') {
        console.log('✅ Connected!\n');
        
        try {
          // Ambil semua chat
          const chats = await sock.groupFetchAllParticipating();
          const groups = Object.values(chats);

          if (groups.length === 0) {
            console.log('❌ No groups found. Make sure the bot is added to at least one group.\n');
          } else {
            console.log(`📋 Found ${groups.length} group(s):\n`);
            console.log('═'.repeat(80));
            groups.forEach((group, i) => {
              console.log(`${i + 1}. ${group.subject}`);
              console.log(`   ID: ${group.id}`);
              console.log(`   Members: ${group.participants.length}`);
              console.log('─'.repeat(80));
            });
            console.log('\n💡 Copy the ID above and paste it into .env as ALLOWED_GROUP_IDS\n');
          }

          sock.end({ reason: 'done' });
          resolve();
        } catch (error) {
          console.error('❌ Error fetching groups:', error.message);
          reject(error);
        }
      }

      if (connection === 'close') {
        const code = lastDisconnect?.error?.output?.statusCode;
        if (code === DisconnectReason.loggedOut) {
          console.error('❌ Not logged in. Run "npm start" first and scan the QR code.\n');
          reject(new Error('Not logged in'));
        } else {
          console.error('❌ Connection failed:', lastDisconnect?.error?.message || 'Unknown error');
          reject(lastDisconnect?.error);
        }
      }
    });
  });
}

listGroups().catch(() => process.exit(1));
