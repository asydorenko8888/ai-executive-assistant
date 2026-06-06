import { buildFailureTerminalReply } from '@/src/features/agent/calendar/calendarExecutionContract';
import {
  blockLlmForCalendarMutation,
  requiresCalendarToolExecution,
} from '@/src/features/agent/calendar/calendarToolExecutionGate';
import {
  resolveVoiceTurnGatePure,
  type VoiceTurnGateDecision,
  type VoiceTurnGateInput,
} from '@/src/features/agent/conversation/assistantVoiceTurnGatePure';

export type { VoiceTurnGateDecision, VoiceTurnGateInput };

export function resolveVoiceTurnGate(params: {
  turn: VoiceTurnGateInput;
  transcript: string;
}): VoiceTurnGateDecision {
  const transcript = params.transcript.trim();
  const requiresCalendarExecution = requiresCalendarToolExecution(transcript);

  return resolveVoiceTurnGatePure({
    turn: params.turn,
    requiresCalendarExecution,
    operationalFallbackReply: buildFailureTerminalReply(
      'CALENDAR_EXECUTION_CONTRACT',
      'calendar command did not produce a terminal tool reply',
    ),
    calendarBlockedReply: requiresCalendarExecution
      ? blockLlmForCalendarMutation({
          transcript,
          reason: 'voice turn missing tool reply',
        })
      : null,
  });
}
