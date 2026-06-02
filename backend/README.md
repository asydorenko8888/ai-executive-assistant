# Backend API (Executive AI proxy)

Node.js + Express server used by the mobile app for chat, speech, and **Google Calendar token exchange**.

## Answers to common connectivity questions

| Question | Answer |
|----------|--------|
| **Where to start it?** | This directory: `backend/` (repo root: `ai-executive-assistant/backend`) |
| **Start command** | `npm run dev` (development) or `npm run start` (after `npm run build`) |
| **Port** | **3001** by default (`PORT` in `backend/.env`, fallback in `src/config/env.ts`) |
| **Is `localhost:3001` wrong?** | No — mobile uses `EXPO_PUBLIC_API_BASE_URL=http://localhost:3001/api` in `mobile/.env` (must match `PORT`) |
| **Exchange endpoint** | **Yes** — `POST /api/google-calendar/exchange` in `src/routes/googleCalendar.ts`, mounted at `/api` in `src/server.ts` |

## Quick start

```bash
cd backend
cp .env.example .env   # first time only; set OPENAI_API_KEY and Google OAuth secrets
npm install
npm run dev
```

You should see:

```text
Executive AI backend listening on http://localhost:3001
```

Verify:

```bash
curl http://localhost:3001/health
# {"ok":true}

curl -X POST http://localhost:3001/api/google-calendar/exchange \
  -H 'Content-Type: application/json' -d '{}'
# 400 with GOOGLE_CALENDAR_EXCHANGE_PAYLOAD_INVALID (proves route is up)
```

From repo root:

```bash
npm run dev:backend
npm run check:backend
```

## Expo Web

Expo (port **8081**) does **not** proxy API requests. The browser calls **port 3001** directly. Both processes must run:

1. Terminal A: `npm run dev:backend` (or `cd backend && npm run dev`)
2. Terminal B: `cd mobile && npx expo start`

If `lsof -i :3001` is empty, the backend is not running and OAuth exchange will fail with `ERR_CONNECTION_REFUSED`.
