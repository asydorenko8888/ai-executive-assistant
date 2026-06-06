export type LocalReminderKind = 'reminder' | 'alarm';

export type LocalReminderStatus = 'scheduled' | 'triggered' | 'cancelled';

export type LocalReminder = {
  id: string;
  text: string;
  triggerAtMs: number;
  kind: LocalReminderKind;
  status: LocalReminderStatus;
  sourceTranscript: string;
  createdAtMs: number;
};

export type LocalReminderCreateIntent = {
  kind: 'create';
  text: string;
  triggerAt: Date;
  sourceTranscript: string;
  reminderKind: LocalReminderKind;
  requestedDelayMs?: number;
};

export type LocalReminderListIntent = {
  kind: 'list';
  sourceTranscript: string;
};

export type LocalReminderCancelIntent = {
  kind: 'cancel';
  sourceTranscript: string;
  titleQuery?: string;
};

export type LocalReminderClarificationIntent = {
  kind: 'clarification';
  sourceTranscript: string;
  message: string;
};

export type ParsedLocalReminderIntent =
  | LocalReminderCreateIntent
  | LocalReminderListIntent
  | LocalReminderCancelIntent
  | LocalReminderClarificationIntent;
