import type { VerifiedCalendarEvent } from '@/src/features/agent/execution/actionExecutionTypes';
import type { CalendarExecutionState } from '@/src/features/agent/execution/calendarExecutionStates';
import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';
import { formatVerifiedEventScheduleLabel } from '@/src/features/agent/execution/calendarEventPayloadBuilder';

export type OperationalTruthFact =
  | {
      kind: 'calendar_create_verified';
      event: VerifiedCalendarEvent;
      dayLabel: string;
      timeLabel: string;
      locationLine: string | null;
    }
  | {
      kind: 'calendar_create_failed';
      reason: 'insert_failed' | 'verification_failed' | 'timeout' | 'api_error' | 'auth_required';
      errorMessage?: string;
    }
  | {
      kind: 'calendar_create_pending_confirmation';
      summary: string;
      dayLabel: string;
      timeLabel: string;
      locationLine: string | null;
    }
  | {
      kind: 'calendar_create_authenticating';
    }
  | {
      kind: 'calendar_parse_failed';
    };

export function buildOperationalTruthFact(params: {
  executionState: CalendarExecutionState;
  verified: boolean;
  event?: VerifiedCalendarEvent;
  languageCode: VoiceLanguageCode;
  errorCode?: string;
  pendingSummary?: string;
  pendingSchedule?: { startsAt: string; location?: string };
}): OperationalTruthFact {
  if (params.executionState === 'authenticating' || params.errorCode === 'calendar_auth_required') {
    return { kind: 'calendar_create_authenticating' };
  }

  if (params.executionState === 'parsing' || params.errorCode === 'date_parse_failed') {
    return { kind: 'calendar_parse_failed' };
  }

  if (params.executionState === 'pending_confirmation' && params.pendingSummary) {
    const labels = params.pendingSchedule
      ? formatVerifiedEventScheduleLabel(
          {
            startsAt: params.pendingSchedule.startsAt,
            location: params.pendingSchedule.location,
          },
          params.languageCode,
        )
      : { dayLine: '', timeLine: '', locationLine: null };

    return {
      kind: 'calendar_create_pending_confirmation',
      summary: params.pendingSummary,
      dayLabel: labels.dayLine,
      timeLabel: labels.timeLine,
      locationLine: labels.locationLine,
    };
  }

  if (params.executionState === 'success' && params.verified && params.event) {
    const labels = formatVerifiedEventScheduleLabel(params.event, params.languageCode);

    return {
      kind: 'calendar_create_verified',
      event: params.event,
      dayLabel: labels.dayLine,
      timeLabel: labels.timeLine,
      locationLine: labels.locationLine,
    };
  }

  const reason =
    params.errorCode === 'calendar_confirmation_timeout'
      ? 'timeout'
      : params.errorCode === 'calendar_auth_required' ||
          params.errorCode === 'calendar_not_connected' ||
          params.errorCode === 'calendar_write_forbidden'
        ? 'auth_required'
        : params.errorCode === 'calendar_verification_failed'
          ? 'verification_failed'
          : 'api_error';

  return {
    kind: 'calendar_create_failed',
    reason,
    errorMessage: params.errorCode,
  };
}
