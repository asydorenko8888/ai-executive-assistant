import { getActiveCalendarEvent } from '@/src/features/agent/calendar/calendarActiveEventContext';
import { transcriptHasEventPronounReference } from '@/src/features/agent/calendar/calendarEventReferenceTokens';
import {
  formatCalendarClock24ForUi,
  formatCalendarDayPhrase,
} from '@/src/features/agent/calendar/calendarScheduleDisplay';
import { parseGoogleCalendarInstant } from '@/src/features/agent/calendar/calendarTime';
import { getExecutiveCalendarTimezone } from '@/src/features/agent/calendar/calendarTimezone';
import {
  getChatLocaleFromVoiceLanguage,
  type VoiceLanguageCode,
} from '@/src/features/chat/services/voiceLanguageLocale';

const WALL_CLOCK_NOW_HINT =
  /\b(?:now|right now|сейчас|зараз|currently|at the moment)\b/iu;

const PRONOUN_EVENT_TIME_QUERY =
  /^(?:what time is (?:it|that|this)(?:\s+scheduled)?|when is (?:it|that|this)|when'?s (?:it|that|this)|во сколько (?:оно|это|она|он)|когда (?:оно|это|она|он)(?:\s+начинается|\s+начн(?:е|ё)тся)?|кот(?:орая|ый)\s+час\s+(?:у\s+)?(?:него|неё|нее|н[её]го)|(?:котор(?:ую|ое)|какое)\s+время)(?:\?)?$/iu;

const SHORT_PRONOUN_TIME_QUERY = /^(?:what time is it|when is it)(?:\?)?$/iu;

export function isCalendarReferencedEventTimeQuery(transcript: string) {
  const normalized = transcript.trim();

  if (!normalized || WALL_CLOCK_NOW_HINT.test(normalized)) {
    return false;
  }

  if (PRONOUN_EVENT_TIME_QUERY.test(normalized)) {
    return true;
  }

  return SHORT_PRONOUN_TIME_QUERY.test(normalized);
}

export function tryBuildReferencedEventTimeReply(params: {
  transcript: string;
  referenceNow: Date;
  languageCode: VoiceLanguageCode;
}): string | null {
  if (!isCalendarReferencedEventTimeQuery(params.transcript)) {
    return null;
  }

  const active = getActiveCalendarEvent(params.referenceNow);

  if (!active) {
    return null;
  }

  const locale = getChatLocaleFromVoiceLanguage(params.languageCode);
  const timeZone = getExecutiveCalendarTimezone();
  const startMs = parseGoogleCalendarInstant(active.startISO);

  if (startMs === null) {
    return null;
  }

  const dayLabel = formatCalendarDayPhrase(startMs, params.referenceNow.getTime(), locale, timeZone);
  const clockLabel = formatCalendarClock24ForUi(startMs, timeZone);
  const title = active.title.trim();

  if (locale === 'uk') {
    return `${title} — ${dayLabel}, ${clockLabel}.`;
  }

  if (locale === 'ru') {
    return `${title} — ${dayLabel}, ${clockLabel}.`;
  }

  return `${title} is scheduled for ${dayLabel}, ${clockLabel}.`;
}

export function transcriptUsesReferencedEventTimeQuery(transcript: string) {
  const normalized = transcript.trim();

  if (!normalized) {
    return false;
  }

  return (
    isCalendarReferencedEventTimeQuery(normalized) ||
    (transcriptHasEventPronounReference(normalized) &&
      /\b(?:what time|when is|во сколько|когда)\b/iu.test(normalized) &&
      !WALL_CLOCK_NOW_HINT.test(normalized))
  );
}
