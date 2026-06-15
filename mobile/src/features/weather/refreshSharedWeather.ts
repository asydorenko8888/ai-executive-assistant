import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguageLocale';
import { resolveWeatherLocation } from '@/src/features/weather/weatherLocationResolver';
import { saveLastKnownWeatherLocation } from '@/src/features/weather/weatherLocationMemory';
import {
  publishSharedWeatherNeedsLocation,
  publishSharedWeatherSnapshot,
} from '@/src/features/weather/weatherSharedState';
import { fetchWeatherByCity, fetchWeatherSnapshot, isWeatherFetcherOverridden } from '@/src/features/weather/weatherService';
import type { WeatherSnapshot } from '@/src/features/weather/types';
import type { DeviceGeolocationResult } from '@/src/features/weather/weatherLocationService';

export type RefreshSharedWeatherParams = {
  languageCode: VoiceLanguageCode;
  referenceNow?: Date;
  city?: string;
  requestDeviceLocation?: () => Promise<DeviceGeolocationResult>;
};

export async function refreshSharedWeather(
  params: RefreshSharedWeatherParams,
): Promise<WeatherSnapshot | null> {
  if (!isWeatherFetcherOverridden()) {
    const { env } = await import('@/src/shared/config');

    if (!env.weatherEnabled) {
      publishSharedWeatherNeedsLocation();
      return null;
    }
  }

  const referenceNow = params.referenceNow ?? new Date();
  const locationResult = await resolveWeatherLocation({
    city: params.city,
    languageCode: params.languageCode,
    requestDeviceLocation: params.requestDeviceLocation,
  });

  if (!locationResult.ok) {
    if (locationResult.reason === 'location_needed') {
      publishSharedWeatherNeedsLocation();
    }

    return null;
  }

  const snapshot = params.city
    ? await fetchWeatherByCity({
        city: params.city,
        languageCode: params.languageCode,
        referenceNow,
      })
    : await fetchWeatherSnapshot({
        latitude: locationResult.location.latitude,
        longitude: locationResult.location.longitude,
        languageCode: params.languageCode,
        referenceNow,
      });

  if (!snapshot) {
    return null;
  }

  await saveLastKnownWeatherLocation({
    city: snapshot.location.city,
    region: snapshot.location.region,
    country: snapshot.location.country,
    latitude: snapshot.location.latitude,
    longitude: snapshot.location.longitude,
    source: params.city ? 'user' : locationResult.location.source,
    updatedAt: Date.now(),
  });

  publishSharedWeatherSnapshot(snapshot);
  return snapshot;
}
