export type TaskPriority = 'low' | 'medium' | 'high' | 'critical';
export type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'done' | 'archived';

export type TaskItem = {
  id: string;
  title: string;
  description?: string;
  dueAt?: string;
  priority: TaskPriority;
  status: TaskStatus;
};
