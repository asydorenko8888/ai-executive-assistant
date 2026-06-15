import {
  getLastReferencedCalendarEvent,
} from '@/src/features/agent/calendar/calendarConversationEventMemory';
import { transcriptHasEventPronounReference } from '@/src/features/agent/calendar/calendarEventReferenceTokens';
import { containsLocalAlarmKeyword } from '@/src/features/local-alarms/localAlarmClassification';
import { containsLocalReminderKeyword } from '@/src/features/local-reminders/localReminderReference';
import { containsWeatherDomainKeywords, containsWeatherFollowUpKeywords } from '@/src/features/weather/weatherDomainKeywords';
import { parseWeatherTimeTarget } from '@/src/features/weather/weatherDateScope';
import type { WeatherTimeScope } from '@/src/features/weather/types';

export type ActiveReferenceDomain =
  | 'local_alarm'
  | 'calendar_event'
  | 'local_reminder'
  | 'task'
  | 'weather_context';

export type LastAssistantDomain = 'calendar' | 'alarm' | 'reminder' | 'task' | 'weather' | 'none';

export type ActiveReferenceAction = 'create' | 'move' | 'delete' | 'query' | 'update';

export type ActiveReferenceSource =
  | 'calendar_query_answer'
  | 'calendar_write'
  | 'alarm_query_answer'
  | 'alarm_write'
  | 'reminder_query_answer'
  | 'reminder_write'
  | 'weather_query_answer';

export type ActiveConversationalReference = {
  domain: ActiveReferenceDomain;
  action: ActiveReferenceAction;
  source: ActiveReferenceSource;
  id: string;
  title?: string;
  scheduledTimeMs?: number;
  originalTimeMs?: number;
  updatedTimeMs?: number;
  startISO?: string;
  endISO?: string;
  responseAtMs: number;
};

/** Single source of truth: last entity the assistant explicitly mentioned. */
let latestActiveReference: ActiveConversationalReference | null = null;

/** Last assistant response domain for follow-up routing. */
let lastDomain: LastAssistantDomain = 'none';

const CALENDAR_FOLLOW_UP_KEYWORDS =
  /(?:^|[\s,.;:!?—-])(?:а\s+)?(?:завтра|tomorrow|сегодня|today|сьогодні|что\s+у\s+меня|що\s+у\s+мене|what\s+do\s+i\s+have|какие\s+встреч|які\s+зустріч)(?:[\s,.;:!?—-]|$)/iu;

const ALARM_FOLLOW_UP_KEYWORDS =
  /(?:^|[\s,.;:!?—-])(?:перенес(?:и|і)|сдвинь|move|reschedule|удали(?:ть)?|отмени(?:ть)?|delete|remove|cancel)(?:[\s,.;:!?—-]|$)/iu;

const EXTENDED_PRONOUN_REFERENCE =
  /(?:^|[\s,.;:!?—-])(?:последн(?:ий|ю|его|яя|ее|і)?|тот\s+сам(?:ый|а|у|ое|і)?|этот\s+будильник|цей\s+будильник|this\s+alarm|that\s+alarm|the\s+alarm)(?=[\s,.;:!?—-]|$)/iu;

const CALENDAR_DOMAIN_EXPLICIT =
  /(?:google\s*)?(?:календар[ьяьюеёим]*|calendar|событ(?:ие|ия|ие)?|встреч(?:а|у|и)?|зустріч|meeting|event)/iu;

const CALENDAR_READ_EXPLICIT =
  /(?:что|що).{0,24}(?:у\s+меня|у\s+мене|do\s+i\s+have).{0,20}(?:сегодня|сьогодні|today|завтра|tomorrow)|(?:какие|какая|які|яка).{0,24}(?:встреч|зустріч|событ|events?|meetings?|задач)|(?:перенес(?:и|і)|создай(?:ть)?\s+событ|створи\s+подію)/iu;

const TASK_DOMAIN_EXPLICIT =
  /(?:^|[\s,.;:!?—-])(?:задач(?:а|у|и|у)?|task|tasks)(?:[\s,.;:!?—-]|$)/iu;

const DELETE_ACTION_VERB =
  /(?:^|[\s,.;:!?—-])(?:удали(?:ть)?|убери(?:ть)?|отмени(?:ть)?|видали(?:ти)?|скасуй(?:ти)?|delete|remove|cancel)(?:[\s,.;:!?—-]|$)/iu;

const MOVE_ACTION_VERB =
  /(?:^|[\s,.;:!?—-])(?:перенес(?:и|і|и(?:ть)?)|сдвинь|move|reschedule|shift)(?:[\s,.;:!?—-]|$)/iu;

const UPDATE_ACTION_VERB =
  /(?:^|[\s,.;:!?—-])(?:измени(?:ть)?|измен(?:и|і)|change|update|edit)(?:[\s,.;!?—-]|$)/iu;

const RELATIVE_SCHEDULE_HINT =
  /\b(?:на|to|до|for)\s+(?:завтра|tomorrow|послезавтра|сегодня|today|час|hour|hours|полчаса|half\s+an?\s+hour|\d)/iu;

function domainToLastAssistant(domain: ActiveReferenceDomain): LastAssistantDomain {
  switch (domain) {
    case 'calendar_event':
      return 'calendar';
    case 'local_alarm':
      return 'alarm';
    case 'local_reminder':
      return 'reminder';
    case 'task':
      return 'task';
    case 'weather_context':
      return 'weather';
    default:
      return 'none';
  }
}

function commitActiveReference(reference: ActiveConversationalReference) {
  latestActiveReference = reference;
  lastDomain = domainToLastAssistant(reference.domain);
}

export function commitLocalAlarmActiveReference(params: {
  action: ActiveReferenceAction;
  alarmId: string;
  scheduledTimeMs: number;
  originalTimeMs?: number;
  updatedTimeMs?: number;
  title?: string;
  source?: ActiveReferenceSource;
  responseAtMs?: number;
}) {
  const responseAtMs = params.responseAtMs ?? Date.now();
  const source = params.source ?? (params.action === 'query' ? 'alarm_query_answer' : 'alarm_write');

  commitActiveReference({
    domain: 'local_alarm',
    action: params.action,
    source,
    id: params.alarmId,
    title: params.title,
    scheduledTimeMs: params.updatedTimeMs ?? params.scheduledTimeMs,
    originalTimeMs: params.originalTimeMs,
    updatedTimeMs: params.updatedTimeMs,
    responseAtMs,
  });
}

export function commitCalendarActiveReference(params: {
  action: ActiveReferenceAction;
  eventId: string;
  title: string;
  startISO: string;
  endISO: string;
  source?: ActiveReferenceSource;
  responseAtMs?: number;
}) {
  const responseAtMs = params.responseAtMs ?? Date.now();
  const source = params.source ?? (params.action === 'query' ? 'calendar_query_answer' : 'calendar_write');

  commitActiveReference({
    domain: 'calendar_event',
    action: params.action,
    source,
    id: params.eventId,
    title: params.title,
    startISO: params.startISO,
    endISO: params.endISO,
    responseAtMs,
  });
}

export function commitLocalReminderActiveReference(params: {
  action: ActiveReferenceAction;
  reminderId: string;
  title: string;
  scheduledTimeMs: number;
  source?: ActiveReferenceSource;
  responseAtMs?: number;
}) {
  const responseAtMs = params.responseAtMs ?? Date.now();
  const source = params.source ?? (params.action === 'query' ? 'reminder_query_answer' : 'reminder_write');

  commitActiveReference({
    domain: 'local_reminder',
    action: params.action,
    source,
    id: params.reminderId,
    title: params.title,
    scheduledTimeMs: params.scheduledTimeMs,
    responseAtMs,
  });
}

export function commitWeatherActiveReference(params: {
  action?: ActiveReferenceAction;
  timeScope: WeatherTimeScope;
  targetLabel?: string;
  source?: ActiveReferenceSource;
  responseAtMs?: number;
}) {
  const responseAtMs = params.responseAtMs ?? Date.now();

  commitActiveReference({
    domain: 'weather_context',
    action: params.action ?? 'query',
    source: params.source ?? 'weather_query_answer',
    id: params.timeScope,
    title: params.targetLabel,
    responseAtMs,
  });
}

export function getLatestActiveReference() {
  return latestActiveReference;
}

export function getLastMentionedEntity() {
  return latestActiveReference;
}

export function getLastAssistantDomain(): LastAssistantDomain {
  return lastDomain;
}

/** Alias for conversation routing — last assistant response domain. */
export function getLastDomain(): LastAssistantDomain {
  return lastDomain;
}

export function commitLastDomain(domain: LastAssistantDomain) {
  lastDomain = domain;
}

export function getLastReferencedCalendarEventRef(): Pick<
  ActiveConversationalReference,
  'id' | 'title' | 'startISO' | 'endISO' | 'source' | 'responseAtMs'
> | null {
  if (latestActiveReference?.domain !== 'calendar_event') {
    return null;
  }

  return {
    id: latestActiveReference.id,
    title: latestActiveReference.title,
    startISO: latestActiveReference.startISO,
    endISO: latestActiveReference.endISO,
    source: latestActiveReference.source,
    responseAtMs: latestActiveReference.responseAtMs,
  };
}

export function getLastReferencedAlarmRef(): Pick<
  ActiveConversationalReference,
  'id' | 'title' | 'scheduledTimeMs' | 'source' | 'responseAtMs'
> | null {
  if (latestActiveReference?.domain !== 'local_alarm') {
    return null;
  }

  return {
    id: latestActiveReference.id,
    title: latestActiveReference.title,
    scheduledTimeMs: latestActiveReference.scheduledTimeMs,
    source: latestActiveReference.source,
    responseAtMs: latestActiveReference.responseAtMs,
  };
}

export function resetActiveConversationalReferenceForTests() {
  latestActiveReference = null;
  lastDomain = 'none';
}


export function isCalendarContextFollowUp(transcript: string) {
  const normalized = transcript.trim();

  if (!normalized || lastDomain !== 'calendar') {
    return false;
  }

  if (
    containsWeatherDomainKeywords(normalized) ||
    explicitlyNamesAlarmDomain(normalized) ||
    explicitlyNamesReminderDomain(normalized)
  ) {
    return false;
  }

  return CALENDAR_FOLLOW_UP_KEYWORDS.test(normalized) || explicitlyNamesCalendarDomain(normalized);
}

export function isAlarmContextFollowUp(transcript: string) {
  const normalized = transcript.trim();

  if (!normalized || lastDomain !== 'alarm') {
    return false;
  }

  if (explicitlyNamesCalendarDomain(normalized) || explicitlyNamesReminderDomain(normalized)) {
    return false;
  }

  return (
    ALARM_FOLLOW_UP_KEYWORDS.test(normalized) ||
    explicitlyNamesAlarmDomain(normalized) ||
    needsContextualDomainResolution(normalized)
  );
}

export type ConversationRoutingDomain = 'weather' | 'calendar' | 'alarm' | 'reminder' | 'none';

export type ConversationRoutingResolution = {
  domain: ConversationRoutingDomain;
  reason: string;
};

export function resolveConversationRoutingDomain(
  transcript: string,
  referenceNow = new Date(),
): ConversationRoutingResolution {
  const normalized = transcript.trim();

  if (!normalized) {
    return { domain: 'none', reason: 'empty_transcript' };
  }

  const explicitDomain = resolveExplicitReferenceDomain(normalized);

  if (explicitDomain === 'local_alarm') {
    return { domain: 'alarm', reason: 'explicit_domain_in_utterance' };
  }

  if (explicitDomain === 'local_reminder') {
    return { domain: 'reminder', reason: 'explicit_domain_in_utterance' };
  }

  if (explicitDomain === 'calendar_event' || explicitDomain === 'task') {
    return { domain: 'calendar', reason: 'explicit_domain_in_utterance' };
  }

  if (needsContextualDomainResolution(normalized)) {
    const pronounRouting = resolvePronounTargetDomain(normalized);

    if (pronounRouting.selectedDomain === 'weather_context') {
      return { domain: 'weather', reason: pronounRouting.reason };
    }

    if (pronounRouting.selectedDomain === 'calendar_event' || pronounRouting.selectedDomain === 'task') {
      return { domain: 'calendar', reason: pronounRouting.reason };
    }

    if (pronounRouting.selectedDomain === 'local_alarm') {
      return { domain: 'alarm', reason: pronounRouting.reason };
    }

    if (pronounRouting.selectedDomain === 'local_reminder') {
      return { domain: 'reminder', reason: pronounRouting.reason };
    }
  }

  if (containsWeatherDomainKeywords(normalized) && !explicitlyNamesCalendarDomain(normalized)) {
    return { domain: 'weather', reason: 'explicit_weather_keywords' };
  }

  if (explicitlyNamesCalendarReadIntent(normalized)) {
    return { domain: 'calendar', reason: 'explicit_calendar_read_keywords' };
  }

  if (isWeatherContextFollowUp(normalized, referenceNow)) {
    return { domain: 'weather', reason: 'last_domain_weather_follow_up' };
  }

  if (isCalendarContextFollowUp(normalized)) {
    return { domain: 'calendar', reason: 'last_domain_calendar_follow_up' };
  }

  if (isAlarmContextFollowUp(normalized)) {
    return { domain: 'alarm', reason: 'last_domain_alarm_follow_up' };
  }

  return { domain: 'none', reason: 'fallback_classification' };
}

export function shouldForceWeatherRouting(transcript: string, referenceNow = new Date()) {
  const routing = resolveConversationRoutingDomain(transcript, referenceNow);

  return routing.domain === 'weather';
}

export function shouldSuppressCalendarRoutingForDomainContext(
  transcript: string,
  referenceNow = new Date(),
) {
  const routing = resolveConversationRoutingDomain(transcript, referenceNow);

  return routing.domain === 'weather' || routing.domain === 'alarm' || routing.domain === 'reminder';
}

export function syncAssistantContextFromCalendarMemory(referenceNow = new Date()) {
  const ref = getLastReferencedCalendarEvent(referenceNow);

  if (!ref?.eventId || ref.eventId.startsWith('pending:')) {
    return false;
  }

  commitCalendarActiveReference({
    action: 'query',
    eventId: ref.eventId,
    title: ref.title,
    startISO: ref.startTime,
    endISO: ref.endTime,
    source: 'calendar_query_answer',
  });

  return true;
}

export function isWeatherContextFollowUp(transcript: string, referenceNow = new Date()) {
  const normalized = transcript.trim();

  if (!normalized || lastDomain !== 'weather') {
    return false;
  }

  if (
    explicitlyNamesAlarmDomain(normalized) ||
    explicitlyNamesReminderDomain(normalized) ||
    explicitlyNamesCalendarDomain(normalized)
  ) {
    return false;
  }

  if (containsWeatherFollowUpKeywords(normalized)) {
    return true;
  }

  const target = parseWeatherTimeTarget(normalized, { referenceNow });

  return target.timeScope !== 'unspecified';
}

export function transcriptHasConversationalPronounReference(transcript: string) {
  const normalized = transcript.trim();

  if (!normalized) {
    return false;
  }

  return transcriptHasEventPronounReference(normalized) || EXTENDED_PRONOUN_REFERENCE.test(normalized);
}

export function explicitlyNamesAlarmDomain(transcript: string) {
  return containsLocalAlarmKeyword(transcript.trim());
}

export function explicitlyNamesReminderDomain(transcript: string) {
  return containsLocalReminderKeyword(transcript.trim());
}

export function explicitlyNamesCalendarDomain(transcript: string) {
  const normalized = transcript.trim();

  if (!normalized) {
    return false;
  }

  if (explicitlyNamesAlarmDomain(normalized) || explicitlyNamesReminderDomain(normalized)) {
    return false;
  }

  return CALENDAR_DOMAIN_EXPLICIT.test(normalized) || TASK_DOMAIN_EXPLICIT.test(normalized);
}

export function explicitlyNamesCalendarReadIntent(transcript: string) {
  const normalized = transcript.trim();

  if (!normalized || explicitlyNamesAlarmDomain(normalized) || explicitlyNamesReminderDomain(normalized)) {
    return false;
  }

  if (containsWeatherDomainKeywords(normalized) && !explicitlyNamesCalendarDomain(normalized)) {
    return false;
  }

  return CALENDAR_READ_EXPLICIT.test(normalized) || explicitlyNamesCalendarDomain(normalized);
}

export function isRelativeContextFollowUpCommand(transcript: string) {
  const normalized = transcript.trim();

  if (!normalized || explicitlyNamesAlarmDomain(normalized) || explicitlyNamesReminderDomain(normalized)) {
    return false;
  }

  const hasActionVerb =
    MOVE_ACTION_VERB.test(normalized) ||
    DELETE_ACTION_VERB.test(normalized) ||
    UPDATE_ACTION_VERB.test(normalized);

  if (!hasActionVerb) {
    return false;
  }

  if (transcriptHasConversationalPronounReference(normalized)) {
    return true;
  }

  return RELATIVE_SCHEDULE_HINT.test(normalized);
}

export function needsContextualDomainResolution(transcript: string) {
  const normalized = transcript.trim();

  if (!normalized || explicitlyNamesAlarmDomain(normalized) || explicitlyNamesReminderDomain(normalized)) {
    return false;
  }

  return (
    transcriptHasConversationalPronounReference(normalized) ||
    isRelativeContextFollowUpCommand(normalized)
  );
}

export function isPronounDeleteOrCancelRequest(transcript: string) {
  const normalized = transcript.trim();

  return (
    DELETE_ACTION_VERB.test(normalized) &&
    (transcriptHasConversationalPronounReference(normalized) || explicitlyNamesAlarmDomain(normalized))
  );
}

export function isPronounMoveRequest(transcript: string) {
  const normalized = transcript.trim();

  return (
    MOVE_ACTION_VERB.test(normalized) &&
    (transcriptHasConversationalPronounReference(normalized) || explicitlyNamesAlarmDomain(normalized))
  );
}

export type ExplicitReferenceDomain = ActiveReferenceDomain | null;

export type PronounRoutingResolution = {
  latestReferenceDomain: ActiveReferenceDomain | null;
  latestReferenceId: string | null;
  latestReferenceSource: ActiveReferenceSource | null;
  selectedDomain: ActiveReferenceDomain | null;
  selectedId: string | null;
  reason: string;
};

export function resolveExplicitReferenceDomain(transcript: string): ExplicitReferenceDomain {
  const normalized = transcript.trim();

  if (!normalized) {
    return null;
  }

  if (explicitlyNamesAlarmDomain(normalized)) {
    return 'local_alarm';
  }

  if (explicitlyNamesReminderDomain(normalized)) {
    return 'local_reminder';
  }

  if (explicitlyNamesCalendarDomain(normalized)) {
    return TASK_DOMAIN_EXPLICIT.test(normalized) ? 'task' : 'calendar_event';
  }

  return null;
}

export function resolvePronounTargetDomain(transcript: string): PronounRoutingResolution {
  const normalized = transcript.trim();
  const latest = getLatestActiveReference();
  const latestReferenceDomain = latest?.domain ?? null;
  const latestReferenceId = latest?.id ?? null;
  const latestReferenceSource = latest?.source ?? null;
  const hasPronoun = transcriptHasConversationalPronounReference(normalized);
  const explicitDomain = resolveExplicitReferenceDomain(normalized);
  const needsContext = needsContextualDomainResolution(normalized);

  const base = {
    transcript: normalized,
    hasPronoun,
    explicitDomain,
    latestReferenceDomain,
    latestReferenceSource,
    lastAssistantDomain: getLastAssistantDomain(),
  };

  if (!normalized) {
    const resolution: PronounRoutingResolution = {
      latestReferenceDomain,
      latestReferenceId,
      latestReferenceSource,
      selectedDomain: null,
      selectedId: null,
      reason: 'empty_transcript',
    };
    logReferenceResolution({ ...base, ...resolution });
    return resolution;
  }

  if (explicitDomain) {
    const resolution: PronounRoutingResolution = {
      latestReferenceDomain,
      latestReferenceId,
      latestReferenceSource,
      selectedDomain: explicitDomain,
      selectedId:
        latestReferenceDomain === explicitDomain ||
        (explicitDomain === 'task' && latestReferenceDomain === 'calendar_event')
          ? latestReferenceId
          : null,
      reason: 'explicit_domain_in_utterance',
    };
    logReferenceResolution({ ...base, ...resolution });
    return resolution;
  }

  if (!needsContext) {
    const resolution: PronounRoutingResolution = {
      latestReferenceDomain,
      latestReferenceId,
      latestReferenceSource,
      selectedDomain: null,
      selectedId: null,
      reason: 'no_contextual_follow_up',
    };
    logReferenceResolution({ ...base, ...resolution });
    return resolution;
  }

  if (latestReferenceDomain && latestReferenceId) {
    const resolution: PronounRoutingResolution = {
      latestReferenceDomain,
      latestReferenceId,
      latestReferenceSource,
      selectedDomain: latestReferenceDomain,
      selectedId: latestReferenceId,
      reason: 'last_mentioned_entity',
    };
    logReferenceResolution({ ...base, ...resolution });
    return resolution;
  }

  const resolution: PronounRoutingResolution = {
    latestReferenceDomain,
    latestReferenceId,
    latestReferenceSource,
    selectedDomain: null,
    selectedId: null,
    reason: 'pronoun_without_last_mentioned_entity',
  };
  logReferenceResolution({ ...base, ...resolution });
  return resolution;
}

export function shouldBlockLocalAlarmRoutingForContextFollowUp(transcript: string) {
  if (explicitlyNamesAlarmDomain(transcript)) {
    return false;
  }

  if (!needsContextualDomainResolution(transcript)) {
    return false;
  }

  const selected = resolvePronounTargetDomain(transcript).selectedDomain;

  return selected !== null && selected !== 'local_alarm';
}

/** @deprecated Use shouldBlockLocalAlarmRoutingForContextFollowUp */
export function shouldBlockLocalAlarmRoutingForPronoun(transcript: string) {
  return shouldBlockLocalAlarmRoutingForContextFollowUp(transcript);
}

export function shouldRoutePronounToLocalAlarm(transcript: string) {
  const normalized = transcript.trim();

  if (!normalized || shouldBlockLocalAlarmRoutingForContextFollowUp(normalized)) {
    return false;
  }

  const routing = resolvePronounTargetDomain(normalized);

  if (routing.selectedDomain !== 'local_alarm') {
    return false;
  }

  return (
    isPronounDeleteOrCancelRequest(normalized) ||
    isPronounMoveRequest(normalized) ||
    isRelativeContextFollowUpCommand(normalized)
  );
}

export function shouldRoutePronounToCalendar(transcript: string) {
  const normalized = transcript.trim();

  if (!normalized || !needsContextualDomainResolution(normalized)) {
    return false;
  }

  const routing = resolvePronounTargetDomain(normalized);
  const selected = routing.selectedDomain;

  if (selected !== 'calendar_event' && selected !== 'task') {
    return false;
  }

  return (
    DELETE_ACTION_VERB.test(normalized) ||
    MOVE_ACTION_VERB.test(normalized) ||
    UPDATE_ACTION_VERB.test(normalized)
  );
}

export function shouldRoutePronounToLocalReminder(transcript: string) {
  const normalized = transcript.trim();

  if (!normalized || !needsContextualDomainResolution(normalized)) {
    return false;
  }

  if (resolvePronounTargetDomain(normalized).selectedDomain !== 'local_reminder') {
    return false;
  }

  return DELETE_ACTION_VERB.test(normalized);
}

export function getReferencedLocalAlarmId() {
  if (latestActiveReference?.domain !== 'local_alarm') {
    return null;
  }

  return latestActiveReference.id;
}

export function getReferencedLocalReminderId() {
  if (latestActiveReference?.domain !== 'local_reminder') {
    return null;
  }

  return latestActiveReference.id;
}

function logReferenceResolution(params: {
  transcript: string;
  hasPronoun: boolean;
  explicitDomain: ExplicitReferenceDomain;
  latestReferenceDomain: ActiveReferenceDomain | null;
  latestReferenceSource: ActiveReferenceSource | null;
  lastAssistantDomain: LastAssistantDomain;
  latestReferenceId: string | null;
  selectedDomain: ActiveReferenceDomain | null;
  selectedId: string | null;
  reason: string;
}) {
  console.log(
    'REFERENCE_RESOLUTION',
    JSON.stringify({
      transcript: params.transcript,
      hasPronoun: params.hasPronoun,
      explicitDomain: params.explicitDomain,
      latestReferenceDomain: params.latestReferenceDomain,
      latestReferenceSource: params.latestReferenceSource,
      lastAssistantDomain: params.lastAssistantDomain,
      selectedDomain: params.selectedDomain,
      selectedId: params.selectedId,
      reason: params.reason,
    }),
  );
}
