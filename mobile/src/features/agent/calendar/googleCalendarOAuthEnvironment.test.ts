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

  it('expects Google Android reverse-client-id redirect for native builds', () => {
    const expectation = describeGoogleCalendarOAuthRedirectExpectation('native');

    assert.equal(expectation.schemePrefix, 'com.googleusercontent.apps.');
    assert.equal(expectation.pathSegment, 'oauth2redirect');
  });

  it('requires android client id on native android', () => {
    const selection = selectGoogleCalendarOAuthClientId({
      runtime: 'native',
      platform: 'android',
      sources: {
        web: 'web-client-id',
        ios: '',
        android: '',
      },
    });

    assert.equal(selection.clientId, '');
    assert.equal(selection.source, 'missing');
  });

  it('uses android client id on native android when configured', () => {
    const selection = selectGoogleCalendarOAuthClientId({
      runtime: 'native',
      platform: 'android',
      sources: {
        web: 'web-client-id',
        ios: '',
        android: '1060047767043-example.apps.googleusercontent.com',
      },
    });

    assert.equal(selection.clientId, '1060047767043-example.apps.googleusercontent.com');
    assert.equal(selection.source, 'android');
  });
});
