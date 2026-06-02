import {
  extractCalendarClockFragment,
  parseClockFragmentToMinutes,
} from '@/src/features/agent/calendarIntelligence/calendarClockParser';
import type { CalendarPointSchedule } from '@/src/features/agent/calendarIntelligence/calendarClockParser';
import { formatTimeInExecutiveTimezone } from '@/src/features/agent/calendar/calendarTime';
import {
  addDaysToZonedYmd,
  getExecutiveCalendarTimezone,
  getZonedYmd,
  zonedLocalToUtcMs,
} from '@/src/features/agent/calendar/calendarTimezone';
import type { CalendarConflictLocale } from '@/src/features/agent/calendar/calendarConflictReplies';

const PAST_TOLERANCE_MS = 60_000;

export type CalendarCreateScheduleGuardResult =
  | CalendarPointSchedule
  | {
      ok: false;
      reason: 'past_time_needs_clarification';
      detail: string;
    };

function inferScheduleGuardLocale(transcript: string): CalendarConflictLocale {
  if (/[іїєґ]/iu.test(transcript)) {
    return 'uk';
  }

  if (/[а-яА-ЯёЁ]/u.test(transcript)) {
    return 'ru';
  }

  return 'en';
}

function zonedInstantFromClockMinutes(params: {
  dayOffset: number;
  clockMinutes: number;
  referenceNow: Date;
  timeZone: string;
}) {
  const baseYmd = getZonedYmd(params.referenceNow, params.timeZone);
  const ymd =
    params.dayOffset === 0 ? baseYmd : addDaysToZonedYmd(baseYmd, params.dayOffset);
  const hour = Math.floor(params.clockMinutes / 60);
  const minute = params.clockMinutes % 60;

  return zonedLocalToUtcMs(
    {
      year: ymd.year,
      month: ymd.month,
      day: ymd.day,
      hour,
      minute,
      second: 0,
    },
    params.timeZone,
  );
}

function isScheduleStartInPast(startMs: number, referenceNow: Date) {
  return startMs < referenceNow.getTime() - PAST_TOLERANCE_MS;
}

function hasExplicitMeridiemHint(transcript: string, fragment: string) {
  const context = `${fragment} ${transcript}`.toLowerCase();

  return (
    /\b(?:am|pm|a\.m\.|p\.m\.)\b/i.test(context) ||
    /(?:вечер|вечера|вечером|вечора|увечері|evening|утр|утром|ранку|morning|дня|днём|днем|ночи|ночью|ночі)/iu.test(
      context,
    )
  );
}

function hasExplicitMorningMeridiem(transcript: string, fragment: string) {
  const context = `${fragment} ${transcript}`.toLowerCase();

  if (/\b(?:pm|p\.m\.)\b/i.test(context) || /(?:вечер|evening)/iu.test(context)) {
    return false;
  }

  return (
    /\b(?:am|a\.m\.)\b/i.test(context) ||
    /(?:утр|утром|ранку|morning)/iu.test(context)
  );
}

function hasExplicitEveningMeridiem(transcript: string, fragment: string) {
  const context = `${fragment} ${transcript}`.toLowerCase();

  if (/\b(?:am|a\.m\.)\b/i.test(context) || /(?:утр|утром|ранку|morning)/iu.test(context)) {
    return false;
  }

  return (
    /\b(?:pm|p\.m\.)\b/i.test(context) ||
    /(?:вечер|вечера|вечером|вечора|увечері|evening)/iu.test(context)
  );
}

function isBareAmbiguousHourFragment(fragment: string) {
  const normalized = fragment.trim();

  if (!/^\d{1,2}(?::\d{2})?$/.test(normalized)) {
    return false;
  }

  return !hasExplicitMeridiemHint('', fragment);
}

function formatScheduleClockLabel(startMs: number, timeZone: string) {
  return formatTimeInExecutiveTimezone(new Date(startMs).toISOString(), timeZone);
}

function buildMorningPassedClarification(params: {
  locale: CalendarConflictLocale;
  timeLabel: string;
  tomorrowTimeLabel: string;
}) {
  if (params.locale === 'uk') {
    return `Сьогодні о ${params.timeLabel} уже минуло. Запланувати на завтра о ${params.tomorrowTimeLabel}?`;
  }

  if (params.locale === 'ru') {
    return `Сегодня в ${params.timeLabel} уже прошло. Запланировать на завтра в ${params.tomorrowTimeLabel}?`;
  }

  return `Today ${params.timeLabel} has already passed. Do you mean tomorrow at ${params.tomorrowTimeLabel}?`;
}

function buildAmbiguousMeridiemClarification(params: {
  locale: CalendarConflictLocale;
  todayPmLabel: string;
  tomorrowAmLabel: string;
}) {
  if (params.locale === 'uk') {
    return `Ви маєте на увазі сьогодні о ${params.todayPmLabel} чи завтра о ${params.tomorrowAmLabel}?`;
  }

  if (params.locale === 'ru') {
    return `Вы имеете в виду сегодня в ${params.todayPmLabel} или завтра в ${params.tomorrowAmLabel}?`;
  }

  return `You mean today at ${params.todayPmLabel} or tomorrow at ${params.tomorrowAmLabel}?`;
}

function buildEveningPassedClarification(params: {
  locale: CalendarConflictLocale;
  timeLabel: string;
  tomorrowTimeLabel: string;
}) {
  if (params.locale === 'uk') {
    return `Сьогодні о ${params.timeLabel} уже минуло. Запланувати на завтра о ${params.tomorrowTimeLabel}?`;
  }

  if (params.locale === 'ru') {
    return `Сегодня в ${params.timeLabel} уже прошло. Запланировать на завтра в ${params.tomorrowTimeLabel}?`;
  }

  return `Today ${params.timeLabel} has already passed. Do you mean tomorrow at ${params.tomorrowTimeLabel}?`;
}

export function applyCalendarCreatePastTimeGuard(params: {
  transcript: string;
  referenceNow: Date;
  schedule: Extract<CalendarPointSchedule, { ok: true }>;
  timeZone?: string;
  locale?: CalendarConflictLocale;
}): CalendarCreateScheduleGuardResult {
  const timeZone = params.timeZone ?? getExecutiveCalendarTimezone();
  const locale = params.locale ?? inferScheduleGuardLocale(params.transcript);

  if (!isScheduleStartInPast(params.schedule.startMs, params.referenceNow)) {
    return params.schedule;
  }

  const clockMatch = extractCalendarClockFragment(params.transcript);
  const fragment = clockMatch?.fragment ?? '';
  const clockMinutes = parseClockFragmentToMinutes(fragment, params.transcript);
  const durationMs = Math.max(60 * 60_000, params.schedule.endMs - params.schedule.startMs);
  const dayOffset = params.schedule.explicitDayOffset;

  if (clockMinutes === null) {
    const timeLabel = formatScheduleClockLabel(params.schedule.startMs, timeZone);

    return {
      ok: false,
      reason: 'past_time_needs_clarification',
      detail:
        locale === 'ru'
          ? `Время ${timeLabel} уже прошло. Назовите другое время.`
          : locale === 'uk'
            ? `Час ${timeLabel} уже минув. Назвіть інший час.`
            : `${timeLabel} is already in the past. Please name another time.`,
    };
  }

  const bareAmbiguous =
    isBareAmbiguousHourFragment(fragment) && !hasExplicitMeridiemHint(params.transcript, fragment);

  if (bareAmbiguous && clockMinutes < 12 * 60 && dayOffset === 0) {
    const pmMinutes = clockMinutes + 12 * 60;
    const pmStartMs = zonedInstantFromClockMinutes({
      dayOffset: 0,
      clockMinutes: pmMinutes,
      referenceNow: params.referenceNow,
      timeZone,
    });

    if (!isScheduleStartInPast(pmStartMs, params.referenceNow)) {
      return {
        ok: true,
        startMs: pmStartMs,
        endMs: pmStartMs + durationMs,
        hasExplicitTime: true,
        explicitDayOffset: 0,
      };
    }

    const todayPmLabel = formatScheduleClockLabel(pmStartMs, timeZone);
    const tomorrowAmMs = zonedInstantFromClockMinutes({
      dayOffset: 1,
      clockMinutes,
      referenceNow: params.referenceNow,
      timeZone,
    });
    const tomorrowAmLabel = formatScheduleClockLabel(tomorrowAmMs, timeZone);

    return {
      ok: false,
      reason: 'past_time_needs_clarification',
      detail: buildAmbiguousMeridiemClarification({
        locale,
        todayPmLabel,
        tomorrowAmLabel,
      }),
    };
  }

  if (hasExplicitMorningMeridiem(params.transcript, fragment) && dayOffset === 0) {
    const timeLabel = formatScheduleClockLabel(params.schedule.startMs, timeZone);
    const tomorrowAmMs = zonedInstantFromClockMinutes({
      dayOffset: 1,
      clockMinutes,
      referenceNow: params.referenceNow,
      timeZone,
    });
    const tomorrowTimeLabel = formatScheduleClockLabel(tomorrowAmMs, timeZone);

    return {
      ok: false,
      reason: 'past_time_needs_clarification',
      detail: buildMorningPassedClarification({
        locale,
        timeLabel,
        tomorrowTimeLabel,
      }),
    };
  }

  if (hasExplicitEveningMeridiem(params.transcript, fragment) && dayOffset === 0) {
    const timeLabel = formatScheduleClockLabel(params.schedule.startMs, timeZone);
    const tomorrowPmMs = zonedInstantFromClockMinutes({
      dayOffset: 1,
      clockMinutes,
      referenceNow: params.referenceNow,
      timeZone,
    });
    const tomorrowTimeLabel = formatScheduleClockLabel(tomorrowPmMs, timeZone);

    return {
      ok: false,
      reason: 'past_time_needs_clarification',
      detail: buildEveningPassedClarification({
        locale,
        timeLabel,
        tomorrowTimeLabel,
      }),
    };
  }

  if (dayOffset === 0) {
    const todayPmMinutes = clockMinutes < 12 * 60 ? clockMinutes + 12 * 60 : clockMinutes;
    const tomorrowAmMinutes = clockMinutes >= 12 * 60 ? clockMinutes - 12 * 60 : clockMinutes;
    const todayPmMs = zonedInstantFromClockMinutes({
      dayOffset: 0,
      clockMinutes: todayPmMinutes,
      referenceNow: params.referenceNow,
      timeZone,
    });
    const tomorrowAmMs = zonedInstantFromClockMinutes({
      dayOffset: 1,
      clockMinutes: tomorrowAmMinutes,
      referenceNow: params.referenceNow,
      timeZone,
    });

    return {
      ok: false,
      reason: 'past_time_needs_clarification',
      detail: buildAmbiguousMeridiemClarification({
        locale,
        todayPmLabel: formatScheduleClockLabel(todayPmMs, timeZone),
        tomorrowAmLabel: formatScheduleClockLabel(tomorrowAmMs, timeZone),
      }),
    };
  }

  const timeLabel = formatScheduleClockLabel(params.schedule.startMs, timeZone);

  return {
    ok: false,
    reason: 'past_time_needs_clarification',
    detail:
      locale === 'ru'
        ? `Время ${timeLabel} уже прошло. Назовите другое время.`
        : locale === 'uk'
          ? `Час ${timeLabel} уже минув. Назвіть інший час.`
          : `${timeLabel} is already in the past. Please name another time.`,
  };
}
