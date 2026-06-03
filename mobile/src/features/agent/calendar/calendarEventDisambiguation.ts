import type { CalendarEvent } from '@/src/entities/calendar/types';
import { getExecutiveCalendarTimezone, resolveZonedDayOffsetForInstant } from '@/src/features/agent/calendar/calendarTimezone';
import { parseCalendarClockMinutes } from '@/src/features/agent/calendarIntelligence/calendarClockParser';
import { resolveTargetDayContext } from '@/src/features/agent/calendarIntelligence/resolveTargetDay';
import { formatWallClockLabel } from '@/src/features/agent/calendarIntelligence/calendarWallClockLabel';

export type CalendarDisambiguationCandidate = {
  eventId: string;
  title: string;
  startsAt: string;
  endsAt: string;
};

export type CalendarDisambiguationLocale = 'en' | 'uk' | 'ru';

export function calendarEventsToDisambiguationCandidates(
  events: CalendarEvent[],
): CalendarDisambiguationCandidate[] {
  return events.map((event) => ({
    eventId: event.id,
    title: event.title,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
  }));
}

function dayLabelForEvent(startsAt: string, referenceNow: Date, timeZone: string, locale: CalendarDisambiguationLocale) {
  const offset = resolveZonedDayOffsetForInstant(startsAt, referenceNow, timeZone);

  if (offset === 1) {
    if (locale === 'uk') {
      return 'Завтра';
    }

    if (locale === 'ru') {
      return 'Завтра';
    }

    return 'Tomorrow';
  }

  if (offset === 0) {
    if (locale === 'uk') {
      return 'Сьогодні';
    }

    if (locale === 'ru') {
      return 'Сегодня';
    }

    return 'Today';
  }

  return new Intl.DateTimeFormat(locale === 'uk' ? 'uk-UA' : locale === 'ru' ? 'ru-RU' : 'en-US', {
    timeZone,
    month: 'short',
    day: 'numeric',
  }).format(new Date(startsAt));
}

export function formatDisambiguationOptionLabel(params: {
  candidate: CalendarDisambiguationCandidate;
  referenceNow: Date;
  timeZone?: string;
  locale: CalendarDisambiguationLocale;
}) {
  const timeZone = params.timeZone ?? getExecutiveCalendarTimezone();
  const startMs = Date.parse(params.candidate.startsAt);

  if (Number.isNaN(startMs)) {
    return params.candidate.title;
  }

  const day = resolveTargetDayContext('', params.referenceNow, timeZone);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(new Date(startMs));
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? 0);
  const clockLabel = formatWallClockLabel(hour * 60 + minute, day);
  const dayLabel = dayLabelForEvent(params.candidate.startsAt, params.referenceNow, timeZone, params.locale);

  return `${dayLabel}, ${clockLabel}`;
}

export function buildCalendarEventDisambiguationReply(params: {
  locale: CalendarDisambiguationLocale;
  action: 'delete' | 'update';
  title: string;
  candidates: CalendarDisambiguationCandidate[];
  referenceNow: Date;
  timeZone?: string;
}) {
  const title = params.title.trim() || params.candidates[0]?.title.trim() || 'event';
  const lines = params.candidates.map((candidate, index) => {
    const label = formatDisambiguationOptionLabel({
      candidate,
      referenceNow: params.referenceNow,
      timeZone: params.timeZone,
      locale: params.locale,
    });

    return `${index + 1}. ${label}`;
  });

  if (params.locale === 'uk') {
    const verb = params.action === 'delete' ? 'видалити' : 'перенести';

    return `Я знайшов кілька подій «${title}». Яку ${verb}?\n${lines.join('\n')}`;
  }

  if (params.locale === 'ru') {
    const verb = params.action === 'delete' ? 'удалить' : 'перенести';

    return `Я нашёл несколько событий «${title}». Какое ${verb}?\n${lines.join('\n')}`;
  }

  const verb = params.action === 'delete' ? 'delete' : 'move';

  return `I found several events named "${title}". Which one should I ${verb}?\n${lines.join('\n')}`;
}

export function resolveDisambiguationSelection(params: {
  reply: string;
  candidates: CalendarDisambiguationCandidate[];
  referenceNow: Date;
  timeZone?: string;
}): CalendarDisambiguationCandidate | null {
  const reply = params.reply.trim();

  if (!reply || params.candidates.length === 0) {
    return null;
  }

  const numericMatch = reply.match(/^(?:варіант|option|номер|#)?\s*(\d+)\s*\.?$/iu);

  if (numericMatch) {
    const index = Number(numericMatch[1]) - 1;

    if (index >= 0 && index < params.candidates.length) {
      return params.candidates[index] ?? null;
    }
  }

  const timeZone = params.timeZone ?? getExecutiveCalendarTimezone();
  const day = resolveTargetDayContext(reply, params.referenceNow, timeZone);
  const clockMinutes = parseCalendarClockMinutes(reply, day);

  if (clockMinutes !== null) {
    const clockMatches = params.candidates.filter((candidate) => {
      const startMs = Date.parse(candidate.startsAt);

      if (Number.isNaN(startMs)) {
        return false;
      }

      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        hour: 'numeric',
        minute: 'numeric',
        hour12: false,
      }).formatToParts(new Date(startMs));
      const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? 0);
      const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? 0);

      return hour * 60 + minute === clockMinutes;
    });

    if (clockMatches.length === 1) {
      return clockMatches[0] ?? null;
    }
  }

  const dayOffset = day.dayOffset;
  const dayMatches = params.candidates.filter((candidate) => {
    const offset = resolveZonedDayOffsetForInstant(candidate.startsAt, params.referenceNow, timeZone);

    return offset === dayOffset;
  });

  if (dayMatches.length === 1) {
    return dayMatches[0] ?? null;
  }

  return null;
}

export function buildTranscriptFromSelectedDisambiguationCandidate(params: {
  action: 'delete' | 'update';
  candidate: CalendarDisambiguationCandidate;
  sourceTranscript: string;
}) {
  const title = params.candidate.title.trim();
  const usesCyrillic = /[а-яёіїєґ]/iu.test(params.sourceTranscript);

  if (params.action === 'delete') {
    return usesCyrillic ? `Удали ${title}` : `Delete ${title}`;
  }

  return usesCyrillic ? `Перенеси ${title}` : `Move ${title}`;
}

export function buildActionModeFailureReply(languageCode: string) {
  if (languageCode.startsWith('uk')) {
    return 'Не зміг виконати дію. Уточніть, будь ласка, назву події і час.';
  }

  if (languageCode.startsWith('ru')) {
    return 'Не удалось выполнить действие. Уточните, пожалуйста, название события и время.';
  }

  return "I couldn't complete that action. Please clarify the event name and time.";
}
