import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import {
  getLastReferencedCalendarEvent,
  recordCreatedConversationEvent,
  resetConversationEventMemory,
  shouldDeleteFromLastReferencedMemory,
} from '@/src/features/agent/calendar/calendarConversationEventMemory';
import { resetCalendarConversationState } from '@/src/features/agent/calendar/calendarConversationState';
import {
  getLatestActiveReference,
  resetActiveConversationalReferenceForTests,
} from '@/src/features/agent/conversation/activeConversationalReference';
import { isOperationalCalendarDeleteRequest } from '@/src/features/agent/intent/operationalCalendarWriteDetection';
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

function recordDinnerEvent() {
  recordCreatedConversationEvent({
    eventId: 'dinner-event',
    title: 'Ужин',
    startISO: '2026-05-28T16:00:00.000Z',
    endISO: '2026-05-28T17:00:00.000Z',
  });
}

function createAlarmAt19() {
  return resolveLocalAlarmTurn({
    transcript: 'Поставь будильник на 19.00',
    languageCode: 'ru-RU',
    referenceNow,
  });
}

describe('local alarm pronoun reference priority', () => {
  beforeEach(() => {
    resetConversationEventMemory('test_reset');
    resetCalendarConversationState('test_reset');
    resetActiveConversationalReferenceForTests();
    resetLocalAlarmsForTests();
    resetPendingLocalAlarmActionForTests();
  });

  afterEach(() => {
    resetLocalAlarmsForTests();
    resetPendingLocalAlarmActionForTests();
    resetActiveConversationalReferenceForTests();
  });

  it('Test 1: pronoun delete removes alarm after calendar event + alarm moves, not dinner', () => {
    recordDinnerEvent();

    const created = createAlarmAt19();
    assert.match(created?.reply ?? '', /19:00/);

    const movedLater = resolveLocalAlarmTurn({
      transcript: 'Перенеси его на час позже',
      languageCode: 'ru-RU',
      referenceNow,
    });
    assert.match(movedLater?.reply ?? '', /20:00/);

    const movedEarlier = resolveLocalAlarmTurn({
      transcript: 'А теперь перенеси его на полчаса раньше',
      languageCode: 'ru-RU',
      referenceNow,
    });
    assert.match(movedEarlier?.reply ?? '', /19:30/);

    assert.equal(getLatestActiveReference()?.domain, 'local_alarm');
    assert.equal(shouldDeleteFromLastReferencedMemory({ transcript: 'Удали его', referenceNow }), false);
    assert.equal(isOperationalCalendarDeleteRequest('Удали его'), false);
    assert.equal(shouldRouteToLocalAlarmWorkflow('Удали его'), true);
    assert.equal(isLocalAlarmIntent('Удали его'), true);

    const deleted = resolveLocalAlarmTurn({
      transcript: 'Удали его',
      languageCode: 'ru-RU',
      referenceNow,
    });

    assert.match(deleted?.reply ?? '', /удал/i);
    assert.equal(listScheduledLocalAlarms(referenceNow.getTime()).length, 0);
    assert.equal(getLastReferencedCalendarEvent(referenceNow)?.title, 'Ужин');
    assert.equal(getLastReferencedCalendarEvent(referenceNow)?.eventId, 'dinner-event');
  });

  it('Test 2: pronoun delete after calendar create targets calendar event', () => {
    recordDinnerEvent();

    assert.equal(getLatestActiveReference()?.domain, 'calendar_event');
    assert.equal(getLatestActiveReference()?.id, 'dinner-event');
    assert.equal(shouldDeleteFromLastReferencedMemory({ transcript: 'Удали его', referenceNow }), true);
    assert.equal(isOperationalCalendarDeleteRequest('Удали его'), true);
    assert.equal(shouldRouteToLocalAlarmWorkflow('Удали его'), false);
  });

  it('Test 3: pronoun delete after alarm create removes alarm', () => {
    createAlarmAt19();

    assert.equal(getLatestActiveReference()?.domain, 'local_alarm');
    assert.equal(shouldRouteToLocalAlarmWorkflow('Удали его'), true);

    const deleted = resolveLocalAlarmTurn({
      transcript: 'Удали его',
      languageCode: 'ru-RU',
      referenceNow,
    });

    assert.match(deleted?.reply ?? '', /удал/i);
    assert.equal(listScheduledLocalAlarms(referenceNow.getTime()).length, 0);
  });

  it('Test 4: pronoun delete after alarm then calendar create targets calendar event', () => {
    createAlarmAt19();
    recordDinnerEvent();

    assert.equal(getLatestActiveReference()?.domain, 'calendar_event');
    assert.equal(getLatestActiveReference()?.id, 'dinner-event');
    assert.equal(shouldDeleteFromLastReferencedMemory({ transcript: 'Удали его', referenceNow }), true);
    assert.equal(isOperationalCalendarDeleteRequest('Удали его'), true);
    assert.equal(shouldRouteToLocalAlarmWorkflow('Удали его'), false);
    assert.equal(listScheduledLocalAlarms(referenceNow.getTime()).length, 1);
  });

  it('Test 5: explicit alarm delete after calendar create still removes alarm', () => {
    createAlarmAt19();
    recordDinnerEvent();

    assert.equal(getLatestActiveReference()?.domain, 'calendar_event');
    assert.equal(shouldRouteToLocalAlarmWorkflow('Удали будильник'), true);
    assert.equal(isOperationalCalendarDeleteRequest('Удали будильник'), false);

    const deleted = resolveLocalAlarmTurn({
      transcript: 'Удали будильник',
      languageCode: 'ru-RU',
      referenceNow,
    });

    assert.match(deleted?.reply ?? '', /удал/i);
    assert.equal(listScheduledLocalAlarms(referenceNow.getTime()).length, 0);
    assert.equal(getLastReferencedCalendarEvent(referenceNow)?.title, 'Ужин');
  });
});
