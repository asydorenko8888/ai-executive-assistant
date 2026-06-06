import {
  isLocalReminderCancelQuery,
  isLocalReminderCreateQuery,
  isLocalReminderListQuery,
} from '@/src/features/local-reminders/localReminderClassification';
import {
  parseAbsoluteReminderTime,
  parseRelativeDurationPhrase,
} from '@/src/features/local-reminders/localReminderTimeParser';
import type { ParsedLocalReminderIntent } from '@/src/features/local-reminders/types';

function normalizeTranscript(transcript: string) {
  return transcript.trim().replace(/\s+/g, ' ');
}

function extractCancelTitleQuery(transcript: string) {
  const match = transcript.match(
    /(?:отмени(?:ть)?\s+напоминание|скасуй(?:ти)?\s+нагадування|cancel\s+(?:the\s+)?reminder)\s+(.+)/iu,
  );

  return match?.[1]?.trim().replace(/[.!?]+$/g, '') || undefined;
}

function parseRelativeCreateIntent(
  transcript: string,
  referenceNow: Date,
): ParsedLocalReminderIntent | null {
  const match = transcript.match(
    /(?:напомни(?:ть)?|нагадай(?:ти)?|remind(?:\s+me)?)(?:\s+(?:мне|мені|me))?\s+через\s+(.+)/iu,
  );

  if (!match?.[1]) {
    return null;
  }

  const parsed = parseRelativeDurationPhrase(match[1], 'reminder');

  if (!parsed) {
    return null;
  }

  return {
    kind: 'create',
    text: parsed.title,
    triggerAt: new Date(referenceNow.getTime() + parsed.totalMs),
    sourceTranscript: transcript,
    reminderKind: 'reminder',
    requestedDelayMs: parsed.totalMs,
  };
}

function parseAbsoluteCreateIntent(
  transcript: string,
  referenceNow: Date,
): ParsedLocalReminderIntent | null {
  const match = transcript.match(
    /(?:напомни(?:ть)?|нагадай(?:ти)?|remind(?:\s+me)?)\s+(?:мне\s+|мені\s+|me\s+)?(?:в|на)\s+(.+)/iu,
  );

  if (!match?.[1]) {
    return null;
  }

  const triggerAt = parseAbsoluteReminderTime(match[1], referenceNow);

  if (!triggerAt) {
    return null;
  }

  return {
    kind: 'create',
    text: 'Напоминание',
    triggerAt,
    sourceTranscript: transcript,
    reminderKind: 'reminder',
  };
}

export function parseLocalReminderIntent(
  transcript: string,
  referenceNow = new Date(),
): ParsedLocalReminderIntent | null {
  const normalized = normalizeTranscript(transcript);

  if (!normalized) {
    return null;
  }

  if (isLocalReminderListQuery(normalized)) {
    return {
      kind: 'list',
      sourceTranscript: normalized,
    };
  }

  if (isLocalReminderCancelQuery(normalized)) {
    return {
      kind: 'cancel',
      sourceTranscript: normalized,
      titleQuery: extractCancelTitleQuery(normalized),
    };
  }

  if (!isLocalReminderCreateQuery(normalized)) {
    return null;
  }

  return (
    parseRelativeCreateIntent(normalized, referenceNow) ??
    parseAbsoluteCreateIntent(normalized, referenceNow)
  );
}
