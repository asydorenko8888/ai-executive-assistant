import {
  logLocalReminderTriggered,
  logLocalReminderVoiceBlocked,
  logLocalReminderVoicePlay,
} from '@/src/features/local-reminders/localReminderMarkers';
import { buildLocalReminderTriggeredSpeech } from '@/src/features/local-reminders/localReminderReplies';
import { playLocalReminderVoice } from '@/src/features/local-reminders/localReminderVoicePlayback';
import type { LocalReminder } from '@/src/features/local-reminders/types';
import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguageLocale';
import { isSpeechSynthesisSupported, speakText } from '@/src/features/chat/services/speechSynthesis';

export type ActiveLocalReminderNotification = {
  id: string;
  text: string;
  message: string;
  triggeredAt: string;
  kind: LocalReminder['kind'];
};

function buildActiveLocalReminderNotification(params: {
  reminder: LocalReminder;
  message: string;
}): ActiveLocalReminderNotification {
  return {
    id: params.reminder.id,
    text: params.reminder.text,
    message: params.message,
    triggeredAt: new Date().toISOString(),
    kind: params.reminder.kind,
  };
}

export function deliverLocalReminderAnnouncement(params: {
  reminder: LocalReminder;
  languageCode: VoiceLanguageCode;
  source?: string;
}): ActiveLocalReminderNotification {
  const message = buildLocalReminderTriggeredSpeech(params.reminder);

  logLocalReminderTriggered({
    id: params.reminder.id,
    text: params.reminder.text,
    triggerAtIso: new Date(params.reminder.triggerAtMs).toISOString(),
    kind: params.reminder.kind,
  });

  const notification = buildActiveLocalReminderNotification({
    reminder: params.reminder,
    message,
  });

  playLocalReminderVoice({
    message,
    languageCode: params.languageCode,
    isSupported: isSpeechSynthesisSupported,
    speak: speakText,
    onPlay: () => {
      logLocalReminderVoicePlay({
        id: params.reminder.id,
        title: params.reminder.text,
      });
    },
    onBlocked: (reason) => {
      logLocalReminderVoiceBlocked({
        id: params.reminder.id,
        title: params.reminder.text,
        reason,
      });
    },
  });

  return notification;
}
