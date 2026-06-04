import type { CalendarEvent } from '@/src/entities/calendar/types';
import { calendarConversationTitlesMatch } from '@/src/features/agent/calendar/calendarConversationTitleMatch';
import { extractDeleteEventTitle } from '@/src/features/agent/calendar/calendarDeleteIntentExtractor';
import { getExecutiveCalendarTimezone, resolveZonedDayOffsetForInstant } from '@/src/features/agent/calendar/calendarTimezone';
import { parseCalendarClockMinutes } from '@/src/features/agent/calendarIntelligence/calendarClockParser';
import { resolveTargetDayContext } from '@/src/features/agent/calendarIntelligence/resolveTargetDay';
import { formatWallClockLabel } from '@/src/features/agent/calendarIntelligence/calendarWallClockLabel';

export type CalendarDisambiguationCandidate = {
  eventId: string;
  title: string;
  startsAt: string;
  endsAt: string;
  calendarId?: string | null;
};

/** When exact clock match fails, allow moved events within this window (minutes). */
const DISAMBIGUATION_CLOCK_TOLERANCE_MINUTES = 90;

const CYRILLIC_ORDINAL_REPLY =
  /^(?:the\s+)?(перв(?:ое|ый|а|ую)|перш(?:е|ий|а|у)|втор(?:ое|ой|а|у)|друг(?:ое|ой|а|у)|треть(?:е|я|ь|ю)|четверт(?:ое|ый|а|ю)|третє|четверте)(?:\s+one|\s+option|\s+event)?\.?$/iu;

function getCandidateLocalClockMinutes(startsAt: string, timeZone: string): number | null {
  const startMs = Date.parse(startsAt);

  if (Number.isNaN(startMs)) {
    return null;
  }

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(new Date(startMs));
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? 0);

  return hour * 60 + minute;
}

function normalizeDisambiguationReplyKey(text: string) {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\d:]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function replyMatchesOptionLabel(params: {
  reply: string;
  candidate: CalendarDisambiguationCandidate;
  referenceNow: Date;
  timeZone: string;
  locale: CalendarDisambiguationLocale;
}) {
  const label = formatDisambiguationOptionLabel({
    candidate: params.candidate,
    referenceNow: params.referenceNow,
    timeZone: params.timeZone,
    locale: params.locale,
  });
  const replyKey = normalizeDisambiguationReplyKey(params.reply);
  const labelKey = normalizeDisambiguationReplyKey(label);

  if (!replyKey || !labelKey) {
    return false;
  }

  return replyKey === labelKey || replyKey.includes(labelKey) || labelKey.includes(replyKey);
}

function filterCandidatesByTitleInReply(
  reply: string,
  candidates: CalendarDisambiguationCandidate[],
  pendingTitle: string | null | undefined,
) {
  const extracted = extractDeleteEventTitle(reply)?.trim();

  if (!extracted) {
    return candidates;
  }

  const titleMatches = candidates.filter(
    (candidate) =>
      calendarConversationTitlesMatch(extracted, candidate.title) ||
      (pendingTitle ? calendarConversationTitlesMatch(extracted, pendingTitle) : false),
  );

  return titleMatches.length > 0 ? titleMatches : candidates;
}

function pickClosestClockMatch(
  candidates: CalendarDisambiguationCandidate[],
  clockMinutes: number,
  timeZone: string,
) {
  const scored = candidates
    .map((candidate) => {
      const candidateClock = getCandidateLocalClockMinutes(candidate.startsAt, timeZone);

      if (candidateClock === null) {
        return null;
      }

      return {
        candidate,
        delta: Math.abs(candidateClock - clockMinutes),
      };
    })
    .filter((entry): entry is { candidate: CalendarDisambiguationCandidate; delta: number } => entry !== null)
    .sort((left, right) => left.delta - right.delta);

  if (scored.length === 0) {
    return null;
  }

  const best = scored[0];
  const tied = scored.filter((entry) => entry.delta === best.delta);

  if (best.delta > DISAMBIGUATION_CLOCK_TOLERANCE_MINUTES) {
    return null;
  }

  return tied.length === 1 ? best.candidate : null;
}

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
  pendingTitle?: string | null;
  locale?: CalendarDisambiguationLocale;
}): CalendarDisambiguationCandidate | null {
  const reply = params.reply.trim();

  if (!reply || params.candidates.length === 0) {
    return null;
  }

  const timeZone = params.timeZone ?? getExecutiveCalendarTimezone();
  const locale = params.locale ?? 'en';
  let scopedCandidates = filterCandidatesByTitleInReply(
    reply,
    params.candidates,
    params.pendingTitle,
  );

  const numericMatch = reply.match(/^(?:варіант|option|варіант|номер|number|#)?\s*(\d+)\s*\.?$/iu);

  if (numericMatch) {
    const index = Number(numericMatch[1]) - 1;

    if (index >= 0 && index < params.candidates.length) {
      return params.candidates[index] ?? null;
    }
  }

  const ordinalMatch = reply.match(
    /^(?:the\s+)?(first|second|third|fourth|1st|2nd|3rd|4th)(?:\s+one|\s+option|\s+event)?\.?$/iu,
  );

  if (ordinalMatch) {
    const ordinalIndex: Record<string, number> = {
      first: 0,
      '1st': 0,
      second: 1,
      '2nd': 1,
      third: 2,
      '3rd': 2,
      fourth: 3,
      '4th': 3,
    };
    const index = ordinalIndex[ordinalMatch[1].toLowerCase()];

    if (index !== undefined && index >= 0 && index < params.candidates.length) {
      return params.candidates[index] ?? null;
    }
  }

  const cyrillicOrdinal = reply.match(CYRILLIC_ORDINAL_REPLY);

  if (cyrillicOrdinal) {
    const token = cyrillicOrdinal[1].toLowerCase();
    const index =
      /^(?:перв|перш)/iu.test(token) ? 0 : /^(?:втор|друг)/iu.test(token) ? 1 : /^(?:трет|треть)/iu.test(token) ? 2 : 3;

    if (index >= 0 && index < params.candidates.length) {
      return params.candidates[index] ?? null;
    }
  }

  const labelMatches = scopedCandidates.filter((candidate) =>
    replyMatchesOptionLabel({
      reply,
      candidate,
      referenceNow: params.referenceNow,
      timeZone,
      locale,
    }),
  );

  if (labelMatches.length === 1) {
    return labelMatches[0] ?? null;
  }

  const day = resolveTargetDayContext(reply, params.referenceNow, timeZone);
  const clockMinutes = parseCalendarClockMinutes(reply, day);

  if (clockMinutes !== null) {
    const exactClockMatches = scopedCandidates.filter((candidate) => {
      const candidateClock = getCandidateLocalClockMinutes(candidate.startsAt, timeZone);

      return candidateClock === clockMinutes;
    });

    if (exactClockMatches.length === 1) {
      return exactClockMatches[0] ?? null;
    }

    const dayScoped =
      exactClockMatches.length === 0
        ? scopedCandidates.filter((candidate) => {
            const offset = resolveZonedDayOffsetForInstant(
              candidate.startsAt,
              params.referenceNow,
              timeZone,
            );

            return offset === day.dayOffset;
          })
        : exactClockMatches;

    const closest = pickClosestClockMatch(dayScoped, clockMinutes, timeZone);

    if (closest) {
      return closest;
    }
  }

  const dayOffset = day.dayOffset;
  const dayMatches = scopedCandidates.filter((candidate) => {
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
