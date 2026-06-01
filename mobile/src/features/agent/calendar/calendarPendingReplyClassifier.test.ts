import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseClockFragmentToMinutes } from '@/src/features/agent/calendarIntelligence/calendarClockParser';
import { extractSpokenEveningClockFragment } from '@/src/features/agent/calendar/calendarEveningClock';
import {
  classifyPendingCalendarReply,
  isNewCalendarCommandMessage,
} from '@/src/features/agent/calendar/calendarPendingReplyClassifier';

describe('calendar pending reply classifier', () => {
  it('treats bare yes/no as confirmation or rejection', () => {
    assert.equal(classifyPendingCalendarReply('да'), 'confirmation');
    assert.equal(classifyPendingCalendarReply('нет'), 'rejection');
    assert.equal(classifyPendingCalendarReply('ні'), 'rejection');
  });

  it('detects a new calendar command while pending confirmation would be active', () => {
    assert.equal(
      classifyPendingCalendarReply('Добавь ужин сегодня в 7 вечера'),
      'new_calendar_command',
    );
    assert.equal(
      isNewCalendarCommandMessage('Add dinner today at 7 PM'),
      true,
    );
  });

  it('does not treat a repeat pool command as a bare confirmation', () => {
    assert.equal(
      classifyPendingCalendarReply('Добавь в бассейн на 4:00 вечера'),
      'new_calendar_command',
    );
  });
});

describe('evening clock parsing', () => {
  it('parses 4:00 PM Russian evening as 16:00', () => {
    const minutes = parseClockFragmentToMinutes('4:00', 'на 4:00 вечера');

    assert.equal(minutes, 16 * 60);
  });

  it('parses spoken "четыре вечера" as 16:00', () => {
    const fragment = extractSpokenEveningClockFragment('Добавь бассейн на четыре вечера');
    const minutes = fragment ? parseClockFragmentToMinutes(fragment, 'на четыре вечера') : null;

    assert.equal(minutes, 16 * 60);
  });

  it('parses "на 8 вечера" as 20:00', () => {
    const minutes = parseClockFragmentToMinutes('8', 'на 8 вечера');

    assert.equal(minutes, 20 * 60);
  });
});
