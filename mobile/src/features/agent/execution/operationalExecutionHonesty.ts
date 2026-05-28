import type { ActionExecutionStatus } from '@/src/features/agent/execution/actionExecutionTypes';

/** Past-tense success claims without verified execution — must never appear in operational replies. */
const FAKE_OPERATIONAL_SUCCESS_RU =
  /\b(?:записал|записала|добавил|добавила|отправил|отправила|создал|создала|перенёс|перенес|поставил|поставила|зафиксировал|зафиксировала)\b/i;

const FAKE_OPERATIONAL_SUCCESS_EN =
  /\b(?:i(?:'ve| have)?\s+(?:added|created|sent|scheduled|booked|moved|rescheduled|placed))\b/i;

const FAKE_OPERATIONAL_SUCCESS_UK =
  /\b(?:записав|додав|додала|надіслав|надіслала|створив|створила|переніс|перенесла)\b/i;

export function containsFakeOperationalSuccessClaim(text: string) {
  return (
    FAKE_OPERATIONAL_SUCCESS_RU.test(text) ||
    FAKE_OPERATIONAL_SUCCESS_EN.test(text) ||
    FAKE_OPERATIONAL_SUCCESS_UK.test(text)
  );
}

export function assertNoFakeOperationalSuccess(text: string, status: ActionExecutionStatus) {
  if (status !== 'success' && containsFakeOperationalSuccessClaim(text)) {
    console.error('[ActionExecution] Fake operational success wording blocked', {
      status,
      preview: text.slice(0, 160),
    });
    throw new Error('Operational reply contains unverified success claim.');
  }
}

export const OPERATIONAL_EXECUTION_SYSTEM_RULES = [
  'OPERATIONAL EXECUTION MODE: Never claim an action succeeded unless a tool returned verified success this turn.',
  'Forbidden without verified API success: "Записал", "Добавил", "Отправил", "Создал", "I added", "I scheduled", "I sent".',
  'Calendar writes: never refuse or draft-only — tool layer handles create. For SMS/call only: draft is ok if channel not wired.',
  'No emotional padding, improvisation, or roleplayed tool execution in operational mode.',
  'Report ACTION STATUS honestly: pending, executing, success, or failed.',
].join(' ');
