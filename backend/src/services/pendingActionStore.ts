import { randomUUID } from 'node:crypto';

import {
  deleteSecurePayload,
  readSecurePayload,
  writeSecurePayload,
} from './securePayloadStore.js';

const PENDING_NAMESPACE = 'pending-actions';

export type PendingCalendarCreatePayload = {
  summary: string;
  location?: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
};

export type PendingExecutiveAction = {
  id: string;
  type: 'calendar.create';
  payload: PendingCalendarCreatePayload;
  transcript: string;
  languageCode: string;
  createdAt: string;
};

type PendingActionQueue = {
  items: PendingExecutiveAction[];
};

export async function enqueuePendingAction(deviceId: string, action: Omit<PendingExecutiveAction, 'id' | 'createdAt'>) {
  const queue = (await readSecurePayload<PendingActionQueue>(PENDING_NAMESPACE, deviceId)) ?? { items: [] };
  const entry: PendingExecutiveAction = {
    ...action,
    id: randomUUID(),
    createdAt: new Date().toISOString(),
  };

  queue.items = [entry, ...queue.items.filter((item) => item.type !== action.type)].slice(0, 5);
  await writeSecurePayload(PENDING_NAMESPACE, deviceId, queue);

  return entry;
}

export async function peekPendingActions(deviceId: string) {
  const queue = await readSecurePayload<PendingActionQueue>(PENDING_NAMESPACE, deviceId);

  return queue?.items ?? [];
}

export async function shiftPendingAction(deviceId: string) {
  const queue = (await readSecurePayload<PendingActionQueue>(PENDING_NAMESPACE, deviceId)) ?? { items: [] };

  if (queue.items.length === 0) {
    return null;
  }

  const [next, ...rest] = queue.items;
  await writeSecurePayload(PENDING_NAMESPACE, deviceId, { items: rest });

  return next;
}

export async function clearPendingActions(deviceId: string) {
  await deleteSecurePayload(PENDING_NAMESPACE, deviceId);
}
