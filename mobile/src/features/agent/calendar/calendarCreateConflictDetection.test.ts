import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { CalendarEvent } from '@/src/entities/calendar/types';
import { resolveCalendarConflictFollowUp } from '@/src/features/agent/calendar/calendarConflictPendingContext';
import {
  findConflictingTimedEvents,
  resolveScheduleConflictIgnoreEventId,
  scheduleIntervalsOverlap,
} from '@/src/features/agent/calendar/calendarScheduleConflictCore';

function event(id: string, title: string, start: string, end: string): CalendarEvent {
  return {
    id,
    title,
    startsAt: start,
    endsAt: end,
    isAllDay: false,
  };
}

function tomorrowAt(hour: number, minute = 0, durationMinutes = 60) {
  const startMs = Date.parse(`2026-05-28T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00-05:00`);
  const endMs = startMs + durationMinutes * 60_000;
  return { startMs, endMs };
}

type CreateAttemptResult = 'blocked_conflict' | 'created';

function simulateInitialCreateAttempt(params: {
  googleEvents: CalendarEvent[];
  proposedStartMs: number;
  proposedEndMs: number;
  selfCreatedEventId?: string | null;
  skipScheduleConflictCheck?: boolean;
  create: () => void;
}): CreateAttemptResult {
  if (params.skipScheduleConflictCheck) {
    params.create();
    return 'created';
  }

  const ignoreEventId = resolveScheduleConflictIgnoreEventId({
    operation: 'create',
    selfCreatedEventId: params.selfCreatedEventId ?? null,
    currentOperationEventId: 'chat-created-first-event',
  });

  const conflicts = findConflictingTimedEvents({
    events: params.googleEvents,
    proposedStartMs: params.proposedStartMs,
    proposedEndMs: params.proposedEndMs,
    ignoreEventId,
  });

  if (conflicts.length > 0) {
    return 'blocked_conflict';
  }

  params.create();
  return 'created';
}

function simulateConflictFollowUp(params: {
  reply: string;
  create: () => void;
}): 'no_create' | 'create_once' | 'cancelled' | 'alternatives' {
  const followUp = resolveCalendarConflictFollowUp(params.reply);

  if (followUp?.kind === 'proceed') {
    params.create();
    return 'create_once';
  }

  if (followUp?.kind === 'cancel') {
    return 'cancelled';
  }

  if (followUp?.kind === 'suggest_slots') {
    return 'alternatives';
  }

  return 'no_create';
}

describe('calendar create conflict detection', () => {
  const existing1400 = event(
    'existing-meeting',
    'Meeting',
    '2026-05-28T14:00:00-05:00',
    '2026-05-28T15:00:00-05:00',
  );

  it('detects conflict for duplicate start tomorrow 14:00-15:00', () => {
    const { startMs, endMs } = tomorrowAt(14, 0, 60);

    const conflicts = findConflictingTimedEvents({
      events: [existing1400],
      proposedStartMs: startMs,
      proposedEndMs: endMs,
      ignoreEventId: null,
    });

    assert.equal(conflicts.length, 1);
    assert.equal(conflicts[0]?.event.id, 'existing-meeting');
  });

  it('detects partial overlap 14:30-15:30 against existing 14:00-15:00', () => {
    const { startMs, endMs } = tomorrowAt(14, 30, 60);

    assert.equal(
      scheduleIntervalsOverlap(startMs, endMs, Date.parse(existing1400.startsAt), Date.parse(existing1400.endsAt)),
      true,
    );

    const conflicts = findConflictingTimedEvents({
      events: [existing1400],
      proposedStartMs: startMs,
      proposedEndMs: endMs,
    });

    assert.equal(conflicts.length, 1);
  });

  it('does not conflict for adjacent slot 15:00-16:00 after existing 14:00-15:00', () => {
    const { startMs, endMs } = tomorrowAt(15, 0, 60);

    assert.equal(
      scheduleIntervalsOverlap(startMs, endMs, Date.parse(existing1400.startsAt), Date.parse(existing1400.endsAt)),
      false,
    );

    const conflicts = findConflictingTimedEvents({
      events: [existing1400],
      proposedStartMs: startMs,
      proposedEndMs: endMs,
    });

    assert.equal(conflicts.length, 0);
  });

  it('normalizes timezones before comparing (UTC vs local offset)', () => {
    const existingUtc = event(
      'utc-event',
      'UTC block',
      '2026-05-28T19:00:00.000Z',
      '2026-05-28T20:00:00.000Z',
    );
    const { startMs, endMs } = tomorrowAt(14, 0, 60);

    const conflicts = findConflictingTimedEvents({
      events: [existingUtc],
      proposedStartMs: startMs,
      proposedEndMs: endMs,
    });

    assert.equal(conflicts.length, 1);
  });

  it('does not ignore chat-created event id on second create', () => {
    const ignoreEventId = resolveScheduleConflictIgnoreEventId({
      operation: 'create',
      selfCreatedEventId: null,
      currentOperationEventId: existing1400.id,
    });

    assert.equal(ignoreEventId, null);

    const { startMs, endMs } = tomorrowAt(14, 0, 60);
    const conflicts = findConflictingTimedEvents({
      events: [existing1400],
      proposedStartMs: startMs,
      proposedEndMs: endMs,
      ignoreEventId,
    });

    assert.equal(conflicts.length, 1);
  });

  it('blocks create until confirmed and declines on нет/ні/no', () => {
    const { startMs, endMs } = tomorrowAt(14, 0, 60);
    let createCalls = 0;
    const create = () => {
      createCalls += 1;
    };

    assert.equal(
      simulateInitialCreateAttempt({
        googleEvents: [existing1400],
        proposedStartMs: startMs,
        proposedEndMs: endMs,
        create,
      }),
      'blocked_conflict',
    );
    assert.equal(createCalls, 0);

    for (const decline of ['нет', 'ні', 'no']) {
      assert.equal(simulateConflictFollowUp({ reply: decline, create }), 'alternatives');
      assert.equal(createCalls, 0);
    }
  });

  it('suggests alternatives after bare да/так/yes and creates on explicit confirmation', () => {
    const { startMs, endMs } = tomorrowAt(14, 0, 60);
    let createCalls = 0;
    const create = () => {
      createCalls += 1;
    };

    assert.equal(
      simulateInitialCreateAttempt({
        googleEvents: [existing1400],
        proposedStartMs: startMs,
        proposedEndMs: endMs,
        create,
      }),
      'blocked_conflict',
    );
    assert.equal(createCalls, 0);

    assert.equal(simulateConflictFollowUp({ reply: 'нет', create }), 'alternatives');
    assert.equal(createCalls, 0);

    for (const proceed of ['да', 'так', 'yes']) {
      assert.equal(resolveCalendarConflictFollowUp(proceed)?.kind, 'proceed');
    }

    assert.equal(simulateConflictFollowUp({ reply: 'да', create }), 'create_once');
    assert.equal(createCalls, 1);

    assert.equal(resolveCalendarConflictFollowUp('все равно создай')?.kind, 'proceed');
    assert.equal(simulateConflictFollowUp({ reply: 'все равно создай', create }), 'create_once');
    assert.equal(createCalls, 2);
  });

  it('calls create once after user confirms with skipScheduleConflictCheck path', () => {
    const { startMs, endMs } = tomorrowAt(14, 0, 60);
    let createCalls = 0;
    const create = () => {
      createCalls += 1;
    };

    assert.equal(
      simulateInitialCreateAttempt({
        googleEvents: [existing1400],
        proposedStartMs: startMs,
        proposedEndMs: endMs,
        create,
      }),
      'blocked_conflict',
    );
    assert.equal(createCalls, 0);

    assert.equal(simulateConflictFollowUp({ reply: 'нет', create }), 'alternatives');
    assert.equal(createCalls, 0);

    assert.equal(
      simulateInitialCreateAttempt({
        googleEvents: [existing1400],
        proposedStartMs: startMs,
        proposedEndMs: endMs,
        skipScheduleConflictCheck: true,
        create,
      }),
      'created',
    );
    assert.equal(createCalls, 1);
  });
});
