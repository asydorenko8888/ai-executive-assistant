import type { KnownWeatherLocation } from '@/src/features/weather/types';

const WEATHER_LOCATION_STORAGE_KEY = 'weather:lastKnownLocation';

let inMemoryLocation: KnownWeatherLocation | null = null;
let persistenceDisabledForTests = false;

export async function getLastKnownWeatherLocation() {
  if (inMemoryLocation) {
    return inMemoryLocation;
  }

  if (persistenceDisabledForTests) {
    return null;
  }

  const { getStoredJson } = await import('@/src/shared/storage/asyncStorage');
  inMemoryLocation = await getStoredJson<KnownWeatherLocation | null>(WEATHER_LOCATION_STORAGE_KEY, null);
  return inMemoryLocation;
}

export async function saveLastKnownWeatherLocation(location: KnownWeatherLocation) {
  inMemoryLocation = location;

  if (persistenceDisabledForTests) {
    return location;
  }

  const { setStoredJson } = await import('@/src/shared/storage/asyncStorage');
  await setStoredJson(WEATHER_LOCATION_STORAGE_KEY, location);
  return location;
}

export function resetWeatherLocationMemoryForTests() {
  inMemoryLocation = null;
  persistenceDisabledForTests = true;
}

export async function clearLastKnownWeatherLocationForTests() {
  inMemoryLocation = null;
  persistenceDisabledForTests = true;

  const { setStoredJson } = await import('@/src/shared/storage/asyncStorage');
  await setStoredJson(WEATHER_LOCATION_STORAGE_KEY, null);
}
