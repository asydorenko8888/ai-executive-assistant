import type { VoiceLanguageChatLocale } from '@/src/features/chat/services/voiceLanguage';

export type SpokenUrgency = 'immediate' | 'soon' | 'relaxed' | 'free';

export type SpokenDayLoad = 'empty' | 'light' | 'steady' | 'overloaded';

export type CalendarAgendaQueryIntent = 'calendar_query' | 'schedule_query' | 'agenda_query';

export const CALENDAR_AGENDA_SENTENCE_LIMIT = 20;

export type FormatVoiceResponseOptions = {
  maxSentences?: number;
  urgency?: SpokenUrgency;
  locale?: VoiceLanguageChatLocale;
  /** Keep period-separated sentences intact (for detailed time breakdowns). */
  preserveSentences?: boolean;
  /** User message — enables full calendar list output when it asks for an agenda. */
  userTranscript?: string;
  /** Skip sentence limits (e.g. calendar agenda listing). */
  preserveFullCalendarList?: boolean;
  /** Explicit calendar read intent — never truncate agenda output. */
  queryIntent?: CalendarAgendaQueryIntent | string | null;
};

const CALENDAR_AGENDA_QUERY_INTENTS = new Set<CalendarAgendaQueryIntent>([
  'calendar_query',
  'schedule_query',
  'agenda_query',
]);

const CALENDAR_AGENDA_RESPONSE_MARKERS: RegExp[] = [
  /запланированы\s+следующие\s+задачи/i,
  /следующие\s+задачи/i,
  /у\s+тебя\s+запланировано/i,
  /задачи\s+на\s+завтра/i,
  /задачи\s+на\s+сегодня/i,
  /на\s+сьогодні\s+заплановано/i,
  /на\s+завтра\s+заплановано/i,
  /visible google calendar events/i,
  /authoritative list/i,
  /\bhere(?:'s| is) your (?:schedule|agenda)\b/i,
  /\b(?:events?|meetings?) for today\b/i,
];

const CALENDAR_LIST_QUESTION_PATTERNS: RegExp[] = [
  /\bagenda\b/i,
  /\bschedule\b/i,
  /\b(?:list|переліч|перечисл|список).{0,32}(?:задач|tasks?|events?|meetings?|подій|зустріч|встреч)/i,
  /\b(?:які|which|what).{0,24}(?:задачі|tasks?|events?|meetings?|події|зустрічі)\b/i,
  /\bсколько\s+задач/i,
  /\bскільки\s+задач/i,
  /\bщо\s+у\s+мене\s+(?:сьогодні|завтра)/i,
  /\bчто\s+у\s+меня\s+(?:сегодня|завтра)/i,
  /\bwhat(?:'s| is).{0,24}(?:today|tomorrow)\b/i,
  /\bwhat do i have\b/i,
  /\b(?:all|всі|все)\s+(?:my\s+)?(?:events?|meetings?|tasks?|задач|подій|зустріч)/i,
  /\b(?:розклад|календар).{0,20}(?:сьогодні|завтра|today|tomorrow)\b/i,
  /\bmeetings?\s+today\b/i,
  /\bзустріч.{0,12}сьогодні/i,
];

export function isCalendarListQuestion(transcript: string) {
  const normalized = transcript.trim();

  if (!normalized) {
    return false;
  }

  return CALENDAR_LIST_QUESTION_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function isCalendarAgendaQueryIntent(
  intent: string | null | undefined,
): intent is CalendarAgendaQueryIntent {
  return Boolean(intent && CALENDAR_AGENDA_QUERY_INTENTS.has(intent as CalendarAgendaQueryIntent));
}

export function classifyCalendarAgendaQueryIntent(transcript: string): CalendarAgendaQueryIntent | null {
  const normalized = transcript.trim();

  if (!normalized) {
    return null;
  }

  if (/\bagenda\b/i.test(normalized)) {
    return 'agenda_query';
  }

  if (/\b(?:schedule|розклад)\b/i.test(normalized)) {
    return 'schedule_query';
  }

  if (
    isCalendarListQuestion(normalized) ||
    /\b(?:календар|calendar|зустріч|встреч|meetings?|задач|tasks?|events?)\b/i.test(normalized)
  ) {
    return 'calendar_query';
  }

  return null;
}

export function hasNumberedAgendaList(text: string) {
  const matches = text.match(/(?:^|\n)\s*\d+[\.\):\-]\s+\S+/g);

  return (matches?.length ?? 0) >= 2;
}

export function isCalendarAgendaResponseText(text: string) {
  const normalized = text.trim();

  if (!normalized) {
    return false;
  }

  if (CALENDAR_AGENDA_RESPONSE_MARKERS.some((pattern) => pattern.test(normalized))) {
    return true;
  }

  if (hasNumberedAgendaList(normalized)) {
    return true;
  }

  const semicolonSeparatedItems = normalized
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean);

  return semicolonSeparatedItems.length >= 3;
}

export function shouldPreserveFullCalendarAgenda(
  responseText: string,
  options: FormatVoiceResponseOptions = {},
) {
  if (options.preserveFullCalendarList) {
    return true;
  }

  if (isCalendarAgendaQueryIntent(options.queryIntent)) {
    return true;
  }

  if (options.userTranscript) {
    const classified = classifyCalendarAgendaQueryIntent(options.userTranscript);

    if (classified) {
      return true;
    }

    if (isCalendarListQuestion(options.userTranscript)) {
      return true;
    }
  }

  return isCalendarAgendaResponseText(responseText);
}

function resolveVoiceSentenceLimit(responseText: string, options: FormatVoiceResponseOptions) {
  if (shouldPreserveFullCalendarAgenda(responseText, options)) {
    return CALENDAR_AGENDA_SENTENCE_LIMIT;
  }

  return options.maxSentences ?? 2;
}

const ROBOTIC_SPEECH_PATTERNS: RegExp[] = [
  /\byour next event\b/gi,
  /\bthe nearest upcoming event\b/gi,
  /\bnearest upcoming event\b/gi,
  /\byour schedule shows\b/gi,
  /\bcalendar summary\b/gi,
  /\bupcoming event\b/gi,
  /\byou have scheduled\b/gi,
  /\bthe calendar indicates\b/gi,
  /\bthe calendar shows\b/gi,
  /\baccording to your calendar\b/gi,
  /\byour next meeting is at\b/gi,
  /\bnext event is at\b/gi,
  /\bnext event is\b/gi,
  /\bnearest event\b/gi,
  /\bscheduled for\b/gi,
  /\bнаступна подія\b/gi,
  /\bнайближча подія\b/gi,
  /\bнайближча зустріч\b/gi,
  /\bу вашому календарі\b/gi,
  /\bближайшее событие\b/gi,
  /\bближайшая встреча\b/gi,
];

const FORMAL_TRIM_PATTERNS: RegExp[] = [
  /\bfor today\b/gi,
  /\bon your calendar\b/gi,
  /\bin your schedule\b/gi,
  /\bvisible google calendar events\b/gi,
  /\bauthoritative list\b/gi,
];

export function resolveSpokenUrgency(minutesUntilNextEvent: number | null): SpokenUrgency {
  if (minutesUntilNextEvent === null) {
    return 'free';
  }

  if (minutesUntilNextEvent < 10) {
    return 'immediate';
  }

  if (minutesUntilNextEvent < 60) {
    return 'soon';
  }

  return 'relaxed';
}

export function resolveSpokenDayLoad(visibleEventCount: number): SpokenDayLoad {
  if (visibleEventCount === 0) {
    return 'empty';
  }

  if (visibleEventCount <= 2) {
    return 'light';
  }

  if (visibleEventCount <= 3) {
    return 'steady';
  }

  return 'overloaded';
}

export function sanitizeRoboticSpeech(text: string) {
  let sanitized = text.trim();

  for (const pattern of ROBOTIC_SPEECH_PATTERNS) {
    sanitized = sanitized.replace(pattern, ' ');
  }

  for (const pattern of FORMAL_TRIM_PATTERNS) {
    sanitized = sanitized.replace(pattern, ' ');
  }

  return sanitized.replace(/\s{2,}/g, ' ').replace(/\s+([,.!?])/g, '$1').trim();
}

export function joinSpokenClauses(
  clauses: Array<string | null | undefined>,
  maxClauses = 2,
) {
  return clauses
    .map((clause) => clause?.trim())
    .filter(Boolean)
    .slice(0, maxClauses)
    .join(' ... ');
}

function splitIntoSentences(text: string) {
  return text
    .split(/(?<=[.!?…])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function limitSpokenSentences(text: string, maxSentences = 2) {
  const parts = splitIntoSentences(text);

  if (parts.length <= maxSentences) {
    return parts.join(' ');
  }

  return parts.slice(0, maxSentences).join(' ');
}

function injectSpokenPauses(
  text: string,
  urgency: SpokenUrgency = 'relaxed',
  maxSentences = 2,
) {
  const normalized = text
    .replace(/\s*[,;—–-]\s+/g, ' ... ')
    .replace(/\s+\.\.\.\s+\.\.\./g, ' ... ')
    .trim();

  const sentences = splitIntoSentences(normalized);

  if (sentences.length <= 1) {
    return normalized;
  }

  const pause = urgency === 'immediate' ? '. ' : ' ... ';
  return sentences.slice(0, maxSentences).join(pause);
}

function compressForListening(text: string) {
  return text
    .replace(/\bapproximately\b/gi, 'about')
    .replace(/\bприблизно\s+/gi, '')
    .replace(/\baround\s+around\b/gi, 'around')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Premium voice formatter: short, warm, pause-friendly text for TTS.
 */
export function formatVoiceResponse(text: string, options: FormatVoiceResponseOptions = {}) {
  const urgency = options.urgency ?? 'relaxed';
  const preserveAgenda = shouldPreserveFullCalendarAgenda(text, options);
  const maxSentences = resolveVoiceSentenceLimit(text, options);

  if (!text.trim()) {
    return '';
  }

  const sanitized = sanitizeRoboticSpeech(text);

  if (preserveAgenda) {
    console.log('[Voice Premium] formatVoiceResponse', {
      urgency,
      maxSentences: CALENDAR_AGENDA_SENTENCE_LIMIT,
      preserveAgenda: true,
      queryIntent: options.queryIntent ?? classifyCalendarAgendaQueryIntent(options.userTranscript ?? ''),
      inputLength: text.length,
      outputLength: sanitized.length,
      preview: sanitized.slice(0, 320),
    });

    return sanitized;
  }

  const limited = limitSpokenSentences(sanitized, maxSentences);
  const paced = options.preserveSentences
    ? limited
    : injectSpokenPauses(limited, urgency, maxSentences);
  const compressed = compressForListening(paced);

  console.log('[Voice Premium] formatVoiceResponse', {
    urgency,
    maxSentences,
    inputLength: text.length,
    outputLength: compressed.length,
    preview: compressed,
  });

  return compressed;
}

/** @deprecated Use formatVoiceResponse */
export function prepareTextForSpeech(text: string, maxSentences = 2) {
  return formatVoiceResponse(text, { maxSentences });
}

export function formatSpokenMinutesUntil(
  minutes: number,
  locale: VoiceLanguageChatLocale,
  style: 'precise' | 'soft' = 'soft',
) {
  const safeMinutes = Math.max(1, Math.round(minutes));

  if (style === 'soft') {
    if (safeMinutes < 10) {
      if (locale === 'uk') {
        return 'кілька хвилин';
      }

      if (locale === 'ru') {
        return 'несколько минут';
      }

      return 'a few minutes';
    }

    if (safeMinutes < 25) {
      if (locale === 'uk') {
        return 'хвилин десять';
      }

      if (locale === 'ru') {
        return 'минут десять';
      }

      return 'about ten minutes';
    }

    if (safeMinutes < 50) {
      if (locale === 'uk') {
        return 'хвилин тридцять';
      }

      if (locale === 'ru') {
        return 'минут тридцать';
      }

      return 'about half an hour';
    }

    if (safeMinutes < 90) {
      if (locale === 'uk') {
        return 'близько години';
      }

      if (locale === 'ru') {
        return 'около часа';
      }

      return 'about an hour';
    }

    if (locale === 'uk') {
      return 'приблизно дві години';
    }

    if (locale === 'ru') {
      return 'примерно два часа';
    }

    return 'about two hours';
  }

  if (locale === 'uk') {
    const mod10 = safeMinutes % 10;
    const mod100 = safeMinutes % 100;

    if (mod10 === 1 && mod100 !== 11) {
      return `${safeMinutes} хвилина`;
    }

    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) {
      return `${safeMinutes} хвилини`;
    }

    return `${safeMinutes} хвилин`;
  }

  if (locale === 'ru') {
    const mod10 = safeMinutes % 10;
    const mod100 = safeMinutes % 100;

    if (mod10 === 1 && mod100 !== 11) {
      return `${safeMinutes} минута`;
    }

    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) {
      return `${safeMinutes} минуты`;
    }

    return `${safeMinutes} минут`;
  }

  return `${safeMinutes} minutes`;
}
