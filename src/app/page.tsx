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
  avatarUrl?: string | null;
}

interface Message {
  id: string;
  channelId: string;
  senderName: string;
  senderType: string;
  senderId?: number;
  senderAvatar?: string | null;
  text: string;
  timestamp: string;
  isRead: boolean;
  operatorId: string | null;
  externalId: string | null;
  files?: MessageFile[];
}

interface MessageFile {
  id: number;
  type: string;
  name: string;
  urlPreview: string;
  urlShow: string;
  urlDownload: string;
  image?: { width: number; height: number };
}

// ─── Version ───
const APP_VERSION = 'v2.0';

// ─── Source Config ───
const SOURCES: Record<string, { label: string; name: string; color: string; bg: string; icon: string }> = {
  bitrix1:  { label: 'BX1', name: 'АтиЛаб (Наш Битрикс)', color: '#3B8BD4', bg: '#1e3a5f', icon: '🏢' },
  bitrix2:  { label: 'BX2', name: 'Дакар',               color: '#1D9E75', bg: '#1a3d2e', icon: '🏗️' },
  bitrix3:  { label: 'BX3', name: 'Клиент В',            color: '#534AB7', bg: '#2d2a5e', icon: '📋' },
  telegram: { label: 'TG',  name: 'ТГ Чаты',             color: '#229ED9', bg: '#1a3548', icon: '✈️' },
  max:      { label: 'MAX', name: 'МАКС',                color: '#FF6B00', bg: '#3d2a10', icon: '💬' },
  whatsapp: { label: 'WA',  name: 'WhatsApp',             color: '#25D366', bg: '#1a3d24', icon: '📱' },
};

const SOURCE_ORDER = ['bitrix1', 'bitrix2', 'bitrix3', 'telegram', 'max', 'whatsapp'];

// ─── SVG Icon Components (Modern Flat UI) ───

function FilterIcon({ size = 20 }: { size?: number }) {
  // Horizontal filter icon: two parallel lines with small circular toggles
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <line x1="4" y1="8" x2="20" y2="8" />
      <circle cx="8" cy="8" r="2.5" fill="currentColor" stroke="currentColor" strokeWidth="1.5" />
      <line x1="4" y1="16" x2="20" y2="16" />
      <circle cx="16" cy="16" r="2.5" fill="currentColor" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function SearchIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="11" cy="11" r="7" />
      <line x1="16.5" y1="16.5" x2="21" y2="21" />
    </svg>
  );
}

function ComposeIcon({ size = 20 }: { size?: number }) {
  // Pencil inside a square/note — compose message icon
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M15 3v6h6" />
      <line x1="9" y1="13" x2="15" y2="13" />
      <line x1="9" y1="17" x2="13" y2="17" />
    </svg>
  );
}

function ChevronIcon({ open, size = 14 }: { open: boolean; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

// ─── UI Components ───

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
  const timeStr = formatTime(channel.lastActivity);
  const hasUnread = channel.unreadCount > 0;

  return (
    <div
      className={`flex items-center gap-2.5 px-3 py-2.5 cursor-pointer transition-colors ${
        isActive ? 'bg-[#1e3a5f]' : 'hover:bg-[#1e293b]'
      }`}
      onClick={onClick}
    >
      {/* Avatar with unread dot */}
      <div className="relative flex-shrink-0">
        {channel.avatarUrl ? (
          <img
            src={channel.avatarUrl}
            alt={channel.name}
            className="w-10 h-10 rounded-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
              const sibling = (e.target as HTMLImageElement).nextElementSibling as HTMLElement;
              if (sibling) sibling.style.display = 'flex';
            }}
          />
        ) : null}
        <div
          className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${channel.avatarUrl ? 'hidden' : ''}`}
          style={{ background: getAvatarColor(channel.name), color: '#fff' }}
        >
          {channel.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
        </div>
        {hasUnread && (
          <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-red-500 rounded-full border-2 border-[#0d1117]" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <SourceBadge source={channel.source} />
          <span className={`text-sm truncate ${hasUnread ? 'font-bold text-white' : 'font-medium'}`}>{channel.name}</span>
        </div>
        <div className={`text-xs truncate mt-0.5 ${hasUnread ? 'text-slate-200 font-medium' : 'text-slate-400'}`}>
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

// Subtle muted colors
const MSG_STYLE = {
  incoming: {
    bubble: '#1c2533',
    name: '#8899aa',
    text: '#c8d1db',
    time: '#5a6a7a',
  },
  outgoing: {
    bubble: '#162d24',
    name: '#5ab877',
    text: '#c8d1db',
    time: '#3a7a5a',
  },
};

// ─── Avatar color from name hash ───
const AVATAR_COLORS = [
  '#c0392b', '#e67e22', '#f39c12', '#27ae60', '#2980b9',
  '#8e44ad', '#d35400', '#16a085', '#2c3e50', '#c0392b',
  '#e74c3c', '#3498db', '#1abc9c', '#9b59b6', '#34495e',
];

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function SenderAvatar({ name, avatarUrl, size = 32 }: { name: string; avatarUrl?: string | null; size?: number }) {
  const color = getAvatarColor(name);
  const initials = getInitials(name);

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className="rounded-full object-cover flex-shrink-0"
        style={{ width: size, height: size }}
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = 'none';
          const parent = (e.target as HTMLImageElement).parentElement;
          if (parent) {
            const fallback = parent.querySelector('.avatar-fallback') as HTMLElement;
            if (fallback) fallback.style.display = 'flex';
          }
        }}
      />
    );
  }

  return (
    <div
      className="rounded-full flex items-center justify-center text-white font-bold flex-shrink-0"
      style={{
        width: size,
        height: size,
        background: color,
        fontSize: size * 0.35,
      }}
    >
      {initials}
    </div>
  );
}

// ─── Rich text: clickable links ───
function RichText({ text }: { text: string }) {
  const parts: (string | { url: string; label: string })[] = [];
  const regex = /\[URL=([^\]]+)\]([^\[]+)\[\/URL\]|\[URL\]([^\[]+)\[\/URL\]|(\bhttps?:\/\/[^\s\[\]<>"')\]]+)/gi;
  let lastIndex = 0;
  let match;
  
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    if (match[1] && match[2]) {
      parts.push({ url: match[1], label: match[2] });
    } else if (match[3]) {
      parts.push({ url: match[3], label: match[3] });
    } else if (match[4]) {
      parts.push({ url: match[4], label: match[4] });
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  if (parts.length === 0) {
    return <>{text}</>;
  }
  return (
    <>
      {parts.map((part, i) => {
        if (typeof part === 'string') {
          const cleaned = part.replace(/\[USER=\d+\]([^\[]+)\[\/USER\]/gi, '$1');
          return <span key={i}>{cleaned}</span>;
        }
        return (
          <a
            key={i}
            href={part.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:text-blue-300 underline decoration-blue-400/50 hover:decoration-blue-300 transition-colors"
          >
            {part.label}
          </a>
        );
      })}
    </>
  );
}

function MessageBubble({ msg, showName, currentUserName }: { msg: Message; showName: boolean; currentUserName: string }) {
  const isMe = msg.senderType === 'operator' || 
    (currentUserName && msg.senderName.toLowerCase().trim() === currentUserName.toLowerCase().trim());
  const time = new Date(msg.timestamp).toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  });
  const s = isMe ? MSG_STYLE.outgoing : MSG_STYLE.incoming;

  return (
    <div className="flex gap-2 justify-start mb-2">
      <div className="flex-shrink-0 pt-0.5">
        {showName ? (
          <SenderAvatar name={msg.senderName} avatarUrl={msg.senderAvatar} size={32} />
        ) : (
          <div style={{ width: 32 }} />
        )}
      </div>
      <div
        className="max-w-[70%] px-3.5 py-2 rounded-[4px_16px_16px_16px]"
        style={{ background: s.bubble }}
      >
        {showName && (
          <div className="text-xs font-medium mb-0.5" style={{ color: s.name }}>
            {msg.senderName}
          </div>
        )}
        {msg.text && (
          <div className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: s.text }}>
            <RichText text={msg.text} />
          </div>
        )}
        {msg.files && msg.files.length > 0 && (
          <div className="flex flex-col gap-1.5 mt-1.5">
            {msg.files.map((file) => (
              <a key={file.id} href={file.urlDownload} target="_blank" rel="noopener noreferrer">
                <img
                  src={file.urlPreview}
                  alt={file.name}
                  className="max-w-full rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                  style={{ maxHeight: 240 }}
                  loading="lazy"
                />
              </a>
            ))}
          </div>
        )}
        <div className="text-[10px] mt-0.5 text-right" style={{ color: s.time }}>
          {time}
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ───
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

function formatTimeFull(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

function groupChannels(channels: Channel[]) {
  const groups: Record<string, Channel[]> = {};
  for (const src of SOURCE_ORDER) {
    const items = channels.filter((c) => c.source === src);
    groups[src] = items; // Always include all groups, even if empty
  }
  return groups;
}

function getBitrixDomain(source: string): string | null {
  switch (source) {
    case 'bitrix1': return '1c-cms.bitrix24.ru';
    case 'bitrix2': return 'dakar.bitrix24.ru';
    default: return null;
  }
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
  
  const [currentUserName, setCurrentUserName] = useState<string>('');
  const [userNameInput, setUserNameInput] = useState<string>('');
  const [showNameSelector, setShowNameSelector] = useState(false);
  
  // Collapsible groups state — persist in localStorage
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('omnichannel_collapsed_groups');
      return saved ? JSON.parse(saved) : {};
    }
    return {};
  });

  // Modals
  const [showAddChatModal, setShowAddChatModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [tgWebhookStatus, setTgWebhookStatus] = useState<string>('');
  const [tgWebhookLoading, setTgWebhookLoading] = useState(false);

  // Escape key to close all modals
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowAddChatModal(false);
        setShowSettingsModal(false);
        setShowNameSelector(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Load saved user name
  useEffect(() => {
    const saved = localStorage.getItem('omnichannel_current_user');
    if (saved) {
      setCurrentUserName(saved);
      setUserNameInput(saved);
    } else {
      setShowNameSelector(true);
    }
  }, []);

  // Persist collapsed groups
  useEffect(() => {
    localStorage.setItem('omnichannel_collapsed_groups', JSON.stringify(collapsedGroups));
  }, [collapsedGroups]);

  const toggleGroup = (source: string) => {
    setCollapsedGroups(prev => ({ ...prev, [source]: !prev[source] }));
  };

  // Mark channel as read (optimistic + server)
  const markChannelRead = useCallback(async (channelId: string) => {
    // Optimistic: immediately clear unread in local state
    setChannels(prev => prev.map(ch =>
      ch.id === channelId ? { ...ch, unreadCount: 0 } : ch
    ));
    // Server: notify backend to mark as read
    try {
      await fetch(`/api/channels/${channelId}/read`, { method: 'POST' });
    } catch (e) {
      // Silently fail — the next poll will sync the correct state
    }
  }, []);

  // Handle channel click — select + mark as read
  const handleChannelClick = useCallback((channelId: string) => {
    setActiveChannelId(channelId);
    markChannelRead(channelId);
  }, [markChannelRead]);

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

  // Fetch messages
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

  // Sync
  const syncBitrix = useCallback(async (portal: string) => {
    setSyncing(true);
    try {
      await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ portal }),
      });
      await fetchChannels();
    } catch (e) {
      console.error('Sync failed:', e);
    } finally {
      setSyncing(false);
    }
  }, [fetchChannels]);

  const syncAll = useCallback(async () => {
    setSyncing(true);
    try {
      await fetch('/api/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ portal: 'bitrix1' }) });
      await fetch('/api/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ portal: 'bitrix2' }) });
      await fetchChannels();
    } catch (e) {
      console.error('Sync all failed:', e);
    } finally {
      setSyncing(false);
    }
  }, [fetchChannels]);

  // Auto-polling: refresh channels every 5 seconds, messages every 3 seconds
  // Track unread changes for notification sound
  const prevTotalUnreadRef = useRef(0);

  useEffect(() => {
    fetchChannels();
    const interval = setInterval(fetchChannels, 5000);
    return () => clearInterval(interval);
  }, [fetchChannels]);

  // Play notification sound when new unread messages appear
  useEffect(() => {
    const totalUnread = channels.reduce((s, c) => s + c.unreadCount, 0);
    if (totalUnread > prevTotalUnreadRef.current && prevTotalUnreadRef.current >= 0) {
      // New messages arrived — play subtle notification
      try {
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 800;
        gain.gain.value = 0.08;
        osc.start();
        osc.stop(ctx.currentTime + 0.1);
        setTimeout(() => ctx.close(), 200);
      } catch (e) {
        // Audio not available — ignore
      }
    }
    prevTotalUnreadRef.current = totalUnread;
  }, [channels]);

  useEffect(() => {
    if (!activeChannelId) { setMessages([]); return; }
    fetchMessages(activeChannelId);
    const interval = setInterval(() => fetchMessages(activeChannelId), 3000);
    return () => clearInterval(interval);
  }, [activeChannelId, fetchMessages]);

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
        body: JSON.stringify({ channelId: activeChannelId, text: inputText.trim(), operatorId: currentUserName || undefined }),
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

  // Telegram webhook setup
  const setupTelegramWebhook = async () => {
    setTgWebhookLoading(true);
    setTgWebhookStatus('');
    try {
      const res = await fetch('/api/telegram/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'https://my-project-eta-lemon.vercel.app' }),
      });
      const data = await res.json();
      setTgWebhookStatus(data.ok ? 'Webhook зарегистрирован!' : `Ошибка: ${data.error || 'Не удалось установить webhook'}`);
    } catch (e) {
      setTgWebhookStatus('Ошибка сети при настройке webhook');
    } finally {
      setTgWebhookLoading(false);
    }
  };

  const checkTgWebhook = async () => {
    try {
      const res = await fetch('/api/telegram/setup');
      const data = await res.json();
      setTgWebhookStatus(data.webhookInfo?.url ? `Webhook: ${data.webhookInfo.url}` : 'Webhook не настроен');
    } catch (e) {
      setTgWebhookStatus('Не удалось проверить статус');
    }
  };

  const activeChannel = channels.find((c) => c.id === activeChannelId);
  const filteredChannels = searchQuery
    ? channels.filter((c) =>
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (c.lastMessage || '').toLowerCase().includes(searchQuery.toLowerCase())
      )
    : channels;

  const grouped = groupChannels(filteredChannels);
  const totalUnread = channels.reduce((s, c) => s + c.unreadCount, 0);
  const uniqueSenders = messages.length > 0 ? [...new Set(messages.map(m => m.senderName))].length : 0;

  return (
    <div className="flex h-screen overflow-hidden">
      {/* ─── LEFT PANEL: Channel List (320px) ─── */}
      <div
        className="w-[320px] flex-shrink-0 h-full flex flex-col border-r border-slate-800"
        style={{ background: '#0d1117' }}
      >
        {/* ─── Header: Title + Version ─── */}
        <div className="px-4 pt-4 pb-1">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-white">
              Все чаты <span className="text-sm font-bold text-white/90 ml-2">{APP_VERSION}</span>
            </h2>
          </div>
        </div>

        {/* ─── Toolbar: Filter | Search | Compose ─── */}
        <div className="px-4 py-2 flex items-center gap-2">
          {/* Filter / Settings button */}
          <button
            onClick={() => setShowSettingsModal(true)}
            className="w-9 h-9 rounded-xl bg-slate-800/80 text-slate-400 flex items-center justify-center hover:bg-slate-700 hover:text-white transition-colors flex-shrink-0"
            title="Настройки дашборда"
          >
            <FilterIcon size={18} />
          </button>

          {/* Search input */}
          <div className="flex-1 relative">
            <div className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500">
              <SearchIcon size={14} />
            </div>
            <input
              className="w-full bg-[#1e293b] border border-slate-700 rounded-xl text-slate-200 pl-8 pr-3 py-2 text-sm outline-none focus:border-blue-500 placeholder-slate-500"
              placeholder="Поиск чатов..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Add chat button — same style as settings button */}
          <button
            onClick={() => setShowAddChatModal(true)}
            className="w-9 h-9 rounded-xl bg-slate-800/80 text-slate-400 flex items-center justify-center hover:bg-slate-700 hover:text-white transition-colors flex-shrink-0"
            title="Добавить чат"
          >
            <ComposeIcon size={16} />
          </button>
        </div>

        {/* Current user indicator */}
        {currentUserName && (
          <div className="flex items-center gap-2 px-4 pb-2">
            <SenderAvatar name={currentUserName} size={20} />
            <span className="text-[11px] text-slate-300 font-medium">{currentUserName}</span>
            <span className="text-[10px] text-slate-500">· {APP_VERSION}</span>
          </div>
        )}

        {/* ─── Channel Groups (collapsible) ─── */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="text-center text-slate-500 py-8 text-sm">Загрузка чатов...</div>
          ) : (
            SOURCE_ORDER.map((source) => {
              const src = SOURCES[source];
              const items = grouped[source] || [];
              const isCollapsed = collapsedGroups[source] || false;
              const groupUnread = items.reduce((s, c) => s + c.unreadCount, 0);

              return (
                <div key={source}>
                  {/* Group header — clickable to expand/collapse */}
                  <button
                    className="w-full flex items-center gap-2 px-4 py-2 text-[12px] font-semibold text-slate-400 uppercase tracking-wider hover:bg-slate-800/50 transition-colors"
                    onClick={() => toggleGroup(source)}
                  >
                    <ChevronIcon open={!isCollapsed} />
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ background: src?.color || '#666' }}
                    />
                    <span className="truncate text-left">{src?.name || source}</span>
                    <span className="text-slate-600 ml-auto">{items.length}</span>
                    {groupUnread > 0 && <UnreadBadge count={groupUnread} />}
                  </button>

                  {/* Expanded: chat items */}
                  {!isCollapsed && (
                    items.length === 0 ? (
                      <div className="text-[11px] text-slate-600 px-4 pl-10 py-2 italic">Пусто</div>
                    ) : (
                      items.map((ch) => (
                        <ChatListItem
                          key={ch.id}
                          channel={ch}
                          isActive={ch.id === activeChannelId}
                          onClick={() => handleChannelClick(ch.id)}
                        />
                      ))
                    )
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer stats */}
        <div className="px-4 py-3 border-t border-slate-800 text-center">
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
              <div className="text-sm mt-1">Чтобы начать, выберите чат в левой колонке</div>
            </div>
          </div>
        ) : (
          <>
            {/* Header above chat */}
            <div className="border-b border-slate-800" style={{ background: '#0d1117' }}>
              <div className="flex items-center gap-3 px-5 py-2.5">
                {/* Channel avatar */}
                {activeChannel.avatarUrl ? (
                  <img
                    src={activeChannel.avatarUrl}
                    alt={activeChannel.name}
                    className="w-9 h-9 rounded-full object-cover flex-shrink-0"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                      const fallback = (e.target as HTMLImageElement).nextElementSibling as HTMLElement;
                      if (fallback) fallback.style.display = 'flex';
                    }}
                  />
                ) : null}
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${activeChannel.avatarUrl ? 'hidden' : ''}`}
                  style={{ background: getAvatarColor(activeChannel.name), color: '#fff' }}
                >
                  {activeChannel.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold truncate">{activeChannel.name}</span>
                    <SourceBadge source={activeChannel.source} />
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-0.5">
                    <span>{messages.length} сообщ.</span>
                    {activeChannel.unreadCount > 0 && (
                      <span className="text-red-400">{activeChannel.unreadCount} непроч.</span>
                    )}
                    <span>{uniqueSenders} участников</span>
                    {activeChannel.lastActivity && (
                      <span>· {formatTimeFull(activeChannel.lastActivity)}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {getBitrixDomain(activeChannel.source) && (
                    <a
                      href={`https://${getBitrixDomain(activeChannel.source)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-slate-500 hover:text-blue-400 transition-colors px-2 py-1 rounded hover:bg-slate-800"
                    >
                      Битрикс24 ↗
                    </a>
                  )}
                </div>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {messages.length === 0 ? (
                <div className="text-center text-slate-500 py-8 text-sm">Нет сообщений в этом чате</div>
              ) : (
                messages.map((msg, idx) => {
                  const prevMsg = idx > 0 ? messages[idx - 1] : null;
                  const showName = !prevMsg || prevMsg.senderName !== msg.senderName;
                  return <MessageBubble key={msg.id} msg={msg} showName={showName} currentUserName={currentUserName} />;
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="px-5 py-3 border-t border-slate-800" style={{ background: '#0d1117' }}>
              <div className="flex items-center gap-2 bg-[#1e293b] border border-slate-700 rounded-xl px-4 py-2 focus-within:border-blue-500 transition-colors">
                <input
                  className="flex-1 bg-transparent outline-none text-sm text-slate-200 placeholder-slate-500"
                  placeholder="Написать сообщение..."
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
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

      {/* ─── RIGHT PANEL: Controls & Actions ─── */}
      <div
        className="w-[260px] flex-shrink-0 h-full border-l border-slate-800 flex flex-col"
        style={{ background: '#0d1117' }}
      >
        {!activeChannel ? (
          <div className="flex items-center justify-center h-full text-slate-600 text-sm">
            Нет выбранного чата
          </div>
        ) : (
          <>
            {/* Contact card */}
            <div className="px-4 py-5 text-center border-b border-slate-800">
              {activeChannel.avatarUrl ? (
                <img
                  src={activeChannel.avatarUrl}
                  alt={activeChannel.name}
                  className="w-14 h-14 rounded-full mx-auto object-cover mb-2.5"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                    const fallback = (e.target as HTMLImageElement).nextElementSibling as HTMLElement;
                    if (fallback) fallback.style.display = 'flex';
                  }}
                />
              ) : null}
              <div
                className={`w-14 h-14 rounded-full mx-auto flex items-center justify-center text-lg font-bold mb-2.5 text-white ${activeChannel.avatarUrl ? 'hidden' : ''}`}
                style={{ background: getAvatarColor(activeChannel.name) }}
              >
                {activeChannel.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
              </div>
              <div className="text-sm font-semibold">{activeChannel.name}</div>
              <div className="flex items-center justify-center gap-1.5 mt-1.5">
                <SourceBadge source={activeChannel.source} />
                <span className="text-xs text-slate-500">{SOURCES[activeChannel.source]?.name}</span>
              </div>
              <div className="text-[10px] text-slate-600 mt-1">{activeChannel.externalId}</div>
            </div>

            {/* Actions */}
            <div className="px-4 py-4 flex-1 overflow-y-auto">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Действия</div>
              <div className="space-y-2">
                <button
                  onClick={() => setShowAddChatModal(true)}
                  className="w-full flex items-center gap-2.5 py-2.5 px-3 rounded-lg text-sm text-slate-300 hover:bg-[#1a3548] border border-slate-700 hover:border-[#229ED9]/30 transition-colors"
                >
                  <span className="text-lg">✈️</span>
                  <div className="text-left">
                    <div className="font-medium">Добавить Telegram</div>
                    <div className="text-[10px] text-slate-500">Подключить чат или группу</div>
                  </div>
                </button>

                {getBitrixDomain(activeChannel.source) && (
                  <a
                    href={`https://${getBitrixDomain(activeChannel.source)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full flex items-center gap-2.5 py-2.5 px-3 rounded-lg text-sm text-slate-300 hover:bg-[#1e3a5f] border border-slate-700 hover:border-[#3B8BD4]/30 transition-colors"
                  >
                    <span className="text-lg">🏢</span>
                    <div className="text-left">
                      <div className="font-medium">Открыть в Битрикс24</div>
                      <div className="text-[10px] text-slate-500">Перейти к чату в портале</div>
                    </div>
                  </a>
                )}

                {activeChannel.source.startsWith('bitrix') && (
                  <button
                    onClick={() => syncBitrix(activeChannel.source)}
                    disabled={syncing}
                    className="w-full flex items-center gap-2.5 py-2.5 px-3 rounded-lg text-sm text-slate-300 hover:bg-slate-800 border border-slate-700 transition-colors disabled:opacity-50"
                  >
                    <span className="text-lg">{syncing ? '⏳' : '🔄'}</span>
                    <div className="text-left">
                      <div className="font-medium">Синхронизировать</div>
                      <div className="text-[10px] text-slate-500">Обновить сообщения</div>
                    </div>
                  </button>
                )}
              </div>

              {/* Chat details */}
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 mt-5">Детали чата</div>
              <div className="space-y-2 text-sm text-slate-400">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: SOURCES[activeChannel.source]?.color || '#666' }} />
                  <span className="truncate">Сообщений: {activeChannel.messageCount || messages.length}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: activeChannel.unreadCount > 0 ? '#ef4444' : '#666' }} />
                  <span className="truncate">Непрочитанных: {activeChannel.unreadCount}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#666' }} />
                  <span className="truncate">Участников: {uniqueSenders}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#666' }} />
                  <span className="truncate">Активность: {formatTimeFull(activeChannel.lastActivity)}</span>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ─── SETTINGS MODAL ─── */}
      {showSettingsModal && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
          onClick={() => setShowSettingsModal(false)}
        >
          <div
            className="bg-[#151b28] border border-slate-700 rounded-2xl p-6 w-[520px] max-w-[90vw] max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-slate-400">
                  <FilterIcon size={20} />
                </div>
                <div>
                  <div className="text-lg font-bold text-white">Настройки дашборда</div>
                  <div className="text-xs text-slate-500">{APP_VERSION}</div>
                </div>
              </div>
              <button
                onClick={() => setShowSettingsModal(false)}
                className="w-8 h-8 rounded-lg bg-slate-800 text-slate-400 flex items-center justify-center hover:bg-slate-700 hover:text-white transition-colors text-sm"
              >
                ✕
              </button>
            </div>

            {/* Operator Identity */}
            <div className="mb-5">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Оператор</div>
              <div className="flex items-center gap-3 bg-[#1e293b] rounded-xl p-3 border border-slate-700">
                <SenderAvatar name={currentUserName || 'Оператор'} size={36} />
                <div className="flex-1">
                  <div className="text-sm font-medium text-white">{currentUserName || 'Не указано'}</div>
                  <div className="text-[11px] text-slate-500">Ваши сообщения подсвечены зелёным</div>
                </div>
                <button
                  onClick={() => { setShowSettingsModal(false); setShowNameSelector(true); }}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors"
                >
                  Изменить
                </button>
              </div>
            </div>

            {/* Sync */}
            <div className="mb-5">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Синхронизация</div>
              <div className="space-y-2">
                <button
                  onClick={syncAll}
                  disabled={syncing}
                  className="w-full flex items-center gap-3 py-2.5 px-3 rounded-xl text-sm text-slate-300 hover:bg-slate-800 border border-slate-700 transition-colors disabled:opacity-50"
                >
                  <span className="text-lg">{syncing ? '⏳' : '🔄'}</span>
                  <div className="text-left">
                    <div className="font-medium">Синхронизировать все порталы</div>
                    <div className="text-[10px] text-slate-500">Обновить чаты и сообщения из Битрикс24</div>
                  </div>
                </button>
              </div>
            </div>

            {/* Telegram Bot */}
            <div className="mb-5">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Telegram бот</div>
              <div className="space-y-2">
                <div className="flex gap-2">
                  <button
                    onClick={setupTelegramWebhook}
                    disabled={tgWebhookLoading}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#229ED9] hover:bg-[#1b8ac4] text-white transition-colors disabled:opacity-50"
                  >
                    {tgWebhookLoading ? 'Настройка...' : 'Настроить Webhook'}
                  </button>
                  <button
                    onClick={checkTgWebhook}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700 transition-colors"
                  >
                    Проверить статус
                  </button>
                </div>
                {tgWebhookStatus && (
                  <div className="text-xs text-slate-400 bg-slate-800/50 rounded-lg p-2">
                    {tgWebhookStatus}
                  </div>
                )}
              </div>
            </div>

            {/* Connected Portals */}
            <div className="mb-5">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Подключённые порталы</div>
              <div className="space-y-2">
                <div className="flex items-center gap-3 bg-[#1e293b] rounded-xl p-3 border border-slate-700">
                  <span className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold" style={{ background: '#1e3a5f', color: '#3B8BD4' }}>1</span>
                  <div className="flex-1">
                    <div className="text-sm font-medium text-white">АтиЛаб (Наш Битрикс)</div>
                    <div className="text-[10px] text-slate-500">1c-cms.bitrix24.ru · Чтение и запись</div>
                  </div>
                  <span className="w-2 h-2 rounded-full bg-green-500" title="Активен" />
                </div>
                <div className="flex items-center gap-3 bg-[#1e293b] rounded-xl p-3 border border-slate-700">
                  <span className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold" style={{ background: '#1a3d2e', color: '#1D9E75' }}>2</span>
                  <div className="flex-1">
                    <div className="text-sm font-medium text-white">Дакар</div>
                    <div className="text-[10px] text-slate-500">dakar.bitrix24.ru · Только чтение (стелс)</div>
                  </div>
                  <span className="w-2 h-2 rounded-full bg-green-500" title="Активен" />
                </div>
                <div className="flex items-center gap-3 bg-[#1e293b] rounded-xl p-3 border border-slate-700 opacity-50">
                  <span className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold" style={{ background: '#1a3548', color: '#229ED9' }}>T</span>
                  <div className="flex-1">
                    <div className="text-sm font-medium text-white">Telegram</div>
                    <div className="text-[10px] text-slate-500">Бот подключён · Ожидание webhook</div>
                  </div>
                  <span className="w-2 h-2 rounded-full bg-yellow-500" title="Ожидание" />
                </div>
                <div className="flex items-center gap-3 bg-[#1e293b] rounded-xl p-3 border border-slate-700 opacity-30">
                  <span className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold" style={{ background: '#3d2a10', color: '#FF6B00' }}>M</span>
                  <div className="flex-1">
                    <div className="text-sm font-medium text-white">МАКС</div>
                    <div className="text-[10px] text-slate-500">Не подключён</div>
                  </div>
                  <span className="w-2 h-2 rounded-full bg-slate-600" title="Неактивен" />
                </div>
              </div>
            </div>

            {/* About */}
            <div className="text-center text-[11px] text-slate-600 border-t border-slate-800 pt-4">
              Omnichannel Dashboard · {APP_VERSION}
            </div>
          </div>
        </div>
      )}

      {/* ─── WHO ARE YOU MODAL ─── */}
      {showNameSelector && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
          onClick={() => { if (currentUserName) setShowNameSelector(false); }}
        >
          <div
            className="bg-[#151b28] border border-slate-700 rounded-2xl p-6 w-[400px] max-w-[90vw]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-lg font-bold text-white mb-1">Как вас зовут?</div>
            <div className="text-sm text-slate-400 mb-4">
              Введите ваше имя так, как оно отображается в чатах. 
              Ваши сообщения будут показаны <span className="text-green-400 font-medium">зелёным</span> цветом.
            </div>
            {messages.length > 0 && (
              <div className="mb-3">
                <div className="text-xs text-slate-500 mb-1.5">Участники чата:</div>
                <div className="flex flex-wrap gap-1.5">
                  {[...new Set(messages.map(m => m.senderName))].slice(0, 8).map(name => (
                    <button
                      key={name}
                      className={`px-2.5 py-1 rounded-lg text-xs transition-colors ${
                        userNameInput.toLowerCase().trim() === name.toLowerCase().trim()
                          ? 'bg-green-600/30 text-green-400 border border-green-500/50'
                          : 'bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700'
                      }`}
                      onClick={() => setUserNameInput(name)}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <input
              className="w-full bg-[#1e293b] border border-slate-600 rounded-lg text-white px-4 py-2.5 text-sm outline-none focus:border-green-500 placeholder-slate-500 mb-4"
              placeholder="Введите ваше имя..."
              value={userNameInput}
              onChange={(e) => setUserNameInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && userNameInput.trim()) {
                  setCurrentUserName(userNameInput.trim());
                  localStorage.setItem('omnichannel_current_user', userNameInput.trim());
                  setShowNameSelector(false);
                }
              }}
              autoFocus
            />
            <div className="flex justify-end gap-2">
              {currentUserName && (
                <button
                  className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-white transition-colors"
                  onClick={() => setShowNameSelector(false)}
                >
                  Отмена
                </button>
              )}
              <button
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  userNameInput.trim()
                    ? 'bg-green-600 hover:bg-green-500 text-white'
                    : 'bg-slate-700 text-slate-500 cursor-not-allowed'
                }`}
                disabled={!userNameInput.trim()}
                onClick={() => {
                  if (userNameInput.trim()) {
                    setCurrentUserName(userNameInput.trim());
                    localStorage.setItem('omnichannel_current_user', userNameInput.trim());
                    setShowNameSelector(false);
                  }
                }}
              >
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── ADD CHAT MODAL ─── */}
      {showAddChatModal && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
          onClick={() => setShowAddChatModal(false)}
        >
          <div
            className="bg-[#151b28] border border-slate-700 rounded-2xl p-6 w-[420px] max-w-[90vw]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#1a3548] flex items-center justify-center text-xl">✈️</div>
                <div className="text-lg font-bold text-white">Добавить Telegram чат</div>
              </div>
              <button
                onClick={() => setShowAddChatModal(false)}
                className="w-8 h-8 rounded-lg bg-slate-800 text-slate-400 flex items-center justify-center hover:bg-slate-700 hover:text-white transition-colors text-sm"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div className="bg-[#1e293b] rounded-xl p-4 border border-slate-700">
                <div className="text-sm font-medium text-white mb-2">Как подключить чат</div>
                <ol className="text-sm text-slate-300 space-y-2 list-decimal list-inside">
                  <li>Откройте Telegram группу или чат</li>
                  <li>Добавьте бота <span className="text-[#229ED9] font-semibold">@our_omnichannel_bot</span> в участники</li>
                  <li>Дайте боту права на чтение сообщений</li>
                  <li>Чат автоматически появится в дашборде в группе «ТГ Чаты»</li>
                </ol>
              </div>

              <div className="bg-[#1e293b] rounded-xl p-4 border border-slate-700">
                <div className="text-sm font-medium text-white mb-2">Как подключить личные сообщения</div>
                <ol className="text-sm text-slate-300 space-y-2 list-decimal list-inside">
                  <li>Перешлите любое сообщение от контакта боту <span className="text-[#229ED9] font-semibold">@our_omnichannel_bot</span></li>
                  <li>Бот начнёт получать новые сообщения из этого чата</li>
                </ol>
              </div>

              <div className="text-[11px] text-slate-500 text-center">
                Бот видит только новые сообщения после добавления. История недоступна.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}