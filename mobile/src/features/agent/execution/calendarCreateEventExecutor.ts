import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';
import { createGoogleCalendarEvent } from '@/src/features/agent/calendar/googleCalendarWriteService';
import { resolveCalendarWriteAccessState } from '@/src/features/agent/calendar/calendarWriteAccess';
import {
  buildCalendarAuthRequiredReply,
  type CalendarOperationalUxPhase,
} from '@/src/features/agent/calendar/calendarOAuthExecutionService';
import { buildCalendarCreateEventPayload } from '@/src/features/agent/execution/calendarEventPayloadBuilder';
import type { ActionExecutionResult } from '@/src/features/agent/execution/actionExecutionTypes';
import type { CalendarExecutionState } from '@/src/features/agent/execution/calendarExecutionStates';
import { mayAssistantClaimCalendarSuccess } from '@/src/features/agent/execution/calendarExecutionStates';
import { logExecutionAudit, logCalendarExecutionStateTransition } from '@/src/features/agent/execution/executionAuditLogger';
import { assertNoFakeOperationalSuccess } from '@/src/features/agent/execution/operationalExecutionHonesty';
import { enqueueCalendarCreateAction } from '@/src/features/agent/execution/pendingActionQueue';
import { buildOperationalTruthFact } from '@/src/features/agent/execution/operationalTruthFacts';
import { buildOperationalTruthReply } from '@/src/features/agent/execution/operationalTruthReplies';
import { buildOperationalVoiceReply } from '@/src/features/agent/execution/operationalVoiceLayer';

export type CalendarCreateExecutionParams = {
  transcript: string;
  languageCode: VoiceLanguageCode;
  calendarConnected: boolean;
  referenceNow: Date;
};

export type CalendarCreateExecutionOutcome = {
  result: ActionExecutionResult;
  reply: string;
  spokenReply: string;
  executionState: CalendarExecutionState;
  scheduleIso?: string | null;
  requiresCalendarAuth?: boolean;
  operationalUxPhase?: CalendarOperationalUxPhase;
  pendingActionId?: string;
  verified: boolean;
};

function mapUxPhase(state: CalendarExecutionState): CalendarOperationalUxPhase {
  if (state === 'authenticating') {
    return 'connecting';
  }

  if (state === 'verifying_event') {
    return 'verifying_event';
  }

  if (state === 'creating_event') {
    return 'creating_event';
  }

  if (state === 'success') {
    return 'event_created';
  }

  if (state === 'failed') {
    return 'failed';
  }

  return 'idle';
}

function buildOutcome(params: {
  executionState: CalendarExecutionState;
  verified: boolean;
  languageCode: VoiceLanguageCode;
  errorCode?: string;
  event?: ActionExecutionResult['event'];
  requiresCalendarAuth?: boolean;
  pendingActionId?: string;
  scheduleIso?: string | null;
}): CalendarCreateExecutionOutcome {
  const fact = buildOperationalTruthFact({
    executionState: params.executionState,
    verified: params.verified,
    event: params.event,
    languageCode: params.languageCode,
    errorCode: params.errorCode,
  });

  const reply = buildOperationalTruthReply(fact, params.languageCode);
  const spokenReply = buildOperationalVoiceReply(fact, params.languageCode);

  logExecutionAudit('voice_layer', {
    executionState: params.executionState,
    verified: params.verified,
    spokenPreview: spokenReply.slice(0, 120),
  });

  if (!mayAssistantClaimCalendarSuccess(params.executionState, params.verified)) {
    assertNoFakeOperationalSuccess(spokenReply, 'failed');
    assertNoFakeOperationalSuccess(reply, 'failed');
  } else {
    assertNoFakeOperationalSuccess(spokenReply, 'success');
  }

  const actionStatus =
    params.executionState === 'success' && params.verified
      ? 'success'
      : params.executionState === 'authenticating' || params.errorCode === 'calendar_auth_required'
        ? 'pending'
        : 'failed';

  return {
    result: {
      status: actionStatus,
      tool: 'google_calendar_create_event',
      verified: params.verified,
      errorCode: params.errorCode,
      event: params.verified ? params.event : undefined,
    },
    reply,
    spokenReply,
    executionState: params.executionState,
    scheduleIso: params.scheduleIso ?? null,
    requiresCalendarAuth: params.requiresCalendarAuth,
    operationalUxPhase: mapUxPhase(params.executionState),
    pendingActionId: params.pendingActionId,
    verified: params.verified,
  };
}

export async function executeCalendarCreateEvent(
  params: CalendarCreateExecutionParams,
): Promise<CalendarCreateExecutionOutcome> {
  logExecutionAudit('request', { transcriptPreview: params.transcript.slice(0, 120) });

  let state: CalendarExecutionState = 'parsing';
  logCalendarExecutionStateTransition({
    from: 'parsing',
    to: 'parsing',
    tool: 'google_calendar_create_event',
    detail: 'parse_payload',
  });

  const payloadResult = buildCalendarCreateEventPayload({
    transcript: params.transcript,
    languageCode: params.languageCode,
    referenceNow: params.referenceNow,
  });

  logExecutionAudit('parsed_intent', {
    ok: payloadResult.ok,
    summary: payloadResult.ok ? payloadResult.payload.summary : null,
  });

  if (!payloadResult.ok) {
    return buildOutcome({
      executionState: 'failed',
      verified: false,
      languageCode: params.languageCode,
      errorCode: payloadResult.reason,
    });
  }

  const access = await resolveCalendarWriteAccessState();

  if (!access.connected || !access.hasWriteAccess) {
    state = 'authenticating';
    logCalendarExecutionStateTransition({
      from: 'parsing',
      to: 'authenticating',
      tool: 'google_calendar_create_event',
    });

    const pending = await enqueueCalendarCreateAction({
      payload: payloadResult.payload,
      transcript: params.transcript,
      languageCode: params.languageCode,
    });

    const authOutcome = buildOutcome({
      executionState: 'authenticating',
      verified: false,
      languageCode: params.languageCode,
      errorCode: 'calendar_auth_required',
      requiresCalendarAuth: true,
      pendingActionId: pending.id,
      scheduleIso: payloadResult.scheduleIso,
    });

    return {
      ...authOutcome,
      reply: buildCalendarAuthRequiredReply(params.languageCode),
      spokenReply: authOutcome.spokenReply,
    };
  }

  state = 'creating_event';
  logCalendarExecutionStateTransition({
    from: 'parsing',
    to: 'creating_event',
    tool: 'google_calendar_create_event',
  });

  const apiResult = await createGoogleCalendarEvent(payloadResult.payload);

  if (!apiResult.ok) {
    if (apiResult.errorCode === 'calendar_not_connected' || apiResult.errorCode === 'calendar_write_forbidden') {
      const pending = await enqueueCalendarCreateAction({
        payload: payloadResult.payload,
        transcript: params.transcript,
        languageCode: params.languageCode,
      });

      return buildOutcome({
        executionState: 'authenticating',
        verified: false,
        languageCode: params.languageCode,
        errorCode: 'calendar_auth_required',
        requiresCalendarAuth: true,
        pendingActionId: pending.id,
        scheduleIso: payloadResult.scheduleIso,
      });
    }

    logCalendarExecutionStateTransition({
      from: 'creating_event',
      to: 'failed',
      tool: 'google_calendar_create_event',
      detail: apiResult.errorCode,
    });

    return buildOutcome({
      executionState: 'failed',
      verified: false,
      languageCode: params.languageCode,
      errorCode: apiResult.errorCode,
      scheduleIso: payloadResult.scheduleIso,
    });
  }

  state = 'verifying_event';
  logCalendarExecutionStateTransition({
    from: 'creating_event',
    to: 'verifying_event',
    tool: 'google_calendar_create_event',
  });

  if (!apiResult.verificationFetched) {
    return buildOutcome({
      executionState: 'failed',
      verified: false,
      languageCode: params.languageCode,
      errorCode: 'calendar_verification_failed',
      scheduleIso: payloadResult.scheduleIso,
    });
  }

  state = 'success';
  logCalendarExecutionStateTransition({
    from: 'verifying_event',
    to: 'success',
    tool: 'google_calendar_create_event',
    detail: apiResult.event.id,
  });

  return buildOutcome({
    executionState: 'success',
    verified: true,
    languageCode: params.languageCode,
    event: apiResult.event,
    scheduleIso: payloadResult.scheduleIso,
  });
}

export function buildOutcomeFromVerifiedBackendEvent(
  languageCode: VoiceLanguageCode,
  event: NonNullable<ActionExecutionResult['event']>,
) {
  return buildOutcome({
    executionState: 'success',
    verified: true,
    languageCode,
    event,
  });
}

/** @deprecated Use buildOutcomeFromVerifiedBackendEvent */
export function buildSuccessReplyFromVerifiedEvent(
  languageCode: VoiceLanguageCode,
  event: NonNullable<ActionExecutionResult['event']>,
) {
  return buildOutcomeFromVerifiedBackendEvent(languageCode, event).reply;
}
