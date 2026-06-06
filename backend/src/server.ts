import express from 'express';
import cors from 'cors';
import type { CorsOptions } from 'cors';
import helmet from 'helmet';

import { backendEnv } from './config/env.js';
import { requireAppApiKey } from './middleware/appApiKey.js';
import { apiRateLimiter } from './middleware/rateLimit.js';
import { chatRouter } from './routes/chat.js';
import { googleCalendarRouter } from './routes/googleCalendar.js';
import { speechRouter } from './routes/speech.js';

const app = express();
const configuredOrigins = backendEnv.CORS_ORIGIN.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

function isLocalDevelopmentOrigin(origin: string) {
  return /^https?:\/\/(localhost|127\.0\.0\.1|(?:\d{1,3}\.){3}\d{1,3})(:\d+)?$/.test(origin);
}

const corsOptions: CorsOptions = {
  origin(origin, callback) {
    if (!origin) {
      callback(null, true);
      return;
    }

    if (
      configuredOrigins.includes('*') ||
      configuredOrigins.includes(origin) ||
      isLocalDevelopmentOrigin(origin)
    ) {
      callback(null, true);
      return;
    }

    callback(new Error(`CORS origin not allowed: ${origin}`));
  },
};

app.use(helmet());
app.use(cors(corsOptions));
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_request, response) => {
  response.status(200).json({
    ok: true,
  });
});

const protectedApiRouter = express.Router();
protectedApiRouter.use(requireAppApiKey);
protectedApiRouter.use(apiRateLimiter);
protectedApiRouter.use(chatRouter);
protectedApiRouter.use(googleCalendarRouter);
protectedApiRouter.use(speechRouter);

app.use('/api', protectedApiRouter);

app.listen(backendEnv.PORT, () => {
  console.error('CALENDAR_BACKEND_STARTED', {
    pid: process.pid,
    port: backendEnv.PORT,
    timestamp: new Date().toISOString(),
    cwd: process.cwd(),
  });
  console.log(`Executive AI backend listening on http://localhost:${backendEnv.PORT}`);
});
