// Webhook endpoint for Telegram Bot API
// URL: /api/webhook/telegram
// Handles: message, edited_message, channel_post, edited_channel_post
import { NextRequest, NextResponse } from 'next/server';
import { upsertChannel, addMessage, flushToBlob } from '@/lib/telegram-store';

export async function POST(request: NextRequest) {
  const body = await request.json();

  console.log('[Telegram Webhook] Update:', body.update_id);

  try {
    // Support all message-like update types
    const message = body.message || body.edited_message || body.channel_post || body.edited_channel_post;
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
      : 'Channel Post';
    const text = message.text || '';
    const caption = message.caption || '';

    // Skip messages with no text content at all (stickers without caption, pure photos, etc.)
    // But DO NOT skip just because text is empty if there's a caption
    if (!text && !caption) {
      // Still create/update the channel so we know about this chat
      // even if we can't show the message content
      return NextResponse.json({ ok: true, message: 'No text/caption in message' });
    }

    const messageText = text || caption;

    // Determine if this is from a "client" (human) or "operator" (bot/system)
    // In group chats, ALL non-bot users are "clients"
    // channel_post from channels has no from field — treat as client
    const isFromClient = !isFromBot;

    // Upsert channel in store
    const channel = await upsertChannel({
      chatId,
      chatType,
      name: channelName,
      lastMessage: messageText,
      isFromClient,
    });

    // Add message to store
    await addMessage({
      channelId: channel.id,
      senderName,
      senderType: isFromBot ? 'operator' : 'client',
      text: messageText,
      externalId: `tg_${message.message_id}`,
      senderId: message.from?.id,
    });

    // Force save immediately on webhook — await it so the serverless function
    // doesn't shut down before the Blob write completes
    try {
      await flushToBlob();
    } catch (e) {
      console.error('[Telegram Webhook] Blob save failed:', e);
    }

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
  const stats = await getStoreStats();
  return NextResponse.json({
    status: 'telegram-webhook-active',
    store: stats,
  });
}
