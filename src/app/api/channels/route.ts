// Get all channels - tries DB first, falls back to Bitrix API + Telegram persistent store
// Supports ?user=andrey|vladimir query param for per-user webhooks
// For users without their own webhook, uses imopenlines.session.list with OPERATOR_ID filter
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getBitrixDialogs, getBitrixTasks, getWebhookUserId, getBitrixOpenLineSessions } from '@/lib/bitrix';
import { BITRIX_PORTALS, DASHBOARD_USERS } from '@/lib/sources';
import { getAllChannels as getTgChannels } from '@/lib/telegram-store';

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
  avatarUrl: string | null;
}

export async function GET(request: NextRequest) {
  // Extract user slug from query params
  const userSlug = request.nextUrl.searchParams.get('user') || undefined;

  // Validate user slug if provided
  if (userSlug && !DASHBOARD_USERS[userSlug]) {
    return NextResponse.json({ error: 'Invalid user' }, { status: 400 });
  }

  try {
    const channels: ChannelResult[] = [];

    // Determine if we need operator-based filtering for open lines
    // This is needed when the user's bitrixUserId differs from the webhook owner
    const needsOperatorFilter = userSlug && DASHBOARD_USERS[userSlug]
      ? (() => {
          const user = DASHBOARD_USERS[userSlug];
          const portal = BITRIX_PORTALS['bitrix1' as keyof typeof BITRIX_PORTALS];
          return portal && user.bitrixUserId !== portal.webhookUserId;
        })()
      : false;
    const operatorId = needsOperatorFilter && userSlug ? DASHBOARD_USERS[userSlug].bitrixUserId : undefined;

    // ─── 1. Bitrix24 channels (from API directly) ───
    for (const [portalKey, portal] of Object.entries(BITRIX_PORTALS)) {
      // If we need operator filtering, also fetch open line sessions
      let operatorSessionChatIds: Set<number> | null = null;
      let operatorSessionsMap: Map<number, any> | null = null;
      
      if (operatorId) {
        try {
          const sessions = await getBitrixOpenLineSessions(portalKey, operatorId, 50, userSlug);
          if (sessions && Array.isArray(sessions)) {
            operatorSessionChatIds = new Set(sessions.map((s: any) => s.CHAT_ID));
            operatorSessionsMap = new Map(sessions.map((s: any) => [s.CHAT_ID, s]));
            console.log(`[Channels API] Found ${sessions.length} open line sessions for operator ${operatorId} on ${portalKey}`);
          }
        } catch (e) {
          console.error(`[Channels API] Failed to fetch open line sessions for ${portalKey}:`, e);
        }
      }
      
      try {
        const dialogs = await getBitrixDialogs(portalKey, 50, userSlug);
        if (!dialogs?.items) continue;

        for (const item of dialogs.items) {
          const externalId = `bx_${portalKey}_${item.id}`;
          const avatarUrl = item.user?.avatar || item.chat?.avatar || null;
          const chatId = item.chat?.id;
          const isLiveChat = item.chat?.type === 'livechat' || item.chat?.type === 'openline';
          
          // If operator filtering is active, only show open line chats assigned to this operator
          if (operatorId && operatorSessionChatIds) {
            if (isLiveChat && chatId && !operatorSessionChatIds.has(chatId)) {
              // This open line session is NOT assigned to this operator — skip it
              continue;
            }
            // Non-open-line chats (group/private) are shown to all users
          }
          
          channels.push({
            id: externalId,
            source: portalKey,
            externalId,
            name: item.title || item.name || `Чат ${item.id}`,
            unreadCount: item.counter || 0,
            lastMessage: item.message?.text?.substring(0, 100) || null,
            lastActivity: item.message?.date || new Date().toISOString(),
            messageCount: 0,
            unreadMessages: item.counter || 0,
            avatarUrl,
          });
        }
      } catch (e) {
        console.error(`[Channels API] Failed to fetch from ${portalKey}:`, e);
      }
      
      // Also add open line sessions that might not appear in im.recent.list
      if (operatorSessionsMap && operatorSessionsMap.size > 0) {
        try {
          const existingChatIds = new Set(
            channels
              .filter(c => c.source === portalKey)
              .map(c => {
                const match = c.externalId.match(/^bx_bitrix\d+_(.+)$/);
                return match ? match[1] : '';
              })
          );
          
          for (const [chatId, session] of operatorSessionsMap) {
            const externalId = `bx_${portalKey}_chat${chatId}`;
            if (!existingChatIds.has(`chat${chatId}`)) {
              // This session wasn't in im.recent.list — add it
              channels.push({
                id: externalId,
                source: portalKey,
                externalId,
                name: `ОЛ #${session.SESSION_ID} (Макаров)`,
                unreadCount: 0,
                lastMessage: session.CRM?.ENTITY_TYPE || null,
                lastActivity: session.DATE_MODIFY || session.DATE_CREATE || new Date().toISOString(),
                messageCount: 0,
                unreadMessages: 0,
                avatarUrl: null,
              });
            }
          }
        } catch (e) {
          console.error(`[Channels API] Error adding open line sessions for ${portalKey}:`, e);
        }
      }

      // ─── 1b. Bitrix24 task chats ───
      try {
        const tasks = await getBitrixTasks(portalKey, 50, userSlug);
        if (tasks?.tasks && Array.isArray(tasks.tasks)) {
          for (const task of tasks.tasks) {
            const taskId = task.id || task.ID;
            const taskTitle = task.title || task.TITLE || `Задача #${taskId}`;
            const taskActivity = task.dateActivity || task.DATE_ACTIVITY || new Date().toISOString();
            const externalId = `bx_${portalKey}_task_${taskId}`;
            channels.push({
              id: externalId,
              source: portalKey,
              externalId,
              name: taskTitle,
              unreadCount: 0,
              lastMessage: task.description || task.DESCRIPTION || null,
              lastActivity: taskActivity,
              messageCount: 0,
              unreadMessages: 0,
              avatarUrl: null,
            });
          }
        } else if (tasks?.result && Array.isArray(tasks.result)) {
          for (const task of tasks.result) {
            const taskId = task.id || task.ID;
            const taskTitle = task.title || task.TITLE || `Задача #${taskId}`;
            const taskActivity = task.dateActivity || task.DATE_ACTIVITY || new Date().toISOString();
            const externalId = `bx_${portalKey}_task_${taskId}`;
            channels.push({
              id: externalId,
              source: portalKey,
              externalId,
              name: taskTitle,
              unreadCount: 0,
              lastMessage: task.description || task.DESCRIPTION || null,
              lastActivity: taskActivity,
              messageCount: 0,
              unreadMessages: 0,
              avatarUrl: null,
            });
          }
        }
      } catch (e) {
        console.error(`[Channels API] Failed to fetch tasks from ${portalKey}:`, e);
      }
    }

    // ─── 2. Telegram channels (from persistent Blob store) ───
    const tgChannels = await getTgChannels();
    for (const ch of tgChannels) {
      channels.push({
        id: ch.id,
        source: 'telegram',
        externalId: ch.externalId,
        name: ch.name,
        unreadCount: ch.unreadCount,
        lastMessage: ch.lastMessage,
        lastActivity: ch.lastActivity,
        messageCount: 0,
        unreadMessages: ch.unreadCount,
        avatarUrl: ch.avatarUrl ?? null,
      });
    }

    // Sort by last activity
    channels.sort((a, b) => new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime());

    return NextResponse.json(channels);
  } catch (error) {
    console.error('[Channels API] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch channels' }, { status: 500 });
  }
}
