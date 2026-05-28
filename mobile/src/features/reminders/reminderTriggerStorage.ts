import { getStoredJson, setStoredJson } from '@/src/shared/storage/asyncStorage';

const REMINDER_TRIGGERED_IDS_KEY = 'executive-ai.reminder-triggered-ids.v1';

export async function loadTriggeredReminderIds(): Promise<Set<string>> {
  const ids = await getStoredJson<string[]>(REMINDER_TRIGGERED_IDS_KEY, []);

  return new Set(ids);
}

export async function markReminderTriggered(reminderId: string) {
  const ids = await loadTriggeredReminderIds();
  ids.add(reminderId);
  await setStoredJson(REMINDER_TRIGGERED_IDS_KEY, [...ids]);
}
