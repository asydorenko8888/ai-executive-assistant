import type { CalendarConnection, CalendarEvent, CalendarSummary } from '@/src/entities/calendar/types';
import type { EmailDigest } from '@/src/entities/email/types';
import type { AssistantNotification } from '@/src/entities/notification/types';
import type { ReminderItem } from '@/src/entities/reminder/types';
import type { RouteAwareness, TravelMode } from '@/src/entities/route/types';
import type { TaskItem } from '@/src/entities/task/types';
import type { ChatMessage } from '@/src/entities/chat/types';
import type { LongTermMemory, ShortTermMemory } from '@/src/features/chat/memory/types';

export type AgentIntegrationAvailability = 'available' | 'not_connected' | 'coming_soon';

export type ExecutiveUserPreferences = {
  localePreference?: 'uk' | 'ru' | 'en';
  morningBriefingTime: string;
  defaultReminderLeadMinutes: number;
  preferredTravelMode: TravelMode;
  prefersConciseBriefings: boolean;
  quietHours?: {
    startsAt: string;
    endsAt: string;
  };
  briefingFocus: ('calendar' | 'email' | 'tasks' | 'reminders' | 'travel')[];
  workingStyleNotes: string[];
};

export type ResolvedExecutiveUserPreferences = ExecutiveUserPreferences & {
  derivedCommunicationStyle?: string;
  derivedWorkPattern?: string;
  activeProjects: string[];
  importantPeople: string[];
};

export type AgentCapabilitySnapshot = {
  calendar: AgentIntegrationAvailability;
  email: AgentIntegrationAvailability;
  tasks: AgentIntegrationAvailability;
  reminders: AgentIntegrationAvailability;
  route: AgentIntegrationAvailability;
  briefings: AgentIntegrationAvailability;
};

export type ExecutiveAgentContext = {
  locale: string;
  now: string;
  preferences: ResolvedExecutiveUserPreferences;
  chatMessages: ChatMessage[];
  shortTermMemory: ShortTermMemory;
  longTermMemories: LongTermMemory[];
};

export type ExecutiveAgentWorkspace = {
  tasks: TaskItem[];
  reminders: ReminderItem[];
  actionHistory: AgentActionRecord[];
};

export type ExecutiveAgentSnapshot = {
  calendarConnection?: CalendarConnection;
  calendarSummary?: CalendarSummary;
  upcomingCalendarEvents: CalendarEvent[];
  emailDigest?: EmailDigest;
  tasks: TaskItem[];
  reminders: ReminderItem[];
  routeAwareness?: RouteAwareness;
  notifications: AssistantNotification[];
  capabilities: AgentCapabilitySnapshot;
};

export type MorningBriefingSectionKind =
  | 'schedule'
  | 'email'
  | 'tasks'
  | 'reminders'
  | 'travel'
  | 'focus';

export type MorningBriefingSectionPriority = 'info' | 'attention' | 'critical';

export type MorningBriefingSection = {
  kind: MorningBriefingSectionKind;
  title: string;
  summary: string;
  items: string[];
  priority: MorningBriefingSectionPriority;
};

export type AgentActionKind =
  | 'create_reminder'
  | 'complete_reminder'
  | 'create_task'
  | 'complete_task'
  | 'generate_morning_briefing'
  | 'open_calendar'
  | 'open_email'
  | 'check_route';

export type AgentActionSuggestion = {
  kind: AgentActionKind;
  title: string;
  description: string;
  input: Record<string, unknown>;
  requiresConfirmation: boolean;
};

export type MorningBriefing = {
  generatedAt: string;
  locale: string;
  opener: string;
  headline: string;
  sections: MorningBriefingSection[];
  suggestedActions: AgentActionSuggestion[];
};

export type AgentActionStatus =
  | 'pending_confirmation'
  | 'approved'
  | 'executing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type AgentActionRecord = {
  id: string;
  kind: AgentActionKind;
  title: string;
  description: string;
  input: Record<string, unknown>;
  status: AgentActionStatus;
  requiresConfirmation: boolean;
  createdAt: string;
  updatedAt: string;
  resultSummary?: string;
  errorMessage?: string;
};

export type AgentToolName =
  | 'morning_briefing'
  | 'calendar_awareness'
  | 'email_awareness'
  | 'task_tracking'
  | 'reminder_management'
  | 'route_awareness'
  | 'planning_support';

export type AgentToolStatus = 'success' | 'unavailable' | 'empty';

export type AgentToolResult<TPayload> = {
  toolName: AgentToolName;
  status: AgentToolStatus;
  summary: string;
  payload: TPayload;
  generatedAt: string;
};
