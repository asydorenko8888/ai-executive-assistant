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

function extractAlarmTimePhrase(transcript: string) {
  const patterns = [
    /(?:постав(?:ь|ьте|ити|\s+)?\s*будильник|set\s+(?:an?\s+)?alarm)\s+(?:на|for)\s+(.+)/iu,
    /(?:постав(?:ь|ьте|ити|\s+)?\s*будильник|set\s+(?:an?\s+)?alarm)\s+(.+)/iu,
    /(?:разбуди(?:ть)?(?:\s+меня)?|розбуди(?:ти)?(?:\s+мене)?|wake\s+me(?:\s+up)?)\s+(?:в|на|о|at)\s+(.+)/iu,
    /(?:разбуди(?:ть)?(?:\s+меня)?|розбуди(?:ти)?(?:\s+мене)?|wake\s+me(?:\s+up)?)\s+(.+)/iu,
    /^(?:будильник|alarm)\s+(?:на\s+)?(.+)/iu,
  ];

  for (const pattern of patterns) {
    const match = transcript.match(pattern);

    if (!match?.[1]) {
      continue;
    }

    const phrase = match[1].trim().replace(/[.!?]+$/g, '');

    if (!phrase || /^через\s+/iu.test(phrase)) {
      continue;
    }

    return phrase;
  }

  return null;
}

function parseRelativeAlarmIntent(
  transcript: string,
  referenceNow: Date,
): ParsedLocalAlarmIntent | null {
  const match = transcript.match(
    /(?:постав(?:ь|ьте|ити|\s+)?\s*будильник|set\s+(?:an?\s+)?alarm|разбуди(?:ть)?(?:\s+меня)?|розбуди(?:ти)?(?:\s+мене)?|wake\s+me(?:\s+up)?)\s+(?:через|in)\s+(.+)/iu,
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
  const timePhrase = extractAlarmTimePhrase(transcript);

  if (!timePhrase) {
    return null;
  }

  const triggerAt = parseAbsoluteReminderTime(timePhrase, referenceNow);

  if (!triggerAt) {
    return null;
  }

  return {
    kind: 'create',
    title: 'Будильник',
    triggerAt,
    sourceTranscript: transcript,
  };
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
