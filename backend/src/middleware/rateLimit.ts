import rateLimit from 'express-rate-limit';

export const apiRateLimiter = rateLimit({
  windowMs: 60_000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: 'Too many requests. Please try again shortly.',
    code: 'RATE_LIMIT_EXCEEDED',
  },
});

export const speechRateLimiter = rateLimit({
  windowMs: 60_000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: 'Too many speech requests. Please try again shortly.',
    code: 'SPEECH_RATE_LIMIT_EXCEEDED',
  },
});
