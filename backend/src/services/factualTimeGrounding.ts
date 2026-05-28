export type FactualTimeSource = 'server_system_clock';

export type FactualGroundingStatus = 'grounded' | 'unavailable';

function resolveIntlLocale() {
  return 'en-US';
}

function formatTimezoneOffset(date: Date) {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absoluteMinutes = Math.abs(offsetMinutes);
  const hours = String(Math.floor(absoluteMinutes / 60)).padStart(2, '0');
  const minutes = String(absoluteMinutes % 60).padStart(2, '0');

  return `${sign}${hours}:${minutes}`;
}

export function buildServerFactualTimePromptBlock() {
  const now = new Date();

  if (Number.isNaN(now.getTime())) {
    console.log('[FactualGrounding] resolved_server', {
      factualGroundingStatus: 'unavailable',
    });

    return [
      'HARD FACT MODE (critical): Factual time resolution failed on the server.',
      'If the user asks for the current date, time, or day of week, say that you cannot access current date/time right now.',
      'Do NOT guess.',
    ].join(' ');
  }

  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const timezoneOffset = formatTimezoneOffset(now);
  const referenceIso = now.toISOString();
  const dayOfWeek = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: timezone }).format(now);
  const localTime = new Intl.DateTimeFormat(resolveIntlLocale(), {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: timezone,
  }).format(now);
  const localDate = new Intl.DateTimeFormat(resolveIntlLocale(), {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: timezone,
  }).format(now);

  console.log('[FactualGrounding] resolved_server', {
    timeSource: 'server_system_clock',
    timezone,
    timezoneOffset,
    referenceIso,
    dayOfWeek,
    factualGroundingStatus: 'grounded',
  });

  return [
    'HARD FACT MODE (critical — correctness over smooth conversation):',
    'Use ONLY the facts below for current date, time, day-of-week, and schedule timing. Never invent temporal facts.',
    'If unsure, refuse certainty — do not guess or improvise.',
    `CURRENT_TIME: ${referenceIso}`,
    `TIMEZONE: ${timezone} (UTC${timezoneOffset})`,
    `DAY_OF_WEEK: ${dayOfWeek}`,
    `LOCAL_TIME: ${localTime}`,
    `LOCAL_DATE: ${localDate}`,
    'TIME_SOURCE: server_system_clock',
  ].join('\n');
}
