import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { CalendarEvent } from '@/src/entities/calendar/types';
import {
  computeDurationUntilMinutes,
  formatDurationUntil,
} from '@/src/features/agent/calendar/calendarDurationUntil';
import { resolveTimeUntilTargetEvent } from '@/src/features/agent/calendar/calendarTimeUntilQuery';

function chicagoReference(hour: number, minute: number) {
  return new Date(`2026-06-02T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00-05:00`);
}

function lunchEvent(startHour: number, startMinute = 0): CalendarEvent {
  return {
    id: `lunch-${startHour}`,
    title: 'Обед',
    startsAt: `2026-06-02T${String(startHour).padStart(2, '0')}:${String(startMinute).padStart(2, '0')}:00-05:00`,
    endsAt: `2026-06-02T${String(startHour + 1).padStart(2, '0')}:${String(startMinute).padStart(2, '0')}:00-05:00`,
    isAllDay: false,
  };
}

describe('formatDurationUntil', () => {
  const referenceNow = chicagoReference(11, 40);

  it('11:40 -> 14:00 = 2 hours 20 minutes (RU)', () => {
    const targetStart = chicagoReference(14, 0);
    const result = formatDurationUntil(targetStart, referenceNow, 'ru');

    assert.equal(computeDurationUntilMinutes(targetStart, referenceNow), 140);
    assert.equal(result.formattedDuration, '2 часа 20 минут');
    assert.equal(result.isPast, false);
    assert.equal(result.isNow, false);
  });

  it('11:40 -> 13:00 = 1 hour 20 minutes (RU)', () => {
    const targetStart = chicagoReference(13, 0);
    const result = formatDurationUntil(targetStart, referenceNow, 'ru');

    assert.equal(computeDurationUntilMinutes(targetStart, referenceNow), 80);
    assert.equal(result.formattedDuration, '1 час 20 минут');
  });

  it('11:40 -> 11:55 = 15 minutes (RU)', () => {
    const targetStart = chicagoReference(11, 55);
    const result = formatDurationUntil(targetStart, referenceNow, 'ru');

    assert.equal(result.formattedDuration, '15 минут');
  });

  it('11:40 -> 11:40 = right now (RU)', () => {
    const result = formatDurationUntil(referenceNow, referenceNow, 'ru');

    assert.equal(result.isNow, true);
    assert.equal(result.formattedDuration, 'прямо сейчас');
  });

  it('EN: how long until lunch at 14:00 from 11:40', () => {
    const result = formatDurationUntil(chicagoReference(14, 0), referenceNow, 'en');

    assert.equal(result.formattedDuration, '2 hours 20 minutes');
  });

  it('UK: time until lunch at 14:00 from 11:40', () => {
    const result = formatDurationUntil(chicagoReference(14, 0), referenceNow, 'uk');

    assert.equal(result.formattedDuration, '2 години 20 хвилин');
  });
});

describe('calendar time-until lunch regression', () => {
  const referenceNow = chicagoReference(11, 40);

  it('RU: сколько у меня времени до обеда with lunch at 14:00', () => {
    const event = resolveTimeUntilTargetEvent({
      transcript: 'сколько у меня времени до обеда',
      events: [lunchEvent(14)],
      referenceNow,
    });

    assert.equal(event?.startsAt, lunchEvent(14).startsAt);

    const duration = formatDurationUntil(
      new Date(event!.startsAt),
      referenceNow,
      'ru',
    );

    assert.equal(duration.formattedDuration, '2 часа 20 минут');
  });

  it('RU: lunch at 13:00 returns 1 час 20 минут', () => {
    const event = resolveTimeUntilTargetEvent({
      transcript: 'сколько времени до обеда',
      events: [lunchEvent(13)],
      referenceNow,
    });

    const duration = formatDurationUntil(new Date(event!.startsAt), referenceNow, 'ru');

    assert.equal(duration.formattedDuration, '1 час 20 минут');
  });

  it('EN: how long until lunch', () => {
    const event = resolveTimeUntilTargetEvent({
      transcript: 'how long until lunch',
      events: [{ ...lunchEvent(14), title: 'Lunch' }],
      referenceNow,
    });

    assert.ok(event);
    const duration = formatDurationUntil(new Date(event!.startsAt), referenceNow, 'en');

    assert.equal(duration.formattedDuration, '2 hours 20 minutes');
  });

  it('UK: скільки часу до обіду', () => {
    const event = resolveTimeUntilTargetEvent({
      transcript: 'скільки часу до обіду',
      events: [{ ...lunchEvent(14), title: 'Обід' }],
      referenceNow,
    });

    assert.ok(event);
    const duration = formatDurationUntil(new Date(event!.startsAt), referenceNow, 'uk');

    assert.equal(duration.formattedDuration, '2 години 20 хвилин');
  });

  it('picks nearest upcoming lunch when several titled Обед exist', () => {
    const event = resolveTimeUntilTargetEvent({
      transcript: 'сколько у меня времени до обеда',
      events: [lunchEvent(13), lunchEvent(14)],
      referenceNow,
    });

    assert.equal(event?.id, lunchEvent(13).id);
  });
});
