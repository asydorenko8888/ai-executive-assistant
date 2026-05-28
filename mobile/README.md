# AI Executive Assistant Mobile

Mobile client for the AI Executive Assistant built with Expo, React Native, and TypeScript.

## Stack

- Expo Router
- React Native
- TypeScript
- Zustand

## Project structure

```text
src/
  components/
  features/
  services/
  hooks/
  store/
  theme/
  utils/
  types/
```

`app/` remains the Expo Router entry layer, while feature logic, reusable UI, theme, and state live in `src/`.

## Run locally

```bash
npm install
npm start
```

For real AI chat, the mobile client expects a local backend proxy. Set `EXPO_PUBLIC_API_BASE_URL` in `mobile/.env` to your backend URL, for example `http://localhost:3001/api`.

## Google Calendar foundation

The mobile client now includes a read-only Google Calendar integration foundation for schedule awareness.

Add the following values to `mobile/.env` before testing:

```bash
EXPO_PUBLIC_GOOGLE_CALENDAR_WEB_CLIENT_ID=
EXPO_PUBLIC_GOOGLE_CALENDAR_ANDROID_CLIENT_ID=
EXPO_PUBLIC_GOOGLE_CALENDAR_IOS_CLIENT_ID=
```

Use Google OAuth client IDs that match the platform you want to test. The integration is read-only and currently fetches upcoming events from the primary calendar to power schedule-aware briefings and contextual assistant replies.

## Current UI modules

- Executive home dashboard
- Reusable premium dark UI components
- Centralized theme tokens
- Global app state via Zustand
