import { parseCalendarCreateSchedule } from '@/src/features/agent/calendar/calendarCreateScheduleParser';
import type { CalendarPendingAction } from '@/src/features/agent/calendar/calendarConversationState';
import type { PendingReplyClassification } from '@/src/features/agent/calendar/calendarPendingReplyClassifier';
import { classifyCalendarShortReply } from '@/src/features/agent/calendar/calendarShortReply';
import {
  extractCalendarClockFragment,
  parseCalendarPointSchedule,
} from '@/src/features/agent/calendarIntelligence/calendarClockParser';
import {
  getExecutiveCalendarTimezone,
  getZonedTimeParts,
} from '@/src/features/agent/calendar/calendarTimezone';

export type PendingConflictResolution =
  | { kind: 'execute_original'; skipScheduleConflictCheck: true }
  | { kind: 'execute_with_time'; transcript: string }
  | {
      kind: 'execute_with_schedule';
      startMs: number;
      endMs: number;
      explicitDayOffset: number;
    }
  | { kind: 'cancel' }
  | { kind: 'suggest_alternatives' }
  | { kind: 'pick_alternative'; startMs: number }
  | { kind: 'remind' };

function usesCyrillicCalendarPhrasing(pending: CalendarPendingAction, reply: string) {
  return /[а-яёіїєґ]/iu.test(`${pending.sourceTranscript} ${reply}`);
}

export function buildConflictFollowUpTranscript(
  pending: CalendarPendingAction,
  timeReply: string,
) {
  const title = pending.eventTitle.trim();
  const reply = timeReply.trim();

  if (!title || !reply) {
    return pending.sourceTranscript;
  }

  if (pending.action === 'UPDATE_EVENT') {
    if (usesCyrillicCalendarPhrasing(pending, reply)) {
      if (/^(?:завтра|сьогодні|сегодня|післязавтра|послезавтра)/iu.test(reply)) {
        return `Перенеси ${title} ${reply}`.replace(/\s+/g, ' ').trim();
      }

      if (/^(?:в|на|о)\s+/iu.test(reply)) {
        return `Перенеси ${title} ${reply}`.replace(/\s+/g, ' ').trim();
      }

      return `Перенеси ${title} на ${reply}`.replace(/\s+/g, ' ').trim();
    }

    if (/^(?:tomorrow|today)/iu.test(reply)) {
      return `Move ${title} ${reply}`.replace(/\s+/g, ' ').trim();
    }

    return `Move ${title} to ${reply}`.replace(/\s+/g, ' ').trim();
  }

  if (usesCyrillicCalendarPhrasing(pending, reply)) {
    if (/^(?:завтра|сьогодні|сегодня|післязавтра|послезавтра)/iu.test(reply)) {
      return `Добавь ${title} ${reply}`.replace(/\s+/g, ' ').trim();
    }

    if (/^(?:в|на|о)\s+/iu.test(reply)) {
      return `Добавь ${title} ${reply}`.replace(/\s+/g, ' ').trim();
    }

    if (/^\d{1,2}(?::\d{2})?(?:\s+(?:вечера|вечером|утра|утром|дня|днём|днем))?$/iu.test(reply)) {
      return `Добавь ${title} в ${reply}`.replace(/\s+/g, ' ').trim();
    }

    return `Добавь ${title} ${reply}`.replace(/\s+/g, ' ').trim();
  }

  if (/^(?:tomorrow|today)/iu.test(reply)) {
    return `Add ${title} ${reply}`.replace(/\s+/g, ' ').trim();
  }

  if (/^\d{1,2}(?::\d{2})?\s*(?:am|pm)?$/iu.test(reply)) {
    return `Add ${title} at ${reply}`.replace(/\s+/g, ' ').trim();
  }

  return `Add ${title} ${reply}`.replace(/\s+/g, ' ').trim();
}

function hasSchedulableTimeReply(transcript: string) {
  const normalized = transcript.trim();

  if (!normalized) {
    return false;
  }

  if (extractCalendarClockFragment(normalized)) {
    return true;
  }

  return /\b(?:tomorrow|завтра|today|сьогодні|сегодня|післязавтра|послезавтра)\b/iu.test(normalized);
}

function parseFollowUpSchedule(transcript: string, referenceNow: Date) {
  const timeZone = getExecutiveCalendarTimezone();
  const point = parseCalendarPointSchedule(transcript, referenceNow, timeZone);

  if (point.ok) {
    return point;
  }

  if (transcript.includes('create') || /добав|создай|створи|add/i.test(transcript)) {
    return parseCalendarCreateSchedule(transcript, referenceNow, timeZone);
  }

  return point;
}

export function resolvePickedAlternativeStartMs(
  reply: string,
  alternatives: number[],
  referenceNow = new Date(),
) {
  const normalized = reply.trim();
  const bareIndex = normalized.match(/^([1-9])$/);
  const labeledIndex = normalized.match(/^(?:вариант|option|варіант)\s+([1-9])$/iu);

  const indexRaw = labeledIndex?.[1] ?? bareIndex?.[1];

  if (indexRaw) {
    const index = Number(indexRaw) - 1;

    if (index >= 0 && index < alternatives.length) {
      return alternatives[index];
    }
  }

  const timeZone = getExecutiveCalendarTimezone();

  if (!hasSchedulableTimeReply(normalized)) {
    return null;
  }

  const schedule = parseCalendarPointSchedule(normalized, referenceNow, timeZone);

  if (!schedule.ok) {
    return null;
  }

  const toleranceMs = 45 * 60_000;
  let best: { startMs: number; delta: number } | null = null;

  for (const startMs of alternatives) {
    const delta = Math.abs(startMs - schedule.startMs);

    if (delta <= toleranceMs && (!best || delta < best.delta)) {
      best = { startMs, delta };
    }
  }

  return best?.startMs ?? null;
}

export function buildTimePhraseFromStartMs(startMs: number, referenceNow = new Date()) {
  const timeZone = getExecutiveCalendarTimezone();
  const parts = getZonedTimeParts(new Date(startMs), timeZone);
  const pad = (value: number) => String(value).padStart(2, '0');
  const refParts = getZonedTimeParts(referenceNow, timeZone);
  const refDay = Date.UTC(refParts.year, refParts.month - 1, refParts.day);
  const targetDay = Date.UTC(parts.year, parts.month - 1, parts.day);
  const dayOffset = Math.round((targetDay - refDay) / 86400000);

  if (dayOffset === 1) {
    return `завтра в ${pad(parts.hour)}:${pad(parts.minute)}`;
  }

  if (dayOffset === 2) {
    return `послезавтра в ${pad(parts.hour)}:${pad(parts.minute)}`;
  }

  if (parts.minute > 0) {
    return `в ${pad(parts.hour)}:${pad(parts.minute)}`;
  }

  const hour12 = parts.hour % 12 || 12;
  const meridiem = parts.hour >= 12 ? 'PM' : 'AM';

  return `at ${hour12} ${meridiem}`;
}

export function buildRetriedTranscriptFromStartMs(pending: CalendarPendingAction, startMs: number) {
  const timePhrase = buildTimePhraseFromStartMs(startMs);
  const title = pending.eventTitle.trim();

  if (pending.action === 'CREATE_EVENT') {
    return buildConflictFollowUpTranscript(pending, timePhrase.replace(/^at\s+/i, ''));
  }

  if (pending.action === 'UPDATE_EVENT') {
    return buildConflictFollowUpTranscript(pending, timePhrase);
  }

  return `${pending.sourceTranscript} ${timePhrase}`.replace(/\s+/g, ' ').trim();
}

export function resolvePendingConflictResolution(params: {
  pending: CalendarPendingAction;
  transcript: string;
  classification: PendingReplyClassification;
  referenceNow: Date;
}): PendingConflictResolution {
  const normalized = params.transcript.trim();
  const short = classifyCalendarShortReply(normalized);
  const alternatives = params.pending.alternativeStartMs ?? [];

  if (params.classification === 'rejection' || short === 'cancel_abort') {
    return { kind: 'cancel' };
  }

  if (params.classification === 'decline_proceed' || short === 'decline_proceed') {
    return { kind: 'suggest_alternatives' };
  }

  if (
    short === 'suggest_new_time' ||
    /(?:suggest|предложи|запропонуй|другое\s+время|другой\s+время|інший\s+час|another\s+time|free\s+slot|вільн|свободн)/iu.test(
      normalized,
    )
  ) {
    return { kind: 'suggest_alternatives' };
  }

  if (params.classification === 'confirmation' || short === 'proceed') {
    return { kind: 'execute_original', skipScheduleConflictCheck: true };
  }

  const pickedStartMs = resolvePickedAlternativeStartMs(normalized, alternatives, params.referenceNow);

  if (
    pickedStartMs &&
    (/^[1-9]$/u.test(normalized) || /^(?:вариант|option|варіант)\s+[1-9]$/iu.test(normalized))
  ) {
    return { kind: 'pick_alternative', startMs: pickedStartMs };
  }

  if (params.classification === 'alternate_time' || hasSchedulableTimeReply(normalized)) {
    const transcript = buildConflictFollowUpTranscript(params.pending, normalized);
    const schedule = parseFollowUpSchedule(transcript, params.referenceNow);

    if (!schedule.ok) {
      return { kind: 'remind' };
    }

    if (params.pending.action === 'CREATE_EVENT') {
      return {
        kind: 'execute_with_schedule',
        startMs: schedule.startMs,
        endMs: schedule.endMs,
        explicitDayOffset: schedule.explicitDayOffset,
      };
    }

    return { kind: 'execute_with_time', transcript };
  }

  if (pickedStartMs) {
    return { kind: 'pick_alternative', startMs: pickedStartMs };
  }

  return { kind: 'remind' };
}
