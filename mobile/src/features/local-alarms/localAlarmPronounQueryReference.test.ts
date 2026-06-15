import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import type { CalendarEvent } from '@/src/entities/calendar/types';
import { resetCalendarConversationStore } from '@/src/features/agent/calendar/calendarConversationStore';
import {
  resetConversationEventMemory,
} from '@/src/features/agent/calendar/calendarConversationEventMemory';
import { buildDeterministicCalendarAnswer } from '@/src/features/agent/calendarIntelligence/calendarAnswerEngine';
import {
  getLastAssistantDomain,
  getLastReferencedCalendarEventRef,
  getLatestActiveReference,
  resetActiveConversationalReferenceForTests,
  shouldRoutePronounToCalendar,
} from '@/src/features/agent/conversation/activeConversationalReference';
import { isOperationalCalendarUpdateRequest } from '@/src/features/agent/intent/operationalCalendarWriteDetection';
import {
  isLocalAlarmIntent,
  shouldRouteToLocalAlarmWorkflow,
} from '@/src/features/local-alarms/localAlarmClassification';
import { resetPendingLocalAlarmActionForTests } from '@/src/features/local-alarms/localAlarmPendingAction';
import {
  listScheduledLocalAlarms,
  resetLocalAlarmsForTests,
} from '@/src/features/local-alarms/localAlarmRuntimeStore';
import { resolveLocalAlarmTurn } from '@/src/features/local-alarms/resolveLocalAlarmTurn';

const referenceNow = new Date('2026-05-28T14:00:00+03:00');
const timeZone = 'Europe/Moscow';

function dinnerAt8pm(): CalendarEvent {
  return {
    id: 'dinner-event',
    title: 'Ужин',
    startsAt: '2026-05-28T20:00:00+03:00',
    endsAt: '2026-05-28T21:00:00+03:00',
    isAllDay: false,
  };
}

function meditationAt10pm(): CalendarEvent {
  return {
    id: 'meditation-event',
    title: 'Медитация',
    startsAt: '2026-05-28T22:00:00+03:00',
    endsAt: '2026-05-28T23:00:00+03:00',
    isAllDay: false,
  };
}

function simulateCalendarQueryAt8pm() {
  buildDeterministicCalendarAnswer({
    transcript: 'Что у меня на 8 вечера?',
    events: [dinnerAt8pm()],
    referenceNow,
    timeZone,
  });
}

function simulateCalendarQueryAt10pm() {
  buildDeterministicCalendarAnswer({
    transcript: 'Что у меня на 10 вечера?',
    events: [meditationAt10pm()],
    referenceNow,
    timeZone,
  });
}

function createAlarmAt(time: string) {
  return resolveLocalAlarmTurn({
    transcript: `Поставь будильник на ${time}`,
    languageCode: 'ru-RU',
    referenceNow,
  });
}

describe('calendar vs alarm context routing after assistant answers', () => {
  beforeEach(() => {
    resetConversationEventMemory('test_reset');
    resetCalendarConversationStore('test_reset');
    resetActiveConversationalReferenceForTests();
    resetLocalAlarmsForTests();
    resetPendingLocalAlarmActionForTests();
  });

  afterEach(() => {
    resetLocalAlarmsForTests();
    resetPendingLocalAlarmActionForTests();
    resetActiveConversationalReferenceForTests();
  });

  it('routes pronoun move to calendar after calendar at-time query even with stale alarm ref', () => {
    createAlarmAt('19:00');
    assert.equal(getLastAssistantDomain(), 'alarm');

    simulateCalendarQueryAt8pm();

    assert.equal(getLastAssistantDomain(), 'calendar');
    assert.equal(getLastReferencedCalendarEventRef()?.title, 'Ужин');
    assert.equal(getLatestActiveReference()?.source, 'calendar_query_answer');

    const moveTranscript = 'Перенеси его на завтра';

    assert.equal(shouldRouteToLocalAlarmWorkflow(moveTranscript), false);
    assert.equal(isLocalAlarmIntent(moveTranscript), false);
    assert.equal(shouldRoutePronounToCalendar(moveTranscript), true);
    assert.equal(isOperationalCalendarUpdateRequest(moveTranscript), true);
  });

  it('routes feminine pronoun move to calendar after evening meditation query', () => {
    simulateCalendarQueryAt10pm();

    assert.equal(getLastReferencedCalendarEventRef()?.title, 'Медитация');

    const moveTranscript = 'Перенеси её на час позже';

    assert.equal(shouldRouteToLocalAlarmWorkflow(moveTranscript), false);
    assert.equal(isLocalAlarmIntent(moveTranscript), false);
    assert.equal(shouldRoutePronounToCalendar(moveTranscript), true);
    assert.equal(isOperationalCalendarUpdateRequest(moveTranscript), true);
  });

  it('routes pronoun move to alarm after alarm create', () => {
    const created = createAlarmAt('19:00');

    assert.match(created?.reply ?? '', /19:00/);
    assert.equal(getLastAssistantDomain(), 'alarm');

    const moved = resolveLocalAlarmTurn({
      transcript: 'Перенеси его на час позже',
      languageCode: 'ru-RU',
      referenceNow,
    });

    assert.match(moved?.reply ?? '', /20:00/);
    assert.equal(
      new Date(listScheduledLocalAlarms(referenceNow.getTime())[0]!.triggerAtMs).getHours(),
      20,
    );
  });

  it('explicit alarm create after calendar query still routes to alarm', () => {
    simulateCalendarQueryAt8pm();
    assert.equal(getLastAssistantDomain(), 'calendar');

    const created = createAlarmAt('21:00');

    assert.match(created?.reply ?? '', /21:00/);
    assert.equal(getLastAssistantDomain(), 'alarm');
    assert.equal(shouldRouteToLocalAlarmWorkflow('Поставь будильник на 21:00'), true);
    assert.equal(listScheduledLocalAlarms(referenceNow.getTime()).length, 1);
  });

  it('calendar query then explicit alarm command does not steal alarm routing', () => {
    simulateCalendarQueryAt8pm();

    const createTranscript = 'Поставь будильник на 21:00';

    assert.equal(shouldRouteToLocalAlarmWorkflow(createTranscript), true);
    assert.equal(isLocalAlarmIntent(createTranscript), true);
    assert.equal(shouldRoutePronounToCalendar(createTranscript), false);
  });
});
