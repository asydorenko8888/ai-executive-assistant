import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';
import { resolveCalendarDeleteTarget } from '@/src/features/agent/calendar/calendarDeleteEventResolver';
import {
  calendarEventsToDisambiguationCandidates,
} from '@/src/features/agent/calendar/calendarEventDisambiguation';
import {
  pendingDeleteContextFromResolution,
} from '@/src/features/agent/calendar/calendarDeletePendingContext';
import { syncConversationStateForDeleteSelection } from '@/src/features/agent/calendar/calendarConversationSync';
import {
  logCalendarMutationStart,
  logCalendarMutationVerification,
} from '@/src/features/agent/calendar/calendarMutationDiagnostics';
import { recordVerifiedCalendarEventContext } from '@/src/features/agent/calendar/calendarMutationEventContext';
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
  clearPendingCalendarDeleteIntent,
  endCalendarOperation,
  setPendingCalendarDeleteContext,
  tryBeginCalendarOperation,
} from '@/src/features/agent/execution/calendarExecutionSession';

export type CalendarDeleteExecutionParams = {
  transcript: string;
  languageCode: VoiceLanguageCode;
  referenceNow: Date;
  selectedEventId?: string | null;
};

async function finalizeVerifiedDelete(params: {
  event: { id: string; title: string; startsAt: string; endsAt: string };
  tool: CalendarToolResponse;
  languageCode: VoiceLanguageCode;
  referenceNow: Date;
}): Promise<CalendarDeleteExecutionOutcome> {
  if (params.tool.status === 'SUCCESS' && params.tool.verified) {
    clearPendingCalendarDeleteIntent();
    endCalendarOperation({ failed: false });
    recordVerifiedCalendarEventContext({
      eventId: params.event.id,
      title: params.event.title,
      startISO: params.event.startsAt,
      endISO: params.event.endsAt,
      actionType: 'delete',
      clearPendingReason: 'delete_completed',
      referenceNow: params.referenceNow,
      languageCode: params.languageCode,
    });
    logCalendarMutationVerification({
      intent: 'delete_calendar_event',
      verified: true,
      verificationFetched: params.tool.verificationFetched,
      eventId: params.tool.eventId ?? null,
    });

    return {
      ...buildCalendarDeleteToolReplyBundle(params.tool, params.languageCode, {
        referenceNow: params.referenceNow,
      }),
      verified: true,
    };
  }

  endCalendarOperation({ failed: true });

  return {
    ...buildCalendarDeleteToolReplyBundle(params.tool, params.languageCode, {
      referenceNow: params.referenceNow,
    }),
    verified: false,
  };
}

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
  logCalendarMutationStart({
    intent: 'delete_calendar_event',
    originalCommand: params.transcript,
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
    if (params.selectedEventId) {
      const tool = await deleteGoogleCalendarEvent(params.selectedEventId, params.languageCode);

      return finalizeVerifiedDelete({
        event: {
          id: params.selectedEventId,
          title: tool.event?.summary ?? '',
          startsAt: tool.event?.startsAt ?? '',
          endsAt: tool.event?.endsAt ?? '',
        },
        tool,
        languageCode: params.languageCode,
        referenceNow: params.referenceNow,
      });
    }

    const resolution = await resolveCalendarDeleteTarget({
      transcript: params.transcript,
      referenceNow: params.referenceNow,
    });

    if (resolution.status === 'fetch_failed') {
      endCalendarOperation({ failed: true });
      const tool = createCalendarToolFailure(
        'CALENDAR_READ_FAILED',
        'Could not refresh Google Calendar before delete.',
      );
      logCalendarMutationVerification({
        intent: 'delete_calendar_event',
        verified: false,
        verificationFetched: false,
        eventId: null,
        detail: 'fresh_read_failed',
      });
      return {
        ...buildCalendarDeleteToolReplyBundle(tool, params.languageCode, {
          referenceNow: params.referenceNow,
        }),
        verified: false,
      };
    }

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
      endCalendarOperation({ failed: false });
      const candidates = calendarEventsToDisambiguationCandidates(
        resolution.candidates.map((entry) => entry.event),
      );
      const pendingDelete = pendingDeleteContextFromResolution({
        sourceTranscript: params.transcript,
        titleQuery: resolution.titleQuery,
        candidates,
      });
      setPendingCalendarDeleteContext(pendingDelete);
      syncConversationStateForDeleteSelection(pendingDelete, params.languageCode);
      const tool = createCalendarToolFailure(
        'CALENDAR_EVENT_AMBIGUOUS',
        'Multiple matching calendar events found.',
      );
      logCalendarMutationVerification({
        intent: 'delete_calendar_event',
        verified: false,
        verificationFetched: false,
        eventId: null,
        detail: 'ambiguous_candidates',
      });
      return {
        ...buildCalendarDeleteToolReplyBundle(tool, params.languageCode, {
          referenceNow: params.referenceNow,
          disambiguationCandidates: candidates,
          eventTitle: resolution.titleQuery,
        }),
        verified: false,
      };
    }

    if (resolution.status === 'delete_all') {
      let lastTool: CalendarToolResponse | null = null;

      for (const event of resolution.events) {
        lastTool = await deleteGoogleCalendarEvent(event.id);

        if (lastTool.status !== 'SUCCESS' || !lastTool.verified) {
          endCalendarOperation({ failed: true });
          return {
            ...buildCalendarDeleteToolReplyBundle(lastTool, params.languageCode, {
              referenceNow: params.referenceNow,
            }),
            verified: false,
          };
        }

        recordVerifiedCalendarEventContext({
          eventId: event.id,
          title: event.title,
          startISO: event.startsAt,
          endISO: event.endsAt,
          actionType: 'delete',
          clearPendingReason: 'delete_all_completed',
          referenceNow: params.referenceNow,
          languageCode: params.languageCode,
        });
      }

      clearPendingCalendarDeleteIntent();
      endCalendarOperation({ failed: false });

      if (!lastTool) {
        const tool = createCalendarToolFailure('CALENDAR_EVENT_NOT_FOUND', 'No events to delete.');
        return {
          ...buildCalendarDeleteToolReplyBundle(tool, params.languageCode, {
            referenceNow: params.referenceNow,
          }),
          verified: false,
        };
      }

      return finalizeVerifiedDelete({
        event: {
          id: lastTool.eventId ?? resolution.events.at(-1)!.id,
          title: lastTool.event?.summary ?? resolution.titleQuery,
          startsAt: lastTool.event?.startsAt ?? '',
          endsAt: lastTool.event?.endsAt ?? '',
        },
        tool: lastTool,
        languageCode: params.languageCode,
        referenceNow: params.referenceNow,
      });
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

    const tool: CalendarToolResponse = await deleteGoogleCalendarEvent(resolution.event.id, params.languageCode);

    return finalizeVerifiedDelete({
      event: resolution.event,
      tool,
      languageCode: params.languageCode,
      referenceNow: params.referenceNow,
    });
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
