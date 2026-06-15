const TRAILING_RANGE_SUFFIX =
  /\s+(?:на\s+)?(?:ближайш(?:ие|их)?|следующ(?:ие|их)?|найближч(?:і|их)?|next)\s+(?:(?:5|п(?:'|')?ять|п'ять|five)\s+(?:дн(?:ей|я|ів|ні)|days?)|5\s+дн(?:ей|я|ів|ні)?).*$/iu;

const TRAILING_EN_RANGE_SUFFIX = /\s+for\s+the\s+next\s+5\s+days.*$/iu;

const LOCATION_UPDATE =
  /(?:^|[\s,.;:!?—-])(?:я\s+сейчас\s+в|я\s+в|i(?:'m| am)\s+in|i\s+am\s+in|зараз\s+у|зараз\s+в|я\s+зараз\s+у|я\s+зараз\s+в)(?:\s+)(.+)$/iu;

const CITY_IN_QUERY =
  /(?:погод(?:а|у|е|ой|і)?|weather|forecast|temperature|температур(?:а|у|е|і)?)\s+(?:в|in|у|at)\s+(.+?)(?:[\s,.;:!?]|$)/iu;

const STANDALONE_CITY_QUERY =
  /^(?:погод(?:а|у|е|ой|і)?|weather|forecast)\s+(?:в|in|у|at)\s+(.+)$/iu;

const WEATHER_CITY_AFTER_VERB =
  /(?:ожида(?:ется|ться|ється)|буд(?:ет|е)|expected|forecast)\s+(?:в|in|у|at)\s+(.+?)(?:\s+на\s+(?:ближайш|следующ|next|наступн)|[\s,.;:!?]|$)/iu;

const WEATHER_CITY_IN_QUESTION =
  /(?:какая|какой|какую|яка|який|what|which).{0,48}погод\w*.{0,48}(?:в|in|у|at)\s+(.+?)(?:\s+на\s+(?:ближайш|следующ|next|наступн)|[\s,.;!?]|$)/iu;

const WEATHER_CITY_BEFORE_RANGE =
  /(?:^|[\s,.;:!?—-])(?:в|in|у|at)\s+([\p{L}][\p{L}\s'-]{1,48}?)\s+на\s+(?:ближайш|следующ|next|наступн)/iu;

function normalizeTranscript(transcript: string) {
  return transcript.trim().replace(/\s+/g, ' ');
}

function stripTrailingWeatherRangePhrase(city: string) {
  return city
    .replace(TRAILING_RANGE_SUFFIX, '')
    .replace(TRAILING_EN_RANGE_SUFFIX, '')
    .trim()
    .replace(/[.!?]+$/u, '');
}

function normalizeExtractedCity(raw: string) {
  const trimmed = raw.trim().replace(/[.!?]+$/u, '');
  const withoutRange = stripTrailingWeatherRangePhrase(trimmed);

  return withoutRange.trim();
}

export function extractWeatherCityFromTranscript(transcript: string): string | null {
  const normalized = normalizeTranscript(transcript);

  const locationMatch = normalized.match(LOCATION_UPDATE);
  if (locationMatch?.[1]) {
    return normalizeExtractedCity(locationMatch[1]);
  }

  const patterns = [
    WEATHER_CITY_AFTER_VERB,
    WEATHER_CITY_IN_QUESTION,
    WEATHER_CITY_BEFORE_RANGE,
    CITY_IN_QUERY,
    STANDALONE_CITY_QUERY,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);

    if (match?.[1]) {
      const city = normalizeExtractedCity(match[1]);

      if (city) {
        return city;
      }
    }
  }

  return null;
}

export function isWeatherLocationUpdateTranscript(transcript: string) {
  return LOCATION_UPDATE.test(normalizeTranscript(transcript));
}
