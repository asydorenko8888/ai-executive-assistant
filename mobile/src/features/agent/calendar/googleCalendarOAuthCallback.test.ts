import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  GOOGLE_CALENDAR_WEB_CALLBACK_PATH,
  GOOGLE_CALENDAR_WEB_CALLBACK_ROUTE,
} from '@/src/features/agent/calendar/googleCalendarOAuthRoutes';

describe('Google Calendar OAuth callback route', () => {
  it('uses the /google-calendar-callback path expected by Google redirect URIs', () => {
    assert.equal(GOOGLE_CALENDAR_WEB_CALLBACK_PATH, 'google-calendar-callback');
    assert.equal(GOOGLE_CALENDAR_WEB_CALLBACK_ROUTE, '/google-calendar-callback');
  });
});
