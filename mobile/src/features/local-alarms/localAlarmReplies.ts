import { isLocalAlarmExistenceQuestion } from '@/src/features/local-alarms/localAlarmClassification';
import { logLocalAlarmConfirmationBuilt } from '@/src/features/local-alarms/localAlarmMarkers';
import type { LocalAlarmQueryVariant } from '@/src/features/local-alarms/localAlarmQueryDetection';
import {
  formatAlarmClockLabel,
  formatAlarmScheduleLine,
} from '@/src/features/local-alarms/localAlarmTimeMatch';
import type { LocalAlarm } from '@/src/features/local-alarms/types';
import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';
import { formatRequestedDelayLabel } from '@/src/features/local-reminders/localReminderReplies';

function sortAlarmsByTrigger(alarms: LocalAlarm[]) {
  return [...alarms].sort((left, right) => left.triggerAtMs - right.triggerAtMs);
}

function alarmCountLabel(count: number, languageCode: VoiceLanguageCode) {
  if (languageCode === 'uk-UA') {
    if (count === 1) {
      return 'один будильник';
    }

    if (count >= 2 && count <= 4) {
      return `${count} будильники`;
    }

    return `${count} будильників`;
  }

  if (languageCode === 'ru-RU') {
    if (count === 1) {
      return 'один будильник';
    }

    if (count >= 2 && count <= 4) {
      return `${count} будильника`;
    }

    return `${count} будильников`;
  }

  return count === 1 ? 'one alarm' : `${count} alarms`;
}

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
  const timeLabel = trigger.toLocaleTimeString(
    languageCode === 'uk-UA' ? 'uk-UA' : languageCode === 'ru-RU' ? 'ru-RU' : 'en-US',
    {
      hour: '2-digit',
      minute: '2-digit',
      hour12: languageCode === 'en-US',
    },
  );

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

export function buildLocalAlarmEmptyReply(languageCode: VoiceLanguageCode) {
  if (languageCode === 'uk-UA') {
    return 'Зараз активних будильників немає.';
  }

  if (languageCode === 'ru-RU') {
    return 'Сейчас активных будильников нет.';
  }

  return 'No active alarms right now.';
}

export function buildLocalAlarmNotFoundReply(params: {
  languageCode: VoiceLanguageCode;
  action: 'cancel' | 'reschedule';
}) {
  if (params.languageCode === 'uk-UA') {
    return params.action === 'cancel'
      ? 'Я не знайшов будильник для скасування.'
      : 'Я не знайшов будильник для перенесення.';
  }

  if (params.languageCode === 'ru-RU') {
    return params.action === 'cancel'
      ? 'Я не нашёл будильник для отмены.'
      : 'Я не нашёл будильник для переноса.';
  }

  return params.action === 'cancel'
    ? 'I could not find an alarm to cancel.'
    : 'I could not find an alarm to move.';
}

export function buildLocalAlarmQueryReply(params: {
  alarms: LocalAlarm[];
  languageCode: VoiceLanguageCode;
  referenceNow: Date;
  sourceTranscript?: string;
  queryVariant?: LocalAlarmQueryVariant;
}) {
  const sorted = sortAlarmsByTrigger(params.alarms);
  const variant = params.queryVariant ?? 'time';
  const existenceQuestion =
    variant === 'existence' ||
    (params.sourceTranscript != null && isLocalAlarmExistenceQuestion(params.sourceTranscript));

  if (sorted.length === 0) {
    if (existenceQuestion) {
      if (params.languageCode === 'uk-UA') {
        return 'Ні. Зараз активних будильників немає.';
      }

      if (params.languageCode === 'ru-RU') {
        return 'Нет. Сейчас активных будильников нет.';
      }

      return 'No. No active alarms right now.';
    }

    return buildLocalAlarmEmptyReply(params.languageCode);
  }

  const focusAlarms =
    variant === 'next' || variant === 'wake' ? [sorted[0]!] : sorted;

  if (focusAlarms.length === 1) {
    const scheduleLine = formatAlarmScheduleLine(
      focusAlarms[0]!.triggerAtMs,
      params.referenceNow.getTime(),
      params.languageCode,
    );

    if (existenceQuestion) {
      if (params.languageCode === 'uk-UA') {
        return `Так. Будильник на ${scheduleLine.replace(/^[^,]+,\s*/, '')}.`;
      }

      if (params.languageCode === 'ru-RU') {
        return `Да. Будильник на ${scheduleLine.replace(/^[^,]+,\s*/, '')}.`;
      }

      return `Yes. Your alarm is set for ${scheduleLine}.`;
    }

    if (variant === 'next' || variant === 'wake') {
      if (params.languageCode === 'uk-UA') {
        return variant === 'wake'
          ? `Тобі вставати ${scheduleLine.toLowerCase()}.`
          : `Наступний будильник: ${scheduleLine}.`;
      }

      if (params.languageCode === 'ru-RU') {
        return variant === 'wake'
          ? `Тебе вставать ${scheduleLine.toLowerCase()}.`
          : `Следующий будильник: ${scheduleLine}.`;
      }

      return variant === 'wake'
        ? `You need to wake up ${scheduleLine.toLowerCase()}.`
        : `Your next alarm is ${scheduleLine}.`;
    }

    if (params.languageCode === 'uk-UA') {
      return `Будильник стоїть на ${scheduleLine.replace(/^[^,]+,\s*/, '')}.`;
    }

    if (params.languageCode === 'ru-RU') {
      return `Будильник стоит на ${scheduleLine.replace(/^[^,]+,\s*/, '')}.`;
    }

    return `Your alarm is set for ${scheduleLine}.`;
  }

  const lines = sorted.map(
    (alarm) =>
      `• ${formatAlarmScheduleLine(
        alarm.triggerAtMs,
        params.referenceNow.getTime(),
        params.languageCode,
      )}`,
  );
  const countLabel = alarmCountLabel(sorted.length, params.languageCode);

  if (params.languageCode === 'uk-UA') {
    return `Зараз у тебе ${countLabel}:\n${lines.join('\n')}`;
  }

  if (params.languageCode === 'ru-RU') {
    return `Сейчас у тебя ${countLabel}:\n${lines.join('\n')}`;
  }

  return `You currently have ${countLabel}:\n${lines.join('\n')}`;
}

export function buildLocalAlarmStatusReply(params: {
  alarms: LocalAlarm[];
  languageCode: VoiceLanguageCode;
  referenceNow: Date;
  sourceTranscript?: string;
  queryVariant?: LocalAlarmQueryVariant;
}) {
  return buildLocalAlarmQueryReply(params);
}

export function buildLocalAlarmTriggeredSpeech(alarm: LocalAlarm) {
  return `Будильник: ${alarm.title}.`;
}

export function buildLocalAlarmListReply(params: {
  alarms: LocalAlarm[];
  languageCode: VoiceLanguageCode;
  referenceNow?: Date;
  queryVariant?: LocalAlarmQueryVariant;
}) {
  return buildLocalAlarmQueryReply({
    alarms: params.alarms,
    languageCode: params.languageCode,
    referenceNow: params.referenceNow ?? new Date(),
    queryVariant: params.queryVariant ?? 'list',
  });
}

export function buildLocalAlarmCancelReply(params: {
  cancelled: LocalAlarm[];
  languageCode: VoiceLanguageCode;
  referenceNowMs?: number;
}) {
  if (params.cancelled.length === 0) {
    return buildLocalAlarmNotFoundReply({
      languageCode: params.languageCode,
      action: 'cancel',
    });
  }

  const alarm = params.cancelled[0]!;
  const scheduleLine = formatAlarmScheduleLine(
    alarm.triggerAtMs,
    params.referenceNowMs ?? Date.now(),
    params.languageCode,
  );

  if (params.languageCode === 'uk-UA') {
    return `Готово. Будильник на ${scheduleLine.replace(/^[^,]+,\s*/, '')} скасовано.`;
  }

  if (params.languageCode === 'ru-RU') {
    return `Готово. Будильник на ${scheduleLine.replace(/^[^,]+,\s*/, '')} удалён.`;
  }

  return `Done. Alarm at ${scheduleLine} removed.`;
}

export function buildLocalAlarmRescheduleReply(params: {
  alarm: LocalAlarm;
  previousTriggerAtMs: number;
  languageCode: VoiceLanguageCode;
  referenceNowMs?: number;
}) {
  const scheduleLine = formatAlarmScheduleLine(
    params.alarm.triggerAtMs,
    params.referenceNowMs ?? Date.now(),
    params.languageCode,
  );

  if (params.languageCode === 'uk-UA') {
    return `Готово. Будильник спрацює ${scheduleLine.toLowerCase()}.`;
  }

  if (params.languageCode === 'ru-RU') {
    return `Готово. Будильник сработает ${scheduleLine.toLowerCase()}.`;
  }

  return `Done. Your alarm will ring ${scheduleLine.toLowerCase()}.`;
}

export function buildLocalAlarmClarificationReply(params: {
  alarms: LocalAlarm[];
  languageCode: VoiceLanguageCode;
  referenceNow: Date;
  action: 'cancel' | 'reschedule';
}) {
  const lines = params.alarms.map((alarm) =>
    `• ${formatAlarmScheduleLine(
      alarm.triggerAtMs,
      params.referenceNow.getTime(),
      params.languageCode,
    )}`,
  );

  if (params.languageCode === 'uk-UA') {
    const verb = params.action === 'cancel' ? 'видалити' : 'перенести';
    return `У тебе кілька будильників:\n\n${lines.join('\n\n')}\n\nЯкий ${verb}?`;
  }

  if (params.languageCode === 'ru-RU') {
    const verb = params.action === 'cancel' ? 'удалить' : 'перенести';
    return `У тебя несколько будильников:\n\n${lines.join('\n\n')}\n\nКакой ${verb}?`;
  }

  const verb = params.action === 'cancel' ? 'delete' : 'move';
  return `You have multiple alarms:\n\n${lines.join('\n\n')}\n\nWhich one should I ${verb}?`;
}

export function buildLocalAlarmConflictReply(params: {
  existingAlarms: LocalAlarm[];
  newTriggerAt: Date;
  languageCode: VoiceLanguageCode;
  referenceNow: Date;
}) {
  const existing = sortAlarmsByTrigger(params.existingAlarms);
  const existingTimeLabel = formatAlarmClockLabel(existing[0]!.triggerAtMs, params.languageCode, {
    hour24: true,
  });
  const newTimeLabel = formatAlarmClockLabel(
    params.newTriggerAt.getTime(),
    params.languageCode,
    { hour24: true },
  );

  if (params.languageCode === 'uk-UA') {
    return (
      `У тебе вже є активний будильник на ${existingTimeLabel}.\n\n` +
      `Залишити його і додати новий на ${newTimeLabel}?`
    );
  }

  if (params.languageCode === 'ru-RU') {
    return (
      `У тебя уже есть активный будильник на ${existingTimeLabel}.\n\n` +
      `Оставить его и добавить новый на ${newTimeLabel}?`
    );
  }

  return (
    `You already have an active alarm at ${existingTimeLabel}.\n\n` +
    `Keep it and add a new one at ${newTimeLabel}?`
  );
}

export function buildLocalAlarmDoneWithActiveListReply(params: {
  alarms: LocalAlarm[];
  languageCode: VoiceLanguageCode;
  referenceNow: Date;
}) {
  const lines = sortAlarmsByTrigger(params.alarms).map((alarm) =>
    `• ${formatAlarmScheduleLine(
      alarm.triggerAtMs,
      params.referenceNow.getTime(),
      params.languageCode,
    )}`,
  );

  if (params.languageCode === 'uk-UA') {
    return `Готово. У тебе стоять будильники:\n${lines.join('\n')}`;
  }

  if (params.languageCode === 'ru-RU') {
    return `Готово. У тебя стоят будильники:\n${lines.join('\n')}`;
  }

  return `Done. Active alarms:\n${lines.join('\n')}`;
}

export function buildLocalAlarmReplacedReply(params: {
  fromTriggerAtMs: number;
  toTriggerAtMs: number;
  languageCode: VoiceLanguageCode;
  referenceNowMs?: number;
}) {
  return buildLocalAlarmRescheduleReply({
    alarm: {
      id: 'replaced',
      title: 'Будильник',
      triggerAtMs: params.toTriggerAtMs,
      originalTriggerAtMs: params.fromTriggerAtMs,
      snoozeCount: 0,
      status: 'scheduled',
      sourceTranscript: '',
      createdAtMs: Date.now(),
    },
    previousTriggerAtMs: params.fromTriggerAtMs,
    languageCode: params.languageCode,
    referenceNowMs: params.referenceNowMs,
  });
}

export function buildLocalAlarmDuplicateReply(languageCode: VoiceLanguageCode) {
  if (languageCode === 'uk-UA') {
    return 'Такий будильник уже є.';
  }

  if (languageCode === 'ru-RU') {
    return 'Такой будильник уже есть.';
  }

  return 'That alarm already exists.';
}
