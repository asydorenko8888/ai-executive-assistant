import { devConsoleLog } from '@/src/shared/logging/devConsoleLog';

export type CalendarMoveWorkflowStep =
  | 'MOVE_START'
  | 'MOVE_TARGET_RESOLVED'
  | 'MOVE_NEW_TIME_PARSED'
  | 'MOVE_EVENT_SELECTED'
  | 'EVENT_FOUND'
  | 'EVENT_ID'
  | 'OLD_START'
  | 'OLD_END'
  | 'MOVE_PATCH_ATTEMPT'
  | 'MOVE_PATCH_SENT'
  | 'MOVE_PATCH_RESULT'
  | 'GOOGLE_UPDATE_START'
  | 'GOOGLE_UPDATE_SUCCESS'
  | 'MOVE_VERIFY_RESULT'
  | 'MOVE_VERIFY_SUCCESS'
  | 'MOVE_VERIFY_FAILED'
  | 'MOVE_FAILED'
  | 'MOVE_EXCEPTION'
  | 'CALENDAR_REFRESH_START'
  | 'CALENDAR_REFRESH_SUCCESS'
  | 'MOVE_STATE_CLEARED'
  | 'MOVE_COMPLETE';

export function logCalendarMoveWorkflow(
  step: CalendarMoveWorkflowStep,
  details?: Record<string, unknown>,
) {
  const payload = {
    at: new Date().toISOString(),
    ...details,
  };

  devConsoleLog(`CALENDAR_MOVE_WORKFLOW_${step}`, payload);
}

export function logCalendarMoveTargetEvent(params: {
  eventId: string;
  title: string;
  startsAt: string;
  endsAt: string;
}) {
  logCalendarMoveWorkflow('EVENT_FOUND', { title: params.title });
  logCalendarMoveWorkflow('EVENT_ID', { eventId: params.eventId });
  logCalendarMoveWorkflow('OLD_START', { startsAt: params.startsAt });
  logCalendarMoveWorkflow('OLD_END', { endsAt: params.endsAt });
}
