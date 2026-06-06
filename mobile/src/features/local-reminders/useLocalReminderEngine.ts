import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';

import {
  deliverLocalReminderAnnouncement,
  type ActiveLocalReminderNotification,
} from '@/src/features/local-reminders/deliverLocalReminder';
import {
  logLocalReminderDueCheck,
  logLocalReminderEngineStarted,
} from '@/src/features/local-reminders/localReminderMarkers';
import {
  listDueLocalReminders,
  markLocalReminderTriggered,
  subscribeLocalReminders,
} from '@/src/features/local-reminders/localReminderRuntimeStore';
import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';

const POLL_INTERVAL_MS = 1000;

function pushNotification(
  setActiveNotifications: Dispatch<SetStateAction<ActiveLocalReminderNotification[]>>,
  notification: ActiveLocalReminderNotification,
) {
  setActiveNotifications((current) => {
    if (current.some((item) => item.id === notification.id)) {
      return current;
    }

    return [notification, ...current];
  });
}

export function useLocalReminderEngine(languageCode: VoiceLanguageCode) {
  const [activeNotifications, setActiveNotifications] = useState<ActiveLocalReminderNotification[]>([]);
  const isCheckingRef = useRef(false);
  const languageCodeRef = useRef(languageCode);
  const announcedIdsRef = useRef(new Set<string>());
  const engineStartedRef = useRef(false);

  useEffect(() => {
    languageCodeRef.current = languageCode;
  }, [languageCode]);

  const dismissNotification = useCallback((notificationId: string) => {
    setActiveNotifications((current) => current.filter((item) => item.id !== notificationId));
  }, []);

  const announceReminder = useCallback((reminder: Parameters<typeof deliverLocalReminderAnnouncement>[0]['reminder']) => {
    markLocalReminderTriggered(reminder.id);

    const notification = deliverLocalReminderAnnouncement({
      reminder,
      languageCode: languageCodeRef.current,
      source: 'engine',
    });

    pushNotification(setActiveNotifications, notification);
    return notification;
  }, []);

  const checkDueReminders = useCallback(() => {
    if (isCheckingRef.current) {
      return;
    }

    isCheckingRef.current = true;

    try {
      const due = listDueLocalReminders(Date.now()) ?? [];

      logLocalReminderDueCheck({ count: due.length });

      for (const reminder of due) {
        if (announcedIdsRef.current.has(reminder.id)) {
          continue;
        }

        announcedIdsRef.current.add(reminder.id);
        announceReminder(reminder);
      }
    } catch (error) {
      console.error('LOCAL_REMINDER_ENGINE_ERROR', {
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      isCheckingRef.current = false;
    }
  }, [announceReminder]);

  useEffect(() => {
    if (!engineStartedRef.current) {
      engineStartedRef.current = true;
      logLocalReminderEngineStarted();
    }

    const unsubscribe = subscribeLocalReminders(() => {
      checkDueReminders();
    });

    checkDueReminders();

    const intervalId = setInterval(() => {
      checkDueReminders();
    }, POLL_INTERVAL_MS);

    return () => {
      clearInterval(intervalId);
      unsubscribe();
    };
  }, [checkDueReminders]);

  return {
    activeNotifications,
    dismissNotification,
  };
}

export type { ActiveLocalReminderNotification };
