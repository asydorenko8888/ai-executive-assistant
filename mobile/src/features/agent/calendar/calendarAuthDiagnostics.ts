import { devConsoleLog } from '@/src/shared/logging/devConsoleLog';

export function logCalendarTokenExpiration(params: {
  expiresAt?: string | null;
  connectedEmail?: string | null;
  source: string;
}) {
  const expiresAtMs = params.expiresAt ? Date.parse(params.expiresAt) : NaN;
  const msUntilExpiry = Number.isFinite(expiresAtMs) ? expiresAtMs - Date.now() : null;

  console.log('[Calendar Auth] token expiration', {
    source: params.source,
    connectedEmail: params.connectedEmail ?? null,
    expiresAt: params.expiresAt ?? null,
    msUntilExpiry,
    isExpired: msUntilExpiry !== null ? msUntilExpiry <= 60_000 : null,
  });
}

export function logCalendarTokenRefreshAttempt(params: {
  source: string;
  hasRefreshToken: boolean;
  attempt: number;
}) {
  console.log('[Calendar Auth] refresh attempt', params);
}

export function logCalendarTokenRefreshResult(params: {
  source: string;
  success: boolean;
  expiresAt?: string | null;
  detail?: string;
}) {
  console.log('[Calendar Auth] refresh result', params);
}

export function logCalendarAuthStateCleared(params: { source: string; reason: string }) {
  console.log('[Calendar Auth] auth state cleared', params);
}

export function logCalendarApiError(params: {
  operation: string;
  status?: number;
  code?: string | null;
  message?: string;
  willRetryRefresh?: boolean;
}) {
  console.log('[Calendar Auth] api error', params);
}

export function logCalendarAuthStart(params: {
  runtime: string;
  platform: string;
  redirectUri: string;
}) {
  devConsoleLog('CALENDAR_AUTH_START', params);
}

export function logCalendarAuthSuccess(params: {
  connectedEmail?: string | null;
  hasRefreshToken: boolean;
  runtime?: string;
}) {
  devConsoleLog('CALENDAR_AUTH_SUCCESS', params);
}

export function logCalendarAuthError(params: {
  message: string;
  runtime?: string;
  stage?: string;
}) {
  devConsoleLog('CALENDAR_AUTH_ERROR', params);
}

export function logCalendarEventsFetchStart(params: {
  timeMin: string;
  timeMax: string;
  source: string;
}) {
  devConsoleLog('CALENDAR_EVENTS_FETCH_START', params);
}

export function logCalendarEventsFetchSuccess(params: {
  count: number;
  source: string;
  timeMin: string;
  timeMax: string;
}) {
  devConsoleLog('CALENDAR_EVENTS_FETCH_SUCCESS', params);
}

export function logCalendarEventsFetchError(params: {
  message: string;
  source: string;
  timeMin?: string;
  timeMax?: string;
}) {
  devConsoleLog('CALENDAR_EVENTS_FETCH_ERROR', params);
}
