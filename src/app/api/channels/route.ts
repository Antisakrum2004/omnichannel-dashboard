// Get all channels - tries DB first, falls back to Bitrix API + Telegram persistent store
// Supports ?user=andrey|vladimir query param for per-user webhooks
// For users without their own webhook, filters chats by membership using im.chat.user.list
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getBitrixDialogs, getBitrixTasks, getWebhookUserId, getBitrixChatMembers } from '@/lib/bitrix';
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

/**
 * Determine if a chat should be shown to a specific user based on their membership.
 * 
 * Logic for filtering:
 * - Private chats: Only show if the dialog ID equals the target user's ID
 *   (In Bitrix24, private chat dialog ID = the other user's ID from the webhook owner's perspective.
 *    So dialog ID "1" = chat between webhook owner and user 1, which user 1 IS a participant of)
 * - Group/collab chats: Only show if the target user is a member (checked via im.chat.user.list)
 * - General chat: Always show (all users are members)
 * - Other types: Show by default (open lines, etc.)
 */
function shouldShowChat(
  item: any,
  chatType: string | undefined,
  chatId: number | undefined,
  targetUserId: number,
  groupChatMembership: Map<number, boolean>
): boolean {
  // Private chat — dialog ID is the other user's ID from webhook owner's perspective
  // Show only if dialog ID matches the target user (meaning the target user is a participant)
  if (chatType === 'private' || !chatType) {
    // The item.id for private chats is the user ID of the other participant
    const dialogId = parseInt(item.id);
    return dialogId === targetUserId;
  }
  
  // General chat — always show (all portal users are members)
  if (chatType === 'general') {
    return true;
  }
  
  // Group chat or collab — check membership
  if ((chatType === 'chat' || chatType === 'collab') && chatId) {
    const isMember = groupChatMembership.get(chatId);
    // If we couldn't check, default to showing the chat
    return isMember !== false;
  }
  
  // Other types (openline, livechat, etc.) — show by default
  return true;
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

    // Determine if we need membership-based filtering
    // This is needed when the user's bitrixUserId differs from the webhook owner
    const needsMembershipFilter = userSlug && DASHBOARD_USERS[userSlug]
      ? (() => {
          const user = DASHBOARD_USERS[userSlug];
          const portal = BITRIX_PORTALS['bitrix1' as keyof typeof BITRIX_PORTALS];
          return portal && user.bitrixUserId !== portal.webhookUserId;
        })()
      : false;
    const targetBitrixUserId = needsMembershipFilter && userSlug ? DASHBOARD_USERS[userSlug].bitrixUserId : undefined;

    // ─── 1. Bitrix24 channels (from API directly) ───
    for (const [portalKey, portal] of Object.entries(BITRIX_PORTALS)) {
      try {
        const dialogs = await getBitrixDialogs(portalKey, 50, userSlug);
        if (!dialogs?.items) continue;

        // If we need membership filtering, check which group chats the target user is a member of
        // We do this in parallel for performance
        let groupChatMembership: Map<number, boolean> | null = null;
        
        if (targetBitrixUserId) {
          // Collect all group/collab chat IDs that need membership checking
          const groupChatsToCheck: { chatId: number; item: any }[] = [];
          for (const item of dialogs.items) {
            const chatType = item.chat?.type;
            if ((chatType === 'chat' || chatType === 'collab') && item.chat?.id) {
              groupChatsToCheck.push({ chatId: item.chat.id, item });
            }
          }
          
          // Check membership in parallel
          console.log(`[Channels API] Checking membership for user ${targetBitrixUserId} in ${groupChatsToCheck.length} group chats on ${portalKey}`);
          groupChatMembership = new Map();
          
          const membershipResults = await Promise.allSettled(
            groupChatsToCheck.map(async ({ chatId }) => {
              try {
                const members = await getBitrixChatMembers(portalKey, chatId, userSlug);
                const isMember = Array.isArray(members) && members.includes(targetBitrixUserId);
                return { chatId, isMember };
              } catch {
                // If we can't check, assume the user is a member (show the chat)
                return { chatId, isMember: true };
              }
            })
          );
          
          for (const result of membershipResults) {
            if (result.status === 'fulfilled') {
              groupChatMembership.set(result.value.chatId, result.value.isMember);
            }
          }
        }
        
        for (const item of dialogs.items) {
          const externalId = `bx_${portalKey}_${item.id}`;
          const avatarUrl = item.user?.avatar || item.chat?.avatar || null;
          const chatId = item.chat?.id;
          const chatType = item.chat?.type;
          
          // Apply membership filtering for non-webhook-owner users
          if (targetBitrixUserId && groupChatMembership) {
            const shouldShow = shouldShowChat(item, chatType, chatId, targetBitrixUserId, groupChatMembership);
            if (!shouldShow) continue;
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
