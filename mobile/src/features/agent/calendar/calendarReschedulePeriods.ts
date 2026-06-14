const CALENDAR_PERIOD_EDGE = '(?:^|[\\s,.;:!?—-]+)';
const CALENDAR_PERIOD_END = '(?:[,.!\\s]|$)';

const PERIOD_MORNING = new RegExp(
  `${CALENDAR_PERIOD_EDGE}(?:morning|утром|утра|ранку|вранці|рано\\s+вранці|зранку)${CALENDAR_PERIOD_END}`,
  'iu',
);

const PERIOD_NOON = new RegExp(
  `${CALENDAR_PERIOD_EDGE}(?:час\\s+дня|часу\\s+дня|полдень|полудень|полуден(?:ь|я|ю)?|at\\s+noon|noon)${CALENDAR_PERIOD_END}`,
  'iu',
);

const PERIOD_AFTERNOON = new RegExp(
  `${CALENDAR_PERIOD_EDGE}(?:afternoon|днём|днем|післяобіді|післяобід|після\\s+обіду|після\\s+полудня)${CALENDAR_PERIOD_END}`,
  'iu',
);

const PERIOD_EVENING = new RegExp(
  `${CALENDAR_PERIOD_EDGE}(?:evening|вечером|вечера|вечері|увечері)${CALENDAR_PERIOD_END}`,
  'iu',
);

/** Default wall-clock minutes for vague day periods (executive calendar). */
export function parseCalendarDayPeriodMinutes(transcript: string): number | null {
  const normalized = transcript.trim();

  if (!normalized) {
    return null;
  }

  if (PERIOD_MORNING.test(normalized)) {
    return 9 * 60;
  }

  if (PERIOD_NOON.test(normalized)) {
    return 13 * 60;
  }

  if (PERIOD_AFTERNOON.test(normalized)) {
    return 14 * 60;
  }

  if (PERIOD_EVENING.test(normalized)) {
    return 18 * 60;
  }

  return null;
}

export function stripCalendarDayPeriodPhrases(transcript: string) {
  return transcript
    .replace(PERIOD_MORNING, ' ')
    .replace(PERIOD_NOON, ' ')
    .replace(PERIOD_AFTERNOON, ' ')
    .replace(PERIOD_EVENING, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
