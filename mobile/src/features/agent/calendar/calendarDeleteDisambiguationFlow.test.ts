import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { tryMergePendingCalendarDeleteReply } from '@/src/features/agent/calendar/calendarDeletePendingContext';
import { resolveCalendarDeleteTargetFromEvents } from '@/src/features/agent/calendar/calendarDeleteResolution';
import { resolveDisambiguationSelection } from '@/src/features/agent/calendar/calendarEventDisambiguation';
import { resetConversationEventMemory } from '@/src/features/agent/calendar/calendarConversationEventMemory';

const referenceNow = new Date('2026-05-28T20:00:00-05:00');
const timeZone = 'America/Chicago';

function event(id: string, title: string, hour24: number) {
  const pad = (value: number) => String(value).padStart(2, '0');

  return {
    id,
    title,
    startsAt: `2026-05-28T${pad(hour24)}:00:00-05:00`,
    endsAt: `2026-05-28T${pad(hour24 + 1)}:00:00-05:00`,
    isAllDay: false as const,
  };
}

function pendingDelete(params: {
  sourceTranscript: string;
  title: string;
  candidates: Array<{ eventId: string; title: string; startsAt: string; endsAt: string }>;
}) {
  return {
    operation: 'delete' as const,
    type: 'delete' as const,
    title: params.title,
    dayHint: null,
    sourceTranscript: params.sourceTranscript,
    originalUserText: params.sourceTranscript,
    createdAtMs: Date.now(),
    candidates: params.candidates,
  };
}

describe('calendar delete disambiguation flow', () => {
  it('deletes a single event by title without disambiguation', () => {
    resetConversationEventMemory('test_reset');

    const resolution = resolveCalendarDeleteTargetFromEvents({
      events: [event('lunch-only', 'Lunch', 13)],
      titleQuery: 'lunch',
      transcript: 'Delete lunch',
      referenceNow,
      timeZone,
    });

    assert.equal(resolution.status, 'unique');
    assert.equal(resolution.event.id, 'lunch-only');
  });

  it('selects duplicate-title delete candidate by number', () => {
    const candidates = [
      { eventId: 'walk-5pm', title: 'Walk', startsAt: '2026-05-28T17:00:00-05:00', endsAt: '2026-05-28T18:00:00-05:00' },
      { eventId: 'walk-9pm', title: 'Walk', startsAt: '2026-05-28T21:00:00-05:00', endsAt: '2026-05-28T22:00:00-05:00' },
    ];

    const merged = tryMergePendingCalendarDeleteReply({
      pending: pendingDelete({ sourceTranscript: 'Delete walk', title: 'walk', candidates }),
      reply: '1',
      referenceNow,
      timeZone,
    });

    assert.equal(merged?.selectedEventId, 'walk-5pm');
  });

  it('selects duplicate-title delete candidate by local time (Today 5 PM)', () => {
    const candidates = [
      { eventId: 'walk-5pm', title: 'Walk', startsAt: '2026-05-28T17:00:00-05:00', endsAt: '2026-05-28T18:00:00-05:00' },
      { eventId: 'walk-9pm', title: 'Walk', startsAt: '2026-05-28T21:00:00-05:00', endsAt: '2026-05-28T22:00:00-05:00' },
    ];

    const merged = tryMergePendingCalendarDeleteReply({
      pending: pendingDelete({ sourceTranscript: 'Delete walk', title: 'walk', candidates }),
      reply: 'today 5 PM',
      referenceNow,
      timeZone,
    });

    assert.equal(merged?.selectedEventId, 'walk-5pm');
  });

  it('selects moved walk at 6 PM when user says today 6:00 evening', () => {
    const candidates = [
      { eventId: 'walk-5pm', title: 'Walk', startsAt: '2026-05-28T18:00:00-05:00', endsAt: '2026-05-28T19:00:00-05:00' },
      { eventId: 'walk-9pm', title: 'Walk', startsAt: '2026-05-28T21:00:00-05:00', endsAt: '2026-05-28T22:00:00-05:00' },
    ];

    const selected = resolveDisambiguationSelection({
      reply: 'today 6:00 evening',
      candidates,
      referenceNow,
      timeZone,
      pendingTitle: 'walk',
    });

    assert.equal(selected?.eventId, 'walk-5pm');
  });

  it('selects walk with title in reply (walk today 6 PM)', () => {
    const candidates = [
      { eventId: 'walk-5pm', title: 'Walk', startsAt: '2026-05-28T18:00:00-05:00', endsAt: '2026-05-28T19:00:00-05:00' },
      { eventId: 'walk-9pm', title: 'Walk', startsAt: '2026-05-28T21:00:00-05:00', endsAt: '2026-05-28T22:00:00-05:00' },
    ];

    const merged = tryMergePendingCalendarDeleteReply({
      pending: pendingDelete({ sourceTranscript: 'Delete walk', title: 'walk', candidates }),
      reply: 'walk today 6 PM',
      referenceNow,
      timeZone,
    });

    assert.equal(merged?.selectedEventId, 'walk-5pm');
  });

  it('selects with Russian phrasing (прогулка сегодня 6 вечера)', () => {
    const candidates = [
      { eventId: 'walk-5pm', title: 'Прогулка', startsAt: '2026-05-28T18:00:00-05:00', endsAt: '2026-05-28T19:00:00-05:00' },
      { eventId: 'walk-9pm', title: 'Прогулка', startsAt: '2026-05-28T21:00:00-05:00', endsAt: '2026-05-28T22:00:00-05:00' },
    ];

    const selected = resolveDisambiguationSelection({
      reply: 'прогулка сегодня 6 вечера',
      candidates,
      referenceNow,
      timeZone,
      pendingTitle: 'прогулка',
    });

    assert.equal(selected?.eventId, 'walk-5pm');
  });

  it('selects with Ukrainian phrasing (сьогодні о 18:00)', () => {
    const candidates = [
      { eventId: 'walk-5pm', title: 'Прогулянка', startsAt: '2026-05-28T18:00:00-05:00', endsAt: '2026-05-28T19:00:00-05:00' },
      { eventId: 'walk-9pm', title: 'Прогулянка', startsAt: '2026-05-28T21:00:00-05:00', endsAt: '2026-05-28T22:00:00-05:00' },
    ];

    const selected = resolveDisambiguationSelection({
      reply: 'сьогодні о 18:00',
      candidates,
      referenceNow,
      timeZone,
      pendingTitle: 'прогулянка',
    });

    assert.equal(selected?.eventId, 'walk-5pm');
  });

  it('selects by Cyrillic ordinal (первое)', () => {
    const candidates = [
      { eventId: 'walk-5pm', title: 'Walk', startsAt: '2026-05-28T17:00:00-05:00', endsAt: '2026-05-28T18:00:00-05:00' },
      { eventId: 'walk-9pm', title: 'Walk', startsAt: '2026-05-28T21:00:00-05:00', endsAt: '2026-05-28T22:00:00-05:00' },
    ];

    const selected = resolveDisambiguationSelection({
      reply: 'первое',
      candidates,
      referenceNow,
      timeZone,
    });

    assert.equal(selected?.eventId, 'walk-5pm');
  });

  it('selects by Ukrainian ordinal (перше)', () => {
    const candidates = [
      { eventId: 'walk-5pm', title: 'Прогулянка', startsAt: '2026-05-28T17:00:00-05:00', endsAt: '2026-05-28T18:00:00-05:00' },
      { eventId: 'walk-9pm', title: 'Прогулянка', startsAt: '2026-05-28T21:00:00-05:00', endsAt: '2026-05-28T22:00:00-05:00' },
    ];

    const selected = resolveDisambiguationSelection({
      reply: 'перше',
      candidates,
      referenceNow,
      timeZone,
    });

    assert.equal(selected?.eventId, 'walk-5pm');
  });
});
