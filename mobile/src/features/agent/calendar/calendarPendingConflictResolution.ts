import {
  isBareConflictProceedReply,
  isConflictSlotAcceptanceOnly,
  isConflictSlotSelectionReply,
  resolveConflictSlotOrdinalIndex,
  stripConflictSlotReplyNoise,
} from '@/src/features/agent/calendar/calendarConflictSlotReply';
import { parseCalendarCreateSchedule } from '@/src/features/agent/calendar/calendarCreateScheduleParser';
import type { CalendarPendingAction } from '@/src/features/agent/calendar/calendarConversationState';
import type { PendingReplyClassification } from '@/src/features/agent/calendar/calendarPendingReplyClassifier';
import { classifyCalendarShortReply } from '@/src/features/agent/calendar/calendarShortReply';
import { detectVagueConflictTimePeriod } from '@/src/features/agent/calendar/calendarConflictAlternativeSlots';
import {
  extractCalendarClockFragment,
  parseCalendarPointSchedule,
} from '@/src/features/agent/calendarIntelligence/calendarClockParser';
import type { PreferredTimeRange } from '@/src/features/agent/calendarIntelligence/types';
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
  | { kind: 'suggest_alternatives'; preferredRange?: PreferredTimeRange }
  | { kind: 'suggest_vague_time'; preferredRange?: PreferredTimeRange }
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
  const normalized = stripConflictSlotReplyNoise(reply.trim());
  const ordinalIndex = resolveConflictSlotOrdinalIndex(reply.trim());

  if (ordinalIndex !== null && ordinalIndex >= 0 && ordinalIndex < alternatives.length) {
    return alternatives[ordinalIndex];
  }

  const timeZone = getExecutiveCalendarTimezone();

  if (!normalized || !hasSchedulableTimeReply(normalized)) {
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
  const scheduleFragment = stripConflictSlotReplyNoise(normalized) || normalized;
  const short = classifyCalendarShortReply(normalized);
  const alternatives = params.pending.alternativeStartMs ?? [];
  const hasSuggestedSlots = alternatives.length > 0;

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

  const bareProceed =
    (params.classification === 'confirmation' || short === 'proceed') &&
    isBareConflictProceedReply(normalized);

  if (bareProceed) {
    return { kind: 'execute_original', skipScheduleConflictCheck: true };
  }

  if (
    params.classification === 'alternate_time' ||
    hasSchedulableTimeReply(scheduleFragment) ||
    isConflictSlotSelectionReply(normalized)
  ) {
    const transcript = buildConflictFollowUpTranscript(params.pending, scheduleFragment);
    const schedule = parseFollowUpSchedule(transcript, params.referenceNow);

    if (schedule.ok) {
      if (hasSuggestedSlots) {
        const matchedSlot = resolvePickedAlternativeStartMs(
          scheduleFragment,
          alternatives,
          params.referenceNow,
        );

        if (matchedSlot !== null) {
          return { kind: 'pick_alternative', startMs: matchedSlot };
        }
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
  }

  const vaguePeriod = detectVagueConflictTimePeriod(normalized);

  if (vaguePeriod === 'needs_clarification') {
    return { kind: 'suggest_vague_time' };
  }

  if (vaguePeriod) {
    return { kind: 'suggest_alternatives', preferredRange: vaguePeriod };
  }

  const pickedStartMs = hasSuggestedSlots
    ? resolvePickedAlternativeStartMs(normalized, alternatives, params.referenceNow)
    : null;

  if (pickedStartMs !== null && hasSuggestedSlots) {
    return { kind: 'pick_alternative', startMs: pickedStartMs };
  }

  if (hasSuggestedSlots && isConflictSlotAcceptanceOnly(normalized)) {
    return { kind: 'pick_alternative', startMs: alternatives[0] };
  }

  return { kind: 'remind' };
}
