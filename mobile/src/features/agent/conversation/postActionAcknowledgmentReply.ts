import {
  isAwaitingCalendarConflictResolution,
  isCalendarConversationAwaitingInput,
} from '@/src/features/agent/calendar/calendarConversationState';
import { getPendingIntent } from '@/src/features/agent/calendar/calendarPendingIntent';
import {
  getPendingCalendarConflictContext,
  getPendingCalendarDeleteContext,
  getPendingCalendarUpdateContext,
} from '@/src/features/agent/execution/calendarExecutionSession';
import {
  hasPendingAlarmSelection,
  hasPendingLocalAlarmAction,
} from '@/src/features/local-alarms/localAlarmPendingAction';
import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';

const POST_ACTION_ACKNOWLEDGMENT =
  /^(?:please\s+)?(?:ok|okay|ок|добре|дякую|дякую\s+тобі|спасибо|спасибо\s+большое|thanks|thank\s+you|thx|зрозуміло|зрозуміла|зрозумів|понятно|понял|поняла|чудово|чудесно|клас|круто|супер|great|good|got\s+it|understood|perfect|awesome|перенесла|перенес|перенёс|зробила|зробив|зроблено|зробили|сделала|сделал|сделано|сделали)(?:[.!,\s]|$)$/iu;

const REPLIES: Record<VoiceLanguageCode, string[]> = {
  'uk-UA': ['Добре.', 'Гаразд.', 'Звертайся.'],
  'ru-RU': ['Хорошо.', 'Понял.', 'Обращайся.'],
  'en-US': ['Okay.', 'Got it.', 'Anytime.'],
};

export function isPostActionAcknowledgmentPhrase(transcript: string) {
  const normalized = transcript.trim();

  if (!normalized) {
    return false;
  }

  return POST_ACTION_ACKNOWLEDGMENT.test(normalized);
}

export function isOperationalWorkflowPending(_referenceNow = new Date()) {
  return (
    hasPendingLocalAlarmAction() ||
    hasPendingAlarmSelection() ||
    isCalendarConversationAwaitingInput() ||
    isAwaitingCalendarConflictResolution() ||
    Boolean(getPendingCalendarUpdateContext()) ||
    Boolean(getPendingCalendarDeleteContext()) ||
    Boolean(getPendingCalendarConflictContext()) ||
    Boolean(getPendingIntent())
  );
}

export function isPostActionAcknowledgmentTurn(params: {
  transcript: string;
  referenceNow?: Date;
}) {
  const normalized = params.transcript.trim();

  if (!normalized || !isPostActionAcknowledgmentPhrase(normalized)) {
    return false;
  }

  return !isOperationalWorkflowPending(params.referenceNow ?? new Date());
}

export function buildPostActionAcknowledgmentReply(
  languageCode: VoiceLanguageCode,
  transcript = '',
) {
  const options = REPLIES[languageCode] ?? REPLIES['en-US'];
  const index = transcript.trim().length % options.length;

  return options[index]!;
}

export function logPostActionAcknowledgment(params: {
  transcript: string;
  reply: string;
}) {
  console.log(
    'POST_ACTION_ACKNOWLEDGMENT',
    JSON.stringify({
      transcript: params.transcript,
      reply: params.reply,
    }),
  );
}
