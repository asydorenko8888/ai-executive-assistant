import type { ReminderItem } from '@/src/entities/reminder/types';
import type { TaskItem } from '@/src/entities/task/types';
import type { AgentActionRecord, ExecutiveAgentWorkspace } from '@/src/features/agent/types';
import { getStoredJson, setStoredJson } from '@/src/shared/storage';

const AGENT_WORKSPACE_STORAGE_KEY = 'executive-ai.agent-workspace.v1';

function isTaskItem(value: unknown): value is TaskItem {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<TaskItem>;

  return (
    typeof candidate.id === 'string' &&
    typeof candidate.title === 'string' &&
    typeof candidate.priority === 'string' &&
    typeof candidate.status === 'string'
  );
}

function isReminderItem(value: unknown): value is ReminderItem {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<ReminderItem>;

  return (
    typeof candidate.id === 'string' &&
    typeof candidate.title === 'string' &&
    typeof candidate.scheduledFor === 'string' &&
    typeof candidate.leadTimeMinutes === 'number' &&
    typeof candidate.channel === 'string' &&
    typeof candidate.recurrence === 'string' &&
    typeof candidate.status === 'string' &&
    typeof candidate.createdAt === 'string' &&
    typeof candidate.updatedAt === 'string'
  );
}

function isAgentActionRecord(value: unknown): value is AgentActionRecord {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<AgentActionRecord>;

  return (
    typeof candidate.id === 'string' &&
    typeof candidate.kind === 'string' &&
    typeof candidate.title === 'string' &&
    typeof candidate.description === 'string' &&
    typeof candidate.input === 'object' &&
    typeof candidate.status === 'string' &&
    typeof candidate.requiresConfirmation === 'boolean' &&
    typeof candidate.createdAt === 'string' &&
    typeof candidate.updatedAt === 'string'
  );
}

function isWorkspaceSnapshot(value: unknown): value is ExecutiveAgentWorkspace {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<ExecutiveAgentWorkspace>;

  return (
    Array.isArray(candidate.tasks) &&
    candidate.tasks.every(isTaskItem) &&
    Array.isArray(candidate.reminders) &&
    candidate.reminders.every(isReminderItem) &&
    Array.isArray(candidate.actionHistory) &&
    candidate.actionHistory.every(isAgentActionRecord)
  );
}

function sortActionHistory(actionHistory: AgentActionRecord[]) {
  return [...actionHistory].sort(
    (left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
  );
}

export async function loadAgentWorkspace(): Promise<ExecutiveAgentWorkspace> {
  const snapshot = await getStoredJson<ExecutiveAgentWorkspace | null>(AGENT_WORKSPACE_STORAGE_KEY, {
    tasks: [],
    reminders: [],
    actionHistory: [],
  });

  if (!isWorkspaceSnapshot(snapshot)) {
    return {
      tasks: [],
      reminders: [],
      actionHistory: [],
    };
  }

  return {
    tasks: snapshot.tasks,
    reminders: snapshot.reminders,
    actionHistory: sortActionHistory(snapshot.actionHistory),
  };
}

export async function saveAgentWorkspace(workspace: ExecutiveAgentWorkspace) {
  return setStoredJson<ExecutiveAgentWorkspace>(AGENT_WORKSPACE_STORAGE_KEY, {
    tasks: workspace.tasks,
    reminders: workspace.reminders,
    actionHistory: sortActionHistory(workspace.actionHistory).slice(0, 100),
  });
}

export async function loadAgentTasks() {
  return (await loadAgentWorkspace()).tasks;
}

export async function saveAgentTasks(tasks: TaskItem[]) {
  const workspace = await loadAgentWorkspace();
  return saveAgentWorkspace({
    ...workspace,
    tasks,
  });
}

export async function loadAgentReminders() {
  return (await loadAgentWorkspace()).reminders;
}

export async function saveAgentReminders(reminders: ReminderItem[]) {
  const workspace = await loadAgentWorkspace();
  return saveAgentWorkspace({
    ...workspace,
    reminders,
  });
}

export async function appendAgentActionRecord(record: AgentActionRecord) {
  const workspace = await loadAgentWorkspace();
  const nextActionHistory = [record, ...workspace.actionHistory.filter((action) => action.id !== record.id)];

  await saveAgentWorkspace({
    ...workspace,
    actionHistory: nextActionHistory,
  });

  return nextActionHistory;
}
