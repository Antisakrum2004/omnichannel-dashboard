// Get all channels - tries DB first, falls back to Bitrix API + Telegram persistent store
// Supports ?user=andrey|vladimir query param for per-user webhooks
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getBitrixDialogs, getBitrixTasks, getWebhookUserId } from '@/lib/bitrix';
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

    // ─── 1. Bitrix24 channels (from API directly) ───
    for (const [portalKey, portal] of Object.entries(BITRIX_PORTALS)) {
      try {
        const dialogs = await getBitrixDialogs(portalKey, 50, userSlug);
        if (!dialogs?.items) continue;

        for (const item of dialogs.items) {
          const externalId = `bx_${portalKey}_${item.id}`;
          const avatarUrl = item.user?.avatar || item.chat?.avatar || null;
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
