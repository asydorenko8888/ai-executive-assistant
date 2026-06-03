import {
  classifyCalendarApiOperationError,
  isTransientCalendarApiError,
  type CalendarAuthSessionSnapshot,
} from '@/src/features/agent/calendar/calendarApiErrorClassification';
import {
  logCalendarApiStability,
  type CalendarApiOperationType,
} from '@/src/features/agent/calendar/calendarApiStabilityLogger';
import { apiClient } from '@/src/shared/api';
import { ApiError, toApiError } from '@/src/shared/api/api-error';
import type { HttpMethod } from '@/src/shared/api/request';

export const CALENDAR_BACKEND_REQUEST_TIMEOUT_MS = 12_000;
export const CALENDAR_BACKEND_MAX_ATTEMPTS = 4;
const RETRY_BACKOFF_MS = [400, 800, 1600];

async function readCalendarAuthSessionSnapshot(): Promise<CalendarAuthSessionSnapshot> {
  const { loadGoogleCalendarSession } = await import(
    '@/src/features/agent/calendar/googleCalendarStorage'
  );
  const session = await loadGoogleCalendarSession();

  return {
    hasLocalSession: Boolean(session?.accessToken || session?.refreshToken),
    hasRefreshToken: Boolean(session?.refreshToken),
    backendConnected: false,
  };
}

function logCalendarApiFailure(params: {
  operation: CalendarApiOperationType;
  action: string;
  attempt: number;
  httpStatus?: number;
  errorCode: string;
  retryable: boolean;
  message: string;
  authSession: CalendarAuthSessionSnapshot;
}) {
  console.log('[Calendar API Failure]', {
    operation: params.operation,
    action: params.action,
    attempt: params.attempt,
    httpStatus: params.httpStatus ?? null,
    errorCode: params.errorCode,
    retryable: params.retryable,
    message: params.message.slice(0, 160),
    hasLocalSession: params.authSession.hasLocalSession,
    hasRefreshToken: params.authSession.hasRefreshToken,
    backendConnected: params.authSession.backendConnected,
    at: new Date().toISOString(),
  });
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function normalizeCalendarApiError(error: unknown) {
  const apiError = toApiError(error);

  if (error instanceof ApiError) {
    return apiError;
  }

  if (apiError.name === 'AbortError' || /aborted|timeout/i.test(apiError.message)) {
    return new ApiError({
      message: 'Calendar request timed out',
      status: 408,
      code: 'calendar_request_timeout',
      retryable: true,
    });
  }

  if (apiError.status === 0) {
    return new ApiError({
      message: apiError.message || 'Calendar network request failed',
      status: 0,
      retryable: true,
    });
  }

  const retryable = isTransientCalendarApiError(apiError);

  return new ApiError({
    message: apiError.message,
    status: apiError.status,
    code: apiError.code,
    details: apiError.details,
    retryable,
  });
}

export async function calendarBackendRequest<TResponse, TBody = unknown>(params: {
  operation: CalendarApiOperationType;
  action: string;
  method: HttpMethod;
  path: string;
  body?: TBody;
}) {
  let lastError: ApiError | null = null;
  const authSession = await readCalendarAuthSessionSnapshot();

  for (let attempt = 0; attempt < CALENDAR_BACKEND_MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CALENDAR_BACKEND_REQUEST_TIMEOUT_MS);

    logCalendarApiStability({
      operation: params.operation,
      action: params.action,
      phase: attempt === 0 ? 'start' : 'retry',
      attempt: attempt + 1,
    });

    try {
      const response = await apiClient.request<TResponse, TBody>(params.method, {
        path: params.path,
        body: params.body,
        signal: controller.signal,
      });

      logCalendarApiStability({
        operation: params.operation,
        action: params.action,
        phase: 'success',
        attempt: attempt + 1,
        httpStatus: 200,
        calendarChanged: params.operation === 'create' || params.operation === 'update' || params.operation === 'delete',
      });

      return response;
    } catch (error) {
      const apiError = normalizeCalendarApiError(error);
      lastError = apiError;
      const retryable = isTransientCalendarApiError(apiError, authSession);
      const hasMoreAttempts = attempt + 1 < CALENDAR_BACKEND_MAX_ATTEMPTS;

      logCalendarApiFailure({
        operation: params.operation,
        action: params.action,
        attempt: attempt + 1,
        httpStatus: apiError.status,
        errorCode: apiError.code ?? classifyCalendarApiOperationError(apiError, authSession),
        retryable,
        message: apiError.message,
        authSession,
      });

      if (!retryable || !hasMoreAttempts) {
        throw apiError;
      }

      await sleep(RETRY_BACKOFF_MS[attempt] ?? RETRY_BACKOFF_MS[RETRY_BACKOFF_MS.length - 1] ?? 900);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw lastError ?? new ApiError({ message: 'Calendar request failed', status: 0, retryable: true });
}
