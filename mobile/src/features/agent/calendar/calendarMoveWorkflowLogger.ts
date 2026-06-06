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

const MOVE_ERROR_STEPS = new Set<CalendarMoveWorkflowStep>([
  'MOVE_START',
  'MOVE_TARGET_RESOLVED',
  'MOVE_NEW_TIME_PARSED',
  'MOVE_PATCH_ATTEMPT',
  'MOVE_PATCH_RESULT',
  'MOVE_VERIFY_RESULT',
  'MOVE_EXCEPTION',
  'MOVE_FAILED',
  'MOVE_VERIFY_FAILED',
  'MOVE_STATE_CLEARED',
]);

export function logCalendarMoveWorkflow(
  step: CalendarMoveWorkflowStep,
  details?: Record<string, unknown>,
) {
  const payload = {
    at: new Date().toISOString(),
    ...details,
  };

  if (MOVE_ERROR_STEPS.has(step)) {
    console.error(`[Calendar Move Workflow] ${step}`, payload);
    return;
  }

  console.log(`[Calendar Move Workflow] ${step}`, payload);
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
