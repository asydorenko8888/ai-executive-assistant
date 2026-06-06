import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  logLocalReminderTriggered,
  logLocalReminderVoicePlay,
} from '@/src/features/local-reminders/localReminderMarkers';
import { playLocalReminderVoice } from '@/src/features/local-reminders/localReminderVoicePlayback';

describe('local reminder voice playback', () => {
  it('logs voice play before speaking and triggered delivery markers', () => {
    const logs: unknown[][] = [];
    const original = console.error;

    console.error = (...args: unknown[]) => {
      logs.push(args);
    };

    try {
      let spokenText = '';

      logLocalReminderTriggered({
        id: 'local-reminder-test',
        text: 'выпить воду',
        triggerAtIso: '2026-05-28T10:02:00.000Z',
        kind: 'reminder',
      });

      playLocalReminderVoice({
        message: 'Напоминание: выпить воду.',
        languageCode: 'ru-RU',
        isSupported: () => true,
        speak: (text) => {
          spokenText = text;
        },
        onPlay: () => {
          logLocalReminderVoicePlay({
            id: 'local-reminder-test',
            title: 'выпить воду',
          });
        },
        onBlocked: () => {
          assert.fail('voice should not be blocked');
        },
      });

      assert.equal(spokenText, 'Напоминание: выпить воду.');

      const triggeredLog = logs.find((entry) => entry[0] === 'LOCAL_REMINDER_TRIGGERED');
      const voicePlayLog = logs.find((entry) => entry[0] === 'LOCAL_REMINDER_VOICE_PLAY');

      assert.ok(triggeredLog);
      assert.ok(voicePlayLog);
      assert.equal((voicePlayLog?.[1] as { title?: string }).title, 'выпить воду');
    } finally {
      console.error = original;
    }
  });

  it('reports blocked reason when speech is unsupported', () => {
    const logs: unknown[][] = [];
    const original = console.error;

    console.error = (...args: unknown[]) => {
      logs.push(args);
    };

    try {
      playLocalReminderVoice({
        message: 'Напоминание: выпить воду.',
        languageCode: 'ru-RU',
        isSupported: () => false,
        speak: () => {
          assert.fail('speak should not run');
        },
        onPlay: () => {
          assert.fail('onPlay should not run');
        },
        onBlocked: (reason) => {
          logs.push(['LOCAL_REMINDER_VOICE_BLOCKED', { reason }]);
        },
      });

      const blockedLog = logs.find((entry) => entry[0] === 'LOCAL_REMINDER_VOICE_BLOCKED');

      assert.ok(blockedLog);
      assert.equal((blockedLog?.[1] as { reason?: string }).reason, 'speech_synthesis_unsupported');
    } finally {
      console.error = original;
    }
  });
});
