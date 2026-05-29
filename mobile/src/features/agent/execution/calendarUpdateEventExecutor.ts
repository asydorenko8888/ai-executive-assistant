import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';
import { findCalendarEventForUpdate } from '@/src/features/agent/calendar/calendarEventMatcher';
import { logUpdateSuccess } from '@/src/features/agent/calendarIntelligence/calendarReadDiagnostics';
import { logUpdateNotFound } from '@/src/features/agent/calendar/calendarUpdateResolutionDiagnostics';
import { refreshCalendarAgendaState } from '@/src/features/agent/calendar/calendarPostCreateRefresh';
import { updateGoogleCalendarEvent } from '@/src/features/agent/calendar/googleCalendarUpdateService';
import { resolveCalendarWriteAccessState } from '@/src/features/agent/calendar/calendarWriteAccess';
import { logCalendarDecision } from '@/src/features/agent/calendar/calendarDecisionLogger';
import {
  logCalendarUpdateFailed,
  logCalendarUpdateIntent,
  logUpdateExecutionStarted,
} from '@/src/features/agent/calendar/calendarUpdateLogger';
import { parseCalendarUpdateTimeShift } from '@/src/features/agent/calendar/calendarUpdateScheduleParser';
import { buildCalendarUpdateEventPayload } from '@/src/features/agent/execution/calendarUpdatePayloadBuilder';
import type { CalendarToolResponse } from '@/src/features/agent/execution/calendarToolContract';
import {
  createCalendarToolFailure,
  createCalendarToolPending,
} from '@/src/features/agent/execution/calendarToolContract';
import {
  buildCalendarUpdateToolReplyBundle,
  type CalendarUpdateToolReplyBundle,
} from '@/src/features/agent/execution/calendarUpdateToolResponses';
import {
  clearPendingCalendarUpdateIntent,
  endCalendarOperation,
  tryBeginCalendarOperation,
} from '@/src/features/agent/execution/calendarExecutionSession';

export type CalendarUpdateExecutionParams = {
  transcript: string;
  languageCode: VoiceLanguageCode;
  referenceNow: Date;
};

export type CalendarUpdateExecutionOutcome = CalendarUpdateToolReplyBundle & {
  verified: boolean;
};

export async function executeCalendarUpdateEvent(
  params: CalendarUpdateExecutionParams,
): Promise<CalendarUpdateExecutionOutcome> {
  logUpdateExecutionStarted({
    action: 'executeCalendarUpdateEvent',
    transcriptPreview: params.transcript.slice(0, 120),
  });
  logCalendarUpdateIntent({
    action: 'executeCalendarUpdateEvent',
    transcriptPreview: params.transcript.slice(0, 120),
  });

  const shift = parseCalendarUpdateTimeShift(params.transcript, params.referenceNow);

  if (!shift.ok) {
    const tool = createCalendarToolFailure('CALENDAR_DATE_PARSE_FAILED', shift.detail);
    return {
      ...buildCalendarUpdateToolReplyBundle(tool, params.languageCode, {
        referenceNow: params.referenceNow,
      }),
      verified: false,
    };
  }

  const access = await resolveCalendarWriteAccessState();

  logCalendarDecision('writeAvailable', {
    canReadCalendar: access.canReadCalendar,
    canWriteCalendar: access.canWriteCalendar,
  });

  if (!access.canReadCalendar) {
    const tool = createCalendarToolPending('CALENDAR_AUTH_REQUIRED', 'CALENDAR_AUTH_REQUIRED');
    return {
      ...buildCalendarUpdateToolReplyBundle(tool, params.languageCode, {
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
      ...buildCalendarUpdateToolReplyBundle(tool, params.languageCode, {
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
      ...buildCalendarUpdateToolReplyBundle(tool, params.languageCode, {
        referenceNow: params.referenceNow,
      }),
      verified: false,
    };
  }

  try {
    const matchResult = await findCalendarEventForUpdate({
      transcript: params.transcript,
      referenceNow: params.referenceNow,
      fromMs: shift.fromMs,
    });

    if (!matchResult.match) {
      endCalendarOperation({ failed: true });

      const formatClock = (ms: number) => {
        const date = new Date(ms);
        const pad = (value: number) => String(value).padStart(2, '0');
        return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
      };

      logUpdateNotFound({
        requestedTitle: matchResult.titleQuery,
        requestedFromTime: formatClock(shift.fromMs),
        requestedToTime: formatClock(shift.toMs),
      });

      const tool = createCalendarToolFailure(
        'CALENDAR_EVENT_NOT_FOUND',
        'Could not find a matching calendar event to update.',
      );
      return {
        ...buildCalendarUpdateToolReplyBundle(tool, params.languageCode, {
          referenceNow: params.referenceNow,
        }),
        verified: false,
      };
    }

    const payloadResult = buildCalendarUpdateEventPayload({
      transcript: params.transcript,
      languageCode: params.languageCode,
      referenceNow: params.referenceNow,
      matchedEvent: matchResult.match,
    });

    if (!payloadResult.ok) {
      endCalendarOperation({ failed: true });
      const tool = createCalendarToolFailure(
        payloadResult.reason === 'date_parse_failed'
          ? 'CALENDAR_DATE_PARSE_FAILED'
          : payloadResult.reason === 'title_parse_failed'
            ? 'CALENDAR_DATE_PARSE_FAILED'
            : 'CALENDAR_EVENT_NOT_FOUND',
        payloadResult.detail,
      );
      return {
        ...buildCalendarUpdateToolReplyBundle(tool, params.languageCode, {
          referenceNow: params.referenceNow,
        }),
        verified: false,
      };
    }

    logCalendarUpdateIntent({
      eventId: payloadResult.eventId,
      title: matchResult.match.title,
      fromMs: shift.fromMs,
      toMs: shift.toMs,
    });

    const tool: CalendarToolResponse = await updateGoogleCalendarEvent(
      payloadResult.eventId,
      payloadResult.payload,
    );

    if (tool.status === 'SUCCESS') {
      logUpdateSuccess({
        eventId: payloadResult.eventId,
        title: matchResult.match.title,
        fromStart: matchResult.match.startsAt,
        toStart: payloadResult.payload.start.dateTime ?? matchResult.match.startsAt,
      });
      await refreshCalendarAgendaState(params.referenceNow).catch((error) => {
        console.log('[Calendar Refresh] post-update refresh failed', error);
      });
      clearPendingCalendarUpdateIntent();
      endCalendarOperation({ failed: false });
      return {
        ...buildCalendarUpdateToolReplyBundle(tool, params.languageCode, {
          referenceNow: params.referenceNow,
        }),
        verified: tool.verified,
      };
    }

    endCalendarOperation({ failed: true });
    logCalendarUpdateFailed({
      reason: 'executor_tool_failure',
      errorCode: tool.errorCode ?? null,
      error: tool.error ?? null,
    });
    clearPendingCalendarUpdateIntent();
    return {
      ...buildCalendarUpdateToolReplyBundle(tool, params.languageCode, {
        referenceNow: params.referenceNow,
      }),
      verified: false,
    };
  } catch (error) {
    endCalendarOperation({ failed: true });
    clearPendingCalendarUpdateIntent();
    logCalendarUpdateFailed({
      reason: 'executor_exception',
      message: error instanceof Error ? error.message : 'Calendar update error',
    });
    const message = error instanceof Error ? error.message : 'Calendar update error';
    const failureTool = createCalendarToolFailure('CALENDAR_OPERATION_ERROR', message);
    return {
      ...buildCalendarUpdateToolReplyBundle(failureTool, params.languageCode, {
        referenceNow: params.referenceNow,
      }),
      verified: false,
    };
  }
}
