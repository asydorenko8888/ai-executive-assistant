import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildCalendarPendingAction,
  getCalendarConversationSnapshot,
  resetCalendarConversationState,
  transitionCalendarConversationState,
} from '@/src/features/agent/calendar/calendarConversationState';
import {
  recordCreatedConversationEvent,
  resolveConversationEventReference,
} from '@/src/features/agent/calendar/calendarConversationEventMemory';
import { buildCalendarConflictAlternativesOnlyReply } from '@/src/features/agent/calendar/calendarConflictReplies';
import { detectCalendarCommandIntent } from '@/src/features/agent/calendar/calendarCommandTypes';
import { extractCreateEventTitle } from '@/src/features/agent/calendar/calendarCreateIntentExtractor';
import { parseCalendarCreateSchedule } from '@/src/features/agent/calendar/calendarCreateScheduleParser';
import { isCalendarQueryOrFindIntent } from '@/src/features/agent/calendar/calendarQueryIntent';
import { classifyPendingCalendarReply } from '@/src/features/agent/calendar/calendarPendingReplyClassifier';
import { resolvePendingConflictResolution } from '@/src/features/agent/calendar/calendarPendingConflictResolution';
import { enrichCalendarCommandTranscript } from '@/src/features/agent/calendar/calendarTranscriptEnrichment';
import { isOperationalCalendarCreateRequest } from '@/src/features/agent/intent/operationalCalendarWriteDetection';
import { isCalendarExactTimeReadQuery } from '@/src/features/agent/calendarIntelligence/calendarExactTimeReadDetection';
import { isDeterministicCalendarReadQuery } from '@/src/features/agent/calendarIntelligence/classifyQuery';
import { parseSpokenTimeFragment } from '@/src/features/agent/calendar/calendarSpokenTime';
import { getZonedTimeParts } from '@/src/features/agent/calendar/calendarTimezone';

const timeZone = 'America/Chicago';
const afternoon = new Date('2026-06-01T16:09:00-05:00');

function expectHour(
  schedule: ReturnType<typeof parseCalendarCreateSchedule>,
  hour: number,
  dayOffset = 0,
) {
  assert.equal(schedule.ok, true);

  if (!schedule.ok) {
    return;
  }

  const parts = getZonedTimeParts(new Date(schedule.startMs), timeZone);
  assert.equal(parts.hour, hour);
  assert.equal(schedule.explicitDayOffset, dayOffset);
}

describe('calendar reliability acceptance', () => {
  it('A: creates Медитация today at 21:00 from "на 9 вечера"', () => {
    assert.equal(parseSpokenTimeFragment('на 9 вечера'), '21:00');
    assert.equal(extractCreateEventTitle('Добавь медитацию на 9 вечера'), 'Медитация');

    const schedule = parseCalendarCreateSchedule(
      'Добавь медитацию на 9 вечера',
      afternoon,
      timeZone,
      'ru',
    );

    expectHour(schedule, 21);
  });

  it('B: visibility complaint is read/query, never create', () => {
    const transcript = 'Я не вижу в календаре медитацию на 9 вечера';

    assert.equal(isCalendarQueryOrFindIntent(transcript), true);
    assert.equal(isOperationalCalendarCreateRequest(transcript), false);
    assert.equal(detectCalendarCommandIntent(transcript), 'none');
    assert.equal(isCalendarExactTimeReadQuery(transcript), true);
    assert.equal(isDeterministicCalendarReadQuery(transcript), true);
    assert.equal(extractCreateEventTitle(transcript), null);
  });

  it('C: accusative titles normalize to nominative', () => {
    assert.equal(extractCreateEventTitle('Добавь стоматолога на 8 вечера'), 'Стоматолог');
    assert.equal(extractCreateEventTitle('добавь тренировку завтра'), 'Тренировка');
    assert.equal(extractCreateEventTitle('добавь переговоры сегодня'), 'Переговоры');
    assert.equal(extractCreateEventTitle('Добавь звонок Николаю завтра в 10 утра'), 'Звонок Николаю');
  });

  it('D: pronoun "его" resolves to last created event for move', () => {
    resetCalendarConversationState('test');
    recordCreatedConversationEvent({
      eventId: 'call-nikolai',
      title: 'Звонок Николаю',
      startISO: '2026-06-02T15:00:00-05:00',
      endISO: '2026-06-02T16:00:00-05:00',
    });

    const ref = resolveConversationEventReference(afternoon);
    assert.equal(ref?.title, 'Звонок Николаю');

    const enriched = enrichCalendarCommandTranscript({
      transcript: 'Перенеси его на 2 часа позже',
      referenceNow: afternoon,
    });

    assert.match(enriched, /звонок\s+николаю/i);
    assert.match(enriched, /2\s+час/i);
  });

  it('E: conflict "да" resolves to force create', () => {
    const pending = buildCalendarPendingAction({
      actionType: 'create',
      originalIntent: 'Добавь стоматолога на 8 вечера',
      eventTitle: 'Стоматолог',
      sourceTranscript: 'Добавь стоматолога на 8 вечера',
      languageCode: 'ru-RU',
      proposedStartMs: Date.parse('2026-06-01T20:00:00-05:00'),
      proposedEndMs: Date.parse('2026-06-01T21:00:00-05:00'),
    });

    const resolution = resolvePendingConflictResolution({
      pending,
      transcript: 'да',
      classification: classifyPendingCalendarReply('да'),
      referenceNow: afternoon,
    });

    assert.equal(resolution.kind, 'execute_original');

    if (resolution.kind === 'execute_original') {
      assert.equal(resolution.skipScheduleConflictCheck, true);
    }
  });

  it('E2: explicit override still force-creates over conflict', () => {
    const pending = buildCalendarPendingAction({
      actionType: 'create',
      originalIntent: 'Добавь стоматолога на 8 вечера',
      eventTitle: 'Стоматолог',
      sourceTranscript: 'Добавь стоматолога на 8 вечера',
      languageCode: 'ru-RU',
      proposedStartMs: Date.parse('2026-06-01T20:00:00-05:00'),
      proposedEndMs: Date.parse('2026-06-01T21:00:00-05:00'),
    });

    const resolution = resolvePendingConflictResolution({
      pending,
      transcript: 'все равно создай',
      classification: classifyPendingCalendarReply('все равно создай'),
      referenceNow: afternoon,
    });

    assert.equal(resolution.kind, 'execute_original');

    if (resolution.kind === 'execute_original') {
      assert.equal(resolution.skipScheduleConflictCheck, true);
    }
  });

  it('F: conflict "нет" suggests alternatives without repeating conflict', () => {
    const resolution = resolvePendingConflictResolution({
      pending: buildCalendarPendingAction({
        actionType: 'create',
        originalIntent: 'Добавь стоматолога на 8 вечера',
        eventTitle: 'Стоматолог',
        sourceTranscript: 'Добавь стоматолога на 8 вечера',
        languageCode: 'ru-RU',
        proposedStartMs: Date.parse('2026-06-01T20:00:00-05:00'),
        proposedEndMs: Date.parse('2026-06-01T21:00:00-05:00'),
      }),
      transcript: 'нет',
      classification: classifyPendingCalendarReply('нет'),
      referenceNow: afternoon,
    });

    assert.equal(resolution.kind, 'suggest_alternatives');

    const reply = buildCalendarConflictAlternativesOnlyReply({
      locale: 'en',
      optionLabels: ['Today 5:00 PM–6:00 PM', 'Today 6:00 PM–7:00 PM'],
    });

    assert.match(reply, /^Ok, I did not create Стоматолог\. I can suggest another time:/);
    assert.doesNotMatch(reply, /already/i);
    assert.doesNotMatch(reply, /Спортзал/i);
  });

  it('G: conflict time follow-up keeps pending title', () => {
    resetCalendarConversationState('test');
    transitionCalendarConversationState({
      toState: 'WAITING_CONFLICT_DECISION',
      pendingAction: buildCalendarPendingAction({
        actionType: 'create',
        originalIntent: 'Добавь стоматолога на 8 вечера',
        eventTitle: 'Стоматолог',
        sourceTranscript: 'Добавь стоматолога на 8 вечера',
        languageCode: 'ru-RU',
        proposedStartMs: Date.parse('2026-06-01T20:00:00-05:00'),
        proposedEndMs: Date.parse('2026-06-01T21:00:00-05:00'),
      }),
      reason: 'test',
    });

    const resolution = resolvePendingConflictResolution({
      pending: getCalendarConversationSnapshot().pendingAction!,
      transcript: 'завтра в 8 вечера',
      classification: classifyPendingCalendarReply('завтра в 8 вечера'),
      referenceNow: afternoon,
    });

    assert.equal(resolution.kind, 'execute_with_schedule');

    if (resolution.kind === 'execute_with_schedule') {
      const parts = getZonedTimeParts(new Date(resolution.startMs), timeZone);
      assert.equal(parts.hour, 20);
      assert.equal(resolution.explicitDayOffset, 1);
    }
  });
});
