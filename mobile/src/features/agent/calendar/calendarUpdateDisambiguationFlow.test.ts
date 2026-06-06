import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { resolveDisambiguationSelection } from '@/src/features/agent/calendar/calendarEventDisambiguation';
import {
  pendingContextFromExtraction,
  tryMergePendingCalendarUpdateReply,
} from '@/src/features/agent/calendar/calendarUpdatePendingContext';
import { extractCalendarUpdateParameters } from '@/src/features/agent/calendar/calendarUpdateIntentExtractor';
import { parseCalendarClockMinutes } from '@/src/features/agent/calendarIntelligence/calendarClockParser';
import { resolveTargetDayContext } from '@/src/features/agent/calendarIntelligence/resolveTargetDay';

const referenceNow = new Date('2026-05-28T20:00:00-05:00');
const timeZone = 'America/Chicago';
const sourceTranscript = 'Перенеси медитацию на завтра';

const candidates = [
  {
    eventId: 'med-8pm',
    title: 'Медитация',
    startsAt: '2026-05-28T20:00:00-05:00',
    endsAt: '2026-05-28T21:00:00-05:00',
  },
  {
    eventId: 'med-11pm',
    title: 'Медитация',
    startsAt: '2026-05-28T23:00:00-05:00',
    endsAt: '2026-05-29T00:00:00-05:00',
  },
];

describe('calendar update disambiguation flow', () => {
  it('parses clock from сегодня в 8:00 вечера', () => {
    const day = resolveTargetDayContext('сегодня в 8:00 вечера', referenceNow, timeZone);
    const clock = parseCalendarClockMinutes('сегодня в 8:00 вечера', day);

    assert.equal(clock, 20 * 60);
  });

  it('selects 8 PM meditation by Russian time reply', () => {
    const selected = resolveDisambiguationSelection({
      reply: 'сегодня в 8:00 вечера',
      candidates,
      referenceNow,
      timeZone,
      locale: 'ru',
      pendingTitle: 'медитация',
    });

    assert.equal(selected?.eventId, 'med-8pm');
  });

  it('merges pending move context and keeps tomorrow target after candidate selection', () => {
    const extracted = extractCalendarUpdateParameters(sourceTranscript, referenceNow);
    const pending = pendingContextFromExtraction({
      sourceTranscript,
      extraction: extracted,
      candidates,
      referenceNow,
    });

    const merged = tryMergePendingCalendarUpdateReply({
      pending,
      reply: 'сегодня в 8:00 вечера',
      referenceNow,
    });

    assert.ok(merged);
    assert.equal(merged!.selectedEventId, 'med-8pm');
    assert.equal(merged!.context.selectedEventId, 'med-8pm');
    assert.equal(merged!.context.fromStartISO, '2026-05-28T20:00:00-05:00');
    assert.ok(merged!.context.toStartISO);
    assert.equal(merged!.readyToExecute, true);
    assert.equal(
      Date.parse(merged!.context.toStartISO!),
      Date.parse('2026-05-29T20:00:00-05:00'),
    );
  });
});
