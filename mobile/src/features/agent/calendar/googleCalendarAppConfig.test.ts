import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildGoogleCalendarAndroidIntentFilters,
  resolveGoogleCalendarAndroidOAuthScheme,
} from '@/src/features/agent/calendar/googleCalendarAppConfig';

const SAMPLE_ANDROID_CLIENT_ID =
  '1060047767043-vuj1a22khlukcqgt69t4gt22srb002kt.apps.googleusercontent.com';

describe('google calendar app config', () => {
  it('resolves the Google Android OAuth scheme from the Android client ID', () => {
    assert.equal(
      resolveGoogleCalendarAndroidOAuthScheme(SAMPLE_ANDROID_CLIENT_ID),
      'com.googleusercontent.apps.1060047767043-vuj1a22khlukcqgt69t4gt22srb002kt',
    );
  });

  it('builds an Android intent filter with oauth2redirect path (not host)', () => {
    const filters = buildGoogleCalendarAndroidIntentFilters(SAMPLE_ANDROID_CLIENT_ID);

    assert.equal(filters.length, 1);
    assert.equal(filters[0]?.action, 'VIEW');
    assert.deepEqual(filters[0]?.data, [
      {
        scheme: 'com.googleusercontent.apps.1060047767043-vuj1a22khlukcqgt69t4gt22srb002kt',
        path: '/oauth2redirect',
      },
    ]);
    assert.deepEqual(filters[0]?.category, ['BROWSABLE', 'DEFAULT']);
  });
});
