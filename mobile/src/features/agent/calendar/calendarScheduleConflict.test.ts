import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { CalendarEvent } from '@/src/entities/calendar/types';
import {
  findConflictingTimedEvents,
  scheduleWindowsOverlap,
} from '@/src/features/agent/calendar/calendarScheduleConflictCore';
import { resolveCalendarConflictFollowUp } from '@/src/features/agent/calendar/calendarConflictPendingContext';

function event(id: string, title: string, start: string, end: string, isAllDay = false): CalendarEvent {
  return {
    id,
    title,
    startsAt: start,
    endsAt: end,
    isAllDay,
  };
}

describe('calendar schedule conflict', () => {
  it('detects overlap when windows partially intersect', () => {
    assert.equal(scheduleWindowsOverlap(18 * 60, 19 * 60, 18 * 60 + 30, 19 * 60 + 30), true);
    assert.equal(scheduleWindowsOverlap(18 * 60, 19 * 60, 19 * 60, 20 * 60), false);
  });

  it('ignores all-day events and the event being updated', () => {
    const gym = event('gym', 'Gym', '2026-05-28T18:00:00-05:00', '2026-05-28T19:00:00-05:00');
    const allDay = event('holiday', 'Holiday', '2026-05-28', '2026-05-29', true);
    const walk = event('walk', 'Walk', '2026-05-28T20:00:00-05:00', '2026-05-28T21:00:00-05:00');

    const proposedStart = Date.parse('2026-05-28T18:30:00-05:00');
    const proposedEnd = Date.parse('2026-05-28T19:30:00-05:00');

    const conflicts = findConflictingTimedEvents({
      events: [gym, allDay, walk],
      proposedStartMs: proposedStart,
      proposedEndMs: proposedEnd,
      ignoreEventId: 'walk',
    });

    assert.equal(conflicts.length, 1);
    assert.equal(conflicts[0]?.event.id, 'gym');
  });

  it('resolves yes, no, and suggest-slot follow-ups', () => {
    assert.equal(resolveCalendarConflictFollowUp('yes')?.kind, 'proceed');
    assert.equal(resolveCalendarConflictFollowUp('still move it')?.kind, 'proceed');
    assert.equal(resolveCalendarConflictFollowUp('no')?.kind, 'cancel');
    assert.equal(resolveCalendarConflictFollowUp('suggest another time')?.kind, 'suggest_slots');
  });
});
