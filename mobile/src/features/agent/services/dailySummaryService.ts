import type { ChatMessage } from '@/src/entities/chat/types';
import {
  createExecutiveAgentOrchestrator,
  type ExecutiveAgentOrchestrator,
} from '@/src/features/agent/agentOrchestrator';
import { loadAgentWorkspace } from '@/src/features/agent/storage/agentWorkspaceStorage';
import type { MorningBriefing } from '@/src/features/agent/types';
import { executiveChatMessages } from '@/src/features/chat/data/chatSeed';
import { loadChatHistory } from '@/src/features/chat/storage/chatHistoryStorage';

type ExecutiveCompanionHomeData = {
  locale: string;
  chatMessages: ChatMessage[];
  orchestrator: ExecutiveAgentOrchestrator;
  briefing: MorningBriefing;
  assistantSummary: string;
  workspace: Awaited<ReturnType<typeof loadAgentWorkspace>>;
};

function detectLocaleFromEnvironment() {
  const resolvedLocale = Intl.DateTimeFormat().resolvedOptions().locale.toLowerCase();

  if (resolvedLocale.startsWith('uk')) {
    return 'uk';
  }

  if (resolvedLocale.startsWith('ru')) {
    return 'ru';
  }

  return 'en';
}

function buildDeterministicAssistantSummary(briefing: MorningBriefing) {
  const schedule = briefing.sections.find((section) => section.kind === 'schedule');
  const tasks = briefing.sections.find((section) => section.kind === 'tasks');
  const parts = [schedule?.summary, tasks?.summary].filter(Boolean).slice(0, 2);

  if (parts.length > 0) {
    return parts.join(' ');
  }

  return briefing.headline;
}

function generateAssistantSummary(
  orchestrator: ExecutiveAgentOrchestrator,
  briefing: MorningBriefing,
) {
  const isCalendarConnected = orchestrator.snapshot.calendarConnection?.status === 'connected';
  const schedule = briefing.sections.find((section) => section.kind === 'schedule');
  const summary = buildDeterministicAssistantSummary(briefing);

  console.log('[Morning Briefing] assistant summary source:', {
    source: isCalendarConnected ? 'google_calendar' : 'fallback_demo',
    scheduleItemCount: schedule?.items.length ?? 0,
    scheduleTitles: schedule?.items ?? [],
    summaryPreview: summary.slice(0, 160),
  });

  return summary;
}

export async function loadExecutiveCompanionHomeData(): Promise<ExecutiveCompanionHomeData> {
  const locale = detectLocaleFromEnvironment();
  const [chatMessages, workspace] = await Promise.all([
    loadChatHistory(executiveChatMessages),
    loadAgentWorkspace(),
  ]);

  const orchestrator = await createExecutiveAgentOrchestrator({
    locale,
    chatMessages,
  });

  console.log('[Calendar Audit] loadExecutiveCompanionHomeData — orchestrator snapshot', {
    connectionStatus: orchestrator.snapshot.calendarConnection?.status ?? 'unknown',
    connectedEmail: orchestrator.snapshot.calendarConnection?.connectedEmail ?? null,
    upcomingCalendarEvents: orchestrator.snapshot.upcomingCalendarEvents.length,
    eventTitles: orchestrator.snapshot.upcomingCalendarEvents.slice(0, 8).map((event) => event.title),
    calendarSummaryHeadline: orchestrator.snapshot.calendarSummary?.transitionSummary ?? null,
  });

  const briefing = orchestrator.createMorningBriefing();
  const scheduleSection = briefing.sections.find((section) => section.kind === 'schedule');
  const isCalendarConnected = orchestrator.snapshot.calendarConnection?.status === 'connected';

  console.log('[Morning Briefing] schedule section source:', {
    source: isCalendarConnected ? 'google_calendar' : 'fallback_demo',
    itemCount: scheduleSection?.items.length ?? 0,
    items: scheduleSection?.items ?? [],
    summary: scheduleSection?.summary ?? null,
  });

  const assistantSummary = generateAssistantSummary(orchestrator, briefing);

  return {
    locale,
    chatMessages,
    orchestrator,
    briefing,
    assistantSummary,
    workspace,
  };
}
