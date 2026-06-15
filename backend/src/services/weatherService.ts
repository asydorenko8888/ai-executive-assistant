export type WeatherHourlyPoint = {
  timeMs: number;
  tempC: number;
  feelsLikeC: number;
  pop: number;
  condition: string;
  rainMm: number;
};

export type WeatherDailyPoint = {
  date: string;
  highC: number;
  lowC: number;
  pop: number;
  condition: string;
};

export type WeatherSnapshot = {
  location: {
    city: string;
    region?: string;
    country: string;
    latitude: number;
    longitude: number;
  };
  current: {
    tempC: number;
    feelsLikeC: number;
    condition: string;
    windKph: number;
  };
  today: {
    highC: number;
    lowC: number;
    pop: number;
  };
  tomorrow?: {
    highC: number;
    lowC: number;
    pop: number;
    morningLowC?: number;
    condition: string;
  };
  hourly: WeatherHourlyPoint[];
  daily: WeatherDailyPoint[];
};

type OpenWeatherCurrentResponse = {
  name: string;
  sys: { country: string };
  coord: { lat: number; lon: number };
  main: { temp: number; feels_like: number };
  weather: Array<{ description: string }>;
  wind: { speed: number };
};

type OpenWeatherForecastItem = {
  dt: number;
  main: { temp: number; feels_like: number; temp_max: number; temp_min: number };
  weather: Array<{ description: string }>;
  pop: number;
  rain?: { '3h'?: number };
};

type OpenWeatherForecastResponse = {
  list: OpenWeatherForecastItem[];
  city: {
    name: string;
    country: string;
    coord: { lat: number; lon: number };
  };
};

type OpenWeatherGeoResponse = Array<{
  name: string;
  state?: string;
  country: string;
  lat: number;
  lon: number;
}>;

function requireWeatherApiKey(apiKey: string) {
  if (!apiKey.trim()) {
    throw new Error('WEATHER_API_KEY is not configured on the backend.');
  }
}

function capitalizeCondition(description: string) {
  const trimmed = description.trim();

  if (!trimmed) {
    return trimmed;
  }

  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function toHourlyPoint(item: OpenWeatherForecastItem): WeatherHourlyPoint {
  return {
    timeMs: item.dt * 1000,
    tempC: Math.round(item.main.temp),
    feelsLikeC: Math.round(item.main.feels_like),
    pop: Math.round(item.pop * 100),
    condition: capitalizeCondition(item.weather[0]?.description ?? ''),
    rainMm: item.rain?.['3h'] ?? 0,
  };
}

function startOfLocalDayMs(referenceMs: number, timeZone: string) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(new Date(referenceMs));
  const year = parts.find((part) => part.type === 'year')?.value ?? '1970';
  const month = parts.find((part) => part.type === 'month')?.value ?? '01';
  const day = parts.find((part) => part.type === 'day')?.value ?? '01';
  const utcGuess = Date.parse(`${year}-${month}-${day}T00:00:00Z`);

  const offsetFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'shortOffset',
    hour: '2-digit',
  });
  const offsetLabel =
    offsetFormatter.formatToParts(new Date(referenceMs)).find((part) => part.type === 'timeZoneName')
      ?.value ?? 'GMT';
  const offsetMatch = offsetLabel.match(/GMT([+-]\d{1,2})(?::(\d{2}))?/);

  if (!offsetMatch) {
    return utcGuess;
  }

  const hours = Number(offsetMatch[1]);
  const minutes = Number(offsetMatch[2] ?? '0');
  const offsetMs = (hours * 60 + Math.sign(hours) * minutes) * 60_000;

  return utcGuess - offsetMs;
}

function localDateKey(timeMs: number, timeZone: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(timeMs));
}

function buildDailyFromForecast(
  forecastItems: OpenWeatherForecastItem[],
  timeZone: string,
  referenceNowMs: number,
): WeatherDailyPoint[] {
  const grouped = new Map<string, OpenWeatherForecastItem[]>();

  for (const item of forecastItems) {
    const key = localDateKey(item.dt * 1000, timeZone);
    const bucket = grouped.get(key) ?? [];
    bucket.push(item);
    grouped.set(key, bucket);
  }

  const todayKey = localDateKey(referenceNowMs, timeZone);
  const sortedKeys = [...grouped.keys()].sort();

  return sortedKeys.map((date) => {
    const items = grouped.get(date) ?? [];
    const highC = Math.round(Math.max(...items.map((item) => item.main.temp_max)));
    const lowC = Math.round(Math.min(...items.map((item) => item.main.temp_min)));
    const pop = Math.round(Math.max(...items.map((item) => item.pop * 100)));
    const condition = capitalizeCondition(items[0]?.weather[0]?.description ?? '');

    return {
      date: date === todayKey ? 'today' : date,
      highC,
      lowC,
      pop,
      condition,
    };
  });
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Weather API ${response.status}: ${body.slice(0, 200)}`);
  }

  return (await response.json()) as T;
}

export async function geocodeWeatherCity(params: {
  apiKey: string;
  city: string;
  countryCode?: string;
}) {
  requireWeatherApiKey(params.apiKey);

  const query = encodeURIComponent(
    params.countryCode ? `${params.city},${params.countryCode}` : params.city,
  );
  const url = `https://api.openweathermap.org/geo/1.0/direct?q=${query}&limit=1&appid=${params.apiKey}`;
  const results = await fetchJson<OpenWeatherGeoResponse>(url);
  const match = results[0];

  if (!match) {
    throw new Error(`City not found: ${params.city}`);
  }

  return {
    city: match.name,
    region: match.state,
    country: match.country,
    latitude: match.lat,
    longitude: match.lon,
  };
}

export async function fetchWeatherSnapshot(params: {
  apiKey: string;
  latitude: number;
  longitude: number;
  language: 'en' | 'ru' | 'uk';
  timeZone?: string;
  referenceNowMs?: number;
}): Promise<WeatherSnapshot> {
  requireWeatherApiKey(params.apiKey);

  const lang = params.language;
  const timeZone = params.timeZone ?? 'UTC';
  const referenceNowMs = params.referenceNowMs ?? Date.now();
  const lat = params.latitude;
  const lon = params.longitude;
  const units = 'metric';

  const [current, forecast] = await Promise.all([
    fetchJson<OpenWeatherCurrentResponse>(
      `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=${units}&lang=${lang}&appid=${params.apiKey}`,
    ),
    fetchJson<OpenWeatherForecastResponse>(
      `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&units=${units}&lang=${lang}&appid=${params.apiKey}`,
    ),
  ]);

  const hourly = forecast.list.map(toHourlyPoint);
  const daily = buildDailyFromForecast(forecast.list, timeZone, referenceNowMs);
  const todayKey = localDateKey(referenceNowMs, timeZone);
  const tomorrowKey = localDateKey(referenceNowMs + 86_400_000, timeZone);

  const todayForecast = forecast.list.filter(
    (item) => localDateKey(item.dt * 1000, timeZone) === todayKey,
  );
  const tomorrowForecast = forecast.list.filter(
    (item) => localDateKey(item.dt * 1000, timeZone) === tomorrowKey,
  );

  const todayHigh = todayForecast.length
    ? Math.round(Math.max(...todayForecast.map((item) => item.main.temp_max)))
    : Math.round(current.main.temp);
  const todayLow = todayForecast.length
    ? Math.round(Math.min(...todayForecast.map((item) => item.main.temp_min)))
    : Math.round(current.main.temp);
  const todayPop = todayForecast.length
    ? Math.round(Math.max(...todayForecast.map((item) => item.pop * 100)))
    : 0;

  const tomorrowMorning = tomorrowForecast.filter((item) => {
    const hour = Number(
      new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hour12: false }).format(
        new Date(item.dt * 1000),
      ),
    );

    return hour >= 5 && hour <= 11;
  });

  const tomorrow =
    tomorrowForecast.length > 0
      ? {
          highC: Math.round(Math.max(...tomorrowForecast.map((item) => item.main.temp_max))),
          lowC: Math.round(Math.min(...tomorrowForecast.map((item) => item.main.temp_min))),
          pop: Math.round(Math.max(...tomorrowForecast.map((item) => item.pop * 100))),
          morningLowC: tomorrowMorning.length
            ? Math.round(Math.min(...tomorrowMorning.map((item) => item.main.temp_min)))
            : undefined,
          condition: capitalizeCondition(tomorrowForecast[0]?.weather[0]?.description ?? ''),
        }
      : undefined;

  return {
    location: {
      city: current.name || forecast.city.name,
      country: current.sys.country || forecast.city.country,
      latitude: current.coord.lat,
      longitude: current.coord.lon,
    },
    current: {
      tempC: Math.round(current.main.temp),
      feelsLikeC: Math.round(current.main.feels_like),
      condition: capitalizeCondition(current.weather[0]?.description ?? ''),
      windKph: Math.round(current.wind.speed * 3.6),
    },
    today: {
      highC: todayHigh,
      lowC: todayLow,
      pop: todayPop,
    },
    tomorrow,
    hourly,
    daily,
  };
}

export { startOfLocalDayMs, localDateKey };
