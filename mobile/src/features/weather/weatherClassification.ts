import { detectCalendarCommandIntent } from '@/src/features/agent/calendar/calendarCommandTypes';
import {
  CALENDAR_WORD_EDGE,
  CALENDAR_WORD_END,
} from '@/src/features/agent/calendarIntelligence/calendarTextBoundaries';
import { isOperationalCalendarWriteRequest } from '@/src/features/agent/intent/operationalCalendarWriteDetection';
import {
  isLocalAlarmIntent,
  shouldRouteToLocalAlarmWorkflow,
} from '@/src/features/local-alarms/localAlarmClassification';
import { isLocalReminderIntent } from '@/src/features/local-reminders/localReminderClassification';
import type { WeatherIntent, WeatherQuestionType } from '@/src/features/weather/types';
import { parseWeatherTimeTarget, type ParseWeatherTimeTargetOptions } from '@/src/features/weather/weatherDateScope';
import {
  containsWeatherDomainKeywords,
  containsWeatherFollowUpKeywords,
} from '@/src/features/weather/weatherDomainKeywords';
import { isUmbrellaQuestion, UMBRELLA_TOKEN } from '@/src/features/weather/weatherUmbrellaTokens';
import {
  extractWeatherCityFromTranscript,
  isWeatherLocationUpdateTranscript,
} from '@/src/features/weather/weatherCityExtraction';

export { containsWeatherDomainKeywords, containsWeatherFollowUpKeywords };
export { extractWeatherCityFromTranscript };

const WEATHER_ADVICE = new RegExp(
  [
    `${CALENDAR_WORD_EDGE}(?:`,
    [
      UMBRELLA_TOKEN,
      'куртк(?:а|у|и|ой|e)?',
      'jacket',
      'coat',
      'пальто',
      '(?:од|над)еть(?:ся)?',
      'одяг(?:ти|нути(?:ся)?|атися)?',
      'вдяг(?:ти|нути(?:ся)?)?',
      'одежд(?:у|а|ы|i)?',
      'clothes',
      'clothing',
      'wear',
      'обув(?:ь|и|ью)?',
      'shoes',
      'холодн(?:о|а|ый|ая|ee|и|у|е|ы)?',
      'cold',
      'жарк(?:о|a|ая|ий|ее|и|у|e)?',
      'hot',
      'heat',
      'вет(?:ер|ра|рено|р|ру)?',
      'wind(?:y)?',
      'дожд(?:ь|я|ём|ем|ит|я)?',
      'rain',
      'осадк(?:и|ов|ами)?',
    ].join('|'),
    `)${CALENDAR_WORD_END}`,
    `|${CALENDAR_WORD_EDGE}(?:что|what|що|як|как(?:ую)?|какую)(?:\\s+\\S+){0,3}\\s+(?:надеть|одеть|wear|вдягнути|одягти)${CALENDAR_WORD_END}`,
    `|${CALENDAR_WORD_EDGE}(?:нужн(?:ен|на|но|ны)?|need|take|брать|брати|взять|взяти)\\s+(?:${UMBRELLA_TOKEN}|куртк(?:а|у|и|ой|e)?|jacket|coat)${CALENDAR_WORD_END}`,
    `|${CALENDAR_WORD_EDGE}(?:${UMBRELLA_TOKEN})\\s+(?:брать|брати|взять|взяти|нести|carry|take)(?:\\s+(?:с|with)\\s+(?:собой|собою|me|you))?`,
    `|${CALENDAR_WORD_EDGE}(?:мне|мені|мене)\\s+(?:брать|брати|взять|взяти)\\s+(?:${UMBRELLA_TOKEN})${CALENDAR_WORD_END}`,
  ].join(''),
  'iu',
);

function normalizeTranscript(transcript: string) {
  return transcript.trim().replace(/\s+/g, ' ');
}

function isBlockedByOperationalDomains(transcript: string) {
  if (containsWeatherDomainKeywords(transcript)) {
    return false;
  }

  if (shouldRouteToLocalAlarmWorkflow(transcript)) {
    return true;
  }

  if (isLocalAlarmIntent(transcript)) {
    return true;
  }

  if (isLocalReminderIntent(transcript)) {
    return true;
  }

  if (isOperationalCalendarWriteRequest(transcript)) {
    return true;
  }

  if (detectCalendarCommandIntent(transcript) !== 'none') {
    return true;
  }

  return false;
}

export function isWeatherLocationUpdate(transcript: string) {
  const normalized = normalizeTranscript(transcript);

  if (isBlockedByOperationalDomains(normalized)) {
    return false;
  }

  return isWeatherLocationUpdateTranscript(normalized);
}

function isRainTimingQuestion(transcript: string) {
  return (
    /(?:^|[\s,.;:!?—-])(?:когда|коли|when|во\s+сколько|at\s+what\s+time)(?:[\s,.;:!?—-]|$)/iu.test(
      transcript,
    ) ||
    /(?:когда|коли|when|во\s+сколько|at\s+what\s+time).{0,40}(?:дожд|rain|осадк|precipitation|опад)/iu.test(
      transcript,
    ) ||
    /(?:дожд|rain|осадк|precipitation|опад).{0,24}(?:когда|коли|when|во\s+сколько)/iu.test(transcript)
  );
}

function parseQuestionType(transcript: string): WeatherQuestionType {
  if (isUmbrellaQuestion(transcript)) {
    return 'umbrella';
  }

  if (isRainTimingQuestion(transcript)) {
    return 'rain_timing';
  }

  if (
    /(?:^|[\s,.;:!?—-])(?:одеть|надеть|одеться|одягатися|одягти|вдягнути|вдягти|одежд(?:у|а|ы|i)?|clothes|clothing|wear|куртк(?:а|у|и|ой|e)?|jacket|coat|пальто|обув(?:ь|и|ью)?|shoes)(?:[\s,.;:!?—-]|$)/iu.test(
      transcript,
    ) ||
    /(?:^|[\s,.;:!?—-])(?:что|what|що|як|как(?:ую)?|какую)(?:\s+\S+){0,3}\s+(?:надеть|одеть|wear|вдягнути|одягти)(?:[\s,.;:!?—-]|$)/iu.test(
      transcript,
    ) ||
    /(?:^|[\s,.;:!?—-])(?:нужн(?:а|о|ы)?|need|take|брать|брати)\s+(?:куртк(?:а|у|и|ой|e)?|jacket|coat)(?:[\s,.;:!?—-]|$)/iu.test(
      transcript,
    )
  ) {
    return 'clothing';
  }

  if (/(?:^|[\s,.;:!?—-])(?:дожд(?:ь|я|ём|ем|ит)?|rain|осадк|precipitation)(?:[\s,.;:!?—-]|$)/iu.test(transcript)) {
    return 'rain';
  }

  if (/(?:^|[\s,.;:!?—-])(?:вет(?:ер|ра|рено|р|ру)?|wind(?:y)?)(?:[\s,.;:!?—-]|$)/iu.test(transcript)) {
    return 'wind';
  }

  if (/(?:^|[\s,.;:!?—-])(?:жарк(?:о|a|ая|ий|ee|и|у|e)?|hot|heat)(?:[\s,.;:!?—-]|$)/iu.test(transcript)) {
    return 'heat';
  }

  if (/(?:^|[\s,.;:!?—-])(?:температур|temperature)(?:[\s,.;:!?—-]|$)/iu.test(transcript)) {
    return 'temperature';
  }

  if (/(?:^|[\s,.;:!?—-])(?:холодн(?:о|а|ый|ая|ee|и|у|е|ы)?|cold|мерзн|замёрз)(?:[\s,.;:!?—-]|$)/iu.test(transcript)) {
    return 'cold';
  }

  if (/(?:^|[\s,.;:!?—-])(?:пляж|beach)(?:[\s,.;:!?—-]|$)/iu.test(transcript)) {
    return 'beach';
  }

  if (/(?:^|[\s,.;:!?—-])(?:гулять|walk|outside|на улицу)(?:[\s,.;:!?—-]|$)/iu.test(transcript)) {
    return 'outdoor';
  }

  return 'general';
}

export function isWeatherAdviceIntent(transcript: string) {
  const normalized = normalizeTranscript(transcript);

  if (!normalized || isBlockedByOperationalDomains(normalized)) {
    return false;
  }

  if (isWeatherLocationUpdate(normalized)) {
    return false;
  }

  return WEATHER_ADVICE.test(normalized) || isUmbrellaQuestion(normalized);
}

export function isWeatherIntent(transcript: string) {
  const normalized = normalizeTranscript(transcript);

  if (!normalized || isBlockedByOperationalDomains(normalized)) {
    return false;
  }

  if (isWeatherLocationUpdate(normalized)) {
    return true;
  }

  return containsWeatherDomainKeywords(normalized) || WEATHER_ADVICE.test(normalized) || isUmbrellaQuestion(normalized);
}

export function parseWeatherIntent(
  transcript: string,
  options?: ParseWeatherTimeTargetOptions,
): WeatherIntent | null {
  const normalized = normalizeTranscript(transcript);

  if (!isWeatherIntent(normalized)) {
    return null;
  }

  const city = extractWeatherCityFromTranscript(normalized) ?? undefined;

  if (isWeatherLocationUpdate(normalized) && city) {
    return {
      kind: 'location_update',
      city,
    };
  }

  const timeTarget = parseWeatherTimeTarget(normalized, options);

  return {
    kind: 'query',
    questionType: parseQuestionType(normalized),
    timeScope: timeTarget.timeScope,
    city,
    targetDayKey: timeTarget.targetDayKey,
    targetLabel: timeTarget.targetLabel,
    forecastOutOfRange: timeTarget.forecastOutOfRange,
  };
}
