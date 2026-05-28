# AI Executive Assistant

AI-powered executive assistant with voice, chat, memory, scheduling, and automation.

## Architecture

- `mobile/` — Expo + React Native client
- `backend/` — secure Node.js + Express proxy for OpenAI chat

The mobile client no longer calls OpenAI directly. All chat requests go through the local backend at `/api/chat`, and only the backend stores the real `OPENAI_API_KEY`.

## Local setup

### 1. Backend setup

Create a backend env file from the example:

```bash
cd backend
cp .env.example .env
```

Open `backend/.env` and paste your real OpenAI API key here:

```env
OPENAI_API_KEY=your_real_openai_api_key_here
```

You can also adjust:

```env
PORT=3001
OPENAI_MODEL=gpt-4o-mini
CORS_ORIGIN=http://localhost:8081
APP_API_KEY=optional_shared_key_for_mobile_clients
```

Speech transcription (iOS voice input) uses Whisper at `POST /api/speech/transcribe`.
See [docs/PHASE1-VOICE-MVP.md](docs/PHASE1-VOICE-MVP.md) for the full voice MVP checklist.

Start the backend:

```bash
cd backend
npm install
npm run dev
```

### 2. Mobile setup

The mobile app uses the backend proxy through `EXPO_PUBLIC_API_BASE_URL`.

Make sure `mobile/.env` contains:

```env
EXPO_PUBLIC_API_BASE_URL=http://localhost:3001/api
EXPO_PUBLIC_APP_API_KEY=optional_shared_key_for_mobile_clients
```

For iOS voice, use a development build (`npx expo run:ios`), not Expo Go.

Then start Expo:

```bash
cd mobile
npm install
npm start
```

## Testing notes

- For Expo Web on the same machine, `http://localhost:3001/api` works directly.
- For a physical device in Expo Go, replace `localhost` in `mobile/.env` with your computer’s LAN IP, for example:

```env
EXPO_PUBLIC_API_BASE_URL=http://192.168.0.10:3001/api
```

- After changing any env file, restart the corresponding process.

## Security note

Do not keep the real OpenAI API key in `mobile/.env` or any frontend file.

The correct secure flow is:
- frontend -> local backend proxy
- backend -> OpenAI
