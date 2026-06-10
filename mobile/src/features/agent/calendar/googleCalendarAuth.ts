import { Platform } from 'react-native';

import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';

import type { CalendarConnection } from '@/src/entities/calendar/types';
import {
  assertCalendarEventsWriteScopeGranted,
  GOOGLE_CALENDAR_WRITE_NOT_GRANTED_MESSAGE,
  googleCalendarOAuthScopes,
  resolveGrantedScopes,
  scopesIncludeCalendarEventsWrite,
} from '@/src/features/agent/calendar/googleCalendarScopes';
import {
  clearGoogleCalendarSession,
  loadGoogleCalendarSession,
  saveGoogleCalendarSession,
  type GoogleCalendarSession,
} from '@/src/features/agent/calendar/googleCalendarStorage';
import {
  disconnectGoogleCalendarOnBackend,
  syncGoogleCalendarSessionToBackend,
} from '@/src/features/agent/calendar/googleCalendarBackendApi';
import { apiClient } from '@/src/shared/api';
import {
  logCalendarAuthError,
  logCalendarAuthStart,
  logCalendarAuthStateCleared,
  logCalendarAuthSuccess,
  logCalendarTokenExpiration,
  logCalendarTokenRefreshAttempt,
  logCalendarTokenRefreshResult,
} from '@/src/features/agent/calendar/calendarAuthDiagnostics';
import { logGoogleCalendarAndroidOAuthSetup } from '@/src/features/agent/calendar/googleCalendarAndroidOAuth';
import {
  buildGoogleCalendarOAuthRedirectUri,
  getGoogleCalendarOAuthConfigDiagnostics,
  logGoogleCalendarOAuthEvent,
  maskGoogleCalendarClientId,
  resolveGoogleCalendarClientIdSources,
  resolveGoogleCalendarOAuthClientId,
  resolveGoogleCalendarOAuthRuntime,
} from '@/src/features/agent/calendar/googleCalendarOAuthEnvironment';
import {
  clearGoogleCalendarPkceAuthStore,
  restoreGoogleCalendarPkceAuthStore,
  storeGoogleCalendarPkceAuthFromAuthRequest,
  type GoogleCalendarPkceAuthStore,
} from '@/src/features/agent/calendar/googleCalendarPkceAuthStore';
import { exchangeGoogleCalendarAuthorizationCodeWithPkce } from '@/src/features/agent/calendar/googleCalendarPkceTokenExchange';
import { logGoogleCalendarAuthRequestInspection } from '@/src/features/agent/calendar/googleCalendarOAuthInspection';
import {
  GOOGLE_CALENDAR_DISABLED_PREVIEW_MESSAGE,
  isGoogleCalendarEnabled,
} from '@/src/features/agent/calendar/googleCalendarFeatureFlag';
import { GOOGLE_CALENDAR_WEB_CALLBACK_PATH } from '@/src/features/agent/calendar/googleCalendarOAuthRoutes';

WebBrowser.maybeCompleteAuthSession();

export const GOOGLE_CALENDAR_DISCOVERY_ISSUER = 'https://accounts.google.com';
export {
  GOOGLE_CALENDAR_OAUTH_REDIRECT_LEGACY_ROUTE,
  GOOGLE_CALENDAR_OAUTH_REDIRECT_PATH,
  GOOGLE_CALENDAR_OAUTH_REDIRECT_ROUTE,
  GOOGLE_CALENDAR_WEB_CALLBACK_PATH,
  GOOGLE_CALENDAR_WEB_CALLBACK_ROUTE,
} from '@/src/features/agent/calendar/googleCalendarOAuthRoutes';

export {
  CALENDAR_EVENTS_WRITE_SCOPE,
  CALENDAR_FULL_SCOPE,
  GOOGLE_CALENDAR_WRITE_NOT_GRANTED_MESSAGE,
  googleCalendarOAuthScopes,
  scopesIncludeCalendarEventsWrite,
  scopesIncludeCalendarWrite,
} from '@/src/features/agent/calendar/googleCalendarScopes';

/** @deprecated Import {@link googleCalendarOAuthScopes} from `googleCalendarScopes`. */
export { googleCalendarOAuthScopes as googleCalendarScopes } from '@/src/features/agent/calendar/googleCalendarScopes';

const GOOGLE_CALENDAR_WEB_PENDING_AUTH_STORAGE_KEY =
  'executive-ai.google-calendar.pending-web-auth.v1';

type PendingGoogleCalendarWebAuth = {
  clientId: string;
  redirectUri: string;
  codeVerifier: string;
  state?: string;
  createdAt: string;
};

export type GoogleCalendarWebOAuthCallbackParams = {
  code?: string | null;
  state?: string | null;
  error?: string | null;
};

export type GoogleCalendarOAuthRedirectCallbackParams = GoogleCalendarWebOAuthCallbackParams;

let pendingGoogleCalendarWebRedirectPromise: Promise<GoogleCalendarSession | null> | null = null;
let pendingGoogleCalendarNativeRedirectPromise: Promise<GoogleCalendarSession | null> | null = null;
let googleCalendarDiscoveryDocumentPromise: Promise<AuthSession.DiscoveryDocument> | null = null;

type GoogleCalendarBackendTokenResponse = {
  accessToken: string;
  refreshToken?: string;
  tokenType?: string;
  scope?: string;
  expiresIn?: number;
  connectedEmail?: string;
  hasCalendarEventsScope?: boolean;
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
  return resolveGoogleCalendarOAuthClientId();
}

export function getGoogleCalendarClientId() {
  return resolveGoogleCalendarClientId();
}

function buildGoogleCalendarRedirectUri() {
  return buildGoogleCalendarOAuthRedirectUri();
}

export function getGoogleCalendarRedirectUri() {
  return buildGoogleCalendarRedirectUri();
}

function logGoogleCalendarOAuthConfiguration(stage: 'CONNECT_START' | 'AUTH_REQUEST_CREATED') {
  const diagnostics = getGoogleCalendarOAuthConfigDiagnostics();
  const sources = resolveGoogleCalendarClientIdSources();
  const clientId = resolveGoogleCalendarClientId();

  logGoogleCalendarOAuthEvent('CLIENT_IDS', {
    runtime: diagnostics.runtime,
    platform: diagnostics.platform,
    clientIdSource: diagnostics.clientIdSource,
    clientIdLoaded: diagnostics.clientIdLoaded,
    webLoaded: diagnostics.clientIds.webLoaded,
    iosLoaded: diagnostics.clientIds.iosLoaded,
    androidLoaded: diagnostics.clientIds.androidLoaded,
    webClientId: maskGoogleCalendarClientId(sources.web),
    iosClientId: maskGoogleCalendarClientId(sources.ios),
    androidClientId: maskGoogleCalendarClientId(sources.android),
    selectedClientId: maskGoogleCalendarClientId(clientId),
  });

  logGoogleCalendarOAuthEvent('REDIRECT_URI', {
    runtime: diagnostics.runtime,
    redirectUri: diagnostics.redirectUri,
  });

  if (stage === 'AUTH_REQUEST_CREATED') {
    logGoogleCalendarOAuthEvent('AUTH_REQUEST_CREATED', {
      runtime: diagnostics.runtime,
      redirectUri: diagnostics.redirectUri,
      clientIdSource: diagnostics.clientIdSource,
    });
  }
}

function resolveGoogleCalendarOAuthFailureMessage(
  authResult: AuthSession.AuthSessionResult,
) {
  if (authResult.type === 'dismiss' || authResult.type === 'cancel') {
    return 'Google Calendar connection was cancelled.';
  }

  if (authResult.type === 'locked') {
    return 'Another Google sign-in is already in progress. Try again in a moment.';
  }

  if (authResult.type === 'error') {
    return authResult.error?.message ?? 'Unable to finish Google Calendar sign-in.';
  }

  const params = authResult.type === 'success' ? authResult.params : undefined;
  const providerError = params?.error_description || params?.error;

  if (providerError) {
    return `Google sign-in failed: ${providerError}`;
  }

  return 'Unable to finish Google Calendar sign-in.';
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

/** Persist PKCE verifier before any web OAuth redirect (popup or full-page). */
export function saveGoogleCalendarWebOAuthPendingState(params: {
  clientId: string;
  redirectUri: string;
  codeVerifier: string;
  state?: string;
}) {
  savePendingGoogleCalendarWebAuth({
    clientId: params.clientId,
    redirectUri: params.redirectUri,
    codeVerifier: params.codeVerifier,
    state: params.state,
    createdAt: new Date().toISOString(),
  });

  console.log('[GoogleCalendar OAuth] pending web auth saved', {
    redirectUri: params.redirectUri,
    hasState: Boolean(params.state),
    hasCodeVerifier: Boolean(params.codeVerifier),
  });
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

async function buildGoogleCalendarSessionFromTokens(params: {
  accessToken: string;
  refreshToken?: string;
  tokenType?: string;
  scope?: string;
  expiresIn?: number;
  connectedEmail?: string;
}): Promise<GoogleCalendarSession> {
  const scopes = await assertCalendarEventsWriteScopeGranted(params.accessToken, params.scope);

  return {
    accessToken: params.accessToken,
    refreshToken: params.refreshToken,
    tokenType: params.tokenType,
    scopes,
    connectedEmail: params.connectedEmail,
    connectedAt: new Date().toISOString(),
    expiresAt:
      typeof params.expiresIn === 'number'
        ? new Date(Date.now() + params.expiresIn * 1000).toISOString()
        : undefined,
  };
}

async function exchangeGoogleCalendarCodeOnBackend(params: {
  code: string;
  redirectUri: string;
  codeVerifier: string;
}) {
  console.log('[GoogleCalendar OAuth] token exchange started', {
    redirectUri: params.redirectUri,
    hasCode: Boolean(params.code),
  });

  try {
    const response = await apiClient.post<GoogleCalendarBackendTokenResponse, typeof params>({
      path: '/google-calendar/exchange',
      body: params,
    });
    console.log('[GoogleCalendar OAuth] token exchange success', {
      hasAccessToken: Boolean(response.accessToken),
      hasRefreshToken: Boolean(response.refreshToken),
      connectedEmail: response.connectedEmail ?? null,
    });
    return response;
  } catch (error) {
    console.log('[GoogleCalendar OAuth] token exchange failure', error);
    throw error;
  }
}

async function refreshGoogleCalendarTokenOnBackend(params: {
  refreshToken: string;
}) {
  return apiClient.post<GoogleCalendarBackendTokenResponse, typeof params>({
    path: '/google-calendar/refresh',
    body: params,
  });
}

async function clearGoogleCalendarAuthState(reason: string) {
  logCalendarAuthStateCleared({ source: 'googleCalendarAuth', reason });
  await clearGoogleCalendarSession();
  await disconnectGoogleCalendarOnBackend().catch((error) => {
    console.log('[GoogleCalendar] backend disconnect during auth reset failed', error);
  });
}

async function resetGoogleCalendarSessionBeforeOAuth() {
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
  await disconnectGoogleCalendarOnBackend().catch((error) => {
    console.log('[GoogleCalendar] backend disconnect before OAuth failed', error);
  });
  const { invalidateCalendarAuthCache } = await import(
    '@/src/features/agent/calendar/calendarAuthCapabilities'
  );
  const { resetCalendarWriteSession } = await import(
    '@/src/features/agent/calendar/calendarWriteSession'
  );
  invalidateCalendarAuthCache();
  resetCalendarWriteSession();
}

export async function refreshGoogleCalendarConnectionState() {
  const { invalidateCalendarAuthCache, refreshCalendarAuthCapabilities } = await import(
    '@/src/features/agent/calendar/calendarAuthCapabilities'
  );
  invalidateCalendarAuthCache();
  const capabilities = await refreshCalendarAuthCapabilities({ heal: true });

  console.log('[GoogleCalendar OAuth] connected state updated', {
    status: capabilities.connection.status,
    connectedEmail: capabilities.connection.connectedEmail ?? null,
    canReadCalendar: capabilities.canReadCalendar,
    canWriteCalendar: capabilities.canWriteCalendar,
    inSync: capabilities.inSync,
  });

  return capabilities;
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

    if (tokenResponse.hasCalendarEventsScope === false) {
      await clearGoogleCalendarAuthState('oauth_missing_write_scope_after_exchange');
      throw new Error(GOOGLE_CALENDAR_WRITE_NOT_GRANTED_MESSAGE);
    }

    const nextSession = await buildGoogleCalendarSessionFromTokens({
      accessToken: tokenResponse.accessToken,
      refreshToken: tokenResponse.refreshToken,
      tokenType: tokenResponse.tokenType,
      scope: tokenResponse.scope,
      expiresIn: tokenResponse.expiresIn,
      connectedEmail: tokenResponse.connectedEmail,
    });

    await saveGoogleCalendarSession(nextSession);
    await syncGoogleCalendarSessionToBackend(nextSession).catch((error) => {
      console.log('[GoogleCalendar] backend session sync failed after web exchange', error);
    });
    const { invalidateCalendarAuthCache } = await import(
      '@/src/features/agent/calendar/calendarAuthCapabilities'
    );
    invalidateCalendarAuthCache();

    console.log('[Calendar] OAuth granted scopes verified', {
      scopes: nextSession.scopes,
      hasCalendarEventsScope: scopesIncludeCalendarEventsWrite(nextSession.scopes),
    });

    return nextSession;
  }

  const tokenResponse = await exchangeGoogleCalendarAuthorizationCodeWithPkce({
    clientId: params.clientId,
    code: params.code,
    redirectUri: params.redirectUri,
    codeVerifier: params.codeVerifier,
  });
  const connectedEmail = tokenResponse.accessToken
    ? await fetchGoogleProfile(tokenResponse.accessToken)
    : undefined;
  const nextSession = await buildGoogleCalendarSessionFromTokens({
    accessToken: tokenResponse.accessToken,
    refreshToken: tokenResponse.refreshToken,
    tokenType: tokenResponse.tokenType,
    scope: tokenResponse.scope,
    expiresIn: tokenResponse.expiresIn,
    connectedEmail,
  });

  await saveGoogleCalendarSession(nextSession);
  await syncGoogleCalendarSessionToBackend(nextSession).catch((error) => {
    console.log('[GoogleCalendar] backend session sync failed after native exchange', error);
  });
  const { invalidateCalendarAuthCache } = await import(
    '@/src/features/agent/calendar/calendarAuthCapabilities'
  );
  invalidateCalendarAuthCache();

  console.log('[Calendar] OAuth granted scopes verified', {
    scopes: nextSession.scopes,
    hasCalendarEventsScope: scopesIncludeCalendarEventsWrite(nextSession.scopes),
  });

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

async function refreshGoogleCalendarSession(session: GoogleCalendarSession, attempt = 1) {
  const clientId = resolveGoogleCalendarClientId();

  if (!clientId || !session.refreshToken) {
    logCalendarTokenRefreshResult({
      source: 'refreshGoogleCalendarSession',
      success: false,
      detail: 'missing_client_or_refresh_token',
    });
    return session;
  }

  logCalendarTokenRefreshAttempt({
    source: 'refreshGoogleCalendarSession',
    hasRefreshToken: Boolean(session.refreshToken),
    attempt,
  });

  try {
    if (Platform.OS === 'web') {
      const refreshedSession = await refreshGoogleCalendarTokenOnBackend({
        refreshToken: session.refreshToken,
      });
      const scopes = await resolveGrantedScopes(
        refreshedSession.accessToken,
        refreshedSession.scope,
      );

      if (!scopesIncludeCalendarEventsWrite(scopes)) {
        await clearGoogleCalendarAuthState('refresh_missing_write_scope');
        return session;
      }

      const nextSession: GoogleCalendarSession = {
        ...session,
        accessToken: refreshedSession.accessToken,
        refreshToken: refreshedSession.refreshToken ?? session.refreshToken,
        tokenType: refreshedSession.tokenType ?? session.tokenType,
        scopes,
        connectedEmail: refreshedSession.connectedEmail ?? session.connectedEmail,
        expiresAt:
          typeof refreshedSession.expiresIn === 'number'
            ? new Date(Date.now() + refreshedSession.expiresIn * 1000).toISOString()
            : session.expiresAt,
      };

      await saveGoogleCalendarSession(nextSession);
      await syncGoogleCalendarSessionToBackend(nextSession).catch((error) => {
        console.log('[GoogleCalendar] backend session sync failed after web refresh', error);
      });
      const { invalidateCalendarAuthCache } = await import(
        '@/src/features/agent/calendar/calendarAuthCapabilities'
      );
      invalidateCalendarAuthCache();
      logCalendarTokenRefreshResult({
        source: 'refreshGoogleCalendarSession',
        success: true,
        expiresAt: nextSession.expiresAt ?? null,
      });
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

    const scopes = await resolveGrantedScopes(
      refreshedSession.accessToken,
      refreshedSession.scope,
    );

    if (!scopesIncludeCalendarEventsWrite(scopes)) {
      await clearGoogleCalendarAuthState('refresh_missing_write_scope');
      return session;
    }

    const nextSession: GoogleCalendarSession = {
      ...session,
      accessToken: refreshedSession.accessToken,
      refreshToken: refreshedSession.refreshToken ?? session.refreshToken,
      tokenType: refreshedSession.tokenType,
      scopes,
      expiresAt:
        typeof refreshedSession.expiresIn === 'number'
          ? new Date(Date.now() + refreshedSession.expiresIn * 1000).toISOString()
          : session.expiresAt,
    };

    await saveGoogleCalendarSession(nextSession);
    await syncGoogleCalendarSessionToBackend(nextSession).catch((error) => {
      console.log('[GoogleCalendar] backend session sync failed after native refresh', error);
    });
    const { invalidateCalendarAuthCache } = await import(
      '@/src/features/agent/calendar/calendarAuthCapabilities'
    );
    invalidateCalendarAuthCache();
    logCalendarTokenRefreshResult({
      source: 'refreshGoogleCalendarSession',
      success: true,
      expiresAt: nextSession.expiresAt ?? null,
    });
    return nextSession;
  } catch (error) {
    logCalendarTokenRefreshResult({
      source: 'refreshGoogleCalendarSession',
      success: false,
      detail: error instanceof Error ? error.message : 'refresh_failed',
    });
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

async function resolveGoogleCalendarWebRedirectIfNeeded(
  callbackParams?: GoogleCalendarWebOAuthCallbackParams,
) {
  if (!isGoogleCalendarEnabled()) {
    return null;
  }

  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return null;
  }

  if (pendingGoogleCalendarWebRedirectPromise) {
    return pendingGoogleCalendarWebRedirectPromise;
  }

  pendingGoogleCalendarWebRedirectPromise = (async () => {
    const pendingAuth = loadPendingGoogleCalendarWebAuth();
    const currentUrl = new URL(window.location.href);
    const code = callbackParams?.code?.trim() || currentUrl.searchParams.get('code');
    const error = callbackParams?.error?.trim() || currentUrl.searchParams.get('error');
    const returnedState =
      callbackParams?.state?.trim() || currentUrl.searchParams.get('state');

    console.log('[GoogleCalendar OAuth] resolving web redirect', {
      hasPendingAuth: Boolean(pendingAuth),
      hasCode: Boolean(code),
      hasError: Boolean(error),
      hasState: Boolean(returnedState),
    });

    if (!pendingAuth || (!code && !error)) {
      console.log('[GoogleCalendar OAuth] skipping redirect resolve', {
        reason: !pendingAuth ? 'missing_pending_auth' : 'missing_code_and_error',
      });
      pendingGoogleCalendarWebRedirectPromise = null;
      return null;
    }

    if (
      pendingAuth.state &&
      returnedState &&
      pendingAuth.state !== returnedState
    ) {
      clearPendingGoogleCalendarWebAuth();
      throw new Error('OAuth state mismatch. Connect Google Calendar again from Home.');
    }

    try {
      if (!code) {
        console.log('[GoogleCalendar OAuth] OAuth error param from redirect', error ?? null);
        throw new Error(
          error === 'access_denied'
            ? GOOGLE_CALENDAR_WRITE_NOT_GRANTED_MESSAGE
            : error || 'Google OAuth redirect did not return a code.',
        );
      }

      console.log('[GoogleCalendar OAuth] received code/state', {
        hasCode: Boolean(code),
        hasState: Boolean(returnedState),
      });

      const nextSession = await finalizeGoogleCalendarAuthCode({
        clientId: pendingAuth.clientId,
        code,
        redirectUri: pendingAuth.redirectUri,
        codeVerifier: pendingAuth.codeVerifier,
      });

      console.log('[GoogleCalendar OAuth] token exchange success', {
        connectedEmail: nextSession.connectedEmail ?? null,
      });
      await refreshGoogleCalendarConnectionState();
      return nextSession;
    } catch (oauthError) {
      console.log('[GoogleCalendar OAuth] token exchange failure', oauthError);

      if (
        oauthError instanceof Error &&
        oauthError.message === GOOGLE_CALENDAR_WRITE_NOT_GRANTED_MESSAGE
      ) {
        throw oauthError;
      }

      throw oauthError instanceof Error
        ? oauthError
        : new Error('Google Calendar token exchange failed.');
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

export async function completeGoogleCalendarWebOAuthRedirect(
  callbackParams?: GoogleCalendarWebOAuthCallbackParams,
): Promise<{
  success: boolean;
  errorMessage?: string;
  connectedEmail?: string;
}> {
  console.log('[GoogleCalendar OAuth] callback completion started', {
    hasCode: Boolean(callbackParams?.code),
    hasState: Boolean(callbackParams?.state),
    hasError: Boolean(callbackParams?.error),
  });

  try {
    const session = await resolveGoogleCalendarWebRedirectIfNeeded(callbackParams);

    if (session) {
      return { success: true, connectedEmail: session.connectedEmail };
    }
  } catch (oauthError) {
    if (
      oauthError instanceof Error &&
      oauthError.message === GOOGLE_CALENDAR_WRITE_NOT_GRANTED_MESSAGE
    ) {
      return {
        success: false,
        errorMessage: GOOGLE_CALENDAR_WRITE_NOT_GRANTED_MESSAGE,
      };
    }

    throw oauthError;
  }

  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return { success: false };
  }

  const callbackUrl = new URL(window.location.href);
  const oauthError =
    callbackParams?.error?.trim() || callbackUrl.searchParams.get('error');
  const callbackCode =
    callbackParams?.code?.trim() || callbackUrl.searchParams.get('code');

  if (oauthError) {
    return {
      success: false,
      errorMessage:
        oauthError === 'access_denied'
          ? GOOGLE_CALENDAR_WRITE_NOT_GRANTED_MESSAGE
          : oauthError,
    };
  }

  if (callbackCode) {
    return {
      success: false,
      errorMessage:
        'Google sign-in returned an authorization code, but the app session expired. Connect again from Home.',
    };
  }

  return { success: false };
}

function validateGoogleCalendarOAuthState(
  storedState: string | undefined,
  returnedState: string | null,
) {
  if (!storedState || !returnedState) {
    return;
  }

  if (storedState !== returnedState) {
    console.log('[GoogleCalendar OAuth] OAuth state mismatch', {
      storedState,
      returnedState,
    });
    throw new Error('OAuth state mismatch. Connect Google Calendar again from Home.');
  }

  console.log('[GoogleCalendar OAuth] OAuth state validated', {
    state: returnedState,
  });
}

async function exchangeGoogleCalendarOAuthCodeWithStoredPkce(params: {
  restoredPkce: GoogleCalendarPkceAuthStore;
  code: string;
  returnedState?: string | null;
}) {
  validateGoogleCalendarOAuthState(params.restoredPkce.state, params.returnedState ?? null);

  const nextSession = await finalizeGoogleCalendarAuthCode({
    clientId: params.restoredPkce.clientId,
    code: params.code,
    redirectUri: params.restoredPkce.redirectUri,
    codeVerifier: params.restoredPkce.codeVerifier,
  });

  await refreshGoogleCalendarConnectionState();
  await clearGoogleCalendarPkceAuthStore();
  return nextSession;
}

export async function completeGoogleCalendarNativeOAuthRedirect(
  callbackParams?: GoogleCalendarOAuthRedirectCallbackParams,
  restoredPkce?: GoogleCalendarPkceAuthStore | null,
): Promise<{
  success: boolean;
  errorMessage?: string;
  connectedEmail?: string;
}> {
  if (!isGoogleCalendarEnabled()) {
    return {
      success: false,
      errorMessage: GOOGLE_CALENDAR_DISABLED_PREVIEW_MESSAGE,
    };
  }

  const code = callbackParams?.code?.trim() || null;
  const error = callbackParams?.error?.trim() || null;
  const returnedState = callbackParams?.state?.trim() || null;

  console.log('[GoogleCalendar OAuth] native oauthredirect completion started', {
    hasCode: Boolean(code),
    hasState: Boolean(returnedState),
    hasError: Boolean(error),
    hasRestoredPkceArg: Boolean(restoredPkce?.codeVerifier),
  });

  if (error) {
    return {
      success: false,
      errorMessage:
        error === 'access_denied'
          ? GOOGLE_CALENDAR_WRITE_NOT_GRANTED_MESSAGE
          : error,
    };
  }

  if (!code) {
    return {
      success: false,
      errorMessage: 'Google OAuth redirect did not return an authorization code.',
    };
  }

  const pkceStore = restoredPkce ?? (await restoreGoogleCalendarPkceAuthStore());

  if (!pkceStore?.codeVerifier?.trim()) {
    const existingSession = await loadGoogleCalendarSession();

    if (existingSession?.accessToken) {
      return { success: true, connectedEmail: existingSession.connectedEmail };
    }

    return {
      success: false,
      errorMessage:
        'Google Calendar PKCE verifier was not restored on oauthredirect. Connect again from Home.',
    };
  }

  console.log('[GoogleCalendar OAuth] oauthredirect using restored PKCE verifier', {
    codeVerifierLength: pkceStore.codeVerifier.length,
    redirectUri: pkceStore.redirectUri,
    storedState: pkceStore.state,
    returnedState,
    storedAt: pkceStore.storedAt,
  });

  if (pendingGoogleCalendarNativeRedirectPromise) {
    try {
      const session = await pendingGoogleCalendarNativeRedirectPromise;

      if (session) {
        return { success: true, connectedEmail: session.connectedEmail };
      }
    } catch (oauthError) {
      if (
        oauthError instanceof Error &&
        oauthError.message === GOOGLE_CALENDAR_WRITE_NOT_GRANTED_MESSAGE
      ) {
        return {
          success: false,
          errorMessage: GOOGLE_CALENDAR_WRITE_NOT_GRANTED_MESSAGE,
        };
      }

      return {
        success: false,
        errorMessage:
          oauthError instanceof Error
            ? oauthError.message
            : 'Google Calendar token exchange failed.',
      };
    }
  }

  pendingGoogleCalendarNativeRedirectPromise = (async () => {
    try {
      return await exchangeGoogleCalendarOAuthCodeWithStoredPkce({
        restoredPkce: pkceStore,
        code,
        returnedState,
      });
    } finally {
      pendingGoogleCalendarNativeRedirectPromise = null;
    }
  })();

  try {
    const session = await pendingGoogleCalendarNativeRedirectPromise;

    if (!session) {
      return {
        success: false,
        errorMessage: 'Google Calendar token exchange did not complete.',
      };
    }

    logCalendarAuthSuccess({
      connectedEmail: session.connectedEmail ?? null,
      hasRefreshToken: Boolean(session.refreshToken),
      runtime: resolveGoogleCalendarOAuthRuntime(),
    });

    return { success: true, connectedEmail: session.connectedEmail };
  } catch (oauthError) {
    if (
      oauthError instanceof Error &&
      oauthError.message === GOOGLE_CALENDAR_WRITE_NOT_GRANTED_MESSAGE
    ) {
      return {
        success: false,
        errorMessage: GOOGLE_CALENDAR_WRITE_NOT_GRANTED_MESSAGE,
      };
    }

    return {
      success: false,
      errorMessage:
        oauthError instanceof Error
          ? oauthError.message
          : 'Google Calendar token exchange failed.',
    };
  }
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

  saveGoogleCalendarWebOAuthPendingState({
    clientId,
    redirectUri,
    codeVerifier: authRequest.codeVerifier,
    state: authRequest.state,
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
  const { refreshCalendarAuthCapabilities } = await import(
    '@/src/features/agent/calendar/calendarAuthCapabilities'
  );
  const capabilities = await refreshCalendarAuthCapabilities({ heal: true });

  console.log('[Calendar Audit] getGoogleCalendarConnection', {
    platform: Platform.OS,
    status: capabilities.connection.status,
    connectedEmail: capabilities.connection.connectedEmail ?? null,
    canReadCalendar: capabilities.canReadCalendar,
    canWriteCalendar: capabilities.canWriteCalendar,
    inSync: capabilities.inSync,
    desyncReason: capabilities.desyncReason ?? null,
  });

  return capabilities.connection;
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

  logCalendarTokenExpiration({
    source: 'getActiveGoogleCalendarSession',
    expiresAt: session.expiresAt ?? null,
    connectedEmail: session.connectedEmail ?? null,
  });

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

  let refreshedSession = await refreshGoogleCalendarSession(session);
  let refreshedExpiresAt = refreshedSession.expiresAt ? Date.parse(refreshedSession.expiresAt) : NaN;

  if (!Number.isFinite(refreshedExpiresAt) || refreshedExpiresAt <= Date.now() + 60_000) {
    refreshedSession = await refreshGoogleCalendarSession(session);
    refreshedExpiresAt = refreshedSession.expiresAt ? Date.parse(refreshedSession.expiresAt) : NaN;
  }

  if (Number.isFinite(refreshedExpiresAt) && refreshedExpiresAt > Date.now() + 60_000) {
    console.log('[Calendar Audit] getActiveGoogleCalendarSession — refresh succeeded', {
      platform: Platform.OS,
      expiresAt: refreshedSession.expiresAt ?? null,
    });
    return refreshedSession;
  }

  if (refreshedSession.accessToken) {
    console.log('[Calendar Audit] getActiveGoogleCalendarSession — using session after refresh attempt', {
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
  if (!isGoogleCalendarEnabled()) {
    return {
      success: false,
      connection: {
        provider: 'google',
        status: 'not_connected',
      } satisfies CalendarConnection,
      errorMessage: GOOGLE_CALENDAR_DISABLED_PREVIEW_MESSAGE,
    };
  }

  const runtime = resolveGoogleCalendarOAuthRuntime();
  const redirectUriForStart = buildGoogleCalendarRedirectUri();

  logCalendarAuthStart({
    runtime,
    platform: Platform.OS,
    redirectUri: redirectUriForStart,
  });

  if (Platform.OS === 'android') {
    logGoogleCalendarAndroidOAuthSetup(Platform.OS);
  }

  logGoogleCalendarOAuthEvent('CONNECT_START', {
    runtime,
    platform: Platform.OS,
  });
  logGoogleCalendarOAuthConfiguration('CONNECT_START');

  console.log('[Calendar] Clearing stored Google Calendar session before OAuth');
  await clearGoogleCalendarPkceAuthStore();
  await resetGoogleCalendarSessionBeforeOAuth();

  const clientId = resolveGoogleCalendarClientId();

  if (!clientId) {
    const missingConfigMessage =
      runtime === 'expo_go'
        ? 'Google Calendar web client ID is missing. Set EXPO_PUBLIC_GOOGLE_CALENDAR_WEB_CLIENT_ID for Expo Go.'
        : Platform.OS === 'ios'
          ? 'Google Calendar iOS client ID is missing. Set EXPO_PUBLIC_GOOGLE_CALENDAR_IOS_CLIENT_ID.'
          : Platform.OS === 'android'
            ? 'Google Calendar Android client ID is missing. Set EXPO_PUBLIC_GOOGLE_CALENDAR_ANDROID_CLIENT_ID.'
            : 'Google Calendar client ID is missing for this platform.';

    logGoogleCalendarOAuthEvent('CONNECT_FAILED', {
      reason: 'missing_client_id',
      runtime,
      message: missingConfigMessage,
    });

    return {
      success: false,
      connection: {
        provider: 'google',
        status: 'missing_config',
      } satisfies CalendarConnection,
      errorMessage: missingConfigMessage,
    };
  }

  const redirectUri = buildGoogleCalendarRedirectUri();
  const authRequest = new AuthSession.AuthRequest({
    clientId,
    scopes: [...googleCalendarOAuthScopes],
    redirectUri,
    responseType: AuthSession.ResponseType.Code,
    usePKCE: true,
    extraParams: {
      access_type: 'offline',
      include_granted_scopes: 'true',
      prompt: 'consent select_account',
    },
  });

  try {
    const discovery = await getGoogleCalendarDiscoveryDocument();

    if (Platform.OS === 'web') {
      if (!authRequest.codeVerifier) {
        return {
          success: false,
          connection: {
            provider: 'google',
            status: 'not_connected',
          } satisfies CalendarConnection,
          errorMessage: 'Google Calendar auth request is missing a PKCE code verifier.',
        };
      }

      saveGoogleCalendarWebOAuthPendingState({
        clientId,
        redirectUri,
        codeVerifier: authRequest.codeVerifier,
        state: authRequest.state,
      });
    }

    logGoogleCalendarOAuthConfiguration('AUTH_REQUEST_CREATED');
    const authUrl = await authRequest.makeAuthUrlAsync(discovery);
    await logGoogleCalendarAuthRequestInspection(authRequest, discovery);
    logGoogleCalendarOAuthEvent('PROMPT_START', {
      runtime,
      redirectUri,
    });
    const requestConfig = await authRequest.getAuthRequestConfigAsync();
    const googleRedirectUri = (() => {
      try {
        return new URL(authUrl).searchParams.get('redirect_uri') ?? requestConfig.redirectUri;
      } catch {
        return requestConfig.redirectUri;
      }
    })();
    const debugRequestConfig = {
      redirectUri: requestConfig.redirectUri,
      clientId: requestConfig.clientId,
      scopes: requestConfig.scopes,
      responseType: requestConfig.responseType,
      usePKCE: authRequest.usePKCE,
      extraParams: requestConfig.extraParams,
      state: requestConfig.state,
    };

    console.log('GOOGLE_AUTH_DEBUG_START');
    console.log('GOOGLE_REDIRECT_URI_FINAL', googleRedirectUri);
    console.log('GOOGLE_AUTH_DEBUG redirectUri', googleRedirectUri);
    console.log('GOOGLE_AUTH_DEBUG clientId', clientId);
    console.log('GOOGLE_AUTH_DEBUG scopes', [...googleCalendarOAuthScopes]);
    console.log('GOOGLE_AUTH_DEBUG authUrl', authUrl);
    console.log('GOOGLE_AUTH_DEBUG requestConfig', debugRequestConfig);
    console.log('GOOGLE_AUTH_DEBUG pkce', {
      usePKCE: authRequest.usePKCE,
      hasCodeVerifier: Boolean(authRequest.codeVerifier),
      codeVerifierLength: authRequest.codeVerifier?.length ?? 0,
      hasCodeChallenge: (() => {
        try {
          return Boolean(new URL(authUrl).searchParams.get('code_challenge'));
        } catch {
          return false;
        }
      })(),
    });

    if (runtime !== 'web') {
      await storeGoogleCalendarPkceAuthFromAuthRequest({
        authRequest,
        clientId,
        redirectUri,
        authUrl,
      });
    }

    console.log('[Calendar] Starting OAuth', {
      hasCodeVerifierBeforePrompt: Boolean(authRequest.codeVerifier),
      codeVerifierLength: authRequest.codeVerifier?.length ?? 0,
    });
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

    console.log('GOOGLE_PROMPT_RESULT', JSON.stringify(authResult));

    const promptCode =
      authResult.type === 'success' ? authResult.params.code?.trim() ?? '' : '';
    const promptState =
      authResult.type === 'success' ? authResult.params.state?.trim() ?? null : null;

    console.log('GOOGLE_PROMPT_CODE_FOUND', Boolean(promptCode));

    logGoogleCalendarOAuthEvent('AUTH_RESULT', {
      type: authResult.type,
      hasCode: Boolean(promptCode),
      code: promptCode || null,
      state: promptState,
      error:
        authResult.type === 'error'
          ? authResult.error?.message ?? authResult.params?.error ?? null
          : authResult.type === 'success'
            ? authResult.params.error ?? null
            : null,
      errorDescription:
        authResult.type === 'success' ? authResult.params.error_description ?? null : null,
      url: authResult.type === 'success' || authResult.type === 'error' ? authResult.url : null,
    });
    console.log('[Calendar] OAuth response', authResult);

    if (authResult.type !== 'success' || !promptCode) {
      if (
        Platform.OS === 'web' &&
        (authResult.type === 'locked' || authResult.type === 'error')
      ) {
        return startGoogleCalendarWebRedirectFallback(authRequest, clientId, redirectUri);
      }

      const sessionAfterRedirect = await loadGoogleCalendarSession();

      if (sessionAfterRedirect?.accessToken) {
        await clearGoogleCalendarPkceAuthStore();
        await refreshGoogleCalendarConnectionState();

        logGoogleCalendarOAuthEvent('CONNECT_SUCCESS', {
          runtime,
          connectedEmail: sessionAfterRedirect.connectedEmail ?? null,
          via: 'oauthredirect_route',
        });
        logCalendarAuthSuccess({
          runtime,
          connectedEmail: sessionAfterRedirect.connectedEmail ?? null,
          hasRefreshToken: Boolean(sessionAfterRedirect.refreshToken),
        });

        return {
          success: true,
          connection: buildConnectionFromSession(sessionAfterRedirect),
          writeScopeGranted: scopesIncludeCalendarEventsWrite(sessionAfterRedirect.scopes),
        };
      }

      const errorMessage = resolveGoogleCalendarOAuthFailureMessage(authResult);

      logGoogleCalendarOAuthEvent('CONNECT_FAILED', {
        reason: 'auth_result_not_success',
        authResultType: authResult.type,
        message: errorMessage,
      });
      logCalendarAuthError({
        runtime,
        stage: 'auth_result_not_success',
        message: errorMessage,
      });

      return {
        success: false,
        connection: await getGoogleCalendarConnection(),
        errorMessage,
      };
    }

    const restoredPkce = runtime !== 'web' ? await restoreGoogleCalendarPkceAuthStore() : null;
    const exchangeClientId = restoredPkce?.clientId ?? clientId;
    const exchangeRedirectUri = restoredPkce?.redirectUri ?? redirectUri;
    const exchangeCodeVerifier =
      restoredPkce?.codeVerifier?.trim() ?? authRequest.codeVerifier?.trim() ?? '';

    logGoogleCalendarOAuthEvent('TOKEN_EXCHANGE_START', {
      redirectUri: exchangeRedirectUri,
      hasCode: Boolean(promptCode),
      hasCodeVerifier: Boolean(exchangeCodeVerifier),
      hasRestoredPkce: Boolean(restoredPkce?.codeVerifier),
      state: promptState,
    });

    let nextSession: GoogleCalendarSession;

    try {
      if (runtime !== 'web') {
        if (!exchangeCodeVerifier) {
          throw new Error(
            'Google Calendar PKCE code verifier is missing after promptAsync success.',
          );
        }

        validateGoogleCalendarOAuthState(restoredPkce?.state, promptState);

        nextSession = await finalizeGoogleCalendarAuthCode({
          clientId: exchangeClientId,
          code: promptCode,
          redirectUri: exchangeRedirectUri,
          codeVerifier: exchangeCodeVerifier,
        });
        await clearGoogleCalendarPkceAuthStore();
      } else {
        nextSession = await finalizeGoogleCalendarAuthCode({
          clientId,
          code: promptCode,
          redirectUri,
          codeVerifier: authRequest.codeVerifier || '',
        });
      }

      logGoogleCalendarOAuthEvent('TOKEN_EXCHANGE_SUCCESS', {
        connectedEmail: nextSession.connectedEmail ?? null,
        hasAccessToken: Boolean(nextSession.accessToken),
        hasRefreshToken: Boolean(nextSession.refreshToken),
      });
    } catch (exchangeError) {
      logGoogleCalendarOAuthEvent('TOKEN_EXCHANGE_ERROR', {
        message: exchangeError instanceof Error ? exchangeError.message : String(exchangeError),
        stack: exchangeError instanceof Error ? exchangeError.stack : null,
      });
      throw exchangeError;
    }

    logGoogleCalendarOAuthEvent('CONNECT_SUCCESS', {
      runtime,
      connectedEmail: nextSession.connectedEmail ?? null,
    });
    logCalendarAuthSuccess({
      runtime,
      connectedEmail: nextSession.connectedEmail ?? null,
      hasRefreshToken: Boolean(nextSession.refreshToken),
    });

    return {
      success: true,
      connection: buildConnectionFromSession(nextSession),
      writeScopeGranted: scopesIncludeCalendarEventsWrite(nextSession.scopes),
    };
  } catch (oauthError) {
    const authErrorMessage =
      oauthError instanceof Error ? oauthError.message : String(oauthError);

    logGoogleCalendarOAuthEvent('AUTH_ERROR', {
      runtime,
      message: authErrorMessage,
    });
    logCalendarAuthError({
      runtime,
      stage: 'auth_exception',
      message: authErrorMessage,
    });
    console.log('[Calendar] OAuth error', oauthError);

    if (
      oauthError instanceof Error &&
      oauthError.message === GOOGLE_CALENDAR_WRITE_NOT_GRANTED_MESSAGE
    ) {
      return {
        success: false,
        connection: await getGoogleCalendarConnection(),
        errorMessage: GOOGLE_CALENDAR_WRITE_NOT_GRANTED_MESSAGE,
        writeScopeGranted: false,
      };
    }

    if (Platform.OS === 'web' && isLikelyPopupBlockedError(oauthError)) {
      return startGoogleCalendarWebRedirectFallback(authRequest, clientId, redirectUri);
    }

    const errorMessage =
      oauthError instanceof Error
        ? oauthError.message
        : 'Unable to start Google Calendar sign-in.';

    logGoogleCalendarOAuthEvent('CONNECT_FAILED', {
      reason: 'auth_exception',
      message: errorMessage,
    });

    return {
      success: false,
      connection: await getGoogleCalendarConnection(),
      errorMessage,
    };
  }
}

export async function disconnectGoogleCalendarAccount() {
  await clearGoogleCalendarPkceAuthStore();

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
  await disconnectGoogleCalendarOnBackend().catch((error) => {
    console.log('[GoogleCalendar] backend disconnect failed', error);
  });
  const { invalidateCalendarAuthCache } = await import(
    '@/src/features/agent/calendar/calendarAuthCapabilities'
  );
  const { resetCalendarWriteSession } = await import(
    '@/src/features/agent/calendar/calendarWriteSession'
  );
  invalidateCalendarAuthCache();
  resetCalendarWriteSession();

  return {
    success: true,
    connection: {
      provider: 'google',
      status: clientId ? 'not_connected' : 'missing_config',
    } satisfies CalendarConnection,
  };
}
