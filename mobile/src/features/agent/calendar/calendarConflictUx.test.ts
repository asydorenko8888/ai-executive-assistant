import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildCalendarConflictAlternativesOnlyReply,
  buildCalendarCreateConflictInitialReply,
} from '@/src/features/agent/calendar/calendarConflictReplies';
import {
  buildCalendarPendingAction,
  getCalendarConversationSnapshot,
  resetCalendarConversationState,
  transitionCalendarConversationState,
} from '@/src/features/agent/calendar/calendarConversationState';
import { resolvePendingConflictResolution } from '@/src/features/agent/calendar/calendarPendingConflictResolution';
import { classifyPendingCalendarReply } from '@/src/features/agent/calendar/calendarPendingReplyClassifier';

const conflict = {
  event: {
    id: 'gym',
    title: 'Спортзал',
    startsAt: '2026-06-01T20:00:00-05:00',
    endsAt: '2026-06-01T21:00:00-05:00',
    isAllDay: false,
  },
  startsAtMs: Date.parse('2026-06-01T20:00:00-05:00'),
  endsAtMs: Date.parse('2026-06-01T21:00:00-05:00'),
};

describe('calendar conflict UX replies', () => {
  it('asks yes/no only once on initial conflict', () => {
    const reply = buildCalendarCreateConflictInitialReply({
      locale: 'en',
      proposedTitle: 'Walk',
      conflict,
      proposedStartMs: conflict.startsAtMs,
      proposedEndMs: conflict.endsAtMs,
    });

    assert.match(reply, /At .* you already have: Спортзал/i);
    assert.match(reply, /Create Walk at .* anyway/i);
    assert.doesNotMatch(reply, /won't/i);
    assert.doesNotMatch(reply, /I can suggest/i);
  });

  it('offers alternatives after NO without repeating conflict warning', () => {
    const reply = buildCalendarConflictAlternativesOnlyReply({
      locale: 'en',
      proposedTitle: 'Walk',
      optionLabels: ['Today 5:00 PM–6:00 PM', 'Tomorrow 4:00 PM–5:00 PM'],
    });

    assert.match(reply, /did not create Walk/i);
    assert.match(reply, /I can suggest another time/i);
    assert.match(reply, /1\. Today 5:00 PM–6:00 PM/);
    assert.doesNotMatch(reply, /already/i);
    assert.doesNotMatch(reply, /won't/i);
  });

  it('resolves нет as cancel for state transition', () => {
    resetCalendarConversationState('test');
    transitionCalendarConversationState({
      toState: 'WAITING_CONFLICT_DECISION',
      pendingAction: buildCalendarPendingAction({
        actionType: 'create',
        originalIntent: 'Add walk at 8 PM',
        eventTitle: 'Walk',
        sourceTranscript: 'Add walk at 8 PM',
        languageCode: 'en-US',
        proposedStartMs: conflict.startsAtMs,
        proposedEndMs: conflict.endsAtMs,
      }),
      reason: 'test',
    });

    const resolution = resolvePendingConflictResolution({
      pending: getCalendarConversationSnapshot().pendingAction!,
      transcript: 'no',
      classification: classifyPendingCalendarReply('no'),
      referenceNow: new Date('2026-06-01T10:00:00-05:00'),
    });

    assert.equal(resolution.kind, 'cancel');
  });
});
