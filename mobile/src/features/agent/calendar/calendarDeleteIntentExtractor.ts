import { stripCalendarClockPhrases } from '@/src/features/agent/calendarIntelligence/calendarClockParser';
import {
  CALENDAR_WORD_EDGE,
  CALENDAR_WORD_END,
} from '@/src/features/agent/calendarIntelligence/calendarTextBoundaries';

export const DELETE_COMMAND_PREFIX =
  /^(?:please\s+)?(?:удали|удалить|убери|отмени|отменить|прибери|скасуй|скасувати|видали|видалити|delete|remove|cancel)(?:[\s,:-]+|$)/iu;

const RELATIVE_DAY_PHRASES = new RegExp(
  `${CALENDAR_WORD_EDGE}(?:сьогодні|сегодня|today|завтра|tomorrow|післязавтра|послезавтра)${CALENDAR_WORD_END}`,
  'giu',
);

const TASK_DOMAIN_NOISE = new RegExp(
  `${CALENDAR_WORD_EDGE}(?:задач[ау]?|встреч[ау]?|событи[ея]?|поді[яю]|event|meeting|task|call)${CALENDAR_WORD_END}`,
  'giu',
);

const DELETE_ALL_PREFIX =
  /^(?:please\s+)?(?:удали|удалить|убери|отмени|отменить|прибери|скасуй|скасувати|видали|видалити|delete|remove|cancel)\s+(?:все|всі|all)\s+/iu;

export function isDeleteAllCalendarCommand(transcript: string) {
  const normalized = transcript.trim();

  return (
    DELETE_ALL_PREFIX.test(normalized) ||
    /\b(?:все|всі|all)\s+.+(?:удали|удалить|видали|видалити|delete|remove)\b/iu.test(normalized)
  );
}

export function extractDeleteEventTitle(transcript: string) {
  let text = transcript.replace(DELETE_COMMAND_PREFIX, '').trim();
  text = text.replace(DELETE_ALL_PREFIX, '').trim();
  text = text.replace(/^(?:все|всі|all)\s+/iu, '').trim();
  text = stripCalendarClockPhrases(text);
  text = text.replace(RELATIVE_DAY_PHRASES, ' ');
  text = text.replace(TASK_DOMAIN_NOISE, ' ');
  text = text.replace(/\b(?:в|на|at|@|о)\b/giu, ' ');
  text = text.replace(/^[\s,.:;!\-—]+|[\s,.:;!\-—]+$/gu, '');
  text = text.replace(/\s+/g, ' ').trim();

  return text.length >= 2 ? text : null;
}
