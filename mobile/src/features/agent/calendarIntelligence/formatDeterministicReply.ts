import { getZonedTimeParts } from '@/src/features/agent/calendar/calendarTimezone';
import { formatTimeInExecutiveTimezone } from '@/src/features/agent/calendar/calendarTime';
import { isExplicitPastAgendaQuery } from '@/src/features/agent/calendar/calendarPastAgendaQuery';
import { extractCalendarClockFragment } from '@/src/features/agent/calendarIntelligence/calendarClockParser';
import { formatWallClockLabel } from '@/src/features/agent/calendarIntelligence/calendarWallClockLabel';
import type {
  CalendarDayContext,
  CalendarFreeSlot,
  CalendarQueryIntent,
  NormalizedCalendarEvent,
} from '@/src/features/agent/calendarIntelligence/types';
import { splitDayEventsByPastAndFuture } from '@/src/features/agent/calendarIntelligence/scheduleHelpers';
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

function formatCompletedEventBullet(event: NormalizedCalendarEvent, timeZone: string) {
  const time = formatTimeInExecutiveTimezone(event.startISO, timeZone);
  const locationSuffix = event.location ? ` — ${event.location}` : '';

  return `• ${event.title} — ${time}${locationSuffix}`;
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

function formatListDayFutureHeader(day: CalendarDayContext, locale: VoiceLanguageChatLocale) {
  if (day.dayOffset === 0) {
    return locale === 'uk'
      ? 'Залишилось сьогодні:'
      : locale === 'ru'
        ? 'Осталось сегодня:'
        : 'Remaining today:';
  }

  if (day.dayOffset === 1) {
    return locale === 'uk'
      ? 'Заплановано на завтра:'
      : locale === 'ru'
        ? 'Запланировано на завтра:'
        : 'Scheduled for tomorrow:';
  }

  const label = dayLabel(day, locale);

  return locale === 'uk'
    ? `Заплановано на ${label}:`
    : locale === 'ru'
      ? `Запланировано на ${label}:`
      : `Scheduled for ${label}:`;
}

function formatListDayCurrentHeader(day: CalendarDayContext, locale: VoiceLanguageChatLocale) {
  if (day.dayOffset === 0) {
    return locale === 'uk'
      ? 'Зараз триває:'
      : locale === 'ru'
        ? 'Сейчас идет:'
        : 'Happening now:';
  }

  const label = dayLabel(day, locale);

  return locale === 'uk'
    ? `Зараз триває ${label}:`
    : locale === 'ru'
      ? `Сейчас идет ${label}:`
      : `Happening now ${label}:`;
}

function formatListDayCompletedHeader(day: CalendarDayContext, locale: VoiceLanguageChatLocale) {
  if (day.dayOffset === 0) {
    return locale === 'uk'
      ? 'Завершено сьогодні:'
      : locale === 'ru'
        ? 'Завершено сегодня:'
        : 'Completed today:';
  }

  if (day.dayOffset === 1) {
    return locale === 'uk'
      ? 'Завершено завтра:'
      : locale === 'ru'
        ? 'Завершено завтра:'
        : 'Completed tomorrow:';
  }

  const label = dayLabel(day, locale);

  return locale === 'uk'
    ? `Завершено ${label}:`
    : locale === 'ru'
      ? `Завершено ${label}:`
      : `Completed ${label}:`;
}

function formatSlot(slot: CalendarFreeSlot, day: CalendarDayContext) {
  const start = formatClock(slot.startMinutes, day);
  const end = formatClock(slot.endMinutes, day);

  return `${start}–${end} (${slot.durationMinutes} min)`;
}

function nowMinutesOnDay(day: CalendarDayContext, referenceNow: Date) {
  const parts = getZonedTimeParts(referenceNow, day.timezone);

  return parts.hour * 60 + parts.minute;
}

function formatFreeTimeClock(
  minutes: number,
  day: CalendarDayContext,
  locale: VoiceLanguageChatLocale,
) {
  if (locale === 'ru' || locale === 'uk') {
    const hour = Math.floor(minutes / 60);
    const minute = String(minutes % 60).padStart(2, '0');

    return `${hour}:${minute}`;
  }

  return formatClock(minutes, day);
}

function formatFreeTimeSlotBullet(params: {
  slot: CalendarFreeSlot;
  index: number;
  total: number;
  day: CalendarDayContext;
  locale: VoiceLanguageChatLocale;
  nowMinutes: number;
}) {
  const { slot, index, total, day, locale, nowMinutes } = params;
  const endClock = formatFreeTimeClock(slot.endMinutes, day, locale);
  const startClock = formatFreeTimeClock(slot.startMinutes, day, locale);
  const startsNow = slot.startMinutes <= nowMinutes;
  const openEnded = slot.endMinutes >= 24 * 60;

  if (locale === 'uk') {
    if (startsNow && index === 0) {
      return `- зараз до ${endClock}`;
    }

    if (openEnded && index === total - 1) {
      return `- після ${startClock}`;
    }

    return `- з ${startClock} до ${endClock}`;
  }

  if (locale === 'ru') {
    if (startsNow && index === 0) {
      return `- сейчас до ${endClock}`;
    }

    if (openEnded && index === total - 1) {
      return `- после ${startClock}`;
    }

    return `- с ${startClock} до ${endClock}`;
  }

  if (startsNow && index === 0) {
    return `- now until ${endClock}`;
  }

  if (openEnded && index === total - 1) {
    return `- after ${startClock}`;
  }

  return `- from ${startClock} to ${endClock}`;
}

function formatFreeTimeTodayReply(params: {
  day: CalendarDayContext;
  locale: VoiceLanguageChatLocale;
  freeSlots: CalendarFreeSlot[];
  referenceNow: Date;
}) {
  const { day, locale, freeSlots, referenceNow } = params;
  const nowMinutes = nowMinutesOnDay(day, referenceNow);

  if (freeSlots.length === 0) {
    return locale === 'uk'
      ? 'Сьогодні вільного часу більше немає.'
      : locale === 'ru'
        ? 'Сегодня свободного времени больше нет.'
        : 'You have no more free time today.';
  }

  const header =
    locale === 'uk'
      ? 'Сьогодні у тебе вільно:'
      : locale === 'ru'
        ? 'Сегодня у тебя свободно:'
        : 'You are free today:';

  const lines = freeSlots.map((slot, index) =>
    formatFreeTimeSlotBullet({
      slot,
      index,
      total: freeSlots.length,
      day,
      locale,
      nowMinutes,
    }),
  );

  return `${header}\n${lines.join('\n')}`;
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
  referenceNow?: Date;
}): string {
  const { intent, day, locale, events } = params;
  const label = dayLabel(day, locale);

  if (intent === 'list_day') {
    const referenceNow = params.referenceNow ?? new Date();
    const { pastEvents, currentEvents, futureEvents } = splitDayEventsByPastAndFuture(
      events,
      day,
      referenceNow,
    );

    if (futureEvents.length === 0 && currentEvents.length === 0 && pastEvents.length === 0) {
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

    const sections: string[] = [];

    if (currentEvents.length > 0) {
      const currentHeader = formatListDayCurrentHeader(day, locale);

      sections.push(
        `${currentHeader}\n${currentEvents
          .map((event) => formatCompletedEventBullet(event, day.timezone))
          .join('\n')}`,
      );
    }

    if (futureEvents.length > 0) {
      const remainingHeader = formatListDayFutureHeader(day, locale);

      sections.push(
        `${remainingHeader}\n${futureEvents
          .map((event, index) => formatEventLine(event, index, day.timezone))
          .join('\n')}`,
      );
    } else if (currentEvents.length === 0) {
      sections.push(
        locale === 'uk'
          ? `На ${label} усі заплановані події вже завершились.`
          : locale === 'ru'
            ? `На ${label} все запланированные задачи уже завершены.`
            : `Everything scheduled for ${label} is already finished.`,
      );
    }

    const showCompleted =
      params.userTranscript !== undefined && isExplicitPastAgendaQuery(params.userTranscript);

    if (showCompleted && pastEvents.length > 0) {
      const completedHeader = formatListDayCompletedHeader(day, locale);

      sections.push(
        `${completedHeader}\n${pastEvents
          .map((event) => formatCompletedEventBullet(event, day.timezone))
          .join('\n')}`,
      );
    }

    return formatAgendaListForDisplay(sections.join('\n\n'), {
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

  if (intent === 'free_time_query') {
    const referenceNow = params.referenceNow ?? new Date();
    const body = formatFreeTimeTodayReply({
      day,
      locale,
      freeSlots: params.freeSlots ?? [],
      referenceNow,
    });

    return formatAgendaListForDisplay(body, {
      preserveFullCalendarList: true,
      disableVoiceShortening: true,
      userTranscript: params.userTranscript,
    });
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
