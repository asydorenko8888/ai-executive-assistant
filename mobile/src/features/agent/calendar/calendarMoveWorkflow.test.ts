import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { logCalendarMoveWorkflow } from '@/src/features/agent/calendar/calendarMoveWorkflowLogger';

describe('calendarMoveWorkflow', () => {
  it('logs every move workflow step label', () => {
    const steps: string[] = [];
    const originalLog = console.log;

    console.log = (...args: unknown[]) => {
      const first = args[0];

      if (typeof first === 'string' && first.startsWith('CALENDAR_MOVE_WORKFLOW_')) {
        steps.push(first.replace('CALENDAR_MOVE_WORKFLOW_', '').trim());
      }
    };

    try {
      logCalendarMoveWorkflow('MOVE_START', { transcript: 'move massage later' });
      logCalendarMoveWorkflow('EVENT_FOUND', { title: 'Massage' });
      logCalendarMoveWorkflow('EVENT_ID', { eventId: 'evt-1' });
      logCalendarMoveWorkflow('OLD_START', { startsAt: '2026-05-28T16:00:00-05:00' });
      logCalendarMoveWorkflow('OLD_END', { endsAt: '2026-05-28T17:00:00-05:00' });
      logCalendarMoveWorkflow('MOVE_EVENT_SELECTED', { eventId: 'evt-1' });
      logCalendarMoveWorkflow('MOVE_PATCH_SENT', { eventId: 'evt-1' });
      logCalendarMoveWorkflow('GOOGLE_UPDATE_START', { eventId: 'evt-1' });
      logCalendarMoveWorkflow('MOVE_VERIFY_SUCCESS', { eventId: 'evt-1' });
      logCalendarMoveWorkflow('MOVE_STATE_CLEARED', { reason: 'update_completed' });
      logCalendarMoveWorkflow('GOOGLE_UPDATE_SUCCESS', { eventId: 'evt-1' });
      logCalendarMoveWorkflow('CALENDAR_REFRESH_START', { eventId: 'evt-1' });
      logCalendarMoveWorkflow('CALENDAR_REFRESH_SUCCESS', { eventId: 'evt-1' });
      logCalendarMoveWorkflow('MOVE_COMPLETE', { success: true });
    } finally {
      console.log = originalLog;
    }

    assert.deepEqual(steps, [
      'MOVE_START',
      'EVENT_FOUND',
      'EVENT_ID',
      'OLD_START',
      'OLD_END',
      'MOVE_EVENT_SELECTED',
      'MOVE_PATCH_SENT',
      'GOOGLE_UPDATE_START',
      'MOVE_VERIFY_SUCCESS',
      'MOVE_STATE_CLEARED',
      'GOOGLE_UPDATE_SUCCESS',
      'CALENDAR_REFRESH_START',
      'CALENDAR_REFRESH_SUCCESS',
      'MOVE_COMPLETE',
    ]);
  });
});
