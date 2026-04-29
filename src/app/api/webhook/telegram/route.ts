// Webhook endpoint for Telegram Bot API
// URL: /api/webhook/telegram
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { normalizeTelegramMessage } from '@/lib/gateway';
import { getTelegramChat } from '@/lib/telegram';

export async function POST(request: NextRequest) {
  const body = await request.json();

  // Verify secret token header
  const secret = request.headers.get('x-telegram-bot-api-secret-token') || '';
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET || 'omni_tg_secret_2024';
  if (secret !== expectedSecret) {
    console.warn('[Telegram Webhook] Invalid secret token');
    // Don't reject during development
  }

  console.log('[Telegram Webhook] Update:', body.update_id);

  try {
    const normalized = normalizeTelegramMessage(body);
    if (!normalized || !normalized.text) {
      return NextResponse.json({ ok: true, message: 'No text message' });
    }

    // Find or create channel
    let channel = await db.channel.findUnique({
      where: { source_externalId: { source: 'telegram', externalId: normalized.channelExternalId } },
    });

    if (!channel) {
      // Try to get chat name from Telegram API
      let channelName = normalized.channelName || 'Telegram Chat';
      try {
        const chatId = normalized.channelExternalId.replace('tg_', '');
        const chatInfo = await getTelegramChat(chatId);
        if (chatInfo?.title) channelName = chatInfo.title;
        else if (chatInfo?.first_name) channelName = `${chatInfo.first_name} ${chatInfo.last_name || ''}`.trim();
      } catch (e) { /* ignore */ }

      channel = await db.channel.create({
        data: {
          source: 'telegram',
          externalId: normalized.channelExternalId,
          name: channelName,
          unreadCount: normalized.senderType === 'client' ? 1 : 0,
          lastMessage: normalized.text.substring(0, 100),
          lastActivity: normalized.timestamp,
        },
      });
    } else {
      await db.channel.update({
        where: { id: channel.id },
        data: {
          unreadCount: normalized.senderType === 'client' ? { increment: 1 } : undefined,
          lastMessage: normalized.text.substring(0, 100),
          lastActivity: normalized.timestamp,
        },
      });
    }

    await db.message.create({
      data: {
        channelId: channel.id,
        senderName: normalized.senderName,
        senderType: normalized.senderType,
        text: normalized.text,
        timestamp: normalized.timestamp,
        externalId: normalized.externalMessageId,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[Telegram Webhook] Error:', error);
    return NextResponse.json({ ok: true });
  }
}

export async function GET() {
  return NextResponse.json({ status: 'telegram-webhook-active' });
}
