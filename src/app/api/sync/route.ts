// Sync Bitrix24 dialogs to our database
// Called periodically or on demand
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getBitrixDialogs, getBitrixMessages } from '@/lib/bitrix';
import { BITRIX_PORTALS } from '@/lib/sources';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const portalKey = body.portal || 'bitrix1';

  const portal = BITRIX_PORTALS[portalKey as keyof typeof BITRIX_PORTALS];
  if (!portal) {
    return NextResponse.json({ error: 'Unknown portal' }, { status: 400 });
  }

  try {
    const dialogs = await getBitrixDialogs(portalKey, 50);

    if (!dialogs?.items) {
      return NextResponse.json({ 
        error: 'Failed to fetch dialogs',
        portal: portalKey 
      }, { status: 500 });
    }

    let synced = 0;
    let updated = 0;
    let newMessages = 0;

    for (const item of dialogs.items) {
      const externalId = `bx_${portalKey}_${item.id}`;
      const channelName = item.title || item.name || `Чат ${item.id}`;
      const lastMsg = item.message?.text || '';
      const lastActivity = item.message?.date ? new Date(item.message.date) : null;

      try {
        // Find or create channel
        let channel = await db.channel.findUnique({
          where: { source_externalId: { source: portalKey, externalId } },
        });

        if (!channel) {
          channel = await db.channel.create({
            data: {
              source: portalKey,
              externalId,
              name: channelName,
              unreadCount: item.counter || 0,
              lastMessage: lastMsg.substring(0, 100),
              lastActivity: lastActivity || new Date(),
            },
          });
          synced++;
        } else {
          const hasNewMessage = lastActivity && lastActivity > channel.lastActivity!;
          
          await db.channel.update({
            where: { id: channel.id },
            data: {
              name: channelName,
              unreadCount: item.counter ?? channel.unreadCount,
              lastMessage: lastMsg.substring(0, 100) || channel.lastMessage,
              ...(hasNewMessage ? { lastActivity } : {}),
            },
          });
          updated++;

          // Fetch new messages if there's activity
          if (hasNewMessage) {
            try {
              const dialogId = item.id?.toString?.() || `chat${item.chat_id}`;
              const messages = await getBitrixMessages(portalKey, dialogId, 5);
              
              if (messages?.messages) {
                for (const msg of messages.messages) {
                  const msgExternalId = `bx_${msg.id}`;
                  const existing = await db.message.findFirst({
                    where: { externalId: msgExternalId, channelId: channel.id },
                  });

                  if (!existing) {
                    const author = messages.users?.find((u: any) => u.id === msg.author_id);
                    const senderName = author?.name || `User ${msg.author_id}`;

                    await db.message.create({
                      data: {
                        channelId: channel.id,
                        senderName,
                        senderType: msg.author_id === 0 ? 'system' : 'client',
                        text: msg.text || '',
                        timestamp: new Date(msg.date),
                        isRead: !msg.unread,
                        externalId: msgExternalId,
                      },
                    });
                    newMessages++;
                  }
                }
              }
            } catch (e) {
              // Skip this channel's messages if fetch fails
            }
          }
        }
      } catch (e) {
        // Skip this channel if create/update fails
        console.error(`[Sync] Error with channel ${externalId}:`, e);
      }
    }

    return NextResponse.json({
      ok: true,
      portal: portalKey,
      portalLabel: portal.label,
      dialogsFound: dialogs.items.length,
      channelsCreated: synced,
      channelsUpdated: updated,
      newMessages,
    });
  } catch (error) {
    console.error('[Sync API] Error:', error);
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 });
  }
}

// GET for health check
export async function GET() {
  // Try DB connection
  let dbStatus = 'unknown';
  let channelCount = 0;
  let messageCount = 0;
  
  try {
    channelCount = await db.channel.count();
    messageCount = await db.message.count();
    dbStatus = 'connected';
  } catch (e) {
    dbStatus = 'unavailable';
  }

  return NextResponse.json({
    status: 'sync-api-active',
    db: dbStatus,
    channels: channelCount,
    messages: messageCount,
    portals: Object.keys(BITRIX_PORTALS),
  });
}
