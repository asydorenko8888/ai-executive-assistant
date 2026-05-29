import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { CalendarEvent } from '@/src/entities/calendar/types';
import { detectCalendarCommandIntent } from '@/src/features/agent/calendar/calendarCommandTypes';
import {
  buildCalendarDeleteAmbiguousReply,
  buildCalendarDeleteNotFoundReply,
  buildCalendarDeleteRecurringNotSupportedReply,
} from '@/src/features/agent/calendar/calendarDeleteNaturalReplies';
import { extractDeleteEventTitle } from '@/src/features/agent/calendar/calendarDeleteIntentExtractor';
import {
  isRecurringGoogleCalendarEventId,
  resolveCalendarDeleteTargetFromEvents,
} from '@/src/features/agent/calendar/calendarDeleteResolution';
import { isTerminalCalendarToolReply } from '@/src/features/agent/calendar/calendarExecutionContract';
import { buildDeterministicCalendarAnswer } from '@/src/features/agent/calendarIntelligence/calendarAnswerEngine';
import { parseCalendarClockMinutes } from '@/src/features/agent/calendarIntelligence/calendarClockParser';
import { resolveTargetDayContext } from '@/src/features/agent/calendarIntelligence/resolveTargetDay';
import {
  createCalendarToolFailure,
  createCalendarToolSuccess,
} from '@/src/features/agent/execution/calendarToolContract';
import { isOperationalCalendarDeleteRequest } from '@/src/features/agent/intent/operationalCalendarWriteDetection';

const timeZone = 'America/Chicago';
const referenceNow = new Date('2026-05-28T20:00:00-05:00');

function chicagoEvent(
  id: string,
  title: string,
  hour: number,
  minute = 0,
  durationMinutes = 60,
): CalendarEvent {
  const pad = (value: number) => String(value).padStart(2, '0');
  const start = `2026-05-28T${pad(hour)}:${pad(minute)}:00-05:00`;
  const end = new Date(start);
  end.setMinutes(end.getMinutes() + durationMinutes);

  return {
    id,
    title,
    startsAt: start,
    endsAt: end.toISOString(),
    isAllDay: false,
  };
}

function resolveDelete(transcript: string, events: CalendarEvent[], titleQuery?: string) {
  const title = titleQuery ?? extractDeleteEventTitle(transcript) ?? '';

  return resolveCalendarDeleteTargetFromEvents({
    events,
    titleQuery: title,
    transcript,
    referenceNow,
    timeZone,
  });
}

describe('calendar delete integration', () => {
  it('resolves the same tea event for READ and DELETE at 19:30 after the event started', () => {
    const tea = chicagoEvent('tea-1930', 'Чаепитие', 19, 30, 60);
    const readTranscript = 'Какая задача сегодня стоит у меня в 19:30';
    const deleteTranscript = 'Удали чаепитие сегодня в 19:30';

    const readAnswer = buildDeterministicCalendarAnswer({
      transcript: readTranscript,
      events: [tea],
      referenceNow,
      timeZone,
    });

    assert.ok(readAnswer);
    const readMatches = readAnswer.payload.atTimeEvents as NonNullable<typeof readAnswer>['events'];
    assert.equal(readMatches.length, 1);
    assert.match(readMatches[0]?.title ?? '', /Чаепитие/i);

    assert.equal(extractDeleteEventTitle(deleteTranscript), 'чаепитие');

    const day = resolveTargetDayContext(deleteTranscript, referenceNow, timeZone);
    assert.equal(parseCalendarClockMinutes(deleteTranscript, day), 19 * 60 + 30);

    const deleteResolution = resolveDelete(deleteTranscript, [tea]);
    assert.equal(deleteResolution.status, 'unique');
    assert.equal(deleteResolution.event.id, 'tea-1930');
    assert.equal(deleteResolution.notFoundReason, null);
  });

  it('classifies Russian and English delete commands as delete_calendar_event', () => {
    const samples = [
      'удали чаепитие сегодня в 19:30',
      'удали задачу чаепитие на 19:30',
      'убери встречу в 15:00',
      'отмени спортзал в 18:00',
      'видали чай сьогодні о 19:30',
      'Delete dinner at 7 PM',
      'Remove my meeting at 3 PM',
      'Cancel dinner at 7 PM',
    ];

    for (const transcript of samples) {
      assert.equal(detectCalendarCommandIntent(transcript), 'delete_calendar_event', transcript);
      assert.equal(isOperationalCalendarDeleteRequest(transcript), true, transcript);
    }
  });

  it('extracts delete title without semantic create extractor', () => {
    assert.equal(extractDeleteEventTitle('Удали чаепитие сегодня в 19:30'), 'чаепитие');
    assert.equal(extractDeleteEventTitle('убери спортзал в 18:00'), 'спортзал');
  });

  it('resolves delete for убери спортзал в 18:00', () => {
    const gym = chicagoEvent('gym', 'спортзал', 18);
    const resolution = resolveDelete('убери спортзал в 18:00', [gym]);

    assert.equal(resolution.status, 'unique');
    assert.equal(resolution.event.id, 'gym');
  });

  it('does not delete overlapping event when start time differs', () => {
    const gym = chicagoEvent('gym', 'спортзал', 18, 0, 60);
    const tea = chicagoEvent('tea', 'чаепитие', 18, 30, 30);
    const resolution = resolveDelete('удали чаепитие в 18:30', [gym, tea]);

    assert.equal(resolution.status, 'unique');
    assert.equal(resolution.event.id, 'tea');
  });

  it('does not delete gym when command targets 18:30 start', () => {
    const gym = chicagoEvent('gym', 'спортзал', 18, 0, 60);
    const resolution = resolveDelete('удали спортзал в 18:30', [gym]);

    assert.equal(resolution.status, 'not_found');
  });

  it('selects correct time among duplicate titles on the same day', () => {
    const early = chicagoEvent('tea-early', 'чаепитие', 17, 30, 30);
    const late = chicagoEvent('tea-late', 'чаепитие', 19, 30, 30);
    const resolution = resolveDelete('удали чаепитие сегодня в 19:30', [early, late]);

    assert.equal(resolution.status, 'unique');
    assert.equal(resolution.event.id, 'tea-late');
  });

  it('returns ambiguous when duplicate title shares the same start time', () => {
    const first = chicagoEvent('tea-a', 'чаепитие', 19, 30, 30);
    const second = {
      ...chicagoEvent('tea-b', 'Чаепитие', 19, 30, 30),
      id: 'tea-b',
    };

    const resolution = resolveDelete('удали чаепитие сегодня в 19:30', [first, second]);

    assert.equal(resolution.status, 'ambiguous');
    assert.ok(resolution.candidates.length >= 2);
  });

  it('returns not found when no event matches', () => {
    const resolution = resolveDelete('удали ужин сегодня в 20:00', [chicagoEvent('lunch', 'обед', 12)]);

    assert.equal(resolution.status, 'not_found');
  });

  it('does not delete vague meeting requests when multiple meetings exist', () => {
    const events = [
      chicagoEvent('m1', 'Team meeting', 10),
      chicagoEvent('m2', 'Client meeting', 14),
    ];

    const resolution = resolveCalendarDeleteTargetFromEvents({
      events,
      titleQuery: 'meeting',
      transcript: 'удали meeting',
      referenceNow,
      timeZone,
    });

    assert.equal(resolution.status, 'ambiguous');
  });

  it('blocks recurring instance deletion', () => {
    const recurring = chicagoEvent('series', 'Weekly standup', 9);
    recurring.id = 'abc123_20260528T190000Z';

    const resolution = resolveDelete('удали Weekly standup в 09:00', [recurring]);

    assert.equal(resolution.status, 'recurring_not_supported');
    assert.equal(isRecurringGoogleCalendarEventId(recurring.id), true);
  });

  it('uses natural not-found, ambiguous, and recurring replies', () => {
    assert.equal(
      buildCalendarDeleteNotFoundReply('ru'),
      'Я не нашёл такое событие в календаре.',
    );
    assert.equal(
      buildCalendarDeleteAmbiguousReply('ru'),
      'Я нашёл несколько похожих событий. Какое именно удалить?',
    );
    assert.equal(
      buildCalendarDeleteRecurringNotSupportedReply('ru'),
      'Повторяющиеся события пока не поддерживаются для удаления.',
    );
    assert.ok(isTerminalCalendarToolReply(buildCalendarDeleteNotFoundReply('ru')));
  });

  it('does not mark unverified backend delete as verified success', () => {
    const failure = createCalendarToolFailure('VERIFY_FAILED', 'Google Calendar did not confirm deletion.');

    assert.equal(failure.status, 'FAILURE');
    assert.equal(failure.verified, false);
    assert.equal(failure.verificationFetched, false);
  });

  it('marks verified tool success only when backend confirms deletion', () => {
    const tool = createCalendarToolSuccess({
      id: 'evt-tea',
      summary: 'чаепитие',
      startsAt: '2026-05-28T19:30:00-05:00',
      endsAt: '2026-05-28T20:00:00-05:00',
    });

    assert.equal(tool.status, 'SUCCESS');
    assert.equal(tool.verified, true);
    assert.equal(tool.verificationFetched, true);
    assert.ok(tool.event);
  });

  it('does not build success copy for unverified failure tool', () => {
    const failure = createCalendarToolFailure('VERIFY_FAILED', 'Google Calendar did not confirm deletion.');
    assert.notEqual(failure.status, 'SUCCESS');
    assert.equal(failure.verified, false);
  });
});
