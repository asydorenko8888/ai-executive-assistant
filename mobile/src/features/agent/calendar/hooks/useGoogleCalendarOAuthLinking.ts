import { useEffect } from 'react';

import * as Linking from 'expo-linking';
import { router } from 'expo-router';

import {
  handleGoogleCalendarOAuthRedirectFromUrl,
  urlContainsGoogleCalendarOAuthRedirect,
} from '@/src/features/agent/calendar/googleCalendarOAuthRedirectHandler';
import { isGoogleCalendarEnabled } from '@/src/features/agent/calendar/googleCalendarFeatureFlag';

async function processOAuthLinkingUrl(url: string | null) {
  if (!url) {
    return;
  }

  console.log('OAUTH_LINKING_URL_RECEIVED', url);

  if (!urlContainsGoogleCalendarOAuthRedirect(url)) {
    return;
  }

  router.push('/oauthredirect');

  const result = await handleGoogleCalendarOAuthRedirectFromUrl(url);

  if (result.success) {
    router.replace('/(tabs)');
  }
}

export function useGoogleCalendarOAuthLinking() {
  useEffect(() => {
    if (!isGoogleCalendarEnabled()) {
      return;
    }

    void Linking.getInitialURL().then((url) => processOAuthLinkingUrl(url));

    const subscription = Linking.addEventListener('url', (event) => {
      void processOAuthLinkingUrl(event.url);
    });

    return () => {
      subscription.remove();
    };
  }, []);
}
