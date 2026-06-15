import { useCallback, useContext, useEffect, useRef } from 'react';
import { useFocusEffect } from 'expo-router';

import type { WeatherSummary } from '@/src/entities/home/types';
import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguageLocale';
import {
  buildLoadingWeatherSummary,
  buildLocationNeededWeatherSummary,
  buildWeatherSummaryFromSnapshot,
} from '@/src/features/weather/weatherHomeSummary';
import { refreshSharedWeather } from '@/src/features/weather/refreshSharedWeather';
import {
  getSharedWeatherState,
  subscribeSharedWeather,
} from '@/src/features/weather/weatherSharedState';
import { AssistantStoreContext } from '@/src/store/assistantStore';

function mapSharedStateToSummary(): WeatherSummary {
  const shared = getSharedWeatherState();

  if (shared.needsLocation) {
    return buildLocationNeededWeatherSummary();
  }

  if (shared.snapshot) {
    return buildWeatherSummaryFromSnapshot(shared.snapshot);
  }

  return buildLocationNeededWeatherSummary();
}

export function useHomeWeather(languageCode: VoiceLanguageCode) {
  const storeApi = useContext(AssistantStoreContext);
  const refreshInFlightRef = useRef(false);

  const applyWeatherSummary = useCallback(
    (weather: WeatherSummary) => {
      if (!storeApi) {
        return;
      }

      const { homeDashboard, setHomeDashboard } = storeApi.getState();
      setHomeDashboard({ ...homeDashboard, weather });
    },
    [storeApi],
  );

  const refreshHomeWeather = useCallback(async () => {
    if (refreshInFlightRef.current) {
      return;
    }

    refreshInFlightRef.current = true;
    applyWeatherSummary(buildLoadingWeatherSummary());

    try {
      await refreshSharedWeather({ languageCode });
      applyWeatherSummary(mapSharedStateToSummary());
    } finally {
      refreshInFlightRef.current = false;
    }
  }, [applyWeatherSummary, languageCode]);

  useEffect(() => {
    applyWeatherSummary(mapSharedStateToSummary());

    return subscribeSharedWeather(() => {
      applyWeatherSummary(mapSharedStateToSummary());
    });
  }, [applyWeatherSummary]);

  useEffect(() => {
    void refreshHomeWeather();
  }, [refreshHomeWeather]);

  useFocusEffect(
    useCallback(() => {
      void refreshHomeWeather();
    }, [refreshHomeWeather]),
  );

  return {
    refreshHomeWeather,
  };
}
