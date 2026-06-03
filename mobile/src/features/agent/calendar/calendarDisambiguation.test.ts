import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildCalendarEventDisambiguationReply,
  buildActionModeFailureReply,
  resolveDisambiguationSelection,
} from '@/src/features/agent/calendar/calendarEventDisambiguation';
import { isDeleteAllCalendarCommand } from '@/src/features/agent/calendar/calendarDeleteIntentExtractor';
import {
  isCalendarSnapshotRefreshInProgress,
  resetCalendarSnapshotRefreshLock,
  runDedupedCalendarSnapshotRefresh,
} from '@/src/features/agent/calendar/calendarSnapshotRefreshLock';
import { resolveCalendarDeleteTargetFromEvents } from '@/src/features/agent/calendar/calendarDeleteResolution';
import { resetConversationEventMemory } from '@/src/features/agent/calendar/calendarConversationEventMemory';

const referenceNow = new Date('2026-05-28T20:00:00-05:00');
const timeZone = 'America/Chicago';

function event(id: string, title: string, startsAt: string, endsAt: string) {
  return { id, title, startsAt, endsAt, isAllDay: false as const };
}

describe('calendar disambiguation and reliability', () => {
  it('asks which meditation to delete when two match by title', () => {
    resetConversationEventMemory('test_reset');

    const today = event('med-1', 'Медитация', '2026-05-28T23:00:00-05:00', '2026-05-28T23:30:00-05:00');
    const tomorrow = event('med-2', 'Медитация', '2026-05-29T15:00:00-05:00', '2026-05-29T15:30:00-05:00');

    const resolution = resolveCalendarDeleteTargetFromEvents({
      events: [today, tomorrow],
      titleQuery: 'медитация',
      transcript: 'Удали медитацию',
      referenceNow,
      timeZone,
    });

    assert.equal(resolution.status, 'ambiguous');
    assert.equal(resolution.candidates.length, 2);

    const reply = buildCalendarEventDisambiguationReply({
      locale: 'uk',
      action: 'delete',
      title: 'Медитация',
      candidates: resolution.candidates.map((entry) => ({
        eventId: entry.event.id,
        title: entry.event.title,
        startsAt: entry.event.startsAt,
        endsAt: entry.event.endsAt,
      })),
      referenceNow,
      timeZone,
    });

    assert.match(reply, /Медитація|Медитация/i);
    assert.match(reply, /1\./);
    assert.match(reply, /2\./);
  });

  it('resolves update selection by day and clock label', () => {
    const candidates = [
      {
        eventId: 'lunch-1pm',
        title: 'Lunch',
        startsAt: '2026-05-28T13:00:00-05:00',
        endsAt: '2026-05-28T14:00:00-05:00',
      },
      {
        eventId: 'lunch-3pm',
        title: 'Lunch',
        startsAt: '2026-05-28T15:00:00-05:00',
        endsAt: '2026-05-28T16:00:00-05:00',
      },
    ];

    const selected = resolveDisambiguationSelection({
      reply: 'Today 3 PM',
      candidates,
      referenceNow,
      timeZone,
    });

    assert.equal(selected?.eventId, 'lunch-3pm');
  });

  it('resolves delete selection by number', () => {
    const candidates = [
      {
        eventId: 'med-1',
        title: 'Медитация',
        startsAt: '2026-05-28T23:00:00-05:00',
        endsAt: '2026-05-28T23:30:00-05:00',
      },
      {
        eventId: 'med-2',
        title: 'Медитация',
        startsAt: '2026-05-29T15:00:00-05:00',
        endsAt: '2026-05-29T15:30:00-05:00',
      },
    ];

    const selected = resolveDisambiguationSelection({
      reply: '2',
      candidates,
      referenceNow,
      timeZone,
    });

    assert.equal(selected?.eventId, 'med-2');
  });

  it('detects delete-all commands', () => {
    assert.equal(isDeleteAllCalendarCommand('Удали все медитации'), true);
    assert.equal(isDeleteAllCalendarCommand('Удали медитацию'), false);
  });

  it('dedupes concurrent snapshot refresh', async () => {
    resetCalendarSnapshotRefreshLock('test');
    let runs = 0;

    const first = runDedupedCalendarSnapshotRefresh('test', async () => {
      runs += 1;
      await new Promise((resolve) => setTimeout(resolve, 20));
      return 'ok';
    });
    const second = runDedupedCalendarSnapshotRefresh('test', async () => {
      runs += 1;
      return 'ok';
    });

    assert.equal(isCalendarSnapshotRefreshInProgress(), true);
    assert.equal(await first, 'ok');
    assert.equal(await second, 'ok');
    assert.equal(runs, 1);
  });

  it('uses human ACTION_MODE failure text', () => {
    assert.doesNotMatch(buildActionModeFailureReply('uk-UA'), /^FAILURE:/);
    assert.match(buildActionModeFailureReply('uk-UA'), /Уточніть/i);
  });
});
