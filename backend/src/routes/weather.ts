import { Router } from 'express';

import { backendEnv } from '../config/env.js';
import {
  fetchWeatherSnapshot,
  geocodeWeatherCity,
} from '../services/weatherService.js';

export const weatherRouter = Router();

function parseLanguage(value: unknown): 'en' | 'ru' | 'uk' {
  if (value === 'ru' || value === 'uk' || value === 'en') {
    return value;
  }

  return 'en';
}

weatherRouter.get('/weather', async (request, response) => {
  try {
    const language = parseLanguage(request.query.lang);
    const timeZone =
      typeof request.query.timeZone === 'string' && request.query.timeZone.trim()
        ? request.query.timeZone.trim()
        : 'UTC';
    const referenceNowMs = Number(request.query.referenceNowMs);
    const cityQuery =
      typeof request.query.city === 'string' ? request.query.city.trim() : '';
    const latitude = Number(request.query.lat);
    const longitude = Number(request.query.lon);

    let latitudeResolved = latitude;
    let longitudeResolved = longitude;

    if (cityQuery) {
      const geocoded = await geocodeWeatherCity({
        apiKey: backendEnv.WEATHER_API_KEY,
        city: cityQuery,
      });
      latitudeResolved = geocoded.latitude;
      longitudeResolved = geocoded.longitude;
    }

    if (!Number.isFinite(latitudeResolved) || !Number.isFinite(longitudeResolved)) {
      response.status(400).json({
        error: 'Provide either city or lat/lon coordinates.',
      });
      return;
    }

    const snapshot = await fetchWeatherSnapshot({
      apiKey: backendEnv.WEATHER_API_KEY,
      latitude: latitudeResolved,
      longitude: longitudeResolved,
      language,
      timeZone,
      referenceNowMs: Number.isFinite(referenceNowMs) ? referenceNowMs : Date.now(),
    });

    response.status(200).json(snapshot);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Weather request failed.';

    if (message.includes('WEATHER_API_KEY')) {
      response.status(503).json({ error: message });
      return;
    }

    if (message.startsWith('City not found')) {
      response.status(404).json({ error: message });
      return;
    }

    console.error('[weather] request failed', message);
    response.status(502).json({ error: 'Weather provider request failed.' });
  }
});
