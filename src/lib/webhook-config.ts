// Shared webhook configuration types and helpers
// Webhook URLs are provided by each user via the setup form
// Stored in localStorage, sent to backend via custom header

export interface PortalWebhookConfig {
  webhookUrl: string;        // IM webhook (im, imconnector, imopenlines)
  tasksWebhookUrl?: string;  // Tasks webhook (task, tasks) — optional, defaults to IM webhook
}

export type WebhookConfig = Record<string, PortalWebhookConfig>;
// e.g. { "bitrix1": { "webhookUrl": "https://...", "tasksWebhookUrl": "https://..." }, "bitrix2": { ... } }

// localStorage key
const WEBHOOK_STORAGE_KEY = 'omnichannel_webhooks';

// Header name for API requests
export const WEBHOOK_HEADER = 'X-Bitrix-Webhooks';

// ─── Client-side helpers ───

/** Read webhook config from localStorage (client-side only) */
export function getWebhookConfig(): WebhookConfig | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(WEBHOOK_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Save webhook config to localStorage (client-side only) */
export function saveWebhookConfig(config: WebhookConfig): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(WEBHOOK_STORAGE_KEY, JSON.stringify(config));
}

/** Clear webhook config from localStorage (client-side only) */
export function clearWebhookConfig(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(WEBHOOK_STORAGE_KEY);
}

/** Check if at least one portal is configured */
export function hasWebhookConfig(): boolean {
  const config = getWebhookConfig();
  if (!config) return false;
  return Object.values(config).some(p => p.webhookUrl?.trim());
}

/** Serialize webhook config for the API header */
export function serializeWebhookHeader(config: WebhookConfig | null): string {
  if (!config) return '';
  return JSON.stringify(config);
}

// ─── Server-side helpers ───

/** Parse webhook config from the API request header (server-side) */
export function parseWebhookHeader(headerValue: string | null): WebhookConfig | null {
  if (!headerValue) return null;
  try {
    const parsed = JSON.parse(headerValue);
    if (typeof parsed === 'object' && parsed !== null) return parsed;
    return null;
  } catch {
    return null;
  }
}

/** Get the webhook URL for a specific portal and method type */
export function getWebhookForPortal(
  config: WebhookConfig | null,
  portalKey: string,
  methodType: 'im' | 'tasks' = 'im'
): string | null {
  if (!config || !config[portalKey]) return null;
  const portal = config[portalKey];
  if (methodType === 'tasks' && portal.tasksWebhookUrl) {
    return portal.tasksWebhookUrl;
  }
  return portal.webhookUrl || null;
}

/** Validate a webhook URL format */
export function isValidWebhookUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.pathname.includes('/rest/');
  } catch {
    return false;
  }
}

/** Extract user ID from a Bitrix24 webhook URL */
export function extractWebhookUserId(url: string): number | null {
  try {
    const parsed = new URL(url);
    // Format: https://domain.bitrix24.ru/rest/USER_ID/WEBHOOK_CODE/
    const parts = parsed.pathname.split('/').filter(Boolean);
    // parts = ['rest', 'USER_ID', 'WEBHOOK_CODE']
    if (parts[0] === 'rest' && parts[1]) {
      const userId = parseInt(parts[1], 10);
      return isNaN(userId) ? null : userId;
    }
    return null;
  } catch {
    return null;
  }
}

/** Extract domain from a Bitrix24 webhook URL */
export function extractWebhookDomain(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.hostname;
  } catch {
    return null;
  }
}
