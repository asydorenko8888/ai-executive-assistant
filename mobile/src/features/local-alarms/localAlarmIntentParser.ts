import {
  classifyLocalAlarmIntentKind,
  classifyLocalAlarmQueryVariant,
} from '@/src/features/local-alarms/localAlarmClassification';
import { normalizeAlarmTimePhrase } from '@/src/features/local-alarms/localAlarmTimeMatch';
import type { ParsedLocalAlarmIntent } from '@/src/features/local-alarms/types';
import {
  parseAbsoluteReminderTime,
  parseRelativeDurationPhrase,
} from '@/src/features/local-reminders/localReminderTimeParser';

function normalizeTranscript(transcript: string) {
  return transcript.trim().replace(/\s+/g, ' ');
}

function extractCancelTimeSelector(transcript: string) {
  const match = transcript.match(
    /(?:удали(?:ть)?\s+будильник|видали(?:ти)?\s+будильник|отмени(?:ть)?\s+будильник|убери(?:ть)?\s+будильник|cancel\s+(?:the\s+)?alarm|delete\s+(?:the\s+)?alarm)(?:\s+(.+))?/iu,
  );

  const remainder = match?.[1]?.trim().replace(/[.!?]+$/g, '');

  return remainder ? normalizeAlarmTimePhrase(remainder) : undefined;
}

const MOVE_VERB =
  /(?:перенеси(?:ть)?|перенес(?:и|і)\s+будильник|сдвинь\s+будильник|move\s+(?:the\s+)?alarm|reschedule\s+(?:the\s+)?alarm|move\s+it|перенеси\s+(?:его|её)|reschedule\s+it)/iu;

function parseMoveDurationMs(token: string | undefined, unit: string | undefined) {
  const normalizedToken = token?.trim().toLowerCase() ?? '';

  if (normalizedToken === 'полтора') {
    return 1.5 * 60 * 60 * 1000;
  }

  if (normalizedToken === 'полчаса' || normalizedToken === 'пол часа') {
    return 30 * 60 * 1000;
  }

  if (
    normalizedToken === 'one' ||
    normalizedToken === 'an' ||
    normalizedToken === 'a' ||
    normalizedToken === 'один' ||
    normalizedToken === 'одну' ||
    normalizedToken === 'одна'
  ) {
    if (unit && /минут|minutes?/iu.test(unit)) {
      return 60 * 1000;
    }

    return 60 * 60 * 1000;
  }

  if (!normalizedToken) {
    if (unit && /минут|minutes?/iu.test(unit)) {
      return null;
    }

    return 60 * 60 * 1000;
  }

  const numeric = Number(normalizedToken.replace(',', '.'));

  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }

  if (unit && /минут|minutes?/iu.test(unit)) {
    return numeric * 60 * 1000;
  }

  return numeric * 60 * 60 * 1000;
}

function extractRelativeMoveDelta(transcript: string) {
  const minutesEarlierLater = transcript.match(
    /(?:move|перенеси(?:ть)?|сдвинь|reschedule)\s+(?:the\s+)?(?:alarm|будильник|it|его)?\s*(?:by\s+)?(?:на\s+)?(\d+)\s+(?:minutes?|минут(?:ы)?)\s+(earlier|later|раньше|позже|раніше|пізніше)/iu,
  );

  if (minutesEarlierLater?.[1] && minutesEarlierLater[2]) {
    const minutes = Number(minutesEarlierLater[1]);
    const direction = minutesEarlierLater[2];

    if (Number.isFinite(minutes) && minutes > 0) {
      const deltaMs = minutes * 60 * 1000;
      return /earlier|раньше|раніше/i.test(direction) ? -deltaMs : deltaMs;
    }
  }

  const directedMatch = transcript.match(
    /(?:move|перенеси(?:ть)?|reschedule|сдвинь)\s+(?:the\s+)?(?:alarm|будильник|it|его)(?:\s+на)?\s*(?:(полтора|полчаса|пол\s*часа|один|одну|одна|one|an?|a|\d+(?:[.,]\d+)?)\s*)?(час(?:а|ов)?|hours?|минут(?:ы)?|minutes?)?\s*(позже|раньше|later|earlier|пізніше)/iu,
  );

  if (directedMatch) {
    const durationToken = directedMatch[1];
    const durationUnit = directedMatch[2];
    const moveDirection = directedMatch[3] ?? '';
    const deltaMs = parseMoveDurationMs(durationToken, durationUnit);

    if (deltaMs == null) {
      return null;
    }

    return /раньше|earlier/i.test(moveDirection) ? -deltaMs : deltaMs;
  }

  const minutesMatch = transcript.match(
    /(?:move|перенеси(?:ть)?|сдвинь)\s+(?:the\s+)?(?:alarm|будильник)\s+на\s+(\d+)\s+минут/iu,
  );

  if (minutesMatch?.[1]) {
    const minutes = Number(minutesMatch[1]);

    if (Number.isFinite(minutes) && minutes > 0) {
      return minutes * 60 * 1000;
    }
  }

  return null;
}

function extractRescheduleTimes(transcript: string, referenceNow: Date) {
  const relativeDeltaMs = extractRelativeMoveDelta(transcript);

  if (relativeDeltaMs != null) {
    return {
      sourceTimeSelector: undefined,
      targetTime: undefined,
      relativeDeltaMs,
    };
  }

  const fromToMatch = transcript.match(
    new RegExp(`${MOVE_VERB.source}\\s+(?:с|from)\\s+(.+?)\\s+(?:на|to)\\s+(.+)`, 'iu'),
  );

  if (fromToMatch?.[1] && fromToMatch[2]) {
    const sourceTimeSelector = normalizeAlarmTimePhrase(fromToMatch[1]);
    const targetPhrase = normalizeAlarmTimePhrase(fromToMatch[2]);
    const targetTime = parseAbsoluteReminderTime(targetPhrase, referenceNow);

    if (!targetTime) {
      return null;
    }

    return {
      sourceTimeSelector,
      targetTime,
    };
  }

  const targetOnlyMatch = transcript.match(
    new RegExp(`${MOVE_VERB.source}\\s+(?:на|to)\\s+(.+)`, 'iu'),
  );

  if (!targetOnlyMatch?.[1]) {
    return null;
  }

  const targetPhrase = normalizeAlarmTimePhrase(targetOnlyMatch[1]);
  const targetTime = parseAbsoluteReminderTime(targetPhrase, referenceNow);

  if (!targetTime) {
    return null;
  }

  return {
    sourceTimeSelector: undefined,
    targetTime,
  };
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

    if (!phrase || /^через\s+/iu.test(phrase) || /^in\s+/i.test(phrase)) {
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

  const intentKind = classifyLocalAlarmIntentKind(normalized);

  if (!intentKind) {
    return null;
  }

  if (intentKind === 'status') {
    return {
      kind: 'status',
      sourceTranscript: normalized,
      queryVariant: classifyLocalAlarmQueryVariant(normalized) ?? 'time',
    };
  }

  if (intentKind === 'list') {
    return {
      kind: 'list',
      sourceTranscript: normalized,
      queryVariant: classifyLocalAlarmQueryVariant(normalized) ?? 'list',
    };
  }

  if (intentKind === 'delete') {
    return {
      kind: 'cancel',
      sourceTranscript: normalized,
      timeSelector: extractCancelTimeSelector(normalized),
    };
  }

  if (intentKind === 'move') {
    const parsed = extractRescheduleTimes(normalized, referenceNow);

    if (!parsed) {
      return null;
    }

    return {
      kind: 'reschedule',
      sourceTranscript: normalized,
      targetTime: parsed.targetTime,
      sourceTimeSelector: parsed.sourceTimeSelector,
      relativeDeltaMs: parsed.relativeDeltaMs,
    };
  }

  return (
    parseRelativeAlarmIntent(normalized, referenceNow) ??
    parseAbsoluteAlarmIntent(normalized, referenceNow)
  );
}
