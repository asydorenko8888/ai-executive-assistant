import {
  logAlarmNotificationFired,
  logAlarmSoundPlayRequested,
} from '@/src/features/local-alarms/localAlarmMarkers';
import {
  listPendingAlarmDeliveries,
  queuePendingAlarmDelivery,
  removePendingAlarmDelivery,
} from '@/src/features/local-alarms/localAlarmPendingDelivery';
import { getLocalAlarmById } from '@/src/features/local-alarms/localAlarmRuntimeStore';
import type { LocalAlarm } from '@/src/features/local-alarms/types';
import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';

export type AlarmDeliverySource =
  | 'foreground_poll'
  | 'notification_received'
  | 'notification_tap'
  | 'app_resume_catchup'
  | 'pending_queue'
  | 'background_task';

const deliveredIds = new Set<string>();

export function resetDeliveredAlarmIdsForTests() {
  deliveredIds.clear();
}

export function hasDeliveredAlarmId(alarmId: string) {
  return deliveredIds.has(alarmId);
}

export async function queueAlarmDeliveryForLater(params: {
  alarmId: string;
  title: string;
  source: AlarmDeliverySource;
}) {
  await queuePendingAlarmDelivery({
    alarmId: params.alarmId,
    title: params.title,
    source: params.source,
  });
}

export async function processPendingAlarmDeliveries(params: {
  languageCode: VoiceLanguageCode;
  onAlarmReady: (alarm: LocalAlarm, source: AlarmDeliverySource) => void;
}) {
  const pending = await listPendingAlarmDeliveries();

  for (const entry of pending) {
    const alarm = getLocalAlarmById(entry.alarmId);

    if (!alarm || alarm.status === 'stopped' || alarm.status === 'cancelled') {
      await removePendingAlarmDelivery(entry.alarmId);
      continue;
    }

    if (deliveredIds.has(entry.alarmId)) {
      await removePendingAlarmDelivery(entry.alarmId);
      continue;
    }

    deliveredIds.add(entry.alarmId);
    logAlarmNotificationFired({
      id: entry.alarmId,
      title: entry.title,
    });
    logAlarmSoundPlayRequested({
      id: entry.alarmId,
      title: entry.title,
    });
    params.onAlarmReady(alarm, 'pending_queue');
    await removePendingAlarmDelivery(entry.alarmId);
  }
}

export function markAlarmDeliveredFromCoordinator(alarmId: string) {
  deliveredIds.add(alarmId);
}
