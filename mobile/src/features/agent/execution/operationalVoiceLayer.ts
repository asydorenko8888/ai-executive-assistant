import type { OperationalTruthFact } from '@/src/features/agent/execution/operationalTruthFacts';
import { containsFakeOperationalSuccessClaim } from '@/src/features/agent/execution/operationalExecutionHonesty';
import { getChatLocaleFromVoiceLanguage } from '@/src/features/chat/services/voiceLanguage';
import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';

/**
 * Voice layer: rewrites verified facts only. Max 2 short sentences. No new facts.
 */
export function buildOperationalVoiceReply(fact: OperationalTruthFact, languageCode: VoiceLanguageCode) {
  const locale = getChatLocaleFromVoiceLanguage(languageCode);
  let reply = '';

  if (fact.kind === 'calendar_create_verified') {
    const locationSuffix = fact.locationLine ? ` ${fact.locationLine}` : '';

    if (locale === 'uk') {
      reply = `Готово. Додав «${fact.event.summary}» — ${fact.dayLabel}, ${fact.timeLabel}${locationSuffix}.`;
    } else if (locale === 'ru') {
      reply = `Готово. Добавил «${fact.event.summary}» — ${fact.dayLabel}, ${fact.timeLabel}${locationSuffix}.`;
    } else {
      reply = `Done. I added "${fact.event.summary}" on ${fact.dayLabel} at ${fact.timeLabel}${locationSuffix}.`;
    }
  } else if (fact.kind === 'calendar_create_pending_confirmation') {
    if (locale === 'uk') {
      reply = `Зрозумів: ${fact.summary}, ${fact.dayLabel}, ${fact.timeLabel}. Підтверди — і я створю подію.`;
    } else if (locale === 'ru') {
      reply = `Понял: ${fact.summary}, ${fact.dayLabel}, ${fact.timeLabel}. Подтверди — и я создам событие.`;
    } else {
      reply = `Got it: ${fact.summary}, ${fact.dayLabel}, ${fact.timeLabel}. Confirm and I'll create the event.`;
    }
  } else if (fact.kind === 'calendar_create_authenticating') {
    if (locale === 'uk') {
      reply = 'Потрібен доступ до Google Calendar. Відкриваю авторизацію Google.';
    } else if (locale === 'ru') {
      reply = 'Нужен доступ к Google Calendar. Открываю авторизацию Google.';
    } else {
      reply = 'Calendar access required. Opening Google authorization.';
    }
  } else if (fact.kind === 'calendar_parse_failed') {
    if (locale === 'uk') {
      reply = 'Не зміг розібрати час. Напиши, будь ласка, «завтра о 9:00».';
    } else if (locale === 'ru') {
      reply = 'Не смог разобрать время. Напиши, пожалуйста, «завтра в 9:00».';
    } else {
      reply = 'I could not parse the time. Try tomorrow at 9:00 AM.';
    }
  } else if (fact.reason === 'timeout') {
    if (locale === 'uk') {
      reply =
        'Ще чекаю підтвердження від Google Calendar. Не будемо вважати подію створеною, поки Google не підтвердить.';
    } else if (locale === 'ru') {
      reply =
        'Всё ещё жду подтверждения от Google Calendar. Давай не будем считать событие созданным, пока Google не подтвердит.';
    } else {
      reply = 'Still waiting for confirmation from Google Calendar.';
    }
  } else {
    if (locale === 'uk') {
      reply =
        'Я зрозумів задачу, але поки не можу підтвердити запис у календар. Не будемо вважати подію створеною, поки Google не підтвердить.';
    } else if (locale === 'ru') {
      reply =
        'Я понял задачу, но пока не могу подтвердить запись в календарь. Давай не будем считать её созданной, пока Google не подтвердит.';
    } else {
      reply = "I understood the request but can't confirm the calendar entry yet.";
    }
  }

  const normalized = reply.replace(/\.{3,}/g, '.').trim();

  if (fact.kind !== 'calendar_create_verified' && containsFakeOperationalSuccessClaim(normalized)) {
    console.error('[OperationalVoiceLayer] Blocked fake success phrasing in voice rewrite', {
      preview: normalized.slice(0, 120),
    });

    if (locale === 'ru') {
      return 'Пока не могу подтвердить запись в календарь.';
    }

    if (locale === 'uk') {
      return 'Поки не можу підтвердити запис у календар.';
    }

    return "I can't confirm the calendar entry yet.";
  }

  return normalized;
}
