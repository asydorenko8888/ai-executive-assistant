import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { detectCalendarCommandIntent } from '@/src/features/agent/calendar/calendarCommandTypes';
import {
  isOperationalCalendarDeleteRequest,
  isOperationalCalendarUpdateRequest,
  isOperationalCalendarWriteRequest,
} from '@/src/features/agent/intent/operationalCalendarWriteDetection';
import {
  classifyLocalAlarmIntentKind,
  containsLocalAlarmKeyword,
  shouldRouteToLocalAlarmWorkflow,
} from '@/src/features/local-alarms/localAlarmClassification';

describe('alarm priority over calendar routing', () => {
  it('detects alarm keyword in status and move phrases', () => {
    assert.equal(containsLocalAlarmKeyword('На который час у меня будильник?'), true);
    assert.equal(containsLocalAlarmKeyword('Перенеси будильник на час позже'), true);
    assert.equal(shouldRouteToLocalAlarmWorkflow('Удали будильник'), true);
    assert.equal(containsLocalAlarmKeyword('Удали массаж'), false);
  });

  it('does not classify alarm phrases as calendar commands', () => {
    const cases = [
      'Удали будильник',
      'Перенеси будильник на час позже',
      'На сколько стоит будильник?',
      'Поставь будильник на 7 утра',
    ];

    for (const transcript of cases) {
      assert.equal(detectCalendarCommandIntent(transcript), 'none', transcript);
      assert.equal(isOperationalCalendarWriteRequest(transcript), false, transcript);
      assert.equal(isOperationalCalendarDeleteRequest(transcript), false, transcript);
      assert.equal(isOperationalCalendarUpdateRequest(transcript), false, transcript);
      assert.notEqual(classifyLocalAlarmIntentKind(transcript), null, transcript);
    }
  });

  it('still classifies calendar commands without alarm keyword', () => {
    assert.equal(detectCalendarCommandIntent('Удали массаж'), 'delete_calendar_event');
    assert.equal(detectCalendarCommandIntent('Перенеси массаж на час позже'), 'update_calendar_event');
  });
});
