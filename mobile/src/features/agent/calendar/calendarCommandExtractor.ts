import { parseOperationalScheduleHint } from '@/src/features/agent/calendar/operationalScheduleParser';
import { extractCreateEventTitle } from '@/src/features/agent/calendar/calendarCreateIntentExtractor';
import { parseCalendarCreateSchedule } from '@/src/features/agent/calendar/calendarCreateScheduleParser';
import {
  isOperationalCalendarCreateRequest,
  isOperationalCalendarDeleteRequest,
  isOperationalCalendarUpdateRequest,
} from '@/src/features/agent/intent/operationalCalendarWriteDetection';

export type CalendarCommandExtractionIntent =
  | 'calendar_create'
  | 'calendar_delete'
  | 'calendar_update'
  | 'none';

export type CalendarCommandExtraction = {
  intent: CalendarCommandExtractionIntent;
  title: string;
  datetime: string | null;
  durationMinutes: number | null;
  confidence: number;
  cleanedCommand: string;
};

const CONFIDENCE_EXECUTE_THRESHOLD = 0.8;

const WORD_EDGE = '(?:^|[\\s,.;:!?—\\-«»"\'(]+)';
const WORD_END = '(?:[\\s,.;:!?—\\-»"\'()]+|$)';

/** Emotional, insults, confirmations — never part of event title. */
const CONVERSATIONAL_NOISE = [
  /ты\s+надо\s+мной\s+издеваешься/giu,
  /надо\s+мной\s+издеваешься/giu,
  /ты\s+издеваешься/giu,
  /издеваешься\s+над\s+мной/giu,
  /я\s+же\s+сказал/giu,
  /я\s+уже\s+сказал/giu,
  /я\s+же\s+просил/giu,
  /как\s+я\s+(?:уже\s+)?(?:сказал|просил)/giu,
  /ещё\s+раз/giu,
  /еще\s+раз/giu,
  /повторяю/giu,
  /слушай/giu,
  /ну\s+же/giu,
  /ну\s+вот/giu,
  /блин/giu,
  /чёрт/giu,
  /черт/giu,
  /бесит/giu,
  /бісить/giu,
  /устал/giu,
  /втомився/giu,
  /please\s+just/giu,
  /i\s+already\s+told\s+you/giu,
  /i\s+said\s+already/giu,
  /are\s+you\s+kidding/giu,
  /stop\s+ignoring/giu,
];

const ACTION_VERB_ANYWHERE =
  /(?:внеси|внести|добав(?:ь|ьте|ить)|создай|создать|запланируй|запланировать|поставь|поставить|занеси|занести|додай|додати|створи|заплануй|удали|удалить|видали|видалити|перенеси|перенести|измени|зміни|add|create|schedule|book|put|insert|delete|remove|cancel|update|move|reschedule)/iu;

const COMMAND_VERBS = new RegExp(
  `${WORD_EDGE}(?:please\\s+)?(?:внеси|внести|добав(?:ь|ьте|ить)|создай|создать|запланируй|запланировать|поставь|поставить|занеси|занести|додай|додати|створи|заплануй|перенеси|перенести|измени|зміни|add|create|schedule|book|put|insert|delete|remove|cancel|update|move|reschedule)${WORD_END}`,
  'giu',
);

const CALENDAR_PHRASES =
  /(?:google\s*)?(?:календар[ьяь]?|calendar)|(?:в|во|to|into)\s+(?:google\s*)?(?:календар[ьяь]?|calendar)/giu;

const RELATIVE_DATE_PHRASES = [
  new RegExp(`${WORD_EDGE}(?:today|tomorrow|сьогодні|сегодня|завтра|післязавтра|послезавтра)${WORD_END}`, 'giu'),
  /\b(?:на|в|on)\s+(?:завтра|сегодня|сьогодні|today|tomorrow)\b/giu,
];

const TIME_PHRASES = [
  new RegExp(
    `${WORD_EDGE}(?:в|на|at|@|о)\\s+\\d{1,2}(?::\\d{2})?\\s*(?:вечера|вечером|утра|утром|дня|днём|днем|ночи|ночью|am|pm)?${WORD_END}`,
    'giu',
  ),
  new RegExp(
    `${WORD_EDGE}\\d{1,2}(?::\\d{2})?\\s*(?:вечера|вечером|утра|утром|дня|днём|днем|ночи|ночью)${WORD_END}`,
    'giu',
  ),
  new RegExp(`${WORD_EDGE}\\d{1,2}\\s*(?:am|pm|a\\.m\\.|p\\.m\\.)${WORD_END}`, 'giu'),
  new RegExp(`${WORD_EDGE}(?:утра|утром|вечера|вечером|дня|днём|днем|ночи|ночью)${WORD_END}`, 'giu'),
];

const FILLER_WORDS = new RegExp(
  `${WORD_EDGE}(?:задач[ауеиё]?|событ[иеяё]+|встреч[уеиё]|поді[юя]|подія|meeting|events?|task|reminder|нагадування|напоминание)${WORD_END}`,
  'giu',
);

const POSSESSIVE_FILLER = new RegExp(`${WORD_EDGE}(?:мой|моей|моего|моём|моем|my)${WORD_END}`, 'giu');

const LEADING_FILLER = /^(?:в|на|at|о|the|a|an)\s+/iu;

const TITLE_NOISE_MARKERS =
  /\b(?:издева|сказал|просил|бесит|бісить|устал|втомив|надо\s+мной|please|already\s+told|kidding)\b/iu;

const INVALID_TITLES = new Set(
  [
    'завтра',
    'сегодня',
    'сьогодні',
    'today',
    'tomorrow',
    'утра',
    'утром',
    'вечера',
    'вечером',
    'дня',
    'днём',
    'днем',
    'ночи',
    'ночью',
    'на',
    'в',
    'at',
    'задачу',
    'задача',
    'task',
    'event',
    'meeting',
  ].map((value) => value.toLowerCase()),
);

function logIntentExtraction(details: Record<string, unknown>) {
  console.log('[IntentExtraction]', details);
}

function capitalizeFirstLetter(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return trimmed;
  }

  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function stripConversationalNoise(transcript: string) {
  let cleaned = transcript.trim();

  for (const pattern of CONVERSATIONAL_NOISE) {
    cleaned = cleaned.replace(pattern, ' ');
  }

  return normalizeWhitespace(cleaned);
}

function isolateCommandSegment(transcript: string) {
  const match = transcript.match(ACTION_VERB_ANYWHERE);

  if (!match || match.index === undefined) {
    return transcript;
  }

  return transcript.slice(match.index).trim();
}

function extractTitleAfterLastTimeSegment(segment: string) {
  const timePatterns = [
    /\d{1,2}(?::\d{2})?\s*(?:вечера|вечером|утра|утром|дня|днём|днем|ночи|ночью|am|pm)/giu,
    /(?:в|на|at|@|о)\s+\d{1,2}(?::\d{2})?\s*(?:вечера|вечером|утра|утром|дня|днём|днем|ночи|ночью|am|pm)?/giu,
    /\d{1,2}:\d{2}/g,
  ];

  let lastEnd = -1;

  for (const pattern of timePatterns) {
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(segment)) !== null) {
      lastEnd = Math.max(lastEnd, match.index + match[0].length);
    }
  }

  if (lastEnd <= 0 || lastEnd >= segment.length) {
    return '';
  }

  return normalizeWhitespace(segment.slice(lastEnd));
}

function stripSchedulingTokens(value: string) {
  let title = value;
  title = title.replace(COMMAND_VERBS, ' ');
  title = title.replace(CALENDAR_PHRASES, ' ');

  for (const pattern of RELATIVE_DATE_PHRASES) {
    title = title.replace(pattern, ' ');
  }

  for (const pattern of TIME_PHRASES) {
    title = title.replace(pattern, ' ');
  }

  title = title.replace(FILLER_WORDS, ' ');
  title = title.replace(POSSESSIVE_FILLER, ' ');
  title = title.replace(LEADING_FILLER, '');
  title = title.replace(/^[,.;:\s-]+|[,.;:\s-]+$/gu, '');

  return normalizeWhitespace(title);
}

function isInvalidTitle(title: string) {
  const normalized = title.trim().toLowerCase();

  if (!normalized || normalized.length < 2) {
    return true;
  }

  if (INVALID_TITLES.has(normalized)) {
    return true;
  }

  if (TITLE_NOISE_MARKERS.test(normalized)) {
    return true;
  }

  if (/^[\d:\s]+(?:am|pm)?$/iu.test(normalized)) {
    return true;
  }

  // Reject if title is mostly the raw message (executive assistant must not copy chat)
  if (normalized.split(/\s+/u).length > 8) {
    return true;
  }

  return false;
}

function pickBestTitle(candidates: string[]) {
  const valid = candidates
    .map((value) => capitalizeFirstLetter(stripSchedulingTokens(value)))
    .filter((value) => !isInvalidTitle(value));

  if (valid.length === 0) {
    return '';
  }

  // Prefer shortest clean title — task names are usually 1–4 words
  return valid.sort((left, right) => left.length - right.length)[0];
}

function detectExtractionIntent(transcript: string): CalendarCommandExtractionIntent {
  if (isOperationalCalendarDeleteRequest(transcript)) {
    return 'calendar_delete';
  }

  if (isOperationalCalendarUpdateRequest(transcript)) {
    return 'calendar_update';
  }

  if (isOperationalCalendarCreateRequest(transcript)) {
    return 'calendar_create';
  }

  return 'none';
}

function scoreExtraction(params: {
  title: string;
  datetime: string | null;
  hasExplicitTime: boolean;
  rawInput: string;
  cleanedCommand: string;
}): number {
  let score = 0;

  if (params.title && params.title.length >= 2) {
    score += 0.35;
  }

  if (params.datetime) {
    score += 0.35;
  }

  if (params.hasExplicitTime) {
    score += 0.1;
  }

  if (params.title && params.title.length <= 40) {
    score += 0.1;
  }

  if (params.title && !TITLE_NOISE_MARKERS.test(params.title)) {
    score += 0.1;
  }

  const rawNorm = normalizeWhitespace(params.rawInput).toLowerCase();
  const titleNorm = params.title.toLowerCase();

  if (params.title && rawNorm !== titleNorm && !rawNorm.startsWith(titleNorm)) {
    score += 0.1;
  }

  if (params.cleanedCommand.length < rawNorm.length * 0.85) {
    score += 0.05;
  }

  return Math.min(1, Math.round(score * 100) / 100);
}

export function extractCalendarCommand(params: {
  transcript: string;
  referenceNow: Date;
  /** Current user message only — never merged chat history. Used for CREATE titles. */
  titleSourceTranscript?: string;
}): CalendarCommandExtraction {
  const rawInput = params.transcript.trim();
  const titleSource = (params.titleSourceTranscript ?? params.transcript).trim();
  const intent = detectExtractionIntent(rawInput);

  if (intent === 'none') {
    const empty: CalendarCommandExtraction = {
      intent,
      title: '',
      datetime: null,
      durationMinutes: null,
      confidence: 0,
      cleanedCommand: rawInput,
    };

    logIntentExtraction({
      raw_input: rawInput.slice(0, 200),
      cleaned_command: empty.cleanedCommand,
      title: empty.title,
      datetime: empty.datetime,
      confidence: empty.confidence,
    });

    return empty;
  }

  const afterNoise = stripConversationalNoise(rawInput);
  const commandSegment = isolateCommandSegment(afterNoise);
  const cleanedCommand = normalizeWhitespace(commandSegment);

  let title = '';
  let datetime: string | null = null;
  let hasExplicitTime = false;
  let durationMinutes: number | null = null;
  let explicitDayOffset: number | null = null;

  if (intent === 'calendar_create') {
    const schedule = parseCalendarCreateSchedule(rawInput, params.referenceNow);
    const detectedDate =
      schedule.ok && schedule.explicitDayOffset === 0
        ? 'today'
        : schedule.ok && schedule.explicitDayOffset === 1
          ? 'tomorrow'
          : schedule.ok
            ? `dayOffset:${schedule.explicitDayOffset}`
            : null;
    const detectedTime = schedule.ok
      ? new Date(schedule.startMs).toISOString().slice(11, 16)
      : null;

    title = extractCreateEventTitle(titleSource, {
      detectedDate,
      detectedTime,
    }) ?? '';

    if (schedule.ok) {
      datetime = new Date(schedule.startMs).toISOString();
      hasExplicitTime = schedule.hasExplicitTime;
      durationMinutes = Math.max(30, Math.round((schedule.endMs - schedule.startMs) / 60_000));
      explicitDayOffset = schedule.explicitDayOffset;
    }
  } else {
    const titleAfterTime = extractTitleAfterLastTimeSegment(cleanedCommand);
    const titleFromStrip = stripSchedulingTokens(cleanedCommand);
    title = pickBestTitle([titleAfterTime, titleFromStrip]);

    const schedule = parseOperationalScheduleHint(rawInput, params.referenceNow);
    datetime = schedule.ok ? schedule.date.toISOString() : null;
    hasExplicitTime = schedule.ok ? schedule.hasExplicitTime : false;
    durationMinutes = schedule.ok ? 60 : null;
    explicitDayOffset = schedule.ok ? schedule.explicitDayOffset : null;
  }

  const confidence = scoreExtraction({
    title,
    datetime,
    hasExplicitTime,
    rawInput,
    cleanedCommand,
  });

  const result: CalendarCommandExtraction = {
    intent,
    title,
    datetime,
    durationMinutes,
    confidence,
    cleanedCommand,
  };

  logIntentExtraction({
    raw_input: rawInput.slice(0, 200),
    cleaned_command: cleanedCommand.slice(0, 200),
    title: result.title,
    datetime: result.datetime,
    confidence: result.confidence,
  });

  return result;
}

export function isCalendarExtractionExecutable(extraction: CalendarCommandExtraction) {
  return (
    extraction.intent !== 'none' &&
    extraction.confidence >= CONFIDENCE_EXECUTE_THRESHOLD &&
    Boolean(extraction.title) &&
    Boolean(extraction.datetime) &&
    (extraction.intent !== 'calendar_create' || extraction.durationMinutes !== null)
  );
}

export function getCalendarExtractionConfidenceThreshold() {
  return CONFIDENCE_EXECUTE_THRESHOLD;
}
