import { stripCalendarClockPhrases } from '@/src/features/agent/calendarIntelligence/calendarClockParser';
import {
  CALENDAR_WORD_EDGE,
  CALENDAR_WORD_END,
} from '@/src/features/agent/calendarIntelligence/calendarTextBoundaries';

export const CREATE_COMMAND_PREFIX =
  /^(?:please\s+)?(?:внеси|внести|добав(?:ь|ьте|ить)|создай|создать|запланируй|запланировать|поставь|поставить|занеси|занести|додай|додати|створи|заплануй|запиши|записать|add|create|schedule|book|put|insert)(?:[\s,:-]+|$)/iu;

const RELATIVE_DAY_PHRASES = new RegExp(
  `${CALENDAR_WORD_EDGE}(?:сьогодні|сегодня|today|завтра|tomorrow|післязавтра|послезавтра)${CALENDAR_WORD_END}`,
  'giu',
);

const CALENDAR_PHRASES =
  /(?:google\s*)?(?:календар[ьяь]?|calendar)|(?:в|во|to|into)\s+(?:google\s*)?(?:календар[ьяь]?|calendar)/giu;

const END_TIME_TAIL =
  /\s+(?:до|until)\s+\d{1,2}(?::\d{2})?(?:\s*(?:вечера|вечером|утра|утром|дня|днём|днем|ночи|ночью|вечора|ранку|ночі|am|pm))?.*$/iu;

const LEADING_DOMAIN_NOISE =
  /^(?:задач[ау]?|событи[ея]+|поді[юя]|подія|event|meeting|task)\s+/iu;

function capitalizeFirstLetter(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return trimmed;
  }

  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function normalizeLeadingDomain(text: string) {
  const meetingWith = text.match(/^(?:встреч[ау]?|зустріч)\s+(?:с|з)\s+(.+)$/iu);

  if (meetingWith?.[1]) {
    return `Встреча с ${meetingWith[1].trim()}`;
  }

  const callWith = text.match(/^(?:звонок|call)\s+(.+)$/iu);

  if (callWith?.[1]) {
    return `Звонок ${callWith[1].trim()}`;
  }

  return text.replace(LEADING_DOMAIN_NOISE, '');
}

export function extractCreateEventTitle(transcript: string) {
  let text = transcript.replace(CREATE_COMMAND_PREFIX, '').trim();
  text = stripCalendarClockPhrases(text);
  text = text.replace(RELATIVE_DAY_PHRASES, ' ');
  text = text.replace(CALENDAR_PHRASES, ' ');
  text = text.replace(END_TIME_TAIL, '');
  text = normalizeLeadingDomain(text);
  text = text.replace(/^[\s,.:;!\-—]+|[\s,.:;!\-—]+$/gu, '');
  text = text.replace(/\s+/g, ' ').trim();

  return text.length >= 2 ? capitalizeFirstLetter(text) : null;
}
