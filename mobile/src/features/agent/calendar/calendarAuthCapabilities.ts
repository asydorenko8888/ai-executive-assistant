import type { CalendarConnection } from '@/src/entities/calendar/types';
import {
  fetchGoogleCalendarBackendStatus,
  syncGoogleCalendarSessionToBackend,
  type GoogleCalendarBackendStatus,
} from '@/src/features/agent/calendar/googleCalendarBackendApi';
import { scopesIncludeCalendarEventsWrite } from '@/src/features/agent/calendar/googleCalendarScopes';
import { isCalendarWriteAvailableInSession } from '@/src/features/agent/calendar/calendarWriteSession';
import {
  loadGoogleCalendarSession,
  type GoogleCalendarSession,
} from '@/src/features/agent/calendar/googleCalendarStorage';
import { getCachedExecutiveDeviceId, ensureExecutiveDeviceId } from '@/src/shared/device/executiveDeviceSession';
import { env } from '@/src/shared/config';

export type CalendarAuthCapabilities = {
  deviceIdPreview: string;
  localConnected: boolean;
  backendConnected: boolean;
  canReadCalendar: boolean;
  canWriteCalendar: boolean;
  inSync: boolean;
  scopes: string[];
  connectedEmail?: string;
  connection: CalendarConnection;
  backendStatus: GoogleCalendarBackendStatus | null;
  localSession: GoogleCalendarSession | null;
  desyncReason?: string;
  healed?: boolean;
};

let cachedCapabilities: CalendarAuthCapabilities | null = null;
let cacheExpiresAt = 0;
const CACHE_TTL_MS = 4_000;

export function invalidateCalendarAuthCache() {
  cachedCapabilities = null;
  cacheExpiresAt = 0;
}

function buildConnection(params: {
  canReadCalendar: boolean;
  canWriteCalendar: boolean;
  connectedEmail?: string;
  expiresAt?: string;
  connectedAt?: string;
  localSession: GoogleCalendarSession | null;
  clientIdMissing: boolean;
}): CalendarConnection {
  if (params.clientIdMissing) {
    return { provider: 'google', status: 'missing_config' };
  }

  if (params.canReadCalendar) {
    return {
      provider: 'google',
      status: 'connected',
      connectedEmail: params.connectedEmail,
      connectedAt: params.connectedAt ?? params.localSession?.connectedAt,
      expiresAt: params.expiresAt,
    };
  }

  if (params.localSession) {
    const expiresAt = params.localSession.expiresAt ? Date.parse(params.localSession.expiresAt) : NaN;
    const isExpired = Number.isFinite(expiresAt) && expiresAt <= Date.now() + 60_000;

    return {
      provider: 'google',
      status: 'expired',
      connectedEmail: params.localSession.connectedEmail,
      connectedAt: params.localSession.connectedAt,
      expiresAt: params.localSession.expiresAt,
    };
  }

  return { provider: 'google', status: 'not_connected' };
}

function computeCapabilities(params: {
  deviceIdPreview: string;
  backendStatus: GoogleCalendarBackendStatus | null;
  localSession: GoogleCalendarSession | null;
  clientIdMissing: boolean;
  desyncReason?: string;
  healed?: boolean;
}): CalendarAuthCapabilities {
  const localHasSession = Boolean(params.localSession?.accessToken);
  const localScopes = params.localSession?.scopes ?? [];
  const localWriteScope = scopesIncludeCalendarEventsWrite(localScopes);
  const localConnected =
    localHasSession &&
    localWriteScope &&
    (params.localSession?.expiresAt
      ? Date.parse(params.localSession.expiresAt) > Date.now() + 60_000
      : true);

  const backendConnected = Boolean(params.backendStatus?.connected);
  const backendScopes = params.backendStatus?.scopes ?? [];
  const backendWriteScope = Boolean(
    params.backendStatus?.hasCalendarEventsScope ||
      scopesIncludeCalendarEventsWrite(backendScopes),
  );

  const canReadCalendar = backendConnected;
  let canWriteCalendar = Boolean(
    params.backendStatus?.writeEnabled && backendWriteScope && backendConnected,
  );

  if (!canWriteCalendar && isCalendarWriteAvailableInSession() && canReadCalendar) {
    canWriteCalendar = true;
  }

  if (!canWriteCalendar && localConnected && localWriteScope && backendConnected && !backendWriteScope) {
    canWriteCalendar = false;
  }

  const inSync =
    (!localConnected && !backendConnected) ||
    (localConnected &&
      backendConnected &&
      backendWriteScope &&
      localWriteScope &&
      (!params.backendStatus?.connectedEmail ||
        !params.localSession?.connectedEmail ||
        params.backendStatus.connectedEmail === params.localSession.connectedEmail));

  const scopes = backendScopes.length > 0 ? backendScopes : localScopes;
  const connectedEmail =
    params.backendStatus?.connectedEmail ?? params.localSession?.connectedEmail;

  const connection = buildConnection({
    canReadCalendar,
    canWriteCalendar,
    connectedEmail,
    expiresAt: params.backendStatus?.expiresAt ?? params.localSession?.expiresAt,
    connectedAt: params.localSession?.connectedAt,
    localSession: params.localSession,
    clientIdMissing: params.clientIdMissing,
  });

  return {
    deviceIdPreview: params.deviceIdPreview,
    localConnected,
    backendConnected,
    canReadCalendar,
    canWriteCalendar,
    inSync,
    scopes,
    connectedEmail,
    connection,
    backendStatus: params.backendStatus,
    localSession: params.localSession,
    desyncReason: params.desyncReason,
    healed: params.healed,
  };
}

async function tryHealBackendFromLocal(localSession: GoogleCalendarSession) {
  if (!scopesIncludeCalendarEventsWrite(localSession.scopes)) {
    return {
      backendStatus: null as GoogleCalendarBackendStatus | null,
      healed: false,
      desyncReason: 'local_missing_write_scope',
    };
  }

  try {
    await syncGoogleCalendarSessionToBackend(localSession);
    const backendStatus = await fetchGoogleCalendarBackendStatus();

    return {
      backendStatus,
      healed: true,
      desyncReason: backendStatus.connected ? undefined : 'backend_sync_still_disconnected',
    };
  } catch (error) {
    return {
      backendStatus: null as GoogleCalendarBackendStatus | null,
      healed: false,
      desyncReason:
        error instanceof Error ? `backend_sync_failed:${error.message}` : 'backend_sync_failed',
    };
  }
}

export async function refreshCalendarAuthCapabilities(options?: {
  force?: boolean;
  heal?: boolean;
}): Promise<CalendarAuthCapabilities> {
  const force = options?.force ?? false;
  const heal = options?.heal ?? true;
  const now = Date.now();

  if (!force && cachedCapabilities && cacheExpiresAt > now) {
    return cachedCapabilities;
  }

  const deviceId = await ensureExecutiveDeviceId();
  const deviceIdPreview = deviceId.slice(0, 8);
  const clientIdMissing =
    !env.googleCalendarWebClientId &&
    !env.googleCalendarIosClientId &&
    !env.googleCalendarAndroidClientId;

  let localSession = await loadGoogleCalendarSession();
  let backendStatus = await fetchGoogleCalendarBackendStatus().catch(() => null);

  let desyncReason: string | undefined;
  let healed = false;

  const localShowsConnected =
    Boolean(localSession?.accessToken) &&
    scopesIncludeCalendarEventsWrite(localSession?.scopes ?? []);

  const backendMissing = !backendStatus?.connected;
  const backendMissingWrite =
    backendStatus?.connected && !backendStatus.writeEnabled && !backendStatus.hasCalendarEventsScope;

  if (heal && localShowsConnected && (backendMissing || backendMissingWrite) && localSession) {
    const healResult = await tryHealBackendFromLocal(localSession);
    healed = healResult.healed;
    desyncReason = healResult.desyncReason;
    backendStatus = healResult.backendStatus ?? backendStatus;
  }

  if (heal && !localSession) {
    const { getActiveGoogleCalendarSession } = await import(
      '@/src/features/agent/calendar/googleCalendarAuth'
    );
    const activeSession = await getActiveGoogleCalendarSession();

    if (activeSession) {
      localSession = activeSession;

      if (!backendStatus?.connected) {
        const healResult = await tryHealBackendFromLocal(activeSession);
        healed = healResult.healed;
        desyncReason = healResult.desyncReason;
        backendStatus = healResult.backendStatus ?? backendStatus;
      }
    }
  }

  const capabilities = computeCapabilities({
    deviceIdPreview,
    backendStatus,
    localSession,
    clientIdMissing,
    desyncReason:
      desyncReason ??
      (localShowsConnected && !backendStatus?.connected
        ? 'local_session_without_backend_tokens'
        : backendStatus?.connected && !localShowsConnected
          ? 'backend_tokens_without_local_session'
          : undefined),
    healed,
  });

  cachedCapabilities = capabilities;
  cacheExpiresAt = now + CACHE_TTL_MS;

  console.log('[Calendar Auth] capabilities refreshed', {
    deviceIdPreview: capabilities.deviceIdPreview,
    cachedDeviceIdPreview: getCachedExecutiveDeviceId()?.slice(0, 8) ?? null,
    localConnected: capabilities.localConnected,
    backendConnected: capabilities.backendConnected,
    canReadCalendar: capabilities.canReadCalendar,
    canWriteCalendar: capabilities.canWriteCalendar,
    inSync: capabilities.inSync,
    scopes: capabilities.scopes,
    desyncReason: capabilities.desyncReason ?? null,
    healed: capabilities.healed ?? false,
  });

  return capabilities;
}

export function logCalendarAuthBeforeTool(
  tool: string,
  capabilities: CalendarAuthCapabilities,
) {
  console.log('[Calendar Auth] before tool', {
    tool,
    deviceIdPreview: capabilities.deviceIdPreview,
    canReadCalendar: capabilities.canReadCalendar,
    canWriteCalendar: capabilities.canWriteCalendar,
    writeScope: capabilities.scopes.filter((scope) => scope.includes('calendar')),
    inSync: capabilities.inSync,
    localConnected: capabilities.localConnected,
    backendConnected: capabilities.backendConnected,
    reasonForRefusal: capabilities.canWriteCalendar
      ? null
      : capabilities.desyncReason ?? 'write_not_available',
  });
}

export async function ensureCalendarAuthForTool(tool: string) {
  const capabilities = await refreshCalendarAuthCapabilities({ force: true, heal: true });
  logCalendarAuthBeforeTool(tool, capabilities);
  return capabilities;
}
