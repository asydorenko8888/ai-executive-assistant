import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  resolveVoiceTurnGatePure,
  type VoiceTurnGateInput,
} from '@/src/features/agent/conversation/assistantVoiceTurnGatePure';

const contractFailure = 'FAILURE: CALENDAR_EXECUTION_CONTRACT: test failure';

function llmTurn(transcript: string): VoiceTurnGateInput {
  return {
    reply: null,
    route: 'llm',
    operationalStarted: false,
    userTranscript: transcript,
  };
}

describe('resolveVoiceTurnGatePure', () => {
  it('routes general health advice to LLM instead of calendar contract failure', () => {
    const transcript = 'Что ты посоветуешь от больного горла';

    const decision = resolveVoiceTurnGatePure({
      turn: llmTurn(transcript),
      requiresCalendarExecution: false,
      operationalFallbackReply: contractFailure,
      calendarBlockedReply: null,
    });

    assert.equal(decision.kind, 'llm');
  });

  it('routes emotional companion message to LLM', () => {
    const transcript = 'Ты не хочешь со мной разговаривать';

    const decision = resolveVoiceTurnGatePure({
      turn: llmTurn(transcript),
      requiresCalendarExecution: false,
      operationalFallbackReply: contractFailure,
      calendarBlockedReply: null,
    });

    assert.equal(decision.kind, 'llm');
  });

  it('speaks local pipeline reply for calendar countdown reads', () => {
    const transcript = 'Сколько времени у меня до прогулки';
    const reply = 'До «Прогулка» осталось 1 час.';

    const decision = resolveVoiceTurnGatePure({
      turn: {
        reply,
        route: 'advisory_local',
        operationalStarted: false,
        userTranscript: transcript,
      },
      requiresCalendarExecution: false,
      operationalFallbackReply: contractFailure,
      calendarBlockedReply: null,
    });

    assert.equal(decision.kind, 'local');
    if (decision.kind === 'local') {
      assert.equal(decision.source, 'pipeline');
      assert.match(decision.reply, /Прогулка/);
    }
  });

  it('uses calendar contract only for operational routes that require execution', () => {
    const decision = resolveVoiceTurnGatePure({
      turn: {
        reply: null,
        route: 'operational_local',
        operationalStarted: true,
        userTranscript: 'Удали прогулку',
      },
      requiresCalendarExecution: true,
      operationalFallbackReply: contractFailure,
      calendarBlockedReply: 'Blocked by tool gate',
    });

    assert.equal(decision.kind, 'local');
    if (decision.kind === 'local') {
      assert.equal(decision.source, 'operational');
      assert.equal(decision.reply, 'Blocked by tool gate');
    }
  });
});
