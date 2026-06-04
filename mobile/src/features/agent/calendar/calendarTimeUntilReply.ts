import type { CalendarEvent } from '@/src/entities/calendar/types';
import {
  formatDurationUntilFromEventStartIso,
  logCalendarTimeUntilDebug,
  type CalendarDurationLocale,
} from '@/src/features/agent/calendar/calendarDurationUntil';
import {
  isCalendarTimeUntilEventQuery,
  resolveTimeUntilTargetEvent,
} from '@/src/features/agent/calendar/calendarTimeUntilQuery';
import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';
import { getChatLocaleFromVoiceLanguage } from '@/src/features/chat/services/voiceLanguage';

function buildTimeUntilReplyText(params: {
  locale: CalendarDurationLocale;
  eventTitle: string;
  duration: NonNullable<ReturnType<typeof formatDurationUntilFromEventStartIso>>;
}) {
  const { duration, eventTitle, locale } = params;

  if (duration.isPast) {
    if (locale === 'uk') {
      return `«${eventTitle}» уже почався.`;
    }

    if (locale === 'ru') {
      return `«${eventTitle}» уже начался.`;
    }

    return `"${eventTitle}" has already started.`;
  }

  if (duration.isNow) {
    if (locale === 'uk') {
      return `«${eventTitle}» починається зараз.`;
    }

    if (locale === 'ru') {
      return `«${eventTitle}» начинается прямо сейчас.`;
    }

    return `"${eventTitle}" starts right now.`;
  }

  if (locale === 'uk') {
    return `До «${eventTitle}» залишилось ${duration.formattedDuration}.`;
  }

  if (locale === 'ru') {
    return `До «${eventTitle}» осталось ${duration.formattedDuration}.`;
  }

  return `${duration.formattedDuration} until "${eventTitle}".`;
}

export function tryBuildCalendarTimeUntilReplyFromEvents(params: {
  transcript: string;
  languageCode: VoiceLanguageCode;
  referenceNow: Date;
  events: CalendarEvent[];
}): string | null {
  if (!isCalendarTimeUntilEventQuery(params.transcript)) {
    return null;
  }

  const targetEvent = resolveTimeUntilTargetEvent({
    transcript: params.transcript,
    events: params.events,
    referenceNow: params.referenceNow,
  });

  if (!targetEvent) {
    return null;
  }

  const locale = getChatLocaleFromVoiceLanguage(params.languageCode) as CalendarDurationLocale;
  const duration = formatDurationUntilFromEventStartIso({
    eventStartIso: targetEvent.startsAt,
    referenceNow: params.referenceNow,
    locale,
  });

  if (!duration) {
    return null;
  }

  logCalendarTimeUntilDebug({
    query: params.transcript,
    referenceNowIso: params.referenceNow.toISOString(),
    selectedEventTitle: targetEvent.title,
    selectedEventStartIso: targetEvent.startsAt,
    diffMinutes: duration.diffMinutes,
    formattedDuration: duration.formattedDuration,
  });

  return buildTimeUntilReplyText({
    locale,
    eventTitle: targetEvent.title,
    duration,
  });
}
