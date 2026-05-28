import type { OperationalTruthFact } from '@/src/features/agent/execution/operationalTruthFacts';
import { getChatLocaleFromVoiceLanguage } from '@/src/features/chat/services/voiceLanguage';
import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';

/**
 * Factual chat text — never claims success unless fact.kind === calendar_create_verified.
 */
export function buildOperationalTruthReply(fact: OperationalTruthFact, languageCode: VoiceLanguageCode) {
  const locale = getChatLocaleFromVoiceLanguage(languageCode);

  if (fact.kind === 'calendar_create_verified') {
    const lines = [fact.event.summary, fact.dayLabel, fact.timeLabel];

    if (fact.locationLine) {
      lines.push(fact.locationLine);
    }

    lines.push(`Google event id: ${fact.event.id}`);

    if (locale === 'uk') {
      return `Подію підтверджено в Google Calendar:\n${lines.join('\n')}`;
    }

    if (locale === 'ru') {
      return `Событие подтверждено в Google Calendar:\n${lines.join('\n')}`;
    }

    return `Event confirmed in Google Calendar:\n${lines.join('\n')}`;
  }

  if (fact.kind === 'calendar_create_pending_confirmation') {
    if (locale === 'uk') {
      return `Чернетка: ${fact.summary}, ${fact.dayLabel}, ${fact.timeLabel}. Підтверди — і я створю подію після підтвердження Google.`;
    }

    if (locale === 'ru') {
      return `Черновик: ${fact.summary}, ${fact.dayLabel}, ${fact.timeLabel}. Подтверди — и я создам событие после подтверждения Google.`;
    }

    return `Draft: ${fact.summary}, ${fact.dayLabel}, ${fact.timeLabel}. Confirm before I create it in Google Calendar.`;
  }

  if (fact.kind === 'calendar_create_authenticating') {
    if (locale === 'uk') {
      return 'Потрібен доступ до Google Calendar. Відкриваю авторизацію Google…';
    }

    if (locale === 'ru') {
      return 'Нужен доступ к Google Calendar. Открываю авторизацию Google…';
    }

    return 'Calendar access required. Opening Google authorization…';
  }

  if (fact.kind === 'calendar_parse_failed') {
    if (locale === 'uk') {
      return 'Не зміг розібрати дату чи час для календаря. Уточни, будь ласка, «завтра о 9:00».';
    }

    if (locale === 'ru') {
      return 'Не смог разобрать дату или время для календаря. Уточни, пожалуйста, «завтра в 9:00».';
    }

    return 'I could not parse the date or time for the calendar request.';
  }

  if (fact.reason === 'timeout') {
    if (locale === 'uk') {
      return 'Ще чекаю підтвердження від Google Calendar. Не можу сказати, що подію вже створено.';
    }

    if (locale === 'ru') {
      return 'Всё ещё жду подтверждения от Google Calendar. Не могу сказать, что событие уже создано.';
    }

    return 'Still waiting for confirmation from Google Calendar.';
  }

  if (fact.reason === 'verification_failed') {
    if (locale === 'uk') {
      return 'Не вдалося підтвердити створення події в Google Calendar.';
    }

    if (locale === 'ru') {
      return 'Не удалось подтвердить создание события в Google Calendar.';
    }

    return "I couldn't confirm event creation.";
  }

  if (locale === 'uk') {
    return 'Не вдалося підтвердити створення події в Google Calendar.';
  }

  if (locale === 'ru') {
    return 'Не удалось подтвердить создание события в Google Calendar.';
  }

  return "I couldn't confirm event creation.";
}
