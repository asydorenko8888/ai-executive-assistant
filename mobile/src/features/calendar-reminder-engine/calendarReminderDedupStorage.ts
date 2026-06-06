import { getStoredJson, setStoredJson } from '@/src/shared/storage/asyncStorage';

const ANNOUNCED_KEYS_STORAGE = 'executive-ai.calendar-reminder-announced.v1';

export function buildCalendarReminderDedupeKey(eventId: string, startsAt: string, offsetMinutes: number) {
  return `${eventId}|${startsAt}|${offsetMinutes}`;
}

export async function loadAnnouncedCalendarReminderKeys(): Promise<Set<string>> {
  const keys = await getStoredJson<string[]>(ANNOUNCED_KEYS_STORAGE, []);
  return new Set(keys);
}

export async function markCalendarReminderAnnounced(dedupeKey: string) {
  const keys = await loadAnnouncedCalendarReminderKeys();
  keys.add(dedupeKey);
  await setStoredJson(ANNOUNCED_KEYS_STORAGE, [...keys]);
}
