import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  formatVerifiedEventScheduleRangeForUi,
  isReadableVerifiedCalendarEvent,
  mapGoogleBackendEventToVerified,
} from '@/src/features/agent/calendar/calendarAuthoritativeEvent';
import {
  backendClaimsVerified,
  buildAuthoritativeCreateToolResponseCore,
  buildAuthoritativeDeleteToolResponseCore,
  buildAuthoritativeUpdateToolResponseCore,
} from '@/src/features/agent/calendar/calendarAuthoritativeMutationCore';
import type { GoogleCalendarCreateApiResponse } from '@/src/features/agent/calendar/googleCalendarBackendApi';
import { buildCalendarToolReplyBundle } from '@/src/features/agent/execution/calendarToolResponses';
import { buildCalendarDeleteToolReplyBundle } from '@/src/features/agent/execution/calendarDeleteToolResponses';
import { buildCalendarUpdateToolReplyBundle } from '@/src/features/agent/execution/calendarUpdateToolResponses';
import { buildNaturalCalendarCreateSuccessReply } from '@/src/features/agent/execution/calendarCreateSuccessReply';
import { buildNaturalCalendarUpdateSuccessReply } from '@/src/features/agent/execution/calendarUpdateSuccessReply';
import type { VerifiedCalendarEvent } from '@/src/features/agent/execution/actionExecutionTypes';

const timeZone = 'America/Chicago';
const referenceNow = new Date('2026-05-30T12:00:00-05:00');

function verifiedDinnerOnFriday(params: {
  startHour: number;
  endHour: number;
  startMinute?: number;
  endMinute?: number;
}): VerifiedCalendarEvent {
  const pad = (value: number) => String(value).padStart(2, '0');

  return {
    id: 'evt-dinner',
    summary: 'Ужин',
    startsAt: `2026-06-05T${pad(params.startHour)}:${pad(params.startMinute ?? 0)}:00-05:00`,
    endsAt: `2026-06-05T${pad(params.endHour)}:${pad(params.endMinute ?? 0)}:00-05:00`,
  };
}

function backendSuccess(event: VerifiedCalendarEvent): GoogleCalendarCreateApiResponse {
  return {
    executionState: 'success',
    verified: true,
    verificationFetched: true,
    event: {
      id: event.id,
      summary: event.summary,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
    },
  };
}

describe('calendar mutation verification honesty', () => {
  it('create success reply uses verified API range, not requested intent time', () => {
    const verified = verifiedDinnerOnFriday({ startHour: 19, endHour: 20 });
    const { reply } = buildNaturalCalendarCreateSuccessReply({
      event: verified,
      languageCode: 'ru-RU',
      referenceNow,
    });

    assert.match(reply, /19:00–20:00/);
    assert.doesNotMatch(reply, /20:30/);
    assert.ok(reply.startsWith('Событие создано:'));
  });

  it('update success reply reports actual Friday 18:00–19:00 when API differs from +90min request', () => {
    const verified = verifiedDinnerOnFriday({ startHour: 18, endHour: 19 });
    const { reply } = buildNaturalCalendarUpdateSuccessReply({
      event: verified,
      languageCode: 'ru-RU',
      referenceNow,
      timeZone,
      previousStartsAt: '2026-06-05T19:00:00-05:00',
    });

    assert.match(reply, /18:00–19:00/);
    assert.doesNotMatch(reply, /20:30/);
    assert.ok(reply.startsWith('Событие перенесено:'));
  });

  it('relative +90min move: UI label matches authoritative fetch, not payload start', async () => {
    const actual = verifiedDinnerOnFriday({ startHour: 18, endHour: 19 });
    let readCount = 0;

    const tool = await buildAuthoritativeUpdateToolResponseCore({
      eventId: actual.id,
      backendResponse: backendSuccess({
        ...actual,
        startsAt: '2026-06-05T20:30:00-05:00',
        endsAt: '2026-06-05T21:30:00-05:00',
      }),
      readEventById: async (eventId) => {
        readCount += 1;
        assert.equal(eventId, actual.id);
        return actual;
      },
    });

    assert.equal(tool.status, 'SUCCESS');
    assert.equal(readCount, 1);

    const rangeLabel = formatVerifiedEventScheduleRangeForUi({
      event: tool.event!,
      referenceNow,
      locale: 'ru',
      timeZone,
    });

    assert.match(rangeLabel ?? '', /18:00–19:00/);
    assert.doesNotMatch(rangeLabel ?? '', /20:30/);

    const { reply } = buildNaturalCalendarUpdateSuccessReply({
      event: tool.event!,
      languageCode: 'ru-RU',
      referenceNow,
      timeZone,
      previousStartsAt: '2026-06-05T19:00:00-05:00',
    });

    assert.match(reply, /18:00–19:00/);
    assert.doesNotMatch(reply, /20:30/);
  });

  it('create -> read -> verify uses authoritative GET, not insert payload times', async () => {
    const actual = verifiedDinnerOnFriday({ startHour: 19, endHour: 20 });
    let readCount = 0;

    const tool = await buildAuthoritativeCreateToolResponseCore({
      eventId: actual.id,
      backendResponse: backendSuccess({
        ...actual,
        startsAt: '2026-06-05T20:30:00-05:00',
        endsAt: '2026-06-05T21:30:00-05:00',
      }),
      readEventById: async (eventId) => {
        readCount += 1;
        assert.equal(eventId, actual.id);
        return actual;
      },
    });

    assert.equal(tool.status, 'SUCCESS');
    assert.equal(readCount, 1);
    assert.equal(tool.event?.startsAt, actual.startsAt);
    assert.equal(tool.event?.endsAt, actual.endsAt);
  });

  it('delete -> verify absence fails when event is still readable', async () => {
    const actual = verifiedDinnerOnFriday({ startHour: 18, endHour: 19 });

    const tool = await buildAuthoritativeDeleteToolResponseCore({
      eventId: actual.id,
      backendResponse: backendSuccess(actual),
      deletedEventSnapshot: actual,
      confirmDeleted: async () => false,
    });

    assert.equal(tool.status, 'FAILURE');
    assert.equal(tool.errorCode, 'VERIFY_FAILED');
  });

  it('delete succeeds when backend returns SUCCESS flags without executionState field', async () => {
    const actual = verifiedDinnerOnFriday({ startHour: 18, endHour: 19 });

    const tool = await buildAuthoritativeDeleteToolResponseCore({
      eventId: actual.id,
      backendResponse: {
        status: 'SUCCESS',
        code: 'SUCCESS',
        verified: true,
        verificationFetched: true,
        event: {
          id: actual.id,
          summary: actual.summary,
          startsAt: actual.startsAt,
          endsAt: actual.endsAt,
        },
      },
      deletedEventSnapshot: actual,
      confirmDeleted: async () => true,
    });

    assert.equal(tool.status, 'SUCCESS');
    assert.equal(tool.verified, true);
  });

  it('delete -> verify absence succeeds when follow-up read is empty', async () => {
    const actual = verifiedDinnerOnFriday({ startHour: 18, endHour: 19 });

    const tool = await buildAuthoritativeDeleteToolResponseCore({
      eventId: actual.id,
      backendResponse: backendSuccess(actual),
      deletedEventSnapshot: actual,
      confirmDeleted: async () => true,
    });

    assert.equal(tool.status, 'SUCCESS');
    assert.equal(tool.verified, true);
    assert.equal(tool.verificationFetched, true);
  });

  it('create event -> delete same event succeeds when backend confirms and follow-up read is empty', async () => {
    const event = verifiedDinnerOnFriday({ startHour: 11, endHour: 12 });
    const backendDeleteBody: GoogleCalendarCreateApiResponse = {
      status: 'SUCCESS',
      code: 'SUCCESS',
      verified: true,
      verificationFetched: true,
      event: {
        id: event.id,
        summary: event.summary,
        startsAt: event.startsAt,
        endsAt: event.endsAt,
      },
      eventId: event.id,
    };

    assert.equal(backendClaimsVerified(backendDeleteBody), true);

    const tool = await buildAuthoritativeDeleteToolResponseCore({
      eventId: event.id,
      backendResponse: backendDeleteBody,
      deletedEventSnapshot: event,
      confirmDeleted: async (eventId) => {
        assert.equal(eventId, event.id);
        return true;
      },
    });

    assert.equal(tool.status, 'SUCCESS');
    assert.equal(tool.verified, true);
    assert.equal(tool.eventId, event.id);
  });

  it('blocks create success copy when tool status is SUCCESS but verification flags are false', () => {
    const event = verifiedDinnerOnFriday({ startHour: 19, endHour: 20 });
    const bundle = buildCalendarToolReplyBundle(
      {
        status: 'SUCCESS',
        eventId: event.id,
        event,
        verified: false,
        verificationFetched: false,
      },
      'ru-RU',
      { referenceNow },
    );

    assert.match(bundle.reply, /FAILURE: CALENDAR_EXECUTION_CONTRACT/);
    assert.equal(bundle.executionState, 'failed');
    assert.doesNotMatch(bundle.reply, /Событие создано:/);
  });

  it('blocks update success copy when tool status is SUCCESS but verification flags are false', () => {
    const event = verifiedDinnerOnFriday({ startHour: 18, endHour: 19 });
    const bundle = buildCalendarUpdateToolReplyBundle(
      {
        status: 'SUCCESS',
        eventId: event.id,
        event,
        verified: false,
        verificationFetched: false,
      },
      'ru-RU',
      { referenceNow },
    );

    assert.match(bundle.reply, /FAILURE: CALENDAR_EXECUTION_CONTRACT/);
    assert.equal(bundle.executionState, 'failed');
    assert.doesNotMatch(bundle.reply, /Событие перенесено:/);
  });

  it('blocks delete success copy when tool status is SUCCESS but verification flags are false', () => {
    const event = verifiedDinnerOnFriday({ startHour: 18, endHour: 19 });
    const bundle = buildCalendarDeleteToolReplyBundle(
      {
        status: 'SUCCESS',
        eventId: event.id,
        event,
        verified: false,
        verificationFetched: false,
      },
      'ru-RU',
      { referenceNow },
    );

    assert.match(bundle.reply, /FAILURE: CALENDAR_EXECUTION_CONTRACT/);
    assert.equal(bundle.executionState, 'failed');
    assert.doesNotMatch(bundle.reply, /Событие удалено:/);
  });

  it('rejects unreadable backend events for authoritative confirmation', () => {
    const mapped = mapGoogleBackendEventToVerified({
      id: 'evt-1',
      summary: 'Dinner',
      startsAt: 'not-a-date',
      endsAt: 'also-not-a-date',
    });

    assert.equal(isReadableVerifiedCalendarEvent(mapped), false);
  });
});
