#!/usr/bin/env node

import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const mobileRoot = resolve(scriptDir, '..');
const envPath = resolve(mobileRoot, '.env');
const debugKeystorePath = resolve(mobileRoot, 'android/app/debug.keystore');

const PACKAGE_NAME = 'com.aiexecutiveassistant.mobile';

function readEnvFile(path) {
  if (!existsSync(path)) {
    return {};
  }

  const values = {};

  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    values[key] = value;
  }

  return values;
}

function buildAndroidRedirectUri(androidClientId) {
  const trimmed = androidClientId.trim();

  if (!trimmed.endsWith('.apps.googleusercontent.com')) {
    return null;
  }

  const suffix = trimmed.replace(/\.apps\.googleusercontent\.com$/i, '');
  return `com.googleusercontent.apps.${suffix}:/oauth2redirect`;
}

function buildAndroidRedirectScheme(androidClientId) {
  const trimmed = androidClientId.trim();

  if (!trimmed.endsWith('.apps.googleusercontent.com')) {
    return null;
  }

  const suffix = trimmed.replace(/\.apps\.googleusercontent\.com$/i, '');
  return `com.googleusercontent.apps.${suffix}`;
}

function tryReadSha1Fingerprint() {
  const keytoolCandidates = [
    'keytool',
    '/Applications/Android Studio.app/Contents/jbr/Contents/Home/bin/keytool',
  ];

  if (!existsSync(debugKeystorePath)) {
    return {
      sha1: null,
      source: 'debug.keystore not found — run: npx expo prebuild --platform android',
    };
  }

  for (const keytoolPath of keytoolCandidates) {
    try {
      const output = execSync(
        `"${keytoolPath}" -list -v -keystore "${debugKeystorePath}" -alias androiddebugkey -storepass android -keypass android`,
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
      );

      const sha1Line = output
        .split('\n')
        .find((line) => /SHA1:|SHA-1:/i.test(line));

      if (sha1Line) {
        const sha1 = sha1Line.split(':').slice(1).join(':').trim();
        return { sha1, source: keytoolPath };
      }
    } catch {
      // try next keytool
    }
  }

  return {
    sha1: null,
    source: 'Run locally: cd mobile/android && ./gradlew signingReport',
  };
}

const env = readEnvFile(envPath);
const androidClientId = env.EXPO_PUBLIC_GOOGLE_CALENDAR_ANDROID_CLIENT_ID?.trim() ?? '';
const redirectUri = androidClientId ? buildAndroidRedirectUri(androidClientId) : null;
const redirectScheme = androidClientId ? buildAndroidRedirectScheme(androidClientId) : null;
const sha1 = tryReadSha1Fingerprint();

console.log('');
console.log('=== Google Calendar Android OAuth Setup ===');
console.log('');
console.log('Package name (exact):');
console.log(`  ${PACKAGE_NAME}`);
console.log('');
console.log('SHA-1 fingerprint for Google Cloud Console:');
console.log(`  ${sha1.sha1 ?? '(not resolved on this machine)'}`);
console.log(`  Source: ${sha1.source}`);
console.log('');
console.log('Android OAuth client ID (.env):');
console.log(`  ${androidClientId || '(missing — set EXPO_PUBLIC_GOOGLE_CALENDAR_ANDROID_CLIENT_ID after creating client)'}`);
console.log('');
console.log('Redirect URI sent to Google (after Android client ID is set):');
console.log(`  ${redirectUri ?? '(set Android client ID first)'}`);
console.log('');
console.log('Redirect scheme (Android intent filter):');
console.log(`  ${redirectScheme ?? '(set Android client ID first)'}`);
console.log('');
console.log('Intent filter path (AndroidManifest):');
console.log('  /oauth2redirect');
console.log('');
console.log('OAuth stack:');
console.log('  Client type: Android OAuth client');
console.log('  Library: expo-auth-session (AuthRequest + promptAsync)');
console.log('  Expo proxy: disabled');
console.log('');
console.log('Google Cloud Console steps:');
console.log('  1. APIs & Services → Credentials → Create Credentials → OAuth client ID');
console.log('  2. Application type: Android');
console.log(`  3. Package name: ${PACKAGE_NAME}`);
console.log(`  4. SHA-1: ${sha1.sha1 ?? '<run ./gradlew signingReport and paste SHA1>'}`);
console.log('  5. Create → copy the Android client ID');
console.log('  6. Set mobile/.env → EXPO_PUBLIC_GOOGLE_CALENDAR_ANDROID_CLIENT_ID=<android-client-id>');
if (redirectUri) {
  console.log(`  7. Verify redirect URI used by app: ${redirectUri}`);
}
console.log('  8. Rebuild dev client: npx expo run:android');
console.log('  9. Restart Metro: npx expo start --dev-client -c');
console.log('');
