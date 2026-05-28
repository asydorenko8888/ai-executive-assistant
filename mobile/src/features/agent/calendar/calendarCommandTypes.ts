import {
  isOperationalCalendarCreateRequest,
  isOperationalCalendarDeleteRequest,
} from '@/src/features/agent/intent/operationalCalendarWriteDetection';

export type CalendarCommandKind = 'create_calendar_event' | 'delete_calendar_event' | 'none';

export function detectCalendarCommandIntent(transcript: string): CalendarCommandKind {
  const normalized = transcript.trim();

  if (!normalized) {
    return 'none';
  }

  if (isOperationalCalendarDeleteRequest(normalized)) {
    return 'delete_calendar_event';
  }

  if (isOperationalCalendarCreateRequest(normalized)) {
    return 'create_calendar_event';
  }

  return 'none';
}

export function isCalendarCommandIntent(kind: CalendarCommandKind) {
  return kind === 'create_calendar_event' || kind === 'delete_calendar_event';
}
