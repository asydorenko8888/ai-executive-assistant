import {
  assessCalendarCreateReadiness,
  assessCalendarDeleteReadiness,
  assessCalendarUpdateReadiness,
} from '@/src/features/agent/calendar/calendarAmbiguousCommandSafety';
import {
  extractCalendarCommand,
  getCalendarExtractionConfidenceThreshold,
  isCalendarExtractionExecutable,
} from '@/src/features/agent/calendar/calendarCommandExtractor';
import {
  extractCalendarUpdateParameters,
  type CalendarUpdateMissingField,
} from '@/src/features/agent/calendar/calendarUpdateIntentExtractor';
import { parseOperationalScheduleHint } from '@/src/features/agent/calendar/operationalScheduleParser';
import { parseCalendarCreateSchedule } from '@/src/features/agent/calendar/calendarCreateScheduleParser';
import {
  isOperationalCalendarCreateRequest,
  isOperationalCalendarDeleteRequest,
  isOperationalCalendarUpdateRequest,
} from '@/src/features/agent/intent/operationalCalendarWriteDetection';
import { detectCalendarCreateByTitleTimePattern } from '@/src/features/agent/calendar/calendarCreateByTitleTime';
import { isCalendarFreeTimeTodayQuery } from '@/src/features/agent/calendar/calendarFreeTimeQuery';
import { isCalendarExactTimeReadQuery } from '@/src/features/agent/calendarIntelligence/calendarExactTimeReadDetection';
import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';
import { getChatLocaleFromVoiceLanguage } from '@/src/features/chat/services/voiceLanguage';

export type ActionRequiredField = 'title' | 'date' | 'time' | 'confidence';

export type ActionFieldValidation = {
  actionKind: 'create_calendar_event' | 'delete_calendar_event' | 'update_calendar_event' | 'reminder' | 'none';
  requiredFields: ActionRequiredField[];
  missingFields: ActionRequiredField[];
  readyToExecute: boolean;
  extractionConfidence: number;
};

function mapUpdateMissingFields(missingFields: CalendarUpdateMissingField[]): ActionRequiredField[] {
  const mapped = new Set<ActionRequiredField>();

  for (const field of missingFields) {
    if (field === 'title') {
      mapped.add('title');
      continue;
    }

    mapped.add('time');
  }

  return [...mapped];
}

function detectActionKind(transcript: string): ActionFieldValidation['actionKind'] {
  if (isCalendarExactTimeReadQuery(transcript) || isCalendarFreeTimeTodayQuery(transcript)) {
    return 'none';
  }

  if (isOperationalCalendarDeleteRequest(transcript)) {
    return 'delete_calendar_event';
  }

  if (isOperationalCalendarUpdateRequest(transcript)) {
    return 'update_calendar_event';
  }

  if (isOperationalCalendarCreateRequest(transcript)) {
    return 'create_calendar_event';
  }

  if (/\b(?:remind|reminder|нагадай|напомни)\b/iu.test(transcript)) {
    return 'reminder';
  }

  return 'none';
}

export function validateActionFields(params: {
  transcript: string;
  referenceNow: Date;
}): ActionFieldValidation {
  const actionKind = detectActionKind(params.transcript);

  if (actionKind === 'none') {
    return {
      actionKind,
      requiredFields: [],
      missingFields: [],
      readyToExecute: false,
      extractionConfidence: 0,
    };
  }

  if (actionKind === 'reminder') {
    return {
      actionKind,
      requiredFields: ['title', 'time'],
      missingFields: [],
      readyToExecute: true,
      extractionConfidence: 1,
    };
  }

  if (actionKind === 'delete_calendar_event') {
    const readiness = assessCalendarDeleteReadiness(params);

    return {
      actionKind,
      requiredFields: ['title'],
      missingFields: readiness.ready ? [] : ['title'],
      readyToExecute: readiness.ready,
      extractionConfidence: readiness.ready ? 1 : 0,
    };
  }

  if (actionKind === 'update_calendar_event') {
    const readiness = assessCalendarUpdateReadiness(params);
    const extracted = extractCalendarUpdateParameters(params.transcript, params.referenceNow);
    const missingFields = readiness.ready
      ? []
      : mapUpdateMissingFields(extracted.missingFields);

    return {
      actionKind,
      requiredFields: ['title', 'time'],
      missingFields,
      readyToExecute: readiness.ready,
      extractionConfidence: extracted.title ? 1 : 0,
    };
  }

  const extraction = extractCalendarCommand({
    transcript: params.transcript,
    referenceNow: params.referenceNow,
  });
  const readiness = assessCalendarCreateReadiness(params);
  const threshold = getCalendarExtractionConfidenceThreshold();

  const requiredFields: ActionRequiredField[] = ['title', 'date', 'time', 'confidence'];
  const missingFields: ActionRequiredField[] = [];

  if (!readiness.ready) {
    for (const field of readiness.missingFields) {
      if (field === 'title') {
        missingFields.push('title');
      } else if (field === 'date') {
        missingFields.push('date');
      } else {
        missingFields.push('time');
      }
    }
  }

  if (extraction.confidence < threshold) {
    missingFields.push('confidence');
  }

  const titleTimePattern = detectCalendarCreateByTitleTimePattern(params.transcript);
  const schedule = parseCalendarCreateSchedule(params.transcript, params.referenceNow);
  const readyFromExtraction = isCalendarExtractionExecutable(extraction);
  const readyFromTitleTime =
    Boolean(titleTimePattern) &&
    schedule.ok &&
    Boolean(extraction.title) &&
    extraction.title.length >= 2;

  if (readyFromTitleTime && !readyFromExtraction) {
    console.log('[ACTION MODE FALLBACK CREATE]');
    console.log(
      JSON.stringify({
        patternId: titleTimePattern?.patternId,
        title: extraction.title,
        scheduleStart: new Date(schedule.startMs).toISOString(),
      }),
    );
  }

  return {
    actionKind,
    requiredFields,
    missingFields: readiness.ready || readyFromTitleTime ? [] : [...new Set(missingFields)],
    readyToExecute: readiness.ready && (readyFromExtraction || readyFromTitleTime),
    extractionConfidence: readyFromTitleTime
      ? Math.max(extraction.confidence, threshold)
      : extraction.confidence,
  };
}

export function buildClarificationQuestion(params: {
  missingFields: ActionRequiredField[];
  languageCode: VoiceLanguageCode;
}) {
  const locale = getChatLocaleFromVoiceLanguage(params.languageCode);
  const missing = new Set(params.missingFields);

  if (missing.has('confidence') || (missing.has('title') && missing.has('time'))) {
    if (locale === 'uk') {
      return 'Уточни, будь ласка: назву події і точний час.';
    }

    if (locale === 'ru') {
      return 'Уточни, пожалуйста: название события и точное время.';
    }

    return 'Please confirm the event title and exact time.';
  }

  if (missing.has('title')) {
    if (locale === 'uk') {
      return 'Як назвати подію?';
    }

    if (locale === 'ru') {
      return 'Как назвать событие?';
    }

    return 'What should I call this event?';
  }

  if (missing.has('time')) {
    if (locale === 'uk') {
      return 'На який час?';
    }

    if (locale === 'ru') {
      return 'На какое время?';
    }

    return 'What time should I schedule it?';
  }

  if (missing.has('date')) {
    if (locale === 'uk') {
      return 'На який день?';
    }

    if (locale === 'ru') {
      return 'На какой день?';
    }

    return 'Which day should I schedule it?';
  }

  if (locale === 'uk') {
    return 'Уточни, будь ласка, назву і час.';
  }

  if (locale === 'ru') {
    return 'Уточни, пожалуйста, название и время.';
  }

  return 'Please share the event title and time.';
}
