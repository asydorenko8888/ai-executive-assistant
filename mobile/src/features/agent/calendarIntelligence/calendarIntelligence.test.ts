import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { CalendarEvent } from '@/src/entities/calendar/types';
import { buildDeterministicCalendarAnswer } from '@/src/features/agent/calendarIntelligence/calendarAnswerEngine';
import { isOperationalCalendarCreateRequest } from '@/src/features/agent/intent/operationalCalendarWriteDetection';
import { classifyCalendarQueryIntent } from '@/src/features/agent/calendarIntelligence/classifyQuery';
import { formatDeterministicCalendarReply } from '@/src/features/agent/calendarIntelligence/formatDeterministicReply';
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

  it('classifies natural-language today agenda queries', () => {
    assert.equal(classifyCalendarQueryIntent('что у меня сегодня'), 'list_day');
    assert.equal(classifyCalendarQueryIntent('що у мене сьогодні'), 'list_day');
    assert.equal(classifyCalendarQueryIntent('what do I have today'), 'list_day');
  });

  it('uses tomorrow heading for завтра agenda queries', () => {
    const tomorrowEvents: CalendarEvent[] = [
      event('walk', 'Прогулка', '2026-05-29T13:00:00-05:00', '2026-05-29T14:00:00-05:00'),
      event('lunch', 'Обед', '2026-05-29T13:30:00-05:00', '2026-05-29T14:30:00-05:00'),
      event('call', 'Звонок Николаю', '2026-05-29T20:00:00-05:00', '2026-05-29T21:00:00-05:00'),
    ];
    const answer = buildDeterministicCalendarAnswer({
      transcript: 'что у меня завтра',
      events: tomorrowEvents,
      referenceNow,
      timeZone,
    });

    assert.equal(answer?.intent, 'list_day');
    assert.equal(answer?.day.dayOffset, 1);

    const reply = formatDeterministicCalendarReply({
      intent: answer!.intent,
      day: answer!.day,
      locale: 'ru',
      events: answer!.events,
      referenceNow,
      userTranscript: 'что у меня завтра',
    });

    assert.match(reply, /Запланировано на завтра:/i);
    assert.doesNotMatch(reply, /Осталось сегодня/i);
    assert.match(reply, /1\..*Прогулка/i);
    assert.match(reply, /2\..*Обед/i);
    assert.match(reply, /3\..*Звонок Николаю/i);
  });

  it('excludes past events from normal today agenda replies', () => {
    const eveningNow = new Date('2026-05-28T17:48:00-05:00');
    const todayEvents: CalendarEvent[] = [
      event('lunch', 'Lunch', '2026-05-28T14:00:00-05:00', '2026-05-28T15:00:00-05:00'),
      event('dinner', 'Dinner', '2026-05-28T20:00:00-05:00', '2026-05-28T21:00:00-05:00'),
      event('meditation', 'Meditation', '2026-05-28T22:30:00-05:00', '2026-05-28T23:00:00-05:00'),
    ];
    const answer = buildDeterministicCalendarAnswer({
      transcript: 'What do I have today?',
      events: todayEvents,
      referenceNow: eveningNow,
      timeZone,
    });

    assert.equal(answer?.intent, 'list_day');

    const reply = formatDeterministicCalendarReply({
      intent: answer!.intent,
      day: answer!.day,
      locale: 'en',
      events: answer!.events,
      referenceNow: eveningNow,
    });

    assert.match(reply, /Remaining today:/i);
    assert.match(reply, /1\..*Dinner/i);
    assert.match(reply, /2\..*Meditation/i);
    assert.doesNotMatch(reply, /1\..*Lunch/i);
    assert.doesNotMatch(reply, /Completed today:/i);
    assert.doesNotMatch(reply, /• Lunch/i);
  });

  it('shows completed events only when the user asks for past history', () => {
    const eveningNow = new Date('2026-05-28T17:48:00-05:00');
    const todayEvents: CalendarEvent[] = [
      event('lunch', 'Lunch', '2026-05-28T14:00:00-05:00', '2026-05-28T15:00:00-05:00'),
      event('dinner', 'Dinner', '2026-05-28T20:00:00-05:00', '2026-05-28T21:00:00-05:00'),
    ];
    const answer = buildDeterministicCalendarAnswer({
      transcript: 'что уже было сегодня',
      events: todayEvents,
      referenceNow: eveningNow,
      timeZone,
    });

    const reply = formatDeterministicCalendarReply({
      intent: answer!.intent,
      day: answer!.day,
      locale: 'ru',
      events: answer!.events,
      referenceNow: eveningNow,
      userTranscript: 'что уже было сегодня',
    });

    assert.match(reply, /Завершено сегодня:/i);
    assert.match(reply, /• Lunch/i);
    assert.equal(isOperationalCalendarCreateRequest('когда у меня сегодня свободное время'), false);
  });

  it('formats free-time today replies from the current time forward', () => {
    const freeNow = new Date('2026-05-28T18:19:00-05:00');
    const todayEvents: CalendarEvent[] = [
      event('lunch', 'Lunch', '2026-05-28T14:00:00-05:00', '2026-05-28T15:00:00-05:00'),
      event('dinner', 'Dinner', '2026-05-28T20:00:00-05:00', '2026-05-28T21:00:00-05:00'),
      event('meditation', 'Meditation', '2026-05-28T22:30:00-05:00', '2026-05-28T23:30:00-05:00'),
    ];

    assert.equal(
      classifyCalendarQueryIntent('коли у мене сьогодні вільний час'),
      'free_time_query',
    );

    const answer = buildDeterministicCalendarAnswer({
      transcript: 'когда у меня сегодня свободное время',
      events: todayEvents,
      referenceNow: freeNow,
      timeZone,
    });

    assert.equal(answer?.intent, 'free_time_query');

    const reply = formatDeterministicCalendarReply({
      intent: answer!.intent,
      day: answer!.day,
      locale: 'ru',
      events: answer!.events,
      freeSlots: answer!.payload.freeSlots as typeof answer.payload.freeSlots,
      referenceNow: freeNow,
      userTranscript: 'когда у меня сегодня свободное время',
    });

    assert.match(reply, /Сегодня у тебя свободно:/i);
    assert.match(reply, /сейчас до 20:00/i);
    assert.match(reply, /с 21:00 до 22:30/i);
    assert.match(reply, /после 23:30/i);
    assert.doesNotMatch(reply, /Lunch/i);
  });

  it('returns only the nearest future event for next-event queries', () => {
    const eveningNow = new Date('2026-05-28T17:48:00-05:00');
    const todayEvents: CalendarEvent[] = [
      event('lunch', 'Lunch', '2026-05-28T14:00:00-05:00', '2026-05-28T15:00:00-05:00'),
      event('dinner', 'Dinner', '2026-05-28T20:00:00-05:00', '2026-05-28T21:00:00-05:00'),
      event('meditation', 'Meditation', '2026-05-28T22:30:00-05:00', '2026-05-28T23:00:00-05:00'),
    ];
    const answer = buildDeterministicCalendarAnswer({
      transcript: "What's next?",
      events: todayEvents,
      referenceNow: eveningNow,
      timeZone,
    });

    assert.equal(answer?.intent, 'next_event');
    assert.equal(answer?.payload.nextEvent?.title, 'Dinner');

    const reply = formatDeterministicCalendarReply({
      intent: answer!.intent,
      day: answer!.day,
      locale: 'en',
      events: answer!.events,
      nextEvent: answer!.payload.nextEvent as typeof answer.events[number],
      referenceNow: eveningNow,
    });

    assert.match(reply, /Dinner/i);
    assert.doesNotMatch(reply, /Lunch/i);
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

  it('classifies Russian at-time queries with equivalent prepositions', () => {
    assert.equal(
      classifyCalendarQueryIntent('Какая задача у меня сегодня в 17:30'),
      'events_starting_at_time',
    );
    assert.equal(
      classifyCalendarQueryIntent('Какая задача у меня сегодня на 17:30'),
      'events_starting_at_time',
    );
    assert.equal(
      classifyCalendarQueryIntent('Какая задача у меня сегодня о 17:30'),
      'events_starting_at_time',
    );
  });

  it('finds chaepitie at 17:30 for both в and на phrasing', () => {
    const teaParty = event(
      'tea',
      'чаепитие',
      '2026-05-28T17:30:00-05:00',
      '2026-05-28T18:00:00-05:00',
    );

    for (const transcript of [
      'Какая задача у меня сегодня в 17:30',
      'Какая задача у меня сегодня на 17:30',
    ]) {
      const answer = buildDeterministicCalendarAnswer({
        transcript,
        events: [teaParty],
        referenceNow,
        timeZone,
      });

      assert.equal(answer?.intent, 'events_starting_at_time');
      assert.equal(answer?.payload.count, 1);

      const reply = formatDeterministicCalendarReply({
        intent: answer!.intent,
        day: answer!.day,
        locale: 'ru',
        events: answer!.events,
        atTimeEvents: answer!.payload.atTimeEvents as typeof answer.events,
        clockMinutes: answer!.payload.clockMinutes as number,
      });

      assert.match(reply, /чаепитие/i);
      assert.doesNotMatch(reply, /ничего не запланировано/i);
    }
  });
});
