const MERIDIEM_PATTERN = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)\b/i;
const TWENTY_FOUR_HOUR_PATTERN = /\b([01]?\d|2[0-3]):([0-5]\d)\b/;

export type ParseSpokenClockTimeOptions = {
  /** When false, do not roll a same-calendar-day time into tomorrow if it is in the past. */
  rollToNextDayIfPast?: boolean;
};

export function parseSpokenClockTime(
  rawTime: string,
  referenceNow = new Date(),
  options: ParseSpokenClockTimeOptions = {},
): Date | null {
  const rollToNextDayIfPast = options.rollToNextDayIfPast !== false;
  const normalized = rawTime.trim().toLowerCase().replace(/\./g, '');

  const meridiemMatch = normalized.match(MERIDIEM_PATTERN);

  if (meridiemMatch) {
    let hours = Number(meridiemMatch[1]);
    const minutes = meridiemMatch[2] ? Number(meridiemMatch[2]) : 0;
    const meridiem = meridiemMatch[3].toLowerCase();

    if (meridiem.startsWith('p') && hours < 12) {
      hours += 12;
    }

    if (meridiem.startsWith('a') && hours === 12) {
      hours = 0;
    }

    return buildLocalDateTime(
      referenceNow,
      applyRussianMeridiemHint(hours, normalized),
      minutes,
      rollToNextDayIfPast,
    );
  }

  const twentyFourHourMatch = normalized.match(TWENTY_FOUR_HOUR_PATTERN);

  if (twentyFourHourMatch) {
    const hours = applyRussianMeridiemHint(Number(twentyFourHourMatch[1]), normalized);
    const minutes = Number(twentyFourHourMatch[2]);

    return buildLocalDateTime(referenceNow, hours, minutes, rollToNextDayIfPast);
  }

  const bareHourMatch = normalized.match(/\b(\d{1,2})\b/);

  if (bareHourMatch) {
    let hours = Number(bareHourMatch[1]);

    if (hours >= 0 && hours <= 23) {
      hours = applyRussianMeridiemHint(hours, normalized);
      return buildLocalDateTime(referenceNow, hours, 0, rollToNextDayIfPast);
    }
  }

  return null;
}

function applyRussianMeridiemHint(hours: number, normalizedFragment: string) {
  // Note: \b word boundaries are unreliable with Cyrillic in JS — use substring checks.
  if (/вечер/ui.test(normalizedFragment) && hours >= 1 && hours <= 11) {
    return hours + 12;
  }

  if (/утр/ui.test(normalizedFragment) && hours === 12) {
    return 0;
  }

  if (/(?:дня|днём|днем)/ui.test(normalizedFragment) && hours >= 1 && hours <= 11) {
    return hours + 12;
  }

  if (/ноч/ui.test(normalizedFragment) && hours >= 1 && hours <= 11) {
    return hours + 12;
  }

  return hours;
}

function buildLocalDateTime(
  referenceNow: Date,
  hours: number,
  minutes: number,
  rollToNextDayIfPast: boolean,
) {
  const candidate = new Date(
    referenceNow.getFullYear(),
    referenceNow.getMonth(),
    referenceNow.getDate(),
    hours,
    minutes,
    0,
    0,
  );

  if (rollToNextDayIfPast && candidate.getTime() <= referenceNow.getTime()) {
    candidate.setDate(candidate.getDate() + 1);
  }

  return candidate;
}

export function formatReminderScheduleLabel(scheduledForIso: string, referenceNow = new Date()) {
  const scheduledDate = new Date(scheduledForIso);

  if (Number.isNaN(scheduledDate.getTime())) {
    return scheduledForIso;
  }

  const isToday = scheduledDate.toDateString() === referenceNow.toDateString();
  const timeLabel = scheduledDate.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  if (isToday) {
    return `at ${timeLabel}`;
  }

  return `on ${scheduledDate.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
  })} at ${timeLabel}`;
}
