import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { CalendarEvent } from '@/src/entities/calendar/types';
import { detectCalendarCommandIntent } from '@/src/features/agent/calendar/calendarCommandTypes';
import {
  buildCalendarDeleteAmbiguousReply,
  buildCalendarDeleteNotFoundReply,
} from '@/src/features/agent/calendar/calendarDeleteNaturalReplies';
import {
  isRecurringGoogleCalendarEventId,
  resolveCalendarDeleteTargetFromEvents,
} from '@/src/features/agent/calendar/calendarDeleteResolution';
import { isTerminalCalendarToolReply } from '@/src/features/agent/calendar/calendarExecutionContract';
import {
  createCalendarToolFailure,
} from '@/src/features/agent/execution/calendarToolContract';

const referenceNow = new Date('2026-05-28T15:00:00');

function timedEvent(
  id: string,
  title: string,
  hour: number,
  minute = 0,
): CalendarEvent {
  const start = new Date(referenceNow);
  start.setHours(hour, minute, 0, 0);
  const end = new Date(start);
  end.setHours(hour + 1, minute, 0, 0);

  return {
    id,
    title,
    startsAt: start.toISOString(),
    endsAt: end.toISOString(),
    isAllDay: false,
  };
}

describe('calendar delete integration', () => {
  it('classifies delete/remove/cancel commands as delete_calendar_event', () => {
    assert.equal(detectCalendarCommandIntent('Delete dinner at 7 PM'), 'delete_calendar_event');
    assert.equal(detectCalendarCommandIntent('Remove my meeting at 3 PM'), 'delete_calendar_event');
    assert.equal(detectCalendarCommandIntent('Cancel dinner at 7 PM'), 'delete_calendar_event');
  });

  it('does not delete when multiple similar events match', () => {
    const events = [
      timedEvent('dinner-a', 'Dinner', 19),
      timedEvent('dinner-b', 'Dinner', 19, 15),
    ];

    const resolution = resolveCalendarDeleteTargetFromEvents({
      events,
      titleQuery: 'Dinner',
      targetMs: events[0].startsAt ? Date.parse(events[0].startsAt) : null,
      hasExplicitTime: true,
    });

    assert.equal(resolution.status, 'ambiguous');
    assert.equal(resolution.candidates.length, 2);
  });

  it('does not delete vague meeting requests when multiple meetings exist', () => {
    const events = [
      timedEvent('m1', 'Team meeting', 10),
      timedEvent('m2', 'Client meeting', 14),
    ];

    const resolution = resolveCalendarDeleteTargetFromEvents({
      events,
      titleQuery: 'meeting',
      targetMs: null,
      hasExplicitTime: false,
    });

    assert.equal(resolution.status, 'ambiguous');
  });

  it('returns not found when no event matches', () => {
    const resolution = resolveCalendarDeleteTargetFromEvents({
      events: [timedEvent('lunch', 'Lunch', 12)],
      titleQuery: 'Dinner',
      targetMs: null,
      hasExplicitTime: false,
    });

    assert.equal(resolution.status, 'not_found');
  });

  it('selects a unique match when title and time disambiguate', () => {
    const dinner = timedEvent('dinner-1', 'Dinner', 19);
    const lunch = timedEvent('lunch-1', 'Lunch', 12);

    const resolution = resolveCalendarDeleteTargetFromEvents({
      events: [dinner, lunch],
      titleQuery: 'Dinner',
      targetMs: Date.parse(dinner.startsAt),
      hasExplicitTime: true,
    });

    assert.equal(resolution.status, 'unique');
    assert.equal(resolution.event.id, 'dinner-1');
  });

  it('blocks recurring instance deletion', () => {
    const recurring = timedEvent('series_20260528T190000Z', 'Weekly standup', 9);
    recurring.id = 'abc123_20260528T190000Z';

    const resolution = resolveCalendarDeleteTargetFromEvents({
      events: [recurring],
      titleQuery: 'Weekly standup',
      targetMs: Date.parse(recurring.startsAt),
      hasExplicitTime: true,
    });

    assert.equal(resolution.status, 'recurring_not_supported');
    assert.equal(isRecurringGoogleCalendarEventId(recurring.id), true);
  });

  it('uses natural not-found and ambiguous replies', () => {
    assert.equal(
      buildCalendarDeleteNotFoundReply('ru'),
      'Я не нашёл такое событие в календаре.',
    );
    assert.equal(
      buildCalendarDeleteAmbiguousReply('ru'),
      'Я нашёл несколько похожих событий. Какое именно удалить?',
    );
    assert.ok(isTerminalCalendarToolReply(buildCalendarDeleteNotFoundReply('ru')));
    assert.ok(isTerminalCalendarToolReply(buildCalendarDeleteAmbiguousReply('ru')));
  });

  it('does not mark unverified backend delete as verified success', () => {
    const failure = createCalendarToolFailure('VERIFY_FAILED', 'Google Calendar did not confirm deletion.');

    assert.equal(failure.status, 'FAILURE');
    assert.equal(failure.verified, false);
    assert.equal(failure.verificationFetched, false);
  });
});
