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

export function extractDeleteEventTitle(transcript: string) {
  let text = transcript.replace(DELETE_COMMAND_PREFIX, '').trim();
  text = stripCalendarClockPhrases(text);
  text = text.replace(RELATIVE_DAY_PHRASES, ' ');
  text = text.replace(TASK_DOMAIN_NOISE, ' ');
  text = text.replace(/\b(?:в|на|at|@|о)\b/giu, ' ');
  text = text.replace(/^[\s,.:;!\-—]+|[\s,.:;!\-—]+$/gu, '');
  text = text.replace(/\s+/g, ' ').trim();

  return text.length >= 2 ? text : null;
}
