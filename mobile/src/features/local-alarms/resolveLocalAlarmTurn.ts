import { parseAlarmConflictDecision } from '@/src/features/local-alarms/localAlarmConflictDecision';
import {
  classifyLocalAlarmIntentKind,
  classifyLocalAlarmQueryVariant,
} from '@/src/features/local-alarms/localAlarmClassification';
import {
  logLocalAlarmActionPerformed,
  logLocalAlarmCurrentState,
  logLocalAlarmEntitiesExtracted,
  logLocalAlarmIntentDetected,
  logLocalAlarmPendingSelection,
  logLocalAlarmReplyBuilt,
  logLocalAlarmSelected,
  logLocalAlarmStorageResult,
  logLocalAlarmTurnStart,
  snapshotAlarmsForLog,
} from '@/src/features/local-alarms/localAlarmDebugLogger';
import { parseLocalAlarmIntent } from '@/src/features/local-alarms/localAlarmIntentParser';
import {
  clearPendingLocalAlarmAction,
  getPendingLocalAlarmAction,
  hasPendingLocalAlarmAction,
  setPendingLocalAlarmAction,
} from '@/src/features/local-alarms/localAlarmPendingAction';
import {
  buildLocalAlarmCancelReply,
  buildLocalAlarmClarificationReply,
  buildLocalAlarmConflictReply,
  buildLocalAlarmCreatedReply,
  buildLocalAlarmDoneWithActiveListReply,
  buildLocalAlarmDuplicateReply,
  buildLocalAlarmListReply,
  buildLocalAlarmNotFoundReply,
  buildLocalAlarmQueryReply,
  buildLocalAlarmReplacedReply,
  buildLocalAlarmRescheduleReply,
} from '@/src/features/local-alarms/localAlarmReplies';
import {
  alarmsHaveDuplicateTime,
  matchAlarmsByTimeSelector,
  resolveAlarmSelectionFromReply,
} from '@/src/features/local-alarms/localAlarmTimeMatch';
import {
  cancelLocalAlarm,
  createLocalAlarm,
  getLocalAlarmById,
  listScheduledLocalAlarms,
  rescheduleLocalAlarm,
} from '@/src/features/local-alarms/localAlarmRuntimeStore';
import {
  syncLocalAlarmNotificationCancel,
  syncLocalAlarmNotificationReschedule,
  syncLocalAlarmNotificationSchedule,
} from '@/src/features/local-alarms/localAlarmNotificationSync';
import type { LocalAlarm, LocalAlarmCreateIntent } from '@/src/features/local-alarms/types';
import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';

function sortAlarmsByTrigger(alarms: LocalAlarm[]) {
  return [...alarms].sort((left, right) => left.triggerAtMs - right.triggerAtMs);
}

function snapshotAlarms(alarms: LocalAlarm[]) {
  return alarms.map((alarm) => ({
    id: alarm.id,
    triggerAtMs: alarm.triggerAtMs,
    title: alarm.title,
  }));
}

function hydrateCandidates(
  snapshots: Array<{ id: string; triggerAtMs: number; title: string }>,
) {
  return snapshots
    .map((snapshot) => getLocalAlarmById(snapshot.id))
    .filter((alarm): alarm is LocalAlarm => Boolean(alarm && alarm.status === 'scheduled'));
}

function logCurrentAlarms(referenceNowMs: number) {
  const alarms = listScheduledLocalAlarms(referenceNowMs);
  logLocalAlarmCurrentState({
    alarms: snapshotAlarmsForLog(alarms),
    referenceNowMs,
  });
  return alarms;
}

function createAlarmFromIntent(intent: LocalAlarmCreateIntent) {
  const alarm = createLocalAlarm({
    title: intent.title,
    triggerAt: intent.triggerAt,
    sourceTranscript: intent.sourceTranscript,
  });

  syncLocalAlarmNotificationSchedule(alarm);
  logLocalAlarmStorageResult({
    action: 'create',
    alarmId: alarm.id,
    success: true,
    triggerAtMs: alarm.triggerAtMs,
    status: alarm.status,
  });
  return alarm;
}

function deleteAlarms(alarms: LocalAlarm[]) {
  for (const alarm of alarms) {
    const cancelled = cancelLocalAlarm(alarm.id);

    if (cancelled) {
      syncLocalAlarmNotificationCancel(cancelled.id);
      logLocalAlarmStorageResult({
        action: 'cancel',
        alarmId: cancelled.id,
        success: true,
        status: 'cancelled',
      });
    }
  }
}

function applyReschedule(params: {
  alarm: LocalAlarm;
  targetTime: Date;
  languageCode: VoiceLanguageCode;
  referenceNowMs: number;
}) {
  const previousTriggerAtMs = params.alarm.triggerAtMs;
  const rescheduled = rescheduleLocalAlarm(params.alarm.id, params.targetTime);

  if (!rescheduled) {
    logLocalAlarmStorageResult({
      action: 'reschedule',
      alarmId: params.alarm.id,
      success: false,
    });

    return {
      reply: buildLocalAlarmNotFoundReply({
        languageCode: params.languageCode,
        action: 'reschedule',
      }),
    };
  }

  syncLocalAlarmNotificationReschedule(rescheduled);
  logLocalAlarmStorageResult({
    action: 'reschedule',
    alarmId: rescheduled.id,
    success: true,
    triggerAtMs: rescheduled.triggerAtMs,
    status: rescheduled.status,
  });

  const reply = buildLocalAlarmRescheduleReply({
    alarm: rescheduled,
    previousTriggerAtMs,
    languageCode: params.languageCode,
    referenceNowMs: params.referenceNowMs,
  });

  return { reply, spokenReply: reply };
}

function tryResolveConflictDecision(params: {
  transcript: string;
  languageCode: VoiceLanguageCode;
  referenceNow: Date;
}) {
  const pending = getPendingLocalAlarmAction();

  if (!pending || pending.state !== 'WAITING_ALARM_CONFLICT_DECISION') {
    return null;
  }

  const decision = parseAlarmConflictDecision(params.transcript);

  if (!decision) {
    const existing = hydrateCandidates(pending.existingAlarms);

    return {
      reply: buildLocalAlarmConflictReply({
        existingAlarms: existing,
        newTriggerAt: pending.pendingCreate.triggerAt,
        languageCode: params.languageCode,
        referenceNow: params.referenceNow,
      }),
      spokenReply: buildLocalAlarmConflictReply({
        existingAlarms: existing,
        newTriggerAt: pending.pendingCreate.triggerAt,
        languageCode: params.languageCode,
        referenceNow: params.referenceNow,
      }),
    };
  }

  clearPendingLocalAlarmAction();
  const existing = hydrateCandidates(pending.existingAlarms);

  if (decision === 'replace') {
    const toReplace = existing[0];

    if (toReplace) {
      deleteAlarms([toReplace]);
    }

    const alarm = createAlarmFromIntent(pending.pendingCreate);
    logLocalAlarmActionPerformed({
      action: 'create_replace',
      alarmId: alarm.id,
      details: { replacedAlarmId: toReplace?.id ?? null },
    });

    const reply = buildLocalAlarmReplacedReply({
      fromTriggerAtMs: toReplace?.triggerAtMs ?? pending.pendingCreate.triggerAt.getTime(),
      toTriggerAtMs: pending.pendingCreate.triggerAt.getTime(),
      languageCode: params.languageCode,
      referenceNowMs: params.referenceNow.getTime(),
    });

    return { reply, spokenReply: reply };
  }

  const alarm = createAlarmFromIntent(pending.pendingCreate);
  logLocalAlarmActionPerformed({ action: 'create_keep_both', alarmId: alarm.id });
  const active = listScheduledLocalAlarms(params.referenceNow.getTime());
  const reply = buildLocalAlarmDoneWithActiveListReply({
    alarms: active,
    languageCode: params.languageCode,
    referenceNow: params.referenceNow,
  });

  return { reply, spokenReply: reply };
}

function tryResolvePendingSelection(params: {
  transcript: string;
  languageCode: VoiceLanguageCode;
  referenceNow: Date;
}) {
  const pending = getPendingLocalAlarmAction();

  if (!pending || pending.state !== 'WAITING_ALARM_SELECTION') {
    return null;
  }

  const candidates = hydrateCandidates(pending.candidates);

  if (candidates.length === 0) {
    clearPendingLocalAlarmAction();
    return {
      reply: buildLocalAlarmNotFoundReply({
        languageCode: params.languageCode,
        action: pending.action,
      }),
    };
  }

  logLocalAlarmEntitiesExtracted({
    pendingAction: pending.action,
    selectionReply: params.transcript,
    candidateIds: candidates.map((alarm) => alarm.id),
  });

  const selected = resolveAlarmSelectionFromReply({
    reply: params.transcript,
    candidates,
    referenceNow: params.referenceNow,
    languageCode: params.languageCode,
  });

  if (!selected) {
    const reply = buildLocalAlarmClarificationReply({
      alarms: candidates,
      languageCode: params.languageCode,
      referenceNow: params.referenceNow,
      action: pending.action,
    });

    return { reply, spokenReply: reply };
  }

  logLocalAlarmSelected({
    alarmId: selected.id,
    triggerAtMs: selected.triggerAtMs,
    reason: 'pending_selection_reply',
  });

  clearPendingLocalAlarmAction();

  if (pending.action === 'cancel') {
    const cancelled = cancelLocalAlarm(selected.id);

    if (cancelled) {
      syncLocalAlarmNotificationCancel(cancelled.id);
      logLocalAlarmStorageResult({
        action: 'cancel',
        alarmId: cancelled.id,
        success: true,
        status: 'cancelled',
      });
    }

    logLocalAlarmActionPerformed({
      action: 'cancel',
      alarmId: selected.id,
    });

    const reply = buildLocalAlarmCancelReply({
      cancelled: cancelled ? [cancelled] : [],
      languageCode: params.languageCode,
      referenceNowMs: params.referenceNow.getTime(),
    });

    return { reply, spokenReply: reply };
  }

  const targetTime =
    pending.targetTime ??
    (pending.relativeDeltaMs != null
      ? new Date(selected.triggerAtMs + pending.relativeDeltaMs)
      : null);

  if (!targetTime) {
    return {
      reply: buildLocalAlarmNotFoundReply({
        languageCode: params.languageCode,
        action: 'reschedule',
      }),
    };
  }

  logLocalAlarmActionPerformed({
    action: 'reschedule',
    alarmId: selected.id,
    details: {
      targetTime: targetTime.toISOString(),
      relativeDeltaMs: pending.relativeDeltaMs ?? null,
    },
  });

  return applyReschedule({
    alarm: selected,
    targetTime,
    languageCode: params.languageCode,
    referenceNowMs: params.referenceNow.getTime(),
  });
}

function tryResolvePendingLocalAlarmTurn(params: {
  transcript: string;
  languageCode: VoiceLanguageCode;
  referenceNow: Date;
}) {
  if (!hasPendingLocalAlarmAction()) {
    return null;
  }

  return (
    tryResolveConflictDecision(params) ??
    tryResolvePendingSelection(params)
  );
}

function resolveAlarmCandidates(params: {
  alarms: LocalAlarm[];
  timeSelector?: string;
  referenceNow: Date;
}) {
  if (!params.timeSelector?.trim()) {
    return params.alarms;
  }

  return matchAlarmsByTimeSelector(params.alarms, params.timeSelector, params.referenceNow);
}

function requiresAlarmSelection(
  alarms: LocalAlarm[],
  timeSelector: string | undefined,
  referenceNow: Date,
) {
  if (alarms.length <= 1) {
    return false;
  }

  if (!timeSelector?.trim()) {
    return true;
  }

  const matches = matchAlarmsByTimeSelector(alarms, timeSelector, referenceNow);

  return matches.length !== 1;
}

function buildSelectionTurn(params: {
  alarms: LocalAlarm[];
  languageCode: VoiceLanguageCode;
  referenceNow: Date;
  action: 'cancel' | 'reschedule';
  targetTime?: Date;
  relativeDeltaMs?: number;
}) {
  const sorted = sortAlarmsByTrigger(params.alarms);

  setPendingLocalAlarmAction({
    state: 'WAITING_ALARM_SELECTION',
    action: params.action,
    candidates: snapshotAlarms(sorted),
    targetTime: params.targetTime,
    relativeDeltaMs: params.relativeDeltaMs,
    createdAtMs: Date.now(),
  });

  logLocalAlarmPendingSelection({
    action: params.action,
    candidateIds: sorted.map((alarm) => alarm.id),
  });

  const reply = buildLocalAlarmClarificationReply({
    alarms: sorted,
    languageCode: params.languageCode,
    referenceNow: params.referenceNow,
    action: params.action,
  });

  return { reply, spokenReply: reply };
}

function buildConflictTurn(params: {
  existingAlarms: LocalAlarm[];
  pendingCreate: LocalAlarmCreateIntent;
  languageCode: VoiceLanguageCode;
  referenceNow: Date;
}) {
  setPendingLocalAlarmAction({
    state: 'WAITING_ALARM_CONFLICT_DECISION',
    action: 'create_conflict',
    existingAlarms: snapshotAlarms(sortAlarmsByTrigger(params.existingAlarms)),
    pendingCreate: params.pendingCreate,
    createdAtMs: Date.now(),
  });

  const reply = buildLocalAlarmConflictReply({
    existingAlarms: sortAlarmsByTrigger(params.existingAlarms),
    newTriggerAt: params.pendingCreate.triggerAt,
    languageCode: params.languageCode,
    referenceNow: params.referenceNow,
  });

  return { reply, spokenReply: reply };
}

function resolveRescheduleTargetTime(
  intent: {
    targetTime?: Date;
    relativeDeltaMs?: number;
  },
  alarm: LocalAlarm,
) {
  if (intent.targetTime) {
    return intent.targetTime;
  }

  if (intent.relativeDeltaMs != null) {
    return new Date(alarm.triggerAtMs + intent.relativeDeltaMs);
  }

  return null;
}

function finishTurn(result: { reply: string; spokenReply?: string }, route: string) {
  logLocalAlarmReplyBuilt({
    replyPreview: result.reply.slice(0, 160),
    route,
  });
  return result;
}

export function resolveLocalAlarmTurn(params: {
  transcript: string;
  languageCode: VoiceLanguageCode;
  referenceNow?: Date;
}) {
  const referenceNow = params.referenceNow ?? new Date();
  const referenceNowMs = referenceNow.getTime();

  logLocalAlarmTurnStart({
    transcript: params.transcript,
    hasPendingAction: hasPendingLocalAlarmAction(),
  });

  const pendingResult = tryResolvePendingLocalAlarmTurn({
    transcript: params.transcript,
    languageCode: params.languageCode,
    referenceNow,
  });

  if (pendingResult) {
    logCurrentAlarms(referenceNowMs);
    return finishTurn(pendingResult, 'pending_action');
  }

  const intentKind = classifyLocalAlarmIntentKind(params.transcript);
  const queryVariant = classifyLocalAlarmQueryVariant(params.transcript);
  const intent = parseLocalAlarmIntent(params.transcript, referenceNow);

  logLocalAlarmIntentDetected({
    transcript: params.transcript,
    intentKind,
    queryVariant,
    parsedKind: intent?.kind ?? null,
  });

  if (!intent) {
    return null;
  }

  logLocalAlarmEntitiesExtracted({
    kind: intent.kind,
    queryVariant: 'queryVariant' in intent ? intent.queryVariant ?? null : null,
    timeSelector: 'timeSelector' in intent ? intent.timeSelector ?? null : null,
    sourceTimeSelector: 'sourceTimeSelector' in intent ? intent.sourceTimeSelector ?? null : null,
    relativeDeltaMs: 'relativeDeltaMs' in intent ? intent.relativeDeltaMs ?? null : null,
    targetTime: 'targetTime' in intent && intent.targetTime ? intent.targetTime.toISOString() : null,
  });

  clearPendingLocalAlarmAction();

  if (intent.kind === 'create') {
    const scheduled = logCurrentAlarms(referenceNowMs);

    if (alarmsHaveDuplicateTime(scheduled, intent.triggerAt)) {
      return finishTurn(
        {
          reply: buildLocalAlarmDuplicateReply(params.languageCode),
          spokenReply: buildLocalAlarmDuplicateReply(params.languageCode),
        },
        'create_duplicate',
      );
    }

    if (scheduled.length > 0) {
      return finishTurn(
        buildConflictTurn({
          existingAlarms: scheduled,
          pendingCreate: intent,
          languageCode: params.languageCode,
          referenceNow,
        }),
        'create_conflict',
      );
    }

    const alarm = createAlarmFromIntent(intent);
    logLocalAlarmActionPerformed({ action: 'create', alarmId: alarm.id });
    const reply = buildLocalAlarmCreatedReply({
      alarm,
      languageCode: params.languageCode,
      requestedDelayMs: intent.requestedDelayMs,
      referenceNowMs,
    });

    return finishTurn({ reply, spokenReply: reply }, 'create');
  }

  if (intent.kind === 'list' || intent.kind === 'status') {
    const alarms = logCurrentAlarms(referenceNowMs);
    const reply = buildLocalAlarmQueryReply({
      alarms,
      languageCode: params.languageCode,
      referenceNow,
      sourceTranscript: intent.sourceTranscript,
      queryVariant: intent.queryVariant ?? (intent.kind === 'list' ? 'list' : 'time'),
    });

    return finishTurn({ reply, spokenReply: reply }, 'query');
  }

  if (intent.kind === 'cancel') {
    const scheduled = logCurrentAlarms(referenceNowMs);

    if (requiresAlarmSelection(scheduled, intent.timeSelector, referenceNow)) {
      const matches = resolveAlarmCandidates({
        alarms: scheduled,
        timeSelector: intent.timeSelector,
        referenceNow,
      });

      if (matches.length === 0) {
        return finishTurn(
          {
            reply: buildLocalAlarmNotFoundReply({
              languageCode: params.languageCode,
              action: 'cancel',
            }),
          },
          'cancel_not_found',
        );
      }

      return finishTurn(
        buildSelectionTurn({
          alarms: matches.length > 1 ? matches : scheduled,
          languageCode: params.languageCode,
          referenceNow,
          action: 'cancel',
        }),
        'cancel_selection',
      );
    }

    const matches = resolveAlarmCandidates({
      alarms: scheduled,
      timeSelector: intent.timeSelector,
      referenceNow,
    });

    const cancelled = cancelLocalAlarm(matches[0]!.id);

    if (cancelled) {
      syncLocalAlarmNotificationCancel(cancelled.id);
      logLocalAlarmStorageResult({
        action: 'cancel',
        alarmId: cancelled.id,
        success: true,
        status: 'cancelled',
      });
    }

    logLocalAlarmActionPerformed({ action: 'cancel', alarmId: matches[0]!.id });

    const reply = buildLocalAlarmCancelReply({
      cancelled: cancelled ? [cancelled] : [],
      languageCode: params.languageCode,
      referenceNowMs,
    });

    return finishTurn({ reply, spokenReply: reply }, 'cancel');
  }

  if (intent.kind === 'reschedule') {
    const scheduled = logCurrentAlarms(referenceNowMs);

    if (requiresAlarmSelection(scheduled, intent.sourceTimeSelector, referenceNow)) {
      const sourceMatches = resolveAlarmCandidates({
        alarms: scheduled,
        timeSelector: intent.sourceTimeSelector,
        referenceNow,
      });

      if (sourceMatches.length === 0) {
        return finishTurn(
          {
            reply: buildLocalAlarmNotFoundReply({
              languageCode: params.languageCode,
              action: 'reschedule',
            }),
          },
          'reschedule_not_found',
        );
      }

      return finishTurn(
        buildSelectionTurn({
          alarms: sourceMatches.length > 1 ? sourceMatches : scheduled,
          languageCode: params.languageCode,
          referenceNow,
          action: 'reschedule',
          targetTime: intent.targetTime,
          relativeDeltaMs: intent.relativeDeltaMs,
        }),
        'reschedule_selection',
      );
    }

    const sourceMatches = resolveAlarmCandidates({
      alarms: scheduled,
      timeSelector: intent.sourceTimeSelector,
      referenceNow,
    });

    const selected = sourceMatches[0]!;
    const targetTime = resolveRescheduleTargetTime(intent, selected);

    if (!targetTime) {
      return finishTurn(
        {
          reply: buildLocalAlarmNotFoundReply({
            languageCode: params.languageCode,
            action: 'reschedule',
          }),
        },
        'reschedule_missing_target',
      );
    }

    logLocalAlarmActionPerformed({
      action: 'reschedule',
      alarmId: selected.id,
      details: { targetTime: targetTime.toISOString() },
    });

    return finishTurn(
      applyReschedule({
        alarm: selected,
        targetTime,
        languageCode: params.languageCode,
        referenceNowMs,
      }),
      'reschedule',
    );
  }

  return null;
}

export { hasPendingLocalAlarmAction };
