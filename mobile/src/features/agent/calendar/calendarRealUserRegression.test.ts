import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import type { CalendarEvent } from '@/src/entities/calendar/types';
import { resolveMutationSearchDayOffset } from '@/src/features/agent/calendar/calendarActiveEventContext';
import { resetCalendarConversationState } from '@/src/features/agent/calendar/calendarConversationState';
import {
  extractCalendarUpdateParameters,
  extractUpdateEventTitle,
} from '@/src/features/agent/calendar/calendarUpdateIntentExtractor';
import {
  parseCalendarUpdateSchedule,
  resolveUpdateTargetMs,
} from '@/src/features/agent/calendar/calendarUpdateScheduleParser';
import {
  augmentEventsWithConversationContext,
  getLastCalendarSnapshot,
  recordCreatedConversationEvent,
  recordModifiedConversationEvent,
  resetConversationEventMemory,
} from '@/src/features/agent/calendar/calendarConversationEventMemory';
import {
  getZonedWeekdayIndex,
  parseNaturalDayOffset,
} from '@/src/features/agent/calendarIntelligence/calendarNaturalDateParser';
import { filterRawEventsForDay } from '@/src/features/agent/calendarIntelligence/dayEventFilter';
import { resolveTargetDayContext } from '@/src/features/agent/calendarIntelligence/resolveTargetDay';
import { getZonedTimeParts } from '@/src/features/agent/calendar/calendarTimezone';

const referenceNow = new Date('2026-05-28T12:00:00-05:00');
const timeZone = 'America/Chicago';

const RU_WEEKDAYS: Array<{ phrase: string; index: number }> = [
  { phrase: 'понедельник', index: 1 },
  { phrase: 'вторник', index: 2 },
  { phrase: 'среда', index: 3 },
  { phrase: 'четверг', index: 4 },
  { phrase: 'пятница', index: 5 },
  { phrase: 'суббота', index: 6 },
  { phrase: 'воскресенье', index: 0 },
];

function resetStores() {
  resetCalendarConversationState('test_reset');
  resetConversationEventMemory('test_reset');
}

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

describe('calendar real-user regressions', () => {
  beforeEach(() => {
    resetStores();
  });

  describe('BUG #1 weekday move', () => {
    it('resolves each Russian weekday name to calendar Friday (not +2 relative days)', () => {
      assert.equal(getZonedWeekdayIndex(referenceNow, timeZone), 4);

      for (const { phrase, index } of RU_WEEKDAYS) {
        const resolution = parseNaturalDayOffset(`на ${phrase}`, referenceNow, timeZone);
        assert.equal(resolution?.source, 'weekday', phrase);
        assert.equal(resolution?.weekdayIndex, index, phrase);

        const anchorWeekday = 4;
        let delta = (index - anchorWeekday + 7) % 7;
        const expectedOffset = delta === 0 ? 7 : delta;
        assert.equal(resolution?.dayOffset, expectedOffset, phrase);
      }
    });

    it('moves dinner from tomorrow (Thu) to this Friday preserving 19:00', () => {
      const wednesdayRef = new Date('2026-05-27T12:00:00-05:00');
      const moveTranscript = 'Перенеси ужин на пятницу';
      const schedule = parseCalendarUpdateSchedule(moveTranscript, wednesdayRef, timeZone);

      assert.equal(schedule.ok, true);

      if (!schedule.ok) {
        return;
      }

      assert.equal(schedule.kind, 'day_preserve_time');
      assert.equal(schedule.weekdayIndex, 5);
      assert.equal(schedule.explicitDayOffset, 2);

      const dinnerTomorrowMs = Date.parse('2026-05-28T19:00:00-05:00');
      const toMs = resolveUpdateTargetMs({
        schedule,
        matchedEventStartMs: dinnerTomorrowMs,
        referenceNow: wednesdayRef,
        timeZone,
      });

      assert.ok(toMs);
      const parts = getZonedTimeParts(new Date(toMs!), timeZone);
      assert.equal(parts.hour, 19);
      assert.equal(parts.minute, 0);
      assert.equal(getZonedWeekdayIndex(new Date(toMs!), timeZone), 5);
      assert.equal(parts.day, 29);
      assert.equal(parts.month, 5);
    });

    it('searches for dinner on memory day when destination is a weekday', () => {
      recordCreatedConversationEvent({
        eventId: 'dinner',
        title: 'Dinner',
        startISO: '2026-05-29T19:00:00-05:00',
        endISO: '2026-05-29T20:00:00-05:00',
      });

      const schedule = parseCalendarUpdateSchedule('Перенеси ужин на пятницу', referenceNow, timeZone);
      const dayOffset = resolveMutationSearchDayOffset({
        transcript: 'Перенеси ужин на пятницу',
        referenceNow,
        schedule,
        timeZone,
      });

      assert.equal(dayOffset, 1);
    });
  });

  describe('BUG #2 relative pronoun move', () => {
    it('parses полтора часа позже as +90 minutes', () => {
      const schedule = parseCalendarUpdateSchedule(
        'перенеси его на полтора часа позже',
        referenceNow,
        timeZone,
      );

      assert.equal(schedule.ok, true);

      if (!schedule.ok) {
        return;
      }

      assert.equal(schedule.kind, 'relative_offset');
      assert.equal(schedule.offsetMs, 90 * 60_000);
      assert.equal(schedule.direction, 'later');
    });

    it('executes перенеси его на полтора часа позже without time clarification', () => {
      recordCreatedConversationEvent({
        eventId: 'dinner',
        title: 'Dinner',
        startISO: '2026-05-29T19:00:00-05:00',
        endISO: '2026-05-29T20:00:00-05:00',
      });

      const extraction = extractCalendarUpdateParameters(
        'перенеси его на полтора часа позже',
        referenceNow,
      );

      assert.equal(extraction.readyToExecute, true);
      assert.equal(extraction.missingFields.length, 0);
      assert.equal(extraction.title, 'Dinner');
      assert.equal(extraction.toMs, Date.parse('2026-05-29T20:30:00-05:00'));
    });

    it('parses 30 minutes earlier and one hour later', () => {
      const earlier = parseCalendarUpdateSchedule('перенеси его на 30 минут раньше', referenceNow, timeZone);
      const later = parseCalendarUpdateSchedule('перенеси его на час позже', referenceNow, timeZone);

      assert.equal(earlier.ok, true);
      assert.equal(later.ok, true);

      if (!earlier.ok || !later.ok) {
        return;
      }

      assert.equal(earlier.kind, 'relative_offset');
      assert.equal(earlier.offsetMs, 30 * 60_000);
      assert.equal(earlier.direction, 'earlier');
      assert.equal(later.kind, 'relative_offset');
      assert.equal(later.offsetMs, 60 * 60_000);
      assert.equal(later.direction, 'later');
    });
  });

  describe('BUG #3 agenda after create → move', () => {
    it('shows dinner on Friday after create, move to Friday, and Friday agenda query', () => {
      const dinnerThursday = event({
        id: 'dinner',
        title: 'Dinner',
        startsAt: '2026-05-29T19:00:00-05:00',
        endsAt: '2026-05-29T20:00:00-05:00',
      });

      recordCreatedConversationEvent({
        eventId: dinnerThursday.id,
        title: dinnerThursday.title,
        startISO: dinnerThursday.startsAt,
        endISO: dinnerThursday.endsAt,
      });

      const fridayStart = '2026-05-29T19:00:00-05:00';
      recordModifiedConversationEvent({
        eventId: 'dinner',
        title: 'Dinner',
        startISO: fridayStart,
        endISO: '2026-05-29T20:00:00-05:00',
      });

      const snapshot = getLastCalendarSnapshot();
      const fridayEntry = snapshot.find((entry) => entry.id === 'dinner');
      assert.ok(fridayEntry);
      assert.equal(getZonedWeekdayIndex(new Date(fridayEntry!.startsAt), timeZone), 5);

      const agendaDay = parseNaturalDayOffset('Что у меня в пятницу', referenceNow, timeZone);
      assert.equal(agendaDay?.dayOffset, 1);
      assert.equal(agendaDay?.weekdayIndex, 5);

      const friday = resolveTargetDayContext('Что у меня в пятницу', referenceNow, timeZone);
      const fridayEvents = filterRawEventsForDay(augmentEventsWithConversationContext([]), friday);
      assert.ok(fridayEvents.some((entry) => entry.title === 'Dinner'));
    });

    it('extracts title ужин from move command', () => {
      assert.equal(extractUpdateEventTitle('Перенеси ужин на пятницу'), 'ужин');
    });
  });
});
