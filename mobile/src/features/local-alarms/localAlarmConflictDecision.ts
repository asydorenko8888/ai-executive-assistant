export type AlarmConflictDecision = 'keep_both' | 'replace';

const YES_PATTERNS = [
  /^(?:yes|yeah|yep|sure|ok|okay)$/iu,
  /^(?:да|ага|угу|конечно|хорошо)$/iu,
  /^(?:так|добре)$/iu,
  /^(?:keep\s+it|keep\s+both|leave\s+it|add\s+another(?:\s+one)?)$/iu,
  /^(?:оставь|оставить|оставьте|сохрани|сохранить|да,\s*оставь)$/iu,
  /^(?:добавь|добавить)\s+ещ[её]\s+один$/iu,
];

const NO_PATTERNS = [
  /^(?:no|nope)$/iu,
  /^(?:нет|неа)$/iu,
  /^(?:ні|не)$/iu,
  /^(?:replace\s+it|remove\s+old\s+one|leave\s+only\s+(?:the\s+)?new\s+one)$/iu,
  /^(?:замени|заменить|удали\s+старый|оставь\s+только\s+новый)$/iu,
];

export function parseAlarmConflictDecision(reply: string): AlarmConflictDecision | null {
  const normalized = reply.trim().replace(/[.!?]+$/g, '');

  if (!normalized) {
    return null;
  }

  if (YES_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return 'keep_both';
  }

  if (NO_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return 'replace';
  }

  return null;
}
