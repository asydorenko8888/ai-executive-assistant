import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguageLocale';
import { getChatLocaleFromVoiceLanguage } from '@/src/features/chat/services/voiceLanguageLocale';
import type { WeatherAnalysis } from '@/src/features/weather/weatherAnalysis';
import { aggregateHourlyDay, buildWeatherAnalysis, logWeatherAnalysis, resolveDayKeyForTimeScope } from '@/src/features/weather/weatherAnalysis';
import type { WeatherIntent, WeatherSnapshot } from '@/src/features/weather/types';
import { buildWeatherForecastOutOfRangeReply, finalizeWeatherTimeTarget } from '@/src/features/weather/weatherDateScope';
import { buildFiveDayForecastReply } from '@/src/features/weather/weatherFiveDayForecast';
import { getDeviceTimeZone } from '@/src/features/weather/weatherRainForecast';
import {
  formatWeatherDayLabel,
  isDayAfterTomorrowScope,
  isEveningTimeScope,
  isFutureForecastDayScope,
  isMultiDayForecastScope,
  isSpecificDateScope,
} from '@/src/features/weather/weatherTimeScope';

function formatTemp(tempC: number) {
  const sign = tempC > 0 ? '+' : '';
  return `${sign}${tempC}°C`;
}

function joinClothingSentences(sentences: string[]) {
  return sentences.filter(Boolean).join(' ');
}

function capitalizeClause(clause: string) {
  return `${clause.charAt(0).toUpperCase()}${clause.slice(1)}`;
}

function lowercaseSentenceStart(sentence: string) {
  return `${sentence.charAt(0).toLowerCase()}${sentence.slice(1)}`;
}

function buildClothingUmbrellaGuidance(analysis: WeatherAnalysis, locale: 'uk' | 'ru' | 'en') {
  if (!analysis.umbrellaNeeded) {
    if (locale === 'uk') {
      return 'Парасолька не потрібна.';
    }

    if (locale === 'ru') {
      return 'Зонт не нужен.';
    }

    return 'No umbrella needed.';
  }

  const rainClause = capitalizeClause(analysis.rainSummaryClause);

  if (locale === 'uk') {
    return `${rainClause}, тому варто взяти парасольку.`;
  }

  if (locale === 'ru') {
    return `${rainClause}, поэтому лучше взять зонт.`;
  }

  return `${rainClause}, so taking an umbrella would be a good idea.`;
}

function buildClothingWindGuidance(analysis: WeatherAnalysis, locale: 'uk' | 'ru' | 'en', timeScope: WeatherIntent['timeScope']) {
  if (!analysis.windy || isFutureForecastDayScope(timeScope)) {
    return null;
  }

  if (locale === 'uk') {
    return `Вітер помітний — близько ${analysis.windKph} км/год, варто мати вітровку.`;
  }

  if (locale === 'ru') {
    return `Ветер заметный — около ${analysis.windKph} км/ч, стоит взять ветровку.`;
  }

  return `Wind is noticeable — around ${analysis.windKph} km/h, so a windbreaker would help.`;
}

function buildGeneralReply(
  analysis: WeatherAnalysis,
  snapshot: WeatherSnapshot,
  locale: 'uk' | 'ru' | 'en',
  timeScope: WeatherIntent['timeScope'],
  referenceNow: Date,
) {
  if (timeScope === 'tomorrow' && snapshot.tomorrow) {
    const rainLine = analysis.rainExpected
      ? capitalizeClause(analysis.rainSummaryClause) + (locale === 'en' ? '.' : '.')
      : locale === 'uk'
        ? 'Опадів не очікується.'
        : locale === 'ru'
          ? 'Осадков не ожидается.'
          : 'No precipitation expected.';

    if (locale === 'uk') {
      return `Завтра в ${analysis.location}: ${snapshot.tomorrow.condition.toLowerCase()}, від ${formatTemp(analysis.tempMin)} до ${formatTemp(analysis.tempMax)}. ${rainLine}`;
    }

    if (locale === 'ru') {
      return `Завтра в ${analysis.location}: ${snapshot.tomorrow.condition.toLowerCase()}, от ${formatTemp(analysis.tempMin)} до ${formatTemp(analysis.tempMax)}. ${rainLine}`;
    }

    return `Tomorrow in ${analysis.location}: ${snapshot.tomorrow.condition.toLowerCase()}, from ${formatTemp(analysis.tempMin)} to ${formatTemp(analysis.tempMax)}. ${rainLine}`;
  }

  if (isDayAfterTomorrowScope(timeScope) || isSpecificDateScope(timeScope)) {
    const timeZone = getDeviceTimeZone();
    const dayKey = resolveDayKeyForTimeScope(
      timeScope,
      referenceNow.getTime(),
      timeZone,
      analysis.targetDayKey,
    );
    const daySummary = aggregateHourlyDay(snapshot, dayKey, timeZone);
    const condition = daySummary?.condition.toLowerCase() ?? snapshot.current.condition.toLowerCase();
    const rainLine = analysis.rainExpected
      ? capitalizeClause(analysis.rainSummaryClause) + '.'
      : locale === 'uk'
        ? 'Опадів не очікується.'
        : locale === 'ru'
          ? 'Осадков не ожидается.'
          : 'No precipitation expected.';
    const dayLabel =
      isSpecificDateScope(timeScope) && analysis.targetLabel
        ? analysis.targetLabel.charAt(0).toUpperCase() + analysis.targetLabel.slice(1)
        : formatWeatherDayLabel(timeScope, locale);

    if (locale === 'uk') {
      return `${dayLabel} в ${analysis.location}: ${condition}, від ${formatTemp(analysis.tempMin)} до ${formatTemp(analysis.tempMax)}. ${rainLine}`;
    }

    if (locale === 'ru') {
      return `${dayLabel} в ${analysis.location}: ${condition}, от ${formatTemp(analysis.tempMin)} до ${formatTemp(analysis.tempMax)}. ${rainLine}`;
    }

    return `${isSpecificDateScope(timeScope) && analysis.targetLabel ? `On ${analysis.targetLabel}` : dayLabel} in ${analysis.location}: ${condition}, from ${formatTemp(analysis.tempMin)} to ${formatTemp(analysis.tempMax)}. ${rainLine}`;
  }

  const rainLine = analysis.rainExpected
    ? locale === 'uk'
      ? capitalizeClause(analysis.rainSummaryClause) + '.'
      : locale === 'ru'
        ? capitalizeClause(analysis.rainSummaryClause) + '.'
        : capitalizeClause(analysis.rainSummaryClause) + '.'
    : locale === 'uk'
      ? 'Опадів не очікується.'
      : locale === 'ru'
        ? 'Осадков не ожидается.'
        : 'No precipitation expected.';

  if (locale === 'uk') {
    return `Зараз у ${analysis.location} ${formatTemp(analysis.currentTemp)}, ${snapshot.current.condition.toLowerCase()}. Вдень до ${formatTemp(analysis.tempMax)}. ${rainLine}`;
  }

  if (locale === 'ru') {
    return `Сейчас в ${analysis.location} ${formatTemp(analysis.currentTemp)}, ${snapshot.current.condition.toLowerCase()}. Днём до ${formatTemp(analysis.tempMax)}. ${rainLine}`;
  }

  return `Right now in ${analysis.location} it is ${formatTemp(analysis.currentTemp)} and ${snapshot.current.condition.toLowerCase()}. High today ${formatTemp(analysis.tempMax)}. ${rainLine}`;
}

function buildUmbrellaReply(analysis: WeatherAnalysis, locale: 'uk' | 'ru' | 'en') {
  if (analysis.umbrellaNeeded) {
    if (locale === 'uk') {
      return `Так, краще взяти парасольку: ${analysis.rainSummaryClause}.`;
    }

    if (locale === 'ru') {
      return `Да, лучше взять зонт: ${analysis.rainSummaryClause}.`;
    }

    return `Yes, take an umbrella: ${analysis.rainSummaryClause}.`;
  }

  if (locale === 'uk') {
    return `Ні, парасолька не потрібна — ${analysis.rainSummaryClause}.`;
  }

  if (locale === 'ru') {
    return `Нет, зонт не нужен — ${analysis.rainSummaryClause}.`;
  }

  return `No, you do not need an umbrella — ${analysis.rainSummaryClause}.`;
}

function buildClothingReply(analysis: WeatherAnalysis, locale: 'uk' | 'ru' | 'en', timeScope: WeatherIntent['timeScope']) {
  const umbrellaGuidance = buildClothingUmbrellaGuidance(analysis, locale);
  const windGuidance = buildClothingWindGuidance(analysis, locale, timeScope);

  if (isEveningTimeScope(timeScope)) {
    const dayLabel =
      timeScope === 'day_after_tomorrow_evening' ? `${formatWeatherDayLabel(timeScope, locale)} ` : '';

    if (locale === 'uk') {
      return joinClothingSentences([
        analysis.needsJacket
          ? `${dayLabel}Ввечері буде прохолодно, близько ${formatTemp(analysis.tempMin)}.`
          : `${dayLabel}Ввечері близько ${formatTemp(analysis.tempMin)}.`,
        analysis.needsJacket ? 'Краще взяти куртку або теплий верх.' : 'Легкого одягу буде достатньо.',
        umbrellaGuidance,
        windGuidance,
      ]);
    }

    if (locale === 'ru') {
      return joinClothingSentences([
        analysis.needsJacket
          ? `${dayLabel}Вечером будет прохладно, около ${formatTemp(analysis.tempMin)}.`
          : `${dayLabel}Вечером около ${formatTemp(analysis.tempMin)}.`,
        analysis.needsJacket ? 'Лучше взять куртку или тёплый верх.' : 'Лёгкой одежды будет достаточно.',
        umbrellaGuidance,
        windGuidance,
      ]);
    }

    return joinClothingSentences([
      analysis.needsJacket
        ? `${dayLabel}It will be cool in the evening, around ${formatTemp(analysis.tempMin)}.`
        : `${dayLabel}Evening around ${formatTemp(analysis.tempMin)}.`,
      analysis.needsJacket ? 'A jacket or warmer layer would help.' : 'Light clothing should be enough.',
      umbrellaGuidance,
      windGuidance,
    ]);
  }

  const dayLabel =
    isSpecificDateScope(timeScope) && analysis.targetLabel
      ? analysis.targetLabel.charAt(0).toUpperCase() + analysis.targetLabel.slice(1)
      : formatWeatherDayLabel(timeScope, locale);

  if (locale === 'uk') {
    return joinClothingSentences([
      analysis.needsJacket
        ? `${dayLabel} вранці прохолодно, близько ${formatTemp(analysis.tempMin)}, вдень до ${formatTemp(analysis.tempMax)}.`
        : `${dayLabel} вранці близько ${formatTemp(analysis.tempMin)}, вдень до ${formatTemp(analysis.tempMax)}.`,
      analysis.needsJacket ? 'Легкої куртки буде достатньо.' : 'Легкого одягу буде достатньо.',
      umbrellaGuidance,
      windGuidance,
    ]);
  }

  if (locale === 'ru') {
    return joinClothingSentences([
      analysis.needsJacket
        ? `${dayLabel} утром прохладно, около ${formatTemp(analysis.tempMin)}, днём до ${formatTemp(analysis.tempMax)}.`
        : `${dayLabel} утром около ${formatTemp(analysis.tempMin)}, днём до ${formatTemp(analysis.tempMax)}.`,
      analysis.needsJacket ? 'Лёгкой куртки будет достаточно.' : 'Лёгкой одежды будет достаточно.',
      umbrellaGuidance,
      windGuidance,
    ]);
  }

  return joinClothingSentences([
    analysis.needsJacket
      ? `${dayLabel} morning will be cool (${formatTemp(analysis.tempMin)}), daytime around ${formatTemp(analysis.tempMax)}.`
      : `${dayLabel} morning around ${formatTemp(analysis.tempMin)}, daytime around ${formatTemp(analysis.tempMax)}.`,
    analysis.needsJacket ? 'A light jacket is enough.' : 'Light clothing should be enough.',
    umbrellaGuidance,
    windGuidance,
  ]);
}

function buildRainReply(analysis: WeatherAnalysis, locale: 'uk' | 'ru' | 'en') {
  if (analysis.rainExpected) {
    if (locale === 'uk') {
      return `Так, ${lowercaseSentenceStart(analysis.rainSummarySentence)}`;
    }

    if (locale === 'ru') {
      return `Да, ${lowercaseSentenceStart(analysis.rainSummarySentence)}`;
    }

    return `Yes, ${lowercaseSentenceStart(analysis.rainSummarySentence)}`;
  }

  if (locale === 'uk') {
    return `Ні. ${analysis.rainSummarySentence}`;
  }

  if (locale === 'ru') {
    return `Нет. ${analysis.rainSummarySentence}`;
  }

  return `No. ${analysis.rainSummarySentence}`;
}

function buildRainTimingReply(analysis: WeatherAnalysis) {
  return analysis.rainSummarySentence;
}

function buildTemperatureReply(analysis: WeatherAnalysis, snapshot: WeatherSnapshot, locale: 'uk' | 'ru' | 'en') {
  if (locale === 'uk') {
    return `Зараз у ${analysis.location} ${formatTemp(analysis.currentTemp)}, відчувається як ${formatTemp(snapshot.current.feelsLikeC)}.`;
  }

  if (locale === 'ru') {
    return `Сейчас в ${analysis.location} ${formatTemp(analysis.currentTemp)}, ощущается как ${formatTemp(snapshot.current.feelsLikeC)}.`;
  }

  return `Right now in ${analysis.location} it is ${formatTemp(analysis.currentTemp)}, feels like ${formatTemp(snapshot.current.feelsLikeC)}.`;
}

function buildColdReply(analysis: WeatherAnalysis, locale: 'uk' | 'ru' | 'en', timeScope: WeatherIntent['timeScope']) {
  const effectiveScope = timeScope === 'unspecified' ? 'today' : timeScope;

  if (effectiveScope === 'tomorrow') {
    const temp = analysis.tempMin;
    const isCold = temp <= 12;

    if (locale === 'uk') {
      return isCold
        ? `Так, завтра буде прохолодно — близько ${formatTemp(temp)}.`
        : `Ні, завтра буде помірно — близько ${formatTemp(temp)}.`;
    }

    if (locale === 'ru') {
      return isCold
        ? `Да, завтра будет прохладно — около ${formatTemp(temp)}.`
        : `Нет, завтра будет умеренно — около ${formatTemp(temp)}.`;
    }

    return isCold
      ? `Yes, tomorrow will be chilly — around ${formatTemp(temp)}.`
      : `No, tomorrow should be moderate — around ${formatTemp(temp)}.`;
  }

  if (isEveningTimeScope(effectiveScope)) {
    const isCold = analysis.tempMin <= 12;
    const dayPrefix =
      effectiveScope === 'day_after_tomorrow_evening'
        ? `${formatWeatherDayLabel(effectiveScope, locale)} `
        : '';

    if (locale === 'uk') {
      return isCold
        ? `Так, ${dayPrefix}ввечері буде прохолодно — близько ${formatTemp(analysis.tempMin)}.`
        : `Ні, ${dayPrefix}ввечері буде помірно — близько ${formatTemp(analysis.tempMin)}.`;
    }

    if (locale === 'ru') {
      return isCold
        ? `Да, ${dayPrefix}вечером будет прохладно — около ${formatTemp(analysis.tempMin)}.`
        : `Нет, ${dayPrefix}вечером будет умеренно — около ${formatTemp(analysis.tempMin)}.`;
    }

    return isCold
      ? `Yes, ${dayPrefix}it will be chilly in the evening — around ${formatTemp(analysis.tempMin)}.`
      : `No, ${dayPrefix}the evening should be moderate — around ${formatTemp(analysis.tempMin)}.`;
  }

  if (isDayAfterTomorrowScope(effectiveScope)) {
    const temp = analysis.tempMin;
    const isCold = temp <= 12;
    const dayLabel = formatWeatherDayLabel(effectiveScope, locale);

    if (locale === 'uk') {
      return isCold
        ? `Так, ${dayLabel.toLowerCase()} буде прохолодно — близько ${formatTemp(temp)}.`
        : `Ні, ${dayLabel.toLowerCase()} буде помірно — близько ${formatTemp(temp)}.`;
    }

    if (locale === 'ru') {
      return isCold
        ? `Да, ${dayLabel.toLowerCase()} будет прохладно — около ${formatTemp(temp)}.`
        : `Нет, ${dayLabel.toLowerCase()} будет умеренно — около ${formatTemp(temp)}.`;
    }

    return isCold
      ? `Yes, ${dayLabel.toLowerCase()} will be chilly — around ${formatTemp(temp)}.`
      : `No, ${dayLabel.toLowerCase()} should be moderate — around ${formatTemp(temp)}.`;
  }

  const temp = effectiveScope === 'now' ? analysis.currentTemp : Math.min(analysis.tempMin, analysis.currentTemp);
  const isCold = temp <= 12;

  if (locale === 'uk') {
    return isCold
      ? `Так, зараз прохолодно — близько ${formatTemp(temp)}. Краще одягнутися тепліше.`
      : `Ні, зараз не дуже холодно — близько ${formatTemp(temp)}.`;
  }

  if (locale === 'ru') {
    return isCold
      ? `Да, сейчас прохладно — около ${formatTemp(temp)}. Лучше одеться теплее.`
      : `Нет, сейчас не очень холодно — около ${formatTemp(temp)}.`;
  }

  return isCold
    ? `Yes, it is chilly now — around ${formatTemp(temp)}. Dress warmer.`
    : `No, it is not very cold now — around ${formatTemp(temp)}.`;
}

function buildHeatReply(analysis: WeatherAnalysis, locale: 'uk' | 'ru' | 'en', timeScope: WeatherIntent['timeScope']) {
  const temp =
    timeScope === 'tomorrow' || isDayAfterTomorrowScope(timeScope)
      ? analysis.tempMax
      : isEveningTimeScope(timeScope)
        ? analysis.tempMax
        : analysis.currentTemp;
  const isHot = temp >= 28;

  if (locale === 'uk') {
    return isHot
      ? `Так, буде спекотно — до ${formatTemp(temp)}. Одягайтеся легко і пийте воду.`
      : `Ні, до ${formatTemp(temp)} — жару не очікується.`;
  }

  if (locale === 'ru') {
    return isHot
      ? `Да, будет жарко — до ${formatTemp(temp)}. Одевайтесь легко и пейте воду.`
      : `Нет, до ${formatTemp(temp)} — сильной жары не ожидается.`;
  }

  return isHot
    ? `Yes, it will be hot — up to ${formatTemp(temp)}. Dress lightly and drink water.`
    : `No, up to ${formatTemp(temp)} — strong heat is not expected.`;
}

function buildWindReply(analysis: WeatherAnalysis, locale: 'uk' | 'ru' | 'en') {
  if (locale === 'uk') {
    return analysis.windy
      ? `Так, вітер сильний — близько ${analysis.windKph} км/год. Краще взяти вітровку.`
      : `Ні, вітер помірний — близько ${analysis.windKph} км/год.`;
  }

  if (locale === 'ru') {
    return analysis.windy
      ? `Да, ветер сильный — около ${analysis.windKph} км/ч. Лучше взять ветровку.`
      : `Нет, ветер умеренный — около ${analysis.windKph} км/ч.`;
  }

  return analysis.windy
    ? `Yes, it is windy — around ${analysis.windKph} km/h. A windbreaker would help.`
    : `No, wind is moderate — around ${analysis.windKph} km/h.`;
}

function buildOutdoorReply(analysis: WeatherAnalysis, locale: 'uk' | 'ru' | 'en') {
  const good =
    analysis.currentTemp >= 5 &&
    analysis.currentTemp <= 30 &&
    !analysis.rainExpected &&
    analysis.windKph < 35;

  if (locale === 'uk') {
    return good
      ? 'Так, для прогулянки погода нормальна.'
      : 'Краще обережно: можливі опади, вітер або незручна температура.';
  }

  if (locale === 'ru') {
    return good
      ? 'Да, для прогулки погода нормальная.'
      : 'Лучше осторожно: возможны осадки, ветер или неудобная температура.';
  }

  return good
    ? 'Yes, the weather is fine for a walk.'
    : 'Be careful: precipitation, wind, or uncomfortable temperatures are possible.';
}

function buildBeachReply(analysis: WeatherAnalysis, locale: 'uk' | 'ru' | 'en') {
  const good = analysis.tempMax >= 22 && !analysis.rainExpected;

  if (locale === 'uk') {
    return good
      ? `Так, для пляжу погода підходить — до ${formatTemp(analysis.tempMax)}.`
      : 'Ні, сьогодні для пляжу погода не дуже підходить.';
  }

  if (locale === 'ru') {
    return good
      ? `Да, для пляжа погода подходит — до ${formatTemp(analysis.tempMax)}.`
      : 'Нет, сегодня для пляжа погода не очень подходит.';
  }

  return good
    ? `Yes, beach weather looks good — up to ${formatTemp(analysis.tempMax)}.`
    : 'No, beach weather does not look great today.';
}

export function buildWeatherReply(params: {
  snapshot: WeatherSnapshot;
  intent: Extract<WeatherIntent, { kind: 'query' }>;
  languageCode: VoiceLanguageCode;
  referenceNow: Date;
}) {
  const locale = getChatLocaleFromVoiceLanguage(params.languageCode);

  if (isMultiDayForecastScope(params.intent.timeScope)) {
    return buildFiveDayForecastReply({
      snapshot: params.snapshot,
      locale,
      referenceNow: params.referenceNow,
      timeScope: params.intent.timeScope,
    });
  }

  if (params.intent.forecastOutOfRange && params.intent.targetLabel && isSpecificDateScope(params.intent.timeScope)) {
    return buildWeatherForecastOutOfRangeReply({
      locale,
      periodLabel: params.intent.targetLabel,
    });
  }

  const analysis = buildWeatherAnalysis({
    snapshot: params.snapshot,
    languageCode: params.languageCode,
    timeScope: params.intent.timeScope,
    referenceNow: params.referenceNow,
    targetDayKey: params.intent.targetDayKey,
    targetLabel: params.intent.targetLabel,
  });

  logWeatherAnalysis(analysis, params.referenceNow, locale);

  switch (params.intent.questionType) {
    case 'umbrella':
      return buildUmbrellaReply(analysis, locale);
    case 'clothing':
      return buildClothingReply(analysis, locale, params.intent.timeScope);
    case 'rain':
      return buildRainReply(analysis, locale);
    case 'rain_timing':
      return buildRainTimingReply(analysis);
    case 'temperature':
      return buildTemperatureReply(analysis, params.snapshot, locale);
    case 'cold':
      return buildColdReply(analysis, locale, params.intent.timeScope);
    case 'heat':
      return buildHeatReply(analysis, locale, params.intent.timeScope);
    case 'wind':
      return buildWindReply(analysis, locale);
    case 'outdoor':
      return buildOutdoorReply(analysis, locale);
    case 'beach':
      return buildBeachReply(analysis, locale);
    case 'general':
    default:
      return buildGeneralReply(analysis, params.snapshot, locale, params.intent.timeScope, params.referenceNow);
  }
}

export function buildWeatherLocationPermissionReply(languageCode: VoiceLanguageCode) {
  const locale = getChatLocaleFromVoiceLanguage(languageCode);

  if (locale === 'uk') {
    return 'Я не бачу вашу геолокацію. Увімкніть доступ до місцезнаходження або скажіть, у якому місті ви зараз.';
  }

  if (locale === 'ru') {
    return 'Я не вижу вашу геолокацию. Включите доступ к местоположению или скажите, в каком городе вы сейчас находитесь.';
  }

  return 'I cannot see your location. Enable location access or tell me which city you are in.';
}

export function buildWeatherLocationSavedReply(city: string, languageCode: VoiceLanguageCode) {
  const locale = getChatLocaleFromVoiceLanguage(languageCode);

  if (locale === 'uk') {
    return `Добре, запам’ятаю ${city} для погоди.`;
  }

  if (locale === 'ru') {
    return `Хорошо, запомню ${city} для погоды.`;
  }

  return `Got it, I will use ${city} for weather.`;
}

export function buildWeatherProviderUnavailableReply(languageCode: VoiceLanguageCode) {
  const locale = getChatLocaleFromVoiceLanguage(languageCode);

  if (locale === 'uk') {
    return 'Зараз не можу отримати погоду. Спробуйте трохи пізніше.';
  }

  if (locale === 'ru') {
    return 'Сейчас не могу получить погоду. Попробуйте чуть позже.';
  }

  return 'I cannot fetch weather right now. Please try again shortly.';
}

export function buildWeatherCityNotFoundReply(city: string, languageCode: VoiceLanguageCode) {
  const locale = getChatLocaleFromVoiceLanguage(languageCode);

  if (locale === 'uk') {
    return `Не знайшов місто «${city}». Спробуйте назвати його ще раз.`;
  }

  if (locale === 'ru') {
    return `Не нашёл город «${city}». Попробуйте назвать его ещё раз.`;
  }

  return `I could not find the city "${city}". Please try again.`;
}
