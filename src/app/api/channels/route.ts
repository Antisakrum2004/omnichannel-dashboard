// Get all channels - tries DB first, falls back to Bitrix API + Telegram in-memory store
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getBitrixDialogs } from '@/lib/bitrix';
import { BITRIX_PORTALS } from '@/lib/sources';
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

export async function GET() {
  try {
    const channels: ChannelResult[] = [];

    // ─── 1. Bitrix24 channels (from API directly) ───
    for (const [portalKey, portal] of Object.entries(BITRIX_PORTALS)) {
      try {
        const dialogs = await getBitrixDialogs(portalKey, 50);
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
    }

    // ─── 2. Telegram channels (from in-memory store) ───
    const tgChannels = getTgChannels();
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
        avatarUrl: null,
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
