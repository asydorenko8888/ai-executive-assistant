import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import type { CalendarEvent } from '@/src/entities/calendar/types';
import { requiresCalendarCommandExecution } from '@/src/features/agent/calendar/calendarCommandTypes';
import { isCalendarReadOnlyQuery } from '@/src/features/agent/calendar/calendarReadOnlyQuery';
import { tryBuildCalendarTimeUntilReplyFromEvents } from '@/src/features/agent/calendar/calendarTimeUntilReply';
import { isDeterministicCalendarReadQuery } from '@/src/features/agent/calendarIntelligence/classifyQuery';
import { buildDeterministicCalendarAnswer } from '@/src/features/agent/calendarIntelligence/calendarAnswerEngine';
import { formatDeterministicCalendarReply } from '@/src/features/agent/calendarIntelligence/formatDeterministicReply';
import {
  clearPendingCalendarUpdateIntent,
  setPendingCalendarUpdateContext,
} from '@/src/features/agent/execution/calendarExecutionSession';

const referenceNow = new Date('2026-06-02T18:00:00-05:00');
const timeZone = 'America/Chicago';

function event(id: string, title: string, startsAt: string, endsAt: string): CalendarEvent {
  return { id, title, startsAt, endsAt, isAllDay: false };
}

const dinner = event('dinner', 'Ужин', '2026-06-02T19:30:00-05:00', '2026-06-02T20:30:00-05:00');
const pool = event('pool', 'Бассейн', '2026-06-02T20:00:00-05:00', '2026-06-02T21:00:00-05:00');
const eveningWalk = event('walk', 'Прогулка', '2026-06-02T19:00:00-05:00', '2026-06-02T20:00:00-05:00');

describe('calendar read reply regression', () => {
  beforeEach(() => {
    clearPendingCalendarUpdateIntent();
  });

  it('classifies countdown and agenda queries as read-only', () => {
    for (const transcript of [
      'Сколько времени у меня до ужина',
      'Сколько времени у меня до бассейна',
      'Сколько времени у меня до прогулки',
      'что у меня сегодня',
      'что у меня в 7 вечера',
    ]) {
      assert.equal(isCalendarReadOnlyQuery(transcript), true, transcript);
      assert.equal(isDeterministicCalendarReadQuery(transcript), true, transcript);
      assert.equal(requiresCalendarCommandExecution(transcript), false, transcript);
    }
  });

  it('does not require mutation execution for read-only queries while move clarification is pending', () => {
    setPendingCalendarUpdateContext({
      operation: 'update',
      action: 'move',
      sourceTranscript: 'Перенеси медитацию на завтра',
      title: 'медитация',
      candidates: [
        {
          eventId: 'med-8',
          title: 'Медитация',
          startsAt: '2026-06-02T20:00:00-05:00',
          endsAt: '2026-06-02T21:00:00-05:00',
        },
      ],
    });

    assert.equal(requiresCalendarCommandExecution('Сколько времени у меня до ужина'), false);
    assert.equal(isDeterministicCalendarReadQuery('что у меня сегодня'), true);
  });

  it('builds Russian countdown reply for dinner', () => {
    const reply = tryBuildCalendarTimeUntilReplyFromEvents({
      transcript: 'Сколько времени у меня до ужина',
      languageCode: 'ru-RU',
      referenceNow,
      events: [dinner, pool, eveningWalk],
    });

    assert.ok(reply);
    assert.match(reply!, /До «Ужин» осталось/i);
    assert.match(reply!, /1 час 30 минут/);
  });

  it('builds Russian countdown reply for walk', () => {
    const reply = tryBuildCalendarTimeUntilReplyFromEvents({
      transcript: 'Сколько времени у меня до прогулки',
      languageCode: 'ru-RU',
      referenceNow,
      events: [dinner, pool, eveningWalk],
    });

    assert.ok(reply);
    assert.match(reply!, /До «Прогулка» осталось/i);
    assert.match(reply!, /1 час/);
  });

  it('builds Russian countdown reply for pool', () => {
    const reply = tryBuildCalendarTimeUntilReplyFromEvents({
      transcript: 'Сколько времени у меня до бассейна',
      languageCode: 'ru-RU',
      referenceNow,
      events: [dinner, pool, eveningWalk],
    });

    assert.ok(reply);
    assert.match(reply!, /До «Бассейн» осталось/i);
    assert.match(reply!, /2 часа/);
  });

  it('builds agenda reply for что у меня сегодня', () => {
    const answer = buildDeterministicCalendarAnswer({
      transcript: 'что у меня сегодня',
      events: [dinner, pool, eveningWalk],
      referenceNow,
      timeZone,
    });

    assert.ok(answer);
    assert.equal(answer!.intent, 'list_day');

    const reply = formatDeterministicCalendarReply({
      intent: answer!.intent,
      day: answer!.day,
      locale: 'ru',
      events: answer!.events,
      referenceNow,
    });

    assert.ok(reply?.trim());
    assert.match(reply!, /Прогулка|Ужин|Бассейн/i);
  });

  it('builds at-time reply for что у меня в 7 вечера', () => {
    const answer = buildDeterministicCalendarAnswer({
      transcript: 'что у меня в 7 вечера',
      events: [dinner, pool, eveningWalk],
      referenceNow,
      timeZone,
    });

    assert.ok(answer);
    assert.equal(answer!.payload.count, 1);
    assert.equal(answer!.payload.atTimeEvents?.[0]?.title, 'Прогулка');

    const reply = formatDeterministicCalendarReply({
      intent: answer!.intent,
      day: answer!.day,
      locale: 'ru',
      events: answer!.events,
      referenceNow,
      userTranscript: 'что у меня в 7 вечера',
      atTimeEvents: answer!.payload.atTimeEvents,
      clockMinutes: answer!.payload.clockMinutes,
    });

    assert.ok(reply?.trim());
    assert.match(reply!, /Прогулка/i);
  });
});
