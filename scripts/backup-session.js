/**
 * Script untuk backup session WA + credentials
 * Jalankan: node scripts/backup-session.js
 */

import fs from 'fs-extra';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const backupDir = path.join(rootDir, 'backup-session');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
const backupPath = path.join(backupDir, `session-${timestamp}`);

async function backup() {
  console.log('🔄 Creating backup...\n');
  
  await fs.ensureDir(backupPath);
  
  const files = [
    'src/auth',
    'credentials.json',
    'oauth_client.json',
    '.env'
  ];
  
  for (const file of files) {
    const src = path.join(rootDir, file);
    const dest = path.join(backupPath, file);
    
    if (await fs.pathExists(src)) {
      await fs.copy(src, dest);
      console.log(`✅ Backed up: ${file}`);
    } else {
      console.log(`⚠️  Not found: ${file}`);
    }
  }
  
  console.log(`\n✅ Backup completed: ${backupPath}\n`);
  console.log('📦 To restore, copy these files back to project root.\n');
}

backup().catch(console.error);
