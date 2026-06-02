import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  isEventPronounReference,
  resolveEventTitleQueryForMemory,
} from '@/src/features/agent/calendar/calendarEventReferenceTokens';

describe('calendar event reference tokens', () => {
  it('treats Ukrainian її as pronoun, not a title', () => {
    assert.equal(isEventPronounReference('її'), true);
    assert.equal(
      resolveEventTitleQueryForMemory({
        extractedTitle: 'її',
        memoryTitle: 'Медитація',
      }),
      'Медитація',
    );
  });
});
