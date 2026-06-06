import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { CalendarUpdateEventPayload } from '@/src/features/agent/execution/actionExecutionTypes';
import { verifyUpdateWithRetryReads } from '@/src/features/agent/calendar/calendarUpdateVerificationRetry';

const payload: CalendarUpdateEventPayload = {
  summary: 'Ужин',
  start: { dateTime: '2026-05-28T20:00:00-05:00', timeZone: 'America/Chicago' },
  end: { dateTime: '2026-05-28T21:00:00-05:00', timeZone: 'America/Chicago' },
};

describe('calendar update verification retry', () => {
  it('accepts the first GET when it already matches requested time', async () => {
    const reads = [
      {
        id: 'dinner-1',
        summary: 'Ужин',
        startsAt: '2026-05-28T20:00:00-05:00',
        endsAt: '2026-05-28T21:00:00-05:00',
      },
    ];

    const result = await verifyUpdateWithRetryReads({
      eventId: 'dinner-1',
      payload,
      oldStartsAt: '2026-05-28T19:00:00-05:00',
      delaysMs: [0, 500, 1000, 2000],
      sleepFn: async () => {},
      readEvent: async () => reads.shift() ?? null,
    });

    assert.equal(result.verified, true);
    assert.equal(result.attempts.length, 1);
    assert.equal(result.attempts[0]?.matchesPayload, true);
  });

  it('retries stale reads until requested time appears', async () => {
    const reads = [
      {
        id: 'dinner-1',
        summary: 'Ужин',
        startsAt: '2026-05-28T19:00:00-05:00',
        endsAt: '2026-05-28T20:00:00-05:00',
      },
      {
        id: 'dinner-1',
        summary: 'Ужин',
        startsAt: '2026-05-28T19:00:00-05:00',
        endsAt: '2026-05-28T20:00:00-05:00',
      },
      {
        id: 'dinner-1',
        summary: 'Ужин',
        startsAt: '2026-05-28T20:00:00-05:00',
        endsAt: '2026-05-28T21:00:00-05:00',
      },
    ];
    const slept: number[] = [];

    const result = await verifyUpdateWithRetryReads({
      eventId: 'dinner-1',
      payload,
      oldStartsAt: '2026-05-28T19:00:00-05:00',
      delaysMs: [0, 500, 1000, 2000],
      sleepFn: async (ms) => {
        slept.push(ms);
      },
      readEvent: async () => reads.shift() ?? null,
    });

    assert.equal(result.verified, true);
    assert.equal(result.attempts.length, 3);
    assert.equal(result.attempts[0]?.matchesPayload, false);
    assert.equal(result.attempts[1]?.matchesPayload, false);
    assert.equal(result.attempts[2]?.matchesPayload, true);
    assert.deepEqual(slept, [500, 1000]);
    assert.equal(result.attempts[2]?.startsAt, '2026-05-28T20:00:00-05:00');
  });

  it('returns VERIFY mismatch details when no read matches requested time', async () => {
    const stale = {
      id: 'dinner-1',
      summary: 'Ужин',
      startsAt: '2026-05-28T19:00:00-05:00',
      endsAt: '2026-05-28T20:00:00-05:00',
    };

    const result = await verifyUpdateWithRetryReads({
      eventId: 'dinner-1',
      payload,
      oldStartsAt: stale.startsAt,
      delaysMs: [0, 1],
      sleepFn: async () => {},
      readEvent: async () => stale,
    });

    assert.equal(result.verified, false);
    assert.equal(result.attempts.length, 2);
    assert.equal(result.finalMismatch?.startMatches, false);
    assert.equal(result.finalMismatch?.actualStart, Date.parse(stale.startsAt));
    assert.equal(result.finalMismatch?.expectedStart, Date.parse(payload.start.dateTime));
  });
});
