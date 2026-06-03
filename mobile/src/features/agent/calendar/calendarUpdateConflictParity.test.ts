import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { findConflictingTimedEvents } from '@/src/features/agent/calendar/calendarScheduleConflictCore';
import {
  recordCreatedConversationEvent,
  resetConversationEventMemory,
} from '@/src/features/agent/calendar/calendarConversationEventMemory';
import {
  extractCalendarUpdateParameters,
  extractUpdateEventTitle,
} from '@/src/features/agent/calendar/calendarUpdateIntentExtractor';
import { enrichCalendarCommandTranscript } from '@/src/features/agent/calendar/calendarTranscriptEnrichment';
import { findCalendarEventForUpdateFromEvents } from '@/src/features/agent/calendarIntelligence/eventAtTimeMatch';
import { resolveEventTitleQueryForMemory } from '@/src/features/agent/calendar/calendarEventReferenceTokens';
import { buildCalendarUpdateEventPayload } from '@/src/features/agent/execution/calendarUpdatePayloadBuilder';

const timeZone = 'America/Chicago';
const referenceNow = new Date('2026-05-28T21:00:00-05:00');

function setupWalkMemory() {
  resetConversationEventMemory('test');
  recordCreatedConversationEvent({
    eventId: 'walk',
    title: 'Прогулка',
    startISO: '2026-05-28T21:00:00-05:00',
    endISO: '2026-05-28T22:00:00-05:00',
  });
}

describe('update conflict parity across schedule forms', () => {
  it('does not treat evening meridiem as an event title', () => {
    assert.equal(extractUpdateEventTitle('перенеси на 7 вечера'), null);
    assert.equal(extractUpdateEventTitle('перенеси прогулку на 7 вечера'), 'прогулка');
    assert.equal(extractUpdateEventTitle('перенеси прогулку на 3 часа раньше'), 'прогулка');
  });

  it('resolves memory title for absolute evening move without pronoun', () => {
    setupWalkMemory();

    const extracted = extractCalendarUpdateParameters('перенеси на 7 вечера', referenceNow);

    assert.equal(extracted.title, 'Прогулка');
    assert.equal(extracted.toTime, '19:00');
    assert.equal(extracted.readyToExecute, true);
  });

  it('matches the same walk event for relative and absolute conflict moves', () => {
    setupWalkMemory();

    const events = [
      {
        id: 'med',
        title: 'Meditation',
        startsAt: '2026-05-28T19:00:00-05:00',
        endsAt: '2026-05-28T20:00:00-05:00',
        isAllDay: false,
      },
      {
        id: 'walk',
        title: 'Прогулка',
        startsAt: '2026-05-28T21:00:00-05:00',
        endsAt: '2026-05-28T22:00:00-05:00',
        isAllDay: false,
      },
    ];

    for (const transcript of ['перенеси её на 2 часа раньше', 'перенеси на 7 вечера', 'перенеси на 19:00']) {
      const extractedTitle = extractUpdateEventTitle(transcript);
      const titleQuery = resolveEventTitleQueryForMemory({
        extractedTitle,
        memoryTitle: 'Прогулка',
      });
      const resolved = findCalendarEventForUpdateFromEvents({
        transcript,
        referenceNow,
        events,
        titleQuery,
        timeZone,
      });

      assert.equal(resolved.match?.id, 'walk', transcript);

      const payload = buildCalendarUpdateEventPayload({
        transcript,
        languageCode: 'ru-RU',
        referenceNow,
        matchedEvent: resolved.match!,
      });

      assert.equal(payload.ok, true, transcript);

      if (!payload.ok) {
        continue;
      }

      const conflicts = findConflictingTimedEvents({
        events,
        proposedStartMs: payload.toMs,
        proposedEndMs: payload.toMs + 60 * 60_000,
        ignoreEventId: payload.eventId,
      });

      assert.equal(conflicts.length, 1, transcript);
      assert.equal(conflicts[0]?.event.id, 'med', transcript);
    }
  });

  it('enriches absolute evening move with remembered event title', () => {
    setupWalkMemory();

    const enriched = enrichCalendarCommandTranscript({
      transcript: 'перенеси на 7 вечера',
      referenceNow,
    });

    assert.match(enriched, /прогулк/i);
  });
});
