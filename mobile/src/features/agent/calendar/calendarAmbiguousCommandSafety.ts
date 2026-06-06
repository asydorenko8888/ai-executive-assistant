import { extractCreateEventTitle } from '@/src/features/agent/calendar/calendarCreateIntentExtractor';
import { parseCalendarCreateSchedule } from '@/src/features/agent/calendar/calendarCreateScheduleParser';
import { resolveMoveEventReference } from '@/src/features/agent/calendar/calendarConversationEventMemory';
import { extractDeleteEventTitle } from '@/src/features/agent/calendar/calendarDeleteIntentExtractor';
import {
  isEventPronounReference,
  transcriptHasEventPronounReference,
} from '@/src/features/agent/calendar/calendarEventReferenceTokens';
import {
  isExplicitDurationPhrase,
  isRelativeScheduleShiftPhrase,
} from '@/src/features/agent/calendar/calendarSpokenTime';
import {
  extractCalendarUpdateParameters,
  type CalendarUpdateMissingField,
} from '@/src/features/agent/calendar/calendarUpdateIntentExtractor';
import { parseCalendarUpdateSchedule } from '@/src/features/agent/calendar/calendarUpdateScheduleParser';
import { parseNaturalDayOffset } from '@/src/features/agent/calendarIntelligence/calendarNaturalDateParser';
import { parseCalendarClockMinutes } from '@/src/features/agent/calendarIntelligence/calendarClockParser';
import { resolveTargetDayContext } from '@/src/features/agent/calendarIntelligence/resolveTargetDay';
import { getExecutiveCalendarTimezone } from '@/src/features/agent/calendar/calendarTimezone';
import {
  getChatLocaleFromVoiceLanguage,
  type VoiceLanguageCode,
} from '@/src/features/chat/services/voiceLanguageLocale';

export type CalendarMutationField = 'title' | 'date' | 'startTime' | 'endTime';

export type CalendarMutationAmbiguityReason =
  | 'vague_relative_shift'
  | 'duration_without_start'
  | 'date_without_time'
  | 'missing_title'
  | 'missing_schedule'
  | 'missing_target';

export type CalendarMutationReadiness = {
  ready: boolean;
  missingFields: CalendarMutationField[];
  ambiguityReason: CalendarMutationAmbiguityReason | null;
  detail: string | null;
};

const EXPLICIT_RELATIVE_SHIFT =
  /\b\d+\s*(?:hours?|hrs?|minutes?|mins?|час(?:а|ов|у)?|годин(?:у|и|ы)?|минут(?:ы|у)?|хвилин(?:и|у)?)\s+(?:later|earlier|позже|пізніше|раньше|раніше)\b/iu;

const EXPLICIT_UNIT_RELATIVE_SHIFT =
  /\b(?:an?\s+hour|one\s+hour|half\s+an?\s+hour|полчаса|півгодини|полтора\s+часа|півтора\s+години)\s+(?:later|earlier|позже|пізніше|раньше|раніше)\b/iu;

const DURATION_ONLY_WITHOUT_START =
  /(?:^|[\s,.;:!?—-]+)(?:for|на)\s+(?:an?\s+)?(?:hour|час)(?:s)?(?:[,.!\s]|$)/iu;

function hasExplicitDayWithoutTime(transcript: string, referenceNow: Date, timeZone: string) {
  const dayOffset = parseNaturalDayOffset(transcript, referenceNow, timeZone);

  if (dayOffset === null) {
    return false;
  }

  const day = resolveTargetDayContext(transcript, referenceNow, timeZone);

  return parseCalendarClockMinutes(transcript, day) === null;
}

export function isVagueRelativeShiftCommand(transcript: string) {
  const normalized = transcript.trim();

  if (!normalized) {
    return false;
  }

  if (!/\b(?:later|earlier|позже|пізніше|раньше|раніше)\b/iu.test(normalized)) {
    return false;
  }

  if (
    isRelativeScheduleShiftPhrase(normalized) ||
    EXPLICIT_RELATIVE_SHIFT.test(normalized) ||
    EXPLICIT_UNIT_RELATIVE_SHIFT.test(normalized)
  ) {
    return false;
  }

  return /\b(?:move|перенеси|перенести|здвинь|зсунь|shift|reschedule)\b/iu.test(normalized);
}

export function isDurationOnlyCreateCommand(transcript: string) {
  const normalized = transcript.trim();

  if (!normalized) {
    return false;
  }

  const hasDurationOnly =
    DURATION_ONLY_WITHOUT_START.test(normalized) ||
    (isExplicitDurationPhrase(normalized) && !isRelativeScheduleShiftPhrase(normalized));

  if (!hasDurationOnly) {
    return false;
  }

  const timeZone = getExecutiveCalendarTimezone();
  const day = resolveTargetDayContext(normalized, new Date(), timeZone);

  return parseCalendarClockMinutes(normalized, day) === null;
}

export function assessCalendarCreateReadiness(params: {
  transcript: string;
  referenceNow: Date;
}): CalendarMutationReadiness {
  const transcript = params.transcript.trim();
  const timeZone = getExecutiveCalendarTimezone();
  const title = extractCreateEventTitle(transcript) ?? '';
  const schedule = parseCalendarCreateSchedule(transcript, params.referenceNow, timeZone);
  const missingFields: CalendarMutationField[] = [];

  if (!title || title.length < 2) {
    missingFields.push('title');
  }

  if (isDurationOnlyCreateCommand(transcript)) {
    return {
      ready: false,
      missingFields: [...new Set([...missingFields, 'startTime'])],
      ambiguityReason: 'duration_without_start',
      detail: 'Duration is present but start time is not',
    };
  }

  if (!schedule.ok) {
    if (hasExplicitDayWithoutTime(transcript, params.referenceNow, timeZone)) {
      return {
        ready: false,
        missingFields: [...new Set([...missingFields, 'startTime', 'endTime'])],
        ambiguityReason: 'date_without_time',
        detail: 'Day is present but clock time is not',
      };
    }

    if (title) {
      missingFields.push('date', 'startTime', 'endTime');
    }

    return {
      ready: false,
      missingFields: [...new Set(missingFields)],
      ambiguityReason: missingFields.includes('title') ? 'missing_title' : 'missing_schedule',
      detail: schedule.detail,
    };
  }

  return {
    ready: true,
    missingFields: [],
    ambiguityReason: null,
    detail: null,
  };
}

function mapUpdateMissingFields(fields: CalendarUpdateMissingField[]): CalendarMutationField[] {
  const mapped = new Set<CalendarMutationField>();

  for (const field of fields) {
    if (field === 'title') {
      mapped.add('title');
      continue;
    }

    mapped.add('startTime');
  }

  return [...mapped];
}

export function assessCalendarUpdateReadiness(params: {
  transcript: string;
  referenceNow: Date;
}): CalendarMutationReadiness {
  const transcript = params.transcript.trim();

  if (isVagueRelativeShiftCommand(transcript)) {
    return {
      ready: false,
      missingFields: ['startTime'],
      ambiguityReason: 'vague_relative_shift',
      detail: 'Relative shift direction is present without a concrete amount',
    };
  }

  const extracted = extractCalendarUpdateParameters(transcript, params.referenceNow);
  const schedule = parseCalendarUpdateSchedule(transcript, params.referenceNow);

  if (extracted.readyToExecute) {
    return {
      ready: true,
      missingFields: [],
      ambiguityReason: null,
      detail: null,
    };
  }

  const missingFields = mapUpdateMissingFields(extracted.missingFields);

  if (!schedule.ok && extracted.title) {
    if (!missingFields.includes('startTime')) {
      missingFields.push('startTime');
    }
  }

  return {
    ready: false,
    missingFields,
    ambiguityReason: !extracted.title ? 'missing_target' : 'missing_schedule',
    detail: schedule.ok ? null : schedule.detail,
  };
}

export function assessCalendarDeleteReadiness(params: {
  transcript: string;
  referenceNow: Date;
}): CalendarMutationReadiness {
  const transcript = params.transcript.trim();
  const extractedTitle = extractDeleteEventTitle(transcript)?.trim() ?? '';
  const memoryRef = resolveMoveEventReference(params.referenceNow);
  const hasPronoun = transcriptHasEventPronounReference(transcript);
  const hasTitle = Boolean(extractedTitle) && !isEventPronounReference(extractedTitle);
  const hasTarget = hasPronoun || hasTitle || Boolean(memoryRef?.title);

  if (!hasTarget) {
    return {
      ready: false,
      missingFields: ['title'],
      ambiguityReason: 'missing_target',
      detail: 'No event title or active reference for delete',
    };
  }

  return {
    ready: true,
    missingFields: [],
    ambiguityReason: null,
    detail: null,
  };
}

export function assessCalendarMutationReadiness(params: {
  transcript: string;
  referenceNow: Date;
  intent: 'create_calendar_event' | 'update_calendar_event' | 'delete_calendar_event';
}): CalendarMutationReadiness {
  if (params.intent === 'create_calendar_event') {
    return assessCalendarCreateReadiness(params);
  }

  if (params.intent === 'update_calendar_event') {
    return assessCalendarUpdateReadiness(params);
  }

  return assessCalendarDeleteReadiness(params);
}

export function buildCalendarMutationClarificationReply(params: {
  readiness: CalendarMutationReadiness;
  languageCode: VoiceLanguageCode;
  intent: 'create_calendar_event' | 'update_calendar_event' | 'delete_calendar_event';
}) {
  const locale = getChatLocaleFromVoiceLanguage(params.languageCode);
  const reason = params.readiness.ambiguityReason;

  if (reason === 'vague_relative_shift') {
    if (locale === 'uk') {
      return 'На скільки перенести подію — на 30 хвилин, годину чи до конкретного часу?';
    }

    if (locale === 'ru') {
      return 'На сколько перенести событие — на 30 минут, на час или на конкретное время?';
    }

    return 'How much later or earlier should I move it — 30 minutes, one hour, or a specific time?';
  }

  if (reason === 'duration_without_start') {
    if (locale === 'uk') {
      return 'На який час почати подію? Тривалість я вже зрозумів.';
    }

    if (locale === 'ru') {
      return 'На какое время начать событие? Длительность я уже понял.';
    }

    return 'What start time should I use? I understood the duration, but not when it should begin.';
  }

  if (reason === 'date_without_time') {
    if (locale === 'uk') {
      return 'На який день і на який час запланувати подію?';
    }

    if (locale === 'ru') {
      return 'На какой день и на какое время запланировать событие?';
    }

    return 'Which day and what time should I schedule it?';
  }

  if (params.readiness.missingFields.includes('title')) {
    if (locale === 'uk') {
      return 'Яку подію маємо на увазі?';
    }

    if (locale === 'ru') {
      return 'Какое событие имеется в виду?';
    }

    return 'Which event should I use?';
  }

  if (params.intent === 'delete_calendar_event') {
    if (locale === 'uk') {
      return 'Яку подію видалити?';
    }

    if (locale === 'ru') {
      return 'Какое событие удалить?';
    }

    return 'Which event should I delete?';
  }

  if (params.readiness.missingFields.includes('startTime') || params.readiness.missingFields.includes('date')) {
    if (locale === 'uk') {
      return 'Уточни, будь ласка, дату й точний час.';
    }

    if (locale === 'ru') {
      return 'Уточни, пожалуйста, дату и точное время.';
    }

    return 'Please confirm the date and exact time.';
  }

  if (locale === 'uk') {
    return 'Уточни, будь ласка, назву події, дату й час.';
  }

  if (locale === 'ru') {
    return 'Уточни, пожалуйста, название события, дату и время.';
  }

  return 'Please confirm the event title, date, and time.';
}
