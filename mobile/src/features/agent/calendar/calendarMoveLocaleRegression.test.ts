import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { detectCalendarCommandIntent } from '@/src/features/agent/calendar/calendarCommandTypes';
import { parseCalendarCreateSchedule } from '@/src/features/agent/calendar/calendarCreateScheduleParser';
import {
  recordCreatedConversationEvent,
  resetConversationEventMemory,
} from '@/src/features/agent/calendar/calendarConversationEventMemory';
import { enrichCalendarCommandTranscript } from '@/src/features/agent/calendar/calendarTranscriptEnrichment';
import { resetCalendarConversationState } from '@/src/features/agent/calendar/calendarConversationState';
import { clearPendingIntent } from '@/src/features/agent/calendar/calendarPendingIntent';
import { createCalendarToolFailure } from '@/src/features/agent/execution/calendarToolContract';
import { resetCalendarExecutionSession } from '@/src/features/agent/execution/calendarExecutionSession';
import { buildCalendarUpdateToolReplyBundle } from '@/src/features/agent/execution/calendarUpdateToolResponses';

const referenceNow = new Date('2026-05-28T16:00:00-05:00');

describe('calendar move locale regression', () => {
  beforeEach(() => {
    resetCalendarConversationState('test_reset');
    resetCalendarExecutionSession();
    resetConversationEventMemory('test_reset');
    clearPendingIntent('test_reset');
  });

  it('create ужин → move на час позже returns localized reply without locale ReferenceError', () => {
    const createTranscript = 'Ужин в 7 вечера';
    const moveTranscript = 'Перенеси ужин на час позже';

    const createSchedule = parseCalendarCreateSchedule(createTranscript, referenceNow);
    assert.equal(createSchedule.ok, true);

    if (!createSchedule.ok) {
      return;
    }

    recordCreatedConversationEvent({
      eventId: 'dinner-1',
      title: 'Ужин',
      startISO: new Date(createSchedule.startMs).toISOString(),
      endISO: new Date(createSchedule.endMs).toISOString(),
    });

    assert.equal(detectCalendarCommandIntent(createTranscript), 'create_calendar_event');
    assert.equal(detectCalendarCommandIntent(moveTranscript), 'update_calendar_event');

    const enrichedMove = enrichCalendarCommandTranscript({
      transcript: moveTranscript,
      referenceNow,
    });
    assert.match(enrichedMove, /ужин/i);

    const failureTool = createCalendarToolFailure(
      'CALENDAR_OPERATION_ERROR',
      'Google Calendar update failed',
    );

    let bundle: ReturnType<typeof buildCalendarUpdateToolReplyBundle>;
    assert.doesNotThrow(() => {
      bundle = buildCalendarUpdateToolReplyBundle(failureTool, 'ru-RU', {
        referenceNow,
        requestedEventTitle: 'Ужин',
      });
    });

    assert.ok(bundle!.reply.trim().length > 0);
    assert.match(bundle!.reply, /Не удалось перенести событие|FAILURE:/);
    assert.equal(bundle!.executionState, 'failed');
  });
});
