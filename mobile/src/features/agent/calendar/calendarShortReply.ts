const PROCEED_REPLY =
  /^(?:please\s+)?(?:yes|yeah|yep|ok|okay|sure|да|так|ага|конечно|создай|створи|пусть\s+будет|go\s+ahead|do\s+it|still\s+(?:move|create|schedule|book)|move\s+it\s+anyway|create\s+it\s+anyway|schedule\s+it\s+anyway|все\s+равно|все\s+одно|всё\s+равно)(?:[,.!\s]|$)/iu;

const CANCEL_ABORT_REPLY =
  /^(?:please\s+)?(?:cancel|don't|do\s+not|не\s+надо|не\s+треба|скасуй|отмена|отмени|отменить)(?:[,.!\s]|$)/iu;

const DECLINE_PROCEED_REPLY =
  /^(?:please\s+)?(?:no|nope|ні|нет|не|другое\s+время|другой\s+время|інший\s+час)(?:[,.!\s]|$)/iu;

const SUGGEST_NEW_TIME_REPLY =
  /(?:suggest|another\s+time|free\s+slot|available\s+time|alternatives?|вільн|свободн|подбери\s+время|запропонуй\s+час|предложи\s+другое\s+время|другое\s+время|другой\s+время|інший\s+час)/iu;

export type CalendarShortReplyKind = 'proceed' | 'cancel_abort' | 'decline_proceed' | 'suggest_new_time';

export function classifyCalendarShortReply(transcript: string): CalendarShortReplyKind | null {
  const normalized = transcript.trim();

  if (!normalized) {
    return null;
  }

  if (CANCEL_ABORT_REPLY.test(normalized)) {
    return 'cancel_abort';
  }

  if (DECLINE_PROCEED_REPLY.test(normalized)) {
    return 'decline_proceed';
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
