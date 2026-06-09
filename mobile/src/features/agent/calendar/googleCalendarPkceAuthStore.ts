import AsyncStorage from '@react-native-async-storage/async-storage';

import * as AuthSession from 'expo-auth-session';

const ASYNC_STORAGE_KEY = 'executive-ai.google-calendar.pkce-auth.v1';

export type GoogleCalendarPkceAuthStore = {
  codeVerifier: string;
  state: string;
  clientId: string;
  redirectUri: string;
  codeChallenge?: string;
  storedAt: string;
};

type GlobalWithPkceAuthStore = typeof globalThis & {
  __executiveAiGoogleCalendarPkceAuth__?: GoogleCalendarPkceAuthStore | null;
};

function getGlobalPkceAuthStore() {
  return (globalThis as GlobalWithPkceAuthStore).__executiveAiGoogleCalendarPkceAuth__ ?? null;
}

function setGlobalPkceAuthStore(store: GoogleCalendarPkceAuthStore | null) {
  (globalThis as GlobalWithPkceAuthStore).__executiveAiGoogleCalendarPkceAuth__ = store;
}

function isValidPkceAuthStore(
  value: GoogleCalendarPkceAuthStore | null | undefined,
): value is GoogleCalendarPkceAuthStore {
  return Boolean(
    value?.codeVerifier?.trim() &&
      value.clientId?.trim() &&
      value.redirectUri?.trim(),
  );
}

function readCodeChallengeFromAuthUrl(authUrl: string | null | undefined) {
  if (!authUrl) {
    return undefined;
  }

  try {
    return new URL(authUrl).searchParams.get('code_challenge') ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Persist the exact AuthRequest PKCE verifier before promptAsync opens the browser.
 */
export async function storeGoogleCalendarPkceAuthFromAuthRequest(params: {
  authRequest: AuthSession.AuthRequest;
  clientId: string;
  redirectUri: string;
  authUrl?: string | null;
}) {
  const codeVerifier = params.authRequest.codeVerifier?.trim() ?? '';

  if (!codeVerifier) {
    throw new Error(
      'Google Calendar PKCE code verifier is missing on AuthRequest before promptAsync.',
    );
  }

  console.log('PKCE_VERIFIER_CREATED');

  const store: GoogleCalendarPkceAuthStore = {
    codeVerifier,
    state: params.authRequest.state,
    clientId: params.clientId,
    redirectUri: params.redirectUri,
    codeChallenge: readCodeChallengeFromAuthUrl(params.authUrl ?? params.authRequest.url),
    storedAt: new Date().toISOString(),
  };

  setGlobalPkceAuthStore(store);

  try {
    await AsyncStorage.setItem(ASYNC_STORAGE_KEY, JSON.stringify(store));
    const verifyRaw = await AsyncStorage.getItem(ASYNC_STORAGE_KEY);
    const verifyParsed = verifyRaw
      ? (JSON.parse(verifyRaw) as GoogleCalendarPkceAuthStore)
      : null;
    const stored =
      verifyParsed?.codeVerifier === codeVerifier &&
      verifyParsed.redirectUri === params.redirectUri &&
      verifyParsed.state === params.authRequest.state;

    if (!stored) {
      throw new Error('Google Calendar PKCE verifier failed AsyncStorage read-after-write.');
    }

    console.log('PKCE_VERIFIER_STORED');

    return store;
  } catch (error) {
    throw error instanceof Error
      ? error
      : new Error('Failed to store Google Calendar PKCE verifier before OAuth redirect.');
  }
}

export async function restoreGoogleCalendarPkceAuthStore() {
  const memoryStore = getGlobalPkceAuthStore();

  if (isValidPkceAuthStore(memoryStore)) {
    console.log('PKCE_VERIFIER_RESTORED');
    return memoryStore;
  }

  try {
    const rawValue = await AsyncStorage.getItem(ASYNC_STORAGE_KEY);

    if (!rawValue) {
      return null;
    }

    const parsed = JSON.parse(rawValue) as GoogleCalendarPkceAuthStore;

    if (!isValidPkceAuthStore(parsed)) {
      return null;
    }

    setGlobalPkceAuthStore(parsed);
    console.log('PKCE_VERIFIER_RESTORED');
    return parsed;
  } catch (error) {
    return null;
  }
}

export async function clearGoogleCalendarPkceAuthStore() {
  setGlobalPkceAuthStore(null);
  await AsyncStorage.removeItem(ASYNC_STORAGE_KEY);
}
