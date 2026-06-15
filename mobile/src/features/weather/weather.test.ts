import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { isWeatherAdviceIntent, isWeatherIntent, parseWeatherIntent, extractWeatherCityFromTranscript } from '@/src/features/weather/weatherClassification';
import { isFiveDayForecastIntent } from '@/src/features/weather/weatherDateScope';
import {
  resetWeatherLocationMemoryForTests,
} from '@/src/features/weather/weatherLocationMemory';
import { resolveWeatherTurn } from '@/src/features/weather/resolveWeatherTurn';
import { buildWeatherSummaryFromSnapshot } from '@/src/features/weather/weatherHomeSummary';
import {
  getSharedWeatherState,
  resetSharedWeatherStateForTests,
} from '@/src/features/weather/weatherSharedState';
import { setWeatherFetcherForTests } from '@/src/features/weather/weatherService';
import type { WeatherSnapshot } from '@/src/features/weather/types';

const referenceNow = new Date('2026-05-28T14:00:00-05:00');

function hourAt(hour: number, dayOffset = 0) {
  const date = new Date(referenceNow);
  date.setDate(date.getDate() + dayOffset);
  date.setHours(hour, 0, 0, 0);
  return date.getTime();
}

const elkGroveSnapshot: WeatherSnapshot = {
  location: {
    city: 'Elk Grove Village',
    region: 'Illinois',
    country: 'US',
    latitude: 42.0039,
    longitude: -87.9703,
  },
  current: {
    tempC: 22,
    feelsLikeC: 22,
    condition: 'Облачно',
    windKph: 12,
  },
  today: {
    highC: 26,
    lowC: 14,
    pop: 10,
  },
  tomorrow: {
    highC: 24,
    lowC: 14,
    morningLowC: 14,
    pop: 5,
    condition: 'Ясно',
  },
  hourly: [
    {
      timeMs: hourAt(14),
      tempC: 22,
      feelsLikeC: 22,
      pop: 10,
      condition: 'Облачно',
      rainMm: 0,
    },
    {
      timeMs: hourAt(16),
      tempC: 24,
      feelsLikeC: 24,
      pop: 15,
      condition: 'Облачно',
      rainMm: 0,
    },
    {
      timeMs: hourAt(8, 1),
      tempC: 14,
      feelsLikeC: 13,
      pop: 5,
      condition: 'Ясно',
      rainMm: 0,
    },
    {
      timeMs: hourAt(13, 1),
      tempC: 24,
      feelsLikeC: 24,
      pop: 5,
      condition: 'Ясно',
      rainMm: 0,
    },
    {
      timeMs: hourAt(8, 2),
      tempC: 11,
      feelsLikeC: 10,
      pop: 20,
      condition: 'Переменная облачность',
      rainMm: 0,
    },
    {
      timeMs: hourAt(14, 2),
      tempC: 18,
      feelsLikeC: 18,
      pop: 70,
      condition: 'Дождь',
      rainMm: 1.2,
    },
    {
      timeMs: hourAt(19, 2),
      tempC: 13,
      feelsLikeC: 12,
      pop: 30,
      condition: 'Облачно',
      rainMm: 0,
    },
    {
      timeMs: hourAt(10, 3),
      tempC: 16,
      feelsLikeC: 16,
      pop: 10,
      condition: 'Ясно',
      rainMm: 0,
    },
    {
      timeMs: hourAt(14, 3),
      tempC: 22,
      feelsLikeC: 22,
      pop: 5,
      condition: 'Ясно',
      rainMm: 0,
    },
    {
      timeMs: hourAt(10, 4),
      tempC: 20,
      feelsLikeC: 20,
      pop: 15,
      condition: 'Переменная облачность',
      rainMm: 0,
    },
    {
      timeMs: hourAt(15, 4),
      tempC: 28,
      feelsLikeC: 28,
      pop: 10,
      condition: 'Ясно',
      rainMm: 0,
    },
  ],
  daily: [],
};

const chicagoSnapshot: WeatherSnapshot = {
  ...elkGroveSnapshot,
  location: {
    city: 'Chicago',
    region: 'Illinois',
    country: 'US',
    latitude: 41.8781,
    longitude: -87.6298,
  },
};

function mockWeatherFetcher(snapshot: WeatherSnapshot) {
  setWeatherFetcherForTests(async ({ query }) => {
    if (query.city?.toLowerCase().includes('чикаго') || query.city?.toLowerCase().includes('chicago')) {
      return chicagoSnapshot;
    }

    const lat = Number(query.lat);
    const lon = Number(query.lon);

    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      if (Math.abs(lat - chicagoSnapshot.location.latitude) < 1 && Math.abs(lon - chicagoSnapshot.location.longitude) < 1) {
        return chicagoSnapshot;
      }
    }

    return snapshot;
  });
}

describe('weather voice assistant module', () => {
  beforeEach(() => {
    resetWeatherLocationMemoryForTests();
    resetSharedWeatherStateForTests();
    mockWeatherFetcher(elkGroveSnapshot);
  });

  afterEach(() => {
    setWeatherFetcherForTests(null);
    resetWeatherLocationMemoryForTests();
    resetSharedWeatherStateForTests();
  });

  it('classifies direct and practical weather questions', () => {
    for (const phrase of [
      'Какая погода?',
      'Погода в Чикаго',
      'Мне брать зонт сегодня?',
      'Do I need an umbrella today?',
      'Чи брати парасольку?',
      'Как одеться завтра утром?',
    ]) {
      assert.equal(isWeatherIntent(phrase), true, phrase);
    }

    assert.equal(isWeatherIntent('Поставь будильник на 7'), false);
    assert.equal(isWeatherIntent('Создай встречу завтра'), false);
  });

  it('classifies weather advice questions separately from calendar/tasks', () => {
    const advicePhrases = [
      'Какую одежду мне завтра лучше одеть?',
      'Что надеть сегодня?',
      'Мне брать зонт?',
      'Нужна куртка?',
      'Будет холодно?',
      'Что надеть вечером?',
    ];

    for (const phrase of advicePhrases) {
      assert.equal(isWeatherIntent(phrase), true, phrase);
      assert.equal(isWeatherAdviceIntent(phrase), true, phrase);
    }

    assert.equal(isWeatherAdviceIntent('Какая погода?'), false);
    assert.equal(parseWeatherIntent('Какую одежду мне завтра лучше одеть?')?.kind, 'query');
    assert.equal(parseWeatherIntent('Какую одежду мне завтра лучше одеть?')?.questionType, 'clothing');
    assert.equal(parseWeatherIntent('Какую одежду мне завтра лучше одеть?')?.timeScope, 'tomorrow');
    assert.equal(parseWeatherIntent('Что надеть сегодня?')?.questionType, 'clothing');
    assert.equal(parseWeatherIntent('Что надеть сегодня?')?.timeScope, 'today');
    assert.equal(parseWeatherIntent('Мне брать зонт?')?.questionType, 'umbrella');
    assert.equal(parseWeatherIntent('Нужна куртка?')?.questionType, 'clothing');
    assert.equal(parseWeatherIntent('Будет холодно?')?.questionType, 'cold');
    assert.equal(parseWeatherIntent('Что надеть вечером?')?.timeScope, 'evening');
  });

  it('"Какую одежду мне завтра лучше одеть?" gives practical clothing advice', async () => {
    const result = await resolveWeatherTurn({
      transcript: 'Какую одежду мне завтра лучше одеть?',
      languageCode: 'ru-RU',
      referenceNow,
      requestDeviceLocation: async () => ({
        ok: true,
        location: {
          city: 'Elk Grove Village',
          country: 'US',
          latitude: 42,
          longitude: -88,
          source: 'gps',
          updatedAt: Date.now(),
        },
      }),
    });

    assert.match(result?.reply ?? '', /Завтра/i);
    assert.match(result?.reply ?? '', /курт/i);
  });

  it('"Что надеть сегодня?" gives practical clothing advice', async () => {
    const result = await resolveWeatherTurn({
      transcript: 'Что надеть сегодня?',
      languageCode: 'ru-RU',
      referenceNow,
      requestDeviceLocation: async () => ({
        ok: true,
        location: {
          city: 'Elk Grove Village',
          country: 'US',
          latitude: 42,
          longitude: -88,
          source: 'gps',
          updatedAt: Date.now(),
        },
      }),
    });

    assert.match(result?.reply ?? '', /Сегодня/i);
    assert.match(result?.reply ?? '', /\+/);
  });

  it('"Нужна куртка?" gives jacket advice', async () => {
    const result = await resolveWeatherTurn({
      transcript: 'Нужна куртка?',
      languageCode: 'ru-RU',
      referenceNow,
      requestDeviceLocation: async () => ({
        ok: true,
        location: {
          city: 'Elk Grove Village',
          country: 'US',
          latitude: 42,
          longitude: -88,
          source: 'gps',
          updatedAt: Date.now(),
        },
      }),
    });

    assert.match(result?.reply ?? '', /курт/i);
  });

  it('"Будет холодно?" answers with practical cold guidance', async () => {
    const result = await resolveWeatherTurn({
      transcript: 'Будет холодно?',
      languageCode: 'ru-RU',
      referenceNow,
      requestDeviceLocation: async () => ({
        ok: true,
        location: {
          city: 'Elk Grove Village',
          country: 'US',
          latitude: 42,
          longitude: -88,
          source: 'gps',
          updatedAt: Date.now(),
        },
      }),
    });

    assert.match(result?.reply ?? '', /холод|прохлад|умерен/i);
  });

  it('"Какая погода?" with geolocation available', async () => {
    setWeatherFetcherForTests(async () => elkGroveSnapshot);

    const result = await resolveWeatherTurn({
      transcript: 'Какая погода?',
      languageCode: 'ru-RU',
      referenceNow,
      requestDeviceLocation: async () => ({
        ok: true,
        location: {
          city: 'Elk Grove Village',
          region: 'Illinois',
          country: 'US',
          latitude: 42.0039,
          longitude: -87.9703,
          source: 'gps',
          updatedAt: Date.now(),
        },
      }),
    });

    assert.ok(result?.reply.includes('Elk Grove Village'));
    assert.ok(result?.reply.includes('+22°C'));
    assert.ok(result?.reply.includes('облачно'));
    assert.ok(result?.reply.includes('Днём до +26°C'));
    assert.ok(result?.reply.includes('Осадков не ожидается'));
  });

  it('"Какая погода?" with geolocation unavailable', async () => {
    const result = await resolveWeatherTurn({
      transcript: 'Какая погода?',
      languageCode: 'ru-RU',
      referenceNow,
      requestDeviceLocation: async () => ({ ok: false, reason: 'permission_denied' }),
    });

    assert.match(result?.reply ?? '', /геолокацию/);
    assert.match(result?.reply ?? '', /городе/);
  });

  it('"Погода в Чикаго"', async () => {
    const result = await resolveWeatherTurn({
      transcript: 'Погода в Чикаго',
      languageCode: 'ru-RU',
      referenceNow,
      requestDeviceLocation: async () => ({ ok: false, reason: 'permission_denied' }),
    });

    assert.ok(result?.reply.includes('Chicago'));
    assert.ok(result?.reply.includes('+22°C'));
  });

  it('"Мне брать зонт сегодня?"', async () => {
    setWeatherFetcherForTests(async ({ query }) => {
      const rainySnapshot: WeatherSnapshot = {
        ...elkGroveSnapshot,
        hourly: [
          ...elkGroveSnapshot.hourly.filter((point) => point.timeMs < hourAt(16)),
          {
            timeMs: hourAt(16),
            tempC: 24,
            feelsLikeC: 24,
            pop: 70,
            condition: 'Дождь',
            rainMm: 1.2,
          },
          ...elkGroveSnapshot.hourly.filter((point) => point.timeMs > hourAt(16)),
        ],
      };

      if (query.city?.toLowerCase().includes('chicago') || query.city?.toLowerCase().includes('чикаго')) {
        return chicagoSnapshot;
      }

      return rainySnapshot;
    });

    const result = await resolveWeatherTurn({
      transcript: 'Мне брать зонт сегодня?',
      languageCode: 'ru-RU',
      referenceNow,
      requestDeviceLocation: async () => ({
        ok: true,
        location: {
          city: 'Elk Grove Village',
          country: 'US',
          latitude: 42,
          longitude: -88,
          source: 'gps',
          updatedAt: Date.now(),
        },
      }),
    });

    assert.match(result?.reply ?? '', /лучше взять зонт:/i);
    assert.match(result?.reply ?? '', /дождь возможен (?:после|до) \d{2}:\d{2}/i);
    assert.doesNotMatch(result?.reply ?? '', /Сейчас/i);
  });

  it('"зонт брать с собой?" gives practical umbrella advice', async () => {
    setWeatherFetcherForTests(async () => ({
      ...elkGroveSnapshot,
      hourly: [
        ...elkGroveSnapshot.hourly,
        {
          timeMs: referenceNow.getTime() + 8 * 3_600_000,
          tempC: 20,
          feelsLikeC: 19,
          pop: 70,
          condition: 'Дождь',
          rainMm: 1.2,
        },
      ],
    }));

    const result = await resolveWeatherTurn({
      transcript: 'зонт брать с собой?',
      languageCode: 'ru-RU',
      referenceNow,
      requestDeviceLocation: async () => ({
        ok: true,
        location: {
          city: 'Elk Grove Village',
          country: 'US',
          latitude: 42,
          longitude: -88,
          source: 'gps',
          updatedAt: Date.now(),
        },
      }),
    });

    assert.match(result?.reply ?? '', /лучше взять зонт:/i);
    assert.match(result?.reply ?? '', /дождь возможен после 22:00/i);
    assert.doesNotMatch(result?.reply ?? '', /Сейчас/i);
    assert.doesNotMatch(result?.reply ?? '', /пасмурно/i);
  });

  it('"Будет ли дождь вечером?"', async () => {
    setWeatherFetcherForTests(async () => ({
      ...elkGroveSnapshot,
      hourly: [
        ...elkGroveSnapshot.hourly,
          {
            timeMs: referenceNow.getTime() + 4 * 3_600_000,
            tempC: 20,
            feelsLikeC: 19,
            pop: 80,
            condition: 'Дождь',
            rainMm: 2,
          },
      ],
    }));

    const result = await resolveWeatherTurn({
      transcript: 'Будет ли дождь вечером?',
      languageCode: 'ru-RU',
      referenceNow,
      requestDeviceLocation: async () => ({
        ok: true,
        location: {
          city: 'Elk Grove Village',
          country: 'US',
          latitude: 42,
          longitude: -88,
          source: 'gps',
          updatedAt: Date.now(),
        },
      }),
    });

    assert.match(result?.reply ?? '', /дождь возможен после 18:00/i);
  });

  it('"Как одеться завтра утром?"', async () => {
    const result = await resolveWeatherTurn({
      transcript: 'Как одеться завтра утром?',
      languageCode: 'ru-RU',
      referenceNow,
      requestDeviceLocation: async () => ({
        ok: true,
        location: {
          city: 'Elk Grove Village',
          country: 'US',
          latitude: 42,
          longitude: -88,
          source: 'gps',
          updatedAt: Date.now(),
        },
      }),
    });

    assert.match(result?.reply ?? '', /\+14°C/);
    assert.match(result?.reply ?? '', /\+24°C/);
    assert.match(result?.reply ?? '', /курт/i);
  });

  it('"Do I need an umbrella today?"', async () => {
    const result = await resolveWeatherTurn({
      transcript: 'Do I need an umbrella today?',
      languageCode: 'en-US',
      referenceNow,
      requestDeviceLocation: async () => ({
        ok: true,
        location: {
          city: 'Elk Grove Village',
          country: 'US',
          latitude: 42,
          longitude: -88,
          source: 'gps',
          updatedAt: Date.now(),
        },
      }),
    });

    assert.match(result?.reply ?? '', /umbrella/i);
  });

  it('"Чи брати парасольку?"', async () => {
    setWeatherFetcherForTests(async ({ query }) => {
      const rainySnapshot: WeatherSnapshot = {
        ...elkGroveSnapshot,
        hourly: [
          ...elkGroveSnapshot.hourly,
          {
            timeMs: hourAt(16),
            tempC: 24,
            feelsLikeC: 24,
            pop: 70,
            condition: 'Дощ',
            rainMm: 1.2,
          },
        ],
      };

      if (query.city?.toLowerCase().includes('chicago') || query.city?.toLowerCase().includes('чикаго')) {
        return chicagoSnapshot;
      }

      return rainySnapshot;
    });

    const result = await resolveWeatherTurn({
      transcript: 'Чи брати парасольку?',
      languageCode: 'uk-UA',
      referenceNow,
      requestDeviceLocation: async () => ({
        ok: true,
        location: {
          city: 'Elk Grove Village',
          country: 'US',
          latitude: 42,
          longitude: -88,
          source: 'gps',
          updatedAt: Date.now(),
        },
      }),
    });

    assert.match(result?.reply ?? '', /парасольку/i);
  });

  it('reuses last known city after location update', async () => {
    await resolveWeatherTurn({
      transcript: 'Я сейчас в Чикаго',
      languageCode: 'ru-RU',
      referenceNow,
      requestDeviceLocation: async () => ({ ok: false, reason: 'permission_denied' }),
    });

    const result = await resolveWeatherTurn({
      transcript: 'Какая погода завтра?',
      languageCode: 'ru-RU',
      referenceNow,
      requestDeviceLocation: async () => ({ ok: false, reason: 'permission_denied' }),
    });

    assert.ok(result?.reply.includes('Chicago'));
    assert.ok(result?.reply.includes('Завтра'));
  });

  it('publishes shared weather snapshot for Home card after voice weather request', async () => {
    await resolveWeatherTurn({
      transcript: 'Какая погода?',
      languageCode: 'ru-RU',
      referenceNow,
      requestDeviceLocation: async () => ({
        ok: true,
        location: {
          city: 'Elk Grove Village',
          region: 'Illinois',
          country: 'US',
          latitude: 42.0039,
          longitude: -87.9703,
          source: 'gps',
          updatedAt: Date.now(),
        },
      }),
    });

    const shared = getSharedWeatherState();
    assert.ok(shared.snapshot);
    assert.equal(shared.snapshot?.current.tempC, 22);

    const homeSummary = buildWeatherSummaryFromSnapshot(shared.snapshot!);
    assert.equal(homeSummary.temperature, '+22°');
    assert.ok(homeSummary.location.length > 0);
    assert.equal(homeSummary.needsLocation, false);
  });

  it('parses day-after-tomorrow scopes before tomorrow', () => {
    assert.equal(parseWeatherIntent('Какую одежду одеть послезавтра?')?.timeScope, 'day_after_tomorrow');
    assert.equal(parseWeatherIntent('Что надеть послезавтра вечером?')?.timeScope, 'day_after_tomorrow_evening');
    assert.equal(parseWeatherIntent('Будет ли дождь послезавтра?')?.questionType, 'rain');
    assert.equal(parseWeatherIntent('Будет ли дождь послезавтра?')?.timeScope, 'day_after_tomorrow');
    assert.equal(parseWeatherIntent('Мне брать зонт послезавтра?')?.questionType, 'umbrella');
    assert.equal(parseWeatherIntent('Мне брать зонт послезавтра?')?.timeScope, 'day_after_tomorrow');
    assert.equal(parseWeatherIntent('Яка погода післязавтра?')?.timeScope, 'day_after_tomorrow');
    assert.equal(parseWeatherIntent('Що вдягнути післязавтра ввечері?')?.timeScope, 'day_after_tomorrow_evening');
    assert.notEqual(parseWeatherIntent('Какую одежду одеть послезавтра?')?.timeScope, 'tomorrow');
    assert.notEqual(parseWeatherIntent('Какую одежду одеть послезавтра?')?.timeScope, 'today');
  });

  it('answers day-after-tomorrow clothing using day +2 forecast, not today', async () => {
    const result = await resolveWeatherTurn({
      transcript: 'Какую одежду одеть послезавтра?',
      languageCode: 'ru-RU',
      referenceNow,
      requestDeviceLocation: async () => ({
        ok: true,
        location: {
          city: 'Elk Grove Village',
          country: 'US',
          latitude: 42,
          longitude: -88,
          source: 'gps',
          updatedAt: Date.now(),
        },
      }),
    });

    assert.match(result?.reply ?? '', /Послезавтра/i);
    assert.doesNotMatch(result?.reply ?? '', /Сегодня/i);
    assert.match(result?.reply ?? '', /\+11°C/);
    assert.match(result?.reply ?? '', /\+18°C/);
  });

  it('answers day-after-tomorrow evening clothing on day +2', async () => {
    const result = await resolveWeatherTurn({
      transcript: 'Что надеть послезавтра вечером?',
      languageCode: 'ru-RU',
      referenceNow,
      requestDeviceLocation: async () => ({
        ok: true,
        location: {
          city: 'Elk Grove Village',
          country: 'US',
          latitude: 42,
          longitude: -88,
          source: 'gps',
          updatedAt: Date.now(),
        },
      }),
    });

    assert.match(result?.reply ?? '', /Послезавтра/i);
    assert.match(result?.reply ?? '', /\+13°C/);
    assert.doesNotMatch(result?.reply ?? '', /Сегодня/i);
  });

  it('answers rain and umbrella for day-after-tomorrow on day +2', async () => {
    const rainResult = await resolveWeatherTurn({
      transcript: 'Будет ли дождь послезавтра?',
      languageCode: 'ru-RU',
      referenceNow,
      requestDeviceLocation: async () => ({
        ok: true,
        location: {
          city: 'Elk Grove Village',
          country: 'US',
          latitude: 42,
          longitude: -88,
          source: 'gps',
          updatedAt: Date.now(),
        },
      }),
    });

    const umbrellaResult = await resolveWeatherTurn({
      transcript: 'Мне брать зонт послезавтра?',
      languageCode: 'ru-RU',
      referenceNow,
      requestDeviceLocation: async () => ({
        ok: true,
        location: {
          city: 'Elk Grove Village',
          country: 'US',
          latitude: 42,
          longitude: -88,
          source: 'gps',
          updatedAt: Date.now(),
        },
      }),
    });

    assert.match(rainResult?.reply ?? '', /Да/i);
    assert.match(rainResult?.reply ?? '', /Послезавтра/i);
    assert.match(umbrellaResult?.reply ?? '', /лучше взять зонт/i);
    assert.doesNotMatch(umbrellaResult?.reply ?? '', /не нужен/i);
  });

  it('answers Ukrainian day-after-tomorrow weather and evening clothing', async () => {
    const weatherResult = await resolveWeatherTurn({
      transcript: 'Яка погода післязавтра?',
      languageCode: 'uk-UA',
      referenceNow,
      requestDeviceLocation: async () => ({
        ok: true,
        location: {
          city: 'Elk Grove Village',
          country: 'US',
          latitude: 42,
          longitude: -88,
          source: 'gps',
          updatedAt: Date.now(),
        },
      }),
    });

    const clothingResult = await resolveWeatherTurn({
      transcript: 'Що вдягнути післязавтра ввечері?',
      languageCode: 'uk-UA',
      referenceNow,
      requestDeviceLocation: async () => ({
        ok: true,
        location: {
          city: 'Elk Grove Village',
          country: 'US',
          latitude: 42,
          longitude: -88,
          source: 'gps',
          updatedAt: Date.now(),
        },
      }),
    });

    assert.match(weatherResult?.reply ?? '', /Післязавтра/i);
    assert.match(weatherResult?.reply ?? '', /\+11°C/);
    assert.doesNotMatch(weatherResult?.reply ?? '', /Сьогодні/i);
    assert.match(clothingResult?.reply ?? '', /Післязавтра/i);
    assert.match(clothingResult?.reply ?? '', /\+13°C/);
  });

  it('parses next week and specific date scopes', () => {
    const timeZone = 'America/Chicago';
    const ruOptions = { referenceNow, timeZone, locale: 'ru' as const };
    const ukOptions = { referenceNow, timeZone, locale: 'uk' as const };
    const enOptions = { referenceNow, timeZone, locale: 'en' as const };

    assert.equal(parseWeatherIntent('Какая погода будет на следующей неделе?', ruOptions)?.timeScope, 'next_week');
    assert.equal(parseWeatherIntent('Какая погода ожидается 20 июня?', ruOptions)?.timeScope, 'specific_date');
    assert.equal(parseWeatherIntent('Какая погода ожидается 20 июня?', ruOptions)?.targetLabel, '20 июня');
    assert.equal(parseWeatherIntent('Яка погода буде 20 червня?', ukOptions)?.timeScope, 'specific_date');
    assert.equal(parseWeatherIntent('Яка погода буде 20 червня?', ukOptions)?.targetLabel, '20 червня');
    assert.equal(parseWeatherIntent('What is the weather on June 20?', enOptions)?.timeScope, 'specific_date');
    assert.equal(parseWeatherIntent('What is the weather on June 20?', enOptions)?.targetLabel, 'June 20');
    assert.equal(parseWeatherIntent('Какая погода 06/20?', ruOptions)?.timeScope, 'specific_date');
    assert.equal(parseWeatherIntent('Какая погода 2026-06-20?', ruOptions)?.timeScope, 'specific_date');
    assert.equal(parseWeatherIntent('Какая погода 2026-06-20?', ruOptions)?.targetDayKey, '2026-06-20');
  });

  it('parses 5-day forecast range intents in RU/UA/EN', () => {
    const timeZone = 'America/Chicago';
    const ruOptions = { referenceNow, timeZone, locale: 'ru' as const };
    const ukOptions = { referenceNow, timeZone, locale: 'uk' as const };
    const enOptions = { referenceNow, timeZone, locale: 'en' as const };

    for (const phrase of [
      'Дай прогноз погоды на ближайшие 5 дней',
      'Какая погода ожидается в следующие пять дней?',
    ]) {
      assert.equal(isFiveDayForecastIntent(phrase), true, phrase);
      assert.equal(parseWeatherIntent(phrase, ruOptions)?.timeScope, 'next_5_days', phrase);
    }

    assert.equal(isFiveDayForecastIntent('Погода на наступні 5 днів'), true);
    assert.equal(parseWeatherIntent('Погода на наступні 5 днів', ukOptions)?.timeScope, 'next_5_days');

    for (const phrase of ['Weather for the next 5 days', 'five day forecast']) {
      assert.equal(isFiveDayForecastIntent(phrase), true, phrase);
      assert.equal(parseWeatherIntent(phrase, enOptions)?.timeScope, 'next_5_days', phrase);
    }
  });

  it('returns 5-day forecast summary for direct range requests in RU/UA/EN', async () => {
    const mockLocation = async () => ({
      ok: true as const,
      location: {
        city: 'Elk Grove Village',
        country: 'US',
        latitude: 42,
        longitude: -88,
        source: 'gps' as const,
        updatedAt: Date.now(),
      },
    });

    const ruResult = await resolveWeatherTurn({
      transcript: 'Дай прогноз погоды на ближайшие 5 дней',
      languageCode: 'ru-RU',
      referenceNow,
      requestDeviceLocation: mockLocation,
    });

    const ukResult = await resolveWeatherTurn({
      transcript: 'Погода на наступні 5 днів',
      languageCode: 'uk-UA',
      referenceNow,
      requestDeviceLocation: mockLocation,
    });

    const enResult = await resolveWeatherTurn({
      transcript: 'Weather for the next 5 days',
      languageCode: 'en-US',
      referenceNow,
      requestDeviceLocation: mockLocation,
    });

    assert.match(ruResult?.reply ?? '', /Прогноз на ближайшие 5 дней/i);
    assert.match(ruResult?.reply ?? '', /Сегодня:/i);
    assert.match(ruResult?.reply ?? '', /Завтра:/i);
    assert.match(ruResult?.reply ?? '', /Послезавтра:/i);
    assert.match(ruResult?.reply ?? '', /от \+14°C до \+26°C/i);
    assert.doesNotMatch(ruResult?.reply ?? '', /Сейчас/i);

    assert.match(ukResult?.reply ?? '', /Прогноз на найближчі 5 днів/i);
    assert.match(ukResult?.reply ?? '', /Сьогодні:/i);
    assert.match(ukResult?.reply ?? '', /Завтра:/i);
    assert.doesNotMatch(ukResult?.reply ?? '', /Зараз/i);

    assert.match(enResult?.reply ?? '', /5-day forecast for/i);
    assert.match(enResult?.reply ?? '', /Today:/i);
    assert.match(enResult?.reply ?? '', /Tomorrow:/i);
    assert.doesNotMatch(enResult?.reply ?? '', /Right now/i);
  });

  it('returns 5-day forecast for next week with limit preamble', async () => {
    const result = await resolveWeatherTurn({
      transcript: 'Какая погода будет на следующей неделе?',
      languageCode: 'ru-RU',
      referenceNow,
      requestDeviceLocation: async () => ({
        ok: true,
        location: {
          city: 'Elk Grove Village',
          country: 'US',
          latitude: 42,
          longitude: -88,
          source: 'gps',
          updatedAt: Date.now(),
        },
      }),
    });

    assert.match(result?.reply ?? '', /У меня есть прогноз только на ближайшие 5 дней/i);
    assert.match(result?.reply ?? '', /Вот он/i);
    assert.match(result?.reply ?? '', /Прогноз на ближайшие 5 дней/i);
    assert.match(result?.reply ?? '', /Сегодня:/i);
    assert.match(result?.reply ?? '', /Завтра:/i);
    assert.match(result?.reply ?? '', /от \+14°C до \+26°C/i);
    assert.doesNotMatch(result?.reply ?? '', /Сейчас/i);
  });

  it('returns 5-day limit for out-of-range June 20 queries', async () => {
    const ruResult = await resolveWeatherTurn({
      transcript: 'Какая погода ожидается 20 июня?',
      languageCode: 'ru-RU',
      referenceNow,
      requestDeviceLocation: async () => ({
        ok: true,
        location: {
          city: 'Elk Grove Village',
          country: 'US',
          latitude: 42,
          longitude: -88,
          source: 'gps',
          updatedAt: Date.now(),
        },
      }),
    });

    const ukResult = await resolveWeatherTurn({
      transcript: 'Яка погода буде 20 червня?',
      languageCode: 'uk-UA',
      referenceNow,
      requestDeviceLocation: async () => ({
        ok: true,
        location: {
          city: 'Elk Grove Village',
          country: 'US',
          latitude: 42,
          longitude: -88,
          source: 'gps',
          updatedAt: Date.now(),
        },
      }),
    });

    const enResult = await resolveWeatherTurn({
      transcript: 'What is the weather on June 20?',
      languageCode: 'en-US',
      referenceNow,
      requestDeviceLocation: async () => ({
        ok: true,
        location: {
          city: 'Elk Grove Village',
          country: 'US',
          latitude: 42,
          longitude: -88,
          source: 'gps',
          updatedAt: Date.now(),
        },
      }),
    });

    assert.match(ruResult?.reply ?? '', /ближайшие 5 дней/i);
    assert.match(ruResult?.reply ?? '', /20 июня/i);
    assert.doesNotMatch(ruResult?.reply ?? '', /Сегодня/i);

    assert.match(ukResult?.reply ?? '', /найближчі 5 днів/i);
    assert.match(ukResult?.reply ?? '', /20 червня/i);
    assert.doesNotMatch(ukResult?.reply ?? '', /Сьогодні/i);

    assert.match(enResult?.reply ?? '', /next 5 days/i);
    assert.match(enResult?.reply ?? '', /June 20/i);
    assert.doesNotMatch(enResult?.reply ?? '', /Today/i);
    assert.doesNotMatch(enResult?.reply ?? '', /Right now/i);
  });

  it('answers in-range specific date using forecast for that day', async () => {
    const result = await resolveWeatherTurn({
      transcript: 'Какая погода 31 мая?',
      languageCode: 'ru-RU',
      referenceNow,
      requestDeviceLocation: async () => ({
        ok: true,
        location: {
          city: 'Elk Grove Village',
          country: 'US',
          latitude: 42,
          longitude: -88,
          source: 'gps',
          updatedAt: Date.now(),
        },
      }),
    });

    assert.match(result?.reply ?? '', /31 мая/i);
    assert.match(result?.reply ?? '', /\+16°C/);
    assert.doesNotMatch(result?.reply ?? '', /ближайшие 5 дней/i);
    assert.doesNotMatch(result?.reply ?? '', /Сегодня/i);
  });

  it('extracts explicit city from «ожидается в {city}» phrasing', () => {
    const timeZone = 'America/Chicago';
    const ruOptions = { referenceNow, timeZone, locale: 'ru' as const };
    const transcript = 'Какая погода ожидается в Майами на ближайшие пять дней?';

    assert.equal(extractWeatherCityFromTranscript(transcript), 'Майами');
    assert.equal(parseWeatherIntent(transcript, ruOptions)?.city, 'Майами');
    assert.equal(parseWeatherIntent(transcript, ruOptions)?.timeScope, 'next_5_days');
  });

  it('fetches explicit city weather instead of device location for Miami 5-day query', async () => {
    const miamiSnapshot: WeatherSnapshot = {
      ...elkGroveSnapshot,
      location: {
        city: 'Miami',
        region: 'Florida',
        country: 'US',
        latitude: 25.7617,
        longitude: -80.1918,
      },
    };

    let capturedQuery: Record<string, string> | null = null;

    setWeatherFetcherForTests(async ({ query }) => {
      capturedQuery = query;
      return miamiSnapshot;
    });

    const result = await resolveWeatherTurn({
      transcript: 'Какая погода ожидается в Майами на ближайшие пять дней?',
      languageCode: 'ru-RU',
      referenceNow,
      requestDeviceLocation: async () => {
        throw new Error('device location must not be used when city is explicit');
      },
    });

    assert.equal(capturedQuery?.city, 'Майами');
    assert.match(result?.reply ?? '', /Прогноз на ближайшие 5 дней/i);
    assert.match(result?.reply ?? '', /Miami/i);
    assert.doesNotMatch(result?.reply ?? '', /Elk Grove/i);
    assert.doesNotMatch(result?.reply ?? '', /Сейчас/i);
  });

  it('always returns 5-day forecast for «на ближайшие пять дней» without explicit city', async () => {
    const result = await resolveWeatherTurn({
      transcript: 'Какая погода ожидается на ближайшие пять дней?',
      languageCode: 'ru-RU',
      referenceNow,
      requestDeviceLocation: async () => ({
        ok: true,
        location: {
          city: 'Elk Grove Village',
          country: 'US',
          latitude: 42,
          longitude: -88,
          source: 'gps',
          updatedAt: Date.now(),
        },
      }),
    });

    assert.match(result?.reply ?? '', /Прогноз на ближайшие 5 дней/i);
    assert.match(result?.reply ?? '', /Сегодня:/i);
    assert.match(result?.reply ?? '', /Завтра:/i);
    assert.doesNotMatch(result?.reply ?? '', /Сейчас/i);
    assert.doesNotMatch(result?.reply ?? '', /Сейчас в/i);
  });
});
