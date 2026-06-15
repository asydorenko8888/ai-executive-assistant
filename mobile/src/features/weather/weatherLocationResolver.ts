import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguageLocale';
import {
  buildWeatherCityNotFoundReply,
  buildWeatherLocationPermissionReply,
} from '@/src/features/weather/weatherReply';
import { getLastKnownWeatherLocation, saveLastKnownWeatherLocation } from '@/src/features/weather/weatherLocationMemory';
import {
  geocodeUserProvidedCity,
  requestDeviceWeatherLocation,
  type DeviceGeolocationResult,
} from '@/src/features/weather/weatherLocationService';
import type { KnownWeatherLocation } from '@/src/features/weather/types';

export type WeatherLocationResolution =
  | { ok: true; location: KnownWeatherLocation }
  | { ok: false; reason: 'city_not_found' | 'location_needed'; reply: string };

export async function resolveWeatherLocation(params: {
  city?: string;
  languageCode: VoiceLanguageCode;
  requestDeviceLocation?: () => Promise<DeviceGeolocationResult>;
}): Promise<WeatherLocationResolution> {
  const requestDeviceLocation = params.requestDeviceLocation ?? requestDeviceWeatherLocation;

  if (params.city) {
    const geocoded = await geocodeUserProvidedCity(params.city);

    if (!geocoded) {
      return {
        ok: false,
        reason: 'city_not_found',
        reply: buildWeatherCityNotFoundReply(params.city, params.languageCode),
      };
    }

    await saveLastKnownWeatherLocation(geocoded);
    return { ok: true, location: geocoded };
  }

  const deviceLocation = await requestDeviceLocation();

  if (deviceLocation.ok) {
    await saveLastKnownWeatherLocation(deviceLocation.location);
    return { ok: true, location: deviceLocation.location };
  }

  const remembered = await getLastKnownWeatherLocation();

  if (remembered) {
    return { ok: true, location: remembered };
  }

  return {
    ok: false,
    reason: 'location_needed',
    reply: buildWeatherLocationPermissionReply(params.languageCode),
  };
}
