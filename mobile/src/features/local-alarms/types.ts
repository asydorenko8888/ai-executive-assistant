export type LocalAlarmStatus = 'scheduled' | 'ringing' | 'stopped' | 'cancelled';

export type LocalAlarm = {
  id: string;
  title: string;
  triggerAtMs: number;
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

export type LocalAlarmListIntent = {
  kind: 'list';
  sourceTranscript: string;
};

export type LocalAlarmCancelIntent = {
  kind: 'cancel';
  sourceTranscript: string;
  titleQuery?: string;
};

export type ParsedLocalAlarmIntent =
  | LocalAlarmCreateIntent
  | LocalAlarmListIntent
  | LocalAlarmCancelIntent;
