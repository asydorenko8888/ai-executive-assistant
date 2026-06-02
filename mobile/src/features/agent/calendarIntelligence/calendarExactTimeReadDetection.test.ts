import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { CalendarEvent } from '@/src/entities/calendar/types';
import { detectCalendarCommandIntent } from '@/src/features/agent/calendar/calendarCommandTypes';
import { buildDeterministicCalendarAnswer } from '@/src/features/agent/calendarIntelligence/calendarAnswerEngine';
import {
  classifyCalendarQueryIntent,
  isDeterministicCalendarReadQuery,
} from '@/src/features/agent/calendarIntelligence/classifyQuery';
import { isCalendarExactTimeReadQuery } from '@/src/features/agent/calendarIntelligence/calendarExactTimeReadDetection';
import { formatDeterministicCalendarReply } from '@/src/features/agent/calendarIntelligence/formatDeterministicReply';
import {
  isOperationalCalendarCreateRequest,
  isOperationalCalendarUpdateRequest,
  isOperationalCalendarWriteRequest,
} from '@/src/features/agent/intent/operationalCalendarWriteDetection';

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

const STARTING_AT_READ_EXAMPLES = [
  'Какая задача у меня сегодня в 17:30',
  'Какая задача у меня сегодня на 17:30',
  'Какая задача у меня стоит сегодня в 17:30',
  'Какая задача стоит у меня на сегодня в 17:30',
  'Какая задача стоит у меня на сегодня на 18:30',
  'Какая задача у меня сегодня стоит в 18:30',
  'Какая задача у меня стоит на 18:30 сегодня',
  'Что стоит в календаре сегодня на 17:30',
  'Что стоит в календаре сегодня в 18:30',
];

describe('calendarExactTimeReadDetection', () => {
  it('detects Russian exact-time read queries as starting-at when phrasing implies schedule slot', () => {
    for (const transcript of STARTING_AT_READ_EXAMPLES) {
      assert.equal(isCalendarExactTimeReadQuery(transcript), true, transcript);
      assert.equal(isOperationalCalendarWriteRequest(transcript), false, transcript);
      assert.equal(isDeterministicCalendarReadQuery(transcript), true, transcript);
      assert.equal(classifyCalendarQueryIntent(transcript), 'events_starting_at_time', transcript);
      assert.equal(detectCalendarCommandIntent(transcript), 'none', transcript);
    }
  });

  it('classifies active-at-time reads separately from starting-at', () => {
    assert.equal(classifyCalendarQueryIntent('Что у меня сегодня на 18:30'), 'events_at_time');
    assert.equal(classifyCalendarQueryIntent('Что у меня в 18:30'), 'events_at_time');
    assert.equal(classifyCalendarQueryIntent('что у меня сегодня на 5 вечера'), 'events_at_time');
    assert.equal(isCalendarExactTimeReadQuery('что у меня сегодня на 5 вечера'), true);
    assert.equal(isDeterministicCalendarReadQuery('что у меня сегодня на 5 вечера'), true);
    assert.equal(isOperationalCalendarWriteRequest('что у меня сегодня на 5 вечера'), false);
  });

  it('still routes create and update commands to write intents', () => {
    const create = 'поставь задачу на 17:30';
    const update = 'перенеси чаепитие с 17:30 на 18:30';

    assert.equal(isCalendarExactTimeReadQuery(create), false);
    assert.equal(isOperationalCalendarCreateRequest(create), true);
    assert.equal(isOperationalCalendarWriteRequest(create), true);
    assert.equal(isDeterministicCalendarReadQuery(create), false);
    assert.equal(detectCalendarCommandIntent(create), 'create_calendar_event');

    assert.equal(isCalendarExactTimeReadQuery(update), false);
    assert.equal(isOperationalCalendarUpdateRequest(update), true);
    assert.equal(isOperationalCalendarWriteRequest(update), true);
    assert.equal(isDeterministicCalendarReadQuery(update), false);
    assert.equal(detectCalendarCommandIntent(update), 'update_calendar_event');
  });

  it('does not treat advisory "стоит ли" as exact-time read', () => {
    assert.equal(isCalendarExactTimeReadQuery('Стоит ли переносить встречу на 17:30'), false);
  });

  it('treats visibility complaints with clock time as read, not create', () => {
    const transcript = 'Я не вижу в календаре медитацию на 9 вечера';

    assert.equal(isCalendarExactTimeReadQuery(transcript), true);
    assert.equal(isOperationalCalendarCreateRequest(transcript), false);
    assert.equal(detectCalendarCommandIntent(transcript), 'none');
    assert.equal(isDeterministicCalendarReadQuery(transcript), true);
  });
});
