#!/usr/bin/env node
/**
 * Verifies the local Executive AI backend is reachable at the URL from mobile/.env.
 */
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

  if (!match) {
    return 'http://localhost:3001/api';
  }

  return match[1].trim().replace(/\/$/, '');
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
  const response = await fetch(healthUrl, { signal: AbortSignal.timeout(3000) });

  if (!response.ok) {
    console.error(`check:backend — ${healthUrl} returned HTTP ${response.status}`);
    process.exit(1);
  }

  const body = await response.json();

  if (!body?.ok) {
    console.error(`check:backend — unexpected health payload from ${healthUrl}`);
    process.exit(1);
  }

  console.log(`check:backend — OK (${healthUrl})`);
  console.log(`check:backend — API base: ${apiBaseUrl}`);
  console.log(`check:backend — exchange: ${apiBaseUrl}/google-calendar/exchange`);
} catch (error) {
  console.error(`check:backend — cannot reach ${healthUrl}`);
  console.error('check:backend — start the backend: npm run dev:backend');
  if (error instanceof Error) {
    console.error(`check:backend — ${error.message}`);
  }
  process.exit(1);
}
