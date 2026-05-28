import type { ChatMessage } from '@/src/entities/chat/types';
import { loadLongTermMemories } from '@/src/features/chat/memory';
import { buildShortTermMemory } from '@/src/features/chat/memory/shortTermMemory';
import {
  createDefaultExecutiveIntegrations,
  getExecutiveAgentCapabilities,
  type ExecutiveAgentIntegrations,
} from '@/src/features/agent/integrations';
import { buildMorningBriefing } from '@/src/features/agent/morningBriefingPipeline';
import { createExecutiveAgentTools } from '@/src/features/agent/tools';
import type {
  AgentCapabilitySnapshot,
  ExecutiveAgentContext,
  ExecutiveAgentSnapshot,
  MorningBriefing,
  ResolvedExecutiveUserPreferences,
} from '@/src/features/agent/types';
import { areCalendarPhrasesEquivalent } from '@/src/features/agent/calendar/calendarNaturalLanguage';
import { loadResolvedExecutiveUserPreferences } from '@/src/features/agent/userPreferences';

type CreateExecutiveAgentOrchestratorOptions = {
  locale: string;
  chatMessages: ChatMessage[];
  integrations?: ExecutiveAgentIntegrations;
};

export type ExecutiveAgentOrchestrator = {
  context: ExecutiveAgentContext;
  snapshot: ExecutiveAgentSnapshot;
  capabilities: AgentCapabilitySnapshot;
  createMorningBriefing: () => MorningBriefing;
  tools: ReturnType<typeof createExecutiveAgentTools>;
};

async function buildExecutiveAgentContext({
  locale,
  chatMessages,
}: {
  locale: string;
  chatMessages: ChatMessage[];
}) {
  const longTermMemories = await loadLongTermMemories();
  const preferences = await loadResolvedExecutiveUserPreferences(longTermMemories);

  return {
    locale,
    now: new Date().toISOString(),
    preferences,
    chatMessages,
    shortTermMemory: buildShortTermMemory(chatMessages),
    longTermMemories,
  } satisfies ExecutiveAgentContext;
}

async function buildExecutiveAgentSnapshot(
  integrations: ExecutiveAgentIntegrations,
  context: ExecutiveAgentContext,
  capabilities: AgentCapabilitySnapshot,
) {
  const [calendar, email, tasks, reminders, route, notifications] = await Promise.all([
    integrations.calendar.getMorningContext(context.now),
    integrations.email.getMorningContext(context.now),
    integrations.tasks.getOpenTasks(),
    integrations.reminders.getUpcomingReminders(),
    integrations.route.getRouteAwareness(context.now),
    integrations.notifications.getLatestNotifications(),
  ]);

  return {
    calendarConnection: calendar.connection,
    calendarSummary: calendar.summary,
    upcomingCalendarEvents: calendar.upcomingEvents,
    emailDigest: email.digest,
    tasks: tasks.tasks,
    reminders: reminders.reminders,
    routeAwareness: route.routeAwareness,
    notifications: notifications.notifications,
    capabilities,
  } satisfies ExecutiveAgentSnapshot;
}

export async function createExecutiveAgentOrchestrator({
  locale,
  chatMessages,
  integrations = createDefaultExecutiveIntegrations(),
}: CreateExecutiveAgentOrchestratorOptions): Promise<ExecutiveAgentOrchestrator> {
  const context = await buildExecutiveAgentContext({
    locale,
    chatMessages,
  });
  const capabilities = await getExecutiveAgentCapabilities(integrations);
  const snapshot = await buildExecutiveAgentSnapshot(integrations, context, capabilities);
  const tools = createExecutiveAgentTools();

  return {
    context,
    snapshot,
    capabilities,
    createMorningBriefing: () => buildMorningBriefing(context, snapshot),
    tools,
  };
}

export function buildAgentPreferenceContext(preferences: ResolvedExecutiveUserPreferences) {
  const segments: string[] = [];

  segments.push(`Morning briefing time: ${preferences.morningBriefingTime}.`);
  segments.push(`Preferred travel mode: ${preferences.preferredTravelMode}.`);

  if (preferences.derivedCommunicationStyle) {
    segments.push(`Communication style in memory: ${preferences.derivedCommunicationStyle}.`);
  }

  if (preferences.derivedWorkPattern) {
    segments.push(`Work rhythm signal: ${preferences.derivedWorkPattern}.`);
  }

  if (preferences.activeProjects.length > 0) {
    segments.push(`Active projects: ${preferences.activeProjects.join('; ')}.`);
  }

  return segments.join(' ');
}

export function buildAgentCalendarContext(snapshot: ExecutiveAgentSnapshot) {
  if (!snapshot.calendarConnection || snapshot.calendarConnection.status !== 'connected' || !snapshot.calendarSummary) {
    return '';
  }

  const segments: string[] = [];

  segments.push(snapshot.calendarSummary.transitionSummary);

  const availability = snapshot.calendarSummary.availabilitySummary;

  if (
    availability &&
    !areCalendarPhrasesEquivalent(availability, snapshot.calendarSummary.transitionSummary)
  ) {
    segments.push(availability);
  }

  return segments.join(' ');
}

export function buildAgentRuntimeContext(orchestrator: ExecutiveAgentOrchestrator) {
  return [buildAgentPreferenceContext(orchestrator.context.preferences), buildAgentCalendarContext(orchestrator.snapshot)]
    .filter(Boolean)
    .join(' ');
}
