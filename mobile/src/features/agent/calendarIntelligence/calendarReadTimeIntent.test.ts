import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { CalendarEvent } from '@/src/entities/calendar/types';
import { buildDeterministicCalendarAnswer } from '@/src/features/agent/calendarIntelligence/calendarAnswerEngine';
import {
  classifyCalendarQueryIntent,
  isDeterministicCalendarReadQuery,
} from '@/src/features/agent/calendarIntelligence/classifyQuery';
import { formatDeterministicCalendarReply } from '@/src/features/agent/calendarIntelligence/formatDeterministicReply';
import {
  classifyCalendarReadTimeKind,
  calendarReadTimeKindToQueryIntent,
} from '@/src/features/agent/calendarIntelligence/calendarReadTimeIntent';
import { findCalendarEventForUpdateFromEvents } from '@/src/features/agent/calendarIntelligence/eventAtTimeMatch';
import {
  isOperationalCalendarWriteRequest,
  isOperationalCalendarUpdateRequest,
} from '@/src/features/agent/intent/operationalCalendarWriteDetection';
import { extractUpdateEventTitle } from '@/src/features/agent/calendar/calendarUpdateIntentExtractor';
import { setLastCalendarReadMatch } from '@/src/features/agent/execution/calendarExecutionSession';

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

const GYM_TEA_CALENDAR: CalendarEvent[] = [
  event('gym', 'Спортзал', '2026-05-28T18:00:00-05:00', '2026-05-28T19:00:00-05:00'),
  event('tea', 'Чаепитие', '2026-05-28T18:30:00-05:00', '2026-05-28T19:30:00-05:00'),
];

describe('calendarReadTimeIntent', () => {
  it('classifies EVENT_AT_TIME vs EVENT_STARTING_AT_TIME', () => {
    assert.equal(classifyCalendarReadTimeKind('Что у меня в 18:30'), 'event_at_time');
    assert.equal(classifyCalendarReadTimeKind('Какие события в 18:30'), 'event_at_time');
    assert.equal(classifyCalendarReadTimeKind('Что происходит в 18:30'), 'event_at_time');

    assert.equal(classifyCalendarReadTimeKind('Какая задача стоит на 18:30'), 'event_starting_at_time');
    assert.equal(classifyCalendarReadTimeKind('Какая задача у меня на 18:30'), 'event_starting_at_time');
    assert.equal(classifyCalendarReadTimeKind('Что запланировано на 18:30'), 'event_starting_at_time');
    assert.equal(classifyCalendarReadTimeKind('Что начинается в 18:30'), 'event_starting_at_time');
    assert.equal(classifyCalendarReadTimeKind('Какая встреча назначена на 18:30'), 'event_starting_at_time');
  });

  it('maps read time kinds to calendar query intents', () => {
    assert.equal(
      calendarReadTimeKindToQueryIntent('event_at_time'),
      'events_at_time',
    );
    assert.equal(
      calendarReadTimeKindToQueryIntent('event_starting_at_time'),
      'events_starting_at_time',
    );
  });

  it('returns both active events for "Что у меня в 18:30?"', () => {
    const transcript = 'Что у меня в 18:30?';

    assert.equal(classifyCalendarQueryIntent(transcript), 'events_at_time');

    const answer = buildDeterministicCalendarAnswer({
      transcript,
      events: GYM_TEA_CALENDAR,
      referenceNow,
      timeZone,
    });

    const atTime = answer!.payload.atTimeEvents as NonNullable<typeof answer>['events'];

    assert.equal(atTime.length, 2);
    assert.match(atTime.map((entry) => entry.title).join(' '), /Спортзал/i);
    assert.match(atTime.map((entry) => entry.title).join(' '), /Чаепитие/i);
  });

  it('returns only starting event for starting-at phrasing', () => {
    for (const transcript of [
      'Какая задача стоит на 18:30?',
      'Что запланировано на 18:30?',
      'Что начинается в 18:30?',
      'Какая задача у меня стоит сегодня на 18:30?',
      'Какая задача Сегодня у меня запланирована на 18:30?',
    ]) {
      assert.equal(classifyCalendarQueryIntent(transcript), 'events_starting_at_time', transcript);
      assert.equal(isOperationalCalendarWriteRequest(transcript), false, transcript);
      assert.equal(isDeterministicCalendarReadQuery(transcript), true, transcript);

      const answer = buildDeterministicCalendarAnswer({
        transcript,
        events: GYM_TEA_CALENDAR,
        referenceNow,
        timeZone,
      });

      const atTime = answer!.payload.atTimeEvents as NonNullable<typeof answer>['events'];

      assert.equal(atTime.length, 1, transcript);
      assert.match(atTime[0]?.title ?? '', /Чаепитие/i, transcript);

      const reply = formatDeterministicCalendarReply({
        intent: answer!.intent,
        day: answer!.day,
        locale: 'ru',
        events: answer!.events,
        atTimeEvents: atTime,
        clockMinutes: answer!.payload.clockMinutes as number,
        userTranscript: transcript,
      });

      assert.match(reply, /Чаепитие/i, transcript);
      assert.doesNotMatch(reply, /Спортзал/i, transcript);
    }
  });

  it('finds update target by start time and reuses pinned READ match', () => {
    const teaAt1730 = [
      event('tea', 'чаепитие', '2026-05-28T17:30:00-05:00', '2026-05-28T18:00:00-05:00'),
    ];
    const updateTranscript = 'Перенеси чаепитие с 17:30 на 18:30';

    assert.equal(isOperationalCalendarUpdateRequest(updateTranscript), true);

    const resolved = findCalendarEventForUpdateFromEvents({
      transcript: updateTranscript,
      referenceNow,
      events: teaAt1730,
      titleQuery: extractUpdateEventTitle(updateTranscript) ?? '',
      timeZone,
    });

    assert.equal(resolved.match?.id, 'tea');
    assert.equal(resolved.matchSource, 'starting_at_time');

    setLastCalendarReadMatch({
      eventId: 'tea',
      title: 'чаепитие',
      startISO: teaAt1730[0]!.startsAt,
      clockMinutes: 17 * 60 + 30,
      readTimeKind: 'event_starting_at_time',
    });

    const pinned = findCalendarEventForUpdateFromEvents({
      transcript: updateTranscript,
      referenceNow,
      events: teaAt1730,
      titleQuery: extractUpdateEventTitle(updateTranscript) ?? '',
      timeZone,
    });

    assert.equal(pinned.match?.id, 'tea');
    assert.equal(pinned.matchSource, 'pinned_read');
  });
});
