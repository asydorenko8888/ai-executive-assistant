import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  describeGoogleCalendarOAuthRedirectExpectation,
  selectGoogleCalendarOAuthClientId,
} from '@/src/features/agent/calendar/googleCalendarOAuthPolicy';

describe('google calendar oauth policy', () => {
  it('uses web client id for Expo Go on iPhone', () => {
    const selection = selectGoogleCalendarOAuthClientId({
      runtime: 'expo_go',
      platform: 'ios',
      sources: {
        web: 'web-client-id',
        ios: 'ios-client-id',
        android: '',
      },
    });

    assert.equal(selection.clientId, 'web-client-id');
    assert.equal(selection.source, 'web');
  });

  it('uses ios client id for native ios builds', () => {
    const selection = selectGoogleCalendarOAuthClientId({
      runtime: 'native',
      platform: 'ios',
      sources: {
        web: 'web-client-id',
        ios: 'ios-client-id',
        android: '',
      },
    });

    assert.equal(selection.clientId, 'ios-client-id');
    assert.equal(selection.source, 'ios');
  });

  it('marks missing client id when Expo Go has no web client', () => {
    const selection = selectGoogleCalendarOAuthClientId({
      runtime: 'expo_go',
      platform: 'ios',
      sources: {
        web: '',
        ios: 'ios-client-id',
        android: '',
      },
    });

    assert.equal(selection.clientId, '');
    assert.equal(selection.source, 'missing');
  });

  it('expects auth.expo.io HTTPS proxy redirect for Expo Go', () => {
    const expectation = describeGoogleCalendarOAuthRedirectExpectation('expo_go');

    assert.equal(expectation.schemePrefix, 'https://auth.expo.io/');
    assert.equal(expectation.mustNotUseScheme, 'exp:');
  });

  it('expects mobile:// redirect for native builds', () => {
    const expectation = describeGoogleCalendarOAuthRedirectExpectation('native');

    assert.equal(expectation.schemePrefix, 'mobile:');
    assert.equal(expectation.pathSegment, 'oauthredirect');
  });
});
