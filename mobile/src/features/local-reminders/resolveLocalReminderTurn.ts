import { parseLocalReminderIntent } from '@/src/features/local-reminders/localReminderIntentParser';
import {
  syncLocalReminderNotificationCancel,
  syncLocalReminderNotificationSchedule,
} from '@/src/features/local-reminders/localReminderNotificationSync';
import {
  buildLocalReminderCancelReply,
  buildLocalReminderClarificationReply,
  buildLocalReminderCreatedReply,
  buildLocalReminderListReply,
} from '@/src/features/local-reminders/localReminderReplies';
import {
  cancelLocalReminder,
  createLocalReminder,
  listScheduledLocalReminders,
} from '@/src/features/local-reminders/localReminderRuntimeStore';
import type { LocalReminder } from '@/src/features/local-reminders/types';
import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';

function matchRemindersForCancel(reminders: LocalReminder[], titleQuery?: string) {
  if (!titleQuery?.trim()) {
    return reminders;
  }

  const query = titleQuery.trim().toLowerCase();

  return reminders.filter((reminder) => reminder.text.toLowerCase().includes(query));
}

function buildCancelClarificationMessage(reminders: LocalReminder[], languageCode: VoiceLanguageCode) {
  const lines = reminders.map((reminder, index) => `${index + 1}. ${reminder.text}`).join('\n');

  if (languageCode === 'uk-UA') {
    return `У вас кілька нагадувань:\n${lines}\nЯке скасувати?`;
  }

  if (languageCode === 'ru-RU') {
    return `У вас несколько напоминаний:\n${lines}\nКакое отменить?`;
  }

  return `You have several reminders:\n${lines}\nWhich one should I cancel?`;
}

export function resolveLocalReminderTurn(params: {
  transcript: string;
  languageCode: VoiceLanguageCode;
  referenceNow?: Date;
}) {
  const referenceNow = params.referenceNow ?? new Date();
  const intent = parseLocalReminderIntent(params.transcript, referenceNow);

  if (!intent) {
    return null;
  }

  if (intent.kind === 'create') {
    const reminder = createLocalReminder({
      text: intent.text,
      triggerAt: intent.triggerAt,
      kind: intent.reminderKind,
      sourceTranscript: intent.sourceTranscript,
    });

    syncLocalReminderNotificationSchedule(reminder);

    const reply = buildLocalReminderCreatedReply({
      reminder,
      languageCode: params.languageCode,
      requestedDelayMs: intent.requestedDelayMs,
      referenceNowMs: referenceNow.getTime(),
    });

    return {
      reply,
      spokenReply: reply,
    };
  }

  if (intent.kind === 'list') {
    const reminders = listScheduledLocalReminders(referenceNow.getTime());
    const reply = buildLocalReminderListReply({
      reminders,
      languageCode: params.languageCode,
      referenceNow,
    });

    return { reply, spokenReply: reply };
  }

  if (intent.kind === 'cancel') {
    const scheduled = listScheduledLocalReminders(referenceNow.getTime());
    const matches = matchRemindersForCancel(scheduled, intent.titleQuery);

    if (matches.length === 0) {
      return {
        reply: buildLocalReminderCancelReply({
          cancelled: [],
          languageCode: params.languageCode,
        }),
      };
    }

    if (matches.length > 1 && !intent.titleQuery?.trim()) {
      const message = buildCancelClarificationMessage(matches, params.languageCode);

      return {
        reply: buildLocalReminderClarificationReply({
          message,
          languageCode: params.languageCode,
        }),
      };
    }

    const cancelled = matches.map((reminder) => cancelLocalReminder(reminder.id, 'user_cancel')).filter(Boolean);

    for (const reminder of cancelled) {
      if (reminder) {
        syncLocalReminderNotificationCancel(reminder.id);
      }
    }

    return {
      reply: buildLocalReminderCancelReply({
        cancelled: cancelled as LocalReminder[],
        languageCode: params.languageCode,
      }),
    };
  }

  return null;
}
