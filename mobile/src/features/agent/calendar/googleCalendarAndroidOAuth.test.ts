import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildGoogleAndroidOAuthRedirectScheme,
  buildGoogleAndroidOAuthRedirectUri,
  GOOGLE_CALENDAR_ANDROID_PACKAGE_NAME,
} from '@/src/features/agent/calendar/googleCalendarAndroidOAuthConfig';

const SAMPLE_ANDROID_CLIENT_ID =
  '1060047767043-94c1553d7po1eh14fs6u7q2f8lmbr2so.apps.googleusercontent.com';

describe('google calendar android oauth', () => {
  it('uses the project android package name', () => {
    assert.equal(GOOGLE_CALENDAR_ANDROID_PACKAGE_NAME, 'com.aiexecutiveassistant.mobile');
  });

  it('builds the Google Android reverse-client-id redirect uri', () => {
    assert.equal(
      buildGoogleAndroidOAuthRedirectUri(SAMPLE_ANDROID_CLIENT_ID),
      'com.googleusercontent.apps.1060047767043-94c1553d7po1eh14fs6u7q2f8lmbr2so:/oauth2redirect',
    );
  });

  it('builds the android intent-filter scheme', () => {
    assert.equal(
      buildGoogleAndroidOAuthRedirectScheme(SAMPLE_ANDROID_CLIENT_ID),
      'com.googleusercontent.apps.1060047767043-94c1553d7po1eh14fs6u7q2f8lmbr2so',
    );
  });
});
