import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { CalendarEvent } from '@/src/entities/calendar/types';
import type { ChatMessage } from '@/src/entities/chat/types';
import { detectCalendarCommandIntent } from '@/src/features/agent/calendar/calendarCommandTypes';
import {
  isTerminalCalendarToolReply,
  isVerifiedCalendarUpdateSuccess,
} from '@/src/features/agent/calendar/calendarExecutionContract';
import { parseCalendarUpdateSchedule, parseCalendarUpdateTimeShift, stripCalendarUpdateTimeShiftPhrases } from '@/src/features/agent/calendar/calendarUpdateScheduleParser';
import {
  extractCalendarUpdateParameters,
  extractUpdateEventTitle,
} from '@/src/features/agent/calendar/calendarUpdateIntentExtractor';
import { findCalendarEventForUpdateFromEvents } from '@/src/features/agent/calendarIntelligence/eventAtTimeMatch';
import {
  buildTranscriptFromPendingContext,
  tryMergePendingCalendarUpdateReply,
} from '@/src/features/agent/calendar/calendarUpdatePendingContext';
import { verifyUpdatedEventMatchesPayload } from '@/src/features/agent/calendar/calendarUpdateVerification';
import { buildCalendarUpdateEventPayload } from '@/src/features/agent/execution/calendarUpdatePayloadBuilder';
import { createCalendarToolSuccess } from '@/src/features/agent/execution/calendarToolContract';
import { mergeActionContextFromHistory } from '@/src/features/agent/intent/actionContextMerge';
import { isOperationalCalendarUpdateRequest } from '@/src/features/agent/intent/operationalCalendarWriteDetection';

const transcript = 'Move dinner from 7 PM to 8 PM';
const referenceNow = new Date('2026-05-28T15:00:00-05:00');

function dinnerEvent(): CalendarEvent {
  const start = new Date(referenceNow);
  start.setHours(19, 0, 0, 0);
  const end = new Date(referenceNow);
  end.setHours(20, 0, 0, 0);

  return {
    id: 'evt-dinner',
    title: 'Dinner',
    startsAt: start.toISOString(),
    endsAt: end.toISOString(),
    isAllDay: false,
  };
}

describe('calendar update integration', () => {
  it('classifies move/reschedule commands as update_calendar_event', () => {
    assert.equal(detectCalendarCommandIntent(transcript), 'update_calendar_event');
  });

  it('strips from/to times so dinner title can be resolved', () => {
    const cleaned = stripCalendarUpdateTimeShiftPhrases(transcript);

    assert.equal(cleaned, 'Move dinner');
    assert.equal(detectCalendarCommandIntent(transcript), 'update_calendar_event');
  });

  it('parses from 7 PM to 8 PM as a one-hour shift on the same day', () => {
    const shift = parseCalendarUpdateTimeShift(transcript, referenceNow);

    assert.equal(shift.ok, true);

    if (!shift.ok) {
      return;
    }

    assert.equal(shift.fromMinutes, 19 * 60);
    assert.equal(shift.toMinutes, 20 * 60);
    assert.equal(shift.toMs - shift.fromMs, 60 * 60 * 1000);
  });

  it('builds PATCH payload that moves dinner from 7 PM to 8 PM preserving duration', () => {
    const matched = dinnerEvent();
    const result = buildCalendarUpdateEventPayload({
      transcript,
      languageCode: 'en-US',
      referenceNow,
      matchedEvent: matched,
    });

    assert.equal(result.ok, true);

    if (!result.ok) {
      return;
    }

    assert.equal(result.eventId, 'evt-dinner');
    assert.equal(result.payload.summary, 'Dinner');

    const newStart = new Date(result.payload.start.dateTime);
    const newEnd = new Date(result.payload.end.dateTime);

    assert.equal(newStart.getHours(), 20);
    assert.equal(newEnd.getHours(), 21);
    assert.equal(newEnd.getTime() - newStart.getTime(), 60 * 60 * 1000);
  });

  it('uses terminal success copy for verified update replies', () => {
    const reply = 'Event updated successfully:\nTitle: Dinner\nNew time: today, 8:00 PM';
    assert.ok(isTerminalCalendarToolReply(reply));
  });

  it('requires verified flags before treating update tool success as contract-valid', () => {
    const unverifiedTool = createCalendarToolSuccess({
      id: 'evt-dinner',
      summary: 'Dinner',
      startsAt: dinnerEvent().startsAt,
      endsAt: dinnerEvent().endsAt,
    });

    assert.equal(isVerifiedCalendarUpdateSuccess(unverifiedTool), true);
    assert.equal(
      isVerifiedCalendarUpdateSuccess({ ...unverifiedTool, verified: false }),
      false,
    );
    assert.equal(
      isVerifiedCalendarUpdateSuccess({ ...unverifiedTool, verificationFetched: false }),
      false,
    );
  });

  it('verifies updated event instants against requested payload', () => {
    const matched = dinnerEvent();
    const payloadResult = buildCalendarUpdateEventPayload({
      transcript,
      languageCode: 'en-US',
      referenceNow,
      matchedEvent: matched,
    });

    assert.equal(payloadResult.ok, true);

    if (!payloadResult.ok) {
      return;
    }

    const verifiedEvent = {
      id: 'evt-dinner',
      summary: 'Dinner',
      startsAt: payloadResult.payload.start.dateTime,
      endsAt: payloadResult.payload.end.dateTime,
    };

    assert.equal(
      verifyUpdatedEventMatchesPayload(verifiedEvent, payloadResult.payload).ok,
      true,
    );

    const staleEvent = {
      ...verifiedEvent,
      startsAt: matched.startsAt,
      endsAt: matched.endsAt,
    };

    assert.equal(
      verifyUpdatedEventMatchesPayload(staleEvent, payloadResult.payload).ok,
      false,
    );
  });

  it('merges clarification follow-up into the original update command', () => {
    const messages: ChatMessage[] = [
      { id: '1', role: 'user', content: 'Move dinner from 7 PM to 8 PM', createdAt: '2026-05-28T10:00:00.000Z', status: 'sent' },
      { id: '2', role: 'assistant', content: 'What should I call this event?', createdAt: '2026-05-28T10:00:01.000Z', status: 'sent' },
      { id: '3', role: 'user', content: 'Team Dinner at 7 PM', createdAt: '2026-05-28T10:00:02.000Z', status: 'sent' },
    ];

    const merged = mergeActionContextFromHistory({
      transcript: 'Team Dinner at 7 PM',
      messages,
      referenceNow,
    });

    assert.equal(merged.usedContext, true);
    assert.equal(merged.contextSource, 'clarification_followup');
    assert.match(merged.mergedTranscript, /Move dinner from 7 PM to 8 PM/);
    assert.match(merged.mergedTranscript, /Team Dinner at 7 PM/);
    assert.equal(detectCalendarCommandIntent(merged.mergedTranscript), 'update_calendar_event');
  });

  it('detects incomplete update commands missing title after from/to shift parse', () => {
    const incompleteShift = parseCalendarUpdateTimeShift('Move from 7 PM to 8 PM', referenceNow);

    assert.equal(incompleteShift.ok, true);
    assert.equal(
      stripCalendarUpdateTimeShiftPhrases('Move from 7 PM to 8 PM'.replace(/^(?:please\s+)?(?:move|reschedule|update|shift)(?:[\s,:-]+|$)/iu, '')).trim(),
      '',
    );

    const completeShift = parseCalendarUpdateTimeShift(transcript, referenceNow);
    const completeTitleSource = stripCalendarUpdateTimeShiftPhrases(
      transcript.replace(/^(?:please\s+)?(?:move|reschedule|update|shift)(?:[\s,:-]+|$)/iu, ''),
    );

    assert.equal(completeShift.ok, true);
    assert.equal(completeTitleSource, 'dinner');
  });

  it('extracts Russian title and 24h from/to times from one message', () => {
    const russian = 'Перенеси чаепитие с 17:30 на 18:30';
    const extracted = extractCalendarUpdateParameters(russian, referenceNow);

    assert.equal(extracted.readyToExecute, true);
    assert.equal(extracted.title, 'чаепитие');
    assert.equal(extracted.fromTime, '17:30');
    assert.equal(extracted.toTime, '18:30');
    assert.deepEqual(extracted.missingFields, []);
  });

  it('merges pending update clarification when user replies with only destination time', () => {
    const pending = {
      operation: 'update' as const,
      title: 'чаепитие',
      fromTime: '17:30',
      toTime: null,
      sourceTranscript: 'Перенеси чаепитие с 17:30',
    };

    const merged = tryMergePendingCalendarUpdateReply({
      pending,
      reply: '18:30',
      referenceNow,
    });

    assert.ok(merged);
    assert.equal(merged?.context.toTime, '18:30');
    assert.equal(merged?.readyToExecute, true);
    assert.match(merged?.transcript ?? '', /чаепитие/);
    assert.match(merged?.transcript ?? '', /17:30/);
    assert.match(merged?.transcript ?? '', /18:30/);
  });

  it('builds a canonical Russian transcript from pending update context', () => {
    const transcript = buildTranscriptFromPendingContext({
      operation: 'update',
      title: 'чаепитие',
      fromTime: '17:30',
      toTime: '18:30',
      sourceTranscript: 'Перенеси чаепитие с 17:30 на 18:30',
    });

    assert.equal(transcript, 'Перенеси чаепитие с 17:30 на 18:30');
  });

  it('extracts update title without create-style confidence gating', () => {
    assert.equal(extractUpdateEventTitle('Move dinner from 7 PM to 8 PM'), 'dinner');
    assert.equal(extractUpdateEventTitle('Перенеси чаепитие с 17:30 на 18:30'), 'чаепитие');
  });

  it('parses Russian split-minute update shift', () => {
    const shift = parseCalendarUpdateTimeShift(
      'Перенеси чаепитие с 17 и 30 на 18:30',
      referenceNow,
    );

    assert.equal(shift.ok, true);

    if (!shift.ok) {
      return;
    }

    assert.equal(shift.fromMinutes, 17 * 60 + 30);
    assert.equal(shift.toMinutes, 18 * 60 + 30);
  });

  it('parses evening meridiem on destination update shift', () => {
    const shift = parseCalendarUpdateTimeShift(
      'Перенеси чаепитие с 5:30 на 6:30 вечера',
      referenceNow,
    );

    assert.equal(shift.ok, true);

    if (!shift.ok) {
      return;
    }

    assert.equal(shift.fromMinutes, 17 * 60 + 30);
    assert.equal(shift.toMinutes, 18 * 60 + 30);
  });

  it('finds the same event for update that READ resolves at 17:30', () => {
    const teaParty = (() => {
      const start = new Date('2026-05-28T17:30:00-05:00');
      const end = new Date('2026-05-28T18:00:00-05:00');

      return {
        id: 'evt-tea',
        title: 'чаепитие',
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
        isAllDay: false,
      } satisfies CalendarEvent;
    })();

    const updateTranscript = 'Перенеси чаепитие с 17:30 на 18:30';
    const resolved = findCalendarEventForUpdateFromEvents({
      transcript: updateTranscript,
      referenceNow,
      events: [teaParty],
      titleQuery: 'чаепитие',
    });

    assert.equal(resolved.match?.id, 'evt-tea');
    assert.equal(resolved.clockMinutes, 17 * 60 + 30);
  });

  it('finds event for split-minute update shift', () => {
    const teaParty = {
      id: 'evt-tea',
      title: 'чаепитие',
      startsAt: '2026-05-28T22:30:00.000Z',
      endsAt: '2026-05-28T23:00:00.000Z',
      isAllDay: false,
    } satisfies CalendarEvent;

    const resolved = findCalendarEventForUpdateFromEvents({
      transcript: 'Перенеси чаепитие с 17 и 30 на 18:30',
      referenceNow,
      events: [teaParty],
      titleQuery: 'чаепитие',
    });

    assert.equal(resolved.match?.id, 'evt-tea');
  });

  it('detects imperfect Ukrainian/Russian update verbs as update_calendar_event', () => {
    assert.equal(isOperationalCalendarUpdateRequest('переносы прогулянку'), true);
    assert.equal(detectCalendarCommandIntent('переносы прогулянку'), 'update_calendar_event');
    assert.equal(detectCalendarCommandIntent('перенеси прогулку на завтра в 15:00'), 'update_calendar_event');
    assert.equal(detectCalendarCommandIntent('здвинь прогулянку на час позже'), 'update_calendar_event');
  });

  it('extracts title from imperfect mutation phrases', () => {
    assert.equal(extractUpdateEventTitle('переносы прогулянку'), 'прогулянка');
    assert.equal(extractUpdateEventTitle('перенеси прогулку на завтра в 15:00'), 'прогулка');
    assert.equal(extractUpdateEventTitle('здвинь прогулянку на час позже'), 'прогулянка');
  });

  it('parses destination and relative update schedules', () => {
    const destination = parseCalendarUpdateSchedule(
      'перенеси прогулку на завтра в 15:00',
      referenceNow,
    );

    assert.equal(destination.ok, true);

    if (destination.ok) {
      assert.equal(destination.kind, 'destination');
    }

    const relative = parseCalendarUpdateSchedule('здвинь прогулянку на час позже', referenceNow);

    assert.equal(relative.ok, true);

    if (relative.ok) {
      assert.equal(relative.kind, 'relative_offset');
      assert.equal(relative.offsetMs, 60 * 60_000);
      assert.equal(relative.direction, 'later');
    }
  });

  it('fuzzy-matches misspelled titles against existing events', () => {
    const walkEvent = {
      id: 'evt-walk',
      title: 'Прогулка',
      startsAt: '2026-05-28T14:00:00-05:00',
      endsAt: '2026-05-28T15:00:00-05:00',
      isAllDay: false,
    } satisfies CalendarEvent;

    const resolved = findCalendarEventForUpdateFromEvents({
      transcript: 'здвинь прогулянку на час позже',
      referenceNow,
      events: [walkEvent],
      titleQuery: 'прогулянка',
    });

    assert.equal(resolved.match?.id, 'evt-walk');
    assert.equal(resolved.toMs, Date.parse('2026-05-28T14:00:00-05:00') + 60 * 60_000);
  });

  it('asks for time when update title is present without schedule, then resumes pending update', () => {
    const incomplete = extractCalendarUpdateParameters('перенеси прогулянку', referenceNow);

    assert.equal(incomplete.title, 'прогулянка');
    assert.equal(incomplete.readyToExecute, false);
    assert.ok(incomplete.missingFields.includes('fromTime'));

    const pending = {
      operation: 'update' as const,
      title: incomplete.title,
      fromTime: incomplete.fromTime,
      toTime: incomplete.toTime,
      sourceTranscript: 'перенеси прогулянку',
    };

    const merged = tryMergePendingCalendarUpdateReply({
      pending,
      reply: 'завтра в 15:00',
      referenceNow,
    });

    assert.ok(merged);
    assert.equal(merged?.readyToExecute, true);
    assert.equal(merged?.context.toTime, '15:00');
    assert.match(merged?.transcript ?? '', /прогулянк/i);
    assert.match(merged?.transcript ?? '', /15:00/);

    const walkEvent = {
      id: 'evt-walk',
      title: 'Прогулка',
      startsAt: '2026-05-28T14:00:00-05:00',
      endsAt: '2026-05-28T15:00:00-05:00',
      isAllDay: false,
    } satisfies CalendarEvent;

    const resolved = findCalendarEventForUpdateFromEvents({
      transcript: merged?.transcript ?? '',
      referenceNow,
      events: [walkEvent],
      titleQuery: merged?.context.title ?? 'прогулянка',
    });

    assert.equal(resolved.match?.id, 'evt-walk');
    assert.equal(resolved.toMs, Date.parse('2026-05-29T15:00:00-05:00'));
  });
});
