import {
  CALENDAR_WORD_EDGE,
  CALENDAR_WORD_END,
} from '@/src/features/agent/calendarIntelligence/calendarTextBoundaries';
import { isUmbrellaQuestion, UMBRELLA_TOKEN } from '@/src/features/weather/weatherUmbrellaTokens';

const WEATHER_CORE = new RegExp(
  `${CALENDAR_WORD_EDGE}(?:погод(?:а|у|е|ой|і)?|прогноз(?:а|у|е|ом)?|weather|forecast|температур(?:а|у|е|і)?|temperature|осадк|precipitation|дожд(?:ь|я|ём|ем)?|rain|снег|snow)${CALENDAR_WORD_END}`,
  'iu',
);

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

export const WEATHER_FOLLOW_UP_KEYWORDS =
  /(?:^|[\s,.;:!?—-])(?:прогноз|погод(?:а|у|е|ой|і)?|forecast|weather|дожд(?:ь|я|ём|ем|ит)?|rain|температур(?:а|у|е|і)?|temperature|ближайш(?:ие|их)?\s+5\s+дн(?:ей|я)?|найближч(?:і|их)\s+5\s+дн(?:ів|ні)?|next\s+5\s+days|завтра|tomorrow|послезавтра|післязавтра)(?:[\s,.;:!?—-]|$)/iu;

function normalizeTranscript(transcript: string) {
  return transcript.trim().replace(/\s+/g, ' ');
}

export function containsWeatherDomainKeywords(transcript: string) {
  const normalized = normalizeTranscript(transcript);

  if (!normalized) {
    return false;
  }

  return WEATHER_CORE.test(normalized) || WEATHER_ADVICE.test(normalized) || isUmbrellaQuestion(normalized);
}

export function containsWeatherFollowUpKeywords(transcript: string) {
  const normalized = normalizeTranscript(transcript);

  if (!normalized) {
    return false;
  }

  return containsWeatherDomainKeywords(normalized) || WEATHER_FOLLOW_UP_KEYWORDS.test(normalized);
}
