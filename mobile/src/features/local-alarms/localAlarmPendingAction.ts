import type { LocalAlarm, LocalAlarmCreateIntent } from '@/src/features/local-alarms/types';

export type PendingAlarmState =
  | 'WAITING_ALARM_CONFLICT_DECISION'
  | 'WAITING_ALARM_SELECTION';

export type PendingLocalAlarmAction =
  | {
      state: 'WAITING_ALARM_CONFLICT_DECISION';
      action: 'create_conflict';
      existingAlarms: Array<{ id: string; triggerAtMs: number; title: string }>;
      pendingCreate: LocalAlarmCreateIntent;
      createdAtMs: number;
    }
  | {
      state: 'WAITING_ALARM_SELECTION';
      action: 'cancel' | 'reschedule';
      candidates: Array<{ id: string; triggerAtMs: number; title: string }>;
      targetTime?: Date;
      relativeDeltaMs?: number;
      createdAtMs: number;
    };

let pendingAction: PendingLocalAlarmAction | null = null;

export function setPendingLocalAlarmAction(action: PendingLocalAlarmAction) {
  pendingAction = action;
}

export function getPendingLocalAlarmAction() {
  return pendingAction;
}

export function hasPendingLocalAlarmAction() {
  return pendingAction !== null;
}

export function clearPendingLocalAlarmAction() {
  pendingAction = null;
}

export function resetPendingLocalAlarmActionForTests() {
  pendingAction = null;
}
