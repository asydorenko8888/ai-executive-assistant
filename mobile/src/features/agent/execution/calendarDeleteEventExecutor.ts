import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';
import { resolveCalendarDeleteTarget } from '@/src/features/agent/calendar/calendarDeleteEventResolver';
import { refreshCalendarAgendaState } from '@/src/features/agent/calendar/calendarPostCreateRefresh';
import { deleteGoogleCalendarEvent } from '@/src/features/agent/calendar/googleCalendarDeleteService';
import { resolveCalendarWriteAccessState } from '@/src/features/agent/calendar/calendarWriteAccess';
import { logCalendarDecision } from '@/src/features/agent/calendar/calendarDecisionLogger';
import { logCalendarCreate } from '@/src/features/agent/execution/calendarCreateLogger';
import type { CalendarToolResponse } from '@/src/features/agent/execution/calendarToolContract';
import {
  createCalendarToolFailure,
  createCalendarToolPending,
} from '@/src/features/agent/execution/calendarToolContract';
import {
  buildCalendarDeleteToolReplyBundle,
  type CalendarDeleteToolReplyBundle,
} from '@/src/features/agent/execution/calendarDeleteToolResponses';
import {
  endCalendarOperation,
  tryBeginCalendarOperation,
} from '@/src/features/agent/execution/calendarExecutionSession';

export type CalendarDeleteExecutionParams = {
  transcript: string;
  languageCode: VoiceLanguageCode;
  referenceNow: Date;
};

export type CalendarDeleteExecutionOutcome = CalendarDeleteToolReplyBundle & {
  verified: boolean;
};

export async function executeCalendarDeleteEvent(
  params: CalendarDeleteExecutionParams,
): Promise<CalendarDeleteExecutionOutcome> {
  logCalendarCreate('routing', {
    action: 'executeCalendarDeleteEvent',
    transcriptPreview: params.transcript.slice(0, 120),
  });

  const access = await resolveCalendarWriteAccessState();

  logCalendarDecision('writeAvailable', {
    canReadCalendar: access.canReadCalendar,
    canWriteCalendar: access.canWriteCalendar,
  });

  if (!access.canReadCalendar) {
    const tool = createCalendarToolPending('CALENDAR_AUTH_REQUIRED', 'CALENDAR_AUTH_REQUIRED');
    return {
      ...buildCalendarDeleteToolReplyBundle(tool, params.languageCode, {
        referenceNow: params.referenceNow,
      }),
      verified: false,
    };
  }

  if (!access.canWriteCalendar) {
    const tool = createCalendarToolFailure(
      'WRITE_SCOPE_MISSING',
      'WRITE_SCOPE_MISSING: reconnect Google Calendar and grant event write access (calendar.events).',
    );
    return {
      ...buildCalendarDeleteToolReplyBundle(tool, params.languageCode, {
        referenceNow: params.referenceNow,
      }),
      verified: false,
    };
  }

  if (!tryBeginCalendarOperation(params.transcript)) {
    const tool = createCalendarToolFailure(
      'CALENDAR_OPERATION_IN_PROGRESS',
      'Calendar operation already in progress.',
    );
    return {
      ...buildCalendarDeleteToolReplyBundle(tool, params.languageCode, {
        referenceNow: params.referenceNow,
      }),
      verified: false,
    };
  }

  try {
    const resolution = await resolveCalendarDeleteTarget({
      transcript: params.transcript,
      referenceNow: params.referenceNow,
    });

    if (resolution.status === 'not_found') {
      endCalendarOperation({ failed: true });
      const tool = createCalendarToolFailure(
        'CALENDAR_EVENT_NOT_FOUND',
        'Could not find a matching calendar event to delete.',
      );
      return {
        ...buildCalendarDeleteToolReplyBundle(tool, params.languageCode, {
          referenceNow: params.referenceNow,
        }),
        verified: false,
      };
    }

    if (resolution.status === 'ambiguous') {
      endCalendarOperation({ failed: true });
      const tool = createCalendarToolFailure(
        'CALENDAR_EVENT_AMBIGUOUS',
        'Multiple matching calendar events found.',
      );
      return {
        ...buildCalendarDeleteToolReplyBundle(tool, params.languageCode, {
          referenceNow: params.referenceNow,
        }),
        verified: false,
      };
    }

    if (resolution.status === 'recurring_not_supported') {
      endCalendarOperation({ failed: true });
      const tool = createCalendarToolFailure(
        'CALENDAR_RECURRING_NOT_SUPPORTED',
        'Recurring calendar event deletion is not supported yet.',
      );
      return {
        ...buildCalendarDeleteToolReplyBundle(tool, params.languageCode, {
          referenceNow: params.referenceNow,
        }),
        verified: false,
      };
    }

    if (resolution.status === 'all_day_not_supported') {
      endCalendarOperation({ failed: true });
      const tool = createCalendarToolFailure(
        'CALENDAR_ALL_DAY_NOT_SUPPORTED',
        'All-day calendar event deletion is not supported yet.',
      );
      return {
        ...buildCalendarDeleteToolReplyBundle(tool, params.languageCode, {
          referenceNow: params.referenceNow,
        }),
        verified: false,
      };
    }

    logCalendarCreate('delete match', {
      eventId: resolution.event.id,
      title: resolution.event.title,
      startsAt: resolution.event.startsAt,
    });

    const tool: CalendarToolResponse = await deleteGoogleCalendarEvent(resolution.event.id);

    if (tool.status === 'SUCCESS') {
      await refreshCalendarAgendaState(params.referenceNow).catch((error) => {
        console.log('[Calendar Refresh] post-delete refresh failed', error);
      });
      endCalendarOperation({ failed: false });
      return {
        ...buildCalendarDeleteToolReplyBundle(tool, params.languageCode, {
          referenceNow: params.referenceNow,
        }),
        verified: tool.verified,
      };
    }

    endCalendarOperation({ failed: true });
    return {
      ...buildCalendarDeleteToolReplyBundle(tool, params.languageCode, {
        referenceNow: params.referenceNow,
      }),
      verified: false,
    };
  } catch (error) {
    endCalendarOperation({ failed: true });
    const message = error instanceof Error ? error.message : 'Calendar delete error';
    const tool = createCalendarToolFailure('CALENDAR_OPERATION_ERROR', message);
    return {
      ...buildCalendarDeleteToolReplyBundle(tool, params.languageCode, {
        referenceNow: params.referenceNow,
      }),
      verified: false,
    };
  }
}
