// Send a message from operator to a channel
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sendBitrixMessage } from '@/lib/bitrix';
import { sendTelegramMessage } from '@/lib/telegram';
import { BITRIX_PORTALS } from '@/lib/sources';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { channelId, text, operatorId } = body;

  if (!channelId || !text) {
    return NextResponse.json({ error: 'channelId и text обязательны' }, { status: 400 });
  }

  try {
    // First try to find channel in DB
    let channel: any = null;
    try {
      channel = await db.channel.findUnique({ where: { id: channelId } });
    } catch (e) {
      // DB not available, parse from channelId
    }

    let source = channel?.source || '';
    let externalId = channel?.externalId || channelId;
    
    // If no DB channel, parse from channelId format
    if (!channel) {
      const bitrixMatch = channelId.match(/^bx_(bitrix\d+)_(.+)$/);
      if (bitrixMatch) {
        source = bitrixMatch[1];
        externalId = channelId;
      } else if (channelId.startsWith('tg_')) {
        source = 'telegram';
        externalId = channelId;
      }
    }

    let sent = false;
    let errorMessage = '';

    if (source.startsWith('bitrix')) {
      const portalKey = source;
      const portal = BITRIX_PORTALS[portalKey as keyof typeof BITRIX_PORTALS];
      
      if (portal?.readOnly) {
        return NextResponse.json({ 
          error: 'Этот портал только для чтения (стелс-режим)' 
        }, { status: 403 });
      }

      // Extract dialog_id from externalId
      const dialogId = externalId.replace(`bx_${portalKey}_`, '');
      const result = await sendBitrixMessage(portalKey, dialogId, text);
      
      if (result && !result.error) {
        sent = true;
      } else {
        errorMessage = result?.error || 'Ошибка отправки в Битрикс';
      }
    } else if (source === 'telegram') {
      const chatId = externalId.replace('tg_', '');
      const result = await sendTelegramMessage(chatId, text);
      sent = !!result;
      if (!sent) errorMessage = 'Не удалось отправить в Telegram';
    }

    // Save to DB if possible
    if (sent) {
      try {
        await db.message.create({
          data: {
            channelId: channel?.id || channelId,
            senderName: operatorId || 'Оператор',
            senderType: 'operator',
            text,
            operatorId: operatorId || null,
            isRead: true,
          },
        });

        await db.channel.update({
          where: { id: channel?.id || channelId },
          data: {
            lastMessage: text.substring(0, 100),
            lastActivity: new Date(),
          },
        }).catch(() => {});
      } catch (e) {
        // DB save failed, but message was sent
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
