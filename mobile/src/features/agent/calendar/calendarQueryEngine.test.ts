import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import type { CalendarEvent } from '@/src/entities/calendar/types';
import { resetCalendarConversationState } from '@/src/features/agent/calendar/calendarConversationState';
import {
  augmentEventsWithConversationContext,
  commitCreatedCalendarEvent,
  commitDeletedCalendarEvent,
  commitModifiedCalendarEvent,
  getCalendarWorkingMemory,
  getLastCalendarSnapshot,
  resetCalendarConversationStore,
  setLastCalendarSnapshot,
} from '@/src/features/agent/calendar/calendarConversationStore';
import { resetConversationEventMemory } from '@/src/features/agent/calendar/calendarConversationEventMemory';
import { buildDeterministicCalendarAnswer } from '@/src/features/agent/calendarIntelligence/calendarAnswerEngine';
import type { NormalizedCalendarEvent } from '@/src/features/agent/calendarIntelligence/types';
import { formatDeterministicCalendarReply } from '@/src/features/agent/calendarIntelligence/formatDeterministicReply';
import { parseQueryClockMinutes } from '@/src/features/agent/calendarIntelligence/parseQueryClock';
import { formatWallClockLabel } from '@/src/features/agent/calendarIntelligence/calendarWallClockLabel';
import { resolveTargetDayContext } from '@/src/features/agent/calendarIntelligence/resolveTargetDay';

const referenceNow = new Date('2026-05-28T12:00:00-05:00');
const timeZone = 'America/Chicago';

function event(params: {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
}): CalendarEvent {
  return {
    id: params.id,
    title: params.title,
    startsAt: params.startsAt,
    endsAt: params.endsAt,
    isAllDay: false,
  };
}

function resetStores() {
  resetCalendarConversationState('test_reset');
  resetCalendarConversationStore('test_reset');
  resetConversationEventMemory('test_reset');
}

describe('calendar query engine', () => {
  beforeEach(() => {
    resetStores();
  });

  it('parses 9 PM variants to 21:00 executive minutes', () => {
    const day = resolveTargetDayContext('today at 9 PM', referenceNow, timeZone);
    const variants = [
      '9 PM',
      '09:00 PM',
      '21:00',
      '9 tonight',
      'today at 9 PM',
      'What do I have today at 9 PM?',
      'сегодня в 9 вечера',
      'на 9 вечера',
      'о 21:00',
    ];

    for (const query of variants) {
      const minutes = parseQueryClockMinutes(query, day, { logResolution: false });
      assert.equal(minutes, 21 * 60, query);
    }
  });

  it('formats requested 9 PM label as 9 PM not 4 PM', () => {
    const day = resolveTargetDayContext('today at 9 PM', referenceNow, timeZone);
    const label = formatWallClockLabel(21 * 60, day);

    assert.match(label, /9/i);
    assert.doesNotMatch(label, /4/i);
  });

  it('Test 1: finds Dentist at 7 PM after create', () => {
    const dentist = event({
      id: 'dentist',
      title: 'Dentist',
      startsAt: '2026-05-28T19:00:00-05:00',
      endsAt: '2026-05-28T20:00:00-05:00',
    });

    commitCreatedCalendarEvent({
      eventId: dentist.id,
      title: dentist.title,
      startISO: dentist.startsAt,
      endISO: dentist.endsAt,
    });
    setLastCalendarSnapshot([dentist], 'test');

    const answer = buildDeterministicCalendarAnswer({
      transcript: 'What do I have at 7 PM?',
      events: getLastCalendarSnapshot(),
      referenceNow,
      timeZone,
    });

    const atTime = answer?.payload.atTimeEvents as NormalizedCalendarEvent[] | undefined;
    assert.equal(atTime?.length, 1);
    assert.equal(atTime?.[0]?.title, 'Dentist');
  });

  it('Test 2: finds Dentist at 8 PM after move', () => {
    commitModifiedCalendarEvent({
      eventId: 'dentist',
      title: 'Dentist',
      startISO: '2026-05-28T20:00:00-05:00',
      endISO: '2026-05-28T21:00:00-05:00',
    });
    setLastCalendarSnapshot(
      [
        event({
          id: 'dentist',
          title: 'Dentist',
          startsAt: '2026-05-28T20:00:00-05:00',
          endsAt: '2026-05-28T21:00:00-05:00',
        }),
      ],
      'test',
    );

    const answer = buildDeterministicCalendarAnswer({
      transcript: 'What do I have at 8 PM?',
      events: getLastCalendarSnapshot(),
      referenceNow,
      timeZone,
    });

    const atTime = answer?.payload.atTimeEvents as NormalizedCalendarEvent[] | undefined;
    assert.equal(atTime?.[0]?.title, 'Dentist');
    assert.equal(parseQueryClockMinutes('8 PM', resolveTargetDayContext('', referenceNow, timeZone), { logResolution: false }), 20 * 60);
  });

  it('deleted Dinner at 10 PM does not reappear in augmented store', () => {
    const dinner = event({
      id: 'dinner-10',
      title: 'Dinner',
      startsAt: '2026-05-28T22:00:00-05:00',
      endsAt: '2026-05-28T23:00:00-05:00',
    });

    commitCreatedCalendarEvent({
      eventId: dinner.id,
      title: dinner.title,
      startISO: dinner.startsAt,
      endISO: dinner.endsAt,
    });
    setLastCalendarSnapshot([dinner], 'test_seed');

    commitDeletedCalendarEvent({
      eventId: dinner.id,
      title: dinner.title,
      startISO: dinner.startsAt,
      endISO: dinner.endsAt,
    });

    assert.equal(
      augmentEventsWithConversationContext([]).some((entry) => entry.id === dinner.id),
      false,
    );
    assert.equal(getCalendarWorkingMemory().lastReferenced, null);

    const answer = buildDeterministicCalendarAnswer({
      transcript: 'What do I have at 10 PM?',
      events: getLastCalendarSnapshot(),
      referenceNow,
      timeZone,
    });

    const atTime = answer?.payload.atTimeEvents as NormalizedCalendarEvent[] | undefined;
    assert.equal(atTime?.length ?? 0, 0);
  });

  it('Test 3: nothing at 8 PM after delete', () => {
    commitDeletedCalendarEvent({
      eventId: 'dentist',
      title: 'Dentist',
      startISO: '2026-05-28T20:00:00-05:00',
      endISO: '2026-05-28T21:00:00-05:00',
    });

    const answer = buildDeterministicCalendarAnswer({
      transcript: 'What do I have at 8 PM?',
      events: getLastCalendarSnapshot(),
      referenceNow,
      timeZone,
    });

    const atTime = answer?.payload.atTimeEvents as NormalizedCalendarEvent[] | undefined;
    assert.equal(atTime?.length, 0);

    const day = resolveTargetDayContext('What do I have at 8 PM?', referenceNow, timeZone);
    const reply = formatDeterministicCalendarReply({
      intent: 'events_at_time',
      day,
      locale: 'en',
      events: answer?.events ?? [],
      atTimeEvents: atTime ?? [],
      clockMinutes: answer?.payload.clockMinutes as number,
      userTranscript: 'What do I have at 8 PM?',
    });

    assert.match(reply, /Nothing is scheduled at 8/i);
    assert.doesNotMatch(reply, /4\s*PM/i);
  });

  it('Test 4: answers for 9 PM never mentions 4 PM', async () => {
    setLastCalendarSnapshot(
      [
        event({
          id: 'walk',
          title: 'Walk',
          startsAt: '2026-05-28T21:00:00-05:00',
          endsAt: '2026-05-28T22:00:00-05:00',
        }),
      ],
      'test',
    );

    const day = resolveTargetDayContext('What do I have today at 9 PM?', referenceNow, timeZone);
    const answer = buildDeterministicCalendarAnswer({
      transcript: 'What do I have today at 9 PM?',
      events: getLastCalendarSnapshot(),
      referenceNow,
      timeZone,
    });

    assert.equal(answer?.payload.clockMinutes, 21 * 60);
    const atTime = answer?.payload.atTimeEvents as NormalizedCalendarEvent[] | undefined;
    assert.equal(atTime?.[0]?.title, 'Walk');

    const reply =
      formatDeterministicCalendarReply({
        intent: 'events_at_time',
        day,
        locale: 'en',
        events: answer!.events,
        atTimeEvents: answer!.payload.atTimeEvents as import('@/src/features/agent/calendarIntelligence/types').NormalizedCalendarEvent[],
        clockMinutes: answer!.payload.clockMinutes as number,
        userTranscript: 'What do I have today at 9 PM?',
      }) ?? '';

    assert.match(reply, /9/i);
    assert.doesNotMatch(reply, /4\s*PM/i);
    assert.doesNotMatch(reply, /Nothing is scheduled at 4/i);
  });

  it('Test 5: local store retains events when remote list is empty', () => {
    commitCreatedCalendarEvent({
      eventId: 'dinner',
      title: 'Dinner',
      startISO: '2026-05-28T20:00:00-05:00',
      endISO: '2026-05-28T21:00:00-05:00',
    });

    const answer = buildDeterministicCalendarAnswer({
      transcript: 'What do I have at 8 PM?',
      events: getLastCalendarSnapshot(),
      referenceNow,
      timeZone,
    });

    const atTime = answer?.payload.atTimeEvents as NormalizedCalendarEvent[] | undefined;
    assert.equal(atTime?.[0]?.title, 'Dinner');
    assert.ok(getLastCalendarSnapshot().length > 0);
  });
});
