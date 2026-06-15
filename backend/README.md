# Backend API (Executive AI proxy)

Node.js + Express server used by the mobile app for chat, speech, **Google Calendar token exchange**, and **weather** (OpenWeatherMap proxy).

## Answers to common connectivity questions

| Question | Answer |
|----------|--------|
| **Where to start it?** | This directory: `backend/` (repo root: `ai-executive-assistant/backend`) |
| **Start command** | `npm run dev` (development) or `npm run start` (after `npm run build`) |
| **Port** | **3001** by default (`PORT` in `backend/.env`, fallback in `src/config/env.ts`) |
| **Is `localhost:3001` wrong?** | No — mobile uses `EXPO_PUBLIC_API_BASE_URL=http://localhost:3001/api` in `mobile/.env` (must match `PORT`) |
| **Exchange endpoint** | **Yes** — `POST /api/google-calendar/exchange` in `src/routes/googleCalendar.ts`, mounted at `/api` in `src/server.ts` |
| **Weather endpoint** | **Yes** — `GET /api/weather` in `src/routes/weather.ts` (requires `WEATHER_API_KEY` in `backend/.env`) |

## Quick start

```bash
cd backend
cp .env.example .env   # first time only; set OPENAI_API_KEY, Google OAuth secrets, WEATHER_API_KEY
npm install
npm run dev
```

You should see:

```text
Executive AI backend listening on http://localhost:3001
```

If `WEATHER_API_KEY` is missing, startup also logs:

```text
[weather] WEATHER_API_KEY is not set in backend/.env — GET /api/weather returns 503 until configured.
```

Verify:

```bash
curl http://localhost:3001/health
# {"ok":true,"weather":{"configured":false,"provider":"openweathermap"}}

curl -X POST http://localhost:3001/api/google-calendar/exchange \
  -H 'Content-Type: application/json' -d '{}'
# 400 with GOOGLE_CALENDAR_EXCHANGE_PAYLOAD_INVALID (proves route is up)
```

## Weather (OpenWeatherMap)

The mobile app never calls OpenWeatherMap directly. It requests weather through this backend proxy so the API key stays server-side.

### Required environment variables

**Backend (`backend/.env`) — weather only:**

| Variable | Required | Description |
|----------|----------|-------------|
| `WEATHER_API_KEY` | **Yes** | OpenWeatherMap API key ([sign up](https://openweathermap.org/api)) |

**Backend — shared with other features:**

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No (default `3001`) | Listen port |
| `APP_API_KEY` | If mobile sends `X-App-Key` | Must match `EXPO_PUBLIC_APP_API_KEY` in `mobile/.env` |
| `CORS_ORIGIN` | Recommended | Comma-separated allowed origins (e.g. `http://localhost:8081`) |

**Mobile (`mobile/.env`) — weather only:**

| Variable | Required | Description |
|----------|----------|-------------|
| `EXPO_PUBLIC_API_BASE_URL` | **Yes** | e.g. `http://localhost:3001/api` |
| `EXPO_PUBLIC_WEATHER_ENABLED` | No (default `true`) | Set `false` to disable weather in the app |
| `EXPO_PUBLIC_APP_API_KEY` | If backend `APP_API_KEY` is set | Sent as `X-App-Key` header |
| `EXPO_PUBLIC_CALENDAR_TIMEZONE` | Recommended | Used for “today/tomorrow” weather phrasing |

### Where `WEATHER_API_KEY` is read

1. **`src/config/env.ts`** — loads `process.env.WEATHER_API_KEY` into `backendEnv.WEATHER_API_KEY`
2. **`src/routes/weather.ts`** — passes `backendEnv.WEATHER_API_KEY` to the weather service
3. **`src/services/weatherService.ts`** — `requireWeatherApiKey()` throws if empty (→ HTTP 503)

Weather routes are registered in `src/server.ts` on the protected `/api` router (same `APP_API_KEY` middleware as chat/speech).

### OpenWeatherMap endpoints used (server-side)

| Purpose | URL |
|---------|-----|
| Geocoding (city → lat/lon) | `GET https://api.openweathermap.org/geo/1.0/direct?q={city}&limit=1&appid={WEATHER_API_KEY}` |
| Current weather | `GET https://api.openweathermap.org/data/2.5/weather?lat={lat}&lon={lon}&units=metric&lang={lang}&appid={WEATHER_API_KEY}` |
| 5-day / 3-hour forecast | `GET https://api.openweathermap.org/data/2.5/forecast?lat={lat}&lon={lon}&units=metric&lang={lang}&appid={WEATHER_API_KEY}` |

`lang` is `en`, `ru`, or `uk` (from mobile voice language).

### Test weather locally

1. Add your key to `backend/.env`:
   ```env
   WEATHER_API_KEY=your_openweathermap_api_key
   ```
2. Restart the backend (`npm run dev`).
3. Confirm health shows `"configured":true`:
   ```bash
   curl http://localhost:3001/health
   ```
4. Fetch weather (add `-H 'X-App-Key: ...'` if `APP_API_KEY` is set):
   ```bash
   curl 'http://localhost:3001/api/weather?city=Chicago&lang=en&timeZone=America/Chicago'
   ```

Without `WEATHER_API_KEY`, the same request returns **503**:
`{"error":"WEATHER_API_KEY is not configured on the backend."}`

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
