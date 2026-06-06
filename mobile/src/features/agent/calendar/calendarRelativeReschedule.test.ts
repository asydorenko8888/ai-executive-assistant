import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { CalendarEvent } from '@/src/entities/calendar/types';
import { detectCalendarCommandIntent } from '@/src/features/agent/calendar/calendarCommandTypes';
import {
  extractCalendarUpdateParameters,
  isBareRelativeRescheduleRequest,
} from '@/src/features/agent/calendar/calendarUpdateIntentExtractor';
import { resolveCalendarUpdateIntent } from '@/src/features/agent/calendar/calendarUpdateEventResolution';
import { buildCalendarUpdatePayloadFromResolution } from '@/src/features/agent/execution/calendarUpdatePayloadBuilder';
import { buildCalendarUpdateVerificationFailedReply } from '@/src/features/agent/calendar/calendarUpdateNaturalReplies';
import { buildNaturalCalendarUpdateSuccessReply } from '@/src/features/agent/execution/calendarUpdateSuccessReply';
import {
  recordModifiedConversationEvent,
  resetConversationEventMemory,
} from '@/src/features/agent/calendar/calendarConversationEventMemory';
import { getZonedTimeParts } from '@/src/features/agent/calendar/calendarTimezone';
import { isOperationalCalendarUpdateRequest } from '@/src/features/agent/intent/operationalCalendarWriteDetection';
import { isVerifiedCalendarUpdateSuccess } from '@/src/features/agent/calendar/calendarExecutionContract';

const timeZone = 'America/Chicago';
const referenceNow = new Date('2026-05-28T18:19:00-05:00');

function chicagoEvent(
  id: string,
  title: string,
  hour: number,
  minute = 0,
  durationMinutes = 60,
): CalendarEvent {
  const pad = (value: number) => String(value).padStart(2, '0');
  const startsAt = `2026-05-28T${pad(hour)}:${pad(minute)}:00-05:00`;
  const endDate = new Date(startsAt);
  endDate.setMinutes(endDate.getMinutes() + durationMinutes);

  return {
    id,
    title,
    startsAt,
    endsAt: endDate.toISOString(),
    isAllDay: false,
  };
}

function zonedParts(iso: string) {
  return getZonedTimeParts(new Date(iso), timeZone);
}

describe('calendarRelativeReschedule', () => {
  it('detects bare title + relative shift as update intent', () => {
    const transcript = 'стоматолога на 2 часа раньше';

    assert.equal(isBareRelativeRescheduleRequest(transcript, referenceNow), true);
    assert.equal(isOperationalCalendarUpdateRequest(transcript), true);
    assert.equal(detectCalendarCommandIntent(transcript), 'update_calendar_event');
  });

  it('moves Massage 16:00-17:00 one hour later to 17:00-18:00', () => {
    const massage = chicagoEvent('massage', 'Массаж', 16);
    const resolution = resolveCalendarUpdateIntent({
      transcript: 'перенеси массаж на час позже',
      referenceNow,
      events: [massage],
      timeZone,
    });

    assert.equal(resolution.ok, true);

    if (!resolution.ok) {
      return;
    }

    assert.equal(zonedParts(new Date(resolution.requestedStartMs).toISOString()).hour, 17);
    assert.equal(zonedParts(new Date(resolution.requestedEndMs).toISOString()).hour, 18);

    const payload = buildCalendarUpdatePayloadFromResolution({
      resolution,
      languageCode: 'ru-RU',
    });

    assert.equal(payload.ok, true);

    if (!payload.ok) {
      return;
    }

    assert.match(payload.payload.start.dateTime ?? '', /T17:00:00$/);
    assert.match(payload.payload.end.dateTime ?? '', /T18:00:00$/);
  });

  it('moves Dentist 19:00-20:00 two hours earlier to 17:00-18:00', () => {
    const dentist = chicagoEvent('dentist', 'Стоматолог', 19);
    const resolution = resolveCalendarUpdateIntent({
      transcript: 'перенеси стоматолога на 2 часа раньше',
      referenceNow,
      events: [dentist],
      timeZone,
    });

    assert.equal(resolution.ok, true);

    if (!resolution.ok) {
      return;
    }

    assert.equal(zonedParts(new Date(resolution.requestedStartMs).toISOString()).hour, 17);
    assert.equal(zonedParts(new Date(resolution.requestedEndMs).toISOString()).hour, 18);
  });

  it('does not anchor relative shift to unrelated conversation memory', () => {
    resetConversationEventMemory('test');
    recordModifiedConversationEvent({
      eventId: 'dentist',
      title: 'Стоматолог',
      startISO: '2026-05-28T19:00:00-05:00',
      endISO: '2026-05-28T20:00:00-05:00',
    });

    const extraction = extractCalendarUpdateParameters('перенеси массаж на час позже', referenceNow);

    assert.equal(extraction.title, 'массаж');
    assert.equal(extraction.fromStartISO, null);
    assert.equal(extraction.toStartISO, null);
    assert.equal(extraction.readyToExecute, true);
  });

  it('requires clarification when multiple matching events exist', () => {
    const massage4 = chicagoEvent('massage-4', 'Массаж', 16);
    const massage6 = chicagoEvent('massage-6', 'Массаж', 18);
    const resolution = resolveCalendarUpdateIntent({
      transcript: 'перенеси массаж на час позже',
      referenceNow,
      events: [massage4, massage6],
      timeZone,
    });

    assert.equal(resolution.ok, false);

    if (resolution.ok) {
      return;
    }

    assert.equal(resolution.reason, 'ambiguous');
    assert.equal(resolution.candidates.length, 2);
  });

  it('blocks moved confirmation unless Google Calendar verifies the update', () => {
    const verifiedEvent = {
      id: 'dentist',
      summary: 'Стоматолог',
      startsAt: '2026-05-28T17:00:00-05:00',
      endsAt: '2026-05-28T18:00:00-05:00',
    };
    const verifiedTool = {
      status: 'SUCCESS' as const,
      verified: true,
      verificationFetched: true,
      eventId: 'dentist',
      event: verifiedEvent,
    };
    const unverifiedTool = {
      status: 'FAILURE' as const,
      verified: false,
      verificationFetched: false,
      errorCode: 'VERIFY_FAILED' as const,
      error: 'Google Calendar did not confirm the update.',
    };

    const successReply = buildNaturalCalendarUpdateSuccessReply({
      event: verifiedEvent,
      languageCode: 'ru-RU',
      referenceNow,
      previousStartsAt: '2026-05-28T19:00:00-05:00',
      timeZone,
    });

    assert.equal(isVerifiedCalendarUpdateSuccess(verifiedTool), true);
    assert.match(successReply.reply, /Событие перенесено:/i);
    assert.equal(isVerifiedCalendarUpdateSuccess(unverifiedTool), false);
    assert.equal(
      buildCalendarUpdateVerificationFailedReply('ru'),
      'Не удалось перенести событие. Календарь не подтвердил изменение.',
    );
  });
});
