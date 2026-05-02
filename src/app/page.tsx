'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  getWebhookConfig,
  saveWebhookConfig,
  clearWebhookConfig,
  isValidWebhookUrl,
  extractWebhookUserId,
  extractWebhookDomain,
  serializeWebhookHeader,
  WebhookConfig,
  PortalWebhookConfig,
} from '@/lib/webhook-config';
import { BITRIX_PORTALS } from '@/lib/sources';

// Dynamic import to avoid SSR issues with the large dashboard component
const OmnichannelDashboard = dynamic(
  () => import('@/components/OmnichannelDashboard'),
  { ssr: false }
);

// ─── Setup Screen Component ───
function WebhookSetupScreen({ onConnect }: { onConnect: (config: WebhookConfig) => void }) {
  const [config, setConfig] = useState<WebhookConfig>(() => {
    const saved = getWebhookConfig();
    if (saved) return saved;
    // Default: empty fields for each portal
    const defaults: WebhookConfig = {};
    for (const [key, portal] of Object.entries(BITRIX_PORTALS)) {
      defaults[key] = { webhookUrl: '', tasksWebhookUrl: '' };
    }
    return defaults;
  });

  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, 'ok' | 'fail' | 'pending'>>({});
  const [expandedPortal, setExpandedPortal] = useState<string>('bitrix1');

  const updatePortal = (key: string, field: keyof PortalWebhookConfig, value: string) => {
    setConfig(prev => ({
      ...prev,
      [key]: { ...prev[key], [field]: value },
    }));
  };

  const handleConnect = async () => {
    setTesting('all');
    const results: Record<string, 'ok' | 'fail' | 'pending'> = {};

    for (const [key, portal] of Object.entries(config)) {
      if (!portal.webhookUrl.trim()) {
        results[key] = 'pending';
        continue;
      }
      if (!isValidWebhookUrl(portal.webhookUrl)) {
        results[key] = 'fail';
        continue;
      }
      // Test the webhook by calling im.recent.list
      try {
        const url = `${portal.webhookUrl}im.recent.list`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ LIMIT: 1 }),
        });
        const data = await res.json();
        results[key] = (!data.error && data.result) ? 'ok' : 'fail';
      } catch {
        results[key] = 'fail';
      }
    }

    setTestResult(results);
    setTesting(null);

    // If at least one portal works, save and connect
    const hasWorking = Object.values(results).some(r => r === 'ok');
    if (hasWorking) {
      saveWebhookConfig(config);
      onConnect(config);
    }
  };

  return (
    <div className="min-h-screen bg-[#0d1117] text-white flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">
            <span className="text-white">Omni</span>
            <span style={{ color: '#229ED9' }}>Channel</span>
            <span className="text-lg font-bold text-white/90 ml-2">v5.0</span>
          </h1>
          <p className="text-slate-400 text-sm">Подключите ваши Битрикс24 вебхуки для доступа к диалогам</p>
        </div>

        {/* Portal config cards */}
        <div className="space-y-4 mb-6">
          {Object.entries(BITRIX_PORTALS).map(([key, portal]) => {
            const isExpanded = expandedPortal === key;
            const result = testResult[key];
            const userId = config[key]?.webhookUrl ? extractWebhookUserId(config[key].webhookUrl) : null;
            const domain = config[key]?.webhookUrl ? extractWebhookDomain(config[key].webhookUrl) : null;

            return (
              <div
                key={key}
                className="rounded-xl border border-slate-700 bg-[#161b22] overflow-hidden"
              >
                {/* Portal header — clickable to expand/collapse */}
                <button
                  onClick={() => setExpandedPortal(isExpanded ? '' : key)}
                  className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-slate-800/50 transition-colors"
                >
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ background: portal.color }}
                  />
                  <div className="flex-1">
                    <div className="font-semibold text-sm">{portal.label}</div>
                    <div className="text-xs text-slate-500">{portal.domain} · {portal.description}</div>
                  </div>
                  {result === 'ok' && (
                    <span className="text-green-400 text-xs font-bold bg-green-400/10 px-2 py-1 rounded">Подключено</span>
                  )}
                  {result === 'fail' && (
                    <span className="text-red-400 text-xs font-bold bg-red-400/10 px-2 py-1 rounded">Ошибка</span>
                  )}
                  {config[key]?.webhookUrl && !result && (
                    <span className="text-yellow-400 text-xs">Настроен</span>
                  )}
                  <svg
                    width="16" height="16" viewBox="0 0 16 16" fill="currentColor"
                    className={`text-slate-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                  >
                    <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </button>

                {/* Expanded portal config */}
                {isExpanded && (
                  <div className="px-5 pb-5 space-y-3 border-t border-slate-700/50 pt-4">
                    {/* IM Webhook */}
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1.5">
                        Вебхук чата (IM) <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="url"
                        className="w-full bg-[#0d1117] border border-slate-600 rounded-lg px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-blue-500 placeholder-slate-600 font-mono"
                        placeholder="https://ваш-портал.bitrix24.ru/rest/USER_ID/КОД_ВЕБХУКА/"
                        value={config[key]?.webhookUrl || ''}
                        onChange={(e) => updatePortal(key, 'webhookUrl', e.target.value)}
                      />
                      {userId && (
                        <div className="text-xs text-slate-500 mt-1">
                          Пользователь ID: {userId} · Домен: {domain}
                        </div>
                      )}
                    </div>

                    {/* Tasks Webhook */}
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1.5">
                        Вебхук задач (Tasks) <span className="text-slate-600">— опционально</span>
                      </label>
                      <input
                        type="url"
                        className="w-full bg-[#0d1117] border border-slate-600 rounded-lg px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-blue-500 placeholder-slate-600 font-mono"
                        placeholder="https://ваш-портал.bitrix24.ru/rest/USER_ID/КОД_ВЕБХУКА/"
                        value={config[key]?.tasksWebhookUrl || ''}
                        onChange={(e) => updatePortal(key, 'tasksWebhookUrl', e.target.value)}
                      />
                      <div className="text-xs text-slate-600 mt-1">
                        Если не указан, используется вебхук чата
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Connect button */}
        <button
          onClick={handleConnect}
          disabled={testing === 'all' || !Object.values(config).some(p => p.webhookUrl?.trim())}
          className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl px-6 py-3.5 text-sm font-semibold transition-colors mb-6"
        >
          {testing === 'all' ? 'Проверка подключения...' : 'Подключить и войти'}
        </button>

        {/* Instructions */}
        <div className="rounded-xl border border-slate-700 bg-[#161b22] p-5">
          <h3 className="text-sm font-semibold mb-3 text-slate-300">Как создать входящий вебхук в Битрикс24</h3>
          <ol className="text-xs text-slate-400 space-y-2.5 list-decimal list-inside">
            <li>
              Зайдите в свой Битрикс24 под <span className="text-white">своей учётной записью</span> — вебхук будет привязан к вам
            </li>
            <li>
              Перейдите в раздел:{' '}
              <span className="text-slate-200">
                Разработчикам → Прочее → Входящий вебхук
              </span>{' '}
              (или наберите в поиске «вебхук»)
            </li>
            <li>
              В поле <span className="text-slate-200">«Права доступа»</span> выберите:
              <div className="ml-5 mt-1 space-y-0.5">
                <div className="text-blue-300">Для чата: im, imconnector, imopenlines</div>
                <div className="text-green-300">Для задач: task, tasks, tasks_extended</div>
              </div>
            </li>
            <li>
              Нажмите <span className="text-slate-200">«Сохранить»</span> — скопируйте URL вебхука
            </li>
            <li>
              Вставьте URL в поле выше и нажмите <span className="text-blue-300">«Подключить и войти»</span>
            </li>
          </ol>
          <div className="mt-3 pt-3 border-t border-slate-700/50">
            <p className="text-xs text-slate-500">
              Каждый сотрудник создаёт вебхук под своей учётной записью.
              Вебхук показывает только те диалоги, которые видит этот пользователь в Битрикс24.
              Telegram-чаты общие для всех (используют одного бота).
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ───
export default function HomePage() {
  const [webhookConfig, setWebhookConfig] = useState<WebhookConfig | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const saved = getWebhookConfig();
    if (saved && Object.values(saved).some(p => p.webhookUrl?.trim())) {
      setWebhookConfig(saved);
    }
    setLoaded(true);
  }, []);

  const handleConnect = (config: WebhookConfig) => {
    setWebhookConfig(config);
  };

  const handleDisconnect = () => {
    clearWebhookConfig();
    setWebhookConfig(null);
  };

  if (!loaded) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#0d1117] text-white">
        <div className="text-center">
          <div className="text-2xl mb-2">⏳</div>
          <div>Загрузка...</div>
        </div>
      </div>
    );
  }

  // No webhook configured — show setup screen
  if (!webhookConfig) {
    return <WebhookSetupScreen onConnect={handleConnect} />;
  }

  // Webhook configured — show dashboard
  return <OmnichannelDashboard onDisconnect={handleDisconnect} />;
}
