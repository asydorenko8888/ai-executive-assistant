import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import {
  assessCalendarCreateReadiness,
  assessCalendarMutationReadiness,
  assessCalendarUpdateReadiness,
  buildCalendarMutationClarificationReply,
  isVagueRelativeShiftCommand,
} from '@/src/features/agent/calendar/calendarAmbiguousCommandSafety';
import {
  recordCreatedConversationEvent,
  resetConversationEventMemory,
} from '@/src/features/agent/calendar/calendarConversationEventMemory';
import { buildStructuredCalendarCreateSuccessReply } from '@/src/features/agent/calendar/calendarMutationSuccessReply';
import { extractCalendarUpdateParameters } from '@/src/features/agent/calendar/calendarUpdateIntentExtractor';

const referenceNow = new Date('2026-06-04T10:00:00-05:00');

describe('calendarAmbiguousCommandSafety', () => {
  beforeEach(() => {
    resetConversationEventMemory('test');
  });

  it('blocks add lunch for an hour without start time', () => {
    const readiness = assessCalendarCreateReadiness({
      transcript: 'add lunch for an hour',
      referenceNow,
    });

    assert.equal(readiness.ready, false);
    assert.equal(readiness.ambiguityReason, 'duration_without_start');
  });

  it('blocks schedule dentist without date and time', () => {
    const readiness = assessCalendarCreateReadiness({
      transcript: 'schedule dentist',
      referenceNow,
    });

    assert.equal(readiness.ready, false);
    assert.ok(readiness.missingFields.includes('date') || readiness.missingFields.includes('startTime'));
  });

  it('blocks schedule meeting tomorrow without clock time', () => {
    const readiness = assessCalendarCreateReadiness({
      transcript: 'schedule meeting tomorrow',
      referenceNow,
    });

    assert.equal(readiness.ready, false);
    assert.equal(readiness.ambiguityReason, 'date_without_time');
  });

  it('detects vague move it later as ambiguous', () => {
    recordCreatedConversationEvent({
      eventId: 'dentist-1',
      title: 'Dentist',
      startISO: '2026-06-04T13:00:00-05:00',
      endISO: '2026-06-04T14:00:00-05:00',
    });

    assert.equal(isVagueRelativeShiftCommand('move it later'), true);

    const readiness = assessCalendarUpdateReadiness({
      transcript: 'move it later',
      referenceNow,
    });

    assert.equal(readiness.ready, false);
    assert.equal(readiness.ambiguityReason, 'vague_relative_shift');

    const extracted = extractCalendarUpdateParameters('move it later', referenceNow);
    assert.equal(extracted.readyToExecute, false);
  });

  it('detects vague move it earlier as ambiguous', () => {
    recordCreatedConversationEvent({
      eventId: 'walk-1',
      title: 'Walk',
      startISO: '2026-06-04T15:00:00-05:00',
      endISO: '2026-06-04T16:00:00-05:00',
    });

    const readiness = assessCalendarMutationReadiness({
      transcript: 'move it earlier',
      referenceNow,
      intent: 'update_calendar_event',
    });

    assert.equal(readiness.ready, false);
    assert.equal(readiness.ambiguityReason, 'vague_relative_shift');
  });

  it('still allows explicit move it 2 hours later', () => {
    recordCreatedConversationEvent({
      eventId: 'dentist-1',
      title: 'Dentist',
      startISO: '2026-06-04T13:00:00-05:00',
      endISO: '2026-06-04T14:00:00-05:00',
    });

    const readiness = assessCalendarUpdateReadiness({
      transcript: 'move it 2 hours later',
      referenceNow,
    });

    assert.equal(readiness.ready, true);
  });

  it('builds structured create success reply with title, day, and time range', () => {
    const { reply } = buildStructuredCalendarCreateSuccessReply({
      event: {
        id: 'lunch-1',
        summary: 'Lunch',
        startsAt: '2026-06-04T13:00:00-05:00',
        endsAt: '2026-06-04T14:00:00-05:00',
      },
      languageCode: 'en-US',
      referenceNow,
    });

    assert.match(reply, /Created event:/);
    assert.match(reply, /Lunch/);
    assert.match(reply, /Today/);
    assert.match(reply, /1:00 PM - 2:00 PM/);
  });

  it('returns clarification copy for vague relative shift', () => {
    const reply = buildCalendarMutationClarificationReply({
      readiness: {
        ready: false,
        missingFields: ['startTime'],
        ambiguityReason: 'vague_relative_shift',
        detail: null,
      },
      languageCode: 'en-US',
      intent: 'update_calendar_event',
    });

    assert.match(reply, /How much later or earlier/i);
  });
});
