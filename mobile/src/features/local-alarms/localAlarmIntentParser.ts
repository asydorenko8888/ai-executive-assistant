import {
  isLocalAlarmCancelQuery,
  isLocalAlarmCreateQuery,
  isLocalAlarmListQuery,
} from '@/src/features/local-alarms/localAlarmClassification';
import type { ParsedLocalAlarmIntent } from '@/src/features/local-alarms/types';
import {
  parseAbsoluteReminderTime,
  parseRelativeDurationPhrase,
} from '@/src/features/local-reminders/localReminderTimeParser';

function normalizeTranscript(transcript: string) {
  return transcript.trim().replace(/\s+/g, ' ');
}

function extractCancelTitleQuery(transcript: string) {
  const match = transcript.match(
    /(?:удали(?:ть)?\s+будильник|видали(?:ти)?\s+будильник|отмени(?:ть)?\s+будильник|cancel\s+(?:the\s+)?alarm|delete\s+(?:the\s+)?alarm)\s+(.+)/iu,
  );

  return match?.[1]?.trim().replace(/[.!?]+$/g, '') || undefined;
}

function parseRelativeAlarmIntent(
  transcript: string,
  referenceNow: Date,
): ParsedLocalAlarmIntent | null {
  const match = transcript.match(
    /(?:поставь\s+будильник|постав(?:ь|ити)\s+будильник|set\s+(?:an?\s+)?alarm|разбуди(?:ть)?(?:\s+меня)?|wake\s+me(?:\s+up)?)\s+через\s+(.+)/iu,
  );

  if (!match?.[1]) {
    return null;
  }

  const parsed = parseRelativeDurationPhrase(match[1], 'alarm');

  if (!parsed) {
    return null;
  }

  return {
    kind: 'create',
    title: parsed.title,
    triggerAt: new Date(referenceNow.getTime() + parsed.totalMs),
    sourceTranscript: transcript,
    requestedDelayMs: parsed.totalMs,
  };
}

function parseAbsoluteAlarmIntent(
  transcript: string,
  referenceNow: Date,
): ParsedLocalAlarmIntent | null {
  const patterns = [
    /(?:поставь\s+будильник|постав(?:ь|ити)\s+будильник|set\s+(?:an?\s+)?alarm)\s+на\s+(.+)/iu,
    /(?:разбуди(?:ть)?(?:\s+меня)?|wake\s+me(?:\s+up)?)\s+(.+)/iu,
  ];

  for (const pattern of patterns) {
    const match = transcript.match(pattern);

    if (!match?.[1]) {
      continue;
    }

    if (/^через\s+/iu.test(match[1].trim())) {
      continue;
    }

    const triggerAt = parseAbsoluteReminderTime(match[1], referenceNow);

    if (!triggerAt) {
      continue;
    }

    return {
      kind: 'create',
      title: 'Будильник',
      triggerAt,
      sourceTranscript: transcript,
    };
  }

  return null;
}

export function parseLocalAlarmIntent(
  transcript: string,
  referenceNow = new Date(),
): ParsedLocalAlarmIntent | null {
  const normalized = normalizeTranscript(transcript);

  if (!normalized) {
    return null;
  }

  if (isLocalAlarmListQuery(normalized)) {
    return {
      kind: 'list',
      sourceTranscript: normalized,
    };
  }

  if (isLocalAlarmCancelQuery(normalized)) {
    return {
      kind: 'cancel',
      sourceTranscript: normalized,
      titleQuery: extractCancelTitleQuery(normalized),
    };
  }

  if (!isLocalAlarmCreateQuery(normalized)) {
    return null;
  }

  return (
    parseRelativeAlarmIntent(normalized, referenceNow) ??
    parseAbsoluteAlarmIntent(normalized, referenceNow)
  );
}
