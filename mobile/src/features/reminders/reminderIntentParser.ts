import { humanizeCalendarEventTitle } from '@/src/features/agent/calendar/calendarEventTitle';
import { getEventStartTimestamp } from '@/src/features/agent/calendar/calendarSchedule';
import type { CalendarEvent } from '@/src/entities/calendar/types';
import { parseSpokenClockTime } from '@/src/features/reminders/reminderTimeParser';

export type ReminderIntentKind = 'before_next_meeting' | 'at_time';

export type ParsedReminderIntent = {
  kind: ReminderIntentKind;
  title: string;
  scheduledFor: Date;
  leadTimeMinutes: number;
  sourceTranscript: string;
  relatedMeetingTitle?: string;
};

export type ReminderIntentParseContext = {
  referenceNow?: Date;
  nextMeeting?: CalendarEvent | null;
};

const BEFORE_NEXT_MEETING_PATTERNS = [
  /remind me(?: to)?\s+(\d+)\s*minutes?\s+before(?: my)?\s+next meeting/i,
  /remind me(?: to)?\s+(\d+)\s*mins?\s+before(?: my)?\s+next meeting/i,
  /нагадай(?:ти)?\s+(?:мені\s+)?за\s+(\d+)\s*хв(?:илин)?\s+до\s+(?:наступної\s+)?зустрічі/i,
  /напомни(?:ть)?\s+(?:мне\s+)?за\s+(\d+)\s*минут?\s+до\s+(?:следующей\s+)?встречи/i,
];

const AT_TIME_PATTERNS = [
  /remind me(?: to)?\s+(.+?)\s+at\s+(.+)$/i,
  /remind me(?: to)?\s+(.+?)\s+by\s+(.+)$/i,
  /нагадай(?:ти)?\s+(?:мені\s+)?(.+?)\s+о\s+(.+)$/i,
  /напомни(?:ть)?\s+(?:мне\s+)?(.+?)\s+в\s+(.+)$/i,
];

function normalizeTranscript(transcript: string) {
  return transcript.trim().replace(/\s+/g, ' ');
}

function cleanReminderTitle(rawTitle: string) {
  return rawTitle
    .trim()
    .replace(/^to\s+/i, '')
    .replace(/[.!?]+$/g, '')
    .trim();
}

function parseBeforeNextMeetingIntent(
  transcript: string,
  context: ReminderIntentParseContext,
): ParsedReminderIntent | null {
  for (const pattern of BEFORE_NEXT_MEETING_PATTERNS) {
    const match = transcript.match(pattern);

    if (!match) {
      continue;
    }

    const leadTimeMinutes = Number(match[1]);
    const nextMeeting = context.nextMeeting;

    if (!nextMeeting || !Number.isFinite(leadTimeMinutes) || leadTimeMinutes <= 0) {
      return null;
    }

    const meetingStart = getEventStartTimestamp(nextMeeting);

    if (meetingStart === null) {
      return null;
    }

    const referenceNow = context.referenceNow ?? new Date();
    const scheduledFor = new Date(meetingStart - leadTimeMinutes * 60 * 1000);

    if (scheduledFor.getTime() <= referenceNow.getTime()) {
      return null;
    }

    const meetingTitle = humanizeCalendarEventTitle(nextMeeting.title);

    return {
      kind: 'before_next_meeting',
      title: `Next meeting: ${meetingTitle}`,
      scheduledFor,
      leadTimeMinutes,
      sourceTranscript: transcript,
      relatedMeetingTitle: meetingTitle,
    };
  }

  return null;
}

function parseAtTimeIntent(
  transcript: string,
  context: ReminderIntentParseContext,
): ParsedReminderIntent | null {
  for (const pattern of AT_TIME_PATTERNS) {
    const match = transcript.match(pattern);

    if (!match) {
      continue;
    }

    const title = cleanReminderTitle(match[1] ?? '');
    const timeExpression = (match[2] ?? '').trim();

    if (!title || !timeExpression) {
      return null;
    }

    const referenceNow = context.referenceNow ?? new Date();
    const scheduledFor = parseSpokenClockTime(timeExpression, referenceNow);

    if (!scheduledFor || scheduledFor.getTime() <= referenceNow.getTime()) {
      return null;
    }

    return {
      kind: 'at_time',
      title: humanizeCalendarEventTitle(title.charAt(0).toUpperCase() + title.slice(1)),
      scheduledFor,
      leadTimeMinutes: 0,
      sourceTranscript: transcript,
    };
  }

  return null;
}

export function parseReminderIntent(
  transcript: string,
  context: ReminderIntentParseContext = {},
): ParsedReminderIntent | null {
  const normalizedTranscript = normalizeTranscript(transcript);

  if (!normalizedTranscript) {
    return null;
  }

  return (
    parseBeforeNextMeetingIntent(normalizedTranscript, context) ??
    parseAtTimeIntent(normalizedTranscript, context)
  );
}
