// Persistent Telegram store using Vercel Blob
// Data survives serverless cold starts — stored as JSON files on Vercel Blob
// In-memory cache for fast reads, Blob for persistence

import { put, head, get } from '@vercel/blob';

// ─── Types ───

interface TgChannel {
  id: string;           // tg_<chatId>
  source: string;       // 'telegram'
  externalId: string;   // tg_<chatId>
  name: string;
  unreadCount: number;
  lastMessage: string | null;
  lastActivity: string;
  chatType: string;     // 'group', 'supergroup', 'private'
  telegramChatId: string; // original chat id
  avatarUrl?: string | null;
}

interface TgMessage {
  id: string;
  channelId: string;
  senderName: string;
  senderType: string;   // 'client' | 'operator'
  text: string;
  timestamp: string;
  isRead: boolean;
  externalId: string;
  senderId?: number;
}

interface StoreData {
  channels: Record<string, TgChannel>;
  messages: Record<string, TgMessage[]>;
}

// ─── Blob Storage Paths ───
const BLOB_CHANNELS = 'tg-store/channels.json';
const BLOB_MESSAGES = 'tg-store/messages.json';

// ─── In-Memory Cache ───
let cacheChannels: Record<string, TgChannel> = {};
let cacheMessages: Record<string, TgMessage[]> = {};
let cacheLoaded = false;
let loadPromise: Promise<void> | null = null;

// ─── Persistence: Load from Blob ───
async function loadFromBlob(): Promise<void> {
  if (cacheLoaded) return;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    try {
      const token = process.env.BLOB_READ_WRITE_TOKEN;
      if (!token) {
        console.warn('[TG Store] No BLOB_READ_WRITE_TOKEN — data will not persist');
        cacheLoaded = true;
        return;
      }

      // Load channels — get() returns { stream, ... } for private blobs
      try {
        const result = await get(BLOB_CHANNELS, { token, access: 'private' });
        if (result && result.stream) {
          const text = await new Response(result.stream).text();
          cacheChannels = JSON.parse(text);
          console.log(`[TG Store] Loaded ${Object.keys(cacheChannels).length} channels from Blob`);
        }
      } catch (e: any) {
        // "not_found" is normal for a fresh store — don't warn loudly
        if (!e?.message?.includes('not_found') && !e?.message?.includes('The requested blob does not exist')) {
          console.warn('[TG Store] Could not load channels from Blob:', e);
        }
      }

      // Load messages
      try {
        const result = await get(BLOB_MESSAGES, { token, access: 'private' });
        if (result && result.stream) {
          const text = await new Response(result.stream).text();
          cacheMessages = JSON.parse(text);
          const totalMsgs = Object.values(cacheMessages).reduce((s, m) => s + m.length, 0);
          console.log(`[TG Store] Loaded ${totalMsgs} messages from Blob`);
        }
      } catch (e: any) {
        if (!e?.message?.includes('not_found') && !e?.message?.includes('The requested blob does not exist')) {
          console.warn('[TG Store] Could not load messages from Blob:', e);
        }
      }

      cacheLoaded = true;
    } catch (e) {
      console.error('[TG Store] Failed to load from Blob:', e);
      cacheLoaded = true; // Continue with empty cache
    } finally {
      loadPromise = null;
    }
  })();

  return loadPromise;
}

// ─── Persistence: Save to Blob (debounced) ───
let saveTimeout: NodeJS.Timeout | null = null;
let savePromise: Promise<void> | null = null;

async function saveToBlob(): Promise<void> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return; // No token = no persistence (dev mode)

  try {
    // Save channels
    await put(BLOB_CHANNELS, JSON.stringify(cacheChannels), {
      token,
      access: 'private',
      allowOverwrite: true,
      contentType: 'application/json',
    });

    // Save messages
    await put(BLOB_MESSAGES, JSON.stringify(cacheMessages), {
      token,
      access: 'private',
      allowOverwrite: true,
      contentType: 'application/json',
    });

    console.log(`[TG Store] Saved to Blob: ${Object.keys(cacheChannels).length} channels, ${Object.values(cacheMessages).reduce((s, m) => s + m.length, 0)} messages`);
  } catch (e) {
    console.error('[TG Store] Failed to save to Blob:', e);
  }
}

function scheduleSave(): void {
  if (saveTimeout) clearTimeout(saveTimeout);
  // Debounce: save 2 seconds after the last write
  saveTimeout = setTimeout(() => {
    savePromise = saveToBlob();
  }, 2000);
}

// ─── Ensure data is loaded before any operation ───
async function ensureLoaded(): Promise<void> {
  if (!cacheLoaded) {
    await loadFromBlob();
  }
}

// ─── Channel operations ───

export async function upsertChannel(data: {
  chatId: string | number;
  chatType: string;
  name: string;
  lastMessage?: string;
  isFromClient?: boolean;
  avatarUrl?: string | null;
}): Promise<TgChannel> {
  await ensureLoaded();

  const id = `tg_${data.chatId}`;
  const existing = cacheChannels[id];

  // Only increment unreadCount when isFromClient is true
  let unreadCount: number;
  if (existing) {
    unreadCount = data.isFromClient
      ? Math.max(0, existing.unreadCount + 1)
      : existing.unreadCount;
  } else {
    unreadCount = data.isFromClient ? 1 : 0;
  }

  // Preserve existing avatarUrl if not provided
  const avatarUrl = data.avatarUrl !== undefined ? data.avatarUrl : existing?.avatarUrl ?? null;

  const channel: TgChannel = {
    id,
    source: 'telegram',
    externalId: id,
    name: data.name || 'Telegram Chat',
    unreadCount,
    lastMessage: data.lastMessage?.substring(0, 100) || existing?.lastMessage || null,
    lastActivity: new Date().toISOString(),
    chatType: data.chatType,
    telegramChatId: String(data.chatId),
    avatarUrl,
  };

  // ALWAYS keep the channel — NEVER delete it
  cacheChannels[id] = channel;
  scheduleSave();
  return channel;
}

export async function getChannel(id: string): Promise<TgChannel | undefined> {
  await ensureLoaded();
  return cacheChannels[id];
}

export async function getAllChannels(): Promise<TgChannel[]> {
  await ensureLoaded();
  return Object.values(cacheChannels).sort(
    (a, b) => new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime()
  );
}

export async function resetUnread(channelId: string): Promise<void> {
  await ensureLoaded();
  const ch = cacheChannels[channelId];
  if (ch) {
    ch.unreadCount = 0;
    // ALWAYS keep the channel — do NOT remove it
    cacheChannels[channelId] = ch;
    scheduleSave();
  }
}

// ─── Message operations ───

export async function addMessage(data: {
  channelId: string;
  senderName: string;
  senderType: string;
  text: string;
  externalId: string;
  senderId?: number;
}): Promise<TgMessage> {
  await ensureLoaded();

  const channelMsgs = cacheMessages[data.channelId] || [];

  // Deduplicate by externalId
  const existing = channelMsgs.find(m => m.externalId === data.externalId);
  if (existing) return existing;

  const msg: TgMessage = {
    id: `tgm_${data.externalId}`,
    channelId: data.channelId,
    senderName: data.senderName,
    senderType: data.senderType,
    text: data.text,
    timestamp: new Date().toISOString(),
    isRead: false,
    externalId: data.externalId,
    senderId: data.senderId,
  };

  channelMsgs.push(msg);
  // Keep last 200 messages per channel (increased from 100)
  if (channelMsgs.length > 200) {
    cacheMessages[data.channelId] = channelMsgs.slice(-200);
  } else {
    cacheMessages[data.channelId] = channelMsgs;
  }

  scheduleSave();
  return msg;
}

export async function getMessages(channelId: string, limit = 50): Promise<TgMessage[]> {
  await ensureLoaded();
  const channelMsgs = cacheMessages[channelId] || [];
  return channelMsgs.slice(-limit);
}

export async function updateChannelAvatar(channelId: string, avatarUrl: string): Promise<void> {
  await ensureLoaded();
  const ch = cacheChannels[channelId];
  if (ch) {
    ch.avatarUrl = avatarUrl;
    cacheChannels[channelId] = ch;
    scheduleSave();
  }
}

export async function getStoreStats(): Promise<{ channels: number; messages: number }> {
  await ensureLoaded();
  return {
    channels: Object.keys(cacheChannels).length,
    messages: Object.values(cacheMessages).reduce((sum, msgs) => sum + msgs.length, 0),
  };
}

// ─── Force save (useful before shutdown / after batch operations) ───
export async function flushToBlob(): Promise<void> {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
    saveTimeout = null;
  }
  await saveToBlob();
}
