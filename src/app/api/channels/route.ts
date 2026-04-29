// Get all channels with last message info
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const channels = await db.channel.findMany({
      orderBy: { lastActivity: 'desc' },
      include: {
        _count: { select: { messages: true } },
      },
    });

    // Add unread message count per channel
    const channelsWithUnread = await Promise.all(
      channels.map(async (ch) => {
        const unreadMessages = await db.message.count({
          where: { channelId: ch.id, isRead: false, senderType: 'client' },
        });
        return {
          ...ch,
          messageCount: ch._count.messages,
          unreadMessages,
        };
      })
    );

    return NextResponse.json(channelsWithUnread);
  } catch (error) {
    console.error('[Channels API] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch channels' }, { status: 500 });
  }
}
