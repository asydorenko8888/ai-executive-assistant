import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import type { CalendarEvent } from '@/src/entities/calendar/types';
import {
  getCurrentActiveCalendarEvent,
} from '@/src/features/agent/calendar/calendarActiveEventContext';
import {
  augmentEventsWithConversationContext,
  setLastCalendarSnapshot,
} from '@/src/features/agent/calendar/calendarConversationStore';
import {
  recordCreatedConversationEvent,
  recordModifiedConversationEvent,
  resetConversationEventMemory,
} from '@/src/features/agent/calendar/calendarConversationEventMemory';
import {
  buildCalendarDeleteVerificationFailedReply,
} from '@/src/features/agent/calendar/calendarDeleteNaturalReplies';
import {
  calendarEventsToDisambiguationCandidates,
} from '@/src/features/agent/calendar/calendarEventDisambiguation';
import {
  deduplicateCalendarEvents,
} from '@/src/features/agent/calendar/calendarEventDeduplication';
import { resolveCalendarUpdateIntent } from '@/src/features/agent/calendar/calendarUpdateEventResolution';
import { buildCalendarUpdateVerificationFailedReply } from '@/src/features/agent/calendar/calendarUpdateNaturalReplies';
import {
  isVerifiedCalendarDeleteSuccess,
  isVerifiedCalendarUpdateSuccess,
} from '@/src/features/agent/calendar/calendarExecutionContract';
import { createCalendarToolFailure } from '@/src/features/agent/execution/calendarToolContract';
import { findCalendarEventForDeleteFromEvents } from '@/src/features/agent/calendarIntelligence/eventAtTimeMatch';
import { resolveTimeUntilTargetEvent } from '@/src/features/agent/calendar/calendarTimeUntilQuery';
import { getZonedTimeParts } from '@/src/features/agent/calendar/calendarTimezone';

const timeZone = 'America/Chicago';
const referenceNow = new Date('2026-05-28T14:00:00-05:00');

function chicagoEvent(
  id: string,
  title: string,
  hour: number,
  minute = 0,
): CalendarEvent {
  const pad = (value: number) => String(value).padStart(2, '0');

  return {
    id,
    title,
    startsAt: `2026-05-28T${pad(hour)}:${pad(minute)}:00-05:00`,
    endsAt: `2026-05-28T${pad(hour + 1)}:${pad(minute)}:00-05:00`,
    isAllDay: false,
  };
}

function duplicateScheduleCopy(event: CalendarEvent, altId: string): CalendarEvent {
  return {
    ...event,
    id: altId,
  };
}

describe('calendarEventDeduplication', () => {
  beforeEach(() => {
    resetConversationEventMemory('test');
  });

  it('collapses two identical local copies into one by schedule key', () => {
    const real = chicagoEvent('google-massage', 'Массаж', 16);
    const pending = duplicateScheduleCopy(real, 'pending:local-copy');

    const deduped = deduplicateCalendarEvents([real, pending]);

    assert.equal(deduped.length, 1);
    assert.equal(deduped[0]?.id, 'google-massage');
  });

  it('create + refresh keeps a single copy after augment', () => {
    const massage = chicagoEvent('google-massage', 'Массаж', 16);

    recordCreatedConversationEvent({
      eventId: massage.id,
      title: massage.title,
      startISO: massage.startsAt,
      endISO: massage.endsAt,
    });

    const fetched = [
      massage,
      duplicateScheduleCopy(massage, 'pending:stale-copy'),
    ];

    const augmented = augmentEventsWithConversationContext(fetched);

    assert.equal(augmented.length, 1);
    assert.equal(augmented[0]?.id, 'google-massage');
  });

  it('move + snapshot refresh does not duplicate the moved event', () => {
    const massage = chicagoEvent('google-massage', 'Массаж', 16);
    const moved = {
      ...massage,
      startsAt: '2026-05-28T17:00:00-05:00',
      endsAt: '2026-05-28T18:00:00-05:00',
    };

    recordModifiedConversationEvent({
      eventId: moved.id,
      title: moved.title,
      startISO: moved.startsAt,
      endISO: moved.endsAt,
    });

    setLastCalendarSnapshot([moved], 'test_move');
    const augmented = augmentEventsWithConversationContext([
      moved,
      duplicateScheduleCopy(moved, 'pending:move-copy'),
    ]);

    assert.equal(augmented.length, 1);
    assert.equal(augmented[0]?.startsAt, moved.startsAt);
  });

  it('delete it resolves to current_active_event by event_id', () => {
    const dinner = chicagoEvent('google-dinner', 'Ужин', 19);

    recordCreatedConversationEvent({
      eventId: dinner.id,
      title: dinner.title,
      startISO: dinner.startsAt,
      endISO: dinner.endsAt,
    });

    const active = getCurrentActiveCalendarEvent(referenceNow);

    assert.equal(active?.eventId, 'google-dinner');

    const resolved = findCalendarEventForDeleteFromEvents({
      transcript: 'delete it',
      referenceNow,
      events: augmentEventsWithConversationContext([dinner]),
      titleQuery: '',
      timeZone,
    });

    assert.equal(resolved.match?.id, 'google-dinner');
    assert.equal(resolved.matchSource, 'conversation_memory');
  });

  it('move it 2 hours later resolves to current_active_event', () => {
    const massage = chicagoEvent('google-massage', 'Массаж', 16);

    recordCreatedConversationEvent({
      eventId: massage.id,
      title: massage.title,
      startISO: massage.startsAt,
      endISO: massage.endsAt,
    });

    const resolution = resolveCalendarUpdateIntent({
      transcript: 'move it 2 hours later',
      referenceNow,
      events: augmentEventsWithConversationContext([massage]),
      timeZone,
    });

    assert.equal(resolution.ok, true);

    if (!resolution.ok) {
      return;
    }

    assert.equal(resolution.target.id, 'google-massage');
    assert.equal(getZonedTimeParts(new Date(resolution.requestedStartMs), timeZone).hour, 18);
  });

  it('how much time until it uses current_active_event', () => {
    const dinner = chicagoEvent('google-dinner', 'Ужин', 19);

    recordCreatedConversationEvent({
      eventId: dinner.id,
      title: dinner.title,
      startISO: dinner.startsAt,
      endISO: dinner.endsAt,
    });

    const selected = resolveTimeUntilTargetEvent({
      transcript: 'how much time until it',
      referenceNow,
      events: [dinner],
    });

    assert.equal(selected?.id, 'google-dinner');
  });

  it('clarification list never contains identical event rows', () => {
    const massage = chicagoEvent('google-massage', 'Массаж', 16);
    const candidates = calendarEventsToDisambiguationCandidates([
      massage,
      duplicateScheduleCopy(massage, 'pending:dup'),
      duplicateScheduleCopy(massage, 'pending:dup-2'),
    ]);

    assert.equal(candidates.length, 1);
    assert.equal(candidates[0]?.eventId, 'google-massage');
  });

  it('duplicate ambiguous matches collapse to one and execute immediately', () => {
    const massage = chicagoEvent('google-massage', 'Массаж', 16);
    const duplicates = augmentEventsWithConversationContext([
      massage,
      duplicateScheduleCopy(massage, 'pending:dup'),
    ]);

    const resolved = findCalendarEventForDeleteFromEvents({
      transcript: 'удали массаж',
      referenceNow,
      events: duplicates,
      titleQuery: 'массаж',
      timeZone,
    });

    assert.equal(resolved.match?.id, 'google-massage');
    assert.equal(resolved.notFoundReason, null);
    assert.equal(resolved.candidates.length, 1);
  });

  it('does not claim update success when Google Calendar verification fails', () => {
    const failure = createCalendarToolFailure('VERIFY_FAILED', 'Google Calendar did not confirm update.');

    assert.equal(isVerifiedCalendarUpdateSuccess(failure), false);
    assert.equal(failure.status, 'FAILURE');
    assert.equal(
      buildCalendarUpdateVerificationFailedReply('ru'),
      'Не удалось перенести событие. Календарь не подтвердил изменение.',
    );
  });

  it('does not claim delete success when Google Calendar verification fails', () => {
    const failure = createCalendarToolFailure('VERIFY_FAILED', 'Google Calendar did not confirm deletion.');

    assert.equal(isVerifiedCalendarDeleteSuccess(failure), false);
    assert.equal(failure.status, 'FAILURE');
    assert.equal(
      buildCalendarDeleteVerificationFailedReply('ru'),
      'Не удалось удалить событие. Календарь не подтвердил изменение.',
    );
  });
});
