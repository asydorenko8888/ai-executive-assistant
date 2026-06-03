import { ApiError } from '@/src/shared/api/api-error';

const HARD_AUTH_ERROR_CODES = new Set([
  'invalid_grant',
  'invalid_token',
  'token_expired',
  'expired_token',
  'refresh_token_expired',
  'unauthorized_client',
]);

const WRITE_SCOPE_ERROR_CODES = new Set([
  'WRITE_SCOPE_MISSING',
  'GOOGLE_CALENDAR_WRITE_NOT_GRANTED',
  'calendar_write_forbidden',
  'GOOGLE_WRITE_PERMISSION_MISSING',
]);

const TRANSIENT_HTTP_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

export function isTransientCalendarApiError(
  error: unknown,
  session?: CalendarAuthSessionSnapshot | null,
) {
  if (isConfirmedCalendarAuthFailure(error, session)) {
    return false;
  }

  const apiError = error instanceof ApiError ? error : null;

  if (!apiError) {
    const message = error instanceof Error ? error.message : String(error);

    return /fetch failed|network request failed|network error|timeout|timed out|econnrefused|enotfound|etimedout|socket hang up|failed to fetch|calendar request timed out|aborted/i.test(
      message,
    );
  }

  if (WRITE_SCOPE_ERROR_CODES.has(apiError.code ?? '')) {
    return false;
  }

  if (apiError.retryable) {
    return true;
  }

  if (apiError.status === 0 || apiError.status === undefined) {
    return true;
  }

  return TRANSIENT_HTTP_STATUSES.has(apiError.status) || apiError.status >= 500;
}

export type CalendarAuthSessionSnapshot = {
  hasLocalSession: boolean;
  hasRefreshToken: boolean;
  backendConnected: boolean;
};

export function isConfirmedCalendarAuthFailure(
  error: unknown,
  session?: CalendarAuthSessionSnapshot | null,
) {
  const apiError = error instanceof ApiError ? error : null;
  const message = (apiError?.message ?? (error instanceof Error ? error.message : String(error))).toLowerCase();
  const code = (apiError?.code ?? '').toLowerCase();

  if (HARD_AUTH_ERROR_CODES.has(code)) {
    return true;
  }

  if (/invalid_grant|invalid.?refresh|refresh.?token.*(invalid|expired|revoked)|token has been expired|token has been revoked/i.test(message)) {
    return true;
  }

  if (apiError?.status === 401 && /invalid_grant|invalid_token|expired|revoked/i.test(`${code} ${message}`)) {
    return true;
  }

  if (code === 'calendar_not_connected') {
    return !session?.hasRefreshToken;
  }

  if (/missing.?refresh|no refresh token/i.test(message)) {
    return true;
  }

  return false;
}

export function isCalendarReconnectRequired(
  error: unknown,
  session?: CalendarAuthSessionSnapshot | null,
) {
  return isConfirmedCalendarAuthFailure(error, session);
}

export function isCalendarWriteScopeFailure(error: unknown) {
  const apiError = error instanceof ApiError ? error : null;
  const code = apiError?.code ?? '';

  return (
    WRITE_SCOPE_ERROR_CODES.has(code) ||
    apiError?.status === 403 ||
    /write.?scope|calendar\.events/i.test(apiError?.message ?? '')
  );
}

export function isTransientCalendarToolErrorCode(errorCode: string | null | undefined) {
  if (!errorCode) {
    return false;
  }

  return (
    errorCode === 'CALENDAR_API_UNAVAILABLE' ||
    errorCode === 'CALENDAR_READ_FAILED' ||
    errorCode === 'CALENDAR_CONFIRMATION_TIMEOUT' ||
    errorCode === 'CALENDAR_OPERATION_IN_PROGRESS'
  );
}

export type CalendarApiOperationErrorKind = 'auth_required' | 'write_scope' | 'temporary' | 'logic';

export function classifyCalendarApiOperationError(
  error: unknown,
  session?: CalendarAuthSessionSnapshot | null,
): CalendarApiOperationErrorKind {
  if (isCalendarReconnectRequired(error, session)) {
    return 'auth_required';
  }

  if (isCalendarWriteScopeFailure(error)) {
    return 'write_scope';
  }

  if (isTransientCalendarApiError(error)) {
    return 'temporary';
  }

  return 'logic';
}
