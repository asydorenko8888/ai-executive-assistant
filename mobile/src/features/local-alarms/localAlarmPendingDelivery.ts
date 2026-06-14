import { getStoredJson, setStoredJson } from '@/src/shared/storage/asyncStorage';

const PENDING_DELIVERY_KEY = 'executive-ai.local-alarms.pending-delivery.v1';

type PendingAlarmDeliveryRecord = {
  alarmId: string;
  title: string;
  queuedAt: string;
  source: string;
};

export async function queuePendingAlarmDelivery(params: {
  alarmId: string;
  title: string;
  source: string;
}) {
  const existing = await getStoredJson<PendingAlarmDeliveryRecord[]>(PENDING_DELIVERY_KEY, []);
  const next: PendingAlarmDeliveryRecord[] = [
    {
      alarmId: params.alarmId,
      title: params.title,
      queuedAt: new Date().toISOString(),
      source: params.source,
    },
    ...existing.filter((entry) => entry.alarmId !== params.alarmId),
  ];

  await setStoredJson(PENDING_DELIVERY_KEY, next);
}

export async function listPendingAlarmDeliveries() {
  return getStoredJson<PendingAlarmDeliveryRecord[]>(PENDING_DELIVERY_KEY, []);
}

export async function removePendingAlarmDelivery(alarmId: string) {
  const existing = await getStoredJson<PendingAlarmDeliveryRecord[]>(PENDING_DELIVERY_KEY, []);
  const next = existing.filter((entry) => entry.alarmId !== alarmId);

  if (next.length === existing.length) {
    return false;
  }

  await setStoredJson(PENDING_DELIVERY_KEY, next);
  return true;
}

export async function resetPendingAlarmDeliveriesForTests() {
  await setStoredJson(PENDING_DELIVERY_KEY, []);
}
