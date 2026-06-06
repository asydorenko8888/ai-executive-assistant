import { logLocalReminderConfirmationBuilt } from '@/src/features/local-reminders/localReminderMarkers';
import type { LocalReminder } from '@/src/features/local-reminders/types';
import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';

function ruPluralForm(count: number, one: string, few: string, many: string) {
  const mod10 = count % 10;
  const mod100 = count % 100;

  if (mod100 >= 11 && mod100 <= 14) {
    return many;
  }

  if (mod10 === 1) {
    return one;
  }

  if (mod10 >= 2 && mod10 <= 4) {
    return few;
  }

  return many;
}

function ukPluralForm(count: number, one: string, few: string, many: string) {
  return ruPluralForm(count, one, few, many);
}

function splitDurationParts(totalMs: number) {
  const totalSeconds = Math.max(0, Math.round(totalMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return { hours, minutes, seconds };
}

export function formatRequestedDelayLabel(requestedDelayMs: number, languageCode: VoiceLanguageCode) {
  const { hours, minutes, seconds } = splitDurationParts(requestedDelayMs);

  if (languageCode === 'uk-UA') {
    const parts: string[] = [];

    if (hours > 0) {
      parts.push(`${hours} ${ukPluralForm(hours, 'годину', 'години', 'годин')}`);
    }

    if (minutes > 0) {
      parts.push(`${minutes} ${ukPluralForm(minutes, 'хвилину', 'хвилини', 'хвилин')}`);
    }

    if (seconds > 0) {
      parts.push(`${seconds} ${ukPluralForm(seconds, 'секунду', 'секунди', 'секунд')}`);
    }

    return `через ${parts.join(' ')}`;
  }

  if (languageCode === 'ru-RU') {
    const parts: string[] = [];

    if (hours > 0) {
      parts.push(`${hours} ${ruPluralForm(hours, 'час', 'часа', 'часов')}`);
    }

    if (minutes > 0) {
      parts.push(`${minutes} ${ruPluralForm(minutes, 'минуту', 'минуты', 'минут')}`);
    }

    if (seconds > 0) {
      parts.push(`${seconds} ${ruPluralForm(seconds, 'секунду', 'секунды', 'секунд')}`);
    }

    return `через ${parts.join(' ')}`;
  }

  const parts: string[] = [];

  if (hours > 0) {
    parts.push(`${hours} ${hours === 1 ? 'hour' : 'hours'}`);
  }

  if (minutes > 0) {
    parts.push(`${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`);
  }

  if (seconds > 0) {
    parts.push(`${seconds} ${seconds === 1 ? 'second' : 'seconds'}`);
  }

  return `in ${parts.join(' ')}`;
}

function formatAbsoluteTriggerLabel(triggerAtMs: number, referenceNowMs = Date.now()) {
  const triggerDate = new Date(triggerAtMs);
  const diffMs = triggerAtMs - referenceNowMs;

  if (diffMs > 0 && diffMs < 24 * 60 * 60 * 1000) {
    return triggerDate.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  return triggerDate.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function buildLocalReminderCreatedReply(params: {
  reminder: LocalReminder;
  languageCode: VoiceLanguageCode;
  requestedDelayMs?: number;
  referenceNowMs?: number;
}) {
  const when =
    params.requestedDelayMs != null
      ? formatRequestedDelayLabel(params.requestedDelayMs, params.languageCode)
      : formatAbsoluteTriggerLabel(
          params.reminder.triggerAtMs,
          params.referenceNowMs ?? params.reminder.createdAtMs,
        );

  let reply: string;

  if (params.languageCode === 'uk-UA') {
    reply = `Добре. Нагадаю ${when}: ${params.reminder.text}.`;
  } else if (params.languageCode === 'ru-RU') {
    reply = `Хорошо. Напомню ${when}: ${params.reminder.text}.`;
  } else {
    reply = `Got it. I'll remind you ${when}: ${params.reminder.text}.`;
  }

  logLocalReminderConfirmationBuilt({
    requestedDelayMs: params.requestedDelayMs ?? null,
    replyText: reply,
  });

  return reply;
}

export function buildLocalReminderListReply(params: {
  reminders: LocalReminder[];
  languageCode: VoiceLanguageCode;
  referenceNow?: Date;
}) {
  const referenceNowMs = params.referenceNow?.getTime() ?? Date.now();

  if (params.reminders.length === 0) {
    if (params.languageCode === 'uk-UA') {
      return 'У вас немає активних нагадувань.';
    }

    if (params.languageCode === 'ru-RU') {
      return 'У вас нет активных напоминаний.';
    }

    return 'You have no active reminders.';
  }

  const lines = params.reminders.map((reminder, index) => {
    const when = formatAbsoluteTriggerLabel(reminder.triggerAtMs, referenceNowMs);
    return `${index + 1}. ${reminder.text} — ${when}`;
  });

  if (params.languageCode === 'uk-UA') {
    return `Ваші нагадування:\n${lines.join('\n')}`;
  }

  if (params.languageCode === 'ru-RU') {
    return `Ваши напоминания:\n${lines.join('\n')}`;
  }

  return `Your reminders:\n${lines.join('\n')}`;
}

export function buildLocalReminderCancelReply(params: {
  cancelled: LocalReminder[];
  languageCode: VoiceLanguageCode;
}) {
  if (params.cancelled.length === 0) {
    if (params.languageCode === 'uk-UA') {
      return 'Я не знайшов нагадування для скасування.';
    }

    if (params.languageCode === 'ru-RU') {
      return 'Я не нашёл напоминание для отмены.';
    }

    return 'I could not find a reminder to cancel.';
  }

  const titles = params.cancelled.map((item) => item.text).join(', ');

  if (params.languageCode === 'uk-UA') {
    return `Скасовано: ${titles}.`;
  }

  if (params.languageCode === 'ru-RU') {
    return `Отменено: ${titles}.`;
  }

  return `Cancelled: ${titles}.`;
}

export function buildLocalReminderClarificationReply(params: {
  message: string;
  languageCode: VoiceLanguageCode;
}) {
  return params.message;
}

export function buildLocalReminderTriggeredSpeech(reminder: LocalReminder) {
  if (reminder.kind === 'alarm') {
    return `Будильник: ${reminder.text}.`;
  }

  return `Напоминание: ${reminder.text}.`;
}
