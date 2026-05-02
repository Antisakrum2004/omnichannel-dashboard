// Unified Gateway - normalizes messages from all sources into one format
import { NormalizedMessage, BITRIX_PORTALS } from './sources';

// ─── Telegram Message Normalization ───
export function normalizeTelegramMessage(payload: any): NormalizedMessage | null {
  const message = payload.message || payload.edited_message;
  if (!message) return null;

  const chatId = String(message.chat.id);
  const isGroup = message.chat.type === 'group' || message.chat.type === 'supergroup';
  const channelName = isGroup ? message.chat.title : `${message.chat.first_name || ''} ${message.chat.last_name || ''}`.trim();
  const isFromBot = message.from?.is_bot === true;

  return {
    source: 'telegram',
    channelExternalId: `tg_${chatId}`,
    channelName: channelName || undefined,
    senderName: message.from ? `${message.from.first_name || ''} ${message.from.last_name || ''}`.trim() || 'Unknown' : 'Unknown',
    senderType: isFromBot ? 'operator' : 'client',
    text: message.text || '',
    timestamp: new Date(message.date * 1000),
    externalMessageId: `tg_${message.message_id}`,
  };
}

// ─── Bitrix24 Message Normalization ───
export function normalizeBitrixMessage(portalKey: string, payload: any): NormalizedMessage | null {
  const portal = BITRIX_PORTALS[portalKey as keyof typeof BITRIX_PORTALS];
  if (!portal) return null;

  const data = payload.data || payload;
  const dialogId = data.DIALOG_ID || data.dialog_id || '';
  const messageText = data.MESSAGE || data.message || data.text || '';
  const userId = data.USER_ID || data.user_id || 0;

  return {
    source: portalKey,
    channelExternalId: `bx_${portalKey}_${dialogId}`,
    channelName: undefined,
    senderName: userId ? `User ${userId}` : 'System',
    senderType: userId ? 'client' : 'system',
    text: messageText,
    timestamp: new Date(),
    externalMessageId: data.MESSAGE_ID ? `bx_${data.MESSAGE_ID}` : undefined,
  };
}

// ─── MAX Message Normalization ───
export function normalizeMaxMessage(payload: any): NormalizedMessage | null {
  if (payload.update_type !== 'message_created') return null;

  const msg = payload.message;
  if (!msg) return null;

  const chatId = String(msg.recipient?.chat_id || msg.sender?.user_id);

  return {
    source: 'max',
    channelExternalId: `max_${chatId}`,
    channelName: undefined,
    senderName: `${msg.sender?.first_name || ''} ${msg.sender?.last_name || ''}`.trim() || 'Unknown',
    senderType: msg.sender?.is_bot ? 'operator' : 'client',
    text: msg.body?.text || '',
    timestamp: new Date(msg.timestamp || Date.now()),
    externalMessageId: msg.body?.mid || undefined,
  };
}

// ─── Unified normalize function ───
export function normalizeMessage(source: string, payload: any): NormalizedMessage | null {
  switch (source) {
    case 'telegram': return normalizeTelegramMessage(payload);
    case 'bitrix1':
    case 'bitrix2':
    case 'bitrix3': return normalizeBitrixMessage(source, payload);
    case 'max': return normalizeMaxMessage(payload);
    default:
      console.warn(`Unknown source: ${source}`);
      return null;
  }
}
