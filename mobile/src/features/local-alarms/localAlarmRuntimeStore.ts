import { logLocalAlarmCreated, logAlarmSnoozeCountIncremented } from '@/src/features/local-alarms/localAlarmMarkers';
import type { LocalAlarm } from '@/src/features/local-alarms/types';

type LocalAlarmListener = () => void;

const listeners = new Set<LocalAlarmListener>();
let alarms: LocalAlarm[] = [];

function notifyListeners() {
  for (const listener of listeners) {
    listener();
  }
}

export function subscribeLocalAlarms(listener: LocalAlarmListener) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function listScheduledLocalAlarms(referenceNowMs = Date.now()) {
  return alarms.filter(
    (alarm) => alarm.status === 'scheduled' && alarm.triggerAtMs > referenceNowMs,
  );
}

export function listDueLocalAlarms(referenceNowMs = Date.now()) {
  return alarms.filter(
    (alarm) => alarm.status === 'scheduled' && alarm.triggerAtMs <= referenceNowMs,
  );
}

export function getLocalAlarmById(id: string) {
  return alarms.find((alarm) => alarm.id === id) ?? null;
}

export function createLocalAlarm(params: {
  title: string;
  triggerAt: Date;
  sourceTranscript: string;
}) {
  const triggerAtMs = params.triggerAt.getTime();
  const alarm: LocalAlarm = {
    id: `local-alarm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: params.title.trim() || 'Будильник',
    triggerAtMs,
    originalTriggerAtMs: triggerAtMs,
    snoozeCount: 0,
    status: 'scheduled',
    sourceTranscript: params.sourceTranscript,
    createdAtMs: Date.now(),
  };

  alarms = [alarm, ...alarms];

  logLocalAlarmCreated({
    id: alarm.id,
    title: alarm.title,
    triggerAt: new Date(alarm.triggerAtMs).toISOString(),
  });

  notifyListeners();
  return alarm;
}

export function markLocalAlarmRinging(id: string) {
  alarms = alarms.map((alarm) =>
    alarm.id === id ? { ...alarm, status: 'ringing' } : alarm,
  );
  notifyListeners();
}

export function stopLocalAlarm(id: string) {
  const existing = getLocalAlarmById(id);

  if (!existing || existing.status === 'stopped' || existing.status === 'cancelled') {
    return null;
  }

  alarms = alarms.map((alarm) =>
    alarm.id === id ? { ...alarm, status: 'stopped' } : alarm,
  );

  notifyListeners();
  return existing;
}

export function snoozeLocalAlarm(id: string, snoozeMinutes: number, referenceNowMs = Date.now()) {
  const existing = getLocalAlarmById(id);

  if (!existing || existing.status === 'stopped' || existing.status === 'cancelled') {
    return null;
  }

  const snoozeMs = snoozeMinutes * 60_000;
  const nextSnoozeCount = existing.snoozeCount + 1;

  alarms = alarms.map((alarm) =>
    alarm.id === id
      ? {
          ...alarm,
          status: 'scheduled',
          triggerAtMs: referenceNowMs + snoozeMs,
          snoozeCount: nextSnoozeCount,
        }
      : alarm,
  );

  logAlarmSnoozeCountIncremented({
    id,
    snoozeCount: nextSnoozeCount,
  });

  notifyListeners();
  return getLocalAlarmById(id);
}

export function cancelLocalAlarm(id: string) {
  const existing = getLocalAlarmById(id);

  if (!existing || existing.status !== 'scheduled') {
    return null;
  }

  alarms = alarms.map((alarm) =>
    alarm.id === id ? { ...alarm, status: 'cancelled' } : alarm,
  );

  notifyListeners();
  return existing;
}

export function resetLocalAlarmsForTests() {
  alarms = [];
  notifyListeners();
}

export function hydrateRuntimeAlarmsFromPersisted(incoming: LocalAlarm[]) {
  const ringing = alarms.filter((alarm) => alarm.status === 'ringing');
  const incomingScheduled = incoming.filter((alarm) => alarm.status === 'scheduled');
  const ringingIds = new Set(ringing.map((alarm) => alarm.id));

  alarms = [
    ...ringing,
    ...incomingScheduled.filter((alarm) => !ringingIds.has(alarm.id)),
  ];
  notifyListeners();
}
