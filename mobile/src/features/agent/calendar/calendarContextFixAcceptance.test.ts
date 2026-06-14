import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { extractCreateEventTitle } from '@/src/features/agent/calendar/calendarCreateIntentExtractor';
import {
  recordCreatedConversationEvent,
  recordModifiedConversationEvent,
  resetConversationEventMemory,
  resolveMoveEventReference,
} from '@/src/features/agent/calendar/calendarConversationEventMemory';
import { tryMergePendingCalendarDeleteReply } from '@/src/features/agent/calendar/calendarDeletePendingContext';
import { resolveDisambiguationSelection } from '@/src/features/agent/calendar/calendarEventDisambiguation';
import { enrichCalendarCommandTranscript } from '@/src/features/agent/calendar/calendarTranscriptEnrichment';
import { extractCalendarUpdateParameters } from '@/src/features/agent/calendar/calendarUpdateIntentExtractor';
import { parseCalendarUpdateSchedule, resolveUpdateTargetMs } from '@/src/features/agent/calendar/calendarUpdateScheduleParser';
import { isCalendarReadOnlyQuery } from '@/src/features/agent/calendar/calendarReadOnlyQuery';
import { requiresCalendarCommandExecution } from '@/src/features/agent/calendar/calendarCommandTypes';
import { isAwaitingEventDisambiguationSelectionReply } from '@/src/features/agent/calendar/calendarPendingReplyClassifier';
import {
  buildCalendarPendingAction,
  resetCalendarConversationState,
  transitionCalendarConversationState,
} from '@/src/features/agent/calendar/calendarConversationState';
import { buildMoveClarificationPendingActionFields } from '@/src/features/agent/calendar/calendarMoveClarificationState';
import { mergeActionContextFromHistory } from '@/src/features/agent/intent/actionContextMerge';
import {
  clearPendingCalendarDeleteIntent,
  clearPendingCalendarUpdateIntent,
  getPendingCalendarDeleteContext,
  setPendingCalendarDeleteContext,
} from '@/src/features/agent/execution/calendarExecutionSession';
import { findCalendarEventForUpdateFromEvents } from '@/src/features/agent/calendarIntelligence/eventAtTimeMatch';
import {
  buildDeterministicCalendarAnswer,
} from '@/src/features/agent/calendarIntelligence/calendarAnswerEngine';
import { formatDeterministicCalendarReply } from '@/src/features/agent/calendarIntelligence/formatDeterministicReply';

const referenceNow = new Date('2026-05-28T20:00:00-05:00');
const timeZone = 'America/Chicago';

function walkCandidates() {
  return [
    {
      eventId: 'walk-7pm',
      title: 'Прогулка',
      startsAt: '2026-05-28T19:00:00-05:00',
      endsAt: '2026-05-28T20:00:00-05:00',
    },
    {
      eventId: 'walk-9pm',
      title: 'Прогулка',
      startsAt: '2026-05-28T21:00:00-05:00',
      endsAt: '2026-05-28T22:00:00-05:00',
    },
  ];
}

function pendingDelete() {
  return {
    operation: 'delete' as const,
    type: 'delete' as const,
    title: 'прогулку',
    dayHint: null,
    sourceTranscript: 'Удали прогулку',
    originalUserText: 'Удали прогулку',
    createdAtMs: Date.now(),
    candidates: walkCandidates(),
  };
}

function seedDeleteClarification() {
  clearPendingCalendarDeleteIntent();
  clearPendingCalendarUpdateIntent();
  resetCalendarConversationState('test_reset');

  const pending = pendingDelete();
  setPendingCalendarDeleteContext(pending);

  transitionCalendarConversationState({
    toState: 'WAITING_EVENT_SELECTION',
    pendingAction: buildCalendarPendingAction({
      actionType: 'delete',
      originalIntent: pending.sourceTranscript,
      eventTitle: pending.title,
      sourceTranscript: pending.sourceTranscript,
      languageCode: 'ru-RU',
      proposedStartMs: Date.parse('2026-05-28T19:00:00-05:00'),
      proposedEndMs: Date.parse('2026-05-28T20:00:00-05:00'),
      ...buildMoveClarificationPendingActionFields(pending.candidates!),
      clarificationKind: 'delete_event',
    }),
    reason: 'test_delete_clarification',
  });

  return pending;
}

describe('calendar context fix acceptance', () => {
  beforeEach(() => {
    resetConversationEventMemory('test_reset');
    resetCalendarConversationState('test_reset');
    clearPendingCalendarDeleteIntent();
    clearPendingCalendarUpdateIntent();
  });

  it('delete прогулку then answer сегодня 19.00 selects only the 19:00 event', () => {
    seedDeleteClarification();

    const merged = tryMergePendingCalendarDeleteReply({
      pending: pendingDelete(),
      reply: 'Сегодня 19.00',
      referenceNow,
      timeZone,
    });

    assert.equal(merged?.selectedEventId, 'walk-7pm');
  });

  it('delete прогулку then answer девятнадцать часов selects only the 19:00 event', () => {
    seedDeleteClarification();

    const merged = tryMergePendingCalendarDeleteReply({
      pending: pendingDelete(),
      reply: 'девятнадцать часов',
      referenceNow,
      timeZone,
    });

    assert.equal(merged?.selectedEventId, 'walk-7pm');
  });

  it('routes clarification replies away from read-only agenda handling', () => {
    for (const reply of ['Сегодня 19.00', 'девятнадцать часов', 'первую', 'номер 1']) {
      seedDeleteClarification();

      assert.equal(isAwaitingEventDisambiguationSelectionReply(reply, referenceNow), true);
      assert.equal(isCalendarReadOnlyQuery(reply, referenceNow), false);
      assert.equal(requiresCalendarCommandExecution(reply), true);

      const merged = mergeActionContextFromHistory({
        transcript: reply,
        messages: [],
        referenceNow,
      });

      assert.equal(merged.contextSource, 'pending_delete_clarification');
      assert.equal(getPendingCalendarDeleteContext()?.selectedEventId, 'walk-7pm');
    }
  });

  it('supports index replies первую and номер 1', () => {
    const candidates = walkCandidates();

    assert.equal(
      resolveDisambiguationSelection({
        reply: 'первую',
        candidates,
        referenceNow,
        timeZone,
        locale: 'ru',
        pendingTitle: 'прогулку',
      })?.eventId,
      'walk-7pm',
    );
    assert.equal(
      resolveDisambiguationSelection({
        reply: 'номер 1',
        candidates,
        referenceNow,
        timeZone,
        locale: 'ru',
        pendingTitle: 'прогулку',
      })?.eventId,
      'walk-7pm',
    );
  });

  it('moves last referenced meditation one hour earlier then to tomorrow', () => {
    recordCreatedConversationEvent({
      eventId: 'med-1',
      title: 'Медитация',
      startISO: '2026-05-28T23:00:00-05:00',
      endISO: '2026-05-29T00:00:00-05:00',
    });

    const earlierEnriched = enrichCalendarCommandTranscript({
      transcript: 'перенеси её на час раньше',
      referenceNow,
    });

    assert.match(earlierEnriched, /медитац/i);

    const earlierResolution = findCalendarEventForUpdateFromEvents({
      transcript: earlierEnriched,
      referenceNow,
      events: [
        {
          id: 'med-1',
          title: 'Медитация',
          startsAt: '2026-05-28T23:00:00-05:00',
          endsAt: '2026-05-29T00:00:00-05:00',
          isAllDay: false,
        },
      ],
      titleQuery: 'Медитация',
      timeZone,
    });

    assert.equal(earlierResolution.match?.id, 'med-1');
    assert.equal(earlierResolution.matchSource, 'conversation_memory');

    const schedule = parseCalendarUpdateSchedule(earlierEnriched, referenceNow, timeZone);
    assert.equal(schedule.ok, true);

    if (schedule.ok) {
      const toMs = resolveUpdateTargetMs({
        schedule,
        matchedEventStartMs: Date.parse('2026-05-28T23:00:00-05:00'),
        referenceNow,
        timeZone,
      });
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        hour: 'numeric',
        minute: 'numeric',
        hour12: false,
      }).formatToParts(new Date(toMs!));
      const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? 0);

      assert.equal(hour, 22);
    }

    recordModifiedConversationEvent({
      eventId: 'med-1',
      title: 'Медитация',
      startISO: '2026-05-28T22:00:00-05:00',
      endISO: '2026-05-28T23:00:00-05:00',
    });

    const tomorrowEnriched = enrichCalendarCommandTranscript({
      transcript: 'перенеси ее на завтра',
      referenceNow,
    });

    assert.match(tomorrowEnriched, /медитац/i);
    assert.equal(resolveMoveEventReference(referenceNow)?.eventId, 'med-1');

    const tomorrowResolution = findCalendarEventForUpdateFromEvents({
      transcript: tomorrowEnriched,
      referenceNow,
      events: [
        {
          id: 'med-1',
          title: 'Медитация',
          startsAt: '2026-05-28T22:00:00-05:00',
          endsAt: '2026-05-28T23:00:00-05:00',
          isAllDay: false,
        },
      ],
      titleQuery: 'Медитация',
      timeZone,
    });

    assert.equal(tomorrowResolution.match?.id, 'med-1');

    const tomorrowSchedule = parseCalendarUpdateSchedule(tomorrowEnriched, referenceNow, timeZone);
    assert.equal(tomorrowSchedule.ok, true);

    if (tomorrowSchedule.ok) {
      const toMs = resolveUpdateTargetMs({
        schedule: tomorrowSchedule,
        matchedEventStartMs: Date.parse('2026-05-28T22:00:00-05:00'),
        referenceNow,
        timeZone,
      });
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        hour: 'numeric',
        minute: 'numeric',
        hour12: false,
      }).formatToParts(new Date(toMs!));
      const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? 0);

      assert.equal(hour, 22);
    }
  });

  it('creates Прогулка from chit-chat create command', () => {
    const title = extractCreateEventTitle(
      'Привет, у меня отлично. Добавь прогулку на 7 вечера',
    );

    assert.equal(title, 'Прогулка');
  });

  it('today agenda excludes finished events', () => {
    const todayEvents = [
      {
        id: 'done',
        title: 'Done',
        startsAt: '2026-05-28T17:00:00-05:00',
        endsAt: '2026-05-28T18:00:00-05:00',
        isAllDay: false as const,
      },
      {
        id: 'running',
        title: 'Running',
        startsAt: '2026-05-28T19:30:00-05:00',
        endsAt: '2026-05-28T21:00:00-05:00',
        isAllDay: false as const,
      },
      {
        id: 'future',
        title: 'Future',
        startsAt: '2026-05-28T21:00:00-05:00',
        endsAt: '2026-05-28T22:00:00-05:00',
        isAllDay: false as const,
      },
    ];

    const answer = buildDeterministicCalendarAnswer({
      transcript: 'Что у меня сегодня?',
      events: todayEvents,
      referenceNow,
      timeZone,
    });

    assert.equal(answer?.intent, 'list_day');

    const reply = formatDeterministicCalendarReply({
      intent: answer!.intent,
      day: answer!.day,
      locale: 'ru',
      events: answer!.events,
      referenceNow,
      userTranscript: 'Что у меня сегодня?',
    });

    assert.match(reply, /Сейчас ид(?:е|ё)т/i);
    assert.match(reply, /Running/i);
    assert.match(reply, /Future/i);
    assert.doesNotMatch(reply, /\bDone\b/);
  });
});
