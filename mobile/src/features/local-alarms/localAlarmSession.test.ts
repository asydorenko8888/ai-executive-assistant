import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import {
  ALARM_VOICE_REPEAT_INTERVAL_MS,
  buildActiveAlarmSession,
} from '@/src/features/local-alarms/localAlarmSession';
import {
  createLocalAlarm,
  getLocalAlarmById,
  listDueLocalAlarms,
  listScheduledLocalAlarms,
  resetLocalAlarmsForTests,
  snoozeLocalAlarm,
  stopLocalAlarm,
} from '@/src/features/local-alarms/localAlarmRuntimeStore';

describe('local alarm session store', () => {
  afterEach(() => {
    resetLocalAlarmsForTests();
  });

  it('builds an active alarm session with ringing speech text', () => {
    const alarm = createLocalAlarm({
      title: 'Будильник',
      triggerAt: new Date('2026-05-28T10:02:00+03:00'),
      sourceTranscript: 'Поставь будильник через 2 минуты',
    });

    const session = buildActiveAlarmSession(alarm);

    assert.equal(session.message, 'Будильник: Будильник.');
    assert.equal(session.alarmId, alarm.id);
  });

  it('stops alarm permanently', () => {
    const alarm = createLocalAlarm({
      title: 'Будильник',
      triggerAt: new Date('2026-05-28T10:02:00+03:00'),
      sourceTranscript: 'Поставь будильник через 2 минуты',
    });

    stopLocalAlarm(alarm.id);

    assert.equal(getLocalAlarmById(alarm.id)?.status, 'stopped');
    assert.equal(listDueLocalAlarms(Date.now()).length, 0);
  });

  it('snooze reschedules the same alarm', () => {
    const referenceNow = new Date('2026-05-28T10:00:00+03:00').getTime();
    const alarm = createLocalAlarm({
      title: 'Будильник',
      triggerAt: new Date(referenceNow + 2 * 60_000),
      sourceTranscript: 'Поставь будильник через 2 минуты',
    });

    const snoozed = snoozeLocalAlarm(alarm.id, 5, referenceNow);

    assert.ok(snoozed);
    assert.equal(snoozed?.status, 'scheduled');
    assert.equal(snoozed?.triggerAtMs, referenceNow + 5 * 60_000);
    assert.equal(listScheduledLocalAlarms(referenceNow).length, 1);
    assert.equal(listDueLocalAlarms(referenceNow).length, 0);
  });

  it('uses a 10 second repeat interval constant', () => {
    assert.equal(ALARM_VOICE_REPEAT_INTERVAL_MS, 10_000);
  });
});
