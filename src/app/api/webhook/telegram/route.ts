// Webhook endpoint for Telegram Bot API
// URL: /api/webhook/telegram
import { NextRequest, NextResponse } from 'next/server';
import { upsertChannel, addMessage } from '@/lib/telegram-store';

export async function POST(request: NextRequest) {
  const body = await request.json();

  console.log('[Telegram Webhook] Update:', body.update_id);

  try {
    const message = body.message || body.edited_message;
    if (!message) {
      return NextResponse.json({ ok: true, message: 'No message in update' });
    }

    const chatId = String(message.chat.id);
    const chatType = message.chat.type || 'private';
    const isGroup = chatType === 'group' || chatType === 'supergroup';
    const channelName = isGroup
      ? message.chat.title || 'Telegram Group'
      : `${message.chat.first_name || ''} ${message.chat.last_name || ''}`.trim() || 'Telegram User';

    const isFromBot = message.from?.is_bot === true;
    const senderName = message.from
      ? `${message.from.first_name || ''} ${message.from.last_name || ''}`.trim() || 'Unknown'
      : 'Unknown';
    const text = message.text || '';

    // Skip empty messages (stickers, photos without caption, etc.)
    if (!text && !message.caption) {
      return NextResponse.json({ ok: true, message: 'No text/caption in message' });
    }

    const messageText = text || message.caption || '';

    // Upsert channel in store
    const channel = upsertChannel({
      chatId,
      chatType,
      name: channelName,
      lastMessage: messageText,
      isFromClient: !isFromBot,
    });

    // Add message to store
    addMessage({
      channelId: channel.id,
      senderName,
      senderType: isFromBot ? 'operator' : 'client',
      text: messageText,
      externalId: `tg_${message.message_id}`,
      senderId: message.from?.id,
    });

    console.log(`[Telegram Webhook] Saved message from ${senderName} in ${channelName}: ${messageText.substring(0, 50)}`);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[Telegram Webhook] Error:', error);
    return NextResponse.json({ ok: true }); // Always return 200 to Telegram
  }
}

export async function GET() {
  // Health check
  const { getStoreStats } = await import('@/lib/telegram-store');
  const stats = getStoreStats();
  return NextResponse.json({
    status: 'telegram-webhook-active',
    store: stats,
  });
}
