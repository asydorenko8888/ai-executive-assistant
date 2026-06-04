import { Platform } from 'react-native';
import { Share } from 'react-native';

import type { ChatMessage } from '@/src/entities/chat/types';
import type {
  ChatMessageDebugMeta,
  ConversationExportRecord,
} from '@/src/features/chat/debug/conversationDebugTypes';

export function buildConversationExportRecords(
  messages: ChatMessage[],
  debugByMessageId: Record<string, ChatMessageDebugMeta>,
): ConversationExportRecord[] {
  return messages.map((message) => ({
    id: message.id,
    role: message.role,
    content: message.content,
    createdAt: message.createdAt,
    status: message.status,
    debug: debugByMessageId[message.id] ?? null,
  }));
}

export function formatConversationExportJson(records: ConversationExportRecord[]) {
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      messageCount: records.length,
      messages: records,
    },
    null,
    2,
  );
}

export function formatConversationExportText(records: ConversationExportRecord[]) {
  const lines: string[] = [
    `Exported: ${new Date().toISOString()}`,
    `Messages: ${records.length}`,
    '',
  ];

  for (const record of records) {
    lines.push('---');
    lines.push(`id: ${record.id}`);
    lines.push(`role: ${record.role}`);
    lines.push(`createdAt: ${record.createdAt}`);
    lines.push(`status: ${record.status}`);
    lines.push(`content: ${record.content}`);

    if (record.debug) {
      lines.push(`timestamp: ${record.debug.timestampIso}`);
      lines.push(`detectedIntent: ${record.debug.detectedIntent}`);
      lines.push(`calendarAction: ${record.debug.calendarAction}`);
      if (record.debug.route) {
        lines.push(`route: ${record.debug.route}`);
      }
      if (record.debug.executionState) {
        lines.push(`executionState: ${record.debug.executionState}`);
      }
      if (record.debug.toolResponse) {
        lines.push(`toolResponse: ${record.debug.toolResponse}`);
      }
      if (record.debug.rawError) {
        lines.push(`rawError: ${record.debug.rawError}`);
      }
    }

    lines.push('');
  }

  return lines.join('\n');
}

function downloadOnWeb(filename: string, content: string, mimeType: string) {
  if (typeof document === 'undefined') {
    return false;
  }

  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
  return true;
}

export async function exportConversationDocument(params: {
  format: 'json' | 'txt';
  records: ConversationExportRecord[];
}) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename =
    params.format === 'json'
      ? `executive-chat-${stamp}.json`
      : `executive-chat-${stamp}.txt`;
  const body =
    params.format === 'json'
      ? formatConversationExportJson(params.records)
      : formatConversationExportText(params.records);
  const mimeType = params.format === 'json' ? 'application/json' : 'text/plain';

  if (Platform.OS === 'web' && downloadOnWeb(filename, body, mimeType)) {
    return;
  }

  await Share.share({
    title: filename,
    message: body,
  });
}
