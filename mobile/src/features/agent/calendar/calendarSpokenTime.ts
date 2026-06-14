/**
 * Russian/Ukrainian/English spoken clock times: "четыре вечера", "4 вечера", "в семь вечера".
 */

const SPOKEN_NUMBER_TO_HOUR: Record<string, number> = {
  один: 1,
  одну: 1,
  одного: 1,
  one: 1,
  два: 2,
  две: 2,
  two: 2,
  три: 3,
  three: 3,
  четыре: 4,
  четверо: 4,
  чотири: 4,
  four: 4,
  пять: 5,
  "п'ять": 5,
  five: 5,
  шесть: 6,
  six: 6,
  семь: 7,
  сім: 7,
  seven: 7,
  восемь: 8,
  вісім: 8,
  eight: 8,
  девять: 9,
  "дев'ять": 9,
  nine: 9,
  десять: 10,
  ten: 10,
  одиннадцать: 11,
  eleven: 11,
  двенадцать: 12,
  twelve: 12,
  тринадцать: 13,
  тринадцять: 13,
  thirteen: 13,
  четырнадцать: 14,
  чотирнадцять: 14,
  fourteen: 14,
  пятнадцать: 15,
  "п'ятнадцять": 15,
  fifteen: 15,
  шестнадцать: 16,
  шістнадцять: 16,
  sixteen: 16,
  семнадцать: 17,
  сімнадцять: 17,
  seventeen: 17,
  восемнадцать: 18,
  вісімнадцять: 18,
  eighteen: 18,
  девятнадцать: 19,
  "дев'ятнадцять": 19,
  nineteen: 19,
  двадцать: 20,
  twenty: 20,
  "двадцять": 20,
};

/** Word edge for spoken time — exclude ":" so ":00 вечера" is not parsed as hour 00. */
const SPOKEN_TIME_EDGE = '(?:^|[\\s,.;!?—-]+)';

const SPOKEN_MERIDIEM =
  '(?:вечера|вечером|вечора|увечері|утра|утром|ранку|дня|днём|днем|ночи|ночью|ночі)';

const SPOKEN_HOUR_TOKEN =
  '(\\d{1,2}|один|одну|одного|два|две|три|четыре|четверо|чотири|пять|п[\\u2019\']ять|шесть|семь|сім|восемь|вісім|девять|дев[\\u2019\']ять|десять|одиннадцать|двенадцать|тринадцать|тринадцять|четырнадцать|чотирнадцять|пятнадцать|п[\\u2019\']ятнадцять|шестнадцать|шістнадцять|семнадцать|сімнадцять|восемнадцать|вісімнадцять|девятнадцать|дев[\\u2019\']ятнадцять|двадцать|двадцять|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)';

const SPOKEN_HOUR_COUNT_PATTERN = new RegExp(
  `${SPOKEN_TIME_EDGE}(?:в|на|о|at)?\\s*${SPOKEN_HOUR_TOKEN}\\s+(?:час(?:а|ов|у)?|годин(?:у|и|ы)?|hours?)(?:[,.!\\s]|$)`,
  'iu',
);

const SPOKEN_COLON_MERIDIEM_PATTERN = new RegExp(
  `${SPOKEN_TIME_EDGE}(?:в|на|о|at)?\\s*(\\d{1,2}):(\\d{2})\\s+${SPOKEN_MERIDIEM}(?:[,.!\\s]|$)`,
  'iu',
);

const SPOKEN_TIME_PATTERN = new RegExp(
  `${SPOKEN_TIME_EDGE}(?:в|на|о|at)?\\s*${SPOKEN_HOUR_TOKEN}\\s+${SPOKEN_MERIDIEM}(?:[,.!\\s]|$)`,
  'iu',
);

const ENGLISH_EVENING_PATTERN =
  /(?:^|[\s,.;:!?—-]+)(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+in\s+the\s+evening(?:[,.!\s]|$)/iu;

const STRIP_SPOKEN_TIME_PATTERN = new RegExp(
  `${SPOKEN_TIME_EDGE}(?:в|на|о|at)?\\s*(?:\\d{1,2}:\\d{2}|${SPOKEN_HOUR_TOKEN.slice(1, -1)})\\s+${SPOKEN_MERIDIEM}`,
  'giu',
);

function resolveSpokenHourToken(token: string) {
  const normalized = token.toLowerCase().trim();
  const numeric = Number(normalized);

  if (!Number.isNaN(numeric) && numeric >= 0 && numeric <= 23) {
    return numeric;
  }

  return SPOKEN_NUMBER_TO_HOUR[normalized] ?? null;
}

function applySpokenMeridiem(hour: number, meridiemFragment: string) {
  const meridiem = meridiemFragment.toLowerCase();

  if (/вечер|увечер/i.test(meridiem)) {
    if (hour >= 1 && hour <= 11) {
      return hour + 12;
    }

    return hour;
  }

  if (/утр|ранку/i.test(meridiem)) {
    if (hour === 12) {
      return 0;
    }

    return hour;
  }

  if (/(?:дня|днём|днем)/i.test(meridiem)) {
    if (hour >= 1 && hour <= 11) {
      return hour + 12;
    }

    return hour;
  }

  if (/ноч/i.test(meridiem)) {
    if (hour >= 1 && hour <= 11) {
      return hour + 12;
    }

    return hour;
  }

  return hour;
}

export function logParsedSpokenTime(payload: {
  transcript: string;
  token: string;
  meridiem: string;
  hour24: number;
  fragment: string;
}) {
  console.log('[PARSED SPOKEN_TIME]');
  console.log(
    JSON.stringify({
      transcriptPreview: payload.transcript.slice(0, 120),
      token: payload.token,
      meridiem: payload.meridiem,
      hour24: payload.hour24,
      fragment: payload.fragment,
    }),
  );
}

function formatSpokenClockFragment(hour24: number, minute = 0) {
  const pad = (value: number) => String(value).padStart(2, '0');

  return `${pad(hour24)}:${pad(minute)}`;
}

export function parseSpokenHourCountFragment(transcript: string) {
  const normalized = transcript.trim();
  const match = normalized.match(SPOKEN_HOUR_COUNT_PATTERN);

  if (!match?.[1]) {
    return null;
  }

  const hourBase = resolveSpokenHourToken(match[1]);

  if (hourBase === null || hourBase < 0 || hourBase > 23) {
    return null;
  }

  const fragment = formatSpokenClockFragment(hourBase, 0);

  logParsedSpokenTime({
    transcript: normalized,
    token: match[1],
    meridiem: 'hour_count',
    hour24: hourBase,
    fragment,
  });

  return fragment;
}

export function parseSpokenTimeFragment(transcript: string) {
  const normalized = transcript.trim();
  const hourCountFragment = parseSpokenHourCountFragment(normalized);

  if (hourCountFragment) {
    return hourCountFragment;
  }

  const colonMatch = normalized.match(SPOKEN_COLON_MERIDIEM_PATTERN);

  if (colonMatch?.[1] && colonMatch[2]) {
    const hourToken = colonMatch[1];
    const minuteToken = colonMatch[2];
    let hourBase = Number(hourToken);
    const minutes = Number(minuteToken);

    if (Number.isNaN(hourBase) || Number.isNaN(minutes) || minutes < 0 || minutes > 59) {
      return null;
    }

    const meridiem = colonMatch[0];
    const hour24 = applySpokenMeridiem(hourBase, meridiem);
    const fragment = formatSpokenClockFragment(hour24, minutes);

    logParsedSpokenTime({
      transcript: normalized,
      token: `${hourToken}:${minuteToken}`,
      meridiem,
      hour24,
      fragment,
    });

    return fragment;
  }

  const match =
    normalized.match(SPOKEN_TIME_PATTERN) ?? normalized.match(ENGLISH_EVENING_PATTERN);

  if (!match?.[1]) {
    return null;
  }

  const hourToken = match[1];
  const hourBase = resolveSpokenHourToken(hourToken);

  if (hourBase === null) {
    return null;
  }

  const meridiem = match[0];
  const hour24 = applySpokenMeridiem(hourBase, meridiem);
  const fragment = formatSpokenClockFragment(hour24, 0);

  logParsedSpokenTime({
    transcript: normalized,
    token: hourToken,
    meridiem,
    hour24,
    fragment,
  });

  return fragment;
}

/** @deprecated Use parseSpokenTimeFragment */
export function extractSpokenEveningClockFragment(transcript: string) {
  const fragment = parseSpokenTimeFragment(transcript);

  if (!fragment) {
    return null;
  }

  return `${fragment} вечера`;
}

export function hasSpokenTimeHint(transcript: string) {
  const normalized = transcript.trim();

  return (
    SPOKEN_COLON_MERIDIEM_PATTERN.test(normalized) ||
    SPOKEN_HOUR_COUNT_PATTERN.test(normalized) ||
    SPOKEN_TIME_PATTERN.test(normalized) ||
    ENGLISH_EVENING_PATTERN.test(normalized) ||
    parseSpokenTimeFragment(normalized) !== null
  );
}

export function stripSpokenTimePhrases(transcript: string) {
  return transcript.replace(STRIP_SPOKEN_TIME_PATTERN, ' ').replace(/\s+/g, ' ').trim();
}

const RELATIVE_SCHEDULE_SHIFT_PATTERN =
  /(?:^|[\s,.;:!?—-]+)(?:на|for|через)\s+(?:(\d+)\s+)?(?:минут(?:ы|у)?|хвилин(?:и|у)?|minutes?|годин(?:у|и|ы)?|час(?:а|ов|у)?|hours?|hrs?)\s+(?:раньше|раніше|earlier|позже|пізніше|later)(?:[,.!\s]|$)/iu;

const RELATIVE_SCHEDULE_UNIT_ONLY_PATTERN =
  /(?:^|[\s,.;:!?—-]+)(?:на|for|через)\s+(?:час|годину|hour)\s+(?:раньше|раніше|earlier|позже|пізніше|later)(?:[,.!\s]|$)/iu;

export function isRelativeScheduleShiftPhrase(transcript: string) {
  const normalized = transcript.trim();

  return (
    RELATIVE_SCHEDULE_SHIFT_PATTERN.test(normalized) ||
    RELATIVE_SCHEDULE_UNIT_ONLY_PATTERN.test(normalized)
  );
}

export function isExplicitDurationPhrase(transcript: string) {
  const normalized = transcript.trim();

  if (isRelativeScheduleShiftPhrase(normalized)) {
    return true;
  }

  return /(?:^|[\s,.;:!?—-]+)(?:на|for|через)\s+\d+(?:[.,]\d+)?\s*(?:минут(?:ы|у)?|хвилин(?:и|у)?|minutes?|час(?:а|ов|у)?|годин(?:и|у|ы)?|hours?|hrs?)(?:[,.!\s]|$)/iu.test(
    normalized,
  );
}
