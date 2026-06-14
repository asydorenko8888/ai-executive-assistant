import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { detectCalendarCommandIntent } from '@/src/features/agent/calendar/calendarCommandTypes';
import {
  getConversationEventMemory,
  recordCreatedConversationEvent,
  recordDeletedConversationEvent,
  recordModifiedConversationEvent,
  resetConversationEventMemory,
  resolveMoveEventReference,
} from '@/src/features/agent/calendar/calendarConversationEventMemory';
import {
  isCalendarReferencedEventTimeQuery,
  tryBuildReferencedEventTimeReply,
} from '@/src/features/agent/calendar/calendarReferencedEventTimeQuery';
import { enrichCalendarCommandTranscript } from '@/src/features/agent/calendar/calendarTranscriptEnrichment';
import { extractCalendarUpdateParameters } from '@/src/features/agent/calendar/calendarUpdateIntentExtractor';
import { isEventPronounReference } from '@/src/features/agent/calendar/calendarEventReferenceTokens';
import { resetCalendarConversationState } from '@/src/features/agent/calendar/calendarConversationState';

const referenceNow = new Date('2026-06-04T18:00:00-05:00');

describe('calendar lastReferenced memory', () => {
  beforeEach(() => {
    resetConversationEventMemory('test_reset');
    resetCalendarConversationState('test_reset');
  });

  it('updates lastReferenced after create and relative move', () => {
    recordCreatedConversationEvent({
      eventId: 'med-1',
      title: 'Meditation',
      startISO: '2026-06-04T23:00:00-05:00',
      endISO: '2026-06-04T23:30:00-05:00',
    });

    assert.equal(getConversationEventMemory().lastReferencedEvent?.title, 'Meditation');

    recordModifiedConversationEvent({
      eventId: 'med-1',
      title: 'Meditation',
      startISO: '2026-06-04T22:00:00-05:00',
      endISO: '2026-06-04T22:30:00-05:00',
    });

    assert.equal(getConversationEventMemory().lastReferencedEvent?.startISO, '2026-06-04T22:00:00-05:00');

    const enriched = enrichCalendarCommandTranscript({
      transcript: 'Move it to tomorrow at 10 PM',
      referenceNow,
    });

    assert.match(enriched, /meditation/i);
    assert.match(enriched, /tomorrow/i);
  });

  it('keeps lastReferenced after delete for follow-up questions', () => {
    recordCreatedConversationEvent({
      eventId: 'med-1',
      title: 'Meditation',
      startISO: '2026-06-04T22:00:00-05:00',
      endISO: '2026-06-04T22:30:00-05:00',
    });

    recordDeletedConversationEvent({
      eventId: 'med-1',
      title: 'Meditation',
      startISO: '2026-06-04T22:00:00-05:00',
      endISO: '2026-06-04T22:30:00-05:00',
    });

    assert.equal(getConversationEventMemory().lastReferencedEvent?.title, 'Meditation');
    assert.equal(resolveMoveEventReference(referenceNow)?.title, 'Meditation');
  });

  it('resolves pronoun delete and rename after last mutation', () => {
    recordCreatedConversationEvent({
      eventId: 'med-1',
      title: 'Meditation',
      startISO: '2026-06-04T22:00:00-05:00',
      endISO: '2026-06-04T22:30:00-05:00',
    });

    const deleteEnriched = enrichCalendarCommandTranscript({
      transcript: 'Delete it',
      referenceNow,
    });

    assert.match(deleteEnriched, /meditation/i);
    assert.equal(detectCalendarCommandIntent(deleteEnriched), 'delete_calendar_event');

    const renameEnriched = enrichCalendarCommandTranscript({
      transcript: 'Rename it to Mindfulness',
      referenceNow,
    });

    assert.match(renameEnriched, /meditation/i);
    assert.equal(isEventPronounReference('её событие'), true);
  });

  it('answers What time is it from lastReferenced event schedule', () => {
    recordCreatedConversationEvent({
      eventId: 'med-1',
      title: 'Meditation',
      startISO: '2026-06-04T22:00:00-05:00',
      endISO: '2026-06-04T22:30:00-05:00',
    });

    assert.equal(isCalendarReferencedEventTimeQuery('What time is it?'), true);

    const reply = tryBuildReferencedEventTimeReply({
      transcript: 'What time is it?',
      referenceNow,
      languageCode: 'en-US',
    });

    assert.match(reply ?? '', /Meditation/i);
    assert.match(reply ?? '', /22:00/);
  });

  it('resolves Russian pronoun move without title clarification', () => {
    recordCreatedConversationEvent({
      eventId: 'med-1',
      title: 'Медитация',
      startISO: '2026-06-04T22:00:00-05:00',
      endISO: '2026-06-04T22:30:00-05:00',
    });

    const enriched = enrichCalendarCommandTranscript({
      transcript: 'Перенеси его на час раньше',
      referenceNow,
    });

    assert.match(enriched, /медитац/i);
    const update = extractCalendarUpdateParameters(enriched, referenceNow);
    assert.equal(update.readyToExecute, true);
    assert.match(update.title ?? '', /медитац/i);
  });
});
