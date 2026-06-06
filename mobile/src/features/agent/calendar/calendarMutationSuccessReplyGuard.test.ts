import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { assertCalendarReplyMatchesTool } from '@/src/features/agent/calendar/calendarExecutionContract';
import {
  enforceCalendarMutationSuccessReplyPolicy,
  isCalendarMutationSuccessReply,
} from '@/src/features/agent/calendar/calendarMutationSuccessReplyGuard';
import type { CalendarToolResponse } from '@/src/features/agent/execution/calendarToolContract';

const verifiedCreateTool: CalendarToolResponse = {
  status: 'SUCCESS',
  eventId: 'evt-1',
  event: {
    id: 'evt-1',
    summary: 'Ужин',
    startsAt: '2026-06-05T19:00:00-05:00',
    endsAt: '2026-06-05T20:00:00-05:00',
  },
  verified: true,
  verificationFetched: true,
};

const terminalCreate =
  'Событие создано: Ужин\nФактическое время: пятница, 19:00–20:00';

describe('calendar mutation success reply guard', () => {
  it('detects structured tool success prefixes', () => {
    assert.equal(isCalendarMutationSuccessReply('Событие создано: Ужин'), true);
    assert.equal(isCalendarMutationSuccessReply('Created event: Dinner'), true);
    assert.equal(isCalendarMutationSuccessReply('Событие перенесено: Ужин'), true);
    assert.equal(isCalendarMutationSuccessReply('Event deleted: Dinner'), true);
    assert.equal(isCalendarMutationSuccessReply('Понял, уточни время.'), false);
  });

  it('blocks LLM-authored mutation success when tool is unverified', () => {
    const llmSuccess = 'Событие создано: Ужин\nФактическое время: пятница, 19:00–20:00';
    const enforced = enforceCalendarMutationSuccessReplyPolicy({
      candidateReply: llmSuccess,
      terminalReply: 'FAILURE: VERIFY_FAILED: verification missing',
      tool: { status: 'FAILURE', errorCode: 'VERIFY_FAILED' },
      intent: 'create_calendar_event',
    });

    assert.equal(enforced, 'FAILURE: VERIFY_FAILED: verification missing');
  });

  it('replaces paraphrased success with verified tool terminal', () => {
    const paraphrase = 'Событие создано: Ужин (готово)';
    const enforced = enforceCalendarMutationSuccessReplyPolicy({
      candidateReply: paraphrase,
      terminalReply: terminalCreate,
      tool: verifiedCreateTool,
      intent: 'create_calendar_event',
    });

    assert.equal(enforced, terminalCreate);
  });

  it('assertCalendarReplyMatchesTool always returns tool terminal on verified success', () => {
    const enforced = assertCalendarReplyMatchesTool({
      userTranscript: 'добавь ужин в пятницу в 19',
      candidateReply: 'Событие создано: Ужин',
      terminalReply: terminalCreate,
      tool: verifiedCreateTool,
      intent: 'create_calendar_event',
    });

    assert.equal(enforced, terminalCreate);
  });

  it('assertCalendarReplyMatchesTool blocks invented success on FAILURE tool', () => {
    const enforced = assertCalendarReplyMatchesTool({
      userTranscript: 'добавь ужин в пятницу в 19',
      candidateReply: 'Событие создано: Ужин',
      terminalReply: 'FAILURE: GOOGLE_API: write failed',
      tool: { status: 'FAILURE', errorCode: 'GOOGLE_API' },
      intent: 'create_calendar_event',
    });

    assert.equal(enforced, 'FAILURE: GOOGLE_API: write failed');
  });
});
