import { logCreateParse } from '@/src/features/agent/calendar/calendarCreateParseDiagnostics';
import { stripCalendarClockPhrases } from '@/src/features/agent/calendarIntelligence/calendarClockParser';
import { stripNaturalDatePhrases } from '@/src/features/agent/calendarIntelligence/calendarNaturalDateParser';
import {
  CALENDAR_WORD_EDGE,
  CALENDAR_WORD_END,
} from '@/src/features/agent/calendarIntelligence/calendarTextBoundaries';

/** Create verbs — stripped before title extraction (RU + UA + EN). */
const CREATE_VERB =
  '(?:внеси|внести|добав(?:ь|ьте|ить)|создай|создать|запланируй|запланировать|постав(?:ь|ить)?|назнач(?:ь|ить)?|занеси|занести|додай|додати|створи|заплануй|признач(?:ь|ити)?|запиши|записать|add|create|schedule|book|put|insert)';

export const CREATE_COMMAND_PREFIX = new RegExp(
  `^(?:please\\s+)?${CREATE_VERB}(?:[\\s,:-]+|$)`,
  'iu',
);

const CREATE_VERB_ANYWHERE = new RegExp(
  `${CALENDAR_WORD_EDGE}${CREATE_VERB}${CALENDAR_WORD_END}`,
  'giu',
);

const RELATIVE_DAY_PHRASES = new RegExp(
  `${CALENDAR_WORD_EDGE}(?:сьогодні|сегодня|today|завтра|tomorrow|післязавтра|послезавтра)${CALENDAR_WORD_END}`,
  'giu',
);

const CALENDAR_PHRASES =
  /(?:google\s*)?(?:календар[ьяь]?|calendar)|(?:в|во|to|into)\s+(?:google\s*)?(?:календар[ьяь]?|calendar)/giu;

const MERIDIEM_WORDS = new RegExp(
  `${CALENDAR_WORD_EDGE}(?:утра|утром|вечера|вечером|дня|днём|днем|ночи|ночью|ранку|вечора|ночі|am|pm|a\\.m\\.|p\\.m\\.)${CALENDAR_WORD_END}`,
  'giu',
);

const END_TIME_TAIL =
  /\s+(?:до|until)\s+\d{1,2}(?::\d{2})?(?:\s*(?:вечера|вечером|утра|утром|дня|днём|днем|ночи|ночью|вечора|ранку|ночі|am|pm))?.*$/iu;

const LEADING_DOMAIN_NOISE =
  /^(?:задач[ау]?|событи[ея]+|поді[юя]|подія|event|meeting|task)\s+/iu;

const LEADING_PREPOSITION = /^(?:в|на|at|@|о)\s+/iu;

function capitalizeFirstLetter(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return trimmed;
  }

  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

/** If multiple create verbs appear (merged transcript leak), keep only the last command span. */
function isolateLastCreateCommandSegment(text: string) {
  const matches = [...text.matchAll(CREATE_VERB_ANYWHERE)];

  if (matches.length <= 1) {
    return text.trim();
  }

  const last = matches[matches.length - 1];

  if (last.index === undefined) {
    return text.trim();
  }

  return text.slice(last.index).trim();
}

function stripCreateVerbs(text: string) {
  let cleaned = text.replace(CREATE_COMMAND_PREFIX, '').trim();
  cleaned = cleaned.replace(CREATE_VERB_ANYWHERE, ' ');

  return cleaned.replace(/\s+/g, ' ').trim();
}

function normalizeLeadingDomain(text: string) {
  const ukrainianMeeting = text.match(/^зустріч\s+з\s+(.+)$/iu);

  if (ukrainianMeeting?.[1]) {
    return `Зустріч з ${ukrainianMeeting[1].trim()}`;
  }

  const meetingWith = text.match(/^(?:встреч[ау]?)\s+(?:с)\s+(.+)$/iu);

  if (meetingWith?.[1]) {
    return `Встреча с ${meetingWith[1].trim()}`;
  }

  const callWith = text.match(/^(?:звонок|call)\s+(.+)$/iu);

  if (callWith?.[1]) {
    return `Звонок ${callWith[1].trim()}`;
  }

  return text.replace(LEADING_DOMAIN_NOISE, '');
}

/** Feminine accusative RU/UK: прогулку → прогулка, каву → кава. */
function normalizeAccusativeWord(word: string) {
  if (word.length < 4) {
    return word;
  }

  if (/^[A-Za-zА-Яа-яЁёІіЇїЄє'-]+у$/u.test(word)) {
    return `${word.slice(0, -1)}а`;
  }

  return word;
}

function normalizeAccusativeTitle(title: string) {
  const words = title.trim().split(/\s+/u);

  if (words.length === 0) {
    return title;
  }

  words[0] = normalizeAccusativeWord(words[0]);

  return words.join(' ');
}

export type CreateTitleParseContext = {
  detectedDate?: string | null;
  detectedTime?: string | null;
};

export function extractCreateEventTitle(
  currentUserMessage: string,
  context: CreateTitleParseContext = {},
) {
  const originalText = currentUserMessage.trim();
  let text = isolateLastCreateCommandSegment(originalText);
  text = stripCreateVerbs(text);
  text = stripCalendarClockPhrases(text);
  text = stripNaturalDatePhrases(text);
  text = text.replace(RELATIVE_DAY_PHRASES, ' ');
  text = text.replace(MERIDIEM_WORDS, ' ');
  text = text.replace(CALENDAR_PHRASES, ' ');
  text = text.replace(END_TIME_TAIL, '');
  text = normalizeLeadingDomain(text);
  text = text.replace(LEADING_PREPOSITION, '');
  text = text.replace(/^[\s,.:;!\-—]+|[\s,.:;!\-—]+$/gu, '');
  text = text.replace(/\s+/g, ' ').trim();
  text = normalizeAccusativeTitle(text);
  const extractedTitle = text.length >= 2 ? capitalizeFirstLetter(text) : null;

  logCreateParse({
    originalText,
    cleanedText: text,
    extractedTitle,
    detectedDate: context.detectedDate ?? null,
    detectedTime: context.detectedTime ?? null,
  });

  return extractedTitle;
}
