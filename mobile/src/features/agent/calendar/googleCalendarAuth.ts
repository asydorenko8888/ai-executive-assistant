import { Platform } from 'react-native';

import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';

import type { CalendarConnection } from '@/src/entities/calendar/types';
import {
  clearGoogleCalendarSession,
  loadGoogleCalendarSession,
  saveGoogleCalendarSession,
  type GoogleCalendarSession,
} from '@/src/features/agent/calendar/googleCalendarStorage';
import { apiClient } from '@/src/shared/api';
import { env } from '@/src/shared/config';

WebBrowser.maybeCompleteAuthSession();

export const GOOGLE_CALENDAR_DISCOVERY_ISSUER = 'https://accounts.google.com';
export const GOOGLE_CALENDAR_WEB_CALLBACK_PATH = 'google-calendar-callback';

export const googleCalendarScopes = [
  'openid',
  'profile',
  'email',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events',
] as const;

const GOOGLE_CALENDAR_WEB_PENDING_AUTH_STORAGE_KEY =
  'executive-ai.google-calendar.pending-web-auth.v1';

type PendingGoogleCalendarWebAuth = {
  clientId: string;
  redirectUri: string;
  codeVerifier: string;
  createdAt: string;
};

let pendingGoogleCalendarWebRedirectPromise: Promise<GoogleCalendarSession | null> | null = null;
let googleCalendarDiscoveryDocumentPromise: Promise<AuthSession.DiscoveryDocument> | null = null;

type GoogleCalendarBackendTokenResponse = {
  accessToken: string;
  refreshToken?: string;
  tokenType?: string;
  scope?: string;
  expiresIn?: number;
  connectedEmail?: string;
};

type GoogleCalendarOAuthResultLike = {
  params?: Record<string, string | undefined>;
  url?: string | null;
};

export async function getGoogleCalendarDiscoveryDocument() {
  if (!googleCalendarDiscoveryDocumentPromise) {
    googleCalendarDiscoveryDocumentPromise = AuthSession.fetchDiscoveryAsync(
      GOOGLE_CALENDAR_DISCOVERY_ISSUER,
    ).catch((error) => {
      googleCalendarDiscoveryDocumentPromise = null;
      throw error;
    });
  }

  return googleCalendarDiscoveryDocumentPromise;
}

function resolveGoogleCalendarClientId() {
  if (Platform.OS === 'android') {
    return env.googleCalendarAndroidClientId;
  }

  if (Platform.OS === 'ios') {
    return env.googleCalendarIosClientId;
  }

  return env.googleCalendarWebClientId;
}

export function getGoogleCalendarClientId() {
  return resolveGoogleCalendarClientId();
}

function buildGoogleCalendarRedirectUri() {
  if (Platform.OS === 'web') {
    return AuthSession.makeRedirectUri({
      path: GOOGLE_CALENDAR_WEB_CALLBACK_PATH,
      preferLocalhost: true,
    });
  }

  return AuthSession.makeRedirectUri({
    scheme: 'mobile',
    path: 'oauthredirect',
    preferLocalhost: true,
    native: 'mobile://oauthredirect',
  });
}

export function getGoogleCalendarRedirectUri() {
  return buildGoogleCalendarRedirectUri();
}

function readGoogleCalendarAuthorizationCodeFromUrl(urlValue?: string | null) {
  if (!urlValue) {
    return null;
  }

  try {
    const normalizedUrlValue =
      /^https?:\/\//i.test(urlValue) || urlValue.startsWith('/') || urlValue.startsWith('?')
        ? urlValue
        : /^accounts\.google\.com\b/i.test(urlValue)
          ? `https://${urlValue}`
          : null;

    if (!normalizedUrlValue) {
      return null;
    }

    const parsedUrl = new URL(
      normalizedUrlValue,
      Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin : undefined,
    );
    const code = parsedUrl.searchParams.get('code')?.trim();
    return code || null;
  } catch {
    return null;
  }
}

export function extractGoogleCalendarAuthorizationCode(
  authResponse?: GoogleCalendarOAuthResultLike | null,
) {
  const codeFromParams = authResponse?.params?.code?.trim();

  if (codeFromParams) {
    return codeFromParams;
  }

  const codeFromResponseUrl = readGoogleCalendarAuthorizationCodeFromUrl(authResponse?.url);

  if (codeFromResponseUrl) {
    return codeFromResponseUrl;
  }

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return readGoogleCalendarAuthorizationCodeFromUrl(window.location.href);
  }

  return null;
}

function loadPendingGoogleCalendarWebAuth() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return null;
  }

  try {
    const rawValue = window.sessionStorage.getItem(
      GOOGLE_CALENDAR_WEB_PENDING_AUTH_STORAGE_KEY,
    );

    if (!rawValue) {
      return null;
    }

    return JSON.parse(rawValue) as PendingGoogleCalendarWebAuth;
  } catch {
    return null;
  }
}

function savePendingGoogleCalendarWebAuth(auth: PendingGoogleCalendarWebAuth) {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return;
  }

  window.sessionStorage.setItem(
    GOOGLE_CALENDAR_WEB_PENDING_AUTH_STORAGE_KEY,
    JSON.stringify(auth),
  );
}

function clearPendingGoogleCalendarWebAuth() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return;
  }

  window.sessionStorage.removeItem(GOOGLE_CALENDAR_WEB_PENDING_AUTH_STORAGE_KEY);
}

async function fetchGoogleProfile(accessToken: string) {
  const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    return undefined;
  }

  const payload = (await response.json()) as {
    email?: string;
  };

  return payload.email?.trim() || undefined;
}

function normalizeGoogleCalendarTokenResponseToSession(
  tokenResponse: AuthSession.TokenResponse,
  connectedEmail?: string,
): GoogleCalendarSession {
  return {
    accessToken: tokenResponse.accessToken,
    refreshToken: tokenResponse.refreshToken ?? undefined,
    tokenType: tokenResponse.tokenType ?? undefined,
    scopes:
      typeof tokenResponse.scope === 'string' && tokenResponse.scope.trim()
        ? tokenResponse.scope.split(' ')
        : [...googleCalendarScopes],
    connectedEmail,
    connectedAt: new Date().toISOString(),
    expiresAt:
      typeof tokenResponse.expiresIn === 'number'
        ? new Date(Date.now() + tokenResponse.expiresIn * 1000).toISOString()
        : undefined,
  };
}

function normalizeGoogleCalendarBackendTokenResponseToSession(
  tokenResponse: GoogleCalendarBackendTokenResponse,
): GoogleCalendarSession {
  return {
    accessToken: tokenResponse.accessToken,
    refreshToken: tokenResponse.refreshToken ?? undefined,
    tokenType: tokenResponse.tokenType ?? undefined,
    scopes:
      typeof tokenResponse.scope === 'string' && tokenResponse.scope.trim()
        ? tokenResponse.scope.split(' ')
        : [...googleCalendarScopes],
    connectedEmail: tokenResponse.connectedEmail,
    connectedAt: new Date().toISOString(),
    expiresAt:
      typeof tokenResponse.expiresIn === 'number'
        ? new Date(Date.now() + tokenResponse.expiresIn * 1000).toISOString()
        : undefined,
  };
}

async function exchangeGoogleCalendarCodeOnBackend(params: {
  code: string;
  redirectUri: string;
  codeVerifier: string;
}) {
  return apiClient.post<GoogleCalendarBackendTokenResponse, typeof params>({
    path: '/google-calendar/exchange',
    body: params,
  });
}

async function refreshGoogleCalendarTokenOnBackend(params: {
  refreshToken: string;
}) {
  return apiClient.post<GoogleCalendarBackendTokenResponse, typeof params>({
    path: '/google-calendar/refresh',
    body: params,
  });
}

export async function finalizeGoogleCalendarAuthCode(params: {
  clientId: string;
  code: string;
  redirectUri: string;
  codeVerifier: string;
}) {
  if (Platform.OS === 'web') {
    const tokenResponse = await exchangeGoogleCalendarCodeOnBackend({
      code: params.code,
      redirectUri: params.redirectUri,
      codeVerifier: params.codeVerifier,
    });
    const nextSession = normalizeGoogleCalendarBackendTokenResponseToSession(tokenResponse);

    await saveGoogleCalendarSession(nextSession);
    return nextSession;
  }

  const discovery = await getGoogleCalendarDiscoveryDocument();
  const tokenResponse = await AuthSession.exchangeCodeAsync(
    {
      clientId: params.clientId,
      code: params.code,
      redirectUri: params.redirectUri,
      extraParams: {
        code_verifier: params.codeVerifier,
      },
    },
    discovery,
  );
  const connectedEmail = tokenResponse.accessToken
    ? await fetchGoogleProfile(tokenResponse.accessToken)
    : undefined;
  const nextSession = normalizeGoogleCalendarTokenResponseToSession(
    tokenResponse,
    connectedEmail,
  );

  await saveGoogleCalendarSession(nextSession);
  return nextSession;
}

function buildConnectionFromSession(
  session: GoogleCalendarSession | null,
  fallbackStatus: CalendarConnection['status'] = 'not_connected',
): CalendarConnection {
  if (!session) {
    return {
      provider: 'google',
      status: fallbackStatus,
    };
  }

  const expiresAt = session.expiresAt ? Date.parse(session.expiresAt) : NaN;
  const isExpired = Number.isFinite(expiresAt) && expiresAt <= Date.now() + 60_000;

  return {
    provider: 'google',
    status: isExpired ? 'expired' : 'connected',
    connectedEmail: session.connectedEmail,
    connectedAt: session.connectedAt,
    expiresAt: session.expiresAt,
  };
}

async function refreshGoogleCalendarSession(session: GoogleCalendarSession) {
  const clientId = resolveGoogleCalendarClientId();

  if (!clientId || !session.refreshToken) {
    return session;
  }

  try {
    if (Platform.OS === 'web') {
      const refreshedSession = await refreshGoogleCalendarTokenOnBackend({
        refreshToken: session.refreshToken,
      });
      const nextSession: GoogleCalendarSession = {
        ...session,
        accessToken: refreshedSession.accessToken,
        refreshToken: refreshedSession.refreshToken ?? session.refreshToken,
        tokenType: refreshedSession.tokenType ?? session.tokenType,
        scopes:
          typeof refreshedSession.scope === 'string' && refreshedSession.scope.trim()
            ? refreshedSession.scope.split(' ')
            : session.scopes,
        connectedEmail: refreshedSession.connectedEmail ?? session.connectedEmail,
        expiresAt:
          typeof refreshedSession.expiresIn === 'number'
            ? new Date(Date.now() + refreshedSession.expiresIn * 1000).toISOString()
            : session.expiresAt,
      };

      await saveGoogleCalendarSession(nextSession);
      return nextSession;
    }

    const discovery = await getGoogleCalendarDiscoveryDocument();
    const refreshedSession = await AuthSession.refreshAsync(
      {
        clientId,
        refreshToken: session.refreshToken,
      },
      discovery,
    );

    const nextSession: GoogleCalendarSession = {
      ...session,
      accessToken: refreshedSession.accessToken,
      refreshToken: refreshedSession.refreshToken ?? session.refreshToken,
      tokenType: refreshedSession.tokenType,
      expiresAt:
        typeof refreshedSession.expiresIn === 'number'
          ? new Date(Date.now() + refreshedSession.expiresIn * 1000).toISOString()
          : session.expiresAt,
    };

    await saveGoogleCalendarSession(nextSession);
    return nextSession;
  } catch {
    return session;
  }
}

export function isLikelyPopupBlockedError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const normalizedMessage = error.message.toLowerCase();

  return (
    normalizedMessage.includes('popup') ||
    normalizedMessage.includes('window') ||
    normalizedMessage.includes('blocked') ||
    normalizedMessage.includes('opener')
  );
}

async function resolveGoogleCalendarWebRedirectIfNeeded() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return null;
  }

  if (pendingGoogleCalendarWebRedirectPromise) {
    return pendingGoogleCalendarWebRedirectPromise;
  }

  pendingGoogleCalendarWebRedirectPromise = (async () => {
    const pendingAuth = loadPendingGoogleCalendarWebAuth();
    const currentUrl = new URL(window.location.href);
    const code = currentUrl.searchParams.get('code');
    const error = currentUrl.searchParams.get('error');

    if (!pendingAuth || (!code && !error)) {
      pendingGoogleCalendarWebRedirectPromise = null;
      return null;
    }

    try {
      if (!code) {
        throw new Error(error || 'Google OAuth redirect did not return a code.');
      }

      console.log('[Calendar] Authorization code received:', Boolean(code));

      const nextSession = await finalizeGoogleCalendarAuthCode({
        clientId: pendingAuth.clientId,
        code,
        redirectUri: pendingAuth.redirectUri,
        codeVerifier: pendingAuth.codeVerifier,
      });

      console.log('[Calendar] Exchange success');
      console.log('[Calendar] OAuth response', {
        type: 'success',
        source: 'redirect',
        connectedEmail: nextSession.connectedEmail,
      });
      return nextSession;
    } catch (oauthError) {
      console.log('[Calendar] Exchange error', oauthError);
      console.log('[Calendar] OAuth error', oauthError);
      return null;
    } finally {
      clearPendingGoogleCalendarWebAuth();
      currentUrl.searchParams.delete('code');
      currentUrl.searchParams.delete('state');
      currentUrl.searchParams.delete('scope');
      currentUrl.searchParams.delete('authuser');
      currentUrl.searchParams.delete('prompt');
      currentUrl.searchParams.delete('error');
      window.history.replaceState(
        {},
        document.title,
        `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`,
      );
      pendingGoogleCalendarWebRedirectPromise = null;
    }
  })();

  return pendingGoogleCalendarWebRedirectPromise;
}

export async function completeGoogleCalendarWebOAuthRedirect(): Promise<{
  success: boolean;
  errorMessage?: string;
}> {
  const session = await resolveGoogleCalendarWebRedirectIfNeeded();

  if (session) {
    return { success: true };
  }

  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return { success: false };
  }

  const callbackUrl = new URL(window.location.href);
  const oauthError = callbackUrl.searchParams.get('error');

  if (oauthError) {
    return {
      success: false,
      errorMessage: oauthError,
    };
  }

  if (callbackUrl.searchParams.get('code')) {
    return {
      success: false,
      errorMessage:
        'Google sign-in returned an authorization code, but the app session expired. Connect again from Home.',
    };
  }

  return { success: false };
}

export async function startGoogleCalendarWebRedirectFallback(
  authRequest: AuthSession.AuthRequest,
  clientId: string,
  redirectUri: string,
) {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    throw new Error('Google Calendar web redirect fallback is only available on web.');
  }

  const discovery = await getGoogleCalendarDiscoveryDocument();
  const authUrl = await authRequest.makeAuthUrlAsync(discovery);
  const normalizedAuthUrl = /^https?:\/\//i.test(authUrl)
    ? authUrl
    : new URL(authUrl, GOOGLE_CALENDAR_DISCOVERY_ISSUER).toString();

  if (!authRequest.codeVerifier) {
    throw new Error('Google Calendar auth request is missing a PKCE code verifier.');
  }

  savePendingGoogleCalendarWebAuth({
    clientId,
    redirectUri,
    codeVerifier: authRequest.codeVerifier,
    createdAt: new Date().toISOString(),
  });

  window.location.assign(normalizedAuthUrl);

  return {
    success: false,
    connection: {
      provider: 'google',
      status: 'not_connected',
    } satisfies CalendarConnection,
    errorMessage: 'Redirecting to Google sign-in.',
  };
}

export async function getGoogleCalendarConnection() {
  await resolveGoogleCalendarWebRedirectIfNeeded();
  const clientId = resolveGoogleCalendarClientId();

  if (!clientId) {
    console.log('[Calendar Audit] getGoogleCalendarConnection — missing client ID', {
      platform: Platform.OS,
    });

    return {
      provider: 'google',
      status: 'missing_config',
    } satisfies CalendarConnection;
  }

  const connection = buildConnectionFromSession(await loadGoogleCalendarSession());
  console.log('[Calendar Audit] getGoogleCalendarConnection', {
    platform: Platform.OS,
    status: connection.status,
    connectedEmail: connection.connectedEmail ?? null,
  });

  return connection;
}

export async function getActiveGoogleCalendarSession() {
  const redirectedSession = await resolveGoogleCalendarWebRedirectIfNeeded();

  if (redirectedSession) {
    return redirectedSession;
  }

  const session = await loadGoogleCalendarSession();

  if (!session) {
    console.log('[Calendar Audit] getActiveGoogleCalendarSession — no stored session', {
      platform: Platform.OS,
    });
    return null;
  }

  const expiresAt = session.expiresAt ? Date.parse(session.expiresAt) : NaN;
  const isExpired = Number.isFinite(expiresAt) && expiresAt <= Date.now() + 60_000;

  if (!isExpired) {
    console.log('[Calendar Audit] getActiveGoogleCalendarSession — using stored access token', {
      platform: Platform.OS,
      connectedEmail: session.connectedEmail ?? null,
      expiresAt: session.expiresAt ?? null,
    });
    return session;
  }

  console.log('[Calendar Audit] getActiveGoogleCalendarSession — token expired, refreshing', {
    platform: Platform.OS,
    expiresAt: session.expiresAt ?? null,
  });

  const refreshedSession = await refreshGoogleCalendarSession(session);
  const refreshedExpiresAt = refreshedSession.expiresAt ? Date.parse(refreshedSession.expiresAt) : NaN;

  if (Number.isFinite(refreshedExpiresAt) && refreshedExpiresAt > Date.now() + 60_000) {
    console.log('[Calendar Audit] getActiveGoogleCalendarSession — refresh succeeded', {
      platform: Platform.OS,
      expiresAt: refreshedSession.expiresAt ?? null,
    });
    return refreshedSession;
  }

  console.log('[Calendar Audit] getActiveGoogleCalendarSession — no usable session after refresh', {
    platform: Platform.OS,
  });

  return null;
}

export async function connectGoogleCalendarAccount() {
  const clientId = resolveGoogleCalendarClientId();

  if (!clientId) {
    return {
      success: false,
      connection: {
        provider: 'google',
        status: 'missing_config',
      } satisfies CalendarConnection,
      errorMessage: 'Google Calendar client ID is missing for this platform.',
    };
  }

  const redirectUri = buildGoogleCalendarRedirectUri();
  const authRequest = new AuthSession.AuthRequest({
    clientId,
    scopes: [...googleCalendarScopes],
    redirectUri,
    responseType: AuthSession.ResponseType.Code,
    usePKCE: true,
    extraParams: {
      access_type: 'offline',
      include_granted_scopes: 'true',
      prompt: 'consent',
    },
  });

  try {
    const discovery = await getGoogleCalendarDiscoveryDocument();
    console.log('[Calendar] Starting OAuth');
    const authResult = await authRequest.promptAsync(
      discovery,
      Platform.OS === 'web'
        ? {
            windowFeatures: {
              width: 520,
              height: 720,
            },
          }
        : undefined,
    );
    console.log('[Calendar] OAuth response', authResult);

    if (authResult.type !== 'success' || !authResult.params.code) {
      if (
        Platform.OS === 'web' &&
        (authResult.type === 'locked' || authResult.type === 'error')
      ) {
        return startGoogleCalendarWebRedirectFallback(authRequest, clientId, redirectUri);
      }

      return {
        success: false,
        connection: await getGoogleCalendarConnection(),
        errorMessage:
          authResult.type === 'dismiss' || authResult.type === 'cancel'
            ? 'Google Calendar connection was cancelled.'
            : 'Unable to finish Google Calendar sign-in.',
      };
    }

    const nextSession = await finalizeGoogleCalendarAuthCode({
      clientId,
      code: authResult.params.code,
      redirectUri,
      codeVerifier: authRequest.codeVerifier || '',
    });

    return {
      success: true,
      connection: buildConnectionFromSession(nextSession),
    };
  } catch (oauthError) {
    console.log('[Calendar] OAuth error', oauthError);

    if (Platform.OS === 'web' && isLikelyPopupBlockedError(oauthError)) {
      return startGoogleCalendarWebRedirectFallback(authRequest, clientId, redirectUri);
    }

    return {
      success: false,
      connection: await getGoogleCalendarConnection(),
      errorMessage:
        oauthError instanceof Error
          ? oauthError.message
          : 'Unable to start Google Calendar sign-in.',
    };
  }
}

export async function disconnectGoogleCalendarAccount() {
  const clientId = resolveGoogleCalendarClientId();
  const session = await loadGoogleCalendarSession();

  if (clientId && session?.accessToken) {
    try {
      const discovery = await getGoogleCalendarDiscoveryDocument();
      await AuthSession.revokeAsync(
        {
          clientId,
          token: session.accessToken,
        },
        discovery,
      );
    } catch {
      // Ignore revoke errors in local foundation mode.
    }
  }

  await clearGoogleCalendarSession();

  return {
    success: true,
    connection: {
      provider: 'google',
      status: clientId ? 'not_connected' : 'missing_config',
    } satisfies CalendarConnection,
  };
}
