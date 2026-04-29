// Get messages for a specific channel - tries DB, falls back to Bitrix API
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getBitrixMessages } from '@/lib/bitrix';
import { BITRIX_PORTALS } from '@/lib/sources';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    // Try DB first
    try {
      const dbMessages = await db.message.findMany({
        where: { channelId: id },
        orderBy: { timestamp: 'desc' },
        take: 50,
      });

      if (dbMessages.length > 0) {
        // Mark as read
        await db.message.updateMany({
          where: { channelId: id, isRead: false },
          data: { isRead: true },
        }).catch(() => {});
        
        await db.channel.update({
          where: { id },
          data: { unreadCount: 0 },
        }).catch(() => {});

        return NextResponse.json(dbMessages.reverse());
      }
    } catch (dbError) {
      console.warn('[Messages API] DB not available, fetching from Bitrix directly');
    }

    // Fallback: parse the channel ID to determine source and fetch from Bitrix
    // Channel ID format for fallback: bx_bitrix1_chat123
    const bitrixMatch = id.match(/^bx_(bitrix\d+)_(.+)$/);
    if (bitrixMatch) {
      const portalKey = bitrixMatch[1];
      const dialogPart = bitrixMatch[2];

      // Get the webhook user ID for this portal (messages from this user = operator)
      const portal = BITRIX_PORTALS[portalKey as keyof typeof BITRIX_PORTALS];
      const webhookUserId = portal?.webhookUserId;

      // Convert to proper dialog ID format
      let dialogId = dialogPart;
      if (!isNaN(Number(dialogPart))) {
        // It's a user ID (1:1 chat)
        dialogId = dialogPart;
      }

      try {
        const result = await getBitrixMessages(portalKey, dialogId, 30);
        if (result?.messages) {
          const messages = result.messages.map((msg: any) => {
            const author = result.users?.find((u: any) => u.id === msg.author_id);
            // Determine sender type: webhook user = operator, system (id=0) = system, everyone else = client
            const senderType = msg.author_id === 0
              ? 'system'
              : (webhookUserId && msg.author_id === webhookUserId)
                ? 'operator'
                : 'client';
            return {
              id: `bx_${msg.id}`,
              channelId: id,
              senderName: author?.name || `User ${msg.author_id}`,
              senderType,
              senderId: msg.author_id, // Include raw author_id for frontend name-based matching
              text: msg.text || '',
              timestamp: new Date(msg.date).toISOString(),
              isRead: !msg.unread,
              operatorId: null,
              externalId: `bx_${msg.id}`,
            };
          });

          return NextResponse.json(messages.reverse());
        }
      } catch (e) {
        console.error(`[Messages API] Failed to fetch from ${portalKey}:`, e);
      }
    }

    return NextResponse.json([]);
  } catch (error) {
    console.error('[Messages API] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 });
  }
}
