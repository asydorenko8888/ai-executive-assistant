import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  classifyLocalAlarmIntentKind,
} from '@/src/features/local-alarms/localAlarmClassification';
import {
  detectAlarmPipelineIntent,
  resolveAlarmRoutingDiagnostic,
} from '@/src/features/local-alarms/localAlarmRouting';

describe('alarm routing diagnostics', () => {
  it('detects ALARM_QUERY for user-reported status phrases', () => {
    const cases = [
      'На который час у меня стоит будильник?',
      'На сколько стоит будильник?',
      'Есть ли у меня будильник?',
    ];

    for (const userText of cases) {
      assert.equal(classifyLocalAlarmIntentKind(userText), 'status', userText);
      assert.equal(detectAlarmPipelineIntent(userText), 'ALARM_QUERY', userText);

      const diagnostic = resolveAlarmRoutingDiagnostic({ userText });
      assert.equal(diagnostic.detectedIntent, 'ALARM_QUERY', userText);
      assert.equal(diagnostic.selectedPipeline, 'ALARM_QUERY_PIPELINE', userText);
    }
  });

  it('prioritizes move and delete before status', () => {
    assert.equal(detectAlarmPipelineIntent('Перенеси будильник на час позже'), 'ALARM_MOVE');
    assert.equal(detectAlarmPipelineIntent('Удали будильник'), 'ALARM_DELETE');
  });
});
