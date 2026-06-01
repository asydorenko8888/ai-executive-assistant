const PROCEED_REPLY =
  /^(?:please\s+)?(?:yes|yeah|yep|ok|okay|sure|да|так|ага|go\s+ahead|do\s+it|still\s+(?:move|create|schedule|book)|move\s+it\s+anyway|create\s+it\s+anyway|schedule\s+it\s+anyway|все\s+равно|все\s+одно|всё\s+равно)(?:[,.!\s]|$)/iu;

const CANCEL_REPLY =
  /^(?:please\s+)?(?:no|nope|cancel|don't|do\s+not|нет|не\s+надо|не\s+треба|ні|скасуй|отмена|отмени)(?:[,.!\s]|$)/iu;

const SUGGEST_NEW_TIME_REPLY =
  /(?:suggest|another\s+time|free\s+slot|available\s+time|alternatives?|вільн|свободн|подбери\s+время|запропонуй\s+час|другой\s+время|інший\s+час)/iu;

export type CalendarShortReplyKind = 'proceed' | 'cancel' | 'suggest_new_time';

export function classifyCalendarShortReply(transcript: string): CalendarShortReplyKind | null {
  const normalized = transcript.trim();

  if (!normalized) {
    return null;
  }

  if (CANCEL_REPLY.test(normalized)) {
    return 'cancel';
  }

  if (SUGGEST_NEW_TIME_REPLY.test(normalized)) {
    return 'suggest_new_time';
  }

  if (PROCEED_REPLY.test(normalized)) {
    return 'proceed';
  }

  return null;
}

export function isBareCalendarShortReply(transcript: string) {
  return classifyCalendarShortReply(transcript) !== null;
}
