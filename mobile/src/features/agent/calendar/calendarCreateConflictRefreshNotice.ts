import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';

function localeFromLanguageCode(languageCode: VoiceLanguageCode) {
  if (languageCode.startsWith('uk')) {
    return 'uk';
  }

  if (languageCode.startsWith('ru')) {
    return 'ru';
  }

  return 'en';
}

export function buildCalendarCreateConflictCheckSkippedNotice(languageCode: VoiceLanguageCode) {
  const locale = localeFromLanguageCode(languageCode);

  if (locale === 'uk') {
    return 'Не вдалося оновити календар. Подію створено, але я не зміг перевірити конфлікти.';
  }

  if (locale === 'ru') {
    return 'Не удалось обновить календарь. Событие создано, но я не смог проверить конфликты.';
  }

  return 'Calendar refresh failed. Event was created, but I could not verify conflicts.';
}

export function appendCalendarCreateConflictCheckSkippedNotice(params: {
  reply: string;
  spokenReply?: string;
  languageCode: VoiceLanguageCode;
}) {
  const notice = buildCalendarCreateConflictCheckSkippedNotice(params.languageCode);

  return {
    reply: `${params.reply.trim()}\n\n${notice}`,
    spokenReply: `${(params.spokenReply ?? params.reply).trim()}\n\n${notice}`,
  };
}
