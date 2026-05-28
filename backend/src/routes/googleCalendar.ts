import type { Request, Response } from 'express';
import { Router } from 'express';

import { readExecutiveDeviceId } from '../lib/executiveDeviceId.js';
import { getGoogleCalendarDebugSnapshot } from '../services/googleCalendarDebug.js';
import {
  GOOGLE_CALENDAR_WRITE_NOT_GRANTED_MESSAGE,
  resolveGrantedScopes,
  scopesIncludeCalendarEventsWrite,
} from '../services/googleCalendarScopes.js';
import { createGoogleCalendarEventForDevice, runGoogleCalendarTestInsert } from '../services/googleCalendarEventService.js';
import {
  getGoogleCalendarEventForDevice,
  listGoogleCalendarEventsForDevice,
} from '../services/googleCalendarEventsQueryService.js';
import {
  buildStoredTokensFromOAuthResult,
  clearGoogleCalendarTokens,
  getGoogleCalendarConnectionStatus,
  getGoogleCalendarTokens,
  saveGoogleCalendarTokens,
  scopesIncludeCalendarWrite,
} from '../services/googleCalendarTokenStore.js';
import {
  exchangeGoogleCalendarCode,
  refreshGoogleCalendarAccessToken,
} from '../services/googleOAuthService.js';
import {
  clearPendingActions,
  enqueuePendingAction,
  peekPendingActions,
  shiftPendingAction,
  type PendingCalendarCreatePayload,
} from '../services/pendingActionStore.js';

type ExchangeGoogleCalendarRequest = {
  code: string;
  redirectUri: string;
  codeVerifier: string;
};

type RefreshGoogleCalendarRequest = {
  refreshToken: string;
};

type UpsertGoogleCalendarSessionRequest = {
  accessToken: string;
  refreshToken?: string;
  tokenType?: string;
  scope?: string;
  scopes?: string[];
  expiresAt?: string;
  expiresIn?: number;
  connectedEmail?: string;
};

type CreateCalendarEventRequest = {
  summary: string;
  location?: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
};

type EnqueuePendingActionRequest = {
  type: 'calendar.create';
  payload: PendingCalendarCreatePayload;
  transcript: string;
  languageCode: string;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function requireDeviceId(request: Request, response: Response) {
  const deviceId = readExecutiveDeviceId(request);

  if (!deviceId) {
    response.status(400).json({
      message: 'X-Executive-Device-Id header is required.',
      code: 'DEVICE_ID_REQUIRED',
    });
    return null;
  }

  return deviceId;
}

function parseExchangeGoogleCalendarRequest(body: unknown): ExchangeGoogleCalendarRequest | null {
  if (!body || typeof body !== 'object') {
    return null;
  }

  const candidate = body as Partial<ExchangeGoogleCalendarRequest>;

  if (
    !isNonEmptyString(candidate.code) ||
    !isNonEmptyString(candidate.redirectUri) ||
    !isNonEmptyString(candidate.codeVerifier)
  ) {
    return null;
  }

  return {
    code: candidate.code.trim(),
    redirectUri: candidate.redirectUri.trim(),
    codeVerifier: candidate.codeVerifier.trim(),
  };
}

function parseRefreshGoogleCalendarRequest(body: unknown): RefreshGoogleCalendarRequest | null {
  if (!body || typeof body !== 'object') {
    return null;
  }

  const candidate = body as Partial<RefreshGoogleCalendarRequest>;

  if (!isNonEmptyString(candidate.refreshToken)) {
    return null;
  }

  return {
    refreshToken: candidate.refreshToken.trim(),
  };
}

function parseUpsertSessionRequest(body: unknown): UpsertGoogleCalendarSessionRequest | null {
  if (!body || typeof body !== 'object') {
    return null;
  }

  const candidate = body as Partial<UpsertGoogleCalendarSessionRequest>;

  if (!isNonEmptyString(candidate.accessToken)) {
    return null;
  }

  return {
    accessToken: candidate.accessToken.trim(),
    refreshToken: candidate.refreshToken?.trim(),
    tokenType: candidate.tokenType?.trim(),
    scope: candidate.scope?.trim(),
    scopes: Array.isArray(candidate.scopes)
      ? candidate.scopes.filter((scope): scope is string => isNonEmptyString(scope))
      : undefined,
    expiresAt: candidate.expiresAt?.trim(),
    expiresIn: typeof candidate.expiresIn === 'number' ? candidate.expiresIn : undefined,
    connectedEmail: candidate.connectedEmail?.trim(),
  };
}

function parseCreateEventRequest(body: unknown): CreateCalendarEventRequest | null {
  if (!body || typeof body !== 'object') {
    return null;
  }

  const candidate = body as Partial<CreateCalendarEventRequest>;

  if (
    !isNonEmptyString(candidate.summary) ||
    !candidate.start ||
    typeof candidate.start.dateTime !== 'string' ||
    typeof candidate.start.timeZone !== 'string' ||
    !candidate.end ||
    typeof candidate.end.dateTime !== 'string' ||
    typeof candidate.end.timeZone !== 'string'
  ) {
    return null;
  }

  return {
    summary: candidate.summary.trim(),
    location: candidate.location?.trim() || undefined,
    start: {
      dateTime: candidate.start.dateTime,
      timeZone: candidate.start.timeZone,
    },
    end: {
      dateTime: candidate.end.dateTime,
      timeZone: candidate.end.timeZone,
    },
  };
}

function handleGoogleCalendarError(response: Response, error: unknown) {
  const errorMessage = error instanceof Error ? error.message : 'Google Calendar OAuth failed.';

  if (errorMessage === 'GOOGLE_CALENDAR_WEB_CLIENT_ID_MISSING') {
    return response.status(500).json({
      message: 'Backend Google Calendar web client ID is missing.',
      code: 'GOOGLE_CALENDAR_WEB_CLIENT_ID_MISSING',
    });
  }

  if (errorMessage === 'GOOGLE_CALENDAR_WEB_CLIENT_SECRET_MISSING') {
    return response.status(500).json({
      message: 'Backend Google Calendar web client secret is missing.',
      code: 'GOOGLE_CALENDAR_WEB_CLIENT_SECRET_MISSING',
    });
  }

  if (errorMessage === 'GOOGLE_OAUTH_ACCESS_TOKEN_MISSING') {
    return response.status(502).json({
      message: 'Google OAuth did not return an access token.',
      code: 'GOOGLE_OAUTH_ACCESS_TOKEN_MISSING',
    });
  }

  if (errorMessage.startsWith('GOOGLE_OAUTH_TOKEN_ERROR:')) {
    return response.status(502).json({
      message: errorMessage.replace('GOOGLE_OAUTH_TOKEN_ERROR:', ''),
      code: 'GOOGLE_OAUTH_TOKEN_ERROR',
    });
  }

  return response.status(500).json({
    message: errorMessage,
    code: 'GOOGLE_CALENDAR_OAUTH_ERROR',
  });
}

export const googleCalendarRouter = Router();

googleCalendarRouter.get('/google-calendar/status', async (request, response) => {
  const deviceId = requireDeviceId(request, response);

  if (!deviceId) {
    return;
  }

  const status = await getGoogleCalendarConnectionStatus(deviceId);
  const debug = await getGoogleCalendarDebugSnapshot(deviceId);

  return response.status(200).json({
    ...status,
    ...debug,
  });
});

googleCalendarRouter.get('/google-calendar/debug', async (request, response) => {
  const deviceId = requireDeviceId(request, response);

  if (!deviceId) {
    return;
  }

  const debug = await getGoogleCalendarDebugSnapshot(deviceId);

  return response.status(200).json(debug);
});

googleCalendarRouter.get('/google-calendar/events', async (request, response) => {
  const deviceId = requireDeviceId(request, response);

  if (!deviceId) {
    return;
  }

  const timeMin = typeof request.query.timeMin === 'string' ? request.query.timeMin : null;
  const timeMax = typeof request.query.timeMax === 'string' ? request.query.timeMax : null;

  if (!timeMin || !timeMax) {
    return response.status(400).json({
      message: 'timeMin and timeMax query parameters are required.',
      code: 'GOOGLE_CALENDAR_EVENTS_QUERY_INVALID',
    });
  }

  const result = await listGoogleCalendarEventsForDevice(deviceId, { timeMin, timeMax });

  if (!result.ok) {
    return response.status(result.errorCode === 'calendar_not_connected' ? 401 : 502).json({
      message: result.message,
      code: result.errorCode,
    });
  }

  return response.status(200).json({
    events: result.events,
  });
});

googleCalendarRouter.get('/google-calendar/events/:eventId', async (request, response) => {
  const deviceId = requireDeviceId(request, response);

  if (!deviceId) {
    return;
  }

  const eventId = request.params.eventId?.trim();

  if (!eventId) {
    return response.status(400).json({
      message: 'eventId is required.',
      code: 'GOOGLE_CALENDAR_EVENT_ID_INVALID',
    });
  }

  const result = await getGoogleCalendarEventForDevice(deviceId, eventId);

  if (!result.ok) {
    return response.status(result.errorCode === 'calendar_not_connected' ? 401 : 404).json({
      message: result.message,
      code: result.errorCode,
    });
  }

  return response.status(200).json({
    event: result.event,
  });
});

googleCalendarRouter.post('/google-calendar/debug/test-insert', async (request, response) => {
  const deviceId = requireDeviceId(request, response);

  if (!deviceId) {
    return;
  }

  const timeZone =
    typeof request.body === 'object' &&
    request.body !== null &&
    'timeZone' in request.body &&
    typeof (request.body as { timeZone?: string }).timeZone === 'string'
      ? (request.body as { timeZone: string }).timeZone
      : 'UTC';

  const result = await runGoogleCalendarTestInsert(deviceId, timeZone);

  if (!result.ok) {
    return response.status(result.httpStatus ?? 502).json({
      status: 'FAILURE',
      code: result.errorCode,
      message: result.errorMessage,
      verified: result.verified,
      verificationFetched: result.verificationFetched,
      insertedEventId: 'insertedEventId' in result ? result.insertedEventId : undefined,
    });
  }

  return response.status(201).json({
    status: 'SUCCESS',
    code: 'SUCCESS',
    event: result.event,
    eventId: result.event.id,
    verified: result.verified,
    verificationFetched: result.verificationFetched,
  });
});

googleCalendarRouter.post('/google-calendar/exchange', async (request, response) => {
  const parsedRequest = parseExchangeGoogleCalendarRequest(request.body);

  if (!parsedRequest) {
    return response.status(400).json({
      message: 'Invalid Google Calendar exchange payload.',
      code: 'GOOGLE_CALENDAR_EXCHANGE_PAYLOAD_INVALID',
    });
  }

  const deviceId = readExecutiveDeviceId(request);

  try {
    const tokenResult = await exchangeGoogleCalendarCode(parsedRequest);
    const grantedScopes = await resolveGrantedScopes(tokenResult.accessToken, tokenResult.scope);
    const hasCalendarEventsScope = scopesIncludeCalendarEventsWrite(grantedScopes);

    if (!hasCalendarEventsScope) {
      if (deviceId) {
        await clearGoogleCalendarTokens(deviceId);
      }

      console.log('[GoogleCalendar] exchange rejected — calendar.events scope missing', {
        deviceId: deviceId?.slice(0, 8) ?? null,
        grantedScopes,
      });

      return response.status(403).json({
        message: GOOGLE_CALENDAR_WRITE_NOT_GRANTED_MESSAGE,
        code: 'GOOGLE_CALENDAR_WRITE_NOT_GRANTED',
        scopes: grantedScopes,
        hasCalendarEventsScope: false,
      });
    }

    if (deviceId) {
      const stored = buildStoredTokensFromOAuthResult({
        ...tokenResult,
        scope: grantedScopes.join(' '),
      });
      await saveGoogleCalendarTokens(deviceId, stored);
      console.log('[GoogleCalendar] tokens stored after exchange', {
        deviceId: deviceId.slice(0, 8),
        hasWriteAccess: scopesIncludeCalendarWrite(stored.scopes),
        hasCalendarEventsScope,
        connectedEmail: stored.connectedEmail ?? null,
        scopes: stored.scopes,
      });
    }

    return response.status(200).json({
      accessToken: tokenResult.accessToken,
      refreshToken: tokenResult.refreshToken,
      tokenType: tokenResult.tokenType,
      scope: grantedScopes.join(' '),
      expiresIn: tokenResult.expiresIn,
      connectedEmail: tokenResult.connectedEmail,
      hasWriteAccess: scopesIncludeCalendarWrite(grantedScopes),
      hasCalendarEventsScope,
      storedOnBackend: Boolean(deviceId),
    });
  } catch (error) {
    return handleGoogleCalendarError(response, error);
  }
});

googleCalendarRouter.post('/google-calendar/session', async (request, response) => {
  const deviceId = requireDeviceId(request, response);

  if (!deviceId) {
    return;
  }

  const parsedRequest = parseUpsertSessionRequest(request.body);

  if (!parsedRequest) {
    return response.status(400).json({
      message: 'Invalid Google Calendar session payload.',
      code: 'GOOGLE_CALENDAR_SESSION_PAYLOAD_INVALID',
    });
  }

  const scopes =
    parsedRequest.scopes ??
    (parsedRequest.scope ? parsedRequest.scope.split(/\s+/).filter(Boolean) : []);

  if (!scopesIncludeCalendarEventsWrite(scopes)) {
    return response.status(403).json({
      message: GOOGLE_CALENDAR_WRITE_NOT_GRANTED_MESSAGE,
      code: 'GOOGLE_CALENDAR_WRITE_NOT_GRANTED',
      scopes,
      hasCalendarEventsScope: false,
    });
  }

  const stored = await saveGoogleCalendarTokens(deviceId, {
    accessToken: parsedRequest.accessToken,
    refreshToken: parsedRequest.refreshToken ?? '',
    tokenType: parsedRequest.tokenType,
    scopes,
    connectedEmail: parsedRequest.connectedEmail,
    expiresAt:
      parsedRequest.expiresAt ??
      new Date(
        Date.now() + (typeof parsedRequest.expiresIn === 'number' ? parsedRequest.expiresIn : 3600) * 1000,
      ).toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const status = await getGoogleCalendarConnectionStatus(deviceId);

  console.log('[GoogleCalendar] session upserted', {
    deviceId: deviceId.slice(0, 8),
    hasWriteAccess: status.hasWriteAccess,
  });

  return response.status(200).json({
    ...status,
    storedAt: stored.updatedAt,
  });
});

googleCalendarRouter.delete('/google-calendar/session', async (request, response) => {
  const deviceId = requireDeviceId(request, response);

  if (!deviceId) {
    return;
  }

  await clearGoogleCalendarTokens(deviceId);
  await clearPendingActions(deviceId);

  return response.status(200).json({ disconnected: true });
});

googleCalendarRouter.post('/google-calendar/refresh', async (request, response) => {
  const parsedRequest = parseRefreshGoogleCalendarRequest(request.body);

  if (!parsedRequest) {
    return response.status(400).json({
      message: 'Invalid Google Calendar refresh payload.',
      code: 'GOOGLE_CALENDAR_REFRESH_PAYLOAD_INVALID',
    });
  }

  const deviceId = readExecutiveDeviceId(request);

  try {
    const tokenResult = await refreshGoogleCalendarAccessToken(parsedRequest);

    if (deviceId) {
      const existing = await getGoogleCalendarTokens(deviceId);
      const stored = buildStoredTokensFromOAuthResult({
        ...tokenResult,
        refreshToken: tokenResult.refreshToken ?? existing?.refreshToken,
      });
      await saveGoogleCalendarTokens(deviceId, stored);
    }

    return response.status(200).json(tokenResult);
  } catch (error) {
    return handleGoogleCalendarError(response, error);
  }
});

googleCalendarRouter.post('/google-calendar/events', async (request, response) => {
  const deviceId = requireDeviceId(request, response);

  if (!deviceId) {
    return;
  }

  const parsedRequest = parseCreateEventRequest(request.body);

  if (!parsedRequest) {
    return response.status(400).json({
      message: 'Invalid Google Calendar event payload.',
      code: 'GOOGLE_CALENDAR_EVENT_PAYLOAD_INVALID',
    });
  }

  const status = await getGoogleCalendarConnectionStatus(deviceId);

  if (!status.connected) {
    return response.status(401).json({
      message: 'Google Calendar is not connected.',
      code: 'calendar_not_connected',
    });
  }

  if (!status.writeEnabled) {
    return response.status(403).json({
      message: 'WRITE_SCOPE_MISSING: https://www.googleapis.com/auth/calendar.events',
      code: 'WRITE_SCOPE_MISSING',
      status: 'FAILURE',
      scopes: status.scopes,
    });
  }

  const result = await createGoogleCalendarEventForDevice(deviceId, parsedRequest);

  if (!result.ok) {
    const httpStatus =
      result.errorCode === 'WRITE_SCOPE_MISSING'
        ? 403
        : result.errorCode === 'VERIFY_FAILED'
          ? 502
          : (result.httpStatus ?? 502);

    return response.status(httpStatus).json({
      message: result.errorMessage,
      code: result.errorCode,
      status: 'FAILURE',
      executionState: result.executionState,
      verified: result.verified,
      verificationFetched: result.verificationFetched,
    });
  }

  return response.status(201).json({
    status: 'SUCCESS',
    event: result.event,
    eventId: result.event.id,
    verified: result.verified,
    verificationFetched: result.verificationFetched,
    executionState: result.executionState,
  });
});

googleCalendarRouter.post('/google-calendar/pending-actions', async (request, response) => {
  const deviceId = requireDeviceId(request, response);

  if (!deviceId) {
    return;
  }

  const body = request.body as Partial<EnqueuePendingActionRequest>;

  if (
    body.type !== 'calendar.create' ||
    !body.payload ||
    !isNonEmptyString(body.transcript) ||
    !isNonEmptyString(body.languageCode)
  ) {
    return response.status(400).json({
      message: 'Invalid pending action payload.',
      code: 'PENDING_ACTION_INVALID',
    });
  }

  const entry = await enqueuePendingAction(deviceId, {
    type: 'calendar.create',
    payload: body.payload,
    transcript: body.transcript.trim(),
    languageCode: body.languageCode.trim(),
  });

  console.log('[PendingAction] enqueued', {
    deviceId: deviceId.slice(0, 8),
    actionId: entry.id,
    type: entry.type,
  });

  return response.status(201).json({ action: entry });
});

googleCalendarRouter.get('/google-calendar/pending-actions', async (request, response) => {
  const deviceId = requireDeviceId(request, response);

  if (!deviceId) {
    return;
  }

  const actions = await peekPendingActions(deviceId);

  return response.status(200).json({ actions });
});

googleCalendarRouter.post('/google-calendar/pending-actions/resume', async (request, response) => {
  const deviceId = requireDeviceId(request, response);

  if (!deviceId) {
    return;
  }

  const status = await getGoogleCalendarConnectionStatus(deviceId);

  if (!status.connected || !status.hasWriteAccess) {
    return response.status(401).json({
      message: 'Google Calendar write access is not ready.',
      code: 'calendar_auth_required',
      status,
    });
  }

  const pending = await shiftPendingAction(deviceId);

  if (!pending || pending.type !== 'calendar.create') {
    return response.status(200).json({ resumed: false });
  }

  console.log('[PendingAction] resuming', {
    deviceId: deviceId.slice(0, 8),
    actionId: pending.id,
  });

  const result = await createGoogleCalendarEventForDevice(deviceId, pending.payload);

  if (!result.ok) {
    await enqueuePendingAction(deviceId, {
      type: pending.type,
      payload: pending.payload,
      transcript: pending.transcript,
      languageCode: pending.languageCode,
    });

    return response.status(result.httpStatus ?? 502).json({
      message: result.errorMessage,
      code: result.errorCode,
      actionId: pending.id,
      executionState: result.executionState,
      verified: result.verified,
      verificationFetched: result.verificationFetched,
    });
  }

  return response.status(200).json({
    resumed: true,
    actionId: pending.id,
    transcript: pending.transcript,
    languageCode: pending.languageCode,
    event: result.event,
    verified: result.verified,
    verificationFetched: result.verificationFetched,
    executionState: result.executionState,
  });
});
