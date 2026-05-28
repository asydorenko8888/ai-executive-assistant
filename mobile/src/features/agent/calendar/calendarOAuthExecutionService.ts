import {
  connectGoogleCalendarAccount,
  getGoogleCalendarConnection,
  GOOGLE_CALENDAR_WRITE_NOT_GRANTED_MESSAGE,
} from '@/src/features/agent/calendar/googleCalendarAuth';
import {
  resumeGoogleCalendarPendingActions,
  syncGoogleCalendarSessionToBackend,
} from '@/src/features/agent/calendar/googleCalendarBackendApi';
import { resolveCalendarWriteAccessState } from '@/src/features/agent/calendar/calendarWriteAccess';
import { loadGoogleCalendarSession } from '@/src/features/agent/calendar/googleCalendarStorage';
import { clearLocalPendingCalendarAction } from '@/src/features/agent/execution/pendingActionQueue';
import { logActionExecution } from '@/src/features/agent/execution/actionExecutionLogger';
import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';
import { getChatLocaleFromVoiceLanguage } from '@/src/features/chat/services/voiceLanguage';

export type CalendarOperationalUxPhase =
  | 'idle'
  | 'auth_required'
  | 'connecting'
  | 'authorized'
  | 'retrying'
  | 'creating_event'
  | 'verifying_event'
  | 'event_created'
  | 'failed';

export function buildCalendarAuthRequiredReply(languageCode: VoiceLanguageCode) {
  const locale = getChatLocaleFromVoiceLanguage(languageCode);

  if (locale === 'uk') {
    return 'Потрібен доступ до Google Calendar. Відкриваю авторизацію Google…';
  }

  if (locale === 'ru') {
    return 'Нужен доступ к Google Calendar. Открываю авторизацию Google…';
  }

  return 'Calendar access required. Opening Google authorization…';
}

export function buildCalendarConnectingLabel(languageCode: VoiceLanguageCode) {
  const locale = getChatLocaleFromVoiceLanguage(languageCode);

  if (locale === 'uk') {
    return 'Підключення Google Calendar…';
  }

  if (locale === 'ru') {
    return 'Подключение Google Calendar…';
  }

  return 'Connecting Google Calendar…';
}

export function buildCalendarRetryingLabel(languageCode: VoiceLanguageCode) {
  const locale = getChatLocaleFromVoiceLanguage(languageCode);

  if (locale === 'uk') {
    return 'Доступ надано. Повторюю створення події…';
  }

  if (locale === 'ru') {
    return 'Доступ получен. Повторяю создание встречи…';
  }

  return 'Authorized. Retrying event creation…';
}

export async function launchGoogleCalendarOAuthForExecution() {
  logActionExecution('execution_started', { phase: 'connecting', tool: 'google_calendar_oauth' });

  const result = await connectGoogleCalendarAccount();

  if (!result.success) {
    logActionExecution('execution_failed', {
      phase: 'connecting',
      reason: result.errorMessage ?? 'oauth_cancelled',
    });

    return {
      success: false as const,
      cancelled: true,
      errorMessage: result.errorMessage,
    };
  }

  const session = await loadGoogleCalendarSession();

  if (session) {
    await syncGoogleCalendarSessionToBackend(session).catch((error) => {
      console.log('[GoogleCalendar] backend session sync failed after OAuth', error);
    });
  }

  const access = await resolveCalendarWriteAccessState();

  logActionExecution('execution_result', {
    phase: 'authorized',
    connected: access.connected,
    hasWriteAccess: access.hasWriteAccess,
  });

  if (!access.writeEnabled) {
    return {
      success: false as const,
      cancelled: false,
      errorMessage: GOOGLE_CALENDAR_WRITE_NOT_GRANTED_MESSAGE,
      writeScopeGranted: false,
      connection: await getGoogleCalendarConnection(),
      hasWriteAccess: false,
    };
  }

  return {
    success: access.connected && access.writeEnabled,
    cancelled: false,
    connection: await getGoogleCalendarConnection(),
    hasWriteAccess: access.writeEnabled,
    writeScopeGranted: true,
  };
}

export async function runCalendarAuthAndResume(languageCode: VoiceLanguageCode) {
  const auth = await launchGoogleCalendarOAuthForExecution();

  if (!auth.success) {
    return null;
  }

  const resumed = await resumePendingCalendarActionAfterAuth(languageCode);

  if (!resumed) {
    return null;
  }

  const { buildOutcomeFromVerifiedBackendEvent } = await import(
    '@/src/features/agent/execution/calendarCreateEventExecutor'
  );

  return buildOutcomeFromVerifiedBackendEvent(languageCode, {
    id: resumed.event.id,
    summary: resumed.event.summary,
    location: resumed.event.location,
    startsAt: resumed.event.startsAt,
    endsAt: resumed.event.endsAt,
    htmlLink: resumed.event.htmlLink,
  });
}

export async function resumePendingCalendarActionAfterAuth(languageCode: VoiceLanguageCode) {
  logActionExecution('execution_started', { phase: 'retrying', tool: 'pending_action_resume' });

  const resumed = await resumeGoogleCalendarPendingActions().catch((error) => {
    console.log('[PendingAction] resume failed', error);
    return null;
  });

  if (!resumed?.event) {
    return null;
  }

  await clearLocalPendingCalendarAction();

  logActionExecution('execution_result', {
    phase: 'event_created',
    eventId: resumed.event.id,
    verified: resumed.verified,
  });

  return {
    event: {
      id: resumed.event.id,
      summary: resumed.event.summary,
      location: resumed.event.location,
      startsAt: resumed.event.startsAt,
      endsAt: resumed.event.endsAt,
      htmlLink: resumed.event.htmlLink,
    },
    transcript: resumed.transcript,
    languageCode: (resumed.languageCode as VoiceLanguageCode) || languageCode,
  };
}
