import { parseLocalAlarmIntent } from '@/src/features/local-alarms/localAlarmIntentParser';
import {
  buildLocalAlarmCancelReply,
  buildLocalAlarmCreatedReply,
  buildLocalAlarmListReply,
} from '@/src/features/local-alarms/localAlarmReplies';
import {
  cancelLocalAlarm,
  createLocalAlarm,
  listScheduledLocalAlarms,
} from '@/src/features/local-alarms/localAlarmRuntimeStore';
import type { LocalAlarm } from '@/src/features/local-alarms/types';
import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';

function matchAlarmsForCancel(alarms: LocalAlarm[], titleQuery?: string) {
  if (!titleQuery?.trim()) {
    return alarms;
  }

  const query = titleQuery.trim().toLowerCase();

  return alarms.filter((alarm) => alarm.title.toLowerCase().includes(query));
}

function buildCancelClarificationMessage(alarms: LocalAlarm[], languageCode: VoiceLanguageCode) {
  const lines = alarms.map((alarm, index) => `${index + 1}. ${alarm.title}`).join('\n');

  if (languageCode === 'uk-UA') {
    return `У вас кілька будильників:\n${lines}\nЯкий скасувати?`;
  }

  if (languageCode === 'ru-RU') {
    return `У вас несколько будильников:\n${lines}\nКакой отменить?`;
  }

  return `You have several alarms:\n${lines}\nWhich one should I cancel?`;
}

export function resolveLocalAlarmTurn(params: {
  transcript: string;
  languageCode: VoiceLanguageCode;
  referenceNow?: Date;
}) {
  const referenceNow = params.referenceNow ?? new Date();
  const intent = parseLocalAlarmIntent(params.transcript, referenceNow);

  if (!intent) {
    return null;
  }

  if (intent.kind === 'create') {
    const alarm = createLocalAlarm({
      title: intent.title,
      triggerAt: intent.triggerAt,
      sourceTranscript: intent.sourceTranscript,
    });

    const reply = buildLocalAlarmCreatedReply({
      alarm,
      languageCode: params.languageCode,
      requestedDelayMs: intent.requestedDelayMs,
      referenceNowMs: referenceNow.getTime(),
    });

    return {
      reply,
      spokenReply: reply,
    };
  }

  if (intent.kind === 'list') {
    const alarms = listScheduledLocalAlarms(referenceNow.getTime());
    const reply = buildLocalAlarmListReply({
      alarms,
      languageCode: params.languageCode,
      referenceNow,
    });

    return { reply, spokenReply: reply };
  }

  if (intent.kind === 'cancel') {
    const scheduled = listScheduledLocalAlarms(referenceNow.getTime());
    const matches = matchAlarmsForCancel(scheduled, intent.titleQuery);

    if (matches.length === 0) {
      return {
        reply: buildLocalAlarmCancelReply({
          cancelled: [],
          languageCode: params.languageCode,
        }),
      };
    }

    if (matches.length > 1 && !intent.titleQuery?.trim()) {
      return {
        reply: buildCancelClarificationMessage(matches, params.languageCode),
      };
    }

    const cancelled = matches.map((alarm) => cancelLocalAlarm(alarm.id)).filter(Boolean);

    return {
      reply: buildLocalAlarmCancelReply({
        cancelled: cancelled as LocalAlarm[],
        languageCode: params.languageCode,
      }),
    };
  }

  return null;
}
