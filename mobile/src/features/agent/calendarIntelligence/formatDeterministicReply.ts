import { formatTimeInExecutiveTimezone } from '@/src/features/agent/calendar/calendarTime';
import { extractCalendarClockFragment } from '@/src/features/agent/calendarIntelligence/calendarClockParser';
import { formatWallClockLabel } from '@/src/features/agent/calendarIntelligence/calendarWallClockLabel';
import type {
  CalendarDayContext,
  CalendarFreeSlot,
  CalendarQueryIntent,
  NormalizedCalendarEvent,
} from '@/src/features/agent/calendarIntelligence/types';
import { formatAgendaListForDisplay } from '@/src/features/voice/speech/voiceSpeechFormatter';
import type { VoiceLanguageChatLocale } from '@/src/features/chat/services/voiceLanguage';

function ruAtTimePreposition(userTranscript?: string) {
  const prep = userTranscript ? extractCalendarClockFragment(userTranscript)?.preposition : null;

  if (prep && /^(?:на|о|к)$/iu.test(prep)) {
    return 'На';
  }

  return 'В';
}

function formatRuAtTimeIntro(clock: string, userTranscript?: string) {
  return `${ruAtTimePreposition(userTranscript)} ${clock}`;
}

function formatClock(minutes: number, day: CalendarDayContext) {
  return formatWallClockLabel(minutes, day);
}

function formatEventLine(event: NormalizedCalendarEvent, index: number, timeZone: string) {
  const time = formatTimeInExecutiveTimezone(event.startISO, timeZone);
  const locationSuffix = event.location ? ` — ${event.location}` : '';

  return `${index + 1}. ${time} — ${event.title}${locationSuffix}`;
}

function dayLabel(day: CalendarDayContext, locale: VoiceLanguageChatLocale) {
  if (day.dayOffset === 1) {
    return locale === 'uk' ? 'завтра' : locale === 'ru' ? 'завтра' : 'tomorrow';
  }

  if (day.dayOffset === 0) {
    return locale === 'uk' ? 'сьогодні' : locale === 'ru' ? 'сегодня' : 'today';
  }

  return day.dateKey;
}

function formatSlot(slot: CalendarFreeSlot, day: CalendarDayContext) {
  const start = formatClock(slot.startMinutes, day);
  const end = formatClock(slot.endMinutes, day);

  return `${start}–${end} (${slot.durationMinutes} min)`;
}

export function formatDeterministicCalendarReply(params: {
  intent: CalendarQueryIntent;
  day: CalendarDayContext;
  locale: VoiceLanguageChatLocale;
  events: NormalizedCalendarEvent[];
  atTimeEvents?: NormalizedCalendarEvent[];
  clockMinutes?: number | null;
  nextEvent?: NormalizedCalendarEvent | null;
  lastEvent?: NormalizedCalendarEvent | null;
  freeSlots?: CalendarFreeSlot[];
  bestSlot?: CalendarFreeSlot | null;
  overlaps?: Array<{ first: NormalizedCalendarEvent; second: NormalizedCalendarEvent }>;
  requestedDurationMinutes?: number;
  userTranscript?: string;
}): string {
  const { intent, day, locale, events } = params;
  const label = dayLabel(day, locale);
  const sampleIso = events[0]?.startISO ?? new Date(day.range.rangeStartMs).toISOString();

  if (intent === 'list_day') {
    if (events.length === 0) {
      const empty =
        locale === 'uk'
          ? `На ${label} більше немає запланованих подій.`
          : locale === 'ru'
            ? `На ${label} больше нет запланированных задач.`
            : `Nothing is scheduled for ${label}.`;

      return formatAgendaListForDisplay(empty, {
        preserveFullCalendarList: true,
        disableVoiceShortening: true,
        userTranscript: params.userTranscript,
      });
    }

    const intro =
      locale === 'uk'
        ? `На ${label} у тебе заплановано ${events.length} задачі:`
        : locale === 'ru'
          ? `На ${label} у тебя запланированы следующие задачи (${events.length}):`
          : `You have ${events.length} items ${label}:`;

    const body = events.map((event, index) => formatEventLine(event, index, day.timezone)).join('\n');

    return formatAgendaListForDisplay(`${intro}\n${body}`, {
      preserveFullCalendarList: true,
      disableVoiceShortening: true,
      userTranscript: params.userTranscript,
      queryIntent: 'agenda_query',
    });
  }

  if (intent === 'events_at_time' || intent === 'events_starting_at_time' || intent === 'count_at_time') {
    const clock =
      params.clockMinutes === null || params.clockMinutes === undefined
        ? ''
        : formatClock(params.clockMinutes, day);
    const matches = params.atTimeEvents ?? [];

    if (intent === 'count_at_time') {
      if (locale === 'uk') {
        return `О ${clock} у тебе ${matches.length} подій.`;
      }

      if (locale === 'ru') {
        return `${formatRuAtTimeIntro(clock, params.userTranscript)} у тебя ${matches.length} задач.`;
      }

      return `At ${clock}, you have ${matches.length} event${matches.length === 1 ? '' : 's'}.`;
    }

    if (matches.length === 0) {
      return locale === 'uk'
        ? `О ${clock} нічого не заплановано.`
        : locale === 'ru'
          ? `${formatRuAtTimeIntro(clock, params.userTranscript)} ничего не запланировано.`
          : `Nothing is scheduled at ${clock}.`;
    }

    if (matches.length === 1) {
      const event = matches[0];

      return locale === 'uk'
        ? `О ${clock}: ${formatTimeInExecutiveTimezone(event.startISO, day.timezone)} — ${event.title}.`
        : locale === 'ru'
          ? `${formatRuAtTimeIntro(clock, params.userTranscript)} у тебя запланировано ${event.title}.`
          : `At ${clock}: ${formatTimeInExecutiveTimezone(event.startISO, day.timezone)} — ${event.title}.`;
    }

    const lines = matches
      .map((event, index) => formatEventLine(event, index, day.timezone))
      .join('\n');

    return formatAgendaListForDisplay(
      locale === 'uk'
        ? `О ${clock} у тебе кілька подій:\n${lines}`
        : locale === 'ru'
          ? `${formatRuAtTimeIntro(clock, params.userTranscript)} у тебя несколько задач:\n${lines}`
          : `At ${clock}, you have multiple events:\n${lines}`,
      { preserveFullCalendarList: true, disableVoiceShortening: true },
    );
  }

  if (intent === 'next_event') {
    const next = params.nextEvent;

    if (!next) {
      return locale === 'uk'
        ? `На ${label} більше немає майбутніх подій.`
        : locale === 'ru'
          ? `На ${label} больше нет предстоящих задач.`
          : `No more upcoming events for ${label}.`;
    }

    const time = formatTimeInExecutiveTimezone(next.startISO, day.timezone);

    return locale === 'uk'
      ? `Наступна подія ${label}: ${time} — ${next.title}.`
      : locale === 'ru'
        ? `Следующая задача ${label}: ${time} — ${next.title}.`
        : `Your next event ${label} is ${time} — ${next.title}.`;
  }

  if (intent === 'last_event') {
    const last = params.lastEvent;

    if (!last) {
      return locale === 'uk'
        ? `На ${label} немає запланованих подій.`
        : locale === 'ru'
          ? `На ${label} нет запланированных задач.`
          : `No events scheduled for ${label}.`;
    }

    const time = formatTimeInExecutiveTimezone(last.startISO, day.timezone);

    return locale === 'uk'
      ? `Остання подія ${label}: ${time} — ${last.title}.`
      : locale === 'ru'
        ? `Последняя задача ${label}: ${time} — ${last.title}.`
        : `Your last event ${label} is ${time} — ${last.title}.`;
  }

  if (intent === 'free_windows' || intent === 'best_slot' || intent === 'combine_activity') {
    const duration = params.requestedDurationMinutes ?? 60;
    const slot = params.bestSlot ?? params.freeSlots?.[0] ?? null;

    if (!slot) {
      return locale === 'uk'
        ? `На ${label} немає вільного вікна ${duration} хвилин.`
        : locale === 'ru'
          ? `На ${label} нет свободного окна ${duration} минут.`
          : `No ${duration}-minute free slot is available ${label}.`;
    }

    const slotText = formatSlot(slot, day);
    const meetings =
      events.length > 0
        ? events.map((event, index) => formatEventLine(event, index, day.timezone)).join('\n')
        : null;

    if (intent === 'combine_activity' && meetings) {
      const body = `${locale === 'uk' ? 'Зустрічі' : locale === 'ru' ? 'Встречи' : 'Meetings'} ${label}:\n${meetings}\n\n${
        locale === 'uk'
          ? `Найкраще вікно для тренування: ${slotText}.`
          : locale === 'ru'
            ? `Лучшее окно для тренировки: ${slotText}.`
            : `Best window for a workout: ${slotText}.`
      }`;

      return formatAgendaListForDisplay(body, {
        preserveFullCalendarList: true,
        disableVoiceShortening: true,
      });
    }

    if (intent === 'free_windows') {
      const all = params.freeSlots ?? [];

      if (all.length === 0) {
        return locale === 'uk'
          ? `На ${label} немає вільного часу.`
          : locale === 'ru'
            ? `На ${label} нет свободного времени.`
            : `You have no free time ${label}.`;
      }

      const lines = all
        .map((window, index) => `${index + 1}. ${formatSlot(window, day)}`)
        .join('\n');

      return formatAgendaListForDisplay(
        locale === 'uk'
          ? `Вільні вікна ${label}:\n${lines}`
          : locale === 'ru'
            ? `Свободные окна ${label}:\n${lines}`
            : `Free windows ${label}:\n${lines}`,
        { preserveFullCalendarList: true, disableVoiceShortening: true },
      );
    }

    return locale === 'uk'
      ? `Найкращий слот ${label}: ${slotText}.`
      : locale === 'ru'
        ? `Лучший слот ${label}: ${slotText}.`
        : `Best slot ${label}: ${slotText}.`;
  }

  if (intent === 'overlaps') {
    const overlaps = params.overlaps ?? [];

    if (overlaps.length === 0) {
      return locale === 'uk'
        ? `На ${label} перетинів у розкладі немає.`
        : locale === 'ru'
          ? `На ${label} пересечений в расписании нет.`
          : `No overlapping events ${label}.`;
    }

    const lines = overlaps.map((pair, index) => {
      const a = formatTimeInExecutiveTimezone(pair.first.startISO, day.timezone);
      const b = formatTimeInExecutiveTimezone(pair.second.startISO, day.timezone);

      return `${index + 1}. Overlap: ${a} ${pair.first.title} ↔ ${b} ${pair.second.title}`;
    });

    return formatAgendaListForDisplay(
      locale === 'uk'
        ? `Перетини ${label}:\n${lines.join('\n')}`
        : locale === 'ru'
          ? `Пересечения ${label}:\n${lines.join('\n')}`
          : `Overlaps ${label}:\n${lines.join('\n')}`,
      { preserveFullCalendarList: true, disableVoiceShortening: true },
    );
  }

  return '';
}
