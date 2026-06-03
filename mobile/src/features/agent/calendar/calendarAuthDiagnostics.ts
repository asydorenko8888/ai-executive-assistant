export function logCalendarTokenExpiration(params: {
  expiresAt?: string | null;
  connectedEmail?: string | null;
  source: string;
}) {
  const expiresAtMs = params.expiresAt ? Date.parse(params.expiresAt) : NaN;
  const msUntilExpiry = Number.isFinite(expiresAtMs) ? expiresAtMs - Date.now() : null;

  console.log('[Calendar Auth] token expiration', {
    source: params.source,
    connectedEmail: params.connectedEmail ?? null,
    expiresAt: params.expiresAt ?? null,
    msUntilExpiry,
    isExpired: msUntilExpiry !== null ? msUntilExpiry <= 60_000 : null,
  });
}

export function logCalendarTokenRefreshAttempt(params: {
  source: string;
  hasRefreshToken: boolean;
  attempt: number;
}) {
  console.log('[Calendar Auth] refresh attempt', params);
}

export function logCalendarTokenRefreshResult(params: {
  source: string;
  success: boolean;
  expiresAt?: string | null;
  detail?: string;
}) {
  console.log('[Calendar Auth] refresh result', params);
}

export function logCalendarAuthStateCleared(params: { source: string; reason: string }) {
  console.log('[Calendar Auth] auth state cleared', params);
}

export function logCalendarApiError(params: {
  operation: string;
  status?: number;
  code?: string | null;
  message?: string;
  willRetryRefresh?: boolean;
}) {
  console.log('[Calendar Auth] api error', params);
}
