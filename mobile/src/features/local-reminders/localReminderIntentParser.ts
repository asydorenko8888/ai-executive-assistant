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
  return transcript
    .trim()
    .replace(/[,;]/g, ' ')
    .replace(/[.!?]+$/g, '')
    .replace(/\s+/g, ' ');
}

const REMINDER_VERB = String.raw`(?:напомни(?:ть)?|напомню|нагадай(?:ти)?|нагадаю|remind(?:\s+me)?)`;
const REMINDER_INDIRECT_OBJECT = String.raw`(?:\s+(?:мне|мені|me))?`;

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
    new RegExp(`${REMINDER_VERB}${REMINDER_INDIRECT_OBJECT}\\s+через\\s+(.+)`, 'iu'),
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

function parseTrailingRelativeCreateIntent(
  transcript: string,
  referenceNow: Date,
): ParsedLocalReminderIntent | null {
  const match = transcript.match(
    new RegExp(`${REMINDER_VERB}${REMINDER_INDIRECT_OBJECT}\\s+(.+?)\\s+через\\s+(.+)`, 'iu'),
  );

  if (!match?.[1] || !match?.[2]) {
    return null;
  }

  const title = match[1]
    .trim()
    .replace(/[.!?]+$/g, '')
    .replace(/^что\s+/iu, '')
    .trim();

  if (!title) {
    return null;
  }

  const parsed = parseRelativeDurationPhrase(match[2], 'reminder');

  if (!parsed) {
    return null;
  }

  return {
    kind: 'create',
    text: title,
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
    parseTrailingRelativeCreateIntent(normalized, referenceNow) ??
    parseAbsoluteCreateIntent(normalized, referenceNow)
  );
}
