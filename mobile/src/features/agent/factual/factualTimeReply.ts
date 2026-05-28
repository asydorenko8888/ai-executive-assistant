import {
  buildFactualUnavailableReply,
  isTemporalFactualQuery,
  logFactualGrounding,
  type FactualTimeSnapshot,
} from '@/src/features/agent/factual/factualTimeGrounding';
import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';
import { getChatLocaleFromVoiceLanguage } from '@/src/features/chat/services/voiceLanguage';

export type FactualTimeReplyParams = {
  transcript: string;
  snapshot: FactualTimeSnapshot;
  languageCode: VoiceLanguageCode;
};

const DAY_QUERY_PATTERN =
  /\b(?:what|which)\s+day\b|\b(?:какой|какое|который)\s+(?:сегодня\s+)?день\b|\b(?:сегодня|сьогодні).{0,24}(?:день|день недели)\b|\b(?:який)\s+(?:сьогодні\s+)?день\b|\b(?:is it)\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i;

const TIME_QUERY_PATTERN =
  /\b(?:what|which)\s+time\b|\b(?:который|какое)\s+(?:сейчас\s+)?(?:время|час)\b|\b(?:сколько)\s+(?:сейчас\s+)?времени\b|\b(?:котра|котрий)\s+година\b|\b(?:what time is it)\b/i;

const DAY_CORRECTION_PATTERN =
  /\b(?:сегодня|today|сьогодні)\s+(?:понедельник|вторник|сред|четверг|пятниц|суббот|воскрес|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i;

function buildDayReply(snapshot: FactualTimeSnapshot, languageCode: VoiceLanguageCode) {
  const locale = getChatLocaleFromVoiceLanguage(languageCode);

  if (locale === 'uk') {
    return `Сьогодні ${snapshot.dayOfWeekLocalized}, ${snapshot.localDateLabel}.`;
  }

  if (locale === 'ru') {
    return `Сегодня ${snapshot.dayOfWeekLocalized}, ${snapshot.localDateLabel}.`;
  }

  return `Today is ${snapshot.dayOfWeekEn}, ${snapshot.localDateLabel}.`;
}

function buildTimeReply(snapshot: FactualTimeSnapshot, languageCode: VoiceLanguageCode) {
  const locale = getChatLocaleFromVoiceLanguage(languageCode);

  if (locale === 'uk') {
    return `Зараз ${snapshot.localTimeLabel} (${snapshot.timezone}).`;
  }

  if (locale === 'ru') {
    return `Сейчас ${snapshot.localTimeLabel} (${snapshot.timezone}).`;
  }

  return `It is ${snapshot.localTimeLabel} (${snapshot.timezone}).`;
}

function buildDayCorrectionReply(snapshot: FactualTimeSnapshot, languageCode: VoiceLanguageCode) {
  const locale = getChatLocaleFromVoiceLanguage(languageCode);

  if (locale === 'uk') {
    return `За системним часом сьогодні ${snapshot.dayOfWeekLocalized} — ${snapshot.localDateLabel}.`;
  }

  if (locale === 'ru') {
    return `По системному времени сегодня ${snapshot.dayOfWeekLocalized} — ${snapshot.localDateLabel}.`;
  }

  return `According to the system clock, today is ${snapshot.dayOfWeekEn} — ${snapshot.localDateLabel}.`;
}

/**
 * Deterministic reply for clock/day questions — never LLM-guessed.
 */
export function tryBuildFactualTimeReply(params: FactualTimeReplyParams): string | null {
  const transcript = params.transcript.trim();

  if (!isTemporalFactualQuery(transcript)) {
    return null;
  }

  if (params.snapshot.status !== 'grounded') {
    logFactualGrounding('factual_reply_unavailable', {
      reason: 'invalid_reference_time',
    });
    return buildFactualUnavailableReply(params.languageCode);
  }

  if (DAY_CORRECTION_PATTERN.test(transcript) || DAY_QUERY_PATTERN.test(transcript)) {
    const reply = buildDayCorrectionReply(params.snapshot, params.languageCode);
    logFactualGrounding('factual_reply', { kind: 'day_of_week', replyPreview: reply.slice(0, 80) });
    return reply;
  }

  if (TIME_QUERY_PATTERN.test(transcript)) {
    const reply = buildTimeReply(params.snapshot, params.languageCode);
    logFactualGrounding('factual_reply', { kind: 'clock_time', replyPreview: reply.slice(0, 80) });
    return reply;
  }

  if (DAY_QUERY_PATTERN.test(transcript)) {
    const reply = buildDayReply(params.snapshot, params.languageCode);
    logFactualGrounding('factual_reply', { kind: 'day_of_week', replyPreview: reply.slice(0, 80) });
    return reply;
  }

  const reply = buildDayReply(params.snapshot, params.languageCode);
  logFactualGrounding('factual_reply', { kind: 'temporal_default', replyPreview: reply.slice(0, 80) });
  return reply;
}
