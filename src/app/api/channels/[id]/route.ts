// Get messages for a specific channel
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const searchParams = request.nextUrl.searchParams;
  const limit = parseInt(searchParams.get('limit') || '50');
  const before = searchParams.get('before'); // message ID for cursor pagination

  try {
    const where: any = { channelId: id };
    if (before) {
      where.id = { lt: before };
    }

    const messages = await db.message.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: limit,
    });

    // Mark messages as read
    await db.message.updateMany({
      where: { channelId: id, isRead: false },
      data: { isRead: true },
    });

    // Reset unread count on channel
    await db.channel.update({
      where: { id },
      data: { unreadCount: 0 },
    });

    return NextResponse.json(messages.reverse());
  } catch (error) {
    console.error('[Messages API] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 });
  }
}
