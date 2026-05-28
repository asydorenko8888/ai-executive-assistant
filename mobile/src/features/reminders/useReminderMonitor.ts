import { useCallback, useEffect, useRef, useState } from 'react';

import {
  getRecognitionLocale,
  type VoiceLanguageCode,
} from '@/src/features/chat/services/voiceLanguage';
import { speakText, stopSpeech } from '@/src/features/chat/services/speechSynthesis';
import { loadAgentReminders } from '@/src/features/agent/storage/agentWorkspaceStorage';
import {
  loadTriggeredReminderIds,
  markReminderTriggered,
} from '@/src/features/reminders/reminderTriggerStorage';

export type ActiveReminderAlert = {
  id: string;
  title: string;
  triggeredAt: string;
};

type UseReminderMonitorOptions = {
  isSpeechMuted: boolean;
  languageCode: VoiceLanguageCode;
  pollIntervalMs?: number;
};

const DEFAULT_POLL_INTERVAL_MS = 5000;

export function useReminderMonitor({
  isSpeechMuted,
  languageCode,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
}: UseReminderMonitorOptions) {
  const [activeAlerts, setActiveAlerts] = useState<ActiveReminderAlert[]>([]);
  const isCheckingRef = useRef(false);
  const isSpeechMutedRef = useRef(isSpeechMuted);
  const languageCodeRef = useRef(languageCode);

  useEffect(() => {
    isSpeechMutedRef.current = isSpeechMuted;
  }, [isSpeechMuted]);

  useEffect(() => {
    languageCodeRef.current = languageCode;
  }, [languageCode]);

  const dismissAlert = useCallback((reminderId: string) => {
    setActiveAlerts((currentAlerts) => currentAlerts.filter((alert) => alert.id !== reminderId));
  }, []);

  const checkDueReminders = useCallback(async () => {
    if (isCheckingRef.current) {
      return;
    }

    isCheckingRef.current = true;

    try {
      const [reminders, triggeredIds] = await Promise.all([
        loadAgentReminders(),
        loadTriggeredReminderIds(),
      ]);
      const now = Date.now();

      for (const reminder of reminders) {
        if (reminder.status !== 'scheduled') {
          continue;
        }

        if (triggeredIds.has(reminder.id)) {
          continue;
        }

        const dueTimestamp = Date.parse(reminder.scheduledFor);

        if (Number.isNaN(dueTimestamp) || dueTimestamp > now) {
          continue;
        }

        console.log('[Reminder] Triggered', {
          id: reminder.id,
          title: reminder.title,
          scheduledFor: reminder.scheduledFor,
        });

        await markReminderTriggered(reminder.id);

        const alert: ActiveReminderAlert = {
          id: reminder.id,
          title: reminder.title,
          triggeredAt: new Date().toISOString(),
        };

        setActiveAlerts((currentAlerts) => {
          if (currentAlerts.some((item) => item.id === alert.id)) {
            return currentAlerts;
          }

          return [alert, ...currentAlerts];
        });

        if (!isSpeechMutedRef.current) {
          speakText(`Reminder: ${reminder.title}`, {
            languageCode: languageCodeRef.current,
            lang: getRecognitionLocale(languageCodeRef.current),
            conversational: true,
          });
        }
      }
    } finally {
      isCheckingRef.current = false;
    }
  }, []);

  useEffect(() => {
    void checkDueReminders();

    const intervalId = setInterval(() => {
      void checkDueReminders();
    }, pollIntervalMs);

    return () => {
      clearInterval(intervalId);
      stopSpeech();
    };
  }, [checkDueReminders, pollIntervalMs]);

  return {
    activeAlerts,
    dismissAlert,
  };
}
