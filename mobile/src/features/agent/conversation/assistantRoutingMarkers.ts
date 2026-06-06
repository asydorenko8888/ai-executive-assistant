export function logRouterSelectedIntent(params: {
  transcriptPreview: string;
  behaviorMode: string;
  behaviorIntent: string;
  route: string;
  calendarCommandIntent?: string;
  readOnlyCalendar?: boolean;
}) {
  console.error('ROUTER_SELECTED_INTENT', {
    transcriptPreview: params.transcriptPreview.slice(0, 160),
    behaviorMode: params.behaviorMode,
    behaviorIntent: params.behaviorIntent,
    route: params.route,
    calendarCommandIntent: params.calendarCommandIntent ?? null,
    readOnlyCalendar: params.readOnlyCalendar ?? false,
  });
}

export function logCalendarPipelineEntered(params: {
  stage: string;
  transcriptPreview: string;
  behaviorMode?: string;
}) {
  console.error('CALENDAR_PIPELINE_ENTERED', {
    stage: params.stage,
    transcriptPreview: params.transcriptPreview.slice(0, 160),
    behaviorMode: params.behaviorMode ?? null,
  });
}

export function logGeneralAssistantEntered(params: {
  transcriptPreview: string;
  route: string;
  behaviorMode?: string;
}) {
  console.error('GENERAL_ASSISTANT_ENTERED', {
    transcriptPreview: params.transcriptPreview.slice(0, 160),
    route: params.route,
    behaviorMode: params.behaviorMode ?? null,
  });
}

export function logAssistantReplyGenerated(params: {
  source: string;
  transcriptPreview: string;
  replyPreview: string;
  route?: string;
}) {
  console.error('ASSISTANT_REPLY_GENERATED', {
    source: params.source,
    transcriptPreview: params.transcriptPreview.slice(0, 160),
    replyPreview: params.replyPreview.slice(0, 200),
    route: params.route ?? null,
  });
}
