/** Day/time words that must never be treated as event titles. */
const TEMPORAL_ONLY_TITLE =
  /^(?:today|tonight|tomorrow|yesterday|завтра|сьогодні|сегодня|вчора|вчера|післязавтра|послезавтра|сегодня\s+вечером|tonight)$/iu;

const MERIDIEM_ONLY_TITLE =
  /^(?:вечера|вечером|утра|утром|дня|днём|днем|ночи|ночью|вечора|ранку|рано|morning|afternoon|evening|night|am|pm|a\.m\.|p\.m\.)$/iu;

export function isMeridiemOnlyTitle(title: string) {
  return MERIDIEM_ONLY_TITLE.test(title.trim());
}

export function stripMeridiemTitleArtifact(title: string) {
  return title
    .replace(
      /\s+(?:вечера|вечером|утра|утром|дня|днём|dнем|ночи|ночью|вечора|ранку|утра|am|pm|a\.m\.|p\.m\.)$/iu,
      '',
    )
    .trim();
}

const TIME_ONLY_FOLLOW_UP =
  /^(?:(?:сегодня|сьогодні|сегодня|завтра|tomorrow|today|tonight)\s+)?(?:(?:на|в|о|at|in)\s+)?(?:\d{1,2}(:\d{2})?|один|два|две|три|четыре|чотири|пять|шесть|семь|восемь|девять|десять|one|two|three|four|five|six|seven|eight|nine|ten)(?:\s+(?:вечера|вечером|утра|утром|дня|днём|днем|in\s+the\s+evening|am|pm|a\.m\.|p\.m\.))?$/iu;

const BARE_CLOCK_MERIDIEM_FOLLOW_UP =
  /^(?:\d{1,2})(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)$/iu;

const TIME_RANGE_FOLLOW_UP =
  /^(?:(?:сегодня|завтра|tomorrow|today)\s+)?(?:давай\s+)?(?:с|from)\s+\d/i;

export function isTemporalOnlyTitle(title: string) {
  const normalized = title.trim();

  if (!normalized) {
    return true;
  }

  return TEMPORAL_ONLY_TITLE.test(normalized) || isMeridiemOnlyTitle(normalized);
}

export function isPendingConflictTimeFollowUp(transcript: string) {
  const normalized = transcript.trim();

  if (!normalized) {
    return false;
  }

  if (TIME_RANGE_FOLLOW_UP.test(normalized)) {
    return true;
  }

  if (TIME_ONLY_FOLLOW_UP.test(normalized) || BARE_CLOCK_MERIDIEM_FOLLOW_UP.test(normalized)) {
    return true;
  }

  if (
    /^(?:вариант|option|варіант)\s+[1-9]\d*$/iu.test(normalized) ||
    /^[1-9]$/u.test(normalized)
  ) {
    return true;
  }

  if (/^(?:давай|давайте)\s+(?:завтра|сегодня|tomorrow|today)/iu.test(normalized)) {
    return true;
  }

  if (/(?:хорош(?:ий|ая|е)\s+вариант|подходит|отлично)/iu.test(normalized)) {
    return true;
  }

  return false;
}
