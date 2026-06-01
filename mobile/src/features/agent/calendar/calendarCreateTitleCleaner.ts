import { stripSpokenTimePhrases } from '@/src/features/agent/calendar/calendarSpokenTime';
import { stripCalendarClockPhrases } from '@/src/features/agent/calendarIntelligence/calendarClockParser';
import { stripNaturalDatePhrases } from '@/src/features/agent/calendarIntelligence/calendarNaturalDateParser';
import {
  CALENDAR_WORD_EDGE,
  CALENDAR_WORD_END,
} from '@/src/features/agent/calendarIntelligence/calendarTextBoundaries';

const PHRASE_END = '(?:$|[\\s,.;:!?—-])';

const TEMPORAL_DAY_PHRASES = new RegExp(
  `${CALENDAR_WORD_EDGE}(?:today|tonight|tomorrow|yesterday|this\\s+morning|this\\s+afternoon|this\\s+evening|this\\s+night|the\\s+day\\s+after\\s+tomorrow|day\\s+after\\s+tomorrow|сьогодні|сегодня|завтра|вчора|вчера|післязавтра|послезавтра|сегодня\\s+вечером|tonight)${CALENDAR_WORD_END}`,
  'giu',
);

const WEEKDAY_WORDS = new RegExp(
  `${CALENDAR_WORD_EDGE}(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|понеділ(?:ок|ка|ку)|понедельник(?:а|у)?|вівтор(?:ок|ка|ку)|вторник(?:а|у)?|sered[auy]?|серед[ау]|среда|четвер(?:г|а|у)?|п(?:'|')?ятниц[ау]|пятниц[ау]|субот[ау]|суббот[ау]|воскрес(?:енье|енья|енью)?|неділ[іi])${CALENDAR_WORD_END}`,
  'giu',
);

const ENGLISH_RELATIVE_TIME = new RegExp(
  `(?:^|[\\s,.;:!?—-]+)(?:in|after|within)\\s+(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|a|an|\\d+)\\s+(?:hour|hours|hr|hrs|minute|minutes|min|mins|day|days)${PHRASE_END}`,
  'giu',
);

const MERIDIEM_WORDS = new RegExp(
  `${CALENDAR_WORD_EDGE}(?:утра|утром|вечера|вечером|дня|днём|днем|ночи|ночью|ранку|вечора|ночі|am|pm|a\\.m\\.|p\\.m\\.|o'clock|oclock)${CALENDAR_WORD_END}`,
  'giu',
);

const EXPLICIT_DATE = /\b(?:20\d{2}-\d{2}-\d{2}|\d{1,2}[/.]\d{1,2}(?:[/.]\d{2,4})?)\b/g;

const REMAINING_CLOCK = /\b\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)?\b/gi;

const END_TIME_TAIL =
  /\s+(?:до|until)\s+\d{1,2}(?::\d{2})?(?:\s*(?:вечера|вечером|утра|утром|дня|днём|днем|ночи|ночью|вечора|ранку|ночі|am|pm|o'clock))?.*$/iu;

const CALENDAR_PHRASES =
  /(?:google\s*)?(?:календар[ьяь]?|calendar)|(?:в|во|to|into)\s+(?:google\s*)?(?:календар[ьяь]?|calendar)/giu;

const LEADING_DOMAIN_NOISE =
  /^(?:задач[ау]?|событи[ея]+|поді[юя]|подія|an?\s+event|the?\s+event|event|meeting|task)\s+/iu;

const LEADING_ARTICLE = /^(?:a|an|the)\s+/iu;

const TRAILING_SCHEDULE_PREP = /\s+(?:at|on|in|by|after|before|within|@|о|в|на)$/iu;

const LEADING_SCHEDULE_PREP = /^(?:at|on|in|by|after|before|within|@|о|в|на)\s+/iu;

const TITLE_MINOR_WORDS = new Set([
  'a',
  'an',
  'the',
  'with',
  'and',
  'or',
  'for',
  'to',
  'с',
  'з',
  'із',
  'i',
]);

function capitalizeFirstLetter(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return trimmed;
  }

  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function formatDisplayTitle(text: string) {
  if (!/[A-Za-z]/.test(text)) {
    return capitalizeFirstLetter(text);
  }

  return text
    .split(/\s+/u)
    .map((word, index) => {
      const lower = word.toLowerCase();

      if (index > 0 && TITLE_MINOR_WORDS.has(lower)) {
        return lower;
      }

      if (lower.length === 0) {
        return lower;
      }

      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

function normalizeLeadingDomain(text: string) {
  const ukrainianMeeting = text.match(/^зустріч\s+з\s+(.+)$/iu);

  if (ukrainianMeeting?.[1]) {
    return `Зустріч з ${ukrainianMeeting[1].trim()}`;
  }

  const meetingWithRu = text.match(/^(?:встреч[ау]?)\s+(?:с)\s+(.+)$/iu);

  if (meetingWithRu?.[1]) {
    return `Встреча с ${meetingWithRu[1].trim()}`;
  }

  const meetingWithEn = text.match(/^meeting\s+with\s+(.+)$/iu);

  if (meetingWithEn?.[1]) {
    return `meeting with ${meetingWithEn[1].trim()}`;
  }

  const callWith = text.match(/^(?:звонок|call)\s+(?:with\s+)?(.+)$/iu);

  if (callWith?.[1]) {
    const target = callWith[1].trim();

    if (/^[A-Za-z]/.test(target)) {
      return `call with ${target}`;
    }

    return `Звонок ${target}`;
  }

  return text.replace(LEADING_DOMAIN_NOISE, '');
}

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

function stripWithArticles(text: string) {
  return text.replace(/\bwith\s+(?:a|an|the)\s+/giu, 'with ');
}

function stripOrphanSchedulePrepositions(text: string) {
  let cleaned = text.trim();

  for (let pass = 0; pass < 4; pass += 1) {
    const next = cleaned
      .replace(TRAILING_SCHEDULE_PREP, '')
      .replace(LEADING_SCHEDULE_PREP, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (next === cleaned) {
      break;
    }

    cleaned = next;
  }

  return cleaned;
}

function stripLeadingArticles(text: string) {
  let cleaned = text.trim();

  while (LEADING_ARTICLE.test(cleaned)) {
    cleaned = cleaned.replace(LEADING_ARTICLE, '').trim();
  }

  return cleaned;
}

export function cleanCreateEventTitleText(text: string) {
  let cleaned = text.trim();
  cleaned = stripSpokenTimePhrases(cleaned);
  cleaned = stripCalendarClockPhrases(cleaned);
  cleaned = stripNaturalDatePhrases(cleaned);
  cleaned = cleaned.replace(ENGLISH_RELATIVE_TIME, ' ');
  cleaned = cleaned.replace(TEMPORAL_DAY_PHRASES, ' ');
  cleaned = cleaned.replace(WEEKDAY_WORDS, ' ');
  cleaned = cleaned.replace(MERIDIEM_WORDS, ' ');
  cleaned = cleaned.replace(EXPLICIT_DATE, ' ');
  cleaned = cleaned.replace(REMAINING_CLOCK, ' ');
  cleaned = cleaned.replace(CALENDAR_PHRASES, ' ');
  cleaned = cleaned.replace(END_TIME_TAIL, '');
  cleaned = stripLeadingArticles(cleaned);
  cleaned = normalizeLeadingDomain(cleaned);
  cleaned = stripWithArticles(cleaned);
  cleaned = stripLeadingArticles(cleaned);
  cleaned = stripOrphanSchedulePrepositions(cleaned);
  cleaned = cleaned.replace(WEEKDAY_WORDS, ' ');
  cleaned = cleaned.replace(TEMPORAL_DAY_PHRASES, ' ');
  cleaned = stripOrphanSchedulePrepositions(cleaned);
  cleaned = cleaned.replace(/^[\s,.:;!\-—]+|[\s,.:;!\-—]+$/gu, '');
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  cleaned = normalizeAccusativeTitle(cleaned);

  if (cleaned.length < 2) {
    return '';
  }

  return formatDisplayTitle(cleaned);
}
