import type { LocalAlarm, LocalAlarmCreateIntent } from '@/src/features/local-alarms/types';
import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';
import { formatAlarmClockLabel } from '@/src/features/local-alarms/localAlarmTimeMatch';

export type PendingAlarmState =
  | 'WAITING_ALARM_CONFLICT_DECISION'
  | 'WAITING_ALARM_SELECTION';

export type PendingAlarmSelectionOption = {
  order: number;
  id: string;
  triggerAtMs: number;
  title: string;
  displayTime: string;
};

export type PendingAlarmSelection = {
  action: 'cancel' | 'reschedule';
  orderedOptions: PendingAlarmSelectionOption[];
  targetTime?: Date;
  relativeDeltaMs?: number;
  createdAtMs: number;
};

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
      orderedOptions: PendingAlarmSelectionOption[];
      targetTime?: Date;
      relativeDeltaMs?: number;
      createdAtMs: number;
    };

let pendingAction: PendingLocalAlarmAction | null = null;

export function setPendingLocalAlarmAction(action: PendingLocalAlarmAction) {
  pendingAction = action;
}

export function setPendingAlarmSelection(selection: PendingAlarmSelection) {
  pendingAction = {
    state: 'WAITING_ALARM_SELECTION',
    action: selection.action,
    orderedOptions: selection.orderedOptions,
    targetTime: selection.targetTime,
    relativeDeltaMs: selection.relativeDeltaMs,
    createdAtMs: selection.createdAtMs,
  };
}

export function getPendingLocalAlarmAction() {
  return pendingAction;
}

export function getPendingAlarmSelection(): PendingAlarmSelection | null {
  if (!pendingAction || pendingAction.state !== 'WAITING_ALARM_SELECTION') {
    return null;
  }

  return {
    action: pendingAction.action,
    orderedOptions: pendingAction.orderedOptions,
    targetTime: pendingAction.targetTime,
    relativeDeltaMs: pendingAction.relativeDeltaMs,
    createdAtMs: pendingAction.createdAtMs,
  };
}

export function hasPendingAlarmSelection() {
  return pendingAction?.state === 'WAITING_ALARM_SELECTION';
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

export function buildOrderedAlarmSelectionOptions(
  alarms: Array<{ id: string; triggerAtMs: number; title: string }>,
  languageCode: VoiceLanguageCode = 'ru-RU',
) {
  const sorted = [...alarms].sort((left, right) => left.triggerAtMs - right.triggerAtMs);

  return sorted.map((alarm, index) => ({
    order: index + 1,
    id: alarm.id,
    triggerAtMs: alarm.triggerAtMs,
    title: alarm.title,
    displayTime: formatAlarmClockLabel(alarm.triggerAtMs, languageCode, { hour24: true }),
  }));
}

export function hydratePendingAlarmSelectionOptions(
  options: PendingAlarmSelectionOption[],
  getAlarmById: (id: string) => LocalAlarm | null,
) {
  return options
    .map((option) => getAlarmById(option.id))
    .filter((alarm): alarm is LocalAlarm => Boolean(alarm && alarm.status === 'scheduled'));
}
