import type { ReminderItem } from '@/src/entities/reminder/types';
import type { TaskItem } from '@/src/entities/task/types';
import {
  appendAgentActionRecord,
  loadAgentReminders,
  loadAgentTasks,
  saveAgentReminders,
  saveAgentTasks,
} from '@/src/features/agent/storage/agentWorkspaceStorage';
import type { AgentActionRecord } from '@/src/features/agent/types';

function createTimestamp() {
  return new Date().toISOString();
}

function createTaskFromAction(action: AgentActionRecord): TaskItem {
  return {
    id: `task-${Date.now()}`,
    title: String(action.input.title ?? action.title),
    description: typeof action.input.description === 'string' ? action.input.description : action.description,
    dueAt: typeof action.input.dueAt === 'string' ? action.input.dueAt : undefined,
    priority:
      action.input.priority === 'critical' ||
      action.input.priority === 'high' ||
      action.input.priority === 'medium' ||
      action.input.priority === 'low'
        ? action.input.priority
        : 'medium',
    status: 'todo',
  };
}

function createReminderFromAction(action: AgentActionRecord): ReminderItem {
  const now = createTimestamp();
  const scheduledFor =
    typeof action.input.scheduledFor === 'string'
      ? action.input.scheduledFor
      : new Date(Date.now() + 60 * 60 * 1000).toISOString();

  return {
    id: `reminder-${Date.now()}`,
    title: String(action.input.title ?? action.title),
    notes: typeof action.input.notes === 'string' ? action.input.notes : undefined,
    scheduledFor,
    leadTimeMinutes:
      typeof action.input.leadTimeMinutes === 'number' ? action.input.leadTimeMinutes : 15,
    channel:
      action.input.channel === 'push' || action.input.channel === 'email' || action.input.channel === 'in_app'
        ? action.input.channel
        : 'in_app',
    recurrence:
      action.input.recurrence === 'daily' ||
      action.input.recurrence === 'weekdays' ||
      action.input.recurrence === 'weekly' ||
      action.input.recurrence === 'monthly'
        ? action.input.recurrence
        : 'none',
    status: 'scheduled',
    relatedTaskId: typeof action.input.relatedTaskId === 'string' ? action.input.relatedTaskId : undefined,
    createdAt: now,
    updatedAt: now,
  };
}

async function persistActionRecord(action: AgentActionRecord) {
  await appendAgentActionRecord(action);
  return action;
}

export async function approveAgentAction(action: AgentActionRecord) {
  const approvedAction = {
    ...action,
    status: 'approved' as const,
    updatedAt: createTimestamp(),
  };

  return persistActionRecord(approvedAction);
}

export async function executeAgentAction(action: AgentActionRecord) {
  if (action.requiresConfirmation && action.status !== 'approved') {
    const rejectedAction = {
      ...action,
      status: 'failed' as const,
      updatedAt: createTimestamp(),
      errorMessage: 'This action requires explicit user approval before execution.',
    };

    await persistActionRecord(rejectedAction);
    return rejectedAction;
  }

  const executingAction = {
    ...action,
    status: 'executing' as const,
    updatedAt: createTimestamp(),
  };
  await persistActionRecord(executingAction);

  try {
    if (executingAction.kind === 'create_task') {
      const tasks = await loadAgentTasks();
      const createdTask = createTaskFromAction(executingAction);
      await saveAgentTasks([createdTask, ...tasks]);

      return persistActionRecord({
        ...executingAction,
        status: 'completed',
        updatedAt: createTimestamp(),
        resultSummary: `Task created: ${createdTask.title}`,
      });
    }

    if (executingAction.kind === 'create_reminder') {
      const reminders = await loadAgentReminders();
      const createdReminder = createReminderFromAction(executingAction);
      await saveAgentReminders([createdReminder, ...reminders]);

      return persistActionRecord({
        ...executingAction,
        status: 'completed',
        updatedAt: createTimestamp(),
        resultSummary: `Reminder scheduled: ${createdReminder.title}`,
      });
    }

    if (executingAction.kind === 'complete_reminder') {
      const reminders = await loadAgentReminders();
      const reminderId = String(executingAction.input.reminderId ?? '');
      const matchedReminder = reminders.find((reminder) => reminder.id === reminderId);

      if (!matchedReminder) {
        throw new Error('Reminder not found.');
      }

      await saveAgentReminders(
        reminders.map((reminder) =>
          reminder.id === reminderId
            ? {
                ...reminder,
                status: 'completed',
                updatedAt: createTimestamp(),
              }
            : reminder,
        ),
      );

      return persistActionRecord({
        ...executingAction,
        status: 'completed',
        updatedAt: createTimestamp(),
        resultSummary: `Reminder completed: ${matchedReminder.title}`,
      });
    }

    if (executingAction.kind === 'complete_task') {
      const tasks = await loadAgentTasks();
      const taskId = String(executingAction.input.taskId ?? '');
      const matchedTask = tasks.find((task) => task.id === taskId);

      if (!matchedTask) {
        throw new Error('Task not found.');
      }

      await saveAgentTasks(
        tasks.map((task) =>
          task.id === taskId
            ? {
                ...task,
                status: 'done',
              }
            : task,
        ),
      );

      return persistActionRecord({
        ...executingAction,
        status: 'completed',
        updatedAt: createTimestamp(),
        resultSummary: `Task completed: ${matchedTask.title}`,
      });
    }

    return persistActionRecord({
      ...executingAction,
      status: 'completed',
      updatedAt: createTimestamp(),
      resultSummary: 'Action framework is ready, but this action is still a controlled no-op in the current foundation.',
    });
  } catch (error) {
    return persistActionRecord({
      ...executingAction,
      status: 'failed',
      updatedAt: createTimestamp(),
      errorMessage: error instanceof Error ? error.message : 'Unable to execute action.',
    });
  }
}
