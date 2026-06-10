import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildMorningBriefing } from '@/src/features/agent/morningBriefingPipeline';
import type { ExecutiveAgentContext, ExecutiveAgentSnapshot } from '@/src/features/agent/types';
import { NO_CALENDAR_EVENTS_TODAY_MESSAGE } from '@/src/features/home/utils/homeCalendarAgenda';

function baseContext(): ExecutiveAgentContext {
  return {
    locale: 'en',
    now: '2026-05-28T08:00:00.000-05:00',
    preferences: {
      morningBriefingTime: '07:30',
      defaultReminderLeadMinutes: 15,
      preferredTravelMode: 'driving',
      prefersConciseBriefings: true,
      briefingFocus: ['calendar'],
      workingStyleNotes: [],
      activeProjects: [],
      importantPeople: [],
    },
    chatMessages: [],
    shortTermMemory: {
      currentTopics: [],
      activeSituations: [],
      temporaryTasks: [],
      recentEmotionalState: 'steady',
      sourceMessageIds: [],
      generatedAt: '2026-05-28T08:00:00.000Z',
    },
    longTermMemories: [],
  };
}

function baseSnapshot(overrides: Partial<ExecutiveAgentSnapshot> = {}): ExecutiveAgentSnapshot {
  return {
    calendarConnection: {
      provider: 'google',
      status: 'connected',
      connectedEmail: 'user@example.com',
    },
    calendarSummary: undefined,
    upcomingCalendarEvents: [],
    emailDigest: undefined,
    tasks: [],
    reminders: [],
    routeAwareness: undefined,
    notifications: [],
    capabilities: {
      calendar: 'available',
      email: 'not_connected',
      tasks: 'available',
      reminders: 'available',
      route: 'coming_soon',
      briefings: 'available',
    },
    ...overrides,
  };
}

describe('buildMorningBriefing schedule section', () => {
  it('omits schedule when Google Calendar is not connected', () => {
    const briefing = buildMorningBriefing(
      baseContext(),
      baseSnapshot({
        calendarConnection: {
          provider: 'google',
          status: 'not_connected',
        },
      }),
    );

    assert.equal(briefing.sections.some((section) => section.kind === 'schedule'), false);
  });

  it('shows empty-state copy when connected with no fetched events', () => {
    const briefing = buildMorningBriefing(baseContext(), baseSnapshot());

    const schedule = briefing.sections.find((section) => section.kind === 'schedule');
    assert.ok(schedule);
    assert.equal(schedule.summary, NO_CALENDAR_EVENTS_TODAY_MESSAGE);
    assert.deepEqual(schedule.items, []);
    assert.equal(briefing.headline, NO_CALENDAR_EVENTS_TODAY_MESSAGE);
  });

  it('lists only fetched calendar events when connected', () => {
    const briefing = buildMorningBriefing(
      baseContext(),
      baseSnapshot({
        upcomingCalendarEvents: [
          {
            id: 'google-1',
            title: 'Investor sync',
            startsAt: '2026-05-28T11:30:00.000-05:00',
            endsAt: '2026-05-28T12:30:00.000-05:00',
            isAllDay: false,
            attendees: [],
          },
        ],
        calendarSummary: {
          date: '2026-05-28T00:00:00.000Z',
          eventsCount: 1,
          focusBlocksCount: 0,
          nextEvent: {
            id: 'google-1',
            title: 'Investor sync',
            startsAt: '2026-05-28T11:30:00.000Z',
            endsAt: '2026-05-28T12:30:00.000Z',
            isAllDay: false,
            attendees: [],
          },
          followingEvent: undefined,
          nextFreeWindow: undefined,
          freeWindows: [],
          busyMinutes: 60,
          freeMinutes: 420,
          timePressure: 'light',
          hasBackToBackMeetings: false,
          transitionSummary: 'Your next meeting is Investor sync.',
          availabilitySummary: '',
          connectedEmail: 'user@example.com',
        },
      }),
    );

    const schedule = briefing.sections.find((section) => section.kind === 'schedule');
    assert.ok(schedule);
    assert.equal(schedule.summary.includes('Investor sync'), true);
    assert.equal(schedule.items.some((item) => item.includes('Investor sync')), true);
    assert.equal(schedule.items.some((item) => item.includes('Массаж')), false);
  });
});
