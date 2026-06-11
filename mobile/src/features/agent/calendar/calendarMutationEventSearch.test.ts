import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { CalendarEvent } from '@/src/entities/calendar/types';
import { resolveMutationSearchDayOffsets } from '@/src/features/agent/calendar/calendarMutationSearchWindow';
import { getZonedTimeParts } from '@/src/features/agent/calendar/calendarTimezone';
import { findCalendarEventForUpdateFromEvents } from '@/src/features/agent/calendarIntelligence/eventAtTimeMatch';

const timeZone = 'America/Chicago';
const referenceNow = new Date('2026-05-28T20:00:00-05:00');

function chicagoEvent(
  id: string,
  title: string,
  hour: number,
  minute = 0,
  dayOffset = 0,
): CalendarEvent {
  const base = new Date(referenceNow);
  base.setDate(base.getDate() + dayOffset);
  const pad = (value: number) => String(value).padStart(2, '0');
  const y = base.getFullYear();
  const m = pad(base.getMonth() + 1);
  const d = pad(base.getDate());
  const start = `${y}-${m}-${d}T${pad(hour)}:${pad(minute)}:00-05:00`;
  const end = new Date(start);
  end.setMinutes(end.getMinutes() + 60);

  return {
    id,
    title,
    startsAt: start,
    endsAt: end.toISOString(),
    isAllDay: false,
  };
}

describe('calendar mutation event search windows', () => {
  it('searches today and tomorrow when moving an event to another day', () => {
    assert.deepEqual(
      resolveMutationSearchDayOffsets({
        transcript: 'Перенеси прогулку на завтра',
        referenceNow,
        timeZone,
      }),
      [0, 1],
    );
    assert.deepEqual(
      resolveMutationSearchDayOffsets({
        transcript: 'Перенеси тест на завтра',
        referenceNow,
        timeZone,
      }),
      [0, 1],
    );
    assert.deepEqual(
      resolveMutationSearchDayOffsets({
        transcript: 'перенеси прогулку на завтра в 15:00',
        referenceNow,
        timeZone,
      }),
      [0, 1],
    );
  });

  it('keeps single-day search for delete on a named day', () => {
    assert.deepEqual(
      resolveMutationSearchDayOffsets({
        transcript: 'Удали прогулку завтра',
        referenceNow,
        timeZone,
      }),
      [1],
    );
  });

  it('searches today and tomorrow for relative hour shifts', () => {
    assert.deepEqual(
      resolveMutationSearchDayOffsets({
        transcript: 'Перенеси прогулку на час позже',
        referenceNow,
        timeZone,
      }),
      [0, 1],
    );
  });

  it('finds a today event when user moves it to tomorrow', () => {
    const walkToday = chicagoEvent('walk-today', 'Прогулка', 15, 0, 0);

    const resolved = findCalendarEventForUpdateFromEvents({
      transcript: 'Перенеси прогулку на завтра',
      referenceNow,
      events: [walkToday],
      titleQuery: 'прогулка',
      timeZone,
    });

    assert.equal(resolved.match?.id, 'walk-today');
    assert.ok(resolved.toMs);
    const targetDay = getZonedTimeParts(new Date(resolved.toMs!), timeZone);
    assert.equal(targetDay.day, 29);
    assert.equal(targetDay.hour, 15);
  });
});
