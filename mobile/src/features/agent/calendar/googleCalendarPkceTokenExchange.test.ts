import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildGooglePkceTokenExchangeBody } from '@/src/features/agent/calendar/googleCalendarPkceTokenExchangeBody';

describe('googleCalendarPkceTokenExchange', () => {
  it('builds a PKCE token exchange body without client_secret', () => {
    const body = buildGooglePkceTokenExchangeBody({
      clientId: 'web-client-id',
      code: 'auth-code',
      redirectUri: 'https://auth.expo.io/@andriysydorenko/mobile',
      codeVerifier: 'pkce-verifier-value',
    });

    assert.equal(body.get('grant_type'), 'authorization_code');
    assert.equal(body.get('client_id'), 'web-client-id');
    assert.equal(body.get('code'), 'auth-code');
    assert.equal(
      body.get('redirect_uri'),
      'https://auth.expo.io/@andriysydorenko/mobile',
    );
    assert.equal(body.get('code_verifier'), 'pkce-verifier-value');
    assert.equal(body.get('client_secret'), null);
  });

  it('rejects an empty PKCE code verifier', () => {
    assert.throws(
      () =>
        buildGooglePkceTokenExchangeBody({
          clientId: 'web-client-id',
          code: 'auth-code',
          redirectUri: 'https://auth.expo.io/@andriysydorenko/mobile',
          codeVerifier: '   ',
        }),
      /PKCE code verifier is missing/,
    );
  });
});
