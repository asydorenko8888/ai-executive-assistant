import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { CalendarEvent } from '@/src/entities/calendar/types';
import { buildDeterministicCalendarAnswer } from '@/src/features/agent/calendarIntelligence/calendarAnswerEngine';
import { classifyCalendarQueryIntent } from '@/src/features/agent/calendarIntelligence/classifyQuery';
import {
  findBestSlot,
  getEventsAtTime,
  getFreeWindows,
  getLastEvent,
  getNextEvent,
} from '@/src/features/agent/calendarIntelligence/scheduleHelpers';
import { normalizeCalendarEvents } from '@/src/features/agent/calendarIntelligence/normalizeEvents';
import { resolveTargetDayContext } from '@/src/features/agent/calendarIntelligence/resolveTargetDay';

const referenceNow = new Date('2026-05-28T15:00:00-05:00');
const timeZone = 'America/Chicago';

function event(
  id: string,
  title: string,
  startsAt: string,
  endsAt: string,
): CalendarEvent {
  return {
    id,
    title,
    startsAt,
    endsAt,
    isAllDay: false,
  };
}

const sampleEvents: CalendarEvent[] = [
  event('1', 'Morning standup', '2026-05-28T09:00:00-05:00', '2026-05-28T09:30:00-05:00'),
  event('2', 'Client call', '2026-05-28T19:00:00-05:00', '2026-05-28T20:00:00-05:00'),
  event('3', 'Dinner conflict', '2026-05-28T19:00:00-05:00', '2026-05-28T20:30:00-05:00'),
  event('4', 'Tomorrow sync', '2026-05-29T10:00:00-05:00', '2026-05-29T11:00:00-05:00'),
];

describe('calendarIntelligence', () => {
  it('classifies agenda and slot intents', () => {
    assert.equal(classifyCalendarQueryIntent('What tasks do I have today?'), 'list_day');
    assert.equal(classifyCalendarQueryIntent('plans for tomorrow'), 'list_day');
    assert.equal(classifyCalendarQueryIntent('What is at 7 PM?'), 'events_at_time');
    assert.equal(classifyCalendarQueryIntent('How many events at 7 PM?'), 'count_at_time');
    assert.equal(classifyCalendarQueryIntent('What is my next task?'), 'next_event');
    assert.equal(classifyCalendarQueryIntent('What is my last task today?'), 'last_event');
    assert.equal(classifyCalendarQueryIntent('Find 1 hour for workout today'), 'free_windows');
  });

  it('lists all events for today without mixing tomorrow', () => {
    const answer = buildDeterministicCalendarAnswer({
      transcript: 'What tasks do I have today?',
      events: sampleEvents,
      referenceNow,
    });

    assert.equal(answer?.intent, 'list_day');
    assert.equal(answer?.events.length, 3);
    assert.ok(answer?.events.every((item) => item.dateKey === '2026-05-28'));
  });

  it('returns both events at the same clock time', () => {
    const day = resolveTargetDayContext('What is at 7 PM today?', referenceNow, timeZone);
    const normalized = normalizeCalendarEvents(sampleEvents, timeZone);
    const atSeven = getEventsAtTime(normalized, day, 19 * 60);

    assert.equal(atSeven.length, 2);
  });

  it('counts events at a specific time', () => {
    const answer = buildDeterministicCalendarAnswer({
      transcript: 'How many events at 7 PM today?',
      events: sampleEvents,
      referenceNow,
      timeZone,
    });

    assert.equal(answer?.intent, 'count_at_time');
    assert.equal(answer?.payload.count, 2);
  });

  it('finds next and last events on the day', () => {
    const day = resolveTargetDayContext('today', referenceNow);
    const normalized = normalizeCalendarEvents(sampleEvents, day.timezone);

    assert.equal(getNextEvent(normalized, day, referenceNow)?.title, 'Client call');
    assert.equal(getLastEvent(normalized, day)?.title, 'Dinner conflict');
  });

  it('does not claim free time when no slot fits', () => {
    const busyDay: CalendarEvent[] = [
      event('a', 'Block A', '2026-05-28T15:00:00-05:00', '2026-05-28T23:00:00-05:00'),
    ];
    const day = resolveTargetDayContext('today', referenceNow, timeZone);
    const normalized = normalizeCalendarEvents(busyDay, timeZone);
    const slot = findBestSlot(normalized, day, referenceNow, 60);

    assert.equal(slot, null);
    assert.equal(getFreeWindows(normalized, day, referenceNow, 60).length, 0);
  });
});
