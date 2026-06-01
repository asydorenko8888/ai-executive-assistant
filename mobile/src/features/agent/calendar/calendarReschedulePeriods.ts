const PERIOD_MORNING =
  /\b(?:morning|утром|утра|ранку|вранці|рано\s+вранці|зранку)\b/iu;

const PERIOD_AFTERNOON =
  /\b(?:afternoon|днём|днем|дня|післяобіді|післяобід|після\s+обіду|після\s+полудня)\b/iu;

const PERIOD_EVENING =
  /\b(?:evening|вечером|вечера|вечері|увечері)\b/iu;

/** Default wall-clock minutes for vague day periods (executive calendar). */
export function parseCalendarDayPeriodMinutes(transcript: string): number | null {
  const normalized = transcript.trim();

  if (!normalized) {
    return null;
  }

  if (PERIOD_MORNING.test(normalized)) {
    return 9 * 60;
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
    .replace(PERIOD_AFTERNOON, ' ')
    .replace(PERIOD_EVENING, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
