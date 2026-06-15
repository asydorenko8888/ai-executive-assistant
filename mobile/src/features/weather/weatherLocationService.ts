import type { KnownWeatherLocation } from '@/src/features/weather/types';

export type DeviceGeolocationResult =
  | {
      ok: true;
      location: KnownWeatherLocation;
    }
  | {
      ok: false;
      reason: 'permission_denied' | 'unavailable' | 'timeout';
    };

type LocationModule = typeof import('expo-location');

let locationModulePromise: Promise<LocationModule> | null = null;

async function loadLocationModule() {
  if (!locationModulePromise) {
    locationModulePromise = import('expo-location');
  }

  return locationModulePromise;
}

export async function requestDeviceWeatherLocation(): Promise<DeviceGeolocationResult> {
  try {
    const Location = await loadLocationModule();
    const permission = await Location.requestForegroundPermissionsAsync();

    if (!permission.granted) {
      return { ok: false, reason: 'permission_denied' };
    }

    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    const [geocode] = await Location.reverseGeocodeAsync({
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    });

    const city = geocode?.city || geocode?.subregion || geocode?.region || 'Current location';
    const region = geocode?.region ?? undefined;
    const country = geocode?.isoCountryCode ?? geocode?.country ?? '';

    return {
      ok: true,
      location: {
        city,
        region,
        country,
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        source: 'gps',
        updatedAt: Date.now(),
      },
    };
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
}

export async function geocodeUserProvidedCity(city: string): Promise<KnownWeatherLocation | null> {
  const { fetchWeatherByCity } = await import('@/src/features/weather/weatherService');
  const snapshot = await fetchWeatherByCity({ city });

  if (!snapshot) {
    return null;
  }

  return {
    city: snapshot.location.city,
    region: snapshot.location.region,
    country: snapshot.location.country,
    latitude: snapshot.location.latitude,
    longitude: snapshot.location.longitude,
    source: 'user',
    updatedAt: Date.now(),
  };
}
