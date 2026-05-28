const MERIDIEM_PATTERN = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)\b/i;
const TWENTY_FOUR_HOUR_PATTERN = /\b([01]?\d|2[0-3]):([0-5]\d)\b/;

export function parseSpokenClockTime(
  rawTime: string,
  referenceNow = new Date(),
): Date | null {
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

    return buildLocalDateTime(referenceNow, hours, minutes);
  }

  const twentyFourHourMatch = normalized.match(TWENTY_FOUR_HOUR_PATTERN);

  if (twentyFourHourMatch) {
    const hours = Number(twentyFourHourMatch[1]);
    const minutes = Number(twentyFourHourMatch[2]);

    return buildLocalDateTime(referenceNow, hours, minutes);
  }

  const bareHourMatch = normalized.match(/\b(\d{1,2})\b/);

  if (bareHourMatch) {
    const hours = Number(bareHourMatch[1]);

    if (hours >= 0 && hours <= 23) {
      return buildLocalDateTime(referenceNow, hours, 0);
    }
  }

  return null;
}

function buildLocalDateTime(referenceNow: Date, hours: number, minutes: number) {
  const candidate = new Date(
    referenceNow.getFullYear(),
    referenceNow.getMonth(),
    referenceNow.getDate(),
    hours,
    minutes,
    0,
    0,
  );

  if (candidate.getTime() <= referenceNow.getTime()) {
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
