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
  | 'alternate_time'
  | 'new_calendar_command'
  | 'unrelated';

const BARE_SHORT_REPLY =
  /^(?:please\s+)?(?:yes|yeah|yep|ok|okay|sure|да|так|ага|ні|no|nope|cancel|нет|не\s+надо|не\s+треба|скасуй|отмена|отмени|go\s+ahead|do\s+it)(?:[,.!\s]|$)/iu;

const DURATION_PHRASE =
  /(?:^|[\s,.;:!?—-]+)(?:на|for)\s+\d+(?:[.,]\d+)?\s*(?:час(?:а|ов|у)?|годин(?:и|у|ы)?|hours?|hrs?|минут(?:ы)?|minutes?|мин(?:ут)?)(?:[,.!\s]|$)/iu;

const RELATIVE_TIME_REPLY =
  /(?:^|[\s,.;:!?—-]+)(?:через|in)\s+\d+\s*(?:минут|minutes|мин|хвилин|час|hours|годин)/iu;

function isBareShortReply(transcript: string) {
  const normalized = transcript.trim();

  if (!normalized) {
    return false;
  }

  return BARE_SHORT_REPLY.test(normalized) || classifyCalendarShortReply(normalized) !== null;
}

export function isNewCalendarCommandMessage(transcript: string) {
  const normalized = transcript.trim();

  if (!normalized || isBareShortReply(normalized)) {
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

  if (/(?:suggest|another\s+time|free\s+slot|вільн|свободн|інший\s+час|другой\s+время|запропонуй\s+час)/iu.test(normalized)) {
    return true;
  }

  return /^\d{1,2}$/.test(normalized);
}

export function classifyPendingCalendarReply(transcript: string): PendingReplyClassification {
  const normalized = transcript.trim();

  if (!normalized) {
    return 'unrelated';
  }

  const short = classifyCalendarShortReply(normalized);

  if (short === 'cancel' && isBareShortReply(normalized)) {
    return 'rejection';
  }

  if (short === 'proceed' && isBareShortReply(normalized)) {
    return 'confirmation';
  }

  if (short === 'suggest_new_time' && isBareShortReply(normalized)) {
    return 'alternate_time';
  }

  if (isNewCalendarCommandMessage(normalized)) {
    return 'new_calendar_command';
  }

  if (looksLikeAlternateTimeReply(normalized)) {
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
