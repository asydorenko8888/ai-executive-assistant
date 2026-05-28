import { Platform } from 'react-native';

import * as SecureStore from 'expo-secure-store';

import { getStoredJson, setStoredJson } from '@/src/shared/storage';

const DEVICE_ID_STORAGE_KEY = 'executive-ai.device-session.v1';

let cachedDeviceId: string | null = null;

function createDeviceId() {
  const random = Math.random().toString(36).slice(2);
  return `exec-${Platform.OS}-${Date.now().toString(36)}-${random}`;
}

async function loadDeviceId() {
  if (Platform.OS === 'web') {
    return getStoredJson<string | null>(DEVICE_ID_STORAGE_KEY, null);
  }

  try {
    return (await SecureStore.getItemAsync(DEVICE_ID_STORAGE_KEY)) ?? null;
  } catch {
    return null;
  }
}

async function saveDeviceId(deviceId: string) {
  if (Platform.OS === 'web') {
    await setStoredJson(DEVICE_ID_STORAGE_KEY, deviceId);
    return;
  }

  await SecureStore.setItemAsync(DEVICE_ID_STORAGE_KEY, deviceId);
}

export async function ensureExecutiveDeviceId() {
  if (cachedDeviceId) {
    return cachedDeviceId;
  }

  const stored = await loadDeviceId();

  if (stored && stored.trim().length >= 8) {
    cachedDeviceId = stored.trim();
    return cachedDeviceId;
  }

  const nextId = createDeviceId();
  await saveDeviceId(nextId);
  cachedDeviceId = nextId;

  console.log('[DeviceSession] created device id', { deviceIdPreview: nextId.slice(0, 12) });

  return nextId;
}

export function getCachedExecutiveDeviceId() {
  return cachedDeviceId;
}

export async function getExecutiveDeviceHeaders() {
  const deviceId = await ensureExecutiveDeviceId();

  return {
    'X-Executive-Device-Id': deviceId,
  };
}
