import type { NextFunction, Request, Response } from 'express';

import { backendEnv } from '../config/env.js';

export function requireAppApiKey(request: Request, response: Response, next: NextFunction) {
  const configuredKey = backendEnv.APP_API_KEY;

  if (!configuredKey) {
    next();
    return;
  }

  const providedKey = request.header('x-app-key')?.trim();

  if (providedKey === configuredKey) {
    next();
    return;
  }

  response.status(401).json({
    message: 'Invalid or missing app API key.',
    code: 'APP_API_KEY_INVALID',
  });
}
