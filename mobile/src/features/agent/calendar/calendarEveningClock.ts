const SPOKEN_EVENING_PATTERN =
  /(?:^|[\s,.;:!?—-]+)(?:в|на|at)?\s*(один|одну|два|две|три|четыре|четверо|пять|шесть|семь|восемь|девять|десять|одиннадцать|двенадцать|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(?:вечера|вечером)(?:[,.!\s]|$)/iu;

const SPOKEN_NUMBER_TO_HOUR: Record<string, number> = {
  один: 1,
  одну: 1,
  one: 1,
  два: 2,
  две: 2,
  two: 2,
  три: 3,
  three: 3,
  четыре: 4,
  четверо: 4,
  four: 4,
  пять: 5,
  five: 5,
  шесть: 6,
  six: 6,
  семь: 7,
  seven: 7,
  восемь: 8,
  eight: 8,
  девять: 9,
  nine: 9,
  десять: 10,
  ten: 10,
  одиннадцать: 11,
  eleven: 11,
  двенадцать: 12,
  twelve: 12,
};

export function extractSpokenEveningClockFragment(transcript: string) {
  const match = transcript.trim().match(SPOKEN_EVENING_PATTERN);

  if (!match?.[1]) {
    return null;
  }

  const token = match[1].toLowerCase();
  const hour = SPOKEN_NUMBER_TO_HOUR[token];

  if (!hour) {
    return null;
  }

  const clockHour = hour === 12 ? 12 : hour + 12;

  return `${clockHour}:00 вечера`;
}

export function isExplicitDurationPhrase(transcript: string) {
  return /(?:^|[\s,.;:!?—-]+)(?:на|for)\s+\d+(?:[.,]\d+)?\s*(?:час(?:а|ов|у)?|годин(?:и|у|ы)?|hours?|hrs?)(?:[,.!\s]|$)/iu.test(
    transcript.trim(),
  );
}
