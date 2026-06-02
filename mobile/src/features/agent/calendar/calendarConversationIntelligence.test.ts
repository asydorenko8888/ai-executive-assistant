import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import {
  getConversationEventMemory,
  recordCreatedConversationEvent,
  recordModifiedConversationEvent,
  resetConversationEventMemory,
  resolveMoveEventReference,
} from '@/src/features/agent/calendar/calendarConversationEventMemory';
import { extractCalendarCreateRecurrence } from '@/src/features/agent/calendar/calendarCreateRecurrenceParser';
import { parseCalendarCreateSchedule } from '@/src/features/agent/calendar/calendarCreateScheduleParser';
import {
  buildCalendarPendingAction,
  resetCalendarConversationState,
  transitionCalendarConversationState,
} from '@/src/features/agent/calendar/calendarConversationState';
import { classifyPendingCalendarReply } from '@/src/features/agent/calendar/calendarPendingReplyClassifier';
import { extractCalendarUpdateParameters } from '@/src/features/agent/calendar/calendarUpdateIntentExtractor';
import { enrichCalendarCommandTranscript } from '@/src/features/agent/calendar/calendarTranscriptEnrichment';
import { parseCalendarUpdateSchedule } from '@/src/features/agent/calendar/calendarUpdateScheduleParser';
import { resolvePendingConflictResolution } from '@/src/features/agent/calendar/calendarPendingConflictResolution';
import { requiresCalendarCommandExecution } from '@/src/features/agent/calendar/calendarCommandTypes';
import { detectCalendarCommandIntent } from '@/src/features/agent/calendar/calendarCommandTypes';
import { extractCreateEventTitle } from '@/src/features/agent/calendar/calendarCreateIntentExtractor';
import { getExecutiveCalendarTimezone } from '@/src/features/agent/calendar/calendarTimezone';

const referenceNow = new Date('2026-06-04T10:00:00-05:00');
const timeZone = getExecutiveCalendarTimezone();

function seedDentistAt1pm() {
  recordCreatedConversationEvent({
    eventId: 'dentist-1',
    title: 'Dentist',
    startISO: '2026-06-04T13:00:00-05:00',
    endISO: '2026-06-04T14:00:00-05:00',
  });
}

describe('calendar conversation intelligence', () => {
  beforeEach(() => {
    resetConversationEventMemory('test_reset');
    resetCalendarConversationState('test_reset');
  });

  it('1. create event → move it later (EN)', () => {
    seedDentistAt1pm();
    const enriched = enrichCalendarCommandTranscript({
      transcript: 'Move it 2 hours later',
      referenceNow,
    });

    assert.match(enriched, /dentist/i);
    assert.equal(requiresCalendarCommandExecution('Move it 2 hours later'), true);
    assert.equal(detectCalendarCommandIntent(enriched), 'update_calendar_event');

    const update = extractCalendarUpdateParameters(enriched, referenceNow);
    assert.equal(update.title, 'Dentist');
    assert.equal(update.readyToExecute, true);
    assert.equal(update.toMs, Date.parse('2026-06-04T15:00:00-05:00'));
  });

  it('2. create event → move it earlier (RU)', () => {
    recordCreatedConversationEvent({
      eventId: 'walk-1',
      title: 'Прогулка',
      startISO: '2026-06-04T20:00:00-05:00',
      endISO: '2026-06-04T21:00:00-05:00',
    });

    const enriched = enrichCalendarCommandTranscript({
      transcript: 'Перенеси его на 2 часа раньше',
      referenceNow,
    });

    assert.match(enriched, /прогулк/i);
    const update = extractCalendarUpdateParameters(enriched, referenceNow);
    assert.equal(update.readyToExecute, true);
    assert.equal(update.toMs, Date.parse('2026-06-04T18:00:00-05:00'));
  });

  it('3. create event → move it tomorrow (UA)', () => {
    recordCreatedConversationEvent({
      eventId: 'coffee-1',
      title: 'Кава',
      startISO: '2026-06-04T09:00:00-05:00',
      endISO: '2026-06-04T09:30:00-05:00',
    });

    const enriched = enrichCalendarCommandTranscript({
      transcript: 'Перенеси її на завтра о 10:00',
      referenceNow,
    });

    assert.match(enriched, /кав/i);
    const update = extractCalendarUpdateParameters(enriched, referenceNow);
    assert.equal(update.title, 'Кава');
    assert.equal(update.readyToExecute, true);
  });

  it('4. create event → delete it (EN pronoun)', () => {
    seedDentistAt1pm();
    const enriched = enrichCalendarCommandTranscript({
      transcript: 'Delete it',
      referenceNow,
    });

    assert.match(enriched, /dentist/i);
    assert.equal(detectCalendarCommandIntent(enriched), 'delete_calendar_event');
  });

  it('5. create recurring Monday event (EN)', () => {
    const transcript = 'Add Meditation every Monday at 11 AM';
    const recurrence = extractCalendarCreateRecurrence(transcript, referenceNow, timeZone);

    assert.ok(recurrence);
    assert.equal(recurrence.recurrence.byDay, 'MO');
    assert.match(recurrence.recurrence.rrule, /FREQ=WEEKLY;BYDAY=MO/);

    const schedule = parseCalendarCreateSchedule(transcript, referenceNow, timeZone);
    assert.equal(schedule.ok, true);

    if (schedule.ok) {
      assert.ok(schedule.recurrence);
    }
  });

  it('6. create daily recurring event for current week (EN)', () => {
    const transcript = 'Add a walk every day this week at 9 PM';
    const recurrence = extractCalendarCreateRecurrence(transcript, referenceNow, timeZone);

    assert.ok(recurrence);
    assert.match(recurrence.recurrence.rrule, /FREQ=DAILY/);
    assert.match(recurrence.recurrence.rrule, /UNTIL=/);
  });

  it('7. stores recurring series in memory after create', () => {
    recordCreatedConversationEvent({
      eventId: 'walk-series',
      title: 'Walk',
      startISO: '2026-06-04T21:00:00-05:00',
      endISO: '2026-06-04T22:00:00-05:00',
      recurrenceRrule: 'RRULE:FREQ=DAILY;UNTIL=20260608T235959Z',
    });

    const mem = getConversationEventMemory();
    assert.equal(mem.lastReferencedRecurringSeries?.title, 'Walk');
    assert.match(mem.lastReferencedRecurringSeries?.rrule ?? '', /FREQ=DAILY/);
  });

  it('8. move recurring series follow-up keeps title context', () => {
    recordCreatedConversationEvent({
      eventId: 'walk-series',
      title: 'Walk',
      startISO: '2026-06-04T21:00:00-05:00',
      endISO: '2026-06-04T22:00:00-05:00',
      recurrenceRrule: 'RRULE:FREQ=DAILY;UNTIL=20260608T235959Z',
    });

    const enriched = enrichCalendarCommandTranscript({
      transcript: 'Move it to next week',
      referenceNow,
    });

    assert.match(enriched, /walk/i);
    assert.equal(extractCalendarUpdateParameters(enriched, referenceNow).title, 'Walk');
  });

  it('9. conflict resolution: "12:00 works" picks first slot', () => {
    const pending = buildCalendarPendingAction({
      actionType: 'create',
      originalIntent: 'Add hike to Nikolay 16:00',
      eventTitle: 'Hike to Nikolay',
      sourceTranscript: 'Add hike to Nikolay 16:00',
      languageCode: 'en-US',
      proposedStartMs: Date.parse('2026-06-04T16:00:00-05:00'),
      proposedEndMs: Date.parse('2026-06-04T17:00:00-05:00'),
      alternativeStartMs: [
        Date.parse('2026-06-04T12:00:00-05:00'),
        Date.parse('2026-06-04T12:30:00-05:00'),
        Date.parse('2026-06-04T13:00:00-05:00'),
      ],
    });

    transitionCalendarConversationState({
      toState: 'WAITING_ALTERNATIVE_SLOT',
      pendingAction: pending,
      reason: 'test',
    });

    const reply = '12:00 works';
    const resolution = resolvePendingConflictResolution({
      pending,
      transcript: reply,
      classification: classifyPendingCalendarReply(reply),
      referenceNow,
    });

    assert.equal(resolution.kind, 'pick_alternative');

    if (resolution.kind === 'pick_alternative') {
      assert.equal(resolution.startMs, Date.parse('2026-06-04T12:00:00-05:00'));
    }
  });

  it('10. pronoun resolution English', () => {
    seedDentistAt1pm();
    assert.equal(resolveMoveEventReference(referenceNow)?.title, 'Dentist');
  });

  it('11. pronoun resolution Russian', () => {
    recordCreatedConversationEvent({
      eventId: 'ru-1',
      title: 'Стоматолог',
      startISO: '2026-06-04T13:00:00-05:00',
      endISO: '2026-06-04T14:00:00-05:00',
    });

    const enriched = enrichCalendarCommandTranscript({
      transcript: 'Перенеси его на час позже',
      referenceNow,
    });

    assert.match(enriched, /стоматолог/i);
  });

  it('12. pronoun resolution Ukrainian', () => {
    recordCreatedConversationEvent({
      eventId: 'uk-1',
      title: 'Медитація',
      startISO: '2026-06-04T11:00:00-05:00',
      endISO: '2026-06-04T12:00:00-05:00',
    });

    const enriched = enrichCalendarCommandTranscript({
      transcript: 'Перенеси її на годину пізніше',
      referenceNow,
    });

    assert.match(enriched, /медитаці/i);
  });

  it('multi-step: create → move later → move tomorrow (title retained)', () => {
    seedDentistAt1pm();

    const moveLater = enrichCalendarCommandTranscript({
      transcript: 'Move it 2 hours later',
      referenceNow,
    });
    assert.match(moveLater, /dentist/i);

    recordModifiedConversationEvent({
      eventId: 'dentist-1',
      title: 'Dentist',
      startISO: '2026-06-04T15:00:00-05:00',
      endISO: '2026-06-04T16:00:00-05:00',
    });

    const moveTomorrow = enrichCalendarCommandTranscript({
      transcript: 'Move it to tomorrow at 2 PM',
      referenceNow,
    });

    assert.match(moveTomorrow, /dentist/i);
    const update = extractCalendarUpdateParameters(moveTomorrow, referenceNow);
    assert.match(update.title ?? '', /dentist/i);
    assert.equal(update.readyToExecute, true);
  });

  it('RU create title preserved on move follow-up', () => {
    const createText = 'Добавь поход к Николаю 16:00';
    assert.equal(extractCreateEventTitle(createText), 'Поход к Николаю');

    recordCreatedConversationEvent({
      eventId: 'hike-1',
      title: 'Поход к Николаю',
      startISO: '2026-06-04T16:00:00-05:00',
      endISO: '2026-06-04T17:00:00-05:00',
    });

    const enriched = enrichCalendarCommandTranscript({
      transcript: 'Перенеси его на 2 часа позже',
      referenceNow,
    });

    assert.match(enriched, /поход/i);
    assert.match(enriched, /никола/i);
  });
});
