import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { resetConversationEventMemory } from '@/src/features/agent/calendar/calendarConversationEventMemory';
import { getCalendarConversationSnapshot, resetCalendarConversationStore } from '@/src/features/agent/calendar/calendarConversationStore';
import { syncConversationStateForDeleteSelection } from '@/src/features/agent/calendar/calendarConversationSync';
import { clearPendingCalendarDeleteIntent } from '@/src/features/agent/execution/calendarExecutionSession';

describe('calendarConversationSync', () => {
  beforeEach(() => {
    resetCalendarConversationStore('test_reset');
    resetConversationEventMemory('test_reset');
    clearPendingCalendarDeleteIntent();
  });

  it('syncConversationStateForDeleteSelection persists pending context without ReferenceError', () => {
    const pendingDelete = {
      operation: 'delete' as const,
      type: 'delete' as const,
      title: 'медитация',
      dayHint: null,
      sourceTranscript: 'Удали её',
      originalUserText: 'Удали её',
      createdAtMs: Date.now(),
      candidates: [
        {
          eventId: 'med-11pm',
          title: 'Медитация',
          startsAt: '2026-06-02T23:00:00-05:00',
          endsAt: '2026-06-03T00:00:00-05:00',
        },
      ],
    };

    assert.doesNotThrow(() => {
      syncConversationStateForDeleteSelection(pendingDelete, 'ru-RU');
    });

    assert.equal(getCalendarConversationSnapshot().state, 'WAITING_EVENT_SELECTION');
  });
});
