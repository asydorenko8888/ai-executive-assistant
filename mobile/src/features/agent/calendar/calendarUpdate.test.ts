import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { CalendarEvent } from '@/src/entities/calendar/types';
import { detectCalendarCommandIntent } from '@/src/features/agent/calendar/calendarCommandTypes';
import { isTerminalCalendarToolReply } from '@/src/features/agent/calendar/calendarExecutionContract';
import { parseCalendarUpdateTimeShift, stripCalendarUpdateTimeShiftPhrases } from '@/src/features/agent/calendar/calendarUpdateScheduleParser';
import { buildCalendarUpdateEventPayload } from '@/src/features/agent/execution/calendarUpdatePayloadBuilder';

const transcript = 'Move dinner from 7 PM to 8 PM';
const referenceNow = new Date('2026-05-28T15:00:00');

function dinnerEvent(): CalendarEvent {
  const start = new Date(referenceNow);
  start.setHours(19, 0, 0, 0);
  const end = new Date(referenceNow);
  end.setHours(20, 0, 0, 0);

  return {
    id: 'evt-dinner',
    title: 'Dinner',
    startsAt: start.toISOString(),
    endsAt: end.toISOString(),
    isAllDay: false,
  };
}

describe('calendar update integration', () => {
  it('classifies move/reschedule commands as update_calendar_event', () => {
    assert.equal(detectCalendarCommandIntent(transcript), 'update_calendar_event');
  });

  it('strips from/to times so dinner title can be resolved', () => {
    const cleaned = stripCalendarUpdateTimeShiftPhrases(transcript);

    assert.equal(cleaned, 'Move dinner');
    assert.equal(detectCalendarCommandIntent(transcript), 'update_calendar_event');
  });

  it('parses from 7 PM to 8 PM as a one-hour shift on the same day', () => {
    const shift = parseCalendarUpdateTimeShift(transcript, referenceNow);

    assert.equal(shift.ok, true);

    if (!shift.ok) {
      return;
    }

    const from = new Date(shift.fromMs);
    const to = new Date(shift.toMs);

    assert.equal(from.getHours(), 19);
    assert.equal(to.getHours(), 20);
    assert.equal(to.getTime() - from.getTime(), 60 * 60 * 1000);
    assert.equal(from.getDate(), to.getDate());
  });

  it('builds PATCH payload that moves dinner from 7 PM to 8 PM preserving duration', () => {
    const matched = dinnerEvent();
    const result = buildCalendarUpdateEventPayload({
      transcript,
      languageCode: 'en-US',
      referenceNow,
      matchedEvent: matched,
    });

    assert.equal(result.ok, true);

    if (!result.ok) {
      return;
    }

    assert.equal(result.eventId, 'evt-dinner');
    assert.equal(result.payload.summary, 'Dinner');

    const newStart = new Date(result.payload.start.dateTime);
    const newEnd = new Date(result.payload.end.dateTime);

    assert.equal(newStart.getHours(), 20);
    assert.equal(newEnd.getHours(), 21);
    assert.equal(newEnd.getTime() - newStart.getTime(), 60 * 60 * 1000);
  });

  it('uses terminal success copy for verified update replies', () => {
    const reply = 'Event updated successfully:\nTitle: Dinner\nNew time: today, 8:00 PM';
    assert.ok(isTerminalCalendarToolReply(reply));
  });
});
