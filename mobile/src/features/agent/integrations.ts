import type { CalendarConnection, CalendarEvent, CalendarSummary } from '@/src/entities/calendar/types';
import type { EmailDigest } from '@/src/entities/email/types';
import type { AssistantNotification } from '@/src/entities/notification/types';
import type { ReminderItem } from '@/src/entities/reminder/types';
import type { RouteAwareness } from '@/src/entities/route/types';
import type { TaskItem } from '@/src/entities/task/types';
import { getGoogleCalendarMorningContext } from '@/src/features/agent/calendar/googleCalendarService';
import type { AgentCapabilitySnapshot, AgentIntegrationAvailability } from '@/src/features/agent/types';
import { loadAgentReminders, loadAgentTasks } from '@/src/features/agent/storage/agentWorkspaceStorage';

export type CalendarIntegrationSnapshot = {
  availability: AgentIntegrationAvailability;
  connection: CalendarConnection;
  summary?: CalendarSummary;
  upcomingEvents: CalendarEvent[];
};

export type EmailIntegrationSnapshot = {
  availability: AgentIntegrationAvailability;
  digest?: EmailDigest;
};

export type TaskIntegrationSnapshot = {
  availability: AgentIntegrationAvailability;
  tasks: TaskItem[];
};

export type ReminderIntegrationSnapshot = {
  availability: AgentIntegrationAvailability;
  reminders: ReminderItem[];
};

export type RouteIntegrationSnapshot = {
  availability: AgentIntegrationAvailability;
  routeAwareness?: RouteAwareness;
};

export type NotificationIntegrationSnapshot = {
  availability: AgentIntegrationAvailability;
  notifications: AssistantNotification[];
};

export type CalendarIntegration = {
  getMorningContext: (referenceDate: string) => Promise<CalendarIntegrationSnapshot>;
};

export type EmailIntegration = {
  getMorningContext: (referenceDate: string) => Promise<EmailIntegrationSnapshot>;
};

export type TaskIntegration = {
  getOpenTasks: () => Promise<TaskIntegrationSnapshot>;
};

export type ReminderIntegration = {
  getUpcomingReminders: () => Promise<ReminderIntegrationSnapshot>;
};

export type RouteIntegration = {
  getRouteAwareness: (referenceDate: string) => Promise<RouteIntegrationSnapshot>;
};

export type NotificationIntegration = {
  getLatestNotifications: () => Promise<NotificationIntegrationSnapshot>;
};

export type ExecutiveAgentIntegrations = {
  calendar: CalendarIntegration;
  email: EmailIntegration;
  tasks: TaskIntegration;
  reminders: ReminderIntegration;
  route: RouteIntegration;
  notifications: NotificationIntegration;
};

function googleCalendarIntegration(): CalendarIntegration {
  return {
    async getMorningContext(referenceDate: string) {
      try {
        return await getGoogleCalendarMorningContext(referenceDate);
      } catch (error) {
        console.log('[Calendar Audit] googleCalendarIntegration.getMorningContext — failed', {
          message: error instanceof Error ? error.message : String(error),
        });
        return {
          availability: 'not_connected',
          connection: {
            provider: 'google',
            status: 'not_connected',
          },
          upcomingEvents: [],
        };
      }
    },
  };
}

function unavailableEmailIntegration(): EmailIntegration {
  return {
    async getMorningContext() {
      return {
        availability: 'not_connected',
      };
    },
  };
}

function localTaskIntegration(): TaskIntegration {
  return {
    async getOpenTasks() {
      const tasks = await loadAgentTasks();

      return {
        availability: 'available',
        tasks: tasks.filter((task) => task.status !== 'done' && task.status !== 'archived'),
      };
    },
  };
}

function localReminderIntegration(): ReminderIntegration {
  return {
    async getUpcomingReminders() {
      const reminders = await loadAgentReminders();

      return {
        availability: 'available',
        reminders: reminders.filter((reminder) => reminder.status === 'scheduled' || reminder.status === 'snoozed'),
      };
    },
  };
}

function unavailableRouteIntegration(): RouteIntegration {
  return {
    async getRouteAwareness() {
      return {
        availability: 'coming_soon',
      };
    },
  };
}

function localNotificationIntegration(): NotificationIntegration {
  return {
    async getLatestNotifications() {
      return {
        availability: 'coming_soon',
        notifications: [],
      };
    },
  };
}

export function createDefaultExecutiveIntegrations(): ExecutiveAgentIntegrations {
  return {
    calendar: googleCalendarIntegration(),
    email: unavailableEmailIntegration(),
    tasks: localTaskIntegration(),
    reminders: localReminderIntegration(),
    route: unavailableRouteIntegration(),
    notifications: localNotificationIntegration(),
  };
}

export async function getExecutiveAgentCapabilities(
  integrations: ExecutiveAgentIntegrations,
): Promise<AgentCapabilitySnapshot> {
  const [calendar, email, tasks, reminders, route] = await Promise.all([
    integrations.calendar.getMorningContext(new Date().toISOString()),
    integrations.email.getMorningContext(new Date().toISOString()),
    integrations.tasks.getOpenTasks(),
    integrations.reminders.getUpcomingReminders(),
    integrations.route.getRouteAwareness(new Date().toISOString()),
  ]);

  return {
    calendar: calendar.availability,
    email: email.availability,
    tasks: tasks.availability,
    reminders: reminders.availability,
    route: route.availability,
    briefings: 'available',
  };
}
