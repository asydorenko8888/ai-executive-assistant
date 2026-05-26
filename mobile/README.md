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

## Current UI modules

- Executive home dashboard
- Reusable premium dark UI components
- Centralized theme tokens
- Global app state via Zustand
