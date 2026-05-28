# Phase 1 — iOS voice MVP (expo-av + Whisper)

## What was implemented

- **Backend:** `POST /api/speech/transcribe` (OpenAI Whisper), optional `APP_API_KEY`, rate limits, helmet
- **Mobile:** Native recording (`expo-av`), native TTS (`expo-speech`), unified `startVoiceCapture`
- **Home + Chat:** iOS/Android use record → Whisper → AI; web keeps browser STT
- **Security:** `X-App-Key` header on chat + speech when `EXPO_PUBLIC_APP_API_KEY` is set

## 1. Implementation steps

1. Configure `backend/.env` (`OPENAI_API_KEY`, optional `APP_API_KEY`)
2. Start backend: `cd backend && npm run dev`
3. Configure `mobile/.env` (`EXPO_PUBLIC_API_BASE_URL`, matching `EXPO_PUBLIC_APP_API_KEY` if used)
4. Use a **development build** (not Expo Go) for iOS microphone: `npx expo run:ios` or EAS dev build
5. Test Home mic: tap → record → tap → hear AI reply
6. Test Chat mic: tap → record → tap → message sends (native auto-submits)
7. Connect Google Calendar from Home briefing widget (requires iOS OAuth client ID)

## 2. Terminal commands

```bash
# Backend
cd backend
cp .env.example .env
# Edit .env: OPENAI_API_KEY=sk-...
npm install
npm run dev

# Mobile
cd mobile
cp .env.example .env
# Edit .env:
#   EXPO_PUBLIC_API_BASE_URL=http://YOUR_LAN_IP:3001/api   # physical device
#   EXPO_PUBLIC_APP_API_KEY=same-as-backend-APP_API_KEY    # optional locally
npm install
npx expo run:ios
# or: npm start  (web simulator)

# Health check
curl http://localhost:3001/health
```

Generate a shared API key (optional but recommended for staging):

```bash
openssl rand -hex 24
```

Add to `backend/.env` and `mobile/.env`:

```env
APP_API_KEY=your_generated_key
EXPO_PUBLIC_APP_API_KEY=your_generated_key
```

## 3. Packages installed

**Backend:** `helmet`, `express-rate-limit`, `multer`, `@types/multer`

**Mobile:** `expo-av`, `expo-speech`

## 4. Files changed

| File | Change |
|------|--------|
| `backend/src/middleware/appApiKey.ts` | NEW |
| `backend/src/middleware/rateLimit.ts` | NEW |
| `backend/src/services/whisperService.ts` | NEW |
| `backend/src/routes/speech.ts` | NEW |
| `backend/src/server.ts` | Auth + speech router |
| `backend/src/config/env.ts` | `APP_API_KEY`, CORS default |
| `backend/.env.example` | `APP_API_KEY` |
| `mobile/src/features/voice/*` | NEW voice layer |
| `mobile/src/features/chat/services/speechSynthesis.ts` | Native `expo-speech` |
| `mobile/src/features/home/hooks/useHomeVoiceAssistant.ts` | `startVoiceCapture` |
| `mobile/src/features/chat/hooks/useExecutiveChat.ts` | `startVoiceCapture` |
| `mobile/src/features/chat/services/chatProxyService.ts` | API key header |
| `mobile/src/shared/api/client.ts` | API key header |
| `mobile/src/shared/config/env*.ts` | `EXPO_PUBLIC_APP_API_KEY` |
| `mobile/app.config.ts` | iOS mic permission, bundle ID, `expo-av` |
| `mobile/.env.example` | API key |

## 5. Testing checklist

### Backend
- [ ] `curl http://localhost:3001/health` → `{"ok":true}`
- [ ] `POST /api/chat` works with OpenAI key
- [ ] `POST /api/speech/transcribe` returns transcript for audio file
- [ ] With `APP_API_KEY` set, requests without `X-App-Key` return 401

### iOS (dev build)
- [ ] Mic permission prompt appears
- [ ] Home: tap mic → “Recording…” → tap again → “Thinking…” → spoken reply
- [ ] Chat: tap mic → record → tap → user message + assistant stream
- [ ] Reminder phrase on Home (“remind me in 5 minutes”) schedules reminder
- [ ] Chat history persists after app restart
- [ ] Google Calendar connect + briefing shows real events (with iOS client ID)

### Web (regression)
- [ ] Home/Chat voice still uses browser STT
- [ ] TTS works in Chrome/Safari

## 6. What can break

| Issue | Mitigation |
|-------|------------|
| Expo Go has no custom native mic | Use `npx expo run:ios` or EAS dev client |
| `localhost` on device | Use LAN IP in `EXPO_PUBLIC_API_BASE_URL` |
| API key mismatch | Same value in backend + mobile env |
| Whisper cost/latency | Short recordings; tap-to-stop |
| CORS on web | Add Expo web origin to `CORS_ORIGIN` |

## 7. TestFlight note

Expo Go is **not** sufficient for production mic testing. Next step: add `eas.json` and `eas build --profile preview --platform ios`.
