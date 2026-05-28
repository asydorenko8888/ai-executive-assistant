import type { ChatMessage } from '@/src/entities/chat/types';
import {
  buildAgentSystemContextSegments,
  createExecutiveAgentOrchestrator,
  type ExecutiveAgentOrchestrator,
} from '@/src/features/agent/agentOrchestrator';
import { createConversationMessage } from '@/src/features/chat/store/executiveConversationStore';
import { loadAgentWorkspace } from '@/src/features/agent/storage/agentWorkspaceStorage';
import type { MorningBriefing } from '@/src/features/agent/types';
import { executiveChatMessages } from '@/src/features/chat/data/chatSeed';
import { prepareMemoryPromptContext } from '@/src/features/chat/memory';
import { loadChatHistory } from '@/src/features/chat/storage/chatHistoryStorage';
import { sendExecutiveChatMessage } from '@/src/features/chat/services/chatProxyService';

type ExecutiveCompanionHomeData = {
  locale: string;
  chatMessages: ChatMessage[];
  orchestrator: ExecutiveAgentOrchestrator;
  briefing: MorningBriefing;
  assistantSummary: string;
  workspace: Awaited<ReturnType<typeof loadAgentWorkspace>>;
};

const BRIEFING_BANNED_PHRASES =
  'keep your focus sharp, pace looks manageable, navigate thoughtfully, intentional moves, productivity coach, stay deliberate, room to breathe, fairly tight around it';

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

function buildBriefingContextForPrompt(briefing: MorningBriefing) {
  return briefing.sections
    .map((section) => {
      const items =
        section.items.length > 0 ? ` Other notes: ${section.items.slice(0, 2).join('; ')}.` : '';

      return `${section.title}: ${section.summary}.${items}`;
    })
    .join('\n');
}

function buildSummaryPrompt(locale: string, briefing: MorningBriefing) {
  const sectionsText = buildBriefingContextForPrompt(briefing);
  const toneRules = `Rules: 1-3 short sentences maximum. Calm, concise, executive, practical. Natural spoken English. Short sentences that sound good read aloud. Do not repeat the same meeting, event, or time window twice. Avoid: ${BRIEFING_BANNED_PHRASES}. Prefer lines like "Your next meeting is at 1:30 PM." or "The rest of the afternoon is fairly open."`;

  if (locale === 'uk') {
    return `Напиши ранковий briefing у 1-3 коротких реченнях. Тон: спокійний, стислий, природний, без коучингу й канцеляриту. Не повторюй ту саму зустріч двічі. ${toneRules}\n\nКонтекст:\n${sectionsText}\n\nОпорна думка: ${briefing.headline}`;
  }

  if (locale === 'ru') {
    return `Напиши утренний briefing в 1-3 коротких предложениях. Тон: спокойный, сжатый, естественный, без коучинга. Не повторяй одну и ту же встречу дважды. ${toneRules}\n\nКонтекст:\n${sectionsText}\n\nГлавная мысль: ${briefing.headline}`;
  }

  return `Write a morning briefing in 1-3 short sentences. ${toneRules}\n\nDay context:\n${sectionsText}\n\nAnchor line: ${briefing.headline}`;
}

function buildFallbackSummary(briefing: MorningBriefing) {
  const schedule = briefing.sections.find((section) => section.kind === 'schedule');
  const tasks = briefing.sections.find((section) => section.kind === 'tasks');
  const parts = [schedule?.summary, tasks?.summary].filter(Boolean).slice(0, 2);

  if (parts.length > 0) {
    return parts.join(' ');
  }

  return briefing.headline;
}

async function generateAssistantSummary(
  locale: string,
  chatMessages: ChatMessage[],
  orchestrator: ExecutiveAgentOrchestrator,
  briefing: MorningBriefing,
) {
  try {
    const memoryPromptContext = await prepareMemoryPromptContext(chatMessages);
    const systemMessages = [
      ...memoryPromptContext.systemMessages,
      ...buildAgentSystemContextSegments(orchestrator).map((segment) =>
        createConversationMessage('system', segment),
      ),
    ];
    const promptMessage: ChatMessage = {
      id: `agent-daily-summary-${Date.now()}`,
      role: 'user',
      content: buildSummaryPrompt(locale, briefing),
      createdAt: new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      }),
      status: 'sent',
    };

    return await sendExecutiveChatMessage([promptMessage], systemMessages);
  } catch {
    return buildFallbackSummary(briefing);
  }
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
  const assistantSummary = await generateAssistantSummary(locale, chatMessages, orchestrator, briefing);

  return {
    locale,
    chatMessages,
    orchestrator,
    briefing,
    assistantSummary,
    workspace,
  };
}
