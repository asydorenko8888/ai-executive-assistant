import { fetchTimedEventsNearScheduleWindow } from '@/src/features/agent/calendar/calendarScheduleConflict';
import { getExecutiveCalendarTimezone } from '@/src/features/agent/calendar/calendarTimezone';
import { normalizeCalendarEvents } from '@/src/features/agent/calendarIntelligence/normalizeEvents';
import { resolveTargetDayContext } from '@/src/features/agent/calendarIntelligence/resolveTargetDay';

const AFTER_EVENT_CREATE =
  /(?:^|[\s,.;:!?—-]+)(?:добав(?:ь|ьте|ить)|add|create|schedule|book|запланируй|запланировать|додай|додати|створи|заплануй)\s+(.+?)\s+(?:после|after)\s+(.+?)(?:\s*$|[,.;!?])/iu;

function normalizeForMatch(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenOverlapScore(left: string, right: string) {
  const leftTokens = new Set(normalizeForMatch(left).split(' ').filter((token) => token.length >= 3));
  const rightTokens = normalizeForMatch(right).split(' ').filter((token) => token.length >= 3);

  if (leftTokens.size === 0 || rightTokens.length === 0) {
    return 0;
  }

  let overlap = 0;

  for (const token of rightTokens) {
    if (leftTokens.has(token)) {
      overlap += 1;
    }
  }

  return overlap / Math.max(leftTokens.size, rightTokens.length);
}

export type AfterEventScheduleResolution =
  | {
      ok: true;
      startMs: number;
      endMs: number;
      anchorTitle: string;
      anchorEventId: string;
    }
  | {
      ok: false;
      reason: 'not_after_command' | 'not_found' | 'ambiguous';
      anchorQuery?: string;
      candidates?: Array<{ id: string; title: string; startsAt: string; endsAt: string }>;
    };

export async function resolveAfterEventCreateSchedule(params: {
  transcript: string;
  referenceNow: Date;
  defaultDurationMinutes?: number;
}): Promise<AfterEventScheduleResolution> {
  const match = params.transcript.trim().match(AFTER_EVENT_CREATE);

  if (!match?.[2]) {
    return { ok: false, reason: 'not_after_command' };
  }

  const anchorQuery = match[2].trim();

  if (!anchorQuery) {
    return { ok: false, reason: 'not_found', anchorQuery };
  }

  const timeZone = getExecutiveCalendarTimezone();
  const day = resolveTargetDayContext(params.transcript, params.referenceNow, timeZone);
  const rangeStart = day.range.rangeStartMs;
  const rangeEnd = day.range.rangeEndMs + 24 * 60 * 60_000;

  const { events, fetchOk } = await fetchTimedEventsNearScheduleWindow({
    referenceNow: params.referenceNow,
    proposedStartMs: rangeStart,
    proposedEndMs: rangeEnd,
  });

  if (!fetchOk) {
    return { ok: false, reason: 'not_found', anchorQuery };
  }

  const normalized = normalizeCalendarEvents(events, timeZone).filter((event) => event.startISO.includes('T'));
  const scored = normalized
    .map((event) => ({
      event,
      score: tokenOverlapScore(event.title, anchorQuery),
    }))
    .filter((entry) => entry.score >= 0.34)
    .sort((left, right) => right.score - left.score);

  if (scored.length === 0) {
    return { ok: false, reason: 'not_found', anchorQuery };
  }

  if (scored.length > 1 && scored[0].score - scored[1].score < 0.15) {
    return {
      ok: false,
      reason: 'ambiguous',
      anchorQuery,
      candidates: scored.slice(0, 3).map((entry) => ({
        id: entry.event.id,
        title: entry.event.title,
        startsAt: entry.event.startISO,
        endsAt: entry.event.endISO,
      })),
    };
  }

  const anchor = scored[0].event;
  const durationMinutes = params.defaultDurationMinutes ?? 60;
  const startMs = new Date(anchor.endISO).getTime();
  const endMs = startMs + durationMinutes * 60_000;

  console.log('[AFTER_EVENT_ANCHOR_FOUND]');
  console.log(
    JSON.stringify({
      anchorTitle: anchor.title,
      anchorEventId: anchor.id,
      anchorEndsAt: anchor.endISO,
      newStart: new Date(startMs).toISOString(),
    }),
  );

  return {
    ok: true,
    startMs,
    endMs,
    anchorTitle: anchor.title,
    anchorEventId: anchor.id,
  };
}
