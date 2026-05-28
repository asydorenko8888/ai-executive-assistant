import type { CalendarEvent } from '@/src/entities/calendar/types';
import {
  computeLunchTimeBudget,
  wantsDetailedLunchTimeBreakdown,
} from '@/src/features/agent/calendar/calendarLunchTimeBudget';
import { getMinutesUntilEvent } from '@/src/features/agent/calendar/calendarTime';
import type { SpokenDayLoad, SpokenUrgency } from '@/src/features/voice/speech/voiceSpeechFormatter';
import { resolveSpokenDayLoad, resolveSpokenUrgency } from '@/src/features/voice/speech/voiceSpeechFormatter';

export type SituationalReasonCategory =
  | 'simple_schedule'
  | 'reassurance'
  | 'travel_awareness'
  | 'lunch_free_time'
  | 'late_risk'
  | 'relaxed_schedule'
  | 'compressed_schedule'
  | 'plan_change';

export type EmotionalNeed = 'reassurance' | 'planning' | 'urgency' | 'information';

export type CalendarSituationAnalysis = {
  category: SituationalReasonCategory;
  emotionalNeed: EmotionalNeed;
  urgency: SpokenUrgency;
  dayLoad: SpokenDayLoad;
  transcript: string;
  minutesUntilNextEvent: number | null;
  nextEvent: CalendarEvent | null;
  destinationEvent: CalendarEvent | null;
  modifiers: {
    mentionsLunch: boolean;
    mentionsGym: boolean;
    planChange: boolean;
    asksStillHaveTime: boolean;
    asksHowMuchTime: boolean;
    asksExactTime: boolean;
    asksCanHaveLunch: boolean;
    wantsDetailedTimeBreakdown: boolean;
    uncertainty: boolean;
    userPlaceMentions: string[];
    travelBetweenPlaces: boolean;
    estimatedTravelMinutes: number;
    effectiveFreeMinutes: number | null;
  };
};

const CALENDAR_AWARE_QUESTION_PATTERNS = [
  /\bwhat do i have planned\b/i,
  /\bwhat(?:'s| is) on my (?:calendar|schedule)\b/i,
  /\b(?:my )?(?:next|nearest|upcoming)\s+(?:event|meeting)\b/i,
  /\bplanned(?: for)? today\b/i,
  /\bschedule(?: for)? today\b/i,
  /\bmeetings? today\b/i,
  /\bdo i still have time\b/i,
  /\bhow much time do i have\b/i,
  /\b(?:still|enough) time\b/i,
  /\btime for lunch\b/i,
  /\bmake it to\b/i,
  /\bget to\b/i,
  /\bвстигну\b/i,
  /\bчи в мене є час\b/i,
  /\bскільки часу\b/i,
  /\bхватит\b/i,
  /\bвстреч/i,
  /\bзустріч/i,
  /\bобід/i,
  /\bланч/i,
  /\blunch\b/i,
  /\bgym\b/i,
  /\bспортзал/i,
  /найближч/i,
  /поді[яіє]/i,
  /сьогодні/i,
  /запланован/i,
  /розклад/i,
  /календар/i,
];

const REMINDER_QUESTION_PATTERNS = [
  /\bremind(?: me)?\b/i,
  /\bнагад/i,
  /\bнапомни/i,
];

const PLAN_CHANGE_PATTERNS = [
  /\binstead\b/i,
  /\bdecided to\b/i,
  /\bclosed\b/i,
  /\bзамість\b/i,
  /\bвирішив\b/i,
  /\bзакрит/i,
];

const UNCERTAINTY_PATTERNS = [/\bstill\b/i, /\bokay\b/i, /\bok\b/i, /\bнорм\b/i, /\bвстигну\b/i, /\?$/];

function normalizePlace(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function extractUserPlaceMentions(transcript: string, visibleEvents: CalendarEvent[]) {
  const normalizedTranscript = transcript.toLowerCase();
  const mentions = new Set<string>();

  for (const event of visibleEvents) {
    const location = event.location?.trim();

    if (location && normalizedTranscript.includes(normalizePlace(location))) {
      mentions.add(location);
    }
  }

  const knownFragments = [
    'elk grove village',
    'arlington',
    'бібліотек',
    'библиотек',
    'library',
  ];

  for (const fragment of knownFragments) {
    if (normalizedTranscript.includes(fragment)) {
      mentions.add(fragment);
    }
  }

  return [...mentions];
}

function extractLunchPlaceFromTranscript(transcript: string) {
  const match = transcript.match(/\b(?:lunch|eat|eating|обід|ланч)\s+(?:in|at|у|в)\s+([^?.!,]+)/i);

  return match?.[1]?.trim() ?? null;
}

function pickDestinationEvent(
  visibleEvents: CalendarEvent[],
  userPlaceMentions: string[],
  transcript: string,
): CalendarEvent | null {
  if (visibleEvents.length === 0) {
    return null;
  }

  const normalizedTranscript = transcript.toLowerCase();
  const matchedEvents = visibleEvents.filter((event) =>
    userPlaceMentions.some((place) =>
      normalizePlace(event.location ?? '').includes(normalizePlace(place)),
    ),
  );

  if (/\bmeeting\b/i.test(normalizedTranscript)) {
    const afterMeeting = normalizedTranscript.split(/\bmeeting\b/i).slice(1).join(' ');

    for (const place of userPlaceMentions) {
      if (afterMeeting.includes(normalizePlace(place))) {
        const matched = visibleEvents.find((event) =>
          normalizePlace(event.location ?? '').includes(normalizePlace(place)),
        );

        if (matched) {
          return matched;
        }
      }
    }
  }

  const explicitLunchPlace = extractLunchPlaceFromTranscript(transcript);

  if (explicitLunchPlace && matchedEvents.length > 0) {
    const travelTarget = matchedEvents.find(
      (event) => !normalizePlace(event.location ?? '').includes(normalizePlace(explicitLunchPlace)),
    );

    if (travelTarget) {
      return travelTarget;
    }
  }

  if (matchedEvents.length >= 2) {
    return matchedEvents[matchedEvents.length - 1];
  }

  if (matchedEvents.length === 1) {
    return matchedEvents[0];
  }

  const caresAboutDayDeadline =
    /\b(lunch|still have time|how much time|instead|closed|встигну|скільки часу)\b/i.test(
      normalizedTranscript,
    );

  if (caresAboutDayDeadline && visibleEvents.length > 1) {
    return visibleEvents[visibleEvents.length - 1];
  }

  return visibleEvents[0];
}

function estimateTravelMinutes(fromPlace: string, toPlace: string) {
  const from = normalizePlace(fromPlace);
  const to = normalizePlace(toPlace);

  if (!from || !to || from === to || from.includes(to) || to.includes(from)) {
    return 0;
  }

  return 30;
}

function resolveEffectiveFreeMinutes(params: {
  minutesUntilDestination: number | null;
  travelMinutes: number;
  bufferMinutes?: number;
}) {
  if (params.minutesUntilDestination === null) {
    return null;
  }

  return Math.max(0, params.minutesUntilDestination - params.travelMinutes - (params.bufferMinutes ?? 10));
}

function resolveCategory(params: {
  modifiers: CalendarSituationAnalysis['modifiers'];
  urgency: SpokenUrgency;
  dayLoad: SpokenDayLoad;
  minutesUntilNextEvent: number | null;
}): SituationalReasonCategory {
  const { modifiers, urgency, dayLoad, minutesUntilNextEvent } = params;

  if (urgency === 'immediate' || (minutesUntilNextEvent !== null && minutesUntilNextEvent < 15)) {
    return modifiers.travelBetweenPlaces || modifiers.mentionsLunch ? 'late_risk' : 'late_risk';
  }

  if (modifiers.planChange && (modifiers.asksStillHaveTime || modifiers.uncertainty)) {
    return 'plan_change';
  }

  if (
    modifiers.mentionsLunch &&
    (modifiers.asksHowMuchTime ||
      modifiers.asksExactTime ||
      modifiers.asksCanHaveLunch ||
      modifiers.travelBetweenPlaces ||
      modifiers.userPlaceMentions.length >= 2)
  ) {
    return modifiers.travelBetweenPlaces ? 'travel_awareness' : 'lunch_free_time';
  }

  if (modifiers.asksStillHaveTime || modifiers.uncertainty) {
    return 'reassurance';
  }

  if (urgency === 'relaxed' && dayLoad === 'light') {
    return 'relaxed_schedule';
  }

  if (dayLoad === 'overloaded' || (minutesUntilNextEvent !== null && minutesUntilNextEvent < 45)) {
    return 'compressed_schedule';
  }

  return 'simple_schedule';
}

function resolveEmotionalNeed(category: SituationalReasonCategory): EmotionalNeed {
  switch (category) {
    case 'reassurance':
    case 'plan_change':
      return 'reassurance';
    case 'late_risk':
      return 'urgency';
    case 'travel_awareness':
    case 'lunch_free_time':
    case 'compressed_schedule':
      return 'planning';
    default:
      return 'information';
  }
}

export function isCalendarAwareQuestion(transcript: string) {
  const normalized = transcript.trim();

  if (!normalized) {
    return false;
  }

  if (REMINDER_QUESTION_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return false;
  }

  return CALENDAR_AWARE_QUESTION_PATTERNS.some((pattern) => pattern.test(normalized));
}

/** @deprecated Use isCalendarAwareQuestion */
export function isCalendarScheduleQuestion(transcript: string) {
  return isCalendarAwareQuestion(transcript);
}

export function analyzeCalendarSituation(params: {
  transcript: string;
  visibleEvents: CalendarEvent[];
  referenceNow: Date;
}): CalendarSituationAnalysis {
  const transcript = params.transcript.trim();
  const nextEvent = params.visibleEvents[0] ?? null;
  const minutesUntilNextEvent = nextEvent
    ? getMinutesUntilEvent(nextEvent.startsAt, params.referenceNow)
    : null;
  const dayLoad = resolveSpokenDayLoad(params.visibleEvents.length);
  const userPlaceMentions = extractUserPlaceMentions(transcript, params.visibleEvents);
  const explicitLunchPlace = extractLunchPlaceFromTranscript(transcript);
  const destinationEvent = pickDestinationEvent(
    params.visibleEvents,
    userPlaceMentions,
    transcript,
  );
  const lunchPlace =
    explicitLunchPlace ??
    userPlaceMentions.find(
      (place) =>
        destinationEvent &&
        !normalizePlace(destinationEvent.location ?? '').includes(normalizePlace(place)),
    ) ??
    userPlaceMentions[0] ??
    null;
  let travelBetweenPlaces = Boolean(
    lunchPlace &&
      destinationEvent?.location &&
      estimateTravelMinutes(lunchPlace, destinationEvent.location) > 0,
  );
  let estimatedTravelMinutes =
    lunchPlace && destinationEvent?.location
      ? estimateTravelMinutes(lunchPlace, destinationEvent.location)
      : 0;

  if (
    !travelBetweenPlaces &&
    params.visibleEvents.length > 1 &&
    nextEvent?.location &&
    destinationEvent?.location
  ) {
    const inferredTravel = estimateTravelMinutes(nextEvent.location, destinationEvent.location);

    if (inferredTravel > 0) {
      travelBetweenPlaces = true;
      estimatedTravelMinutes = inferredTravel;
    }
  }

  const minutesUntilDestination = destinationEvent
    ? getMinutesUntilEvent(destinationEvent.startsAt, params.referenceNow)
    : minutesUntilNextEvent;
  const urgency = resolveSpokenUrgency(minutesUntilDestination);
  const effectiveFreeMinutes = resolveEffectiveFreeMinutes({
    minutesUntilDestination,
    travelMinutes: estimatedTravelMinutes,
  });

  const mentionsLunch = /\b(lunch|обід|ланч|їсти|eat|пообід|пообеда)\b/i.test(transcript);
  const asksHowMuchTime =
    /\bhow much time\b/i.test(transcript) ||
    /\bскільки часу\b/i.test(transcript) ||
    /\btime (?:is )?left\b/i.test(transcript) ||
    /\bскільки лишилось\b/i.test(transcript);
  const asksExactTime =
    /\b(exactly|точно|скільки саме|how much time exactly|time exactly)\b/i.test(transcript);
  const asksCanHaveLunch =
    /\b(can i have lunch|can i eat|could i have lunch|have time for lunch)\b/i.test(transcript) ||
    /\b(чи можу (по)?обід|встигну пообідати|можу пообідати)\b/i.test(transcript);

  const modifiers = {
    mentionsLunch,
    mentionsGym: /\b(gym|спортзал|тренування|workout)\b/i.test(transcript),
    planChange: PLAN_CHANGE_PATTERNS.some((pattern) => pattern.test(transcript)),
    asksStillHaveTime: /\b(still have time|still got time|встигну|чи в мене є час)\b/i.test(transcript),
    asksHowMuchTime,
    asksExactTime,
    asksCanHaveLunch,
    wantsDetailedTimeBreakdown: false,
    uncertainty:
      UNCERTAINTY_PATTERNS.some((pattern) => pattern.test(transcript)) ||
      /\bdo i\b/i.test(transcript) ||
      transcript.includes('?'),
    userPlaceMentions,
    travelBetweenPlaces,
    estimatedTravelMinutes,
    effectiveFreeMinutes,
  };

  const category = resolveCategory({
    modifiers,
    urgency,
    dayLoad,
    minutesUntilNextEvent: minutesUntilDestination,
  });

  const analysis: CalendarSituationAnalysis = {
    category,
    emotionalNeed: resolveEmotionalNeed(category),
    urgency,
    dayLoad,
    transcript,
    minutesUntilNextEvent: minutesUntilDestination,
    nextEvent,
    destinationEvent,
    modifiers: {
      ...modifiers,
      wantsDetailedTimeBreakdown: wantsDetailedLunchTimeBreakdown({
        category,
        emotionalNeed: resolveEmotionalNeed(category),
        urgency,
        dayLoad,
        transcript,
        minutesUntilNextEvent: minutesUntilDestination,
        nextEvent,
        destinationEvent,
        modifiers,
      }),
    },
  };

  const timeBudget = computeLunchTimeBudget(analysis);

  console.log('[Calendar Situation]', {
    category: analysis.category,
    emotionalNeed: analysis.emotionalNeed,
    urgency: analysis.urgency,
    minutesUntilNextEvent: analysis.minutesUntilNextEvent,
    effectiveFreeMinutes: analysis.modifiers.effectiveFreeMinutes,
    travelMinutes: analysis.modifiers.estimatedTravelMinutes,
    userPlaceMentions: analysis.modifiers.userPlaceMentions,
    destination: analysis.destinationEvent?.location ?? null,
    mentionsLunch: analysis.modifiers.mentionsLunch,
    planChange: analysis.modifiers.planChange,
    wantsDetailedTimeBreakdown: analysis.modifiers.wantsDetailedTimeBreakdown,
    timeBudget,
  });

  return analysis;
}

export function buildSituationContextForLlm(analysis: CalendarSituationAnalysis): string {
  const destination = analysis.destinationEvent?.location ?? 'unknown';
  const free = analysis.modifiers.effectiveFreeMinutes;
  const travel = analysis.modifiers.estimatedTravelMinutes;
  const budget = computeLunchTimeBudget(analysis);

  const budgetLine = budget
    ? ` Exact minutes until meeting: ${budget.minutesUntilMeeting}. Travel reserve: ${budget.travelKnown ? 'estimated' : 'unknown — use conservative'} ${budget.travelMinutesMin}-${budget.travelMinutesMax} min plus ${budget.bufferMinutes} min buffer. Usable lunch window: ${budget.lunchMinutesMin}-${budget.lunchMinutesMax} min. Suggest leaving in ~${budget.leaveInMinutes} min. Risk: ${budget.riskLevel}.`
    : '';

  const detailHint = analysis.modifiers.wantsDetailedTimeBreakdown
    ? ' User wants exact usable lunch time, travel buffer, leave-by guidance, and safe vs risky — not vague "you can make it".'
    : '';

  return `Situational read (${analysis.category}, emotional need: ${analysis.emotionalNeed}): user is asking in real life, not for a calendar dump. Destination meeting area: ${destination}. Estimated travel buffer: ${travel} min. Practical free window before destination: ${free ?? 'unknown'} min.${budgetLine}${detailHint} Respond with life-aware guidance, not identical timing templates.`;
}
