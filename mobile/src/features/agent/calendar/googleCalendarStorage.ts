import { Platform } from 'react-native';

import * as SecureStore from 'expo-secure-store';

import { getStoredJson, removeStoredItem, setStoredJson } from '@/src/shared/storage';

const GOOGLE_CALENDAR_SESSION_STORAGE_KEY = 'executive-ai.google-calendar.session.v1';

export type GoogleCalendarSession = {
  accessToken: string;
  refreshToken?: string;
  tokenType?: string;
  scopes: string[];
  connectedEmail?: string;
  connectedAt: string;
  expiresAt?: string;
};

async function loadSecureJson<T>(key: string): Promise<T | null> {
  if (Platform.OS === 'web') {
    return getStoredJson<T | null>(key, null);
  }

  try {
    const rawValue = await SecureStore.getItemAsync(key);

    if (!rawValue) {
      return null;
    }

    return JSON.parse(rawValue) as T;
  } catch {
    return null;
  }
}

async function saveSecureJson<T>(key: string, value: T) {
  if (Platform.OS === 'web') {
    return setStoredJson(key, value);
  }

  try {
    await SecureStore.setItemAsync(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

async function removeSecureJson(key: string) {
  if (Platform.OS === 'web') {
    return removeStoredItem(key);
  }

  try {
    await SecureStore.deleteItemAsync(key);
    return true;
  } catch {
    return false;
  }
}

function isGoogleCalendarSession(value: unknown): value is GoogleCalendarSession {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<GoogleCalendarSession>;

  return (
    typeof candidate.accessToken === 'string' &&
    Array.isArray(candidate.scopes) &&
    typeof candidate.connectedAt === 'string'
  );
}

export async function loadGoogleCalendarSession() {
  const storedSession = await loadSecureJson<GoogleCalendarSession | null>(
    GOOGLE_CALENDAR_SESSION_STORAGE_KEY,
  );

  if (!isGoogleCalendarSession(storedSession)) {
    console.log('[Calendar Audit] loadGoogleCalendarSession — no valid session', {
      platform: Platform.OS,
      storageKey: GOOGLE_CALENDAR_SESSION_STORAGE_KEY,
    });
    return null;
  }

  console.log('[Calendar Audit] loadGoogleCalendarSession — session loaded', {
    platform: Platform.OS,
    connectedEmail: storedSession.connectedEmail ?? null,
    hasRefreshToken: Boolean(storedSession.refreshToken),
    expiresAt: storedSession.expiresAt ?? null,
    scopesCount: storedSession.scopes.length,
  });

  return storedSession;
}

export async function saveGoogleCalendarSession(session: GoogleCalendarSession) {
  console.log('[Calendar Audit] saveGoogleCalendarSession', {
    platform: Platform.OS,
    connectedEmail: session.connectedEmail ?? null,
    hasRefreshToken: Boolean(session.refreshToken),
    expiresAt: session.expiresAt ?? null,
  });

  return saveSecureJson(GOOGLE_CALENDAR_SESSION_STORAGE_KEY, session);
}

export async function clearGoogleCalendarSession() {
  console.log('[Calendar Audit] clearGoogleCalendarSession', {
    platform: Platform.OS,
    storageKey: GOOGLE_CALENDAR_SESSION_STORAGE_KEY,
  });

  return removeSecureJson(GOOGLE_CALENDAR_SESSION_STORAGE_KEY);
}
