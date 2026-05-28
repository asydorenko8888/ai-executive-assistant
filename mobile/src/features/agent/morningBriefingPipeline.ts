import type { ReminderItem } from '@/src/entities/reminder/types';
import type { TaskItem } from '@/src/entities/task/types';
import {
  areCalendarPhrasesEquivalent,
  buildCalendarAvailabilitySummary,
} from '@/src/features/agent/calendar/calendarNaturalLanguage';
import { formatLocationShort } from '@/src/features/agent/calendar/calendarLocation';
import { formatTimeInLocalTimezone } from '@/src/features/agent/calendar/calendarTime';
import type { ExecutiveAgentContext, ExecutiveAgentSnapshot, MorningBriefing, MorningBriefingSection } from '@/src/features/agent/types';

function sortTasksByUrgency(tasks: TaskItem[]) {
  const priorityOrder = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  } as const;

  return [...tasks].sort((left, right) => {
    const priorityDelta = priorityOrder[left.priority] - priorityOrder[right.priority];

    if (priorityDelta !== 0) {
      return priorityDelta;
    }

    return Date.parse(left.dueAt ?? '') - Date.parse(right.dueAt ?? '');
  });
}

function sortReminders(reminders: ReminderItem[]) {
  return [...reminders].sort(
    (left, right) => Date.parse(left.scheduledFor) - Date.parse(right.scheduledFor),
  );
}

function formatEventListItem(event: { title: string; startsAt: string; location?: string }) {
  const timeLabel = formatTimeInLocalTimezone(event.startsAt);
  const shortLocation = event.location ? formatLocationShort(event.location) : '';
  const locationSuffix = shortLocation ? ` · ${shortLocation}` : '';

  return `${timeLabel} — ${event.title}${locationSuffix}`;
}

function buildScheduleSection(snapshot: ExecutiveAgentSnapshot): MorningBriefingSection | null {
  if (!snapshot.calendarSummary?.eventsCount && snapshot.upcomingCalendarEvents.length === 0) {
    return null;
  }

  const summary =
    snapshot.calendarSummary?.transitionSummary ??
    (snapshot.calendarSummary
      ? buildCalendarAvailabilitySummary(snapshot.calendarSummary)
      : `You have ${snapshot.upcomingCalendarEvents.length} events today.`);

  const nextEvent = snapshot.calendarSummary?.nextEvent;
  const followingEventId = snapshot.calendarSummary?.followingEvent?.id;
  const items: string[] = [];

  snapshot.upcomingCalendarEvents
    .filter((event) => event.id !== nextEvent?.id && event.id !== followingEventId)
    .slice(0, 2)
    .forEach((event) => {
      items.push(formatEventListItem(event));
    });

  const availability =
    snapshot.calendarSummary?.availabilitySummary ??
    (snapshot.calendarSummary ? buildCalendarAvailabilitySummary(snapshot.calendarSummary) : '');

  if (
    availability &&
    !areCalendarPhrasesEquivalent(availability, summary) &&
    !summary.toLowerCase().includes(availability.toLowerCase().slice(0, 24))
  ) {
    items.push(availability);
  }

  return {
    kind: 'schedule',
    title: 'Schedule',
    summary,
    items: items.slice(0, 2),
    priority:
      snapshot.calendarSummary?.timePressure === 'heavy'
        ? 'attention'
        : snapshot.calendarSummary?.eventsCount && snapshot.calendarSummary.eventsCount >= 5
          ? 'attention'
          : 'info',
  };
}

function buildTaskSection(snapshot: ExecutiveAgentSnapshot): MorningBriefingSection | null {
  if (snapshot.tasks.length === 0) {
    return null;
  }

  const rankedTasks = sortTasksByUrgency(snapshot.tasks).slice(0, 3);

  return {
    kind: 'tasks',
    title: 'Tasks',
    summary:
      rankedTasks[0]?.priority === 'critical'
        ? `${rankedTasks[0].title} is the main priority today.`
        : `${snapshot.tasks.length} open task${snapshot.tasks.length === 1 ? '' : 's'} on the list.`,
    items: rankedTasks.map((task) =>
      `${task.title}${task.dueAt ? ` · due ${new Date(task.dueAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}`,
    ),
    priority: rankedTasks.some((task) => task.priority === 'critical' || task.priority === 'high') ? 'attention' : 'info',
  };
}

function buildReminderSection(snapshot: ExecutiveAgentSnapshot): MorningBriefingSection | null {
  if (snapshot.reminders.length === 0) {
    return null;
  }

  const rankedReminders = sortReminders(snapshot.reminders).slice(0, 3);

  return {
    kind: 'reminders',
    title: 'Reminders',
    summary: `${snapshot.reminders.length} reminder${snapshot.reminders.length === 1 ? '' : 's'} on the clock today.`,
    items: rankedReminders.map((reminder) => {
      return `${reminder.title} · ${new Date(reminder.scheduledFor).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })}`;
    }),
    priority: 'info',
  };
}

function buildEmailSection(snapshot: ExecutiveAgentSnapshot): MorningBriefingSection | null {
  if (!snapshot.emailDigest) {
    return null;
  }

  return {
    kind: 'email',
    title: 'Email',
    summary:
      snapshot.emailDigest.urgentCount > 0
        ? `${snapshot.emailDigest.urgentCount} urgent threads may need a look.`
        : `${snapshot.emailDigest.unreadCount} unread emails in the background.`,
    items: snapshot.emailDigest.topMessages.slice(0, 2).map((message) => message.subject),
    priority: snapshot.emailDigest.urgentCount > 0 ? 'attention' : 'info',
  };
}

function buildTravelSection(snapshot: ExecutiveAgentSnapshot): MorningBriefingSection | null {
  if (!snapshot.routeAwareness) {
    return null;
  }

  return {
    kind: 'travel',
    title: 'Travel',
    summary: snapshot.routeAwareness.summary,
    items: [
      `${snapshot.routeAwareness.destinationLabel} · ${snapshot.routeAwareness.estimatedDurationMinutes} min · ${snapshot.routeAwareness.trafficLevel} traffic`,
    ],
    priority: snapshot.routeAwareness.trafficLevel === 'heavy' ? 'attention' : 'info',
  };
}

function buildFocusSection(
  context: ExecutiveAgentContext,
  snapshot: ExecutiveAgentSnapshot,
): MorningBriefingSection | null {
  const items: string[] = [];

  if (context.preferences.activeProjects.length > 0) {
    items.push(context.preferences.activeProjects.slice(0, 2).join(' · '));
  }

  if (context.shortTermMemory.activeSituations.length > 0) {
    items.push(context.shortTermMemory.activeSituations.slice(0, 2).join(' · '));
  }

  if (items.length === 0) {
    return null;
  }

  return {
    kind: 'focus',
    title: 'Focus',
    summary: 'A little background context for the day.',
    items: items.slice(0, 2),
    priority: context.shortTermMemory.recentEmotionalState === 'overloaded' ? 'attention' : 'info',
  };
}

function buildBriefingHeadline(sections: MorningBriefingSection[]) {
  const schedule = sections.find((section) => section.kind === 'schedule');
  const tasks = sections.find((section) => section.kind === 'tasks');
  const email = sections.find((section) => section.kind === 'email');

  if (schedule?.summary) {
    return schedule.summary;
  }

  if (tasks?.summary) {
    return tasks.summary;
  }

  if (email?.summary) {
    return email.summary;
  }

  return 'Today looks fairly open.';
}

export function buildMorningBriefing(
  context: ExecutiveAgentContext,
  snapshot: ExecutiveAgentSnapshot,
): MorningBriefing {
  const sections = [
    buildScheduleSection(snapshot),
    buildTaskSection(snapshot),
    buildReminderSection(snapshot),
    buildEmailSection(snapshot),
    buildTravelSection(snapshot),
    buildFocusSection(context, snapshot),
  ].filter((section): section is MorningBriefingSection => Boolean(section));

  const headline = buildBriefingHeadline(sections);
  const suggestedActions = [];

  if (snapshot.tasks.some((task) => task.priority === 'critical') && snapshot.reminders.length === 0) {
    suggestedActions.push({
      kind: 'create_reminder' as const,
      title: 'Add a reminder for the sharpest task',
      description: 'Keep the top-priority item from slipping.',
      input: {
        title: snapshot.tasks[0]?.title ?? 'Priority task',
      },
      requiresConfirmation: true,
    });
  }

  if (snapshot.tasks.length === 0 && context.preferences.activeProjects.length > 0) {
    suggestedActions.push({
      kind: 'create_task' as const,
      title: 'Turn an active project into a concrete next step',
      description: 'Capture one next action instead of leaving it abstract.',
      input: {
        title: context.preferences.activeProjects[0],
      },
      requiresConfirmation: true,
    });
  }

  return {
    generatedAt: context.now,
    locale: context.locale,
    opener: '',
    headline,
    sections,
    suggestedActions,
  };
}
