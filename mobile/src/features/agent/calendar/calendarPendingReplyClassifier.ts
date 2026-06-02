import { CREATE_COMMAND_PREFIX } from '@/src/features/agent/calendar/calendarCreateIntentExtractor';
import {
  isExplicitDifferentCalendarCommand,
  referencesPendingEventTitle,
} from '@/src/features/agent/calendar/calendarPendingConflictEnrichment';
import { isConflictSlotSelectionReply } from '@/src/features/agent/calendar/calendarConflictSlotReply';
import { isPendingConflictScheduleUpdateReply } from '@/src/features/agent/calendar/calendarPendingConflictScheduleUpdate';
import { isPendingConflictTimeFollowUp } from '@/src/features/agent/calendar/calendarTemporalWords';
import {
  getCalendarConversationSnapshot,
  isCalendarConflictDecisionState,
} from '@/src/features/agent/calendar/calendarConversationState';
import { extractCalendarClockFragment } from '@/src/features/agent/calendarIntelligence/calendarClockParser';
import { classifyCalendarShortReply } from '@/src/features/agent/calendar/calendarShortReply';
import {
  isOperationalCalendarCreateRequest,
  isOperationalCalendarDeleteRequest,
  isOperationalCalendarUpdateRequest,
} from '@/src/features/agent/intent/operationalCalendarWriteDetection';

export type PendingReplyClassification =
  | 'confirmation'
  | 'rejection'
  | 'decline_proceed'
  | 'alternate_time'
  | 'new_calendar_command'
  | 'unrelated';

const BARE_SHORT_REPLY =
  /^(?:please\s+)?(?:yes|yeah|yep|ok|okay|sure|да|так|ага|конечно|создай|створи|пусть\s+будет|ні|no|nope|cancel|нет|не\s+надо|не\s+треба|скасуй|отмена|отмени|go\s+ahead|do\s+it|все\s+равно|все\s+одно|всё\s+равно|другое\s+время)(?:[,.!\s]|$)/iu;

const DURATION_PHRASE =
  /(?:^|[\s,.;:!?—-]+)(?:на|for)\s+\d+(?:[.,]\d+)?\s*(?:час(?:а|ов|у)?|годин(?:и|у|ы)?|hours?|hrs?|минут(?:ы)?|minutes?|мин(?:ут)?)(?:[,.!\s]|$)/iu;

const RELATIVE_TIME_REPLY =
  /(?:^|[\s,.;:!?—-]+)(?:через|in)\s+(?:\d+|one|a|an)\s*(?:минут|minutes|мин|хвилин|час|hours|годин)|(?:^|[\s,.;:!?—-]+)(?:\d+|one|a|an)\s*(?:час(?:а|ов|у)?|hours?|hrs?|минут(?:ы|у)?|minutes?)\s+(?:позже|пізніше|later|раньше|раніше|earlier)|(?:^|[\s,.;:!?—-]+)(?:after|после)\s+/iu;

const CALENDAR_WRITE_VERB_START =
  /^(?:please\s+)?(?:добав(?:ь|ьте|ить)|додай|створи|создай|запланируй|внеси|add|create|schedule|book|перенеси|перенести|move|reschedule|удали|удалить|видали|видалити|delete|remove|cancel)/iu;

function isConflictTimeFollowUp(transcript: string) {
  return isPendingConflictTimeFollowUp(transcript);
}

function isBareShortReply(transcript: string) {
  const normalized = transcript.trim();

  if (!normalized) {
    return false;
  }

  return BARE_SHORT_REPLY.test(normalized) || classifyCalendarShortReply(normalized) !== null;
}

export function isNewCalendarCommandMessage(transcript: string) {
  const normalized = transcript.trim();
  const snapshot = getCalendarConversationSnapshot();

  if (!normalized || isBareShortReply(normalized) || isConflictTimeFollowUp(normalized)) {
    return false;
  }

  if (isCalendarConflictDecisionState(snapshot.state) && snapshot.pendingAction) {
    if (isExplicitDifferentCalendarCommand(normalized, snapshot.pendingAction)) {
      return (
        isOperationalCalendarCreateRequest(normalized) ||
        CREATE_COMMAND_PREFIX.test(normalized) ||
        isOperationalCalendarUpdateRequest(normalized) ||
        isOperationalCalendarDeleteRequest(normalized)
      );
    }

    return false;
  }

  return (
    isOperationalCalendarCreateRequest(normalized) ||
    isOperationalCalendarUpdateRequest(normalized) ||
    isOperationalCalendarDeleteRequest(normalized)
  );
}

function looksLikeAlternateTimeReply(transcript: string) {
  const normalized = transcript.trim();

  if (!normalized || isNewCalendarCommandMessage(normalized)) {
    return false;
  }

  if (isPendingConflictScheduleUpdateReply(normalized)) {
    return true;
  }

  if (CALENDAR_WRITE_VERB_START.test(normalized)) {
    return false;
  }

  if (DURATION_PHRASE.test(normalized)) {
    return false;
  }

  if (extractCalendarClockFragment(normalized)) {
    return true;
  }

  if (RELATIVE_TIME_REPLY.test(normalized)) {
    return true;
  }

  if (/\b(?:tomorrow|завтра|today|сьогодні|сегодня|післязавтра|послезавтра)\b/iu.test(normalized)) {
    return true;
  }

  if (
    /(?:suggest|another\s+time|free\s+slot|вільн|свободн|інший\s+час|другой\s+время|другое\s+время|запропонуй\s+час|предложи\s+другое\s+время)/iu.test(
      normalized,
    )
  ) {
    return false;
  }

  return /^[1-9]\d*$/.test(normalized) || /^(?:вариант|option|варіант)\s+[1-9]\d*$/iu.test(normalized);
}

export function classifyPendingCalendarReply(transcript: string): PendingReplyClassification {
  const normalized = transcript.trim();

  if (!normalized) {
    return 'unrelated';
  }

  const short = classifyCalendarShortReply(normalized);

  if (short === 'cancel_abort' && isBareShortReply(normalized)) {
    return 'rejection';
  }

  if (short === 'decline_proceed' && isBareShortReply(normalized)) {
    return 'decline_proceed';
  }

  if (short === 'proceed' && isBareShortReply(normalized)) {
    return 'confirmation';
  }

  if (short === 'suggest_new_time') {
    return 'alternate_time';
  }

  if (isNewCalendarCommandMessage(normalized)) {
    return 'new_calendar_command';
  }

  const snapshot = getCalendarConversationSnapshot();

  if (
    isCalendarConflictDecisionState(snapshot.state) &&
    snapshot.pendingAction &&
    (looksLikeAlternateTimeReply(normalized) ||
      isPendingConflictScheduleUpdateReply(normalized) ||
      isConflictTimeFollowUp(normalized) ||
      isConflictSlotSelectionReply(normalized) ||
      referencesPendingEventTitle(normalized, snapshot.pendingAction.eventTitle))
  ) {
    return 'alternate_time';
  }

  if (looksLikeAlternateTimeReply(normalized) || isConflictTimeFollowUp(normalized)) {
    return 'alternate_time';
  }

  return 'unrelated';
}

export function logPendingReplyClassified(params: {
  transcript: string;
  classification: PendingReplyClassification;
  pendingActionId?: string | null;
}) {
  console.log('[PENDING REPLY CLASSIFIED]');
  console.log(`classification=${params.classification}`);
  console.log(`pendingActionId=${params.pendingActionId ?? 'none'}`);
  console.log(`transcript=${params.transcript.slice(0, 160)}`);
}
