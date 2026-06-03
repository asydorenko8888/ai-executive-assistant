import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  classifyCalendarApiOperationError,
  isConfirmedCalendarAuthFailure,
  isTransientCalendarApiError,
  isTransientCalendarToolErrorCode,
} from '@/src/features/agent/calendar/calendarApiErrorClassification';
import { buildCalendarApiUnavailableReply } from '@/src/features/agent/calendar/calendarAuthUserReplies';
import { mapCaughtCalendarApiError } from '@/src/features/agent/calendar/calendarApiToolErrorMapper';
import { ApiError } from '@/src/shared/api/api-error';

describe('calendar API stability', () => {
  it('treats 503 as transient but not invalid_grant', () => {
    assert.equal(
      isTransientCalendarApiError(new ApiError({ message: 'upstream', status: 503, retryable: true })),
      true,
    );
    assert.equal(
      isConfirmedCalendarAuthFailure(
        new ApiError({ message: 'invalid_grant', status: 401, code: 'invalid_grant' }),
      ),
      true,
    );
    assert.equal(
      isConfirmedCalendarAuthFailure(new ApiError({ message: 'Unauthorized', status: 401 })),
      false,
    );
  });

  it('classifies 429 as temporary outage', () => {
    assert.equal(
      classifyCalendarApiOperationError(new ApiError({ message: 'rate limit', status: 429, retryable: true })),
      'temporary',
    );
  });

  it('maps temporary API failures to the required user copy', async () => {
    const tool = await mapCaughtCalendarApiError({
      error: new ApiError({ message: 'timeout', status: 504, retryable: true }),
      languageCode: 'en-US',
      action: 'POST /google-calendar/events',
      calendarChanged: false,
      authSession: {
        hasLocalSession: true,
        hasRefreshToken: true,
        backendConnected: true,
      },
    });

    assert.equal(tool.errorCode, 'CALENDAR_API_UNAVAILABLE');
    assert.equal(
      buildCalendarApiUnavailableReply('en-US'),
      'Google Calendar temporarily did not respond. I did not change your calendar. Please try again.',
    );
  });

  it('allows retry after transient tool failures', () => {
    assert.equal(isTransientCalendarToolErrorCode('CALENDAR_API_UNAVAILABLE'), true);
    assert.equal(isTransientCalendarToolErrorCode('CALENDAR_EVENT_NOT_FOUND'), false);
  });

  it('does not require reconnect for 503 when a refresh token is stored locally', () => {
    const session = {
      hasLocalSession: true,
      hasRefreshToken: true,
      backendConnected: false,
    };
    const error = new ApiError({ message: 'upstream', status: 503, retryable: true });

    assert.equal(classifyCalendarApiOperationError(error, session), 'temporary');
    assert.equal(isConfirmedCalendarAuthFailure(error, session), false);
  });
});
