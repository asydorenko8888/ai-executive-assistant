import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import type { CalendarEvent } from '@/src/entities/calendar/types';
import { pendingConflictContextFromCheck } from '@/src/features/agent/calendar/calendarConflictPendingContext';
import { resetCalendarConversationState } from '@/src/features/agent/calendar/calendarConversationState';
import { conflictContextToPendingAction } from '@/src/features/agent/calendar/calendarConversationSync';
import {
  recordCreatedConversationEvent,
  resetConversationEventMemory,
} from '@/src/features/agent/calendar/calendarConversationEventMemory';
import { classifyPendingCalendarReply } from '@/src/features/agent/calendar/calendarPendingReplyClassifier';
import { resolvePendingConflictResolution } from '@/src/features/agent/calendar/calendarPendingConflictResolution';
import {
  isPendingConflictScheduleUpdateReply,
  resolvePendingConflictScheduleUpdate,
} from '@/src/features/agent/calendar/calendarPendingConflictScheduleUpdate';
import { isCalendarReadBypassDuringPendingConflict } from '@/src/features/agent/calendar/calendarPendingConflictReadBypass';
import {
  classifyTitleMatchTier,
  selectBestEventByTitlePriority,
} from '@/src/features/agent/calendar/calendarTitleMatchPriority';
import { verifyUpdatedEventMatchesPayload } from '@/src/features/agent/calendar/calendarUpdateVerification';
import { resolveCalendarUpdateIntent } from '@/src/features/agent/calendar/calendarUpdateEventResolution';
import { findCalendarEventForUpdateFromEvents } from '@/src/features/agent/calendarIntelligence/eventAtTimeMatch';
import { enrichCalendarCommandTranscript } from '@/src/features/agent/calendar/calendarTranscriptEnrichment';
import { transitionCalendarConversationState } from '@/src/features/agent/calendar/calendarConversationState';

const referenceNow = new Date('2026-05-28T12:00:00-05:00');
const timeZone = 'America/Chicago';

function event(params: {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
}): CalendarEvent {
  return {
    id: params.id,
    title: params.title,
    startsAt: params.startsAt,
    endsAt: params.endsAt,
    isAllDay: false,
  };
}

describe('calendar assistant stabilization', () => {
  beforeEach(() => {
    resetCalendarConversationState('test_reset');
    resetConversationEventMemory('test_reset');
  });

  it('prefers exact Dentist match over fuzzy Dinner homonym', () => {
    const events = [
      event({
        id: 'dentist',
        title: 'Dentist',
        startsAt: '2026-05-28T18:00:00-05:00',
        endsAt: '2026-05-28T19:00:00-05:00',
      }),
      event({
        id: 'dinner',
        title: 'Dinner',
        startsAt: '2026-05-28T19:00:00-05:00',
        endsAt: '2026-05-28T20:00:00-05:00',
      }),
    ];

    assert.equal(classifyTitleMatchTier('Dentist', 'Dentist'), 'exact');
    assert.equal(classifyTitleMatchTier('Dentist', 'Dinner'), 'none');

    const selection = selectBestEventByTitlePriority(events, 'Dentist');
    assert.equal(selection.match?.id, 'dentist');

    const resolved = resolveCalendarUpdateIntent({
      transcript: 'Move Dentist to 8 PM',
      referenceNow,
      events,
      timeZone,
    });

    assert.equal(resolved.ok, true);

    if (resolved.ok) {
      assert.equal(resolved.target.id, 'dentist');
      assert.notEqual(resolved.target.id, 'dinner');
    }
  });

  it('blocks no-op update when destination equals current start', () => {
    const dentist = event({
      id: 'dentist',
      title: 'Dentist',
      startsAt: '2026-05-28T19:00:00-05:00',
      endsAt: '2026-05-28T20:00:00-05:00',
    });

    const resolved = resolveCalendarUpdateIntent({
      transcript: 'Move Dentist to 7 PM',
      referenceNow,
      events: [dentist],
      timeZone,
    });

    assert.equal(resolved.ok, false);

    if (!resolved.ok) {
      assert.equal(resolved.reason, 'no_time_change');
      assert.equal(resolved.target?.id, 'dentist');
    }
  });

  it('rejects verified success when event id or start time did not change', () => {
    const payload = {
      summary: 'Dentist',
      start: { dateTime: '2026-05-28T19:00:00-05:00', timeZone },
      end: { dateTime: '2026-05-28T20:00:00-05:00', timeZone },
    };

    const unchanged = verifyUpdatedEventMatchesPayload(
      {
        id: 'dentist',
        summary: 'Dentist',
        startsAt: '2026-05-28T18:00:00-05:00',
        endsAt: '2026-05-28T19:00:00-05:00',
      },
      payload,
      {
        requestedEventId: 'dentist',
        originalStartsAt: '2026-05-28T18:00:00-05:00',
      },
    );

    assert.equal(unchanged.ok, false);
    assert.equal(unchanged.startChanged, false);

    const wrongId = verifyUpdatedEventMatchesPayload(
      {
        id: 'dinner',
        summary: 'Dinner',
        startsAt: '2026-05-28T19:00:00-05:00',
        endsAt: '2026-05-28T20:00:00-05:00',
      },
      payload,
      {
        requestedEventId: 'dentist',
        originalStartsAt: '2026-05-28T18:00:00-05:00',
      },
    );

    assert.equal(wrongId.ok, false);
    assert.equal(wrongId.eventIdMatches, false);
  });

  it('resolves pronoun move after creating Dinner', () => {
    recordCreatedConversationEvent({
      eventId: 'dinner',
      title: 'Dinner',
      startISO: '2026-05-28T19:00:00-05:00',
      endISO: '2026-05-28T20:00:00-05:00',
    });

    const enriched = enrichCalendarCommandTranscript({
      transcript: 'Move it one hour earlier',
      referenceNow,
    });

    assert.match(enriched, /Dinner/i);

    const resolved = findCalendarEventForUpdateFromEvents({
      transcript: enriched,
      referenceNow,
      events: [
        event({
          id: 'dinner',
          title: 'Dinner',
          startsAt: '2026-05-28T19:00:00-05:00',
          endsAt: '2026-05-28T20:00:00-05:00',
        }),
      ],
      titleQuery: '',
      timeZone,
    });

    assert.equal(resolved.match?.id, 'dinner');
    assert.equal(resolved.matchSource, 'conversation_memory');
  });

  it('treats bare 11:30 PM as pending schedule refinement', () => {
    const pending = conflictContextToPendingAction(
      pendingConflictContextFromCheck({
        operation: 'update',
        sourceTranscript: 'Move Meditation 1 hour earlier',
        languageCode: 'en-US',
        proposedTitle: 'Meditation',
        proposedStartMs: Date.parse('2026-05-28T22:00:00-05:00'),
        proposedEndMs: Date.parse('2026-05-28T23:00:00-05:00'),
        updateEventId: 'meditation',
        targetOriginalStartsAt: '2026-05-28T23:00:00-05:00',
        targetOriginalEndsAt: '2026-05-29T00:00:00-05:00',
        conflictingEventId: 'walk',
        conflictingTitle: 'Walk',
        conflictingStartsAt: '2026-05-28T22:00:00-05:00',
        conflictingEndsAt: '2026-05-28T23:00:00-05:00',
      }),
    );

    transitionCalendarConversationState({
      toState: 'WAITING_CONFLICT_CONFIRMATION',
      pendingAction: pending,
      reason: 'test',
    });

    assert.equal(isPendingConflictScheduleUpdateReply('11:30 PM'), true);
    assert.equal(classifyPendingCalendarReply('11:30 PM'), 'alternate_time');

    const resolution = resolvePendingConflictResolution({
      pending,
      transcript: '11:30 PM',
      classification: 'alternate_time',
      referenceNow,
    });

    assert.equal(resolution.kind, 'execute_with_schedule');
  });

  it('resolves after dinner using conflict anchor end', () => {
    const pending = conflictContextToPendingAction(
      pendingConflictContextFromCheck({
        operation: 'update',
        sourceTranscript: 'Move Dentist to 7 PM',
        languageCode: 'en-US',
        proposedTitle: 'Dentist',
        proposedStartMs: Date.parse('2026-05-28T19:00:00-05:00'),
        proposedEndMs: Date.parse('2026-05-28T20:00:00-05:00'),
        updateEventId: 'dentist',
        targetOriginalStartsAt: '2026-05-28T18:00:00-05:00',
        targetOriginalEndsAt: '2026-05-28T19:00:00-05:00',
        conflictingEventId: 'dinner',
        conflictingTitle: 'Dinner',
        conflictingStartsAt: '2026-05-28T19:00:00-05:00',
        conflictingEndsAt: '2026-05-28T20:00:00-05:00',
      }),
      [
        {
          event: {
            id: 'dinner',
            title: 'Dinner',
            startsAt: '2026-05-28T19:00:00-05:00',
            endsAt: '2026-05-28T20:00:00-05:00',
          },
        },
      ],
    );

    const update = resolvePendingConflictScheduleUpdate({
      pending,
      reply: 'after dinner',
      referenceNow,
    });

    assert.equal(update.ok, true);

    if (update.ok) {
      assert.equal(update.startMs, Date.parse('2026-05-28T20:00:00-05:00'));
    }
  });

  it('bypasses pending state for calendar read queries', () => {
    assert.equal(isCalendarReadBypassDuringPendingConflict('what do I have tonight'), true);
    assert.equal(isCalendarReadBypassDuringPendingConflict('what is at 10 PM'), true);
    assert.equal(isPendingConflictScheduleUpdateReply('what do I have tonight'), false);
  });

  it('cancels pending conflict on no', () => {
    const pending = conflictContextToPendingAction(
      pendingConflictContextFromCheck({
        operation: 'update',
        sourceTranscript: 'Move Dentist to 7 PM',
        languageCode: 'en-US',
        proposedTitle: 'Dentist',
        proposedStartMs: Date.parse('2026-05-28T19:00:00-05:00'),
        proposedEndMs: Date.parse('2026-05-28T20:00:00-05:00'),
        updateEventId: 'dentist',
        targetOriginalStartsAt: '2026-05-28T18:00:00-05:00',
        targetOriginalEndsAt: '2026-05-28T19:00:00-05:00',
        conflictingEventId: 'dinner',
        conflictingTitle: 'Dinner',
        conflictingStartsAt: '2026-05-28T19:00:00-05:00',
        conflictingEndsAt: '2026-05-28T20:00:00-05:00',
      }),
    );

    const resolution = resolvePendingConflictResolution({
      pending,
      transcript: 'no',
      classification: classifyPendingCalendarReply('no'),
      referenceNow,
    });

    assert.equal(resolution.kind, 'cancel');
  });

  it('confirms overlap with execute_original on yes', () => {
    const pending = conflictContextToPendingAction(
      pendingConflictContextFromCheck({
        operation: 'update',
        sourceTranscript: 'Move Dentist to 7 PM',
        languageCode: 'en-US',
        proposedTitle: 'Dentist',
        proposedStartMs: Date.parse('2026-05-28T19:00:00-05:00'),
        proposedEndMs: Date.parse('2026-05-28T20:00:00-05:00'),
        updateEventId: 'dentist',
        targetOriginalStartsAt: '2026-05-28T18:00:00-05:00',
        targetOriginalEndsAt: '2026-05-28T19:00:00-05:00',
        conflictingEventId: 'dinner',
        conflictingTitle: 'Dinner',
        conflictingStartsAt: '2026-05-28T19:00:00-05:00',
        conflictingEndsAt: '2026-05-28T20:00:00-05:00',
      }),
    );

    const resolution = resolvePendingConflictResolution({
      pending,
      transcript: 'yes',
      classification: classifyPendingCalendarReply('yes'),
      referenceNow,
    });

    assert.equal(resolution.kind, 'execute_original');

    if (resolution.kind === 'execute_original') {
      assert.equal(resolution.skipScheduleConflictCheck, true);
    }
  });
});
