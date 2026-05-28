import type { Request, Response } from 'express';
import { Router } from 'express';

import {
  exchangeGoogleCalendarCode,
  refreshGoogleCalendarAccessToken,
} from '../services/googleOAuthService.js';

type ExchangeGoogleCalendarRequest = {
  code: string;
  redirectUri: string;
  codeVerifier: string;
};

type RefreshGoogleCalendarRequest = {
  refreshToken: string;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
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

googleCalendarRouter.post('/google-calendar/exchange', async (request: Request, response: Response) => {
  const parsedRequest = parseExchangeGoogleCalendarRequest(request.body);

  if (!parsedRequest) {
    return response.status(400).json({
      message: 'Invalid Google Calendar exchange payload.',
      code: 'GOOGLE_CALENDAR_EXCHANGE_PAYLOAD_INVALID',
    });
  }

  try {
    const tokenResult = await exchangeGoogleCalendarCode(parsedRequest);
    return response.status(200).json(tokenResult);
  } catch (error) {
    return handleGoogleCalendarError(response, error);
  }
});

googleCalendarRouter.post('/google-calendar/refresh', async (request: Request, response: Response) => {
  const parsedRequest = parseRefreshGoogleCalendarRequest(request.body);

  if (!parsedRequest) {
    return response.status(400).json({
      message: 'Invalid Google Calendar refresh payload.',
      code: 'GOOGLE_CALENDAR_REFRESH_PAYLOAD_INVALID',
    });
  }

  try {
    const tokenResult = await refreshGoogleCalendarAccessToken(parsedRequest);
    return response.status(200).json(tokenResult);
  } catch (error) {
    return handleGoogleCalendarError(response, error);
  }
});
