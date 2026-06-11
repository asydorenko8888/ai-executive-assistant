import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { CalendarEvent } from '@/src/entities/calendar/types';
import {
  classifyTitleMatchTier,
  selectBestEventByTitlePriority,
} from '@/src/features/agent/calendar/calendarTitleMatchPriority';
import {
  titlesMatchCrossAlphabet,
  transliterateCyrillicToLatin,
} from '@/src/features/agent/calendar/calendarTitleTransliteration';
import { calendarConversationTitlesMatch } from '@/src/features/agent/calendar/calendarConversationTitleMatch';
import { resolveCalendarUpdateIntent } from '@/src/features/agent/calendar/calendarUpdateEventResolution';

function event(id: string, title: string, startsAt: string): CalendarEvent {
  return {
    id,
    title,
    startsAt,
    endsAt: startsAt,
    isAllDay: false,
    attendees: [],
  };
}

describe('calendarTitleTransliteration', () => {
  it('transliterates Cyrillic тест to Latin test', () => {
    assert.equal(transliterateCyrillicToLatin('тест'), 'test');
    assert.equal(titlesMatchCrossAlphabet('тест', 'test'), true);
    assert.equal(titlesMatchCrossAlphabet('test', 'тест'), true);
  });

  it('does not cross-match unrelated Cyrillic and Latin titles', () => {
    assert.equal(titlesMatchCrossAlphabet('массаж', 'test'), false);
    assert.equal(titlesMatchCrossAlphabet('Dentist', 'Dinner'), false);
  });

  it('classifies Cyrillic query against Latin calendar title as transliteration tier', () => {
    assert.equal(classifyTitleMatchTier('тест', 'test'), 'transliteration');
    assert.equal(classifyTitleMatchTier('тест', 'Test'), 'transliteration');
  });

  it('selects the Latin calendar event when user says Cyrillic тест', () => {
    const events = [
      { id: 'google-test', title: 'test' },
      { id: 'other', title: 'meeting' },
    ];

    const selection = selectBestEventByTitlePriority(events, 'тест');
    assert.equal(selection.match?.id, 'google-test');
    assert.equal(selection.tier, 'transliteration');
  });

  it('resolves calendar update intent for Перенеси тест на час позже', () => {
    const referenceNow = new Date('2026-05-28T12:00:00-05:00');
    const resolved = resolveCalendarUpdateIntent({
      transcript: 'Перенеси тест на час позже',
      referenceNow,
      events: [
        event('google-test', 'test', '2026-05-28T18:30:00-05:00'),
      ],
      timeZone: 'America/Chicago',
    });

    assert.equal(resolved.ok, true);

    if (resolved.ok) {
      assert.equal(resolved.target.id, 'google-test');
      assert.equal(resolved.target.title, 'test');
      assert.equal(resolved.resolutionTier, 'transliteration');
    }
  });

  it('matches conversation titles across alphabets', () => {
    assert.equal(calendarConversationTitlesMatch('тест', 'test'), true);
  });
});
