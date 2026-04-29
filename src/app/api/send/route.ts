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
    return NextResponse.json({ error: 'channelId and text are required' }, { status: 400 });
  }

  try {
    const channel = await db.channel.findUnique({ where: { id: channelId } });
    if (!channel) {
      return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
    }

    let sent = false;

    // Send to the appropriate platform
    if (channel.source.startsWith('bitrix')) {
      const portalKey = channel.source; // bitrix1, bitrix2, etc.
      const portal = BITRIX_PORTALS[portalKey as keyof typeof BITRIX_PORTALS];
      
      if (portal?.readOnly) {
        return NextResponse.json({ error: 'Этот портал только для чтения (стелс-режим)' }, { status: 403 });
      }

      // Extract dialog_id from externalId (format: bx_bitrix1_chat123)
      const dialogId = channel.externalId.replace(`bx_${portalKey}_`, '');
      const result = await sendBitrixMessage(portalKey, dialogId, text);
      sent = !!result && !result.error;
    } else if (channel.source === 'telegram') {
      // Extract chat_id from externalId (format: tg_-100123456)
      const chatId = channel.externalId.replace('tg_', '');
      const result = await sendTelegramMessage(chatId, text);
      sent = !!result;
    } else if (channel.source === 'max') {
      // TODO: Implement MAX sending
      console.warn('MAX sending not implemented yet');
    } else if (channel.source === 'whatsapp') {
      // TODO: Implement WhatsApp sending
      console.warn('WhatsApp sending not implemented yet');
    }

    // Save the outgoing message to DB
    if (sent || channel.source === 'max' || channel.source === 'whatsapp') {
      await db.message.create({
        data: {
          channelId: channel.id,
          senderName: 'Оператор',
          senderType: 'operator',
          text,
          operatorId: operatorId || null,
          isRead: true,
        },
      });

      // Update channel last message
      await db.channel.update({
        where: { id: channel.id },
        data: {
          lastMessage: text.substring(0, 100),
          lastActivity: new Date(),
        },
      });
    }

    return NextResponse.json({ ok: sent, source: channel.source });
  } catch (error) {
    console.error('[Send API] Error:', error);
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 });
  }
}
