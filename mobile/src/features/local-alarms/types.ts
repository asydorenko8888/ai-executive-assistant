export type LocalAlarmStatus = 'scheduled' | 'ringing' | 'stopped' | 'cancelled';

export type LocalAlarm = {
  id: string;
  title: string;
  triggerAtMs: number;
  originalTriggerAtMs: number;
  snoozeCount: number;
  status: LocalAlarmStatus;
  sourceTranscript: string;
  createdAtMs: number;
};

export type LocalAlarmCreateIntent = {
  kind: 'create';
  title: string;
  triggerAt: Date;
  sourceTranscript: string;
  requestedDelayMs?: number;
};

import type { LocalAlarmQueryVariant } from '@/src/features/local-alarms/localAlarmQueryDetection';

export type LocalAlarmStatusIntent = {
  kind: 'status';
  sourceTranscript: string;
  queryVariant?: LocalAlarmQueryVariant;
};

export type LocalAlarmListIntent = {
  kind: 'list';
  sourceTranscript: string;
  queryVariant?: LocalAlarmQueryVariant;
};

export type LocalAlarmCancelIntent = {
  kind: 'cancel';
  sourceTranscript: string;
  timeSelector?: string;
};

export type LocalAlarmRescheduleIntent = {
  kind: 'reschedule';
  sourceTranscript: string;
  targetTime?: Date;
  sourceTimeSelector?: string;
  relativeDeltaMs?: number;
};

export type ParsedLocalAlarmIntent =
  | LocalAlarmCreateIntent
  | LocalAlarmListIntent
  | LocalAlarmStatusIntent
  | LocalAlarmCancelIntent
  | LocalAlarmRescheduleIntent;
