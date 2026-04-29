'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

// ─── Types ───
interface Channel {
  id: string;
  source: string;
  externalId: string;
  name: string;
  unreadCount: number;
  lastMessage: string | null;
  lastActivity: string;
  messageCount?: number;
  unreadMessages?: number;
}

interface Message {
  id: string;
  channelId: string;
  senderName: string;
  senderType: string;
  text: string;
  timestamp: string;
  isRead: boolean;
  operatorId: string | null;
  externalId: string | null;
}

// ─── Source Config ───
const SOURCES: Record<string, { label: string; name: string; color: string; bg: string; icon: string }> = {
  bitrix1:  { label: 'BX1', name: 'Наш Битрикс', color: '#3B8BD4', bg: '#1e3a5f', icon: '🏢' },
  bitrix2:  { label: 'BX2', name: 'Дакар',       color: '#1D9E75', bg: '#1a3d2e', icon: '🏗️' },
  bitrix3:  { label: 'BX3', name: 'Клиент В',    color: '#534AB7', bg: '#2d2a5e', icon: '📋' },
  telegram: { label: 'TG',  name: 'Telegram',    color: '#229ED9', bg: '#1a3548', icon: '✈️' },
  max:      { label: 'MAX', name: 'MAX',          color: '#FF6B00', bg: '#3d2a10', icon: '💬' },
  whatsapp: { label: 'WA',  name: 'WhatsApp',     color: '#25D366', bg: '#1a3d24', icon: '📱' },
};

const SOURCE_ORDER = ['bitrix1', 'bitrix2', 'bitrix3', 'telegram', 'max', 'whatsapp'];

// ─── Components ───

function SourceBadge({ source }: { source: string }) {
  const s = SOURCES[source];
  if (!s) return null;
  return (
    <span
      style={{ background: s.bg, color: s.color, border: `1px solid ${s.color}33` }}
      className="text-[10px] font-bold px-1.5 py-0.5 rounded leading-none"
    >
      {s.label}
    </span>
  );
}

function UnreadBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="bg-red-500 text-white text-[11px] font-bold min-w-[20px] h-5 rounded-full flex items-center justify-center px-1.5">
      {count > 99 ? '99+' : count}
    </span>
  );
}

function ChatListItem({
  channel,
  isActive,
  onClick,
}: {
  channel: Channel;
  isActive: boolean;
  onClick: () => void;
}) {
  const src = SOURCES[channel.source] || SOURCES.bitrix1;
  const timeStr = formatTime(channel.lastActivity);

  return (
    <div
      className={`flex items-center gap-2.5 px-3 py-2.5 cursor-pointer transition-colors ${
        isActive ? 'bg-[#1e3a5f]' : 'hover:bg-[#1e293b]'
      }`}
      onClick={onClick}
    >
      <div
        className="w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold flex-shrink-0"
        style={{ background: src.bg, color: src.color }}
      >
        {channel.name.charAt(0)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <SourceBadge source={channel.source} />
          <span className="text-sm font-medium truncate">{channel.name}</span>
        </div>
        <div className="text-xs text-slate-400 truncate mt-0.5">
          {channel.lastMessage || 'Нет сообщений'}
        </div>
      </div>
      <div className="flex flex-col items-end gap-1 flex-shrink-0">
        <span className="text-[10px] text-slate-500">{timeStr}</span>
        <UnreadBadge count={channel.unreadCount} />
      </div>
    </div>
  );
}

function MessageBubble({ msg }: { msg: Message }) {
  const isOut = msg.senderType === 'operator';
  const time = new Date(msg.timestamp).toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className={`flex ${isOut ? 'justify-end' : 'justify-start'} mb-3`}>
      <div
        className={`max-w-[75%] px-4 py-2.5 ${
          isOut
            ? 'bg-[#1d4ed8] rounded-[16px_4px_16px_16px]'
            : 'bg-[#1e293b] rounded-[4px_16px_16px_16px]'
        }`}
      >
        <div
          className={`text-xs font-medium mb-1 ${
            isOut ? 'text-blue-200' : 'text-slate-400'
          }`}
        >
          {msg.senderName}
        </div>
        <div className="text-sm leading-relaxed whitespace-pre-wrap">{msg.text}</div>
        <div
          className={`text-[10px] mt-1 ${isOut ? 'text-blue-300' : 'text-slate-500'}`}
        >
          {time}
        </div>
      </div>
    </div>
  );
}

// ─── Helper ───
function formatTime(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffDays === 0) {
    return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  } else if (diffDays === 1) {
    return 'Вчера';
  } else if (diffDays < 7) {
    return `${diffDays} дн. назад`;
  } else {
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
  }
}

function groupChannels(channels: Channel[]) {
  const groups: Record<string, Channel[]> = {};
  for (const src of SOURCE_ORDER) {
    const items = channels.filter((c) => c.source === src);
    if (items.length > 0) groups[src] = items;
  }
  return groups;
}

// ─── Main App ───
export default function OmnichannelApp() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch channels
  const fetchChannels = useCallback(async () => {
    try {
      const res = await fetch('/api/channels');
      if (res.ok) {
        const data = await res.json();
        setChannels(data);
      }
    } catch (e) {
      console.error('Failed to fetch channels:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch messages for active channel
  const fetchMessages = useCallback(async (channelId: string) => {
    try {
      const res = await fetch(`/api/channels/${channelId}?limit=50`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data);
      }
    } catch (e) {
      console.error('Failed to fetch messages:', e);
    }
  }, []);

  // Sync Bitrix dialogs
  const syncBitrix = useCallback(async (portal: string) => {
    setSyncing(true);
    try {
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ portal }),
      });
      const data = await res.json();
      console.log('Sync result:', data);
      await fetchChannels();
    } catch (e) {
      console.error('Sync failed:', e);
    } finally {
      setSyncing(false);
    }
  }, [fetchChannels]);

  // Initial load
  useEffect(() => {
    fetchChannels();
  }, [fetchChannels]);

  // Auto-sync Bitrix on mount
  useEffect(() => {
    const doSync = async () => {
      await syncBitrix('bitrix1');
      await syncBitrix('bitrix2');
    };
    doSync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load messages when channel changes
  useEffect(() => {
    if (activeChannelId) {
      fetchMessages(activeChannelId);
    } else {
      setMessages([]);
    }
  }, [activeChannelId, fetchMessages]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Send message
  const handleSend = async () => {
    if (!inputText.trim() || !activeChannelId) return;
    setSending(true);
    try {
      const res = await fetch('/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelId: activeChannelId,
          text: inputText.trim(),
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setInputText('');
        await fetchMessages(activeChannelId);
        await fetchChannels();
      } else {
        alert(data.error || 'Ошибка отправки');
      }
    } catch (e) {
      console.error('Send failed:', e);
    } finally {
      setSending(false);
    }
  };

  const activeChannel = channels.find((c) => c.id === activeChannelId);
  const filteredChannels = searchQuery
    ? channels.filter(
        (c) =>
          c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (c.lastMessage || '').toLowerCase().includes(searchQuery.toLowerCase())
      )
    : channels;

  const grouped = groupChannels(filteredChannels);
  const totalUnread = channels.reduce((s, c) => s + c.unreadCount, 0);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* ─── LEFT PANEL: Channel List ─── */}
      <div
        className="w-[260px] flex-shrink-0 h-full flex flex-col border-r border-slate-800"
        style={{ background: '#0d1117' }}
      >
        <div className="px-3 pt-4 pb-2">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-bold text-white">Все чаты</h2>
            <div className="flex items-center gap-1">
              <button
                onClick={() => syncBitrix('bitrix1')}
                disabled={syncing}
                className="w-7 h-7 rounded-lg bg-slate-800 text-slate-400 flex items-center justify-center hover:bg-slate-700 hover:text-white transition-colors text-xs"
                title="Синхронизировать Битрикс"
              >
                {syncing ? '⏳' : '🔄'}
              </button>
            </div>
          </div>
          <input
            className="w-full bg-[#1e293b] border border-slate-700 rounded-lg text-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500 placeholder-slate-500"
            placeholder="Поиск чатов..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="text-center text-slate-500 py-8 text-sm">
              Загрузка чатов...
            </div>
          ) : channels.length === 0 ? (
            <div className="text-center text-slate-500 py-8 text-sm px-4">
              Чатов пока нет. Синхронизируйте Битрикс или подключите Telegram.
            </div>
          ) : (
            Object.entries(grouped).map(([source, items]) => {
              const src = SOURCES[source];
              const groupUnread = items.reduce((s, c) => s + c.unreadCount, 0);
              return (
                <div key={source}>
                  <div className="flex items-center gap-2 px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ background: src?.color || '#666' }}
                    />
                    <span>{src?.name || source}</span>
                    <span className="text-slate-600 ml-auto">{items.length}</span>
                    {groupUnread > 0 && <UnreadBadge count={groupUnread} />}
                  </div>
                  {items.map((ch) => (
                    <ChatListItem
                      key={ch.id}
                      channel={ch}
                      isActive={ch.id === activeChannelId}
                      onClick={() => setActiveChannelId(ch.id)}
                    />
                  ))}
                </div>
              );
            })
          )}
        </div>

        <div className="px-3 py-3 border-t border-slate-800 text-center">
          <div className="text-[11px] text-slate-600">
            {channels.length} чатов · {totalUnread} непрочитанных
          </div>
        </div>
      </div>

      {/* ─── CENTER PANEL: Messages ─── */}
      <div className="flex-1 flex flex-col h-full" style={{ background: '#0f1117' }}>
        {!activeChannel ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center text-slate-500">
              <div className="text-5xl mb-4">💬</div>
              <div className="text-lg font-medium">Выберите чат</div>
              <div className="text-sm mt-1">
                Чтобы начать, выберите чат в левой колонке
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Top bar */}
            <div
              className="flex items-center gap-3 px-5 py-3 border-b border-slate-800"
              style={{ background: '#0d1117' }}
            >
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold"
                style={{
                  background: SOURCES[activeChannel.source]?.bg || '#1e293b',
                  color: SOURCES[activeChannel.source]?.color || '#ccc',
                }}
              >
                {activeChannel.name.charAt(0)}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{activeChannel.name}</span>
                  <SourceBadge source={activeChannel.source} />
                </div>
                <div className="text-[11px] text-slate-500">
                  {SOURCES[activeChannel.source]?.name} · {activeChannel.externalId}
                </div>
              </div>
              <div className="ml-auto flex items-center gap-2">
                {activeChannel.source.startsWith('bitrix') && (
                  <a
                    href={`https://${activeChannel.source === 'bitrix1' ? '1c-cms' : activeChannel.source === 'bitrix2' ? 'dakar' : ''}.bitrix24.ru`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-slate-500 hover:text-blue-400 transition-colors"
                  >
                    Открыть в Битрикс24 ↗
                  </a>
                )}
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {messages.length === 0 ? (
                <div className="text-center text-slate-500 py-8 text-sm">
                  Нет сообщений в этом чате
                </div>
              ) : (
                messages.map((msg) => <MessageBubble key={msg.id} msg={msg} />)
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div
              className="px-5 py-3 border-t border-slate-800"
              style={{ background: '#0d1117' }}
            >
              <div className="flex items-center gap-2 bg-[#1e293b] border border-slate-700 rounded-xl px-4 py-2 focus-within:border-blue-500 transition-colors">
                <input
                  className="flex-1 bg-transparent outline-none text-sm text-slate-200 placeholder-slate-500"
                  placeholder="Написать сообщение..."
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  disabled={sending}
                />
                <button
                  className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg px-4 py-1.5 text-sm font-medium transition-colors"
                  onClick={handleSend}
                  disabled={sending || !inputText.trim()}
                >
                  {sending ? '...' : 'Отправить'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ─── RIGHT PANEL: Contact Info ─── */}
      <div
        className="w-[270px] flex-shrink-0 h-full border-l border-slate-800 flex flex-col"
        style={{ background: '#0d1117' }}
      >
        {!activeChannel ? (
          <div className="flex items-center justify-center h-full text-slate-600 text-sm">
            Нет выбранного чата
          </div>
        ) : (
          <>
            <div className="px-5 py-6 text-center border-b border-slate-800">
              <div
                className="w-16 h-16 rounded-full mx-auto flex items-center justify-center text-xl font-bold mb-3"
                style={{
                  background: SOURCES[activeChannel.source]?.bg || '#1e293b',
                  color: SOURCES[activeChannel.source]?.color || '#ccc',
                }}
              >
                {activeChannel.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
              </div>
              <div className="text-sm font-semibold">{activeChannel.name}</div>
              <div className="flex items-center justify-center gap-1.5 mt-1.5">
                <SourceBadge source={activeChannel.source} />
                <span className="text-xs text-slate-500">
                  {SOURCES[activeChannel.source]?.name}
                </span>
              </div>
              <div className="text-xs text-slate-500 mt-1">
                {activeChannel.externalId}
              </div>
            </div>

            <div className="px-5 py-4 flex-1">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                Информация
              </div>
              <div className="space-y-2 text-sm text-slate-400">
                <div className="flex items-center gap-2">
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: SOURCES[activeChannel.source]?.color || '#666' }}
                  />
                  Сообщений: {activeChannel.messageCount || messages.length}
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: SOURCES[activeChannel.source]?.color || '#666' }}
                  />
                  Непрочитанных: {activeChannel.unreadCount}
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: SOURCES[activeChannel.source]?.color || '#666' }}
                  />
                  Последняя активность: {formatTime(activeChannel.lastActivity)}
                </div>
              </div>
            </div>

            <div className="px-5 py-4 border-t border-slate-800">
              {activeChannel.source.startsWith('bitrix') && (
                <a
                  href={`https://${activeChannel.source === 'bitrix1' ? '1c-cms' : activeChannel.source === 'bitrix2' ? 'dakar' : ''}.bitrix24.ru`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full py-2.5 rounded-lg text-sm font-medium border border-slate-700 text-slate-300 hover:bg-slate-800 transition-colors text-center"
                >
                  Открыть в Битрикс24
                </a>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
