// Get all channels - tries DB first, falls back to Bitrix API
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getBitrixDialogs } from '@/lib/bitrix';
import { BITRIX_PORTALS } from '@/lib/sources';

interface ChannelResult {
  id: string;
  source: string;
  externalId: string;
  name: string;
  unreadCount: number;
  lastMessage: string | null;
  lastActivity: string;
  messageCount: number;
  unreadMessages: number;
}

export async function GET() {
  try {
    // Try DB first
    let channels: ChannelResult[] = [];
    
    try {
      const dbChannels = await db.channel.findMany({
        orderBy: { lastActivity: 'desc' },
        include: { _count: { select: { messages: true } } },
      });

      if (dbChannels.length > 0) {
        channels = await Promise.all(
          dbChannels.map(async (ch) => {
            const unreadMessages = await db.message.count({
              where: { channelId: ch.id, isRead: false, senderType: 'client' },
            });
            return {
              id: ch.id,
              source: ch.source,
              externalId: ch.externalId,
              name: ch.name,
              unreadCount: ch.unreadCount,
              lastMessage: ch.lastMessage,
              lastActivity: ch.lastActivity?.toISOString() || new Date().toISOString(),
              messageCount: ch._count.messages,
              unreadMessages,
            };
          })
        );
        return NextResponse.json(channels);
      }
    } catch (dbError) {
      console.warn('[Channels API] DB not available, fetching from Bitrix directly');
    }

    // Fallback: fetch directly from Bitrix24 APIs
    for (const [portalKey, portal] of Object.entries(BITRIX_PORTALS)) {
      try {
        const dialogs = await getBitrixDialogs(portalKey, 50);
        if (!dialogs?.items) continue;

        for (const item of dialogs.items) {
          const externalId = `bx_${portalKey}_${item.id}`;
          channels.push({
            id: externalId, // Use externalId as temporary ID
            source: portalKey,
            externalId,
            name: item.title || item.name || `Чат ${item.id}`,
            unreadCount: item.counter || 0,
            lastMessage: item.message?.text?.substring(0, 100) || null,
            lastActivity: item.message?.date || new Date().toISOString(),
            messageCount: 0,
            unreadMessages: item.counter || 0,
          });
        }
      } catch (e) {
        console.error(`[Channels API] Failed to fetch from ${portalKey}:`, e);
      }
    }

    // Sort by last activity
    channels.sort((a, b) => new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime());

    return NextResponse.json(channels);
  } catch (error) {
    console.error('[Channels API] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch channels' }, { status: 500 });
  }
}
