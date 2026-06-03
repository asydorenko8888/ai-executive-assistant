import {
  classifyCalendarApiOperationError,
  isCalendarReconnectRequired,
  type CalendarAuthSessionSnapshot,
} from '@/src/features/agent/calendar/calendarApiErrorClassification';
import { buildCalendarApiUnavailableReply } from '@/src/features/agent/calendar/calendarAuthUserReplies';
import {
  createCalendarToolFailure,
  createCalendarToolPending,
  type CalendarToolResponse,
} from '@/src/features/agent/execution/calendarToolContract';
import { logExecutionAudit } from '@/src/features/agent/execution/executionAuditLogger';
import { ApiError, toApiError } from '@/src/shared/api/api-error';
import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';

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

export async function mapCaughtCalendarApiError(params: {
  error: unknown;
  languageCode: VoiceLanguageCode;
  action: string;
  calendarChanged?: boolean;
  authSession?: CalendarAuthSessionSnapshot;
}): Promise<CalendarToolResponse> {
  const apiError = toApiError(params.error);
  const code = apiError.code;
  const authSession = params.authSession ?? (await readCalendarAuthSessionSnapshot());
  const kind = classifyCalendarApiOperationError(apiError, authSession);

  logExecutionAudit('api_response', {
    ok: false,
    action: params.action,
    status: apiError.status,
    code,
    kind,
    calendarChanged: params.calendarChanged ?? false,
    message: apiError.message,
    hasRefreshToken: authSession.hasRefreshToken,
    hasLocalSession: authSession.hasLocalSession,
  });

  if (kind === 'auth_required' || isCalendarReconnectRequired(apiError, authSession)) {
    return createCalendarToolPending(
      'CALENDAR_AUTH_REQUIRED',
      'Google Calendar session requires reconnect.',
    );
  }

  if (kind === 'write_scope') {
    const detail =
      code === 'GOOGLE_CALENDAR_WRITE_NOT_GRANTED'
        ? apiError.message || 'Google Calendar write permission was not granted.'
        : 'WRITE_SCOPE_MISSING: https://www.googleapis.com/auth/calendar.events';

    return createCalendarToolFailure(
      code === 'GOOGLE_CALENDAR_WRITE_NOT_GRANTED' ? 'GOOGLE_CALENDAR_WRITE_NOT_GRANTED' : 'WRITE_SCOPE_MISSING',
      detail,
    );
  }

  if (code === 'VERIFY_FAILED') {
    return createCalendarToolFailure('VERIFY_FAILED', apiError.message || 'VERIFY_FAILED');
  }

  if (code === 'CALENDAR_EVENT_NOT_FOUND') {
    return createCalendarToolFailure('CALENDAR_EVENT_NOT_FOUND', apiError.message || 'Event not found.');
  }

  if (code === 'calendar_confirmation_timeout' || apiError.status === 408) {
    return createCalendarToolFailure(
      'CALENDAR_API_UNAVAILABLE',
      buildCalendarApiUnavailableReply(params.languageCode),
    );
  }

  if (kind === 'temporary' || apiError instanceof ApiError) {
    return createCalendarToolFailure(
      'CALENDAR_API_UNAVAILABLE',
      buildCalendarApiUnavailableReply(params.languageCode),
    );
  }

  return createCalendarToolFailure(
    'CALENDAR_API_UNAVAILABLE',
    buildCalendarApiUnavailableReply(params.languageCode),
  );
}
