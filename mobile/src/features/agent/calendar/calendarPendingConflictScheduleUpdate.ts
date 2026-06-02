import { isCalendarReadBypassDuringPendingConflict } from '@/src/features/agent/calendar/calendarPendingConflictReadBypass';
import { stripConflictSlotReplyNoise } from '@/src/features/agent/calendar/calendarConflictSlotReply';
import { buildConflictFollowUpTranscript } from '@/src/features/agent/calendar/calendarPendingConflictResolution';
import type { CalendarPendingAction } from '@/src/features/agent/calendar/calendarConversationState';
import { titlesReferToSameEvent } from '@/src/features/agent/calendar/calendarPendingConflictEnrichment';
import { parseCalendarCreateSchedule } from '@/src/features/agent/calendar/calendarCreateScheduleParser';
import {
  parseCalendarUpdateSchedule,
  resolveUpdateTargetMs,
} from '@/src/features/agent/calendar/calendarUpdateScheduleParser';
import {
  extractCalendarClockFragment,
  parseCalendarPointSchedule,
} from '@/src/features/agent/calendarIntelligence/calendarClockParser';
import { parseRelativeTimeOffset } from '@/src/features/agent/calendarIntelligence/calendarNaturalDateParser';
import { getExecutiveCalendarTimezone } from '@/src/features/agent/calendar/calendarTimezone';

const PENDING_MOVE_PREFIX =
  /^(?:please\s+)?(?:move|reschedule|shift|перенеси|перенести|сдвинь|сдвинуть)\s+(?:it\s+)?(?:to|at|на|в|о)?\s*/iu;

const AFTER_EVENT_ANCHOR =
  /(?:^|[\s,.;:!?—-]+)(?:after|после)\s+(?:the\s+|мо(?:ю|є|й|я|го|ї)\s+)?(.+?)(?:\s*$|[,.;!?])/iu;

const RELATIVE_SHIFT_HINT =
  /(?:^|[\s,.;:!?—-]+)(?:через|in)\s+(?:\d+|one|a|an)\s*(?:минут|minutes|мин|хвилин|час|hours|годин)|(?:^|[\s,.;:!?—-]+)(?:\d+|one|a|an)\s*(?:час(?:а|ов|у)?|hours?|hrs?|минут(?:ы|у)?|minutes?)\s+(?:позже|пізніше|later|раньше|раніше|earlier)|(?:^|[\s,.;:!?—-]+)(?:one|a|an)\s+hour\s+(?:later|earlier)|(?:^|[\s,.;:!?—-]+)(?:later|earlier)\s+by\s+\d+/iu;

const DAY_PERIOD_HINT =
  /\b(?:tonight|morning|afternoon|evening|утром|утра|ранку|вечером|вечера|днём|днем|дня)\b/iu;

const INSTEAD_HINT = /\binstead\b/iu;

export type PendingConflictScheduleUpdate =
  | {
      ok: true;
      startMs: number;
      endMs: number;
      explicitDayOffset: number;
    }
  | { ok: false };

function normalizeAnchorQuery(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^(?:the|a|an|мой|моя|моё|мою|мої|моє)\s+/iu, '')
    .replace(/[^\p{L}\d]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function stripPendingConflictScheduleNoise(text: string) {
  let cleaned = stripConflictSlotReplyNoise(text.trim());
  cleaned = cleaned.replace(PENDING_MOVE_PREFIX, '');
  cleaned = cleaned.replace(/\binstead\b/giu, ' ');
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  return cleaned;
}

function hasSchedulableFragment(fragment: string) {
  const normalized = fragment.trim();

  if (!normalized) {
    return false;
  }

  if (extractCalendarClockFragment(normalized)) {
    return true;
  }

  if (RELATIVE_SHIFT_HINT.test(normalized)) {
    return true;
  }

  if (DAY_PERIOD_HINT.test(normalized)) {
    return true;
  }

  if (AFTER_EVENT_ANCHOR.test(normalized)) {
    return true;
  }

  return /\b(?:tomorrow|завтра|today|сьогодні|сегодня|післязавтра|послезавтра|tonight)\b/iu.test(
    normalized,
  );
}

/** True when the user is refining the pending conflict target time (not starting a new command). */
export function isPendingConflictScheduleUpdateReply(transcript: string) {
  const normalized = transcript.trim();

  if (!normalized || isCalendarReadBypassDuringPendingConflict(normalized)) {
    return false;
  }

  if (INSTEAD_HINT.test(normalized) && hasSchedulableFragment(stripPendingConflictScheduleNoise(normalized))) {
    return true;
  }

  if (PENDING_MOVE_PREFIX.test(normalized) && hasSchedulableFragment(stripPendingConflictScheduleNoise(normalized))) {
    return true;
  }

  if (AFTER_EVENT_ANCHOR.test(normalized)) {
    return true;
  }

  if (RELATIVE_SHIFT_HINT.test(normalized)) {
    return true;
  }

  if (DAY_PERIOD_HINT.test(normalized)) {
    return true;
  }

  const stripped = stripPendingConflictScheduleNoise(normalized);

  return hasSchedulableFragment(stripped);
}

function resolveAfterEventAnchorMs(pending: CalendarPendingAction, anchorQuery: string) {
  const normalizedQuery = normalizeAnchorQuery(anchorQuery);

  if (!normalizedQuery) {
    return null;
  }

  for (const conflict of pending.conflictEvents) {
    if (
      titlesReferToSameEvent(conflict.title, anchorQuery) ||
      normalizeAnchorQuery(conflict.title).includes(normalizedQuery) ||
      normalizedQuery.includes(normalizeAnchorQuery(conflict.title))
    ) {
      const endMs = Date.parse(conflict.endsAt);

      return Number.isNaN(endMs) ? null : endMs;
    }
  }

  if (pending.conflictingTitle) {
    if (
      titlesReferToSameEvent(pending.conflictingTitle, anchorQuery) ||
      normalizeAnchorQuery(pending.conflictingTitle).includes(normalizedQuery)
    ) {
      const endMs = pending.conflictingEndsAt ? Date.parse(pending.conflictingEndsAt) : NaN;

      return Number.isNaN(endMs) ? null : endMs;
    }
  }

  return null;
}

function resolveRelativeFromNowMs(transcript: string, referenceNow: Date) {
  const relative = parseRelativeTimeOffset(transcript.replace(/\bin\b/giu, 'through'));

  if (!relative) {
    return null;
  }

  return referenceNow.getTime() + relative.offsetMs;
}

function parsePendingFollowUpSchedule(params: {
  pending: CalendarPendingAction;
  reply: string;
  referenceNow: Date;
}) {
  const timeZone = getExecutiveCalendarTimezone();
  const fragment = stripPendingConflictScheduleNoise(params.reply);
  const transcript = buildConflictFollowUpTranscript(params.pending, fragment);

  if (params.pending.action === 'UPDATE_EVENT') {
    const updateSchedule = parseCalendarUpdateSchedule(transcript, params.referenceNow, timeZone);

    if (updateSchedule.ok) {
      const anchorMs =
        updateSchedule.kind === 'relative_offset'
          ? params.pending.requestedStartMs
          : params.pending.originalStart
            ? Date.parse(params.pending.originalStart)
            : params.pending.requestedStartMs;
      const targetMs = resolveUpdateTargetMs({
        schedule: updateSchedule,
        matchedEventStartMs: Number.isNaN(anchorMs) ? params.pending.requestedStartMs : anchorMs,
        referenceNow: params.referenceNow,
        timeZone,
      });

      if (targetMs !== null) {
        const durationMs = params.pending.requestedEndMs - params.pending.requestedStartMs;
        const point = parseCalendarPointSchedule(transcript, params.referenceNow, timeZone);

        return {
          ok: true as const,
          startMs: targetMs,
          endMs: targetMs + durationMs,
          explicitDayOffset: point.ok ? point.explicitDayOffset : 0,
        };
      }
    }
  }

  const point = parseCalendarPointSchedule(transcript, params.referenceNow, timeZone);

  if (point.ok) {
    return {
      ok: true as const,
      startMs: point.startMs,
      endMs: point.endMs,
      explicitDayOffset: point.explicitDayOffset,
    };
  }

  if (params.pending.action === 'CREATE_EVENT') {
    const createSchedule = parseCalendarCreateSchedule(transcript, params.referenceNow, timeZone);

    if (createSchedule.ok) {
      return {
        ok: true as const,
        startMs: createSchedule.startMs,
        endMs: createSchedule.endMs,
        explicitDayOffset: createSchedule.explicitDayOffset,
      };
    }
  }

  return { ok: false as const };
}

export function resolvePendingConflictScheduleUpdate(params: {
  pending: CalendarPendingAction;
  reply: string;
  referenceNow: Date;
}): PendingConflictScheduleUpdate {
  const normalized = params.reply.trim();
  const durationMs = params.pending.requestedEndMs - params.pending.requestedStartMs;
  const afterMatch = normalized.match(AFTER_EVENT_ANCHOR);

  if (afterMatch?.[1]) {
    const anchorStartMs = resolveAfterEventAnchorMs(params.pending, afterMatch[1]);

    if (anchorStartMs !== null) {
      return {
        ok: true,
        startMs: anchorStartMs,
        endMs: anchorStartMs + durationMs,
        explicitDayOffset: 0,
      };
    }
  }

  const relativeFromNowMs = resolveRelativeFromNowMs(normalized, params.referenceNow);

  if (relativeFromNowMs !== null) {
    return {
      ok: true,
      startMs: relativeFromNowMs,
      endMs: relativeFromNowMs + durationMs,
      explicitDayOffset: 0,
    };
  }

  return parsePendingFollowUpSchedule(params);
}
