import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { isCalendarFreeTimeTodayQuery } from '@/src/features/agent/calendar/calendarFreeTimeQuery';
import { isOperationalCalendarCreateRequest } from '@/src/features/agent/intent/operationalCalendarWriteDetection';
import { classifyCalendarQueryIntent } from '@/src/features/agent/calendarIntelligence/classifyQuery';
import { buildDeterministicCalendarAnswer } from '@/src/features/agent/calendarIntelligence/calendarAnswerEngine';
import type { CalendarFreeSlot } from '@/src/features/agent/calendarIntelligence/types';

const referenceNow = new Date('2026-05-28T18:19:00-05:00');
const timeZone = 'America/Chicago';

const freeTimePhrases = [
  'когда у меня сегодня свободное время',
  'коли у мене сьогодні вільний час',
  'когда я свободен сегодня',
  'коли я вільний сьогодні',
  'free time today',
  'when am I free today',
];

describe('calendarFreeTimeQuery', () => {
  it('detects RU/UK/EN free-time today phrasing', () => {
    for (const phrase of freeTimePhrases) {
      assert.equal(isCalendarFreeTimeTodayQuery(phrase), true, phrase);
      assert.equal(classifyCalendarQueryIntent(phrase), 'free_time_query', phrase);
    }
  });

  it('does not treat free-time queries as calendar create', () => {
    for (const phrase of freeTimePhrases) {
      assert.equal(isOperationalCalendarCreateRequest(phrase), false, phrase);
    }
  });

  it('returns free windows from the current time forward', () => {
    const events = [
      {
        id: 'dinner',
        title: 'Dinner',
        startsAt: '2026-05-28T20:00:00-05:00',
        endsAt: '2026-05-28T21:00:00-05:00',
        isAllDay: false,
      },
      {
        id: 'meditation',
        title: 'Meditation',
        startsAt: '2026-05-28T22:30:00-05:00',
        endsAt: '2026-05-28T23:30:00-05:00',
        isAllDay: false,
      },
      {
        id: 'lunch',
        title: 'Lunch',
        startsAt: '2026-05-28T14:00:00-05:00',
        endsAt: '2026-05-28T15:00:00-05:00',
        isAllDay: false,
      },
    ];

    const answer = buildDeterministicCalendarAnswer({
      transcript: 'когда у меня сегодня свободное время',
      events,
      referenceNow,
      timeZone,
    });

    assert.equal(answer?.intent, 'free_time_query');

    const slots = answer?.payload.freeSlots as CalendarFreeSlot[];

    assert.equal(slots.length, 3);
    assert.equal(slots[0]?.startMinutes, 18 * 60 + 19);
    assert.equal(slots[0]?.endMinutes, 20 * 60);
    assert.equal(slots[1]?.startMinutes, 21 * 60);
    assert.equal(slots[1]?.endMinutes, 22 * 60 + 30);
    assert.equal(slots[2]?.startMinutes, 23 * 60 + 30);
    assert.equal(slots[2]?.endMinutes, 24 * 60);
  });
});
