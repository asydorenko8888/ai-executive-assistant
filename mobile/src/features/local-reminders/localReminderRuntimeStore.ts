import {
  logLocalReminderCancelled,
  logLocalReminderCreated,
} from '@/src/features/local-reminders/localReminderMarkers';
import type { LocalReminder, LocalReminderKind } from '@/src/features/local-reminders/types';

type LocalReminderListener = () => void;

const listeners = new Set<LocalReminderListener>();
let reminders: LocalReminder[] = [];

function notifyListeners() {
  for (const listener of listeners) {
    listener();
  }
}

export function subscribeLocalReminders(listener: LocalReminderListener) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function listScheduledLocalReminders(referenceNowMs = Date.now()) {
  return reminders.filter(
    (reminder) =>
      reminder.status === 'scheduled' && reminder.triggerAtMs > referenceNowMs,
  );
}

export function listDueLocalReminders(referenceNowMs = Date.now()) {
  return reminders.filter(
    (reminder) =>
      reminder.status === 'scheduled' && reminder.triggerAtMs <= referenceNowMs,
  );
}

export function getLocalReminderById(id: string) {
  return reminders.find((reminder) => reminder.id === id) ?? null;
}

export function createLocalReminder(params: {
  text: string;
  triggerAt: Date;
  kind: LocalReminderKind;
  sourceTranscript: string;
}) {
  const reminder: LocalReminder = {
    id: `local-reminder-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    text: params.text.trim(),
    triggerAtMs: params.triggerAt.getTime(),
    kind: params.kind,
    status: 'scheduled',
    sourceTranscript: params.sourceTranscript,
    createdAtMs: Date.now(),
  };

  reminders = [reminder, ...reminders];

  logLocalReminderCreated({
    id: reminder.id,
    text: reminder.text,
    triggerAtIso: new Date(reminder.triggerAtMs).toISOString(),
    kind: reminder.kind,
    sourceTranscript: reminder.sourceTranscript,
  });

  notifyListeners();
  return reminder;
}

export function markLocalReminderTriggered(id: string) {
  reminders = reminders.map((reminder) =>
    reminder.id === id ? { ...reminder, status: 'triggered' } : reminder,
  );
  notifyListeners();
}

export function cancelLocalReminder(id: string, reason = 'user_cancel') {
  const existing = getLocalReminderById(id);

  if (!existing || existing.status !== 'scheduled') {
    return null;
  }

  reminders = reminders.map((reminder) =>
    reminder.id === id ? { ...reminder, status: 'cancelled' } : reminder,
  );

  logLocalReminderCancelled({
    id: existing.id,
    text: existing.text,
    reason,
  });

  notifyListeners();
  return existing;
}

export function resetLocalRemindersForTests() {
  reminders = [];
  notifyListeners();
}

export function hydrateRuntimeRemindersFromPersisted(incoming: LocalReminder[]) {
  const incomingScheduled = incoming.filter((reminder) => reminder.status === 'scheduled');
  const existingIds = new Set(reminders.map((reminder) => reminder.id));

  reminders = [
    ...reminders.filter((reminder) => reminder.status !== 'scheduled'),
    ...incomingScheduled.filter((reminder) => !existingIds.has(reminder.id)),
  ];
  notifyListeners();
}
