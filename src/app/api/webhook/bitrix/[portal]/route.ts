// Webhook endpoint for Bitrix24 outgoing webhooks
// URL: /api/webhook/bitrix/1 or /api/webhook/bitrix/2
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyBitrixWebhookToken, getBitrixDialoInfo } from '@/lib/bitrix';
import { normalizeBitrixMessage } from '@/lib/gateway';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ portal: string }> }
) {
  const { portal } = await params;
  const body = await request.json();

  console.log(`[Bitrix Webhook] Portal: ${portal}, Event:`, body.event || 'unknown');

  // Verify authenticity
  const token = body.auth?.application_token || '';
  if (!verifyBitrixWebhookToken(portal, token)) {
    console.warn(`[Bitrix Webhook] Token mismatch for portal ${portal}. Got: ${token.substring(0, 8)}...`);
  }

  try {
    const normalized = normalizeBitrixMessage(portal, body);
    if (!normalized || !normalized.text) {
      return NextResponse.json({ ok: true, message: 'No message to process' });
    }

    // Find or create channel
    let channel = await db.channel.findUnique({
      where: { source_externalId: { source: normalized.source, externalId: normalized.channelExternalId } },
    });

    if (!channel) {
      let channelName = normalized.channelName || `Битрикс чат`;
      try {
        const dialogId = body.data?.DIALOG_ID || '';
        if (dialogId) {
          const dialogInfo = await getBitrixDialoInfo(portal, dialogId);
          if (dialogInfo?.name) channelName = dialogInfo.name;
        }
      } catch (e) { /* ignore */ }

      channel = await db.channel.create({
        data: {
          source: normalized.source,
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
    console.error('[Bitrix Webhook] Error:', error);
    return NextResponse.json({ ok: true });
  }
}

export async function GET() {
  return NextResponse.json({ status: 'bitrix-webhook-active' });
}
