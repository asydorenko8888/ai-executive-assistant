import { getLastCalendarToolResponse } from '@/src/features/agent/execution/calendarExecutionSession';
import { isOperationalCalendarWriteRequest } from '@/src/features/agent/intent/operationalCalendarWriteDetection';

const CONVERSATIONAL_RETRY_PHRASE_PATTERN =
  /\b(?:one minute|i(?:'| a)?ll do it(?: now)?|let me add|adding it now|сейчас (?:сделаю|добавлю)|минуточку|подожди(?:те)? минуту|give me a minute)\b/i;

export function isConversationalCalendarRetryPhrase(text: string) {
  return CONVERSATIONAL_RETRY_PHRASE_PATTERN.test(text);
}

export function blockConversationalCalendarRetryLoop(params: {
  userTranscript: string;
  candidateReply: string;
}) {
  if (!isOperationalCalendarWriteRequest(params.userTranscript)) {
    return params.candidateReply;
  }

  if (!isConversationalCalendarRetryPhrase(params.candidateReply)) {
    return params.candidateReply;
  }

  const last = getLastCalendarToolResponse();

  console.error('[CalendarExecution] Blocked conversational retry loop phrase', {
    preview: params.candidateReply.slice(0, 120),
    lastToolStatus: last?.status ?? null,
  });

  if (last?.status === 'PENDING') {
    return 'Still waiting for confirmation from Google Calendar.';
  }

  if (last?.status === 'FAILURE') {
    return "I couldn't confirm event creation.";
  }

  return params.candidateReply;
}
