#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');
const mobileEnvPath = path.join(repoRoot, 'mobile', '.env');
const defaultHealthUrl = 'http://localhost:3001/health';

function readApiBaseUrl() {
  if (!fs.existsSync(mobileEnvPath)) {
    return 'http://localhost:3001/api';
  }

  const envText = fs.readFileSync(mobileEnvPath, 'utf8');
  const match = envText.match(/^EXPO_PUBLIC_API_BASE_URL=(.+)$/m);
  return (match?.[1] ?? 'http://localhost:3001/api').trim().replace(/\/$/, '');
}

function healthUrlFromApiBase(apiBaseUrl) {
  try {
    const parsed = new URL(apiBaseUrl);
    parsed.pathname = '/health';
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return defaultHealthUrl;
  }
}

const apiBaseUrl = readApiBaseUrl();
const healthUrl = healthUrlFromApiBase(apiBaseUrl);

try {
  const response = await fetch(healthUrl, { signal: AbortSignal.timeout(2000) });
  if (response.ok) {
    process.exit(0);
  }
} catch {
  // fall through to warning
}

console.warn('');
console.warn('⚠️  Backend API is not reachable at', healthUrl);
console.warn('   Google Calendar exchange needs:', `${apiBaseUrl}/google-calendar/exchange`);
console.warn('   Start it in another terminal:  npm run dev:backend');
console.warn('   (from repo root) or:  cd backend && npm run dev');
console.warn('');
