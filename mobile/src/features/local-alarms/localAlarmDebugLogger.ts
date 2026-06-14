import { devConsoleLog } from '@/src/shared/logging/devConsoleLog';
import type { LocalAlarmQueryVariant } from '@/src/features/local-alarms/localAlarmQueryDetection';
import type { LocalAlarmIntentKind } from '@/src/features/local-alarms/localAlarmClassification';
import type { LocalAlarm } from '@/src/features/local-alarms/types';

export function logLocalAlarmTurnStart(params: {
  transcript: string;
  hasPendingAction: boolean;
}) {
  devConsoleLog('LOCAL_ALARM_TURN_START', {
    transcript: params.transcript,
    hasPendingAction: params.hasPendingAction,
  });
}

export function logLocalAlarmIntentDetected(params: {
  transcript: string;
  intentKind: LocalAlarmIntentKind | null;
  queryVariant?: LocalAlarmQueryVariant | null;
  parsedKind?: string | null;
}) {
  devConsoleLog('LOCAL_ALARM_INTENT_DETECTED', {
    transcript: params.transcript,
    intentKind: params.intentKind,
    queryVariant: params.queryVariant ?? null,
    parsedKind: params.parsedKind ?? null,
  });
}

export function logLocalAlarmEntitiesExtracted(params: Record<string, unknown>) {
  devConsoleLog('LOCAL_ALARM_ENTITIES_EXTRACTED', params);
}

export function logLocalAlarmCurrentState(params: {
  alarms: Array<{ id: string; triggerAtMs: number; status: string }>;
  referenceNowMs: number;
}) {
  devConsoleLog('LOCAL_ALARM_CURRENT_STATE', {
    count: params.alarms.length,
    alarms: params.alarms,
    referenceNowMs: params.referenceNowMs,
  });
}

export function logLocalAlarmSelected(params: {
  alarmId: string;
  triggerAtMs: number;
  reason: string;
}) {
  devConsoleLog('LOCAL_ALARM_SELECTED', params);
}

export function logLocalAlarmActionPerformed(params: {
  action: string;
  alarmId?: string;
  details?: Record<string, unknown>;
}) {
  devConsoleLog('LOCAL_ALARM_ACTION_PERFORMED', params);
}

export function logLocalAlarmStorageResult(params: {
  action: string;
  alarmId: string;
  success: boolean;
  triggerAtMs?: number;
  status?: string;
}) {
  devConsoleLog('LOCAL_ALARM_STORAGE_RESULT', params);
}

export function snapshotAlarmsForLog(alarms: LocalAlarm[]) {
  return alarms.map((alarm) => ({
    id: alarm.id,
    triggerAtMs: alarm.triggerAtMs,
    status: alarm.status,
  }));
}

export function logLocalAlarmPendingSelection(params: {
  action: string;
  candidateIds: string[];
}) {
  devConsoleLog('LOCAL_ALARM_PENDING_SELECTION', params);
}

export function logLocalAlarmReplyBuilt(params: {
  replyPreview: string;
  route: string;
}) {
  devConsoleLog('LOCAL_ALARM_REPLY_BUILT', params);
}
