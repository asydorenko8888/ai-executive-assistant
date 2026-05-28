import {
  classifyAssistantIntent,
  detectHardOperationalIntent,
  type AssistantIntentAnalysis,
} from '@/src/features/agent/intent/assistantIntentRouter';
import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';
import { getChatLocaleFromVoiceLanguage } from '@/src/features/chat/services/voiceLanguage';
import { parseSpokenClockTime } from '@/src/features/reminders/reminderTimeParser';

export type OperationalIntentReplyParams = {
  transcript: string;
  languageCode: VoiceLanguageCode;
  calendarConnected: boolean;
  referenceNow: Date;
};

function extractClockFragment(transcript: string) {
  const patterns = [
    /\b(?:at|@|о|в)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)?)/i,
    /\b(\d{1,2}:\d{2})\b/,
    /\b(\d{1,2})\s*(am|pm)\b/i,
    /\b(?:for\s+)?(\d{1,2})\s*(?:o'clock)?\b/i,
  ];

  for (const pattern of patterns) {
    const match = transcript.match(pattern);

    if (match) {
      return match[1] ?? match[0];
    }
  }

  return null;
}

function resolveDayOffset(transcript: string) {
  const normalized = transcript.toLowerCase();

  if (/\b(?:tomorrow|завтра)\b/i.test(normalized)) {
    return 1;
  }

  if (/\b(?:today|сьогодні|сегодня)\b/i.test(normalized)) {
    return 0;
  }

  return null;
}

function parseOperationalScheduleHint(transcript: string, referenceNow: Date) {
  const dayOffset = resolveDayOffset(transcript);
  const clockFragment = extractClockFragment(transcript);

  if (dayOffset === null && !clockFragment) {
    return null;
  }

  const base = new Date(referenceNow);

  if (dayOffset !== null) {
    base.setDate(base.getDate() + dayOffset);
  }

  if (!clockFragment) {
    return {
      date: base,
      hasExplicitTime: false,
    };
  }

  const parsedTime = parseSpokenClockTime(clockFragment, base);

  if (!parsedTime) {
    return {
      date: base,
      hasExplicitTime: false,
    };
  }

  if (dayOffset !== null) {
    parsedTime.setFullYear(base.getFullYear(), base.getMonth(), base.getDate());
  }

  return {
    date: parsedTime,
    hasExplicitTime: true,
  };
}

function formatScheduleLabel(
  schedule: ReturnType<typeof parseOperationalScheduleHint>,
  locale: ReturnType<typeof getChatLocaleFromVoiceLanguage>,
) {
  if (!schedule) {
    return null;
  }

  if (schedule.hasExplicitTime) {
    return schedule.date.toLocaleString([], {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  if (locale === 'uk') {
    return 'завтра';
  }

  if (locale === 'ru') {
    return 'завтра';
  }

  return 'tomorrow';
}

function isCalendarWriteIntent(transcript: string, analysis: AssistantIntentAnalysis) {
  if (analysis.operationalSubtype === 'calendar_write' || analysis.operationalSubtype === 'scheduling') {
    return true;
  }

  return /\b(?:add|put|create|move|reschedule|schedule|book).{0,50}\b(?:calendar|google\s+calendar|календар|зустріч|meeting|event)\b/i.test(
    transcript,
  );
}

function buildCalendarWriteReply(params: OperationalIntentReplyParams) {
  const locale = getChatLocaleFromVoiceLanguage(params.languageCode);
  const schedule = parseOperationalScheduleHint(params.transcript, params.referenceNow);
  const scheduleLabel = formatScheduleLabel(schedule, locale);
  const mentionsMove = /\b(?:moved|rescheduled|shifted|переніс|перенес|перенёс)\b/i.test(params.transcript);

  if (locale === 'uk') {
    const ack = scheduleLabel
      ? mentionsMove
        ? `Зрозумів — перенесення зафіксував, ${scheduleLabel}.`
        : `Зрозумів — ${scheduleLabel}.`
      : mentionsMove
        ? 'Зрозумів — перенесення зафіксував.'
        : 'Зрозумів — додамо в календар.';

    const ops = params.calendarConnected
      ? 'Запис у Google Calendar з чату поки через підтвердження в застосунку — надішли назву зустрічі, якщо хочеш, зберу чернетку події.'
      : 'Google Calendar ще не підключений — як тільки підключимо, поставлю це на завтра.';

    return `${ack} ${ops}`;
  }

  if (locale === 'ru') {
    const ack = scheduleLabel
      ? mentionsMove
        ? `Понял — перенос зафиксировал, ${scheduleLabel}.`
        : `Понял — ${scheduleLabel}.`
      : mentionsMove
        ? 'Понял — перенос зафиксировал.'
        : 'Понял — добавим в календарь.';

    const ops = params.calendarConnected
      ? 'Запись в Google Calendar из чата пока через подтверждение в приложении — скинь название встречи, соберу черновик события.'
      : 'Google Calendar ещё не подключён — как только подключим, поставлю на завтра.';

    return `${ack} ${ops}`;
  }

  const ack = scheduleLabel
    ? mentionsMove
      ? `Got it — I noted the move for ${scheduleLabel}.`
      : `Got it — ${scheduleLabel}.`
    : mentionsMove
      ? 'Got it — I noted the move.'
      : 'Got it — we can put that on the calendar.';

  const ops = params.calendarConnected
    ? 'Calendar is connected for reading; placing events from here still goes through a quick confirm in the app — send the meeting title if you want me to draft the event.'
    : 'Google Calendar is not connected yet — once it is, I can place this for tomorrow.';

  return `${ack} ${ops}`;
}

function buildMessageDraftReply(params: OperationalIntentReplyParams) {
  const locale = getChatLocaleFromVoiceLanguage(params.languageCode);

  if (locale === 'uk') {
    return 'Текст готовий — надішлю формулювання, а ти відправиш одним дотиком, як тільки SMS підключимо.';
  }

  if (locale === 'ru') {
    return 'Текст готов — дам формулировку, а ты отправишь одним касанием, как только SMS подключим.';
  }

  return 'The message is ready — I will give you the wording, and you can send it in one tap once SMS is connected.';
}

function buildGenericOperationalReply(params: OperationalIntentReplyParams, analysis: AssistantIntentAnalysis) {
  const locale = getChatLocaleFromVoiceLanguage(params.languageCode);
  const subtype = analysis.operationalSubtype ?? 'action';

  if (locale === 'uk') {
    return `Зрозумів запит (${subtype}) — зараз зроблю наступний практичний крок і скажу, якщо чогось не вистачає.`;
  }

  if (locale === 'ru') {
    return `Понял запрос (${subtype}) — сейчас сделаю следующий практический шаг и скажу, если чего-то не хватает.`;
  }

  return `Got the ${subtype} request — I will take the next practical step and tell you if anything is still missing.`;
}

export function tryBuildOperationalIntentReply(
  params: OperationalIntentReplyParams,
): string | null {
  const analysis = classifyAssistantIntent(params.transcript);

  if (!analysis.shouldBypassEmotionalRouting && !detectHardOperationalIntent(params.transcript)) {
    return null;
  }

  if (analysis.operationalSubtype === 'reminder') {
    return null;
  }

  if (isCalendarWriteIntent(params.transcript, analysis)) {
    return buildCalendarWriteReply(params);
  }

  if (analysis.operationalSubtype === 'message_draft') {
    return buildMessageDraftReply(params);
  }

  return null;
}
