import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CALENDAR_CONFLICT_REFRESH_MAX_ATTEMPTS } from '@/src/features/agent/calendar/calendarConflictRefreshPolicy';
import {
  appendCalendarCreateConflictCheckSkippedNotice,
  buildCalendarCreateConflictCheckSkippedNotice,
} from '@/src/features/agent/calendar/calendarCreateConflictRefreshNotice';

describe('calendar create conflict refresh policy', () => {
  it('uses three refresh attempts for pre-create conflict checks', () => {
    assert.equal(CALENDAR_CONFLICT_REFRESH_MAX_ATTEMPTS, 3);
  });

  it('uses the required explicit English notice after create without conflict verification', () => {
    assert.equal(
      buildCalendarCreateConflictCheckSkippedNotice('en-US'),
      'Calendar refresh failed. Event was created, but I could not verify conflicts.',
    );
  });

  it('appends the skipped-conflict notice to an existing success reply', () => {
    const merged = appendCalendarCreateConflictCheckSkippedNotice({
      reply: 'Event created successfully:\nTitle: Massage\nTime: Today, 9:00 PM',
      languageCode: 'en-US',
    });

    assert.match(merged.reply, /Event created successfully/);
    assert.match(
      merged.reply,
      /Calendar refresh failed\. Event was created, but I could not verify conflicts\./,
    );
    assert.match(
      merged.spokenReply,
      /Calendar refresh failed\. Event was created, but I could not verify conflicts\./,
    );
  });
});
