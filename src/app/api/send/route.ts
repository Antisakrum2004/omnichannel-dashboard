// Send a message from operator to a channel
// Supports ?user=andrey|vladimir query param for per-user webhooks
import { NextRequest, NextResponse } from 'next/server';
import { sendBitrixMessage } from '@/lib/bitrix';
import { sendTelegramMessage } from '@/lib/telegram';
import { addMessage, getChannel, flushToBlob } from '@/lib/telegram-store';
import { BITRIX_PORTALS, DASHBOARD_USERS } from '@/lib/sources';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { channelId, text, operatorId } = body;

  // Extract user slug from query params
  const userSlug = request.nextUrl.searchParams.get('user') || undefined;

  if (!channelId || !text) {
    return NextResponse.json({ error: 'channelId и text обязательны' }, { status: 400 });
  }

  try {
    let source = '';
    let sent = false;
    let errorMessage = '';

    // ─── Telegram channel ───
    if (channelId.startsWith('tg_')) {
      source = 'telegram';
      const chatId = channelId.replace('tg_', '');
      const result = await sendTelegramMessage(chatId, text);
      sent = !!result;
      if (!sent) errorMessage = 'Не удалось отправить в Telegram';

      // Save to persistent store
      if (sent) {
        await addMessage({
          channelId,
          senderName: operatorId || 'Оператор',
          senderType: 'operator',
          text,
          externalId: `tg_sent_${Date.now()}`,
        });
        // Force save since we just sent a message
        flushToBlob().catch(() => {});
      }
    }
    // ─── Bitrix24 channel ───
    else {
      const bitrixMatch = channelId.match(/^bx_(bitrix\d+)_(.+)$/);
      if (bitrixMatch) {
        source = bitrixMatch[1];
        const portal = BITRIX_PORTALS[source as keyof typeof BITRIX_PORTALS];

        if (portal?.readOnly) {
          return NextResponse.json({
            error: 'Этот портал только для чтения (стелс-режим)'
          }, { status: 403 });
        }

        const dialogId = channelId.replace(`bx_${source}_`, '');
        const result = await sendBitrixMessage(source, dialogId, text, userSlug);

        if (result && !result.error) {
          sent = true;
        } else {
          errorMessage = result?.error || 'Ошибка отправки в Битрикс';
        }
      }
    }

    return NextResponse.json({
      ok: sent,
      source,
      error: sent ? undefined : errorMessage
    });
  } catch (error) {
    console.error('[Send API] Error:', error);
    return NextResponse.json({ error: 'Ошибка отправки' }, { status: 500 });
  }
}
