import { buildMorningBriefing } from '@/src/features/agent/morningBriefingPipeline';
import type {
  AgentToolResult,
  ExecutiveAgentContext,
  ExecutiveAgentSnapshot,
  MorningBriefing,
} from '@/src/features/agent/types';

export type ExecutiveAgentTool<TPayload> = {
  name:
    | 'morning_briefing'
    | 'calendar_awareness'
    | 'email_awareness'
    | 'task_tracking'
    | 'reminder_management'
    | 'route_awareness'
    | 'planning_support';
  run: (
    context: ExecutiveAgentContext,
    snapshot: ExecutiveAgentSnapshot,
  ) => Promise<AgentToolResult<TPayload>>;
};

function createToolResult<TPayload>(
  toolName: AgentToolResult<TPayload>['toolName'],
  status: AgentToolResult<TPayload>['status'],
  summary: string,
  payload: TPayload,
): AgentToolResult<TPayload> {
  return {
    toolName,
    status,
    summary,
    payload,
    generatedAt: new Date().toISOString(),
  };
}

export function createExecutiveAgentTools() {
  const morningBriefingTool: ExecutiveAgentTool<MorningBriefing> = {
    name: 'morning_briefing',
    async run(context, snapshot) {
      const briefing = buildMorningBriefing(context, snapshot);

      return createToolResult(
        'morning_briefing',
        'success',
        briefing.headline,
        briefing,
      );
    },
  };

  const calendarAwarenessTool: ExecutiveAgentTool<ExecutiveAgentSnapshot['calendarSummary']> = {
    name: 'calendar_awareness',
    async run(_context, snapshot) {
      if (!snapshot.calendarSummary) {
        return createToolResult(
          'calendar_awareness',
          'unavailable',
          'Calendar is not connected yet.',
          undefined,
        );
      }

      return createToolResult(
        'calendar_awareness',
        'success',
        snapshot.calendarSummary.nextEvent
          ? `Next event: ${snapshot.calendarSummary.nextEvent.title}.`
          : `You have ${snapshot.calendarSummary.eventsCount} events today.`,
        snapshot.calendarSummary,
      );
    },
  };

  const emailAwarenessTool: ExecutiveAgentTool<ExecutiveAgentSnapshot['emailDigest']> = {
    name: 'email_awareness',
    async run(_context, snapshot) {
      if (!snapshot.emailDigest) {
        return createToolResult(
          'email_awareness',
          'unavailable',
          'Email integration is not connected yet.',
          undefined,
        );
      }

      return createToolResult(
        'email_awareness',
        'success',
        snapshot.emailDigest.urgentCount > 0
          ? `${snapshot.emailDigest.urgentCount} urgent email threads are waiting.`
          : `${snapshot.emailDigest.unreadCount} unread emails are in the background.`,
        snapshot.emailDigest,
      );
    },
  };

  const taskTrackingTool: ExecutiveAgentTool<ExecutiveAgentSnapshot['tasks']> = {
    name: 'task_tracking',
    async run(_context, snapshot) {
      return createToolResult(
        'task_tracking',
        snapshot.tasks.length > 0 ? 'success' : 'empty',
        snapshot.tasks.length > 0 ? `${snapshot.tasks.length} open tasks tracked locally.` : 'No tracked tasks yet.',
        snapshot.tasks,
      );
    },
  };

  const reminderManagementTool: ExecutiveAgentTool<ExecutiveAgentSnapshot['reminders']> = {
    name: 'reminder_management',
    async run(_context, snapshot) {
      return createToolResult(
        'reminder_management',
        snapshot.reminders.length > 0 ? 'success' : 'empty',
        snapshot.reminders.length > 0
          ? `${snapshot.reminders.length} reminders are already scheduled.`
          : 'No reminders are scheduled yet.',
        snapshot.reminders,
      );
    },
  };

  const routeAwarenessTool: ExecutiveAgentTool<ExecutiveAgentSnapshot['routeAwareness']> = {
    name: 'route_awareness',
    async run(_context, snapshot) {
      if (!snapshot.routeAwareness) {
        return createToolResult(
          'route_awareness',
          'unavailable',
          'Route awareness is not connected yet.',
          undefined,
        );
      }

      return createToolResult(
        'route_awareness',
        'success',
        snapshot.routeAwareness.summary,
        snapshot.routeAwareness,
      );
    },
  };

  const planningSupportTool: ExecutiveAgentTool<Pick<ExecutiveAgentContext, 'shortTermMemory' | 'preferences'>> = {
    name: 'planning_support',
    async run(context) {
      return createToolResult(
        'planning_support',
        'success',
        'Planning context is ready for lightweight prioritization.',
        {
          shortTermMemory: context.shortTermMemory,
          preferences: context.preferences,
        },
      );
    },
  };

  return {
    morningBriefingTool,
    calendarAwarenessTool,
    emailAwarenessTool,
    taskTrackingTool,
    reminderManagementTool,
    routeAwarenessTool,
    planningSupportTool,
  };
}
