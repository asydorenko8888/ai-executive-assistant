import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import {
  buildCalendarMoveExceptionReply,
  ensureVisibleCalendarMoveReply,
} from '@/src/features/agent/calendar/calendarMoveExceptionReply';
import { detectCalendarCommandIntent, requiresCalendarCommandExecution } from '@/src/features/agent/calendar/calendarCommandTypes';
import {
  recordCreatedConversationEvent,
  resetConversationEventMemory,
} from '@/src/features/agent/calendar/calendarConversationEventMemory';
import { enrichCalendarCommandTranscript } from '@/src/features/agent/calendar/calendarTranscriptEnrichment';
import { resetCalendarExecutionSession } from '@/src/features/agent/execution/calendarExecutionSession';
import { resetCalendarConversationState } from '@/src/features/agent/calendar/calendarConversationState';
import { clearPendingIntent } from '@/src/features/agent/calendar/calendarPendingIntent';

const referenceNow = new Date('2026-05-28T16:00:00-05:00');

describe('calendar move silent failure guard', () => {
  beforeEach(() => {
    resetCalendarConversationState('test_reset');
    resetCalendarExecutionSession();
    resetConversationEventMemory('test_reset');
    clearPendingIntent('test_reset');
  });

  it('builds Russian exception copy with short reason', () => {
    const reply = buildCalendarMoveExceptionReply('ru-RU', 'Google API timeout');

    assert.match(reply, /^Не удалось перенести событие:/);
    assert.match(reply, /Google API timeout/);
  });

  it('replaces empty move reply with visible failure text', () => {
    const reply = ensureVisibleCalendarMoveReply({
      reply: '   ',
      languageCode: 'ru-RU',
      fallbackReason: 'пустой ответ инструмента',
    });

    assert.match(reply, /^Не удалось перенести событие:/);
    assert.ok(reply.length > 20);
  });

  it('created massage → pronoun move is detected as calendar update command', () => {
    recordCreatedConversationEvent({
      eventId: 'massage-1',
      title: 'массаж',
      startISO: '2026-05-28T16:00:00-05:00',
      endISO: '2026-05-28T17:00:00-05:00',
    });

    const userTranscript = 'Перенеси его на час позже';
    const enriched = enrichCalendarCommandTranscript({
      transcript: userTranscript,
      referenceNow,
    });

    assert.equal(detectCalendarCommandIntent(userTranscript), 'update_calendar_event');
    assert.equal(detectCalendarCommandIntent(enriched), 'update_calendar_event');
    assert.equal(requiresCalendarCommandExecution(userTranscript), true);
    assert.match(enriched, /массаж/i);
  });
});
