export type GoogleCalendarOAuthRuntime = 'web' | 'expo_go' | 'native';

export type GoogleCalendarClientIdSources = {
  web: string;
  ios: string;
  android: string;
};

export type GoogleCalendarOAuthPlatform = 'ios' | 'android' | 'web';

export function selectGoogleCalendarOAuthClientId(params: {
  runtime: GoogleCalendarOAuthRuntime;
  platform: GoogleCalendarOAuthPlatform;
  sources: GoogleCalendarClientIdSources;
}): { clientId: string; source: 'web' | 'ios' | 'android' | 'missing' } {
  const { runtime, platform, sources } = params;

  if (runtime === 'web' || runtime === 'expo_go') {
    return {
      clientId: sources.web,
      source: sources.web ? 'web' : 'missing',
    };
  }

  if (platform === 'android') {
    return {
      clientId: sources.android,
      source: sources.android ? 'android' : 'missing',
    };
  }

  if (platform === 'ios') {
    return {
      clientId: sources.ios,
      source: sources.ios ? 'ios' : 'missing',
    };
  }

  return {
    clientId: sources.web,
    source: sources.web ? 'web' : 'missing',
  };
}

export function describeGoogleCalendarOAuthRedirectExpectation(runtime: GoogleCalendarOAuthRuntime) {
  if (runtime === 'web') {
    return {
      schemePrefix: 'http',
      pathSegment: 'google-calendar-callback',
    };
  }

  if (runtime === 'expo_go') {
    return {
      schemePrefix: 'https://auth.expo.io/',
      pathSegment: '',
      mustNotUseScheme: 'exp:',
    };
  }

  return {
    schemePrefix: 'mobile:',
    pathSegment: 'oauthredirect',
  };
}
