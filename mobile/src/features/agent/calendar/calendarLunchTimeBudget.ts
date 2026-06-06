import type { CalendarSituationAnalysis } from '@/src/features/agent/calendar/calendarSituationalReasoning';
import { isCalendarTimeUntilEventQuery } from '@/src/features/agent/calendar/calendarTimeUntilQuery';

export type LunchTimeRiskLevel = 'safe' | 'moderate' | 'tight' | 'risky';

export type LunchTimeBudget = {
  minutesUntilMeeting: number;
  travelMinutesMin: number;
  travelMinutesMax: number;
  travelKnown: boolean;
  bufferMinutes: number;
  reservedMinutesMin: number;
  reservedMinutesMax: number;
  lunchMinutesMin: number;
  lunchMinutesMax: number;
  leaveInMinutes: number;
  riskLevel: LunchTimeRiskLevel;
};

const BUFFER_MINUTES_KNOWN_TRAVEL = 5;
const BUFFER_MINUTES_UNKNOWN_TRAVEL = 10;
const UNKNOWN_TRAVEL_MIN = 25;
const UNKNOWN_TRAVEL_MAX = 35;

export function roundSpeechMinutes(value: number) {
  return Math.max(0, Math.round(value / 5) * 5);
}

export function formatSpeechMinuteRange(
  min: number,
  max: number,
  locale: 'en' | 'uk' | 'ru',
) {
  const safeMin = roundSpeechMinutes(min);
  const safeMax = roundSpeechMinutes(max);

  if (safeMin === safeMax) {
    if (locale === 'uk') {
      return `${safeMin} хвилин`;
    }

    if (locale === 'ru') {
      return `${safeMin} минут`;
    }

    return `${safeMin} minutes`;
  }

  if (locale === 'uk') {
    return `${safeMin}–${safeMax} хвилин`;
  }

  if (locale === 'ru') {
    return `${safeMin}–${safeMax} минут`;
  }

  return `${safeMin}–${safeMax} minutes`;
}

function resolveRiskLevel(lunchMinutesMax: number): LunchTimeRiskLevel {
  if (lunchMinutesMax >= 45) {
    return 'safe';
  }

  if (lunchMinutesMax >= 28) {
    return 'moderate';
  }

  if (lunchMinutesMax >= 15) {
    return 'tight';
  }

  return 'risky';
}

export function computeLunchTimeBudget(analysis: CalendarSituationAnalysis): LunchTimeBudget | null {
  const minutesUntilMeeting = analysis.minutesUntilNextEvent;

  if (minutesUntilMeeting === null) {
    return null;
  }

  const total = Math.max(1, Math.round(minutesUntilMeeting));
  const travelKnown =
    analysis.modifiers.travelBetweenPlaces && analysis.modifiers.estimatedTravelMinutes > 0;
  const travelMinutesMin = travelKnown
    ? analysis.modifiers.estimatedTravelMinutes
    : UNKNOWN_TRAVEL_MIN;
  const travelMinutesMax = travelKnown
    ? analysis.modifiers.estimatedTravelMinutes + 5
    : UNKNOWN_TRAVEL_MAX;
  const bufferMinutes = travelKnown ? BUFFER_MINUTES_KNOWN_TRAVEL : BUFFER_MINUTES_UNKNOWN_TRAVEL;
  const reservedMinutesMin = travelMinutesMin + bufferMinutes;
  const reservedMinutesMax = travelMinutesMax + bufferMinutes;
  const lunchMinutesMax = Math.max(0, total - reservedMinutesMin);
  const lunchMinutesMin = Math.max(0, total - reservedMinutesMax);
  const leaveInMinutes = Math.max(0, total - travelMinutesMax);

  return {
    minutesUntilMeeting: total,
    travelMinutesMin,
    travelMinutesMax,
    travelKnown,
    bufferMinutes,
    reservedMinutesMin,
    reservedMinutesMax,
    lunchMinutesMin: roundSpeechMinutes(lunchMinutesMin),
    lunchMinutesMax: roundSpeechMinutes(lunchMinutesMax),
    leaveInMinutes: roundSpeechMinutes(leaveInMinutes),
    riskLevel: resolveRiskLevel(lunchMinutesMax),
  };
}

export function wantsDetailedLunchTimeBreakdown(analysis: CalendarSituationAnalysis) {
  if (isCalendarTimeUntilEventQuery(analysis.transcript)) {
    return false;
  }

  if (analysis.minutesUntilNextEvent === null) {
    return false;
  }

  const { modifiers, category } = analysis;
  const asksTime =
    modifiers.asksExactTime ||
    modifiers.asksCanHaveLunch ||
    modifiers.asksHowMuchTime ||
    (modifiers.mentionsLunch && modifiers.uncertainty);

  if (!asksTime) {
    return false;
  }

  return (
    modifiers.mentionsLunch ||
    category === 'lunch_free_time' ||
    category === 'travel_awareness' ||
    category === 'plan_change' ||
    category === 'reassurance' ||
    category === 'compressed_schedule'
  );
}
