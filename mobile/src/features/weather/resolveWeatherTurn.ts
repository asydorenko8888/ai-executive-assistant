import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguageLocale';
import { getChatLocaleFromVoiceLanguage } from '@/src/features/chat/services/voiceLanguageLocale';
import { parseWeatherIntent } from '@/src/features/weather/weatherClassification';
import { finalizeWeatherTimeTarget, isFiveDayForecastIntent, parseWeatherTimeTarget, buildWeatherForecastOutOfRangeReply } from '@/src/features/weather/weatherDateScope';
import { logWeatherRoutingDebug } from '@/src/features/weather/weatherRoutingDebug';
import { commitWeatherActiveReference } from '@/src/features/agent/conversation/activeConversationalReference';
import {
  buildWeatherCityNotFoundReply,
  buildWeatherLocationSavedReply,
  buildWeatherProviderUnavailableReply,
  buildWeatherReply,
} from '@/src/features/weather/weatherReply';
import { saveLastKnownWeatherLocation } from '@/src/features/weather/weatherLocationMemory';
import { resolveWeatherLocation } from '@/src/features/weather/weatherLocationResolver';
import {
  geocodeUserProvidedCity,
  requestDeviceWeatherLocation,
  type DeviceGeolocationResult,
} from '@/src/features/weather/weatherLocationService';
import { publishSharedWeatherSnapshot } from '@/src/features/weather/weatherSharedState';
import { fetchWeatherByCity, fetchWeatherSnapshot } from '@/src/features/weather/weatherService';
import { getDeviceTimeZone } from '@/src/features/weather/weatherRainForecast';
import type { WeatherIntent } from '@/src/features/weather/types';

export type WeatherTurnResult = {
  reply: string;
  spokenReply: string;
};

export type ResolveWeatherTurnParams = {
  transcript: string;
  languageCode: VoiceLanguageCode;
  referenceNow?: Date;
  requestDeviceLocation?: () => Promise<DeviceGeolocationResult>;
};

async function publishWeatherSnapshotForHome(snapshot: Parameters<typeof publishSharedWeatherSnapshot>[0]) {
  publishSharedWeatherSnapshot(snapshot);
}

export async function resolveWeatherTurn(
  params: ResolveWeatherTurnParams,
): Promise<WeatherTurnResult | null> {
  const referenceNow = params.referenceNow ?? new Date();
  const locale = getChatLocaleFromVoiceLanguage(params.languageCode);
  const timeZone = getDeviceTimeZone();
  const intent = parseWeatherIntent(params.transcript, {
    referenceNow,
    timeZone,
    locale,
  });

  if (!intent) {
    return null;
  }

  if (intent.kind === 'query') {
    logWeatherRoutingDebug({
      transcript: params.transcript,
      parsedCity: intent.city,
      parsedTimeScope: intent.timeScope,
    });
  }

  const requestDeviceLocation = params.requestDeviceLocation ?? requestDeviceWeatherLocation;

  if (intent.kind === 'location_update') {
    const geocoded = await geocodeUserProvidedCity(intent.city);

    if (!geocoded) {
      return {
        reply: buildWeatherCityNotFoundReply(intent.city, params.languageCode),
        spokenReply: buildWeatherCityNotFoundReply(intent.city, params.languageCode),
      };
    }

    await saveLastKnownWeatherLocation(geocoded);

    const snapshot = await fetchWeatherByCity({
      city: intent.city,
      languageCode: params.languageCode,
      referenceNow,
    });

    if (snapshot) {
      await publishWeatherSnapshotForHome(snapshot);
    }

    const reply = buildWeatherLocationSavedReply(geocoded.city, params.languageCode);

    return {
      reply,
      spokenReply: reply,
    };
  }

  const locationResult = await resolveWeatherLocation({
    city: intent.city,
    languageCode: params.languageCode,
    requestDeviceLocation,
  });

  if (!locationResult.ok) {
    return {
      reply: locationResult.reply,
      spokenReply: locationResult.reply,
    };
  }

  const snapshot = intent.city
    ? await fetchWeatherByCity({
        city: intent.city,
        languageCode: params.languageCode,
        referenceNow,
      })
    : await fetchWeatherSnapshot({
        latitude: locationResult.location.latitude,
        longitude: locationResult.location.longitude,
        languageCode: params.languageCode,
        referenceNow,
      });

  if (intent.kind === 'query') {
    logWeatherRoutingDebug({
      transcript: params.transcript,
      parsedCity: intent.city,
      parsedTimeScope: intent.timeScope,
      endpointParams: intent.city
        ? { city: intent.city }
        : {
            lat: String(locationResult.location.latitude),
            lon: String(locationResult.location.longitude),
          },
    });
  }

  if (!snapshot) {
    const reply = buildWeatherProviderUnavailableReply(params.languageCode);

    return {
      reply,
      spokenReply: reply,
    };
  }

  await saveLastKnownWeatherLocation({
    city: snapshot.location.city,
    region: snapshot.location.region,
    country: snapshot.location.country,
    latitude: snapshot.location.latitude,
    longitude: snapshot.location.longitude,
    source: intent.city ? 'user' : locationResult.location.source,
    updatedAt: Date.now(),
  });

  await publishWeatherSnapshotForHome(snapshot);

  let queryIntent = intent as Extract<WeatherIntent, { kind: 'query' }>;

  if (queryIntent.kind === 'query') {
    const finalizedTarget = finalizeWeatherTimeTarget({
      target: parseWeatherTimeTarget(params.transcript, {
        referenceNow,
        timeZone,
        locale,
      }),
      snapshot,
      referenceNowMs: referenceNow.getTime(),
      timeZone,
    });

    queryIntent = {
      ...queryIntent,
      timeScope: finalizedTarget.timeScope,
      targetDayKey: finalizedTarget.targetDayKey,
      targetLabel: finalizedTarget.targetLabel,
      forecastOutOfRange: finalizedTarget.forecastOutOfRange,
    };

    if (isFiveDayForecastIntent(params.transcript)) {
      queryIntent = {
        ...queryIntent,
        timeScope: 'next_5_days',
        forecastOutOfRange: false,
      };
    }
  }

  if (
    queryIntent.forecastOutOfRange &&
    queryIntent.targetLabel &&
    queryIntent.timeScope === 'specific_date'
  ) {
    const reply = buildWeatherForecastOutOfRangeReply({
      locale,
      periodLabel: queryIntent.targetLabel,
    });

    commitWeatherActiveReference({
      action: 'query',
      timeScope: queryIntent.timeScope,
      targetLabel: queryIntent.targetLabel,
    });

    return {
      reply,
      spokenReply: reply,
    };
  }

  const reply = buildWeatherReply({
    snapshot,
    intent: queryIntent,
    languageCode: params.languageCode,
    referenceNow,
  });

  commitWeatherActiveReference({
    action: 'query',
    timeScope: queryIntent.timeScope,
    targetLabel: queryIntent.targetLabel,
  });

  return {
    reply,
    spokenReply: reply,
  };
}
