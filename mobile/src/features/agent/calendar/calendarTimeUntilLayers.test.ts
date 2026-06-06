import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { CalendarEvent } from '@/src/entities/calendar/types';
import {
  assessEventDepartureLayers,
  buildDepartureRecommendationText,
  buildEventDepartureContext,
  buildEventDeparturePreferences,
  buildFactsOnlyTimeUntilReply,
  canGenerateDepartureRecommendation,
  computeLeaveInMinutesFromLayers,
  isExplicitDeparturePlanningQuery,
  listMissingDepartureRecommendationFields,
} from '@/src/features/agent/calendar/calendarTimeUntilLayers';

function event(
  id: string,
  title: string,
  startsAt: string,
  location?: string,
): CalendarEvent {
  return {
    id,
    title,
    startsAt,
    endsAt: startsAt.replace(/T(\d{2}):(\d{2})/, (_, h, m) => {
      const endHour = Number(h) + 1;
      return `T${String(endHour).padStart(2, '0')}:${m}`;
    }),
    location,
    isAllDay: false,
  };
}

describe('calendarTimeUntilLayers', () => {
  const referenceNow = new Date('2026-06-02T17:40:00-05:00');

  it('FACTS only: 110 minutes → 1 hour 50 minutes (EN)', () => {
    const dinner = event('dinner', 'Dinner', '2026-06-02T19:30:00-05:00');
    const layers = assessEventDepartureLayers({
      event: dinner,
      referenceNow,
      locale: 'en',
    });

    assert.ok(layers);
    assert.equal(layers.facts.minutesUntilStart, 110);
    assert.equal(layers.facts.formattedDuration, '1 hour 50 minutes');

    const reply = buildFactsOnlyTimeUntilReply({
      locale: 'en',
      eventTitle: 'Dinner',
      facts: layers.facts,
      isPast: false,
      isNow: false,
    });

    assert.equal(reply, 'There is 1 hour 50 minutes until Dinner.');
  });

  it('blocks RECOMMENDATIONS without travel evidence', () => {
    const layers = assessEventDepartureLayers({
      event: event('d', 'Dinner', '2026-06-02T19:30:00-05:00'),
      referenceNow,
      locale: 'uk',
    });

    assert.ok(layers);
    assert.equal(layers.canRecommend, false);
    assert.ok(layers.missingForRecommendation.includes('event_location'));
    assert.ok(layers.missingForRecommendation.includes('travel_time'));
    assert.ok(layers.missingForRecommendation.includes('desired_buffer'));
  });

  it('blocks RECOMMENDATIONS when travel is only a default guess', () => {
    const context = buildEventDepartureContext({
      event: event('d', 'Dinner', '2026-06-02T19:30:00-05:00', 'City Hall'),
      travelEvidenceMinutes: null,
    });

    assert.equal(context.travelMinutesKnown, false);
  });

  it('allows RECOMMENDATIONS only with full context + preferences', () => {
    const facts = {
      minutesUntilStart: 110,
      formattedDuration: '1 година 50 хвилин',
      eventStartIso: '2026-06-02T19:30:00-05:00',
      eventStartLabel: '7:30 PM',
    };
    const context = {
      eventLocation: 'City Hall',
      travelMinutes: 25,
      travelMinutesKnown: true,
      prepMinutes: 10,
    };
    const preferences = {
      desiredBufferMinutes: 5,
      habitNotes: null,
    };

    assert.equal(
      canGenerateDepartureRecommendation({ facts, context, preferences }),
      true,
    );

    const leaveIn = computeLeaveInMinutesFromLayers({ facts, context, preferences });

    assert.equal(leaveIn, 70);

    const text = buildDepartureRecommendationText({
      locale: 'uk',
      eventTitle: 'Dinner',
      layers: {
        facts,
        context,
        preferences,
        canRecommend: true,
        missingForRecommendation: [],
      },
    });

    assert.match(text ?? '', /Рекомендація:/);
    assert.match(text ?? '', /1 година 10 хвилин/);
  });

  it('detects explicit departure planning queries', () => {
    assert.equal(isExplicitDeparturePlanningQuery('when should I leave for dinner'), true);
    assert.equal(isExplicitDeparturePlanningQuery('how long until dinner'), false);
  });

  it('user preferences hook returns null until wired', () => {
    assert.equal(buildEventDeparturePreferences(), null);
    assert.ok(
      listMissingDepartureRecommendationFields({
        facts: {
          minutesUntilStart: 60,
          formattedDuration: '1 hour',
          eventStartIso: '2026-06-02T19:00:00-05:00',
          eventStartLabel: '7:00 PM',
        },
        context: {
          eventLocation: 'Hall',
          travelMinutes: 20,
          travelMinutesKnown: true,
          prepMinutes: 10,
        },
        preferences: null,
      }).includes('desired_buffer'),
    );
  });
});
