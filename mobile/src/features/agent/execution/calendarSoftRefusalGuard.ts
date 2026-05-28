const SOFT_CALENDAR_REFUSAL_PATTERNS = [
  /не\s+могу\s+внести/i,
  /не\s+могу\s+(?:добавить|создать|записать)/i,
  /могу\s+подготовить/i,
  /подготовить\s+задачу/i,
  /когда\s+будет\s+возможность/i,
  /can't\s+create\s+right\s+now/i,
  /cannot\s+create\s+right\s+now/i,
  /can(?:not|'t)\s+add\s+(?:this|it)\s+right\s+now/i,
  /when\s+(?:it(?:'s| is)\s+)?possible/i,
  /prepare\s+(?:the\s+)?task/i,
];

export function isSoftCalendarRefusalReply(text: string) {
  const normalized = text.trim();

  if (!normalized) {
    return false;
  }

  return SOFT_CALENDAR_REFUSAL_PATTERNS.some((pattern) => pattern.test(normalized));
}
