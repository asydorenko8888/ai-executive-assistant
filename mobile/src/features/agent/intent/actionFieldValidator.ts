import { extractCalendarEventTitle } from '@/src/features/agent/calendar/calendarTitleExtractor';
import { parseOperationalScheduleHint } from '@/src/features/agent/execution/calendarEventPayloadBuilder';
import {
  isOperationalCalendarCreateRequest,
  isOperationalCalendarDeleteRequest,
  isOperationalCalendarUpdateRequest,
} from '@/src/features/agent/intent/operationalCalendarWriteDetection';
import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';
import { getChatLocaleFromVoiceLanguage } from '@/src/features/chat/services/voiceLanguage';

export type ActionRequiredField = 'title' | 'date' | 'time';

export type ActionFieldValidation = {
  actionKind: 'create_calendar_event' | 'delete_calendar_event' | 'update_calendar_event' | 'reminder' | 'none';
  requiredFields: ActionRequiredField[];
  missingFields: ActionRequiredField[];
  readyToExecute: boolean;
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
    };
  }

  if (actionKind === 'reminder') {
    return {
      actionKind,
      requiredFields: ['title', 'time'],
      missingFields: [],
      readyToExecute: true,
    };
  }

  const requiredFields: ActionRequiredField[] = ['title', 'date', 'time'];
  const missingFields: ActionRequiredField[] = [];
  const title = extractCalendarEventTitle(params.transcript)?.trim() ?? '';

  if (!title || title.length < 2) {
    missingFields.push('title');
  }

  const schedule = parseOperationalScheduleHint(params.transcript, params.referenceNow);

  if (!schedule.ok) {
    missingFields.push('date', 'time');
  } else if (!schedule.hasExplicitTime) {
    missingFields.push('time');
  }

  return {
    actionKind,
    requiredFields,
    missingFields,
    readyToExecute: missingFields.length === 0,
  };
}

export function buildClarificationQuestion(params: {
  missingFields: ActionRequiredField[];
  languageCode: VoiceLanguageCode;
}) {
  const locale = getChatLocaleFromVoiceLanguage(params.languageCode);
  const missing = new Set(params.missingFields);

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
