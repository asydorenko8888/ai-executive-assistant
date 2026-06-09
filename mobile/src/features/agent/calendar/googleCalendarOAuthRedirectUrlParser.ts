import * as Linking from 'expo-linking';
import * as QueryParams from 'expo-auth-session/build/QueryParams';

import type { GoogleCalendarOAuthRedirectCallbackParams } from '@/src/features/agent/calendar/googleCalendarAuth';

const NESTED_URL_PARAM_KEYS = [
  'url',
  'returnUrl',
  'return_url',
  'redirect',
  'redirect_uri',
  'authUrl',
  'auth_url',
  'callback_url',
  'callbackUrl',
] as const;

const OAUTH_PARAM_KEYS = ['code', 'state', 'error', 'error_description'] as const;

export type OAuthCallbackParseDiagnostics = {
  sourceUrl: string;
  candidateUrls: string[];
  paramLayers: Record<string, string>[];
  mergedParams: Record<string, string>;
  oauthParams: GoogleCalendarOAuthRedirectCallbackParams;
};

function safeDecodeURIComponent(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function readTrimmedParam(
  params: Record<string, string>,
  key: (typeof OAUTH_PARAM_KEYS)[number],
) {
  const value = params[key]?.trim();
  return value || null;
}

function looksLikeUrl(value: string) {
  return (
    /^https?:\/\//i.test(value) ||
    /^exp:\/\//i.test(value) ||
    value.includes('oauthredirect') ||
    value.includes('://')
  );
}

function expandNestedCallbackUrls(seedUrl: string, maxDepth = 8) {
  const candidateUrls: string[] = [];
  const visited = new Set<string>();
  const queue: Array<{ url: string; depth: number }> = [{ url: seedUrl, depth: 0 }];

  while (queue.length > 0) {
    const current = queue.shift();

    if (!current || visited.has(current.url)) {
      continue;
    }

    visited.add(current.url);
    candidateUrls.push(current.url);

    if (current.depth >= maxDepth) {
      continue;
    }

    const { params } = QueryParams.getQueryParams(current.url);

    for (const key of NESTED_URL_PARAM_KEYS) {
      const rawValue = params[key];

      if (!rawValue) {
        continue;
      }

      const decodedCandidates = [
        rawValue,
        safeDecodeURIComponent(rawValue),
        safeDecodeURIComponent(safeDecodeURIComponent(rawValue)),
      ];

      for (const candidate of decodedCandidates) {
        if (!candidate || visited.has(candidate) || !looksLikeUrl(candidate)) {
          continue;
        }

        queue.push({ url: candidate, depth: current.depth + 1 });
      }
    }
  }

  return candidateUrls;
}

function collectParamLayers(candidateUrls: string[]) {
  const layers: Record<string, string>[] = [];

  for (const candidateUrl of candidateUrls) {
    const { params } = QueryParams.getQueryParams(candidateUrl);
    layers.push(params);
  }

  return layers;
}

function mergeOAuthParamsFromLayers(
  layers: Record<string, string>[],
): GoogleCalendarOAuthRedirectCallbackParams {
  let code: string | null = null;
  let state: string | null = null;
  let error: string | null = null;

  for (const layer of layers) {
    if (!code) {
      code = readTrimmedParam(layer, 'code');
    }

    if (!state) {
      state = readTrimmedParam(layer, 'state');
    }

    if (!error) {
      error = readTrimmedParam(layer, 'error');
    }
  }

  return { code, state, error };
}

function mergeAllParams(layers: Record<string, string>[]) {
  return layers.reduce<Record<string, string>>((merged, layer) => {
    return { ...merged, ...layer };
  }, {});
}

export function parseGoogleCalendarOAuthRedirectCallbackUrl(
  sourceUrl: string,
): OAuthCallbackParseDiagnostics {
  console.log('OAUTH_CALLBACK_FULL_URL', sourceUrl);

  const candidateUrls = expandNestedCallbackUrls(sourceUrl);
  const paramLayers = collectParamLayers(candidateUrls);
  const mergedParams = mergeAllParams(paramLayers);
  const oauthParams = mergeOAuthParamsFromLayers(paramLayers);

  console.log(
    'OAUTH_CALLBACK_PARAMS',
    JSON.stringify({
      candidateUrls,
      paramLayers,
      mergedParams,
      oauthParams,
    }),
  );

  if (!oauthParams.code && !oauthParams.error) {
    console.log('OAUTH_CALLBACK_MISSING_CODE', sourceUrl);
  }

  return {
    sourceUrl,
    candidateUrls,
    paramLayers,
    mergedParams,
    oauthParams,
  };
}

export function parseGoogleCalendarOAuthRedirectCallbackFromRouterParams(
  searchParams: Record<string, string | string[] | undefined>,
) {
  const read = (key: string) => {
    const value = searchParams[key];

    if (typeof value === 'string') {
      return value;
    }

    if (Array.isArray(value) && typeof value[0] === 'string') {
      return value[0];
    }

    return null;
  };

  const routerParams: GoogleCalendarOAuthRedirectCallbackParams = {
    code: read('code'),
    state: read('state'),
    error: read('error'),
  };

  const query = new URLSearchParams();

  if (routerParams.code) {
    query.set('code', routerParams.code);
  }

  if (routerParams.state) {
    query.set('state', routerParams.state);
  }

  if (routerParams.error) {
    query.set('error', routerParams.error);
  }

  const syntheticUrl = `oauthredirect://callback?${query.toString()}`;

  if (routerParams.code || routerParams.error) {
    console.log('OAUTH_CALLBACK_FULL_URL', syntheticUrl);
    console.log(
      'OAUTH_CALLBACK_PARAMS',
      JSON.stringify({
        source: 'expo-router-search-params',
        routerParams,
        mergedParams: Object.fromEntries(query.entries()),
        oauthParams: routerParams,
      }),
    );

    return {
      sourceUrl: syntheticUrl,
      candidateUrls: [syntheticUrl],
      paramLayers: [Object.fromEntries(query.entries())],
      mergedParams: Object.fromEntries(query.entries()),
      oauthParams: routerParams,
    } satisfies OAuthCallbackParseDiagnostics;
  }

  return null;
}

export async function resolveGoogleCalendarOAuthRedirectCallback(
  searchParams: Record<string, string | string[] | undefined> = {},
) {
  const fromRouter = parseGoogleCalendarOAuthRedirectCallbackFromRouterParams(searchParams);

  if (fromRouter?.oauthParams.code || fromRouter?.oauthParams.error) {
    return fromRouter;
  }

  const candidateUrls = [await Linking.getInitialURL(), Linking.getLinkingURL()].filter(
    Boolean,
  ) as string[];

  for (const candidateUrl of candidateUrls) {
    const parsed = parseGoogleCalendarOAuthRedirectCallbackUrl(candidateUrl);

    if (parsed.oauthParams.code || parsed.oauthParams.error) {
      return parsed;
    }
  }

  if (fromRouter) {
    return fromRouter;
  }

  const fallbackUrl = candidateUrls[0] ?? 'oauthredirect://callback';

  return parseGoogleCalendarOAuthRedirectCallbackUrl(fallbackUrl);
}
