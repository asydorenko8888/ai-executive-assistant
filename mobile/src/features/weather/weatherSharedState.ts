import type { WeatherSnapshot } from '@/src/features/weather/types';

export type SharedWeatherState = {
  snapshot: WeatherSnapshot | null;
  fetchedAt: number | null;
  needsLocation: boolean;
};

const listeners = new Set<(state: SharedWeatherState) => void>();

let sharedWeatherState: SharedWeatherState = {
  snapshot: null,
  fetchedAt: null,
  needsLocation: false,
};

export function getSharedWeatherState() {
  return sharedWeatherState;
}

export function subscribeSharedWeather(listener: (state: SharedWeatherState) => void) {
  listeners.add(listener);
  listener(sharedWeatherState);

  return () => {
    listeners.delete(listener);
  };
}

function emitSharedWeatherState() {
  for (const listener of listeners) {
    listener(sharedWeatherState);
  }
}

export function publishSharedWeatherSnapshot(snapshot: WeatherSnapshot) {
  sharedWeatherState = {
    snapshot,
    fetchedAt: Date.now(),
    needsLocation: false,
  };
  emitSharedWeatherState();
}

export function publishSharedWeatherNeedsLocation() {
  sharedWeatherState = {
    snapshot: null,
    fetchedAt: null,
    needsLocation: true,
  };
  emitSharedWeatherState();
}

export function resetSharedWeatherStateForTests() {
  sharedWeatherState = {
    snapshot: null,
    fetchedAt: null,
    needsLocation: false,
  };
  emitSharedWeatherState();
}
