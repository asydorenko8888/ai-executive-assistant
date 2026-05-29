import type { CalendarEvent } from '@/src/entities/calendar/types';
import { logCalendarAnswerEvents } from '@/src/features/agent/calendar/calendarAgendaQuery';
import {
  isCalendarAgendaQuery,
  resolveAgendaQueryDayOffset,
} from '@/src/features/agent/calendar/calendarAgendaSync';
import { formatTimeInExecutiveTimezone } from '@/src/features/agent/calendar/calendarTime';
import { getExecutiveCalendarTimezone } from '@/src/features/agent/calendar/calendarTimezone';
import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';
import { getChatLocaleFromVoiceLanguage } from '@/src/features/chat/services/voiceLanguage';
import { formatAgendaListForDisplay } from '@/src/features/voice/speech/voiceSpeechFormatter';

function formatAgendaListLine(event: CalendarEvent, index: number, timeZone: string) {
  const time = formatTimeInExecutiveTimezone(event.startsAt, timeZone);
  const locationSuffix = event.location ? ` — ${event.location}` : '';

  return `${index + 1}. ${time} — ${event.title}${locationSuffix}`;
}

function buildEmptyAgendaReply(locale: 'uk' | 'ru' | 'en', dayOffset: number | null) {
  if (locale === 'uk') {
    return dayOffset === 1
      ? 'На завтра більше немає запланованих подій.'
      : 'На решту дня більше немає запланованих подій.';
  }

  if (locale === 'ru') {
    return dayOffset === 1
      ? 'На завтра больше нет запланированных задач.'
      : 'На сегодня больше нет запланированных задач.';
  }

  return dayOffset === 1
    ? 'Nothing else is scheduled for tomorrow.'
    : 'Nothing else is scheduled for the rest of today.';
}

function buildAgendaIntro(locale: 'uk' | 'ru' | 'en', dayOffset: number | null, count: number) {
  if (locale === 'uk') {
    if (dayOffset === 1) {
      return count === 1
        ? 'На завтра у тебе заплановано одне:'
        : `На завтра у тебе заплановано ${count} задачі:`;
    }

    return count === 1
      ? 'На сьогодні у тебе заплановано одне:'
      : `На сьогодні у тебе заплановано ${count} задачі:`;
  }

  if (locale === 'ru') {
    if (dayOffset === 1) {
      return count === 1
        ? 'На завтра у тебя запланирована одна задача:'
        : `На завтра у тебя запланированы следующие задачи (${count}):`;
    }

    return count === 1
      ? 'На сегодня у тебя запланирована одна задача:'
      : `На сегодня у тебя запланированы следующие задачи (${count}):`;
  }

  if (dayOffset === 1) {
    return count === 1
      ? 'You have one thing tomorrow:'
      : `You have ${count} items tomorrow:`;
  }

  return count === 1
    ? 'You have one thing left today:'
    : `You have ${count} items today:`;
}

export function tryBuildCalendarAgendaListReply(params: {
  transcript: string;
  events: CalendarEvent[];
  languageCode: VoiceLanguageCode;
  referenceNow: Date;
}): string | null {
  if (!isCalendarAgendaQuery(params.transcript)) {
    return null;
  }

  const locale = getChatLocaleFromVoiceLanguage(params.languageCode);
  const dayOffset = resolveAgendaQueryDayOffset(params.transcript);
  const timezone = getExecutiveCalendarTimezone();
  const scopedEvents = params.events;

  logCalendarAnswerEvents(scopedEvents, timezone);

  if (scopedEvents.length === 0) {
    return buildEmptyAgendaReply(locale, dayOffset);
  }

  const intro = buildAgendaIntro(locale, dayOffset, scopedEvents.length);
  const lines = scopedEvents.map((event, index) => formatAgendaListLine(event, index, timezone));
  const draft = `${intro}\n${lines.join('\n')}`;

  return formatAgendaListForDisplay(draft, {
    preserveFullCalendarList: true,
    disableVoiceShortening: true,
    userTranscript: params.transcript,
    queryIntent: 'agenda_query',
  });
}
