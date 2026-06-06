import { logLocalAlarmConfirmationBuilt } from '@/src/features/local-alarms/localAlarmMarkers';
import type { LocalAlarm } from '@/src/features/local-alarms/types';
import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';
import { formatRequestedDelayLabel } from '@/src/features/local-reminders/localReminderReplies';

function startOfLocalDayMs(timestampMs: number) {
  const date = new Date(timestampMs);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function formatAbsoluteScheduleLabel(
  triggerAtMs: number,
  referenceNowMs: number,
  languageCode: VoiceLanguageCode,
) {
  const trigger = new Date(triggerAtMs);
  const dayOffset = Math.round(
    (startOfLocalDayMs(triggerAtMs) - startOfLocalDayMs(referenceNowMs)) / (24 * 60 * 60 * 1000),
  );
  const timeLabel = trigger.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  if (languageCode === 'uk-UA') {
    if (dayOffset === 1) {
      return `завтра о ${timeLabel}`;
    }

    return `на ${timeLabel}`;
  }

  if (languageCode === 'ru-RU') {
    if (dayOffset === 1) {
      return `завтра в ${timeLabel}`;
    }

    return `на ${timeLabel}`;
  }

  if (dayOffset === 1) {
    return `tomorrow at ${timeLabel}`;
  }

  return `at ${timeLabel}`;
}

export function buildLocalAlarmCreatedReply(params: {
  alarm: LocalAlarm;
  languageCode: VoiceLanguageCode;
  requestedDelayMs?: number;
  referenceNowMs?: number;
}) {
  const when =
    params.requestedDelayMs != null
      ? formatRequestedDelayLabel(params.requestedDelayMs, params.languageCode)
      : formatAbsoluteScheduleLabel(
          params.alarm.triggerAtMs,
          params.referenceNowMs ?? params.alarm.createdAtMs,
          params.languageCode,
        );

  let reply: string;

  if (params.languageCode === 'uk-UA') {
    reply = `Добре. Будильник ${when}.`;
  } else if (params.languageCode === 'ru-RU') {
    reply = `Хорошо. Будильник ${when}.`;
  } else {
    reply = `Got it. Alarm ${when}.`;
  }

  logLocalAlarmConfirmationBuilt({
    requestedDelayMs: params.requestedDelayMs ?? null,
    replyText: reply,
  });

  return reply;
}

export function buildLocalAlarmTriggeredSpeech(alarm: LocalAlarm) {
  return `Будильник: ${alarm.title}.`;
}

export function buildLocalAlarmListReply(params: {
  alarms: LocalAlarm[];
  languageCode: VoiceLanguageCode;
  referenceNow?: Date;
}) {
  const referenceNowMs = params.referenceNow?.getTime() ?? Date.now();

  if (params.alarms.length === 0) {
    if (params.languageCode === 'uk-UA') {
      return 'У вас немає активних будильників.';
    }

    if (params.languageCode === 'ru-RU') {
      return 'У вас нет активных будильников.';
    }

    return 'You have no active alarms.';
  }

  const lines = params.alarms.map((alarm, index) => {
    const when = formatAbsoluteScheduleLabel(alarm.triggerAtMs, referenceNowMs, params.languageCode);
    return `${index + 1}. ${alarm.title} — ${when}`;
  });

  if (params.languageCode === 'uk-UA') {
    return `Ваші будильники:\n${lines.join('\n')}`;
  }

  if (params.languageCode === 'ru-RU') {
    return `Ваши будильники:\n${lines.join('\n')}`;
  }

  return `Your alarms:\n${lines.join('\n')}`;
}

export function buildLocalAlarmCancelReply(params: {
  cancelled: LocalAlarm[];
  languageCode: VoiceLanguageCode;
}) {
  if (params.cancelled.length === 0) {
    if (params.languageCode === 'uk-UA') {
      return 'Я не знайшов будильник для скасування.';
    }

    if (params.languageCode === 'ru-RU') {
      return 'Я не нашёл будильник для отмены.';
    }

    return 'I could not find an alarm to cancel.';
  }

  const titles = params.cancelled.map((item) => item.title).join(', ');

  if (params.languageCode === 'uk-UA') {
    return `Скасовано: ${titles}.`;
  }

  if (params.languageCode === 'ru-RU') {
    return `Отменено: ${titles}.`;
  }

  return `Cancelled: ${titles}.`;
}
