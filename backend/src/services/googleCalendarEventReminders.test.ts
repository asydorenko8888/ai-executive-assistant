import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  attachGoogleCalendarEventReminders,
  CALENDAR_EVENT_REMINDER_MINUTES,
  GOOGLE_CALENDAR_EVENT_REMINDERS,
} from './googleCalendarEventReminders.js';

describe('googleCalendarEventReminders', () => {
  it('attaches popup reminder 30 minutes before start', () => {
    const body = attachGoogleCalendarEventReminders({
      summary: 'Масаж',
      start: { dateTime: '2026-06-03T15:00:00-05:00', timeZone: 'America/Chicago' },
      end: { dateTime: '2026-06-03T16:00:00-05:00', timeZone: 'America/Chicago' },
    });

    assert.deepEqual(body.reminders, GOOGLE_CALENDAR_EVENT_REMINDERS);
    assert.equal(CALENDAR_EVENT_REMINDER_MINUTES, 30);
    assert.equal(body.reminders.useDefault, false);
    assert.deepEqual(body.reminders.overrides, [{ method: 'popup', minutes: 30 }]);
  });
});
