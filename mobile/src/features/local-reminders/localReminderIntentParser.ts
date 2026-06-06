import {
  isLocalReminderCancelQuery,
  isLocalReminderCreateQuery,
  isLocalReminderListQuery,
} from '@/src/features/local-reminders/localReminderClassification';
import {
  parseAbsoluteReminderTime,
  parseRelativeDurationPhrase,
} from '@/src/features/local-reminders/localReminderTimeParser';
import type {
  LocalReminderKind,
  ParsedLocalReminderIntent,
} from '@/src/features/local-reminders/types';

function normalizeTranscript(transcript: string) {
  return transcript.trim().replace(/\s+/g, ' ');
}

function detectReminderKind(transcript: string): LocalReminderKind {
  return /(?:будильник|alarm|разбуди|wake\s+me)/iu.test(transcript) ? 'alarm' : 'reminder';
}

function extractCancelTitleQuery(transcript: string) {
  const match = transcript.match(
    /(?:отмени(?:ть)?\s+напоминание|скасуй(?:ти)?\s+нагадування|удали(?:ть)?\s+будильник|видали(?:ти)?\s+будильник|cancel\s+(?:the\s+)?reminder|delete\s+(?:the\s+)?alarm)\s+(.+)/iu,
  );

  return match?.[1]?.trim().replace(/[.!?]+$/g, '') || undefined;
}

function parseRelativeCreateIntent(
  transcript: string,
  referenceNow: Date,
): ParsedLocalReminderIntent | null {
  const match = transcript.match(
    /(?:напомни(?:ть)?|нагадай(?:ти)?|разбуди(?:ть)?(?:\s+меня)?|поставь\s+будильник|постав(?:ь|ити)\s+будильник|remind(?:\s+me)?|wake\s+me(?:\s+up)?|set\s+(?:an?\s+)?alarm)(?:\s+(?:мне|мені|me))?\s+через\s+(.+)/iu,
  );

  if (!match?.[1]) {
    return null;
  }

  const kind = detectReminderKind(transcript);
  const parsed = parseRelativeDurationPhrase(match[1], kind);

  if (!parsed) {
    return null;
  }

  return {
    kind: 'create',
    text: parsed.title,
    triggerAt: new Date(referenceNow.getTime() + parsed.totalMs),
    sourceTranscript: transcript,
    reminderKind: kind,
    requestedDelayMs: parsed.totalMs,
  };
}

function parseAbsoluteCreateIntent(
  transcript: string,
  referenceNow: Date,
): ParsedLocalReminderIntent | null {
  const patterns = [
    /(?:поставь\s+будильник|постав(?:ь|ити)\s+будильник|set\s+(?:an?\s+)?alarm)\s+на\s+(.+)/iu,
    /(?:напомни(?:ть)?|нагадай(?:ти)?|remind(?:\s+me)?)\s+(?:мне\s+|мені\s+|me\s+)?(?:в|на)\s+(.+)/iu,
    /(?:разбуди(?:ть)?(?:\s+меня)?|wake\s+me(?:\s+up)?)\s+(?:в|на|at)\s+(.+)/iu,
  ];

  for (const pattern of patterns) {
    const match = transcript.match(pattern);

    if (!match?.[1]) {
      continue;
    }

    const triggerAt = parseAbsoluteReminderTime(match[1], referenceNow);

    if (!triggerAt) {
      continue;
    }

    return {
      kind: 'create',
      text: detectReminderKind(transcript) === 'alarm' ? 'Будильник' : 'Напоминание',
      triggerAt,
      sourceTranscript: transcript,
      reminderKind: detectReminderKind(transcript),
    };
  }

  return null;
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
