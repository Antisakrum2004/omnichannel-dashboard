'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  getWebhookConfig,
  serializeWebhookHeader,
  extractWebhookUserId,
  WebhookConfig,
  WEBHOOK_HEADER,
} from '@/lib/webhook-config';
import { BITRIX_PORTALS } from '@/lib/sources';

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
const APP_VERSION = 'v5.0';

// ─── Source Config ───
const SOURCES: Record<string, { label: string; name: string; color: string; bg: string; icon: string }> = {
  bitrix1:  { label: 'BX1', name: 'АтиЛаб (Наш Битрикс)', color: '#3B8BD4', bg: '#1e3a5f', icon: '🏢' },
  bitrix2:  { label: 'BX2', name: 'Дакар',               color: '#1D9E75', bg: '#1a3d2e', icon: '🏗️' },
  bitrix3:  { label: 'BX3', name: 'Клиент В',            color: '#534AB7', bg: '#2d2a5e', icon: '📋' },
  telegram: { label: 'TG',  name: 'ТГ Чаты',             color: '#229ED9', bg: '#1a3548', icon: '✈️' },
  max:      { label: 'MAX', name: 'МАКС',                color: '#FF6B00', bg: '#3d2a10', icon: '💬' },
  whatsapp: { label: 'WA',  name: 'WhatsApp',             color: '#25D366', bg: '#1a3d24', icon: '📱' },
};

// ─── Tab definitions ───
const TABS = [
  { id: 'bitrix1', label: 'АтиЛаб' },
  { id: 'bitrix2', label: 'Дакар' },
  { id: 'bitrix3', label: 'Клиент В' },
  { id: 'telegram', label: 'ТГ' },
  { id: 'max', label: 'МАКС' },
  { id: 'whatsapp', label: 'WA' },
];

// ─── API Fetch Helper ───
// Adds webhook config header to all API calls
function getWebhookHeaders(): Record<string, string> {
  const config = getWebhookConfig();
  return { [WEBHOOK_HEADER]: serializeWebhookHeader(config) };
}

async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const headers = {
    ...(options.headers || {}),
    ...getWebhookHeaders(),
  };
  return fetch(url, { ...options, headers });
}

// ─── SVG Icon Components ───

function FilterIcon({ size = 20 }: { size?: number }) {
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
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M15 3v6h6" />
      <line x1="9" y1="13" x2="15" y2="13" />
      <line x1="9" y1="17" x2="13" y2="17" />
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
  effectiveUnread,
  onClick,
}: {
  channel: Channel;
  isActive: boolean;
  effectiveUnread: number;
  onClick: () => void;
}) {
  const timeStr = formatTime(channel.lastActivity);
  const hasUnread = effectiveUnread > 0;

  return (
    <div
      className={`flex items-center gap-2.5 px-3 py-2.5 cursor-pointer transition-colors ${
        isActive ? 'bg-[#1e3a5f]' : 'hover:bg-[#1e293b]'
      }`}
      onClick={onClick}
    >
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
        <UnreadBadge count={effectiveUnread} />
      </div>
    </div>
  );
}

const MSG_STYLE = {
  incoming: { bubble: '#1c2533', name: '#8899aa', text: '#c8d1db', time: '#5a6a7a' },
  outgoing: { bubble: '#162d24', name: '#5ab877', text: '#c8d1db', time: '#3a7a5a' },
};

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
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function SenderAvatar({ name, avatarUrl, size = 32 }: { name: string; avatarUrl?: string | null; size?: number }) {
  const color = getAvatarColor(name);
  const initials = getInitials(name);
  if (avatarUrl) {
    return (
      <img src={avatarUrl} alt={name} className="rounded-full object-cover flex-shrink-0"
        style={{ width: size, height: size }}
        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
      />
    );
  }
  return (
    <div className="rounded-full flex items-center justify-center text-white font-bold flex-shrink-0"
      style={{ width: size, height: size, background: color, fontSize: size * 0.35 }}>
      {initials}
    </div>
  );
}

function RichText({ text }: { text: string }) {
  const parts: (string | { url: string; label: string })[] = [];
  const regex = /\[URL=([^\]]+)\]([^\[]+)\[\/URL\]|\[URL\]([^\[]+)\[\/URL\]|(\bhttps?:\/\/[^\s\[\]<>"')\]]+)/gi;
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    if (match[1] && match[2]) parts.push({ url: match[1], label: match[2] });
    else if (match[3]) parts.push({ url: match[3], label: match[3] });
    else if (match[4]) parts.push({ url: match[4], label: match[4] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  if (parts.length === 0) return <>{text}</>;
  return (
    <>
      {parts.map((part, i) => {
        if (typeof part === 'string') {
          const cleaned = part.replace(/\[USER=\d+\]([^\[]+)\[\/USER\]/gi, '$1');
          return <span key={i}>{cleaned}</span>;
        }
        return <a key={i} href={part.url} target="_blank" rel="noopener noreferrer"
          className="text-blue-400 hover:text-blue-300 underline decoration-blue-400/50 hover:decoration-blue-300 transition-colors">
          {part.label}
        </a>;
      })}
    </>
  );
}

function MessageBubble({ msg, showName, currentUserName }: { msg: Message; showName: boolean; currentUserName: string }) {
  const isMe = msg.senderType === 'operator' ||
    (currentUserName && msg.senderName.toLowerCase().trim() === currentUserName.toLowerCase().trim());
  const time = new Date(msg.timestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const s = isMe ? MSG_STYLE.outgoing : MSG_STYLE.incoming;

  return (
    <div className="flex gap-2 justify-start mb-2">
      <div className="flex-shrink-0 pt-0.5">
        {showName ? <SenderAvatar name={msg.senderName} avatarUrl={msg.senderAvatar} size={32} /> : <div style={{ width: 32 }} />}
      </div>
      <div className="max-w-[70%] px-3.5 py-2 rounded-[4px_16px_16px_16px]" style={{ background: s.bubble }}>
        {showName && <div className="text-xs font-medium mb-0.5" style={{ color: s.name }}>{msg.senderName}</div>}
        {msg.text && <div className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: s.text }}><RichText text={msg.text} /></div>}
        {msg.files && msg.files.length > 0 && (
          <div className="flex flex-col gap-1.5 mt-1.5">
            {msg.files.map((file) => (
              <a key={file.id} href={file.urlDownload} target="_blank" rel="noopener noreferrer">
                <img src={file.urlPreview} alt={file.name} className="max-w-full rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                  style={{ maxHeight: 240 }} loading="lazy" />
              </a>
            ))}
          </div>
        )}
        <div className="text-[10px] mt-0.5 text-right flex items-center justify-end gap-1" style={{ color: s.time }}>
          <span>{time}</span>
          {isMe && <span style={{ color: msg.isRead ? '#4fc3f7' : s.time, fontSize: '10px' }}>{msg.isRead ? '✓✓' : '✓'}</span>}
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
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return 'Вчера';
  if (diffDays < 7) return `${diffDays} дн. назад`;
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
}

function formatTimeFull(dateStr: string): string {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function getBitrixDomain(source: string): string | null {
  const portal = BITRIX_PORTALS[source as keyof typeof BITRIX_PORTALS];
  return portal?.domain || null;
}

// ─── Main App ───
export default function OmnichannelDashboard({ onDisconnect }: { onDisconnect: () => void }) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const autoResizeTextarea = useCallback(() => {
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
        textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
      }
    });
  }, []);

  // Get operator name from webhook user ID
  const [currentUserName, setCurrentUserName] = useState<string>('');

  // Tab navigation state
  const [activeTab, setActiveTab] = useState('bitrix1');
  const [tabDirection, setTabDirection] = useState(0);
  const [isSliding, setIsSliding] = useState(false);

  // Tab rename state
  const [renamingTab, setRenamingTab] = useState<string | null>(null);
  const [renameInput, setRenameInput] = useState('');

  // Custom source names
  const [customSourceNames, setCustomSourceNames] = useState<Record<string, string>>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('omnichannel_source_names');
      return saved ? JSON.parse(saved) : {};
    }
    return {};
  });

  useEffect(() => {
    localStorage.setItem('omnichannel_source_names', JSON.stringify(customSourceNames));
  }, [customSourceNames]);

  const renameSource = (sourceKey: string, newName: string) => {
    if (!newName.trim()) return;
    setCustomSourceNames(prev => ({ ...prev, [sourceKey]: newName.trim() }));
  };

  const handleTabDoubleClick = (tabId: string) => {
    const currentLabel = customSourceNames[tabId] || TABS.find(t => t.id === tabId)?.label || tabId;
    setRenameInput(currentLabel);
    setRenamingTab(tabId);
  };

  const handleRenameConfirm = () => {
    if (renamingTab && renameInput.trim()) renameSource(renamingTab, renameInput.trim());
    setRenamingTab(null);
    setRenameInput('');
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleRenameConfirm();
    else if (e.key === 'Escape') { setRenamingTab(null); setRenameInput(''); }
  };

  // Modals
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [tgWebhookStatus, setTgWebhookStatus] = useState<string>('');
  const [tgWebhookLoading, setTgWebhookLoading] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowSettingsModal(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const switchTab = (newTabId: string) => {
    if (newTabId === activeTab || isSliding) return;
    const oldIdx = TABS.findIndex(t => t.id === activeTab);
    const newIdx = TABS.findIndex(t => t.id === newTabId);
    setTabDirection(newIdx > oldIdx ? 1 : -1);
    setIsSliding(true);
    setActiveTab(newTabId);
    setTimeout(() => setIsSliding(false), 350);
  };

  // Last-seen activity tracking
  const [lastSeenActivity, setLastSeenActivity] = useState<Record<string, string>>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('omnichannel_last_seen');
      return saved ? JSON.parse(saved) : {};
    }
    return {};
  });

  const getEffectiveUnread = useCallback((channel: Channel): number => {
    if (channel.source === 'telegram') return channel.unreadCount;
    const seen = lastSeenActivity[channel.id];
    if (!seen) return 0;
    return new Date(channel.lastActivity).getTime() > new Date(seen).getTime() ? 1 : 0;
  }, [lastSeenActivity]);

  const markChannelRead = useCallback(async (channelId: string) => {
    const channel = channels.find(c => c.id === channelId);
    if (channel) {
      setLastSeenActivity(prev => {
        const next = { ...prev, [channelId]: channel.lastActivity };
        localStorage.setItem('omnichannel_last_seen', JSON.stringify(next));
        return next;
      });
    }
    if (channelId.startsWith('tg_')) {
      setChannels(prev => prev.map(ch => ch.id === channelId ? { ...ch, unreadCount: 0 } : ch));
      try { await apiFetch(`/api/channels/${channelId}/read`, { method: 'POST' }); } catch (e) { /* ignore */ }
    }
  }, [channels]);

  const handleChannelClick = useCallback((channelId: string) => {
    setActiveChannelId(channelId);
    markChannelRead(channelId);
  }, [markChannelRead]);

  // Fetch channels — uses webhook header
  const fetchChannels = useCallback(async () => {
    try {
      const res = await apiFetch('/api/channels');
      if (res.ok) {
        const data = await res.json();
        setChannels(data);
        setLastSeenActivity(prev => {
          let changed = false;
          const next = { ...prev };
          for (const ch of data) {
            if (!next[ch.id]) { next[ch.id] = ch.lastActivity; changed = true; }
          }
          if (changed) localStorage.setItem('omnichannel_last_seen', JSON.stringify(next));
          return changed ? next : prev;
        });
      }
    } catch (e) {
      console.error('Failed to fetch channels:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch messages — uses webhook header
  const fetchMessages = useCallback(async (channelId: string) => {
    try {
      const res = await apiFetch(`/api/channels/${channelId}?limit=50`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data);
      }
    } catch (e) {
      console.error('Failed to fetch messages:', e);
    }
  }, []);

  // Sync — uses webhook header
  const syncBitrix = useCallback(async (portal: string) => {
    setSyncing(true);
    try {
      await apiFetch('/api/sync', {
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
      await apiFetch('/api/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ portal: 'bitrix1' }) });
      await apiFetch('/api/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ portal: 'bitrix2' }) });
      await fetchChannels();
    } catch (e) {
      console.error('Sync all failed:', e);
    } finally {
      setSyncing(false);
    }
  }, [fetchChannels]);

  // Auto-polling
  const prevTotalUnreadRef = useRef(0);

  useEffect(() => {
    fetchChannels();
    const interval = setInterval(fetchChannels, 5000);
    return () => clearInterval(interval);
  }, [fetchChannels]);

  // Notification sound
  useEffect(() => {
    const totalUnread = channels.reduce((s, c) => s + getEffectiveUnread(c), 0);
    if (totalUnread > prevTotalUnreadRef.current && prevTotalUnreadRef.current >= 0) {
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
      } catch (e) { /* ignore */ }
    }
    prevTotalUnreadRef.current = totalUnread;
  }, [channels, getEffectiveUnread]);

  useEffect(() => {
    if (!activeChannelId) { setMessages([]); return; }
    fetchMessages(activeChannelId);
    const interval = setInterval(() => fetchMessages(activeChannelId), 3000);
    return () => clearInterval(interval);
  }, [activeChannelId, fetchMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Send message — uses webhook header
  const handleSend = async () => {
    if (!inputText.trim() || !activeChannelId) return;
    setSending(true);
    try {
      const res = await apiFetch('/api/send', {
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
      const res = await apiFetch('/api/telegram/setup', {
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
      const res = await apiFetch('/api/telegram/setup');
      const data = await res.json();
      setTgWebhookStatus(data.webhookInfo?.url ? `Webhook: ${data.webhookInfo.url}` : 'Webhook не настроен');
    } catch (e) {
      setTgWebhookStatus('Не удалось проверить статус');
    }
  };

  const [tgFetching, setTgFetching] = useState(false);
  const fetchTelegramHistory = async () => {
    setTgFetching(true);
    setTgWebhookStatus('Загрузка истории ТГ...');
    try {
      const res = await apiFetch('/api/telegram/fetch-history', { method: 'POST' });
      const data = await res.json();
      if (data.ok) {
        setTgWebhookStatus(`Загружено ${data.newMessages} сообщений из ${data.updatesProcessed} обновлений`);
        await fetchChannels();
      } else {
        setTgWebhookStatus(`Ошибка: ${data.error || 'Не удалось загрузить историю'}`);
      }
    } catch (e) {
      setTgWebhookStatus('Ошибка при загрузке истории');
    } finally {
      setTgFetching(false);
    }
  };

  // Determine which tabs to show based on configured webhooks
  const webhookConfig = getWebhookConfig();
  const configuredPortals = Object.keys(BITRIX_PORTALS).filter(key =>
    webhookConfig?.[key]?.webhookUrl?.trim()
  );

  // Only show tabs for configured portals + telegram
  const activeTabs = TABS.filter(tab =>
    tab.id === 'telegram' || configuredPortals.includes(tab.id)
  );

  const activeChannel = channels.find((c) => c.id === activeChannelId);
  const filteredChannels = searchQuery
    ? channels.filter((c) =>
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (c.lastMessage || '').toLowerCase().includes(searchQuery.toLowerCase())
      )
    : channels;

  const tabFilteredChannels = filteredChannels.filter(c => c.source === activeTab);
  const totalUnread = channels.reduce((s, c) => s + getEffectiveUnread(c), 0);
  const uniqueSenders = messages.length > 0 ? [...new Set(messages.map(m => m.senderName))].length : 0;

  return (
    <div className="flex h-screen overflow-hidden">
      {/* ─── LEFT PANEL ─── */}
      <div className="w-[320px] flex-shrink-0 h-full flex flex-col border-r border-slate-800" style={{ background: '#0d1117' }}>
        <div className="px-4 pt-4 pb-1">
          <h2 className="text-base font-bold">
            <span className="text-white">Omni</span>
            <span style={{ color: '#229ED9' }}>Channel</span>
            <span className="text-sm font-bold text-white/90 ml-1">{APP_VERSION}</span>
          </h2>
          <div className="text-xs text-slate-500 mt-0.5">
            {currentUserName ? `${currentUserName} · ` : ''}{channels.length} чатов
          </div>
        </div>

        {/* Toolbar */}
        <div className="px-4 py-2 flex items-center gap-2">
          <button onClick={() => setShowSettingsModal(true)}
            className="rounded-lg bg-slate-800/80 text-slate-400 flex items-center justify-center hover:bg-slate-700 hover:text-white transition-colors flex-shrink-0"
            style={{ width: 25, height: 25 }} title="Настройки">
            <FilterIcon size={18} />
          </button>
          <div className="relative" style={{ width: 220 }}>
            <div className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500"><SearchIcon size={13} /></div>
            <input className="w-full bg-[#1e293b] border border-slate-700 rounded-lg text-slate-200 pl-7 pr-2 text-sm outline-none focus:border-blue-500 placeholder-slate-500"
              style={{ height: 25, fontSize: 12 }} placeholder="Поиск чатов..."
              value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          </div>
        </div>

        {/* Tab Bar */}
        <div className="flex gap-1 px-3 py-2 overflow-x-auto scrollbar-none" style={{ scrollbarWidth: 'none' }}>
          {activeTabs.map(tab => {
            const tabChannels = channels.filter(c => c.source === tab.id);
            const tabUnread = tabChannels.reduce((s, c) => s + getEffectiveUnread(c), 0);
            const isActive = tab.id === activeTab;
            const isRenaming = renamingTab === tab.id;
            return (
              <div key={tab.id} className="relative">
                {isRenaming ? (
                  <input className="bg-slate-700 text-blue-300 rounded-full px-2 py-1 text-xs font-medium outline-none border border-blue-500/50 w-[70px]"
                    value={renameInput} onChange={(e) => setRenameInput(e.target.value)}
                    onBlur={handleRenameConfirm} onKeyDown={handleRenameKeyDown} autoFocus onClick={(e) => e.stopPropagation()} />
                ) : (
                  <button onClick={() => switchTab(tab.id)} onDoubleClick={() => handleTabDoubleClick(tab.id)}
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all duration-200 ${
                      isActive ? 'bg-[#1e3a5f] text-blue-300' : 'text-slate-400 hover:bg-slate-800'}`}
                    title="Двойной клик для переименования">
                    {customSourceNames[tab.id] || tab.label}
                    {tabUnread > 0 && (
                      <span className={`rounded-full px-1.5 py-0 text-[10px] font-bold ${
                        isActive ? 'bg-blue-500/30 text-blue-300' : 'bg-red-500/20 text-red-400'}`}>
                        {tabUnread > 99 ? '99+' : tabUnread}
                      </span>
                    )}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Chat List */}
        <div className="flex-1 overflow-hidden relative">
          <div key={activeTab} className="absolute inset-0 overflow-y-auto"
            style={{ animation: isSliding ? `slideIn${tabDirection > 0 ? 'Right' : 'Left'} 0.35s cubic-bezier(0.19, 1, 0.22, 1) forwards` : 'none' }}>
            {loading ? (
              <div className="text-center text-slate-500 py-8 text-sm">Загрузка чатов...</div>
            ) : tabFilteredChannels.length === 0 ? (
              <div className="text-[11px] text-slate-600 px-4 py-4 italic">Нет чатов</div>
            ) : (
              tabFilteredChannels.map(ch => (
                <ChatListItem key={ch.id} channel={ch} isActive={ch.id === activeChannelId}
                  effectiveUnread={getEffectiveUnread(ch)} onClick={() => handleChannelClick(ch.id)} />
              ))
            )}
          </div>
        </div>

        <div className="px-4 py-3 border-t border-slate-800 text-center">
          <div className="text-[11px] text-slate-600">{channels.length} чатов · {totalUnread} непрочитанных</div>
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
            <div className="border-b border-slate-800" style={{ background: '#0d1117' }}>
              <div className="flex items-center gap-3 px-5 py-2.5">
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                  style={{ background: getAvatarColor(activeChannel.name), color: '#fff' }}>
                  {activeChannel.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold truncate">{activeChannel.name}</span>
                    <SourceBadge source={activeChannel.source} />
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-0.5">
                    <span>{messages.length} сообщ.</span>
                    {getEffectiveUnread(activeChannel) > 0 && <span className="text-red-400">{getEffectiveUnread(activeChannel)} непроч.</span>}
                    <span>{uniqueSenders} участников</span>
                    {activeChannel.lastActivity && <span>· {formatTimeFull(activeChannel.lastActivity)}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {getBitrixDomain(activeChannel.source) && (
                    <a href={`https://${getBitrixDomain(activeChannel.source)}`} target="_blank" rel="noopener noreferrer"
                      className="text-[11px] text-slate-500 hover:text-blue-400 transition-colors px-2 py-1 rounded hover:bg-slate-800">
                      Битрикс24 ↗
                    </a>
                  )}
                </div>
              </div>
            </div>

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

            <div className="px-5 py-3 border-t border-slate-800" style={{ background: '#0d1117' }}>
              <div className="flex items-end gap-2 bg-[#1e293b] border border-slate-700 rounded-xl px-4 py-2 focus-within:border-blue-500 transition-colors">
                <textarea ref={textareaRef}
                  className="flex-1 bg-transparent outline-none text-sm text-slate-200 placeholder-slate-500 resize-none min-h-[24px] max-h-[120px]"
                  placeholder="Написать сообщение..." rows={1} value={inputText}
                  onChange={(e) => { setInputText(e.target.value); autoResizeTextarea(); }}
                  onInput={autoResizeTextarea}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); autoResizeTextarea(); } }}
                  disabled={sending} />
                <button className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg px-4 py-1.5 text-sm font-medium transition-colors flex-shrink-0"
                  onClick={() => { handleSend(); autoResizeTextarea(); }}
                  disabled={sending || !inputText.trim()}>
                  {sending ? '...' : 'Отправить'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ─── RIGHT PANEL: Controls & Actions ─── */}
      <div className="w-[260px] flex-shrink-0 h-full border-l border-slate-800 flex flex-col" style={{ background: '#0d1117' }}>
        {!activeChannel ? (
          <div className="flex items-center justify-center h-full text-slate-600 text-sm">Нет выбранного чата</div>
        ) : (
          <>
            <div className="px-4 py-5 text-center border-b border-slate-800">
              <div className="w-14 h-14 rounded-full mx-auto flex items-center justify-center text-xl font-bold mb-2.5"
                style={{ background: getAvatarColor(activeChannel.name), color: '#fff' }}>
                {activeChannel.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
              </div>
              <div className="font-semibold text-sm">{activeChannel.name}</div>
              <div className="text-xs text-slate-500 mt-1 flex items-center justify-center gap-1.5">
                <SourceBadge source={activeChannel.source} />
              </div>
            </div>

            {/* Quick actions */}
            <div className="p-4 space-y-2">
              <button onClick={syncAll} disabled={syncing}
                className="w-full bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 rounded-lg px-3 py-2 text-xs font-medium transition-colors">
                {syncing ? 'Синхронизация...' : 'Синхронизировать все'}
              </button>
            </div>

            {/* Connected portals info */}
            <div className="flex-1 p-4 space-y-2">
              <div className="text-xs text-slate-500 font-medium mb-2">Подключённые порталы</div>
              {Object.entries(BITRIX_PORTALS).map(([key, portal]) => {
                const isConfigured = webhookConfig?.[key]?.webhookUrl?.trim();
                return (
                  <div key={key} className="flex items-center gap-2 text-xs">
                    <div className="w-2 h-2 rounded-full" style={{ background: isConfigured ? '#22c55e' : '#64748b' }} />
                    <span className={isConfigured ? 'text-slate-300' : 'text-slate-600'}>{portal.label}</span>
                    {isConfigured && <span className="text-slate-600 ml-auto">ID {extractWebhookUserId(webhookConfig[key].webhookUrl)}</span>}
                  </div>
                );
              })}
            </div>

            {/* Disconnect button */}
            <div className="p-4 border-t border-slate-800">
              <button onClick={onDisconnect}
                className="w-full text-red-400 hover:text-red-300 hover:bg-red-400/10 rounded-lg px-3 py-2 text-xs font-medium transition-colors">
                Отключить вебхуки
              </button>
            </div>
          </>
        )}
      </div>

      {/* ─── Settings Modal ─── */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowSettingsModal(false)}>
          <div className="bg-[#161b22] border border-slate-700 rounded-2xl w-full max-w-md mx-4 max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}>
            <div className="p-5">
              <h3 className="text-lg font-bold mb-4">Настройки</h3>

              {/* Connected portals */}
              <div className="space-y-3 mb-5">
                <h4 className="text-sm font-medium text-slate-400">Подключённые порталы</h4>
                {Object.entries(BITRIX_PORTALS).map(([key, portal]) => {
                  const url = webhookConfig?.[key]?.webhookUrl;
                  const userId = url ? extractWebhookUserId(url) : null;
                  return (
                    <div key={key} className="bg-[#0d1117] rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ background: url ? '#22c55e' : '#64748b' }} />
                        <span className="text-sm font-medium">{portal.label}</span>
                        {userId && <span className="text-xs text-slate-500 ml-auto">User {userId}</span>}
                      </div>
                      <div className="text-xs text-slate-600 font-mono truncate">
                        {url ? `${url.substring(0, 40)}...` : 'Не настроен'}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Telegram section */}
              <div className="space-y-3 mb-5">
                <h4 className="text-sm font-medium text-slate-400">Telegram бот</h4>
                <div className="flex gap-2">
                  <button onClick={setupTelegramWebhook} disabled={tgWebhookLoading}
                    className="flex-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 rounded-lg px-3 py-2 text-xs font-medium transition-colors">
                    Установить webhook
                  </button>
                  <button onClick={checkTgWebhook}
                    className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg px-3 py-2 text-xs font-medium transition-colors">
                    Проверить статус
                  </button>
                </div>
                <button onClick={fetchTelegramHistory} disabled={tgFetching}
                  className="w-full bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 rounded-lg px-3 py-2 text-xs font-medium transition-colors">
                  {tgFetching ? 'Загрузка...' : 'Загрузить историю сообщений'}
                </button>
                {tgWebhookStatus && <div className="text-xs text-slate-400">{tgWebhookStatus}</div>}
              </div>

              {/* Disconnect */}
              <button onClick={() => { setShowSettingsModal(false); onDisconnect(); }}
                className="w-full bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors">
                Отключить вебхуки и выйти
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
