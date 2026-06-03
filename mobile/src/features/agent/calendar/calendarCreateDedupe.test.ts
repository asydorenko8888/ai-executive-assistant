import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { buildCalendarCreateDedupeKey } from '@/src/features/agent/calendar/calendarCreateDedupeKey';
import {
  endCalendarCreateOperation,
  resetCalendarExecutionSession,
  setLastCalendarToolResponse,
  shouldBlockCalendarRecreate,
  tryBeginCalendarCreateOperation,
} from '@/src/features/agent/execution/calendarExecutionSession';
import { createCalendarToolFailure } from '@/src/features/agent/execution/calendarToolContract';

const timeZone = 'America/Chicago';

function massageAt(iso: string) {
  return buildCalendarCreateDedupeKey({
    title: 'Massage',
    startMs: Date.parse(iso),
    timeZone,
  });
}

describe('calendar create deduplication', () => {
  beforeEach(() => {
    resetCalendarExecutionSession();
  });

  it('builds different dedupe keys for the same title at different start times', () => {
    const fourPm = massageAt('2026-05-28T16:00:00-05:00');
    const ninePm = massageAt('2026-05-28T21:00:00-05:00');

    assert.notEqual(fourPm, ninePm);
    assert.match(fourPm, /create\|massage\|/);
    assert.match(fourPm, /\|16:00\|America\/Chicago$/);
    assert.match(ninePm, /\|21:00\|/);
  });

  it('allows a second create when only the title matches', () => {
    const fourPm = massageAt('2026-05-28T16:00:00-05:00');
    const ninePm = massageAt('2026-05-28T21:00:00-05:00');

    assert.equal(tryBeginCalendarCreateOperation(fourPm), true);
    endCalendarCreateOperation({ dedupeKey: fourPm, failed: false });

    assert.equal(shouldBlockCalendarRecreate(ninePm), false);
    assert.equal(tryBeginCalendarCreateOperation(ninePm), true);
  });

  it('blocks an exact duplicate while the same create is in flight', () => {
    const lunch = buildCalendarCreateDedupeKey({
      title: 'Lunch',
      startMs: Date.parse('2026-05-28T13:00:00-05:00'),
      timeZone,
    });

    assert.equal(tryBeginCalendarCreateOperation(lunch), true);
    assert.equal(shouldBlockCalendarRecreate(lunch), true);
    assert.equal(tryBeginCalendarCreateOperation(lunch), false);
  });

  it('blocks repeated exact duplicate after non-transient failure', () => {
    const lunch = buildCalendarCreateDedupeKey({
      title: 'Lunch',
      startMs: Date.parse('2026-05-28T13:00:00-05:00'),
      timeZone,
    });

    assert.equal(tryBeginCalendarCreateOperation(lunch), true);
    setLastCalendarToolResponse(
      createCalendarToolFailure('CALENDAR_EVENT_NOT_FOUND', 'not found'),
    );
    endCalendarCreateOperation({ dedupeKey: lunch, failed: true });

    assert.equal(shouldBlockCalendarRecreate(lunch), true);
  });
});
