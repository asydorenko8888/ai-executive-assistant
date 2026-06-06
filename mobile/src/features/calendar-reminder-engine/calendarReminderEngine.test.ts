import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { CalendarEvent } from '@/src/entities/calendar/types';
import { buildCalendarReminderAnnouncement } from '@/src/features/calendar-reminder-engine/calendarReminderAnnouncement';
import { buildCalendarReminderDedupeKey } from '@/src/features/calendar-reminder-engine/calendarReminderDedupStorage';
import {
  findCalendarRemindersDue,
  isCalendarReminderDue,
} from '@/src/features/calendar-reminder-engine/scanCalendarReminders';

function event(id: string, title: string, startsAt: string): CalendarEvent {
  return {
    id,
    title,
    startsAt,
    endsAt: startsAt,
    isAllDay: false,
  };
}

describe('calendar reminder engine', () => {
  it('builds Ukrainian 30-minute announcement', () => {
    const message = buildCalendarReminderAnnouncement({
      eventTitle: 'Масаж',
      locale: 'uk',
    });

    assert.equal(message, 'Через 30 хвилин у вас подія: Масаж.');
  });

  it('builds Russian announcement', () => {
    const message = buildCalendarReminderAnnouncement({
      eventTitle: 'Массаж',
      locale: 'ru',
    });

    assert.equal(message, 'Через 30 минут у вас событие: Массаж.');
  });

  it('fires only when an event is exactly 30 minutes away', () => {
    const referenceNow = new Date('2026-06-02T12:30:00-05:00');
    const massage = event('massage', 'Масаж', '2026-06-02T13:00:00-05:00');

    assert.equal(isCalendarReminderDue(30), true);
    assert.equal(isCalendarReminderDue(29), false);
    assert.equal(isCalendarReminderDue(31), false);

    const due = findCalendarRemindersDue({
      events: [massage],
      referenceNow,
      announcedKeys: new Set(),
    });

    assert.equal(due.length, 1);
    assert.equal(due[0]!.event.title, 'Масаж');
    assert.equal(due[0]!.minutesUntilStart, 30);
  });

  it('does not repeat the same event reminder', () => {
    const referenceNow = new Date('2026-06-02T12:30:00-05:00');
    const massage = event('massage', 'Масаж', '2026-06-02T13:00:00-05:00');
    const dedupeKey = buildCalendarReminderDedupeKey(massage.id, massage.startsAt, 30);

    const due = findCalendarRemindersDue({
      events: [massage],
      referenceNow,
      announcedKeys: new Set([dedupeKey]),
    });

    assert.equal(due.length, 0);
  });

  it('ignores all-day and past events', () => {
    const referenceNow = new Date('2026-06-02T12:30:00-05:00');

    const due = findCalendarRemindersDue({
      events: [
        event('all-day', 'Holiday', '2026-06-02'),
        event('past', 'Breakfast', '2026-06-02T08:00:00-05:00'),
        event('later', 'Call', '2026-06-02T14:00:00-05:00'),
      ],
      referenceNow,
      announcedKeys: new Set(),
    });

    assert.equal(due.length, 0);
  });
});
