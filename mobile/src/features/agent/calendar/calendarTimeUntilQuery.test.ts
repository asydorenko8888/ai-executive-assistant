import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { CalendarEvent } from '@/src/entities/calendar/types';
import { tryBuildCalendarTimeUntilReplyFromEvents } from '@/src/features/agent/calendar/calendarTimeUntilReply';
import { wantsDetailedLunchTimeBreakdown } from '@/src/features/agent/calendar/calendarLunchTimeBudget';
import {
  buildSituationContextForLlm,
  type CalendarSituationAnalysis,
} from '@/src/features/agent/calendar/calendarSituationalReasoning';
import {
  extractTimeUntilEventTitleQuery,
  findFutureMatchingTimeUntilEvents,
  getTimeUntilNoFutureMatchMessage,
  isCalendarTimeUntilEventQuery,
  resolveTimeUntilTargetEvent,
} from '@/src/features/agent/calendar/calendarTimeUntilQuery';

function chicagoAt(hour: number, minute: number) {
  return new Date(`2026-06-02T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00-05:00`);
}

function meditationEvent(id: string, hour: number, minute = 0): CalendarEvent {
  return {
    id,
    title: 'Медитация',
    startsAt: `2026-06-02T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00-05:00`,
    endsAt: `2026-06-02T${String(hour + 1).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00-05:00`,
    isAllDay: false,
  };
}

describe('isCalendarTimeUntilEventQuery', () => {
  it('matches how much time until dinner', () => {
    assert.equal(isCalendarTimeUntilEventQuery('how much time until dinner'), true);
  });

  it('matches how long till meditation', () => {
    assert.equal(isCalendarTimeUntilEventQuery('how long till meditation'), true);
  });

  it('matches Russian «сколько времени у меня до …» word order', () => {
    assert.equal(isCalendarTimeUntilEventQuery('Сколько времени у меня до ужина'), true);
    assert.equal(isCalendarTimeUntilEventQuery('Сколько времени у меня до бассейна'), true);
  });

  it('matches Russian «сколько времени осталось до …» word order', () => {
    assert.equal(isCalendarTimeUntilEventQuery('Сколько времени осталось до поездки в Чикаго?'), true);
    assert.equal(
      extractTimeUntilEventTitleQuery('Сколько времени осталось до поездки в Чикаго?'),
      'Поездки в чикаго',
    );
  });

  it('blocks travel and lunch-breakdown advice for time-until queries', () => {
    const transcript = 'how much time until dinner';
    const context = buildSituationContextForLlm(
      { transcript } as CalendarSituationAnalysis,
      'uk',
    );

    assert.match(context, /ФАКТИ:/i);
    assert.match(context, /FACTS only/i);
    assert.doesNotMatch(context, /Travel reserve:/i);

    assert.equal(
      wantsDetailedLunchTimeBreakdown({
        transcript,
        minutesUntilNextEvent: 110,
        modifiers: {
          mentionsLunch: false,
          asksHowMuchTime: true,
          asksExactTime: false,
          asksCanHaveLunch: false,
          uncertainty: false,
        },
      } as CalendarSituationAnalysis),
      false,
    );
  });
});

describe('resolveTimeUntilTargetEvent — nearest future match', () => {
  const referenceNow = chicagoAt(17, 40);

  it('picks 10:30 PM meditation at 5:40 PM (not a later duplicate title)', () => {
    const selected = resolveTimeUntilTargetEvent({
      transcript: 'сколько времени до медитации',
      referenceNow,
      events: [meditationEvent('evening', 22, 30)],
    });

    assert.equal(selected?.id, 'evening');
    assert.equal(selected?.startsAt, meditationEvent('evening', 22, 30).startsAt);
  });

  it('ignores past meditation and picks tonight', () => {
    const selected = resolveTimeUntilTargetEvent({
      transcript: 'сколько времени до медитации',
      referenceNow,
      events: [
        meditationEvent('morning', 12, 0),
        meditationEvent('evening', 22, 30),
      ],
    });

    assert.equal(selected?.id, 'evening');
  });

  it('picks nearest future when several titled Медитация exist', () => {
    const selected = resolveTimeUntilTargetEvent({
      transcript: 'сколько времени до медитации',
      referenceNow,
      events: [meditationEvent('late', 22, 30), meditationEvent('soon', 19, 0)],
    });

    assert.equal(selected?.id, 'soon');
  });

  it('does not prefer title-priority over an earlier future match', () => {
    const selected = resolveTimeUntilTargetEvent({
      transcript: 'сколько времени до медитации',
      referenceNow,
      events: [
        {
          id: 'late-exact',
          title: 'Медитация',
          startsAt: '2026-06-02T22:30:00-05:00',
          endsAt: '2026-06-02T23:30:00-05:00',
          isAllDay: false,
        },
        {
          id: 'early-substring',
          title: 'Вечерняя медитация',
          startsAt: '2026-06-02T19:00:00-05:00',
          endsAt: '2026-06-02T20:00:00-05:00',
          isAllDay: false,
        },
      ],
    });

    assert.equal(selected?.id, 'early-substring');
  });

  it('returns no future matches when only past events match', () => {
    const future = findFutureMatchingTimeUntilEvents({
      titleQuery: 'медитация',
      referenceNow,
      events: [meditationEvent('past', 12, 0)],
    });

    assert.equal(future.length, 0);
    assert.equal(
      getTimeUntilNoFutureMatchMessage('ru'),
      'Нет будущих событий с таким названием.',
    );
  });
});

describe('calendar time-until countdown by full start datetime', () => {
  const referenceNow = new Date('2026-05-28T17:15:00-05:00');

  function chicagoTrip(id: string, startsAt: string, endsAt: string): CalendarEvent {
    return {
      id,
      title: 'Поездка в Чикаго',
      startsAt,
      endsAt,
      isAllDay: false,
    };
  }

  it('tomorrow 11:00 uses full event start datetime', () => {
    const selected = resolveTimeUntilTargetEvent({
      transcript: 'Сколько времени у меня до поездки в Чикаго?',
      referenceNow,
      events: [
        chicagoTrip(
          'trip-tomorrow',
          '2026-05-29T11:00:00-05:00',
          '2026-05-29T12:00:00-05:00',
        ),
      ],
    });

    assert.equal(selected?.id, 'trip-tomorrow');
    assert.equal(selected?.startsAt, '2026-05-29T11:00:00-05:00');

    const reply = tryBuildCalendarTimeUntilReplyFromEvents({
      transcript: 'Сколько времени у меня до поездки в Чикаго?',
      languageCode: 'ru-RU',
      referenceNow,
      events: [selected!],
    });

    assert.match(reply ?? '', /17 часов 45 минут/);
    assert.doesNotMatch(reply ?? '', /5 часов 45 минут/);
  });

  it('today 20:00 uses the same-day future start', () => {
    const selected = resolveTimeUntilTargetEvent({
      transcript: 'Сколько времени у меня до поездки в Чикаго?',
      referenceNow,
      events: [
        chicagoTrip(
          'trip-tonight',
          '2026-05-28T20:00:00-05:00',
          '2026-05-28T21:00:00-05:00',
        ),
      ],
    });

    assert.equal(selected?.startsAt, '2026-05-28T20:00:00-05:00');

    const reply = tryBuildCalendarTimeUntilReplyFromEvents({
      transcript: 'Сколько времени у меня до поездки в Чикаго?',
      languageCode: 'ru-RU',
      referenceNow,
      events: [selected!],
    });

    assert.match(reply ?? '', /2 часа 45 минут/);
  });

  it('ignores past same-day event when only past match exists', () => {
    const future = findFutureMatchingTimeUntilEvents({
      titleQuery: 'поездки в Чикаго',
      referenceNow,
      events: [
        chicagoTrip(
          'trip-past',
          '2026-05-28T12:00:00-05:00',
          '2026-05-28T13:00:00-05:00',
        ),
      ],
    });

    assert.equal(future.length, 0);

    const reply = tryBuildCalendarTimeUntilReplyFromEvents({
      transcript: 'Сколько времени у меня до поездки в Чикаго?',
      languageCode: 'ru-RU',
      referenceNow,
      events: [
        chicagoTrip(
          'trip-past',
          '2026-05-28T12:00:00-05:00',
          '2026-05-28T13:00:00-05:00',
        ),
      ],
    });

    assert.match(reply ?? '', /Нет будущих событий/);
  });

  it('picks nearest future duplicate titles on different days', () => {
    const selected = resolveTimeUntilTargetEvent({
      transcript: 'Сколько времени у меня до поездки в Чикаго?',
      referenceNow,
      events: [
        chicagoTrip(
          'trip-tonight',
          '2026-05-28T23:00:00-05:00',
          '2026-05-29T00:00:00-05:00',
        ),
        chicagoTrip(
          'trip-tomorrow',
          '2026-05-29T11:00:00-05:00',
          '2026-05-29T12:00:00-05:00',
        ),
      ],
    });

    assert.equal(selected?.id, 'trip-tonight');

    const reply = tryBuildCalendarTimeUntilReplyFromEvents({
      transcript: 'Сколько времени у меня до поездки в Чикаго?',
      languageCode: 'ru-RU',
      referenceNow,
      events: [
        chicagoTrip(
          'trip-tonight',
          '2026-05-28T23:00:00-05:00',
          '2026-05-29T00:00:00-05:00',
        ),
        chicagoTrip(
          'trip-tomorrow',
          '2026-05-29T11:00:00-05:00',
          '2026-05-29T12:00:00-05:00',
        ),
      ],
    });

    assert.match(reply ?? '', /5 часов 45 минут/);
  });

  it('«осталось до» phrasing counts down to tomorrow 11:00 by full datetime', () => {
    const transcript = 'Сколько времени осталось до поездки в Чикаго?';

    const selected = resolveTimeUntilTargetEvent({
      transcript,
      referenceNow,
      events: [
        chicagoTrip(
          'trip-tomorrow',
          '2026-05-29T11:00:00-05:00',
          '2026-05-29T12:00:00-05:00',
        ),
      ],
    });

    assert.equal(selected?.id, 'trip-tomorrow');
    assert.equal(selected?.startsAt, '2026-05-29T11:00:00-05:00');

    const reply = tryBuildCalendarTimeUntilReplyFromEvents({
      transcript,
      languageCode: 'ru-RU',
      referenceNow,
      events: [selected!],
    });

    assert.match(reply ?? '', /17 часов 45 минут/);
    assert.doesNotMatch(reply ?? '', /5 часов 24 минут/);
    assert.doesNotMatch(reply ?? '', /5 часов 45 минут/);
  });
});
