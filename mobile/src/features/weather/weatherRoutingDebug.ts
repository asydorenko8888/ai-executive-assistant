import type { WeatherTimeScope } from '@/src/features/weather/types';

export function logWeatherRoutingDebug(params: {
  transcript: string;
  parsedCity?: string;
  parsedTimeScope?: WeatherTimeScope;
  endpointParams?: Record<string, string>;
}) {
  console.log('[weather_routing]', {
    transcript: params.transcript.slice(0, 160),
    parsedCity: params.parsedCity ?? null,
    parsedWeatherRange: params.parsedTimeScope ?? null,
    endpointParams: params.endpointParams ?? null,
  });
}
