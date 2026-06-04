import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import type { CalendarEvent } from '@/src/entities/calendar/types';
import {
  classifyCalendarApiOperationError,
  isCalendarReconnectRequired,
  isConfirmedCalendarAuthFailure,
} from '@/src/features/agent/calendar/calendarApiErrorClassification';
import { mapCaughtCalendarApiError } from '@/src/features/agent/calendar/calendarApiToolErrorMapper';
import { buildCalendarCreateDedupeKey } from '@/src/features/agent/calendar/calendarCreateDedupeKey';
import {
  buildCalendarEventDisambiguationReply,
  resolveDisambiguationSelection,
} from '@/src/features/agent/calendar/calendarEventDisambiguation';
import { resolveCalendarDeleteTargetFromEvents } from '@/src/features/agent/calendar/calendarDeleteResolution';
import { tryMergePendingCalendarDeleteReply } from '@/src/features/agent/calendar/calendarDeletePendingContext';
import {
  pendingContextFromExtraction,
  tryMergePendingCalendarUpdateReply,
} from '@/src/features/agent/calendar/calendarUpdatePendingContext';
import { extractCalendarUpdateParameters } from '@/src/features/agent/calendar/calendarUpdateIntentExtractor';
import { resetCalendarConversationState } from '@/src/features/agent/calendar/calendarConversationState';
import { syncConversationStateForUpdateSelection } from '@/src/features/agent/calendar/calendarConversationSync';
import { classifyPendingCalendarReply } from '@/src/features/agent/calendar/calendarPendingReplyClassifier';
import {
  endCalendarCreateOperation,
  resetCalendarExecutionSession,
  setPendingCalendarUpdateContext,
  tryBeginCalendarCreateOperation,
} from '@/src/features/agent/execution/calendarExecutionSession';
import { ApiError } from '@/src/shared/api/api-error';

const timeZone = 'America/Chicago';
const referenceNow = new Date('2026-05-28T20:00:00-05:00');

function chicagoEvent(id: string, title: string, hour: number, minute = 0): CalendarEvent {
  const pad = (value: number) => String(value).padStart(2, '0');
  const start = `2026-05-28T${pad(hour)}:${pad(minute)}:00-05:00`;
  const end = new Date(start);
  end.setHours(end.getHours() + 1);

  return {
    id,
    title,
    startsAt: start,
    endsAt: end.toISOString(),
    isAllDay: false,
  };
}

describe('calendar regression (stability + disambiguation)', () => {
  beforeEach(() => {
    resetCalendarExecutionSession();
    resetCalendarConversationState('test_reset');
  });

  it('(a) create Massage 16:00 and Massage 21:00 both succeed dedupe-wise', () => {
    const fourPm = buildCalendarCreateDedupeKey({
      title: 'Massage',
      startMs: Date.parse('2026-05-28T16:00:00-05:00'),
      timeZone,
    });
    const ninePm = buildCalendarCreateDedupeKey({
      title: 'Massage',
      startMs: Date.parse('2026-05-28T21:00:00-05:00'),
      timeZone,
    });

    assert.equal(tryBeginCalendarCreateOperation(fourPm), true);
    endCalendarCreateOperation({ dedupeKey: fourPm, failed: false });
    assert.equal(tryBeginCalendarCreateOperation(ninePm), true);
  });

  it('(b) delete Massage asks which one; 16:00 reply deletes only 16:00', () => {
    const massage4 = chicagoEvent('massage-4', 'Massage', 16);
    const massage9 = chicagoEvent('massage-9', 'Massage', 21);

    const resolution = resolveCalendarDeleteTargetFromEvents({
      events: [massage4, massage9],
      titleQuery: 'Massage',
      transcript: 'Delete Massage',
      referenceNow,
      timeZone,
    });

    assert.equal(resolution.status, 'ambiguous');

    const merged = tryMergePendingCalendarDeleteReply({
      pending: {
        operation: 'delete',
        type: 'delete',
        title: 'Massage',
        dayHint: null,
        sourceTranscript: 'Delete Massage',
        originalUserText: 'Delete Massage',
        createdAtMs: Date.now(),
        candidates: resolution.candidates.map((entry) => ({
          eventId: entry.event.id,
          title: entry.event.title,
          startsAt: entry.event.startsAt,
          endsAt: entry.event.endsAt,
        })),
      },
      reply: '16:00',
      referenceNow,
      timeZone,
    });

    assert.equal(merged?.selectedEventId, 'massage-4');
  });

  it('(c) move Dinner with 19:00 and 20:00 asks which one', () => {
    const dinner7 = chicagoEvent('dinner-7', 'Dinner', 19);
    const dinner8 = chicagoEvent('dinner-8', 'Dinner', 20);

    const candidates = [dinner7, dinner8].map((event) => ({
      eventId: event.id,
      title: event.title,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
    }));

    const reply = buildCalendarEventDisambiguationReply({
      locale: 'en',
      action: 'update',
      title: 'Dinner',
      candidates,
      referenceNow,
      timeZone,
    });

    assert.match(reply, /Which one should I move/i);
    assert.match(reply, /1\./);
    assert.match(reply, /2\./);
  });

  it('(g) Massage 18:00/21:00: "today 9 PM" selects 21:00 and applies 2h move delta', () => {
    const massage6 = chicagoEvent('massage-6', 'Massage', 18);
    const massage9 = chicagoEvent('massage-9', 'Massage', 21);
    const candidates = [massage6, massage9].map((event) => ({
      eventId: event.id,
      title: event.title,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
    }));

    const extraction = extractCalendarUpdateParameters('Move massage 2 hours later', referenceNow);
    const pending = pendingContextFromExtraction({
      sourceTranscript: 'Move massage 2 hours later',
      extraction,
      candidates,
      referenceNow,
    });

    assert.equal(pending.moveDeltaMs, 2 * 60 * 60 * 1000);

    setPendingCalendarUpdateContext(pending);
    syncConversationStateForUpdateSelection(pending, 'en-US');

    assert.equal(classifyPendingCalendarReply('today 9 PM'), 'unrelated');
    assert.notEqual(classifyPendingCalendarReply('today 9 PM'), 'alternate_time');

    const merged = tryMergePendingCalendarUpdateReply({
      pending,
      reply: 'today 9 PM',
      referenceNow,
    });

    assert.equal(merged?.selectedEventId, 'massage-9');
    assert.equal(merged?.context.fromStartISO, massage9.startsAt);
    assert.equal(
      Date.parse(merged?.context.toStartISO ?? ''),
      Date.parse('2026-05-28T23:00:00-05:00'),
    );
  });

  it('(d) reply "today 8 PM" selects Dinner 20:00 and applies move delta', () => {
    const dinner7 = chicagoEvent('dinner-7', 'Dinner', 19);
    const dinner8 = chicagoEvent('dinner-8', 'Dinner', 20);
    const candidates = [dinner7, dinner8].map((event) => ({
      eventId: event.id,
      title: event.title,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
    }));

    const extraction = extractCalendarUpdateParameters('Move Dinner 2 hours later', referenceNow);
    const pending = pendingContextFromExtraction({
      sourceTranscript: 'Move Dinner 2 hours later',
      extraction,
      candidates,
      referenceNow,
    });

    const merged = tryMergePendingCalendarUpdateReply({
      pending,
      reply: 'today 8 PM',
      referenceNow,
    });

    assert.equal(merged?.selectedEventId, 'dinner-8');
    assert.equal(merged?.context.fromStartISO, dinner8.startsAt);
    assert.equal(merged?.transcript, 'Move Dinner 2 hours later');
    assert.equal(merged?.context.title, 'Dinner');
    assert.equal(
      resolveDisambiguationSelection({ reply: 'today 8 PM', candidates, referenceNow, timeZone })?.eventId,
      'dinner-8',
    );
  });

  it('(d-alt) ordinal "the second one" selects second Dinner', () => {
    const candidates = [chicagoEvent('dinner-7', 'Dinner', 19), chicagoEvent('dinner-8', 'Dinner', 20)].map(
      (event) => ({
        eventId: event.id,
        title: event.title,
        startsAt: event.startsAt,
        endsAt: event.endsAt,
      }),
    );

    const selected = resolveDisambiguationSelection({
      reply: 'the second one',
      candidates,
      referenceNow,
      timeZone,
    });

    assert.equal(selected?.eventId, 'dinner-8');
  });

  it('(e) Google 503 during refresh does not require reconnect when refresh token exists', () => {
    const session = {
      hasLocalSession: true,
      hasRefreshToken: true,
      backendConnected: true,
    };
    const error = new ApiError({ message: 'Service Unavailable', status: 503, retryable: true });

    assert.equal(classifyCalendarApiOperationError(error, session), 'temporary');
    assert.equal(isCalendarReconnectRequired(error, session), false);
    assert.equal(isConfirmedCalendarAuthFailure(error, session), false);
  });

  it('(f) Google 401 invalid_grant requires reconnect', async () => {
    const error = new ApiError({
      message: 'invalid_grant',
      status: 401,
      code: 'invalid_grant',
    });

    assert.equal(isConfirmedCalendarAuthFailure(error), true);
    assert.equal(classifyCalendarApiOperationError(error), 'auth_required');

    const tool = await mapCaughtCalendarApiError({
      error,
      languageCode: 'en-US',
      action: 'POST /google-calendar/token/refresh',
      calendarChanged: false,
      authSession: {
        hasLocalSession: true,
        hasRefreshToken: true,
        backendConnected: true,
      },
    });

    assert.equal(tool.errorCode, 'CALENDAR_AUTH_REQUIRED');
  });
});
