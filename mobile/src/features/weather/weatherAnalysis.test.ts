import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { WeatherHourlyPoint, WeatherSnapshot } from '@/src/features/weather/types';
import { buildWeatherAnalysis } from '@/src/features/weather/weatherAnalysis';
import { buildWeatherReply } from '@/src/features/weather/weatherReply';

const timeZone = 'America/Chicago';
const referenceNow = new Date('2026-05-28T14:00:00-05:00');

function slotAt(iso: string, rainy: boolean): WeatherHourlyPoint {
  return {
    timeMs: Date.parse(iso),
    tempC: 20,
    feelsLikeC: 19,
    pop: rainy ? 70 : 10,
    condition: rainy ? 'Rain' : 'Clouds',
    rainMm: rainy ? 1.5 : 0,
  };
}

const baseSnapshot: WeatherSnapshot = {
  location: {
    city: 'Chicago',
    country: 'US',
    latitude: 41.8781,
    longitude: -87.6298,
  },
  current: {
    tempC: 23,
    feelsLikeC: 23,
    condition: 'Cloudy',
    windKph: 10,
  },
  today: { highC: 26, lowC: 14, pop: 10 },
  tomorrow: {
    highC: 24,
    lowC: 16,
    morningLowC: 16,
    pop: 60,
    condition: 'Rain',
  },
  hourly: [],
  daily: [],
};

describe('shared weather analysis consistency', () => {
  it('clothing and umbrella agree when tomorrow has rainy forecast slots', () => {
    const snapshot: WeatherSnapshot = {
      ...baseSnapshot,
      hourly: [
        slotAt('2026-05-29T04:00:00-05:00', true),
        slotAt('2026-05-29T07:00:00-05:00', true),
        slotAt('2026-05-29T13:00:00-05:00', false),
      ],
    };

    const clothingReply = buildWeatherReply({
      snapshot,
      intent: { kind: 'query', questionType: 'clothing', timeScope: 'tomorrow' },
      languageCode: 'en-US',
      referenceNow,
    });

    const umbrellaReply = buildWeatherReply({
      snapshot,
      intent: { kind: 'query', questionType: 'umbrella', timeScope: 'tomorrow' },
      languageCode: 'en-US',
      referenceNow,
    });

    const analysis = buildWeatherAnalysis({
      snapshot,
      languageCode: 'en-US',
      timeScope: 'tomorrow',
      referenceNow,
    });

    assert.equal(analysis.rainExpected, true);
    assert.equal(analysis.umbrellaNeeded, true);
    assert.match(clothingReply, /umbrella would be a good idea/i);
    assert.match(umbrellaReply, /take an umbrella/i);
    assert.doesNotMatch(umbrellaReply, /no rain is expected/i);
    assert.doesNotMatch(umbrellaReply, /do not need an umbrella/i);
  });

  it('does not infer rain from day pop alone when hourly slots are dry', () => {
    const snapshot: WeatherSnapshot = {
      ...baseSnapshot,
      tomorrow: {
        ...baseSnapshot.tomorrow!,
        pop: 80,
        condition: 'Rain',
      },
      hourly: [
        slotAt('2026-05-29T04:00:00-05:00', false),
        slotAt('2026-05-29T10:00:00-05:00', false),
        slotAt('2026-05-29T16:00:00-05:00', false),
      ],
    };

    const clothingReply = buildWeatherReply({
      snapshot,
      intent: { kind: 'query', questionType: 'clothing', timeScope: 'tomorrow' },
      languageCode: 'en-US',
      referenceNow,
    });

    const umbrellaReply = buildWeatherReply({
      snapshot,
      intent: { kind: 'query', questionType: 'umbrella', timeScope: 'tomorrow' },
      languageCode: 'en-US',
      referenceNow,
    });

    const analysis = buildWeatherAnalysis({
      snapshot,
      languageCode: 'en-US',
      timeScope: 'tomorrow',
      referenceNow,
    });

    assert.equal(analysis.rainExpected, false);
    assert.equal(analysis.umbrellaNeeded, false);
    assert.match(clothingReply, /No umbrella needed/i);
    assert.match(umbrellaReply, /do not need an umbrella/i);
    assert.match(umbrellaReply, /no rain is expected/i);
    assert.doesNotMatch(clothingReply, /umbrella would be a good idea/i);
  });

  it('uses actual slot times, not a hardcoded 10:00-22:00 range', () => {
    const snapshot: WeatherSnapshot = {
      ...baseSnapshot,
      hourly: [
        slotAt('2026-05-29T07:00:00-05:00', true),
        slotAt('2026-05-29T22:00:00-05:00', false),
      ],
    };

    const analysis = buildWeatherAnalysis({
      snapshot,
      languageCode: 'en-US',
      timeScope: 'tomorrow',
      referenceNow,
    });

    assert.match(analysis.rainSummaryClause, /until 10:00/i);
    assert.doesNotMatch(analysis.rainSummaryClause, /10:00.*22:00/i);
    assert.doesNotMatch(analysis.rainSummaryClause, /from 10:00 to 22:00/i);
  });

  it('uses day +2 hourly slots for day-after-tomorrow clothing and umbrella', () => {
    const snapshot: WeatherSnapshot = {
      ...baseSnapshot,
      today: { highC: 26, lowC: 19, pop: 10 },
      hourly: [
        slotAt('2026-05-28T10:00:00-05:00', false),
        slotAt('2026-05-30T08:00:00-05:00', true),
        slotAt('2026-05-30T14:00:00-05:00', true),
      ],
    };

    snapshot.hourly[0] = { ...snapshot.hourly[0], tempC: 19 };
    snapshot.hourly[1] = { ...snapshot.hourly[1], tempC: 11 };
    snapshot.hourly[2] = { ...snapshot.hourly[2], tempC: 18 };

    const analysis = buildWeatherAnalysis({
      snapshot,
      languageCode: 'ru-RU',
      timeScope: 'day_after_tomorrow',
      referenceNow,
    });

    const clothingReply = buildWeatherReply({
      snapshot,
      intent: { kind: 'query', questionType: 'clothing', timeScope: 'day_after_tomorrow' },
      languageCode: 'ru-RU',
      referenceNow,
    });

    const umbrellaReply = buildWeatherReply({
      snapshot,
      intent: { kind: 'query', questionType: 'umbrella', timeScope: 'day_after_tomorrow' },
      languageCode: 'ru-RU',
      referenceNow,
    });

    assert.equal(analysis.scope, 'day_after_tomorrow');
    assert.equal(analysis.rainExpected, true);
    assert.match(clothingReply, /Послезавтра/i);
    assert.match(clothingReply, /\+11°C/);
    assert.doesNotMatch(clothingReply, /Сегодня/i);
    assert.match(umbrellaReply, /лучше взять зонт/i);
    assert.match(analysis.rainSummarySentence, /Послезавтра/i);
  });
});
