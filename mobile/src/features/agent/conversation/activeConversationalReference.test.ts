import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import {
  commitCalendarActiveReference,
  commitLocalAlarmActiveReference,
  commitLocalReminderActiveReference,
  getLatestActiveReference,
  resetActiveConversationalReferenceForTests,
  resolvePronounTargetDomain,
  shouldRoutePronounToCalendar,
  transcriptHasConversationalPronounReference,
} from '@/src/features/agent/conversation/activeConversationalReference';
import { isLocalAlarmIntent, shouldRouteToLocalAlarmWorkflow } from '@/src/features/local-alarms/localAlarmClassification';

describe('last mentioned entity reference resolution', () => {
  beforeEach(() => {
    resetActiveConversationalReferenceForTests();
  });

  afterEach(() => {
    resetActiveConversationalReferenceForTests();
  });

  it('detects extended pronoun tokens', () => {
    for (const phrase of [
      'его',
      'её',
      'это',
      'эту',
      'тот',
      'тот самый',
      'перенеси его',
      'удали её',
    ]) {
      assert.equal(transcriptHasConversationalPronounReference(phrase), true, phrase);
    }
  });

  it('uses last mentioned entity without type priority — calendar after alarm', () => {
    commitLocalAlarmActiveReference({
      action: 'create',
      alarmId: 'alarm-1',
      scheduledTimeMs: Date.now(),
    });

    commitCalendarActiveReference({
      action: 'query',
      eventId: 'dinner',
      title: 'Ужин',
      startISO: '2026-05-28T20:00:00+03:00',
      endISO: '2026-05-28T21:00:00+03:00',
      source: 'calendar_query_answer',
    });

    const routing = resolvePronounTargetDomain('Перенеси его на завтра');

    assert.equal(routing.selectedDomain, 'calendar_event');
    assert.equal(routing.selectedId, 'dinner');
    assert.equal(routing.reason, 'last_mentioned_entity');
    assert.equal(shouldRoutePronounToCalendar('Перенеси его на завтра'), true);
    assert.equal(isLocalAlarmIntent('Перенеси его на завтра'), false);
  });

  it('uses last mentioned entity without type priority — alarm after calendar', () => {
    commitCalendarActiveReference({
      action: 'query',
      eventId: 'dinner',
      title: 'Ужин',
      startISO: '2026-05-28T20:00:00+03:00',
      endISO: '2026-05-28T21:00:00+03:00',
      source: 'calendar_query_answer',
    });

    commitLocalAlarmActiveReference({
      action: 'create',
      alarmId: 'alarm-1',
      scheduledTimeMs: Date.now(),
    });

    const routing = resolvePronounTargetDomain('Перенеси его на час позже');

    assert.equal(routing.selectedDomain, 'local_alarm');
    assert.equal(routing.selectedId, 'alarm-1');
    assert.equal(routing.reason, 'last_mentioned_entity');
  });

  it('uses last mentioned reminder for pronoun delete', () => {
    commitLocalReminderActiveReference({
      action: 'query',
      reminderId: 'rem-1',
      title: 'Купить молоко',
      scheduledTimeMs: Date.now(),
    });

    const routing = resolvePronounTargetDomain('Удали его');

    assert.equal(routing.selectedDomain, 'local_reminder');
    assert.equal(routing.selectedId, 'rem-1');
  });

  it('explicit domain overrides last mentioned entity', () => {
    commitCalendarActiveReference({
      action: 'query',
      eventId: 'dinner',
      title: 'Ужин',
      startISO: '2026-05-28T20:00:00+03:00',
      endISO: '2026-05-28T21:00:00+03:00',
    });

    const routing = resolvePronounTargetDomain('Удали будильник');

    assert.equal(routing.selectedDomain, 'local_alarm');
    assert.equal(routing.reason, 'explicit_domain_in_utterance');
    assert.equal(shouldRouteToLocalAlarmWorkflow('Удали будильник'), true);
  });

  it('tracks only one latest reference at a time', () => {
    commitLocalAlarmActiveReference({
      action: 'create',
      alarmId: 'a1',
      scheduledTimeMs: 1,
    });
    commitLocalAlarmActiveReference({
      action: 'move',
      alarmId: 'a1',
      scheduledTimeMs: 2,
    });

    assert.equal(getLatestActiveReference()?.domain, 'local_alarm');
    assert.equal(getLatestActiveReference()?.id, 'a1');
    assert.equal(getLatestActiveReference()?.scheduledTimeMs, 2);
  });
});
