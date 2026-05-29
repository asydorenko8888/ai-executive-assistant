import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { CalendarEvent } from '@/src/entities/calendar/types';
import { extractCalendarCommand } from '@/src/features/agent/calendar/calendarCommandExtractor';
import { extractCreateEventTitle } from '@/src/features/agent/calendar/calendarCreateIntentExtractor';
import {
  pendingDeleteContextFromResolution,
  tryMergePendingCalendarDeleteReply,
} from '@/src/features/agent/calendar/calendarDeletePendingContext';
import { resolveCalendarDeleteTargetFromEvents } from '@/src/features/agent/calendar/calendarDeleteResolution';
import {
  findCalendarEventForDeleteFromEvents,
  findCalendarEventForUpdateFromEvents,
} from '@/src/features/agent/calendarIntelligence/eventAtTimeMatch';
import { resolveTargetDayContext } from '@/src/features/agent/calendarIntelligence/resolveTargetDay';
import { buildCalendarUpdateEventPayload } from '@/src/features/agent/execution/calendarUpdatePayloadBuilder';
import {
  resetCalendarExecutionSession,
  setLastCalendarReadMatch,
} from '@/src/features/agent/execution/calendarExecutionSession';
import { verifyUpdatedEventMatchesPayload } from '@/src/features/agent/calendar/calendarUpdateVerification';

const timeZone = 'America/Chicago';
const referenceNow = new Date('2026-05-28T20:00:00-05:00');

function chicagoEvent(
  id: string,
  title: string,
  dayOffset: number,
  hour: number,
  minute = 0,
  durationMinutes = 60,
): CalendarEvent {
  const base = new Date(referenceNow);
  base.setDate(base.getDate() + dayOffset);
  const pad = (value: number) => String(value).padStart(2, '0');
  const y = base.getFullYear();
  const m = pad(base.getMonth() + 1);
  const d = pad(base.getDate());
  const start = `${y}-${m}-${d}T${pad(hour)}:${pad(minute)}:00-05:00`;
  const end = new Date(start);
  end.setMinutes(end.getMinutes() + durationMinutes);

  return {
    id,
    title,
    startsAt: start,
    endsAt: end.toISOString(),
    isAllDay: false,
  };
}

describe('calendar mutation reliability', () => {
  it('returns NOT_FOUND for delete on an empty calendar', () => {
    const resolution = resolveCalendarDeleteTargetFromEvents({
      events: [],
      titleQuery: 'walk',
      transcript: 'Delete walk today',
      referenceNow,
      timeZone,
    });

    assert.equal(resolution.status, 'not_found');
  });

  it('returns NOT_FOUND for update on an empty calendar', () => {
    const resolved = findCalendarEventForUpdateFromEvents({
      events: [],
      transcript: 'Move walk from 7 PM to 8 PM',
      referenceNow,
      titleQuery: 'walk',
      timeZone,
    });

    assert.equal(resolved.match, null);
    assert.equal(resolved.ambiguous, false);
  });

  it('does not resurrect events from pinned READ session hints when the calendar list is empty', () => {
    resetCalendarExecutionSession();
    setLastCalendarReadMatch({
      eventId: 'ghost-walk',
      title: 'Walk',
      startISO: '2026-05-28T19:00:00-05:00',
      clockMinutes: 19 * 60,
      readTimeKind: 'event_at_time',
    });

    const resolved = findCalendarEventForDeleteFromEvents({
      events: [],
      transcript: 'Delete walk today at 7 PM',
      referenceNow,
      titleQuery: 'walk',
      timeZone,
    });

    assert.equal(resolved.match, null);
    assert.notEqual(resolved.matchSource, 'pinned_read');
    resetCalendarExecutionSession();
  });

  it('resolves update then delete for the same freshly listed event', () => {
    const walk = chicagoEvent('walk-1', 'Walk', 0, 19);
    const updateTranscript = 'Move walk from 7 PM to 8 PM';

    const updateMatch = findCalendarEventForUpdateFromEvents({
      events: [walk],
      transcript: updateTranscript,
      referenceNow,
      titleQuery: 'walk',
      timeZone,
    });

    assert.ok(updateMatch.match);
    assert.equal(updateMatch.match?.id, 'walk-1');

    const payload = buildCalendarUpdateEventPayload({
      transcript: updateTranscript,
      languageCode: 'en-US',
      referenceNow,
      matchedEvent: updateMatch.match!,
    });

    assert.equal(payload.ok, true);

    if (!payload.ok) {
      return;
    }

    const updatedWalk: CalendarEvent = {
      ...walk,
      startsAt: payload.payload.start.dateTime ?? walk.startsAt,
      endsAt: payload.payload.end.dateTime ?? walk.endsAt,
    };

    const verification = verifyUpdatedEventMatchesPayload(
      {
        id: updatedWalk.id,
        summary: updatedWalk.title,
        startsAt: updatedWalk.startsAt,
        endsAt: updatedWalk.endsAt,
      },
      payload.payload,
    );

    assert.equal(verification.ok, true);

    const deleteResolution = resolveCalendarDeleteTargetFromEvents({
      events: [updatedWalk],
      titleQuery: 'walk',
      transcript: 'Delete walk today at 8 PM',
      referenceNow,
      timeZone,
    });

    assert.equal(deleteResolution.status, 'unique');
    assert.equal(deleteResolution.event.id, 'walk-1');
  });

  it('does not find a deleted event after the calendar list is cleared', () => {
    const resolution = resolveCalendarDeleteTargetFromEvents({
      events: [],
      titleQuery: 'walk',
      transcript: 'Delete walk today at 8 PM',
      referenceNow,
      timeZone,
    });

    assert.equal(resolution.status, 'not_found');
  });

  it('re-reads tomorrow when delete follow-up says tomorrow’s', () => {
    const todayWalkMorning = chicagoEvent('walk-today-am', 'Walk', 0, 9);
    const todayWalkEvening = chicagoEvent('walk-today-pm', 'Morning Walk', 0, 18);
    const tomorrowWalk = chicagoEvent('walk-tomorrow', 'Walk', 1, 18);

    const ambiguous = resolveCalendarDeleteTargetFromEvents({
      events: [todayWalkMorning, todayWalkEvening],
      titleQuery: 'walk',
      transcript: 'Delete walk today',
      referenceNow,
      timeZone,
    });

    assert.equal(ambiguous.status, 'ambiguous');

    const pending = pendingDeleteContextFromResolution({
      sourceTranscript: 'Delete walk today',
      titleQuery: 'walk',
    });

    const merged = tryMergePendingCalendarDeleteReply({
      pending,
      reply: "tomorrow's",
    });

    assert.ok(merged);
    assert.match(merged!.transcript, /tomorrow|завтра/i);

    const day = resolveTargetDayContext(merged!.transcript, referenceNow, timeZone);
    assert.equal(day.dayOffset, 1);

    const tomorrowOnly = resolveCalendarDeleteTargetFromEvents({
      events: [tomorrowWalk],
      titleQuery: 'walk',
      transcript: merged!.transcript,
      referenceNow,
      timeZone,
    });

    assert.equal(tomorrowOnly.status, 'unique');
    assert.equal(tomorrowOnly.event.id, 'walk-tomorrow');
  });

  it('does not leak previous user command words into CREATE title', () => {
    const previousCommand = 'Добавь прогулку сегодня в 20:00';
    const currentCommand = 'додай каву завтра в 9:30 ранку';

    assert.equal(extractCreateEventTitle(currentCommand), 'Кава');
    assert.doesNotMatch(extractCreateEventTitle(currentCommand) ?? '', /прогул/i);

    const extraction = extractCalendarCommand({
      transcript: `${previousCommand} ${currentCommand}`,
      titleSourceTranscript: currentCommand,
      referenceNow,
    });

    assert.equal(extraction.title, 'Кава');
    assert.doesNotMatch(extraction.title ?? '', /прогул/i);
  });
});
