import {
  deleteSecurePayload,
  readSecurePayload,
  writeSecurePayload,
} from './securePayloadStore.js';
import { refreshGoogleCalendarAccessToken } from './googleOAuthService.js';

const TOKEN_NAMESPACE = 'google-calendar-tokens';

export type StoredGoogleCalendarTokens = {
  accessToken: string;
  refreshToken: string;
  tokenType?: string;
  scopes: string[];
  connectedEmail?: string;
  expiresAt: string;
  updatedAt: string;
};

const CALENDAR_WRITE_SCOPE_MARKERS = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar',
] as const;

export function scopesIncludeCalendarWrite(scopes: string[]) {
  const joined = scopes.join(' ').toLowerCase();

  return CALENDAR_WRITE_SCOPE_MARKERS.some((scope) => joined.includes(scope.toLowerCase()));
}

export async function saveGoogleCalendarTokens(deviceId: string, tokens: StoredGoogleCalendarTokens) {
  await writeSecurePayload(TOKEN_NAMESPACE, deviceId, tokens);
  return tokens;
}

export async function getGoogleCalendarTokens(deviceId: string) {
  return readSecurePayload<StoredGoogleCalendarTokens>(TOKEN_NAMESPACE, deviceId);
}

export async function clearGoogleCalendarTokens(deviceId: string) {
  await deleteSecurePayload(TOKEN_NAMESPACE, deviceId);
}

export async function getGoogleCalendarConnectionStatus(deviceId: string) {
  const tokens = await getGoogleCalendarTokens(deviceId);

  if (!tokens) {
    return {
      connected: false,
      hasWriteAccess: false,
      connectedEmail: undefined as string | undefined,
      expiresAt: undefined as string | undefined,
      scopes: [] as string[],
    };
  }

  const expiresAtMs = Date.parse(tokens.expiresAt);
  const isExpired = Number.isFinite(expiresAtMs) && expiresAtMs <= Date.now() + 60_000;

  return {
    connected: !isExpired || Boolean(tokens.refreshToken),
    hasWriteAccess: scopesIncludeCalendarWrite(tokens.scopes),
    connectedEmail: tokens.connectedEmail,
    expiresAt: tokens.expiresAt,
    scopes: tokens.scopes,
  };
}

export async function getValidGoogleCalendarAccessToken(deviceId: string) {
  const tokens = await getGoogleCalendarTokens(deviceId);

  if (!tokens) {
    return null;
  }

  const expiresAtMs = Date.parse(tokens.expiresAt);

  if (Number.isFinite(expiresAtMs) && expiresAtMs > Date.now() + 60_000) {
    return tokens;
  }

  if (!tokens.refreshToken) {
    return null;
  }

  const refreshed = await refreshGoogleCalendarAccessToken({
    refreshToken: tokens.refreshToken,
  });

  const nextTokens: StoredGoogleCalendarTokens = {
    ...tokens,
    accessToken: refreshed.accessToken,
    refreshToken: refreshed.refreshToken ?? tokens.refreshToken,
    tokenType: refreshed.tokenType ?? tokens.tokenType,
    scopes:
      typeof refreshed.scope === 'string' && refreshed.scope.trim()
        ? refreshed.scope.split(' ')
        : tokens.scopes,
    connectedEmail: refreshed.connectedEmail ?? tokens.connectedEmail,
    expiresAt: new Date(
      Date.now() + (typeof refreshed.expiresIn === 'number' ? refreshed.expiresIn : 3600) * 1000,
    ).toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await saveGoogleCalendarTokens(deviceId, nextTokens);

  return nextTokens;
}

export function buildStoredTokensFromOAuthResult(params: {
  accessToken: string;
  refreshToken?: string;
  tokenType?: string;
  scope?: string;
  expiresIn?: number;
  connectedEmail?: string;
}) {
  const scopes =
    typeof params.scope === 'string' && params.scope.trim()
      ? params.scope.split(' ')
      : [...CALENDAR_WRITE_SCOPE_MARKERS];

  return {
    accessToken: params.accessToken,
    refreshToken: params.refreshToken ?? '',
    tokenType: params.tokenType,
    scopes,
    connectedEmail: params.connectedEmail,
    expiresAt: new Date(
      Date.now() + (typeof params.expiresIn === 'number' ? params.expiresIn : 3600) * 1000,
    ).toISOString(),
    updatedAt: new Date().toISOString(),
  } satisfies StoredGoogleCalendarTokens;
}
