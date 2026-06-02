import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';
import type { PendingCalendarConflictContext } from '@/src/features/agent/execution/calendarExecutionSession';

const CONFLICT_PROCEED =
  /^(?:please\s+)?(?:yes|yeah|yep|ok|okay|sure|да|так|ага|создай|створи|go\s+ahead|do\s+it|still\s+(?:move|create|schedule|book)|move\s+it\s+anyway|create\s+it\s+anyway|schedule\s+it\s+anyway|все\s+равно|все\s+одно|всё\s+равно)(?:[,.!\s]|$)/iu;

const CONFLICT_DECLINE =
  /^(?:please\s+)?(?:no|nope|ні|нет|не)(?:[,.!\s]|$)/iu;

const CONFLICT_CANCEL =
  /^(?:please\s+)?(?:cancel|don't|do\s+not|не\s+надо|не\s+треба|скасуй|скасувати|отмена|отмени|отменить)(?:[,.!\s]|$)/iu;

const CONFLICT_SUGGEST_SLOTS =
  /(?:suggest|another\s+time|free\s+slot|available\s+time|вільн|свободн|подбери\s+время|запропонуй\s+час|предложи\s+другое\s+время|другое\s+время|другой\s+время|інший\s+час)/iu;

export type ConflictFollowUpResolution =
  | { kind: 'proceed' }
  | { kind: 'cancel' }
  | { kind: 'suggest_slots' }
  | null;

export function resolveCalendarConflictFollowUp(reply: string): ConflictFollowUpResolution {
  const normalized = reply.trim();

  if (!normalized) {
    return null;
  }

  if (CONFLICT_CANCEL.test(normalized)) {
    return { kind: 'cancel' };
  }

  if (CONFLICT_DECLINE.test(normalized)) {
    return { kind: 'suggest_slots' };
  }

  if (CONFLICT_SUGGEST_SLOTS.test(normalized)) {
    return { kind: 'suggest_slots' };
  }

  if (CONFLICT_PROCEED.test(normalized)) {
    return { kind: 'proceed' };
  }

  return null;
}

export function pendingConflictContextFromCheck(params: {
  operation: 'create' | 'update';
  sourceTranscript: string;
  titleSourceTranscript?: string;
  languageCode: VoiceLanguageCode;
  proposedTitle: string;
  proposedStartMs: number;
  proposedEndMs: number;
  updateEventId?: string;
  conflictingEventId: string;
  conflictingTitle: string;
  conflictingStartsAt: string;
  conflictingEndsAt: string;
}): PendingCalendarConflictContext {
  return {
    operation: params.operation,
    sourceTranscript: params.sourceTranscript.trim(),
    titleSourceTranscript: params.titleSourceTranscript?.trim() || null,
    languageCode: params.languageCode,
    proposedTitle: params.proposedTitle,
    proposedStartMs: params.proposedStartMs,
    proposedEndMs: params.proposedEndMs,
    updateEventId: params.updateEventId ?? null,
    conflictingEventId: params.conflictingEventId,
    conflictingTitle: params.conflictingTitle,
    conflictingStartsAt: params.conflictingStartsAt,
    conflictingEndsAt: params.conflictingEndsAt,
    proceedDespiteConflict: false,
  };
}

export function markPendingConflictProceed(context: PendingCalendarConflictContext) {
  return {
    ...context,
    proceedDespiteConflict: true,
  };
}
