import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildGooglePkceTokenExchangeBody } from '@/src/features/agent/calendar/googleCalendarPkceTokenExchangeBody';

describe('googleCalendarNativeOAuthPending PKCE payload', () => {
  it('requires code_verifier in token exchange body used after oauthredirect restore', () => {
    const body = buildGooglePkceTokenExchangeBody({
      clientId: 'web-client-id',
      code: 'auth-code',
      redirectUri: 'https://auth.expo.io/@andriysydorenko/mobile',
      codeVerifier: 'restored-verifier-1234567890',
    });

    assert.equal(body.get('code_verifier'), 'restored-verifier-1234567890');
    assert.equal(body.get('client_secret'), null);
  });
});
