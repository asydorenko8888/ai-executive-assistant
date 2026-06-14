import { getStoredJson, setStoredJson } from '@/src/shared/storage/asyncStorage';

const PENDING_DELIVERY_KEY = 'executive-ai.local-reminders.pending-delivery.v1';

type PendingReminderDeliveryRecord = {
  reminderId: string;
  title: string;
  queuedAt: string;
  source: string;
};

export async function queuePendingReminderDelivery(params: {
  reminderId: string;
  title: string;
  source: string;
}) {
  const existing = await getStoredJson<PendingReminderDeliveryRecord[]>(PENDING_DELIVERY_KEY, []);
  const next: PendingReminderDeliveryRecord[] = [
    {
      reminderId: params.reminderId,
      title: params.title,
      queuedAt: new Date().toISOString(),
      source: params.source,
    },
    ...existing.filter((entry) => entry.reminderId !== params.reminderId),
  ];

  await setStoredJson(PENDING_DELIVERY_KEY, next);
}

export async function listPendingReminderDeliveries() {
  return getStoredJson<PendingReminderDeliveryRecord[]>(PENDING_DELIVERY_KEY, []);
}

export async function removePendingReminderDelivery(reminderId: string) {
  const existing = await getStoredJson<PendingReminderDeliveryRecord[]>(PENDING_DELIVERY_KEY, []);
  const next = existing.filter((entry) => entry.reminderId !== reminderId);

  if (next.length === existing.length) {
    return false;
  }

  await setStoredJson(PENDING_DELIVERY_KEY, next);
  return true;
}

export async function resetPendingReminderDeliveriesForTests() {
  await setStoredJson(PENDING_DELIVERY_KEY, []);
}
