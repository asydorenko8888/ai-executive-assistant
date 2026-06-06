import type { VerifiedCalendarEvent } from '@/src/features/agent/execution/actionExecutionTypes';
import {
  formatVerifiedEventScheduleRangeForUi,
} from '@/src/features/agent/calendar/calendarAuthoritativeEvent';
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

function formatCalendarClock12ForUi(instantMs: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(new Date(instantMs));

  const hour = parts.find((part) => part.type === 'hour')?.value ?? '';
  const minute = parts.find((part) => part.type === 'minute')?.value ?? '';
  const dayPeriod = parts.find((part) => part.type === 'dayPeriod')?.value ?? '';

  return `${hour}:${minute} ${dayPeriod}`.trim();
}

function formatVerifiedScheduleBlock(params: {
  event: Pick<VerifiedCalendarEvent, 'startsAt' | 'endsAt'>;
  referenceNow: Date;
  locale: 'uk' | 'ru' | 'en';
  timeZone: string;
}) {
  const startMs = parseGoogleCalendarInstant(params.event.startsAt);
  const endMs = parseGoogleCalendarInstant(params.event.endsAt);

  if (startMs === null || endMs === null) {
    return null;
  }

  const dayLabel = formatCalendarDayPhrase(
    startMs,
    params.referenceNow.getTime(),
    params.locale,
    params.timeZone,
  );
  const capitalizeDay = (value: string) =>
    value.length > 0 ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : value;

  const timeRange =
    params.locale === 'en'
      ? `${formatCalendarClock12ForUi(startMs, params.timeZone)} - ${formatCalendarClock12ForUi(endMs, params.timeZone)}`
      : `${formatCalendarClock24ForUi(startMs, params.timeZone)}–${formatCalendarClock24ForUi(endMs, params.timeZone)}`;

  return {
    dayLabel: capitalizeDay(dayLabel),
    timeRange,
    compactLabel:
      formatVerifiedEventScheduleRangeForUi({
        event: params.event,
        referenceNow: params.referenceNow,
        locale: params.locale,
        timeZone: params.timeZone,
      }) ?? `${capitalizeDay(dayLabel)}, ${timeRange}`,
  };
}

export function buildStructuredCalendarCreateSuccessReply(params: {
  event: VerifiedCalendarEvent;
  languageCode: VoiceLanguageCode;
  referenceNow?: Date;
}) {
  const locale = getChatLocaleFromVoiceLanguage(params.languageCode);
  const referenceNow = params.referenceNow ?? new Date();
  const timeZone = getExecutiveCalendarTimezone();
  const title = params.event.summary.trim();
  const schedule = formatVerifiedScheduleBlock({
    event: params.event,
    referenceNow,
    locale,
    timeZone,
  });

  if (!schedule) {
    return { reply: title, spokenReply: title };
  }

  if (locale === 'uk') {
    const reply = `Подію створено:\n${title}\n${schedule.dayLabel}\n${schedule.timeRange}`;
    return { reply, spokenReply: reply };
  }

  if (locale === 'ru') {
    const reply = `Событие создано:\n${title}\n${schedule.dayLabel}\n${schedule.timeRange}`;
    return { reply, spokenReply: reply };
  }

  const reply = `Created event:\n${title}\n${schedule.dayLabel}\n${schedule.timeRange}`;
  return { reply, spokenReply: reply };
}

export function buildStructuredCalendarUpdateSuccessReply(params: {
  event: VerifiedCalendarEvent;
  languageCode: VoiceLanguageCode;
  referenceNow?: Date;
  previousStartsAt?: string;
}) {
  const locale = getChatLocaleFromVoiceLanguage(params.languageCode);
  const referenceNow = params.referenceNow ?? new Date();
  const timeZone = getExecutiveCalendarTimezone();
  const title = params.event.summary.trim();
  const schedule = formatVerifiedScheduleBlock({
    event: params.event,
    referenceNow,
    locale,
    timeZone,
  });

  if (!schedule) {
    return { reply: title, spokenReply: title };
  }

  if (locale === 'uk') {
    const reply = `Подію перенесено:\n${title}\n${schedule.dayLabel}\n${schedule.timeRange}`;
    return { reply, spokenReply: reply };
  }

  if (locale === 'ru') {
    const reply = `Событие перенесено:\n${title}\n${schedule.dayLabel}\n${schedule.timeRange}`;
    return { reply, spokenReply: reply };
  }

  const reply = `Event updated:\n${title}\n${schedule.dayLabel}\n${schedule.timeRange}`;
  return { reply, spokenReply: reply };
}

export function buildStructuredCalendarDeleteSuccessReply(params: {
  event: VerifiedCalendarEvent;
  languageCode: VoiceLanguageCode;
  referenceNow?: Date;
}) {
  const locale = getChatLocaleFromVoiceLanguage(params.languageCode);
  const referenceNow = params.referenceNow ?? new Date();
  const timeZone = getExecutiveCalendarTimezone();
  const title = params.event.summary.trim();
  const schedule = formatVerifiedScheduleBlock({
    event: params.event,
    referenceNow,
    locale,
    timeZone,
  });

  if (!schedule) {
    return { reply: title, spokenReply: title };
  }

  if (locale === 'uk') {
    const reply = `Подію видалено:\n${title}\n${schedule.dayLabel}\n${schedule.timeRange}`;
    return { reply, spokenReply: reply };
  }

  if (locale === 'ru') {
    const reply = `Событие удалено:\n${title}\n${schedule.dayLabel}\n${schedule.timeRange}`;
    return { reply, spokenReply: reply };
  }

  const reply = `Event deleted:\n${title}\n${schedule.dayLabel}\n${schedule.timeRange}`;
  return { reply, spokenReply: reply };
}
