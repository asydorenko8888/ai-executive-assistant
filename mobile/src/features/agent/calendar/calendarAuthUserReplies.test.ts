import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildCalendarAuthRequiredReply,
  buildCalendarToolUserReply,
} from '@/src/features/agent/calendar/calendarAuthUserReplies';

describe('calendar auth user replies', () => {
  it('maps auth required to localized human text', () => {
    const reply = buildCalendarToolUserReply(
      { status: 'PENDING', errorCode: 'CALENDAR_AUTH_REQUIRED' },
      'uk-UA',
    );

    assert.ok(reply);
    assert.doesNotMatch(reply ?? '', /^PENDING:/);
    assert.equal(reply, buildCalendarAuthRequiredReply('uk-UA'));
  });
});
