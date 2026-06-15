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

export type KnownWeatherLocation = {
  city: string;
  region?: string;
  country: string;
  latitude: number;
  longitude: number;
  source: 'gps' | 'user';
  updatedAt: number;
};

export type WeatherQuestionType =
  | 'general'
  | 'umbrella'
  | 'clothing'
  | 'rain'
  | 'rain_timing'
  | 'temperature'
  | 'cold'
  | 'heat'
  | 'wind'
  | 'outdoor'
  | 'beach';

export type WeatherTimeScope =
  | 'now'
  | 'today'
  | 'tomorrow'
  | 'day_after_tomorrow'
  | 'day_after_tomorrow_morning'
  | 'day_after_tomorrow_evening'
  | 'next_week'
  | 'next_5_days'
  | 'specific_date'
  | 'morning'
  | 'evening'
  | 'unspecified';

export type WeatherIntent =
  | {
      kind: 'query';
      questionType: WeatherQuestionType;
      timeScope: WeatherTimeScope;
      city?: string;
      targetDayKey?: string;
      targetLabel?: string;
      forecastOutOfRange?: boolean;
    }
  | {
      kind: 'location_update';
      city: string;
    };
