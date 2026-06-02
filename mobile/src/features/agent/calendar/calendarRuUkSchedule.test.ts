import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { CalendarEvent } from '@/src/entities/calendar/types';
import { parseCalendarCreateSchedule } from '@/src/features/agent/calendar/calendarCreateScheduleParser';
import {
  recordModifiedConversationEvent,
  resetConversationEventMemory,
} from '@/src/features/agent/calendar/calendarConversationEventMemory';
import { formatCalendarScheduleLabelForUi } from '@/src/features/agent/calendar/calendarScheduleDisplay';
import { extractCalendarUpdateParameters } from '@/src/features/agent/calendar/calendarUpdateIntentExtractor';
import {
  parseCalendarUpdateSchedule,
  resolveUpdateTargetMs,
} from '@/src/features/agent/calendar/calendarUpdateScheduleParser';
import { getExecutiveCalendarTimezone, getZonedTimeParts } from '@/src/features/agent/calendar/calendarTimezone';
import { buildCalendarUpdateEventPayload } from '@/src/features/agent/execution/calendarUpdatePayloadBuilder';

const timeZone = 'America/Chicago';
const referenceNow = new Date('2026-05-28T10:00:00-05:00');

function tomorrowAt(hour: number, minute = 0): CalendarEvent {
  const pad = (value: number) => String(value).padStart(2, '0');
  const start = `2026-05-29T${pad(hour)}:${pad(minute)}:00-05:00`;
  const end = `2026-05-29T${pad(hour + 1)}:${pad(minute)}:00-05:00`;

  return {
    id: 'dentist-1',
    title: 'Стоматолог',
    startsAt: start,
    endsAt: end,
    isAllDay: false,
  };
}

function zonedHourMinute(ms: number) {
  const parts = getZonedTimeParts(new Date(ms), timeZone);

  return { hour: parts.hour, minute: parts.minute };
}

describe('RU/UK calendar schedule display and relative moves', () => {
  it('create dentist tomorrow 13:00 stores ISO and displays завтра, 13:00', () => {
    const transcript = 'Добавь стоматолога завтра в 13:00';
    const schedule = parseCalendarCreateSchedule(transcript, referenceNow, timeZone);

    assert.equal(schedule.ok, true);

    if (!schedule.ok) {
      return;
    }

    const resolved = zonedHourMinute(schedule.startMs);
    assert.equal(resolved.hour, 13);
    assert.equal(resolved.minute, 0);

    const displayLabel = formatCalendarScheduleLabelForUi({
      instantMs: schedule.startMs,
      referenceMs: referenceNow.getTime(),
      locale: 'ru',
      timeZone,
    });

    assert.equal(displayLabel, 'завтра, 13:00');
    assert.doesNotMatch(displayLabel, /1 дня|3 ночи|утра|вечера/i);
  });

  it('move "на 3:00 позже" adds 3 hours to tomorrow 13:00 -> 16:00', () => {
    resetConversationEventMemory('test');
    const event = tomorrowAt(13, 0);

    recordModifiedConversationEvent({
      eventId: event.id,
      title: event.title,
      startISO: event.startsAt,
      endISO: event.endsAt,
    });

    const transcript = 'Перенеси его на 3:00 позже';
    const schedule = parseCalendarUpdateSchedule(transcript, referenceNow, timeZone);

    assert.equal(schedule.ok, true);

    if (!schedule.ok) {
      return;
    }

    assert.equal(schedule.kind, 'relative_offset');
    assert.equal(schedule.offsetMs, 3 * 60 * 60_000);
    assert.equal(schedule.direction, 'later');

    const startMs = Date.parse(event.startsAt);
    const toMs = resolveUpdateTargetMs({
      schedule,
      matchedEventStartMs: startMs,
      referenceNow,
      timeZone,
    });

    assert.ok(toMs);
    assert.equal(zonedHourMinute(toMs!).hour, 16);
    assert.equal(zonedHourMinute(toMs!).minute, 0);

    const extracted = extractCalendarUpdateParameters(transcript, referenceNow);
    assert.equal(extracted.readyToExecute, true);
    assert.equal(extracted.toTime, '16:00');
    assert.equal(Date.parse(extracted.toStartISO ?? ''), toMs);

    const payload = buildCalendarUpdateEventPayload({
      transcript,
      languageCode: 'ru-RU',
      referenceNow,
      matchedEvent: event,
    });

    assert.equal(payload.ok, true);

    if (!payload.ok) {
      return;
    }

    assert.equal(zonedHourMinute(payload.toMs).hour, 16);

    const displayLabel = formatCalendarScheduleLabelForUi({
      instantMs: toMs!,
      referenceMs: referenceNow.getTime(),
      locale: 'ru',
      timeZone,
    });

    assert.equal(displayLabel, 'завтра, 16:00');
    assert.doesNotMatch(displayLabel, /1 дня|3 ночи|утра|вечера/i);
  });

  it('move "на 2 часа раньше" from 16:00 -> 14:00', () => {
    const event = tomorrowAt(16, 0);
    const schedule = parseCalendarUpdateSchedule('Перенеси его на 2 часа раньше', referenceNow, timeZone);

    assert.equal(schedule.ok, true);

    if (!schedule.ok) {
      return;
    }

    const toMs = resolveUpdateTargetMs({
      schedule,
      matchedEventStartMs: Date.parse(event.startsAt),
      referenceNow,
      timeZone,
    });

    assert.ok(toMs);
    assert.equal(zonedHourMinute(toMs!).hour, 14);

    const label = formatCalendarScheduleLabelForUi({
      instantMs: toMs!,
      referenceMs: referenceNow.getTime(),
      locale: 'ru',
      timeZone,
    });

    assert.equal(label, 'завтра, 14:00');
    assert.doesNotMatch(label, /дня|ночи|утра/i);
  });

  it('absolute "на 15:00" is destination, not relative offset', () => {
    const schedule = parseCalendarUpdateSchedule('Перенеси его на 15:00', referenceNow, timeZone);

    assert.equal(schedule.ok, true);

    if (!schedule.ok) {
      return;
    }

    assert.equal(schedule.kind, 'destination');
    assert.equal(schedule.toMinutes, 15 * 60);
  });

  it('absolute "в 3 дня" resolves to 15:00', () => {
    const schedule = parseCalendarUpdateSchedule('Перенеси его в 3 дня', referenceNow, timeZone);

    assert.equal(schedule.ok, true);

    if (!schedule.ok) {
      return;
    }

    assert.equal(schedule.kind, 'destination');
    assert.equal(schedule.toMinutes, 15 * 60);
  });
});
