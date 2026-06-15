import type { WeatherSummary } from '@/src/entities/home/types';
import type { IconName } from '@/src/shared/types/icon';
import type { WeatherSnapshot } from '@/src/features/weather/types';

function formatTemperature(tempC: number) {
  const sign = tempC > 0 ? '+' : '';
  return `${sign}${tempC}°`;
}

function formatLocationLabel(snapshot: WeatherSnapshot) {
  const { city, region, country } = snapshot.location;
  const cityLine = region ? `${city}, ${region}` : city;

  if (country && !cityLine.includes(country)) {
    return `${cityLine}, ${country}`;
  }

  return cityLine;
}

function resolveConditionIcon(condition: string): IconName {
  const lower = condition.toLowerCase();

  if (/rain|dожд|дощ|shower|лив/i.test(lower)) {
    return 'rainy-outline';
  }

  if (/snow|снег|сніг/i.test(lower)) {
    return 'snow-outline';
  }

  if (/clear|ясн|sun|сон/i.test(lower)) {
    return 'sunny-outline';
  }

  if (/cloud|облач|хмар|overcast/i.test(lower)) {
    return 'partly-sunny-outline';
  }

  if (/storm|гроз|thunder/i.test(lower)) {
    return 'thunderstorm-outline';
  }

  return 'partly-sunny-outline';
}

export function buildWeatherSummaryFromSnapshot(snapshot: WeatherSnapshot): WeatherSummary {
  const rainChance = snapshot.today.pop;

  return {
    location: formatLocationLabel(snapshot),
    temperature: formatTemperature(snapshot.current.tempC),
    conditionIcon: resolveConditionIcon(snapshot.current.condition),
    metrics: [
      {
        id: 'condition',
        label: 'Condition',
        value: snapshot.current.condition,
      },
      {
        id: 'feels-like',
        label: 'Feels like',
        value: formatTemperature(snapshot.current.feelsLikeC),
      },
      {
        id: 'rain',
        label: 'Rain',
        value: `${rainChance}%`,
      },
    ],
    needsLocation: false,
    isLoading: false,
  };
}

export function buildLocationNeededWeatherSummary(): WeatherSummary {
  return {
    location: 'Location needed',
    temperature: '--',
    conditionIcon: 'location-outline',
    metrics: [
      {
        id: 'hint',
        label: 'Status',
        value: 'Enable location or ask weather by voice',
      },
    ],
    needsLocation: true,
    isLoading: false,
  };
}

export function buildLoadingWeatherSummary(): WeatherSummary {
  return {
    location: 'Updating weather…',
    temperature: '--',
    conditionIcon: 'partly-sunny-outline',
    metrics: [],
    needsLocation: false,
    isLoading: true,
  };
}
