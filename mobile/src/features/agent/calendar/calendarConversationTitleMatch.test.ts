import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { calendarConversationTitlesMatch } from '@/src/features/agent/calendar/calendarConversationTitleMatch';

describe('calendarConversationTitlesMatch', () => {
  it('treats RU accusative and UA nominative meditation as same event', () => {
    assert.equal(calendarConversationTitlesMatch('Медитацию', 'Медитація'), true);
    assert.equal(calendarConversationTitlesMatch('медитацию', 'Медитация'), true);
  });

  it('does not conflate unrelated titles', () => {
    assert.equal(calendarConversationTitlesMatch('Прогулянка', 'Медитація'), false);
  });
});
