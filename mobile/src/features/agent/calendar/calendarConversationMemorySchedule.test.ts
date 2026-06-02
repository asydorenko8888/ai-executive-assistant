import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  recordCreatedConversationEvent,
  resetConversationEventMemory,
} from '@/src/features/agent/calendar/calendarConversationEventMemory';
import { validateMoveTargetAgainstConversationMemory } from '@/src/features/agent/calendar/calendarConversationMemorySchedule';
import { findCalendarEventForUpdateFromEvents } from '@/src/features/agent/calendarIntelligence/eventAtTimeMatch';
import type { CalendarEvent } from '@/src/entities/calendar/types';

const referenceNow = new Date('2026-06-02T10:00:00-05:00');

const walkEvent: CalendarEvent = {
  id: 'walk-2000',
  title: 'Прогулянка',
  startsAt: '2026-06-02T20:00:00-05:00',
  endsAt: '2026-06-02T21:00:00-05:00',
  isAllDay: false,
};

const meditationMorning: CalendarEvent = {
  id: 'meditation-0900',
  title: 'Медитацию',
  startsAt: '2026-06-02T09:00:00-05:00',
  endsAt: '2026-06-02T10:00:00-05:00',
  isAllDay: false,
};

const meditationEvening: CalendarEvent = {
  id: 'meditation-2200',
  title: 'Медитація',
  startsAt: '2026-06-02T22:00:00-05:00',
  endsAt: '2026-06-02T23:00:00-05:00',
  isAllDay: false,
};

describe('move target vs conversation memory schedule', () => {
  it('rejects fuzzy title match at wrong start time', () => {
    resetConversationEventMemory('test');
    recordCreatedConversationEvent({
      eventId: meditationEvening.id,
      title: meditationEvening.title,
      startISO: meditationEvening.startsAt,
      endISO: meditationEvening.endsAt,
    });

    const rejected = validateMoveTargetAgainstConversationMemory({
      event: meditationMorning,
      referenceNow,
      matchSource: 'title_only',
      titleQuery: 'Медитацию',
    });

    assert.equal(rejected.ok, false);
    assert.equal(rejected.event, null);
  });

  it('prefers lastReferenced over older fuzzy title when moving by title', () => {
    resetConversationEventMemory('test');
    recordCreatedConversationEvent({
      eventId: meditationMorning.id,
      title: meditationMorning.title,
      startISO: meditationMorning.startsAt,
      endISO: meditationMorning.endsAt,
    });
    recordCreatedConversationEvent({
      eventId: meditationEvening.id,
      title: meditationEvening.title,
      startISO: meditationEvening.startsAt,
      endISO: meditationEvening.endsAt,
    });

    const resolved = findCalendarEventForUpdateFromEvents({
      transcript: 'Перенеси медитацию с 9 на 10',
      referenceNow,
      events: [meditationMorning, meditationEvening],
      titleQuery: 'Медитацию',
    });

    assert.equal(resolved.match?.id, meditationEvening.id);
    assert.equal(resolved.matchSource, 'conversation_memory');
  });

  it('uses memory schedule for її shift, not morning homonym', () => {
    resetConversationEventMemory('test');
    recordCreatedConversationEvent({
      eventId: walkEvent.id,
      title: walkEvent.title,
      startISO: walkEvent.startsAt,
      endISO: walkEvent.endsAt,
    });
    recordCreatedConversationEvent({
      eventId: meditationEvening.id,
      title: meditationEvening.title,
      startISO: meditationEvening.startsAt,
      endISO: meditationEvening.endsAt,
    });

    const resolved = findCalendarEventForUpdateFromEvents({
      transcript: 'Перенеси її на годину пізніше',
      referenceNow,
      events: [walkEvent, meditationMorning, meditationEvening],
      titleQuery: '',
    });

    assert.equal(resolved.match?.id, meditationEvening.id);
    assert.equal(resolved.matchSource, 'conversation_memory');
    assert.equal(resolved.toMs, Date.parse('2026-06-02T23:00:00-05:00'));
  });
});
