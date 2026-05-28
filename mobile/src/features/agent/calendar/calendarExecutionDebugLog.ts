import type { CalendarCommandKind } from '@/src/features/agent/calendar/calendarCommandTypes';
import type { CalendarToolResponse } from '@/src/features/agent/execution/calendarToolContract';

export type CalendarExecutionDebugStage =
  | 'intent_detected'
  | 'tool_selected'
  | 'tool_payload'
  | 'google_api_response'
  | 'verification_fetch'
  | 'ui_refresh'
  | 'terminal_reply'
  | 'llm_blocked'
  | 'contract_enforced';

export function logCalendarExecutionDebug(
  stage: CalendarExecutionDebugStage,
  details: Record<string, unknown>,
) {
  console.log(`[Calendar Execution] ${stage}`, details);
}

export function logCalendarIntentDetected(params: {
  transcript: string;
  intent: CalendarCommandKind;
  requiresTool: boolean;
}) {
  logCalendarExecutionDebug('intent_detected', {
    intent: params.intent,
    requiresTool: params.requiresTool,
    transcriptPreview: params.transcript.slice(0, 160),
  });
}

export function logCalendarToolSelected(params: {
  intent: CalendarCommandKind;
  tool: string;
}) {
  logCalendarExecutionDebug('tool_selected', params);
}

export function logCalendarToolPayload(params: Record<string, unknown>) {
  logCalendarExecutionDebug('tool_payload', params);
}

export function logCalendarGoogleApiResponse(params: {
  status: string;
  eventId?: string | null;
  verified?: boolean;
  verificationFetched?: boolean;
  errorCode?: string | null;
  error?: string | null;
}) {
  logCalendarExecutionDebug('google_api_response', params);
}

export function logCalendarVerificationFetch(params: Record<string, unknown>) {
  logCalendarExecutionDebug('verification_fetch', params);
}

export function logCalendarUiRefresh(params: Record<string, unknown>) {
  logCalendarExecutionDebug('ui_refresh', params);
}

export function logCalendarTerminalReply(params: {
  intent: CalendarCommandKind;
  tool: CalendarToolResponse | null;
  replyPreview: string;
}) {
  logCalendarExecutionDebug('terminal_reply', {
    intent: params.intent,
    toolStatus: params.tool?.status ?? null,
    eventId: params.tool?.eventId ?? null,
    verified: params.tool?.verified ?? false,
    replyPreview: params.replyPreview.slice(0, 200),
  });
}

export function logCalendarLlmBlocked(params: { reason: string; transcriptPreview: string }) {
  logCalendarExecutionDebug('llm_blocked', params);
}

export function logCalendarContractEnforced(params: {
  blockedPreview: string;
  terminalPreview: string;
}) {
  logCalendarExecutionDebug('contract_enforced', params);
}
