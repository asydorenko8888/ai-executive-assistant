const CALENDAR_API_TIMEOUT_MS = 15_000;
const CALENDAR_API_MAX_ATTEMPTS = 3;
const RETRY_BACKOFF_MS = [400, 900];
const TRANSIENT_HTTP_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isTransientGoogleCalendarStatus(status?: number) {
  if (status === undefined || status === 0) {
    return true;
  }

  return TRANSIENT_HTTP_STATUSES.has(status) || status >= 500;
}

function isConfirmedGoogleAuthFailure(status?: number, message?: string) {
  const normalized = (message ?? '').toLowerCase();

  if (/invalid_grant|invalid.?refresh|refresh.?token.*(invalid|expired|revoked)/i.test(normalized)) {
    return true;
  }

  return status === 401 && /invalid_grant|invalid_token|expired|revoked/i.test(normalized);
}

export type GoogleCalendarApiResult<T> =
  | { ok: true; body: T; status: number; attempts: number }
  | {
      ok: false;
      timedOut: boolean;
      status?: number;
      message: string;
      rawBody?: unknown;
      attempts: number;
      authFailure: boolean;
    };

export async function fetchGoogleCalendarApiJson<T>(params: {
  url: string;
  init: RequestInit;
  label: string;
  operation: 'read' | 'create' | 'update' | 'delete';
}): Promise<GoogleCalendarApiResult<T>> {
  let lastResult: GoogleCalendarApiResult<T> | null = null;

  for (let attempt = 0; attempt < CALENDAR_API_MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CALENDAR_API_TIMEOUT_MS);

    console.log('[GoogleCalendar API]', {
      operation: params.operation,
      action: params.label,
      phase: attempt === 0 ? 'start' : 'retry',
      attempt: attempt + 1,
      at: new Date().toISOString(),
    });

    try {
      const response = await fetch(params.url, {
        ...params.init,
        signal: controller.signal,
      });
      const isDeleteOperation = params.operation === 'delete';
      const isEmptySuccess =
        response.status === 204 ||
        response.status === 205 ||
        response.headers.get('content-length') === '0';
      const rawBody = isEmptySuccess
        ? ({} as T)
        : ((await response.json().catch(() => ({}))) as T);
      const body = rawBody as T & { error?: { message?: string; code?: number } };
      const httpOk =
        response.ok || response.status === 204 || response.status === 200;

      if (isDeleteOperation) {
        console.log('[delete_event_response]', {
          status: response.status,
          ok: httpOk,
        });
      }

      console.log('[GoogleCalendar API]', {
        operation: params.operation,
        action: params.label,
        phase: httpOk ? 'success' : 'error',
        attempt: attempt + 1,
        httpStatus: response.status,
        ok: httpOk,
        calendarChanged: params.operation !== 'read' && httpOk,
      });

      if (!httpOk) {
        const message =
          typeof body.error === 'object' && body.error?.message
            ? body.error.message
            : response.statusText || `${params.label} failed`;
        const authFailure = isConfirmedGoogleAuthFailure(response.status, message);
        const result: GoogleCalendarApiResult<T> = {
          ok: false,
          timedOut: false,
          status: response.status,
          message,
          rawBody,
          attempts: attempt + 1,
          authFailure,
        };
        lastResult = result;

        if (!isTransientGoogleCalendarStatus(response.status) || authFailure || attempt + 1 >= CALENDAR_API_MAX_ATTEMPTS) {
          return result;
        }

        await sleep(RETRY_BACKOFF_MS[attempt] ?? 900);
        continue;
      }

      if (isDeleteOperation && (response.status === 204 || response.status === 200)) {
        console.log('[delete_event_success]', {
          status: response.status,
        });
      }

      return { ok: true, body, status: response.status, attempts: attempt + 1 };
    } catch (error) {
      const timedOut = error instanceof Error && error.name === 'AbortError';

      console.log('[GoogleCalendar API]', {
        operation: params.operation,
        action: params.label,
        phase: 'error',
        attempt: attempt + 1,
        timedOut,
        message: error instanceof Error ? error.message : error,
        calendarChanged: false,
      });

      const result: GoogleCalendarApiResult<T> = {
        ok: false,
        timedOut,
        message: timedOut ? 'Google Calendar API timeout' : 'Google Calendar network error',
        attempts: attempt + 1,
        authFailure: false,
      };
      lastResult = result;

      if (attempt + 1 >= CALENDAR_API_MAX_ATTEMPTS) {
        return result;
      }

      await sleep(RETRY_BACKOFF_MS[attempt] ?? 900);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  return (
    lastResult ?? {
      ok: false,
      timedOut: false,
      message: 'Google Calendar API failed',
      attempts: CALENDAR_API_MAX_ATTEMPTS,
      authFailure: false,
    }
  );
}
