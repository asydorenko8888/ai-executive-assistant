#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const mobileDir = join(rootDir, 'mobile');
const examplePath = join(mobileDir, '.env.device.example');
const envPath = join(mobileDir, '.env');

function detectLanIp() {
  for (const iface of ['en0', 'en1', 'en2']) {
    try {
      const ip = execSync(`ipconfig getifaddr ${iface}`, { encoding: 'utf8' }).trim();
      if (ip) {
        return ip;
      }
    } catch {
      // try next interface
    }
  }

  return null;
}

if (!existsSync(examplePath)) {
  console.error('Missing mobile/.env.device.example');
  process.exit(1);
}

const lanIp = detectLanIp();
if (!lanIp) {
  console.error('Could not detect LAN IP. Set EXPO_PUBLIC_API_BASE_URL manually in mobile/.env');
  process.exit(1);
}

const template = readFileSync(examplePath, 'utf8');
const contents = template.replaceAll('DEVICE_LAN_IP', lanIp);

if (!existsSync(envPath)) {
  writeFileSync(envPath, contents, 'utf8');
  console.log(`Created mobile/.env with EXPO_PUBLIC_API_BASE_URL=http://${lanIp}:3001/api`);
  process.exit(0);
}

const current = readFileSync(envPath, 'utf8');
if (current.includes('localhost:3001')) {
  const updated = current.replace(
    /EXPO_PUBLIC_API_BASE_URL=http:\/\/localhost:3001\/api/g,
    `EXPO_PUBLIC_API_BASE_URL=http://${lanIp}:3001/api`,
  );
  writeFileSync(envPath, updated, 'utf8');
  console.log(`Updated mobile/.env: EXPO_PUBLIC_API_BASE_URL=http://${lanIp}:3001/api`);
} else {
  console.log(`mobile/.env already exists. For device testing use: http://${lanIp}:3001/api`);
  console.log('Template reference: mobile/.env.device.example');
}
