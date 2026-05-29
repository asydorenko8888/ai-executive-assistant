import {
  extractCalendarCommand,
  getCalendarExtractionConfidenceThreshold,
  isCalendarExtractionExecutable,
} from '@/src/features/agent/calendar/calendarCommandExtractor';
import { parseOperationalScheduleHint } from '@/src/features/agent/calendar/operationalScheduleParser';
import {
  isOperationalCalendarCreateRequest,
  isOperationalCalendarDeleteRequest,
  isOperationalCalendarUpdateRequest,
} from '@/src/features/agent/intent/operationalCalendarWriteDetection';
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

function detectActionKind(transcript: string): ActionFieldValidation['actionKind'] {
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

  const extraction = extractCalendarCommand({
    transcript: params.transcript,
    referenceNow: params.referenceNow,
  });

  const threshold = getCalendarExtractionConfidenceThreshold();

  if (actionKind === 'delete_calendar_event') {
    const missingFields: ActionRequiredField[] = [];

    if (!extraction.title || extraction.title.length < 2) {
      missingFields.push('title');
    }

    if (extraction.confidence < threshold) {
      missingFields.push('confidence');
    }

    return {
      actionKind,
      requiredFields: ['title', 'confidence'],
      missingFields,
      readyToExecute:
        missingFields.length === 0 &&
        extraction.confidence >= threshold &&
        Boolean(extraction.title),
      extractionConfidence: extraction.confidence,
    };
  }

  const requiredFields: ActionRequiredField[] = ['title', 'date', 'time', 'confidence'];
  const missingFields: ActionRequiredField[] = [];

  if (!extraction.title || extraction.title.length < 2) {
    missingFields.push('title');
  }

  const schedule = parseOperationalScheduleHint(params.transcript, params.referenceNow);

  if (!schedule.ok) {
    missingFields.push('date', 'time');
  } else if (!schedule.hasExplicitTime) {
    missingFields.push('time');
  }

  if (extraction.confidence < threshold) {
    missingFields.push('confidence');
  }

  return {
    actionKind,
    requiredFields,
    missingFields,
    readyToExecute: isCalendarExtractionExecutable(extraction),
    extractionConfidence: extraction.confidence,
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
