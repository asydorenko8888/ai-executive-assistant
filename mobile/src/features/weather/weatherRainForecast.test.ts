import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { WeatherHourlyPoint, WeatherSnapshot } from '@/src/features/weather/types';
import { buildRainTimingText, groupRainPeriods } from '@/src/features/weather/weatherRainForecast';
import { isUmbrellaQuestion } from '@/src/features/weather/weatherUmbrellaTokens';
import { parseWeatherIntent, isWeatherAdviceIntent } from '@/src/features/weather/weatherClassification';
import { buildWeatherReply } from '@/src/features/weather/weatherReply';

const timeZone = 'America/Chicago';
const referenceNow = new Date('2026-05-28T14:00:00-05:00');

function slotAt(iso: string, rainy: boolean): WeatherHourlyPoint {
  return {
    timeMs: Date.parse(iso),
    tempC: 20,
    feelsLikeC: 19,
    pop: rainy ? 70 : 10,
    condition: rainy ? 'Дождь' : 'Облачно',
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
    condition: 'Облачно',
    windKph: 10,
  },
  today: { highC: 26, lowC: 14, pop: 40 },
  tomorrow: {
    highC: 24,
    lowC: 16,
    morningLowC: 16,
    pop: 60,
    condition: 'Дождь',
  },
  hourly: [],
  daily: [],
};

describe('weather umbrella synonyms', () => {
  for (const phrase of [
    'брать зонт?',
    'брать зонтик?',
    'нужен зонт?',
    'зонт брать с собой?',
    'парасолька нужна?',
    'парасоля с собой?',
    'мені брати парасольку?',
    'Do I need an umbrella?',
    'Чи брати парасольку?',
  ]) {
    it(`routes "${phrase}" to umbrella advice`, () => {
      assert.equal(isUmbrellaQuestion(phrase), true);
      assert.equal(isWeatherAdviceIntent(phrase), true);
      assert.equal(parseWeatherIntent(phrase)?.questionType, 'umbrella');
    });
  }
});

describe('weather rain timing replies', () => {
  it('rain before 10:00 only -> answer "до 10:00", not "с 10:00"', () => {
    const reply = buildRainTimingText({
      points: [
        slotAt('2026-05-29T04:00:00-05:00', true),
        slotAt('2026-05-29T07:00:00-05:00', true),
        slotAt('2026-05-29T13:00:00-05:00', false),
        slotAt('2026-05-29T16:00:00-05:00', false),
      ],
      referenceNowMs: referenceNow.getTime(),
      locale: 'ru',
      timeZone,
      scope: 'tomorrow',
    });

    assert.match(reply, /до 10:00/i);
    assert.match(reply, /после этого без дождя/i);
    assert.doesNotMatch(reply, /с 10:00/i);
    assert.doesNotMatch(reply, /с 10:00 до 22:00/i);
  });

  it('rain after 22:00 -> answer "после 22:00"', () => {
    const reply = buildRainTimingText({
      points: [
        slotAt('2026-05-28T16:00:00-05:00', false),
        slotAt('2026-05-28T19:00:00-05:00', false),
        slotAt('2026-05-28T22:00:00-05:00', true),
      ],
      referenceNowMs: referenceNow.getTime(),
      locale: 'ru',
      timeZone,
      scope: 'today',
    });

    assert.match(reply, /после 22:00/i);
    assert.doesNotMatch(reply, /с 10:00 до 22:00/i);
  });

  it('no rain -> "дождя не ожидается"', () => {
    const reply = buildRainTimingText({
      points: [
        slotAt('2026-05-28T16:00:00-05:00', false),
        slotAt('2026-05-28T19:00:00-05:00', false),
      ],
      referenceNowMs: referenceNow.getTime(),
      locale: 'ru',
      timeZone,
      scope: 'today',
    });

    assert.match(reply, /дождя не ожидается/i);
  });

  it('groups only contiguous forecast slots into one rain period', () => {
    const periods = groupRainPeriods([
      slotAt('2026-05-28T07:00:00-05:00', true),
      slotAt('2026-05-28T22:00:00-05:00', true),
    ]);

    assert.equal(periods.length, 2);
  });

  it('clothing tomorrow + rain -> includes umbrella/raincoat', () => {
    const snapshot: WeatherSnapshot = {
      ...baseSnapshot,
      hourly: [
        slotAt('2026-05-29T04:00:00-05:00', true),
        slotAt('2026-05-29T07:00:00-05:00', true),
        slotAt('2026-05-29T13:00:00-05:00', false),
      ],
    };

    const reply = buildWeatherReply({
      snapshot,
      intent: {
        kind: 'query',
        questionType: 'clothing',
        timeScope: 'tomorrow',
      },
      languageCode: 'ru-RU',
      referenceNow,
    });

    assert.match(reply, /Завтра утром/i);
    assert.match(reply, /\+16°C/i);
    assert.match(reply, /\+24°C/i);
    assert.match(reply, /зонт/i);
    assert.match(reply, /до 10:00/i);
    assert.doesNotMatch(reply, /Сейчас/i);
  });

  it('clothing tomorrow + no rain -> explicitly says no umbrella', () => {
    const reply = buildWeatherReply({
      snapshot: {
        ...baseSnapshot,
        tomorrow: {
          ...baseSnapshot.tomorrow!,
          pop: 10,
          condition: 'Ясно',
        },
      },
      intent: {
        kind: 'query',
        questionType: 'clothing',
        timeScope: 'tomorrow',
      },
      languageCode: 'en-US',
      referenceNow,
    });

    assert.match(reply, /Tomorrow morning/i);
    assert.match(reply, /No umbrella needed/i);
  });

  it('clothing tomorrow + rain -> proactive umbrella guidance in English', () => {
    const snapshot: WeatherSnapshot = {
      ...baseSnapshot,
      hourly: [
        slotAt('2026-05-29T04:00:00-05:00', true),
        slotAt('2026-05-29T07:00:00-05:00', true),
        slotAt('2026-05-29T13:00:00-05:00', false),
      ],
    };

    const reply = buildWeatherReply({
      snapshot,
      intent: {
        kind: 'query',
        questionType: 'clothing',
        timeScope: 'tomorrow',
      },
      languageCode: 'en-US',
      referenceNow,
    });

    assert.match(reply, /Tomorrow morning will be cool/i);
    assert.match(reply, /A light jacket is enough/i);
    assert.match(reply, /umbrella would be a good idea/i);
    assert.match(reply, /until 10:00/i);
  });

  it('umbrella question uses practical rain clause from forecast slots', () => {
    const snapshot: WeatherSnapshot = {
      ...baseSnapshot,
      hourly: [
        slotAt('2026-05-28T10:00:00-05:00', false),
        slotAt('2026-05-28T22:00:00-05:00', true),
      ],
    };

    const reply = buildWeatherReply({
      snapshot,
      intent: {
        kind: 'query',
        questionType: 'umbrella',
        timeScope: 'today',
      },
      languageCode: 'ru-RU',
      referenceNow,
    });

    assert.match(reply, /лучше взять зонт:/i);
    assert.match(reply, /после 22:00/i);
    assert.doesNotMatch(reply, /Сейчас/i);
  });
});

describe('weather clothing classification', () => {
  it('"Что лучше одеть завтра?" routes to clothing advice', () => {
    assert.equal(parseWeatherIntent('Что лучше одеть завтра?')?.questionType, 'clothing');
    assert.equal(parseWeatherIntent('Что лучше одеть завтра?')?.timeScope, 'tomorrow');
  });

  it('"Когда будет дождь?" routes to rain timing without yes/no wrapper', () => {
    assert.equal(parseWeatherIntent('Когда будет дождь?')?.questionType, 'rain_timing');

    const snapshot: WeatherSnapshot = {
      ...baseSnapshot,
      hourly: [
        slotAt('2026-05-28T16:00:00-05:00', false),
        slotAt('2026-05-28T22:00:00-05:00', true),
      ],
    };

    const reply = buildWeatherReply({
      snapshot,
      intent: parseWeatherIntent('Когда будет дождь?') as Extract<
        ReturnType<typeof parseWeatherIntent>,
        { kind: 'query' }
      >,
      languageCode: 'ru-RU',
      referenceNow,
    });

    assert.match(reply, /после 22:00/i);
    assert.doesNotMatch(reply, /^Да,/i);
    assert.doesNotMatch(reply, /^Нет/i);
  });
});
