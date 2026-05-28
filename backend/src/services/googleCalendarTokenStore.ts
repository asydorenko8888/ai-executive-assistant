import {
  deleteSecurePayload,
  readSecurePayload,
  writeSecurePayload,
} from './securePayloadStore.js';
import { refreshGoogleCalendarAccessToken } from './googleOAuthService.js';

const TOKEN_NAMESPACE = 'google-calendar-tokens';

export const CALENDAR_EVENTS_WRITE_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
export const CALENDAR_FULL_SCOPE = 'https://www.googleapis.com/auth/calendar';

export type StoredGoogleCalendarTokens = {
  accessToken: string;
  refreshToken: string;
  tokenType?: string;
  scopes: string[];
  connectedEmail?: string;
  expiresAt: string;
  updatedAt: string;
};

export function scopesIncludeCalendarEventsWrite(scopes: string[]) {
  const joined = scopes.join(' ').toLowerCase();

  return joined.includes(CALENDAR_EVENTS_WRITE_SCOPE.toLowerCase());
}

/** Legacy full calendar scope also grants write. */
export function scopesIncludeCalendarWrite(scopes: string[]) {
  if (scopesIncludeCalendarEventsWrite(scopes)) {
    return true;
  }

  const joined = scopes.join(' ').toLowerCase();

  return joined.includes(CALENDAR_FULL_SCOPE.toLowerCase());
}

export function redactToken(token: string) {
  if (token.length <= 8) {
    return '***';
  }

  return `${token.slice(0, 4)}…${token.slice(-4)}`;
}

export function buildTokenDebugLog(tokens: StoredGoogleCalendarTokens | null) {
  if (!tokens) {
    return {
      connected: false,
      accessToken: null,
      refreshTokenPresent: false,
      scopes: [],
      expiresAt: null,
      connectedEmail: null,
    };
  }

  return {
    connected: true,
    accessToken: redactToken(tokens.accessToken),
    refreshTokenPresent: Boolean(tokens.refreshToken),
    tokenType: tokens.tokenType ?? null,
    scopes: tokens.scopes,
    expiresAt: tokens.expiresAt,
    connectedEmail: tokens.connectedEmail ?? null,
    hasCalendarEventsScope: scopesIncludeCalendarEventsWrite(tokens.scopes),
    hasCalendarWriteScope: scopesIncludeCalendarWrite(tokens.scopes),
  };
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
      writeEnabled: false,
      hasCalendarEventsScope: false,
      connectedEmail: undefined as string | undefined,
      expiresAt: undefined as string | undefined,
      scopes: [] as string[],
    };
  }

  const expiresAtMs = Date.parse(tokens.expiresAt);
  const isExpired = Number.isFinite(expiresAtMs) && expiresAtMs <= Date.now() + 60_000;
  const hasCalendarEventsScope = scopesIncludeCalendarEventsWrite(tokens.scopes);
  const hasWriteAccess = scopesIncludeCalendarWrite(tokens.scopes);

  return {
    connected: !isExpired || Boolean(tokens.refreshToken),
    hasWriteAccess,
    writeEnabled: hasCalendarEventsScope,
    hasCalendarEventsScope,
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
      : [CALENDAR_EVENTS_WRITE_SCOPE, CALENDAR_FULL_SCOPE];

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
