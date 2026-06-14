import {
  classifyLocalAlarmIntentKind,
  shouldRouteToLocalAlarmWorkflow,
  type LocalAlarmIntentKind,
} from '@/src/features/local-alarms/localAlarmClassification';

export type AlarmPipelineIntent =
  | 'ALARM_MOVE'
  | 'ALARM_DELETE'
  | 'ALARM_QUERY'
  | 'ALARM_CREATE';

const PIPELINE_BY_KIND: Record<LocalAlarmIntentKind, AlarmPipelineIntent> = {
  move: 'ALARM_MOVE',
  delete: 'ALARM_DELETE',
  status: 'ALARM_QUERY',
  create: 'ALARM_CREATE',
  list: 'ALARM_QUERY',
};

export function detectAlarmPipelineIntent(transcript: string): AlarmPipelineIntent | null {
  const kind = classifyLocalAlarmIntentKind(transcript);

  if (!kind) {
    return null;
  }

  return PIPELINE_BY_KIND[kind];
}

export function resolveAlarmRoutingDiagnostic(params: {
  userText: string;
  transcript?: string;
  selectedPipeline?: string;
}) {
  const transcript = params.transcript ?? params.userText;
  const detectedIntent =
    detectAlarmPipelineIntent(transcript) ??
    (shouldRouteToLocalAlarmWorkflow(transcript) ? 'ALARM_UNCLASSIFIED' : 'NONE');
  const selectedPipeline =
    params.selectedPipeline ??
    (detectedIntent.startsWith('ALARM')
      ? `${detectedIntent}_PIPELINE`
      : 'CALENDAR_WORKFLOW');

  return {
    userText: params.userText,
    detectedIntent,
    selectedPipeline,
  };
}

export function logAlarmRoutingDiagnostic(params: {
  userText: string;
  transcript?: string;
  selectedPipeline?: string;
}) {
  const diagnostic = resolveAlarmRoutingDiagnostic(params);

  console.log(`USER_TEXT:\n${diagnostic.userText}`);
  console.log(`DETECTED_INTENT:\n${diagnostic.detectedIntent}`);
  console.log(`SELECTED_PIPELINE:\n${diagnostic.selectedPipeline}`);
}
