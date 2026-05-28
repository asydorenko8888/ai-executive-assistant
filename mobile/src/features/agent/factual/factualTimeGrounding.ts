import type { ExecutiveAgentOrchestrator } from '@/src/features/agent/agentOrchestrator';
import { isOperationalCalendarWriteRequest } from '@/src/features/agent/intent/operationalCalendarWriteDetection';
import { isCalendarAwareQuestion } from '@/src/features/agent/calendar/calendarSituationalReasoning';
import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';
import { getChatLocaleFromVoiceLanguage } from '@/src/features/chat/services/voiceLanguage';

export type FactualTimeSource = 'orchestrator_context' | 'system_clock';

export type FactualGroundingStatus = 'grounded' | 'unavailable';

export type AssistantResponseMode =
  | 'factual'
  | 'conversational'
  | 'emotional'
  | 'operational';

export type FactualTimeSnapshot = {
  status: FactualGroundingStatus;
  source: FactualTimeSource;
  referenceIso: string;
  timezone: string;
  timezoneOffset: string;
  dayOfWeekEn: string;
  dayOfWeekLocalized: string;
  localTimeLabel: string;
  localDateLabel: string;
  epochMs: number;
};

export type FactualGroundingContext = {
  snapshot: FactualTimeSnapshot;
  responseMode: AssistantResponseMode;
  temporalQueryLocked: boolean;
  systemPromptBlock: string;
};

function resolveIntlLocale(languageCode?: VoiceLanguageCode) {
  if (languageCode === 'uk-UA') {
    return 'uk-UA';
  }

  if (languageCode === 'ru-RU') {
    return 'ru-RU';
  }

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

export function resolveFactualTimeSnapshot(params: {
  referenceNow?: Date | string;
  source?: FactualTimeSource;
  languageCode?: VoiceLanguageCode;
}): FactualTimeSnapshot {
  const source = params.source ?? 'system_clock';
  const parsed =
    params.referenceNow instanceof Date
      ? params.referenceNow
      : new Date(params.referenceNow ?? Date.now());

  if (Number.isNaN(parsed.getTime())) {
    return {
      status: 'unavailable',
      source,
      referenceIso: '',
      timezone: 'unknown',
      timezoneOffset: '',
      dayOfWeekEn: '',
      dayOfWeekLocalized: '',
      localTimeLabel: '',
      localDateLabel: '',
      epochMs: NaN,
    };
  }

  const intlLocale = resolveIntlLocale(params.languageCode);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'local';
  const timezoneOffset = formatTimezoneOffset(parsed);

  return {
    status: 'grounded',
    source,
    referenceIso: parsed.toISOString(),
    timezone,
    timezoneOffset,
    dayOfWeekEn: new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: timezone }).format(parsed),
    dayOfWeekLocalized: new Intl.DateTimeFormat(intlLocale, {
      weekday: 'long',
      timeZone: timezone,
    }).format(parsed),
    localTimeLabel: new Intl.DateTimeFormat(intlLocale, {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: timezone,
    }).format(parsed),
    localDateLabel: new Intl.DateTimeFormat(intlLocale, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: timezone,
    }).format(parsed),
    epochMs: parsed.getTime(),
  };
}

export function logFactualGrounding(stage: string, details: Record<string, unknown>) {
  console.log('[FactualGrounding]', stage, details);
}

const TEMPORAL_FACTUAL_QUERY_PATTERNS = [
  /\b(?:what|which)\s+(?:day|time)\s+(?:is\s+it|today|now)\b/i,
  /\b(?:what day is (?:it )?today)\b/i,
  /\b(?:what time is (?:it )?now)\b/i,
  /\b(?:какой|какое|который)\s+(?:сегодня\s+)?(?:день|число|час|время)\b/i,
  /\b(?:сегодня|сьогодні|сейчас)\s+(?:какой|какое)\s+(?:день|число|час)\b/i,
  /\b(?:сколько)\s+(?:сейчас\s+)?(?:времени|время)\b/i,
  /\b(?:який|яка)\s+(?:сьогодні\s+)?(?:день|число|година)\b/i,
  /\b(?:котра|котрий)\s+(?:сьогодні\s+)?(?:година|день)\b/i,
  /\b(?:is it)\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+today\b/i,
  /\b(?:сегодня)\s+(?:понедельник|вторник|сред|четверг|пятниц|суббот|воскрес)\b/i,
];

export function isTemporalFactualQuery(transcript: string) {
  const normalized = transcript.trim();

  if (!normalized || isOperationalCalendarWriteRequest(normalized)) {
    return false;
  }

  return TEMPORAL_FACTUAL_QUERY_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function isTemporalOrScheduleFactualQuery(transcript: string) {
  return isTemporalFactualQuery(transcript) || isCalendarAwareQuestion(transcript);
}

export function resolveResponseMode(params: {
  transcript: string;
  operationalBypass: boolean;
  emotionalEligible: boolean;
}): AssistantResponseMode {
  if (params.operationalBypass || isOperationalCalendarWriteRequest(params.transcript)) {
    return 'operational';
  }

  if (isTemporalOrScheduleFactualQuery(params.transcript)) {
    return 'factual';
  }

  if (params.emotionalEligible) {
    return 'emotional';
  }

  return 'conversational';
}

export function buildFactualUnavailableReply(languageCode?: VoiceLanguageCode) {
  const locale = getChatLocaleFromVoiceLanguage(languageCode ?? 'en-US');

  if (locale === 'uk') {
    return 'Зараз не можу достовірно отримати поточну дату чи час.';
  }

  if (locale === 'ru') {
    return 'Сейчас не могу достоверно получить текущую дату или время.';
  }

  return 'I cannot access current date/time right now.';
}

function buildHardFactSystemPromptBlock(
  snapshot: FactualTimeSnapshot,
  responseMode: AssistantResponseMode,
  temporalQueryLocked: boolean,
) {
  if (snapshot.status !== 'grounded') {
    return [
      'HARD FACT MODE (critical): Factual time resolution failed.',
      'If the user asks for the current date, time, or day of week, say exactly that you cannot access current date/time right now.',
      'Do NOT guess, improvise, or recover socially.',
    ].join(' ');
  }

  const lockLine = temporalQueryLocked
    ? 'This turn is locked to FACTUAL mode for time/calendar/schedule facts. Do not answer day-of-week, date, time, or schedule state from memory — only from the block below and calendar list.'
    : 'Use only the factual block below for any current date, time, or day-of-week statements.';

  return [
    'HARD FACT MODE (critical — correctness over smooth conversation):',
    lockLine,
    'Never invent or recall the current day, date, time, or schedule. If unsure, refuse certainty.',
    `CURRENT_TIME: ${snapshot.referenceIso}`,
    `TIMEZONE: ${snapshot.timezone} (UTC${snapshot.timezoneOffset})`,
    `DAY_OF_WEEK: ${snapshot.dayOfWeekEn}`,
    `DAY_OF_WEEK_LOCALIZED: ${snapshot.dayOfWeekLocalized}`,
    `LOCAL_TIME: ${snapshot.localTimeLabel}`,
    `LOCAL_DATE: ${snapshot.localDateLabel}`,
    `TIME_SOURCE: ${snapshot.source}`,
    `RESPONSE_MODE: ${responseMode}`,
  ].join('\n');
}

export function buildFactualGroundingContext(params: {
  orchestrator: ExecutiveAgentOrchestrator;
  languageCode?: VoiceLanguageCode;
  userTranscript?: string;
}): FactualGroundingContext {
  const referenceNow = new Date(params.orchestrator.context.now);
  const snapshot = resolveFactualTimeSnapshot({
    referenceNow,
    source: 'orchestrator_context',
    languageCode: params.languageCode,
  });
  const transcript = params.userTranscript?.trim() ?? '';
  const temporalQueryLocked = isTemporalOrScheduleFactualQuery(transcript);
  const responseMode = resolveResponseMode({
    transcript,
    operationalBypass: isOperationalCalendarWriteRequest(transcript),
    emotionalEligible: false,
  });

  logFactualGrounding('resolved', {
    timeSource: snapshot.source,
    timezone: snapshot.timezone,
    timezoneOffset: snapshot.timezoneOffset,
    referenceIso: snapshot.referenceIso,
    dayOfWeek: snapshot.dayOfWeekEn,
    dayOfWeekLocalized: snapshot.dayOfWeekLocalized,
    responseMode,
    temporalQueryLocked,
    factualGroundingStatus: snapshot.status,
    plannerContextIso: params.orchestrator.context.now,
  });

  return {
    snapshot,
    responseMode,
    temporalQueryLocked,
    systemPromptBlock: buildHardFactSystemPromptBlock(snapshot, responseMode, temporalQueryLocked),
  };
}

export function buildFactualGroundingContextFromIso(params: {
  referenceIso: string;
  languageCode?: VoiceLanguageCode;
  userTranscript?: string;
}) {
  const snapshot = resolveFactualTimeSnapshot({
    referenceNow: params.referenceIso,
    source: 'system_clock',
    languageCode: params.languageCode,
  });
  const transcript = params.userTranscript?.trim() ?? '';
  const temporalQueryLocked = isTemporalOrScheduleFactualQuery(transcript);
  const responseMode = resolveResponseMode({
    transcript,
    operationalBypass: isOperationalCalendarWriteRequest(transcript),
    emotionalEligible: false,
  });

  logFactualGrounding('resolved_server', {
    timeSource: snapshot.source,
    timezone: snapshot.timezone,
    referenceIso: snapshot.referenceIso,
    dayOfWeek: snapshot.dayOfWeekEn,
    responseMode,
    factualGroundingStatus: snapshot.status,
  });

  return {
    snapshot,
    responseMode,
    temporalQueryLocked,
    systemPromptBlock: buildHardFactSystemPromptBlock(snapshot, responseMode, temporalQueryLocked),
  };
}
