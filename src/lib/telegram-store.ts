// In-memory store for Telegram channels & messages
// Works on Vercel serverless (data persists within a single function instance lifetime)
// For production, migrate to Neon Postgres or Vercel KV

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

// Global store — survives hot reloads in dev, and within a single serverless invocation
const globalForStore = globalThis as unknown as {
  tgChannels: Map<string, TgChannel> | undefined;
  tgMessages: Map<string, TgMessage[]> | undefined;
};

const channels = globalForStore.tgChannels ?? new Map<string, TgChannel>();
const messages = globalForStore.tgMessages ?? new Map<string, TgMessage[]>();

if (!globalForStore.tgChannels) globalForStore.tgChannels = channels;
if (!globalForStore.tgMessages) globalForStore.tgMessages = messages;

// ─── Channel operations ───

export function upsertChannel(data: {
  chatId: string | number;
  chatType: string;
  name: string;
  lastMessage?: string;
  isFromClient?: boolean;
  avatarUrl?: string | null;
}): TgChannel {
  const id = `tg_${data.chatId}`;
  const existing = channels.get(id);

  // Only increment unreadCount when isFromClient is true
  // When isFromClient is false (operator/bot message), keep existing unreadCount
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

  // ALWAYS keep the channel in the store, even when unreadCount is 0
  channels.set(id, channel);
  return channel;
}

export function getChannel(id: string): TgChannel | undefined {
  return channels.get(id);
}

export function getAllChannels(): TgChannel[] {
  return Array.from(channels.values()).sort(
    (a, b) => new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime()
  );
}

export function resetUnread(channelId: string): void {
  const ch = channels.get(channelId);
  if (ch) {
    ch.unreadCount = 0;
    // Always keep the channel in the store — do NOT remove it
    channels.set(channelId, ch);
  }
}

// ─── Message operations ───

export function addMessage(data: {
  channelId: string;
  senderName: string;
  senderType: string;
  text: string;
  externalId: string;
  senderId?: number;
}): TgMessage {
  const channelMsgs = messages.get(data.channelId) || [];

  // Deduplicate by externalId
  if (channelMsgs.some(m => m.externalId === data.externalId)) {
    return channelMsgs.find(m => m.externalId === data.externalId)!;
  }

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
  // Keep last 100 messages per channel
  if (channelMsgs.length > 100) {
    channelMsgs.splice(0, channelMsgs.length - 100);
  }
  messages.set(data.channelId, channelMsgs);

  return msg;
}

export function getMessages(channelId: string, limit = 50): TgMessage[] {
  const channelMsgs = messages.get(channelId) || [];
  return channelMsgs.slice(-limit);
}

export function updateChannelAvatar(channelId: string, avatarUrl: string) {
  const ch = channels.get(channelId);
  if (ch) {
    ch.avatarUrl = avatarUrl;
    channels.set(channelId, ch);
  }
}

export function getStoreStats() {
  return {
    channels: channels.size,
    messages: Array.from(messages.values()).reduce((sum, msgs) => sum + msgs.length, 0),
  };
}
