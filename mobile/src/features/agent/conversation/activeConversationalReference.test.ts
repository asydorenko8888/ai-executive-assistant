import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import {
  commitCalendarActiveReference,
  commitLocalAlarmActiveReference,
  commitLocalReminderActiveReference,
  commitWeatherActiveReference,
  getLastDomain,
  getLastMentionedEntity,
  getLatestActiveReference,
  isAlarmContextFollowUp,
  isCalendarContextFollowUp,
  isWeatherContextFollowUp,
  resetActiveConversationalReferenceForTests,
  resolveConversationRoutingDomain,
  resolvePronounTargetDomain,
  shouldForceWeatherRouting,
  shouldRoutePronounToCalendar,
  shouldRoutePronounToLocalReminder,
  transcriptHasConversationalPronounReference,
} from '@/src/features/agent/conversation/activeConversationalReference';
import { isOperationalCalendarCreateRequest, isOperationalCalendarDeleteRequest, isOperationalCalendarUpdateRequest } from '@/src/features/agent/intent/operationalCalendarWriteDetection';
import { isLocalAlarmIntent, shouldRouteToLocalAlarmWorkflow } from '@/src/features/local-alarms/localAlarmClassification';
import { isWeatherIntent } from '@/src/features/weather/weatherClassification';

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

describe('pronoun routing by last mentioned entity', () => {
  beforeEach(() => {
    resetActiveConversationalReferenceForTests();
  });

  afterEach(() => {
    resetActiveConversationalReferenceForTests();
  });

  it('1) active alarms: "перенеси его" targets alarm, not calendar', () => {
    commitCalendarActiveReference({
      action: 'query',
      eventId: 'dinner',
      title: 'Ужин',
      startISO: '2026-05-28T20:00:00+03:00',
      endISO: '2026-05-28T21:00:00+03:00',
    });

    commitLocalAlarmActiveReference({
      action: 'query',
      alarmId: 'alarm-7',
      scheduledTimeMs: Date.parse('2026-05-28T19:00:00+03:00'),
      title: 'Будильник',
    });

    const routing = resolvePronounTargetDomain('Перенеси его на час позже');

    assert.equal(routing.selectedDomain, 'local_alarm');
    assert.equal(routing.selectedId, 'alarm-7');
    assert.equal(shouldRouteToLocalAlarmWorkflow('Перенеси его на час позже'), true);
    assert.equal(isOperationalCalendarUpdateRequest('Перенеси его на час позже'), false);
  });

  it('2) today schedule: "перенеси его" targets last listed calendar event', () => {
    commitLocalAlarmActiveReference({
      action: 'query',
      alarmId: 'alarm-7',
      scheduledTimeMs: Date.parse('2026-05-28T07:00:00+03:00'),
    });

    commitCalendarActiveReference({
      action: 'query',
      eventId: 'dinner',
      title: 'Ужин',
      startISO: '2026-05-28T20:00:00+03:00',
      endISO: '2026-05-28T21:00:00+03:00',
      source: 'calendar_query_answer',
    });

    const routing = resolvePronounTargetDomain('Перенеси его на час раньше');

    assert.equal(routing.selectedDomain, 'calendar_event');
    assert.equal(routing.selectedId, 'dinner');
    assert.equal(shouldRoutePronounToCalendar('Перенеси его на час раньше'), true);
    assert.equal(shouldRouteToLocalAlarmWorkflow('Перенеси его на час раньше'), false);
    assert.equal(isLocalAlarmIntent('Перенеси его на час раньше'), false);
  });

  it('3) created reminder: "удали его" targets reminder', () => {
    commitLocalReminderActiveReference({
      action: 'create',
      reminderId: 'rem-1',
      title: 'Купить молоко',
      scheduledTimeMs: Date.now(),
    });

    const routing = resolvePronounTargetDomain('Удали его');

    assert.equal(routing.selectedDomain, 'local_reminder');
    assert.equal(routing.selectedId, 'rem-1');
    assert.equal(shouldRoutePronounToLocalReminder('Удали его'), true);
  });

  it('4) created event: "удали его" targets calendar event', () => {
    commitCalendarActiveReference({
      action: 'create',
      eventId: 'walk',
      title: 'Прогулка',
      startISO: '2026-05-28T15:00:00+03:00',
      endISO: '2026-05-28T16:00:00+03:00',
      source: 'calendar_write',
    });

    const routing = resolvePronounTargetDomain('Удали его');

    assert.equal(routing.selectedDomain, 'calendar_event');
    assert.equal(routing.selectedId, 'walk');
    assert.equal(isOperationalCalendarDeleteRequest('Удали его'), true);
    assert.equal(shouldRouteToLocalAlarmWorkflow('Удали его'), false);
  });

  it('5) weather answer: "а завтра?" continues weather context', () => {
    commitWeatherActiveReference({
      action: 'query',
      timeScope: 'today',
      targetLabel: 'Сегодня',
    });

    assert.equal(getLastMentionedEntity()?.domain, 'weather_context');
    assert.equal(getLastDomain(), 'weather');
    assert.equal(isWeatherContextFollowUp('а завтра?'), true);
    assert.equal(resolvePronounTargetDomain('а завтра?').reason, 'no_contextual_follow_up');
  });
});

describe('domain context routing priority', () => {
  beforeEach(() => {
    resetActiveConversationalReferenceForTests();
  });

  afterEach(() => {
    resetActiveConversationalReferenceForTests();
  });

  it('weather → weather follow-up routes away from calendar create false positive', () => {
    commitWeatherActiveReference({
      action: 'query',
      timeScope: 'next_week',
      targetLabel: 'на следующей неделе',
    });

    const followUp = 'Дай прогноз погоды на ближайшие 5 дней';

    assert.equal(getLastDomain(), 'weather');
    assert.equal(isWeatherIntent(followUp), true);
    assert.equal(isOperationalCalendarCreateRequest(followUp), false);
    assert.equal(isWeatherContextFollowUp(followUp), true);
    assert.equal(shouldForceWeatherRouting(followUp), true);

    const routing = resolveConversationRoutingDomain(followUp);

    assert.equal(routing.domain, 'weather');
    assert.equal(routing.reason, 'explicit_weather_keywords');
  });

  it('calendar → calendar follow-up inherits last domain', () => {
    commitCalendarActiveReference({
      action: 'query',
      eventId: 'dinner',
      title: 'Ужин',
      startISO: '2026-05-28T20:00:00+03:00',
      endISO: '2026-05-28T21:00:00+03:00',
      source: 'calendar_query_answer',
    });

    const followUp = 'а завтра?';

    assert.equal(getLastDomain(), 'calendar');
    assert.equal(isCalendarContextFollowUp(followUp), true);
    assert.equal(shouldForceWeatherRouting(followUp), false);

    const routing = resolveConversationRoutingDomain(followUp);

    assert.equal(routing.domain, 'calendar');
    assert.equal(routing.reason, 'last_domain_calendar_follow_up');
  });

  it('alarm → alarm follow-up inherits last domain', () => {
    commitLocalAlarmActiveReference({
      action: 'query',
      alarmId: 'alarm-1',
      scheduledTimeMs: Date.now(),
      title: '07:00',
    });

    const followUp = 'перенеси его на час позже';

    assert.equal(getLastDomain(), 'alarm');
    assert.equal(isAlarmContextFollowUp(followUp), true);

    const routing = resolveConversationRoutingDomain(followUp);

    assert.equal(routing.domain, 'alarm');
    assert.equal(routing.reason, 'last_mentioned_entity');
  });

  it('mixed conversation switches domain on explicit keywords', () => {
    commitWeatherActiveReference({
      action: 'query',
      timeScope: 'today',
      targetLabel: 'Сегодня',
    });

    const calendarSwitch = 'Что у меня сегодня?';
    const weatherSwitch = 'Какая погода завтра?';

    assert.equal(resolveConversationRoutingDomain(calendarSwitch).domain, 'calendar');
    assert.equal(resolveConversationRoutingDomain(weatherSwitch).domain, 'weather');

    commitCalendarActiveReference({
      action: 'query',
      eventId: 'lunch',
      title: 'Обед',
      startISO: '2026-05-28T12:00:00+03:00',
      endISO: '2026-05-28T13:00:00+03:00',
      source: 'calendar_query_answer',
    });

    assert.equal(getLastDomain(), 'calendar');
    assert.equal(resolveConversationRoutingDomain(weatherSwitch).domain, 'weather');
    assert.equal(resolveConversationRoutingDomain('Перенеси его на час раньше').domain, 'calendar');
  });
});
