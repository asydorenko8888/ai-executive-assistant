import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { CalendarEvent } from '@/src/entities/calendar/types';
import { resolveCalendarDeleteTargetFromEvents } from '@/src/features/agent/calendar/calendarDeleteResolution';
import {
  buildCalendarDeleteRecurringChoiceReply,
  parseRecurringDeleteScopeReply,
  resolveDeleteEventIdForRecurringScope,
} from '@/src/features/agent/calendar/calendarDeleteRecurringChoice';
import { tryMergePendingCalendarDeleteReply } from '@/src/features/agent/calendar/calendarDeletePendingContext';
import type { PendingCalendarDeleteContext } from '@/src/features/agent/execution/calendarExecutionSession';

const referenceNow = new Date('2026-05-28T20:00:00-05:00');

function weeklyStandupInstance(): CalendarEvent {
  return {
    id: 'abc123_20260528T190000Z',
    title: 'Weekly standup',
    startsAt: '2026-05-28T09:00:00-05:00',
    endsAt: '2026-05-28T09:30:00-05:00',
    isAllDay: false,
  };
}

describe('recurring delete choice', () => {
  it('asks scope instead of blocking recurring deletion', () => {
    const resolution = resolveCalendarDeleteTargetFromEvents({
      events: [weeklyStandupInstance()],
      titleQuery: 'Weekly standup',
      transcript: 'удали Weekly standup',
      referenceNow,
    });

    assert.equal(resolution.status, 'recurring_choice_required');
    assert.equal(
      buildCalendarDeleteRecurringChoiceReply('ru', 'Weekly standup'),
      'Событие «Weekly standup» повторяется. Удалить только это событие или всю серию?',
    );
  });

  it('parses occurrence vs series replies', () => {
    assert.equal(parseRecurringDeleteScopeReply('только это'), 'occurrence');
    assert.equal(parseRecurringDeleteScopeReply('всю серию'), 'series');
    assert.equal(parseRecurringDeleteScopeReply('1'), 'occurrence');
    assert.equal(parseRecurringDeleteScopeReply('2'), 'series');
  });

  it('resolves delete event id for occurrence and series scope', () => {
    const instanceId = 'abc123_20260528T190000Z';

    assert.equal(
      resolveDeleteEventIdForRecurringScope({ eventId: instanceId, deleteScope: 'occurrence' }),
      instanceId,
    );
    assert.equal(
      resolveDeleteEventIdForRecurringScope({ eventId: instanceId, deleteScope: 'series' }),
      'abc123',
    );
  });

  it('merges recurring scope reply into pending delete context', () => {
    const pending: PendingCalendarDeleteContext = {
      operation: 'delete',
      type: 'delete',
      title: 'Weekly standup',
      dayHint: null,
      sourceTranscript: 'удали Weekly standup',
      originalUserText: 'удали Weekly standup',
      createdAtMs: Date.now(),
      selectedEventId: 'abc123_20260528T190000Z',
      recurring: true,
      recurringEventId: 'abc123',
      awaitingRecurringChoice: true,
    };

    const occurrence = tryMergePendingCalendarDeleteReply({
      pending,
      reply: 'только это',
      referenceNow,
    });

    assert.equal(occurrence?.selectedEventId, 'abc123_20260528T190000Z');
    assert.equal(occurrence?.context.awaitingRecurringChoice, false);
    assert.equal(occurrence?.context.deleteScope, 'occurrence');

    const series = tryMergePendingCalendarDeleteReply({
      pending,
      reply: 'всю серию',
      referenceNow,
    });

    assert.equal(series?.selectedEventId, 'abc123');
    assert.equal(series?.context.deleteScope, 'series');
  });
});
