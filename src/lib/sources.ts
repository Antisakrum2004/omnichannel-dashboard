// Source configuration for all connected platforms
// Webhook URLs are NO LONGER hardcoded — each user enters their own via the setup form
// This file only contains portal metadata (labels, colors, domains)

export interface SourceInfo {
  label: string;
  name: string;
  color: string;
  bg: string;
  icon: string;
}

export const SOURCES: Record<string, SourceInfo> = {
  bitrix1: { label: 'BX1', name: 'Наш Битрикс', color: '#3B8BD4', bg: '#1e3a5f', icon: '🏢' },
  bitrix2: { label: 'BX2', name: 'Дакар', color: '#1D9E75', bg: '#1a3d2e', icon: '🏗️' },
  bitrix3: { label: 'BX3', name: 'Клиент В', color: '#534AB7', bg: '#2d2a5e', icon: '📋' },
  telegram: { label: 'TG', name: 'Telegram', color: '#229ED9', bg: '#1a3548', icon: '✈️' },
  max:     { label: 'MAX', name: 'MAX', color: '#FF6B00', bg: '#3d2a10', icon: '💬' },
  whatsapp:{ label: 'WA', name: 'WhatsApp', color: '#25D366', bg: '#1a3d24', icon: '📱' },
};

// Bitrix24 portal metadata — NO webhook URLs stored here
// Each user provides their own webhooks via the setup form
export const BITRIX_PORTALS = {
  bitrix1: {
    label: 'АтиЛаб (Наш Битрикс)',
    domain: '1c-cms.bitrix24.ru',
    color: '#3B8BD4',
    readOnly: false,
    portalType: 'task',
    description: 'Основной портал компании',
  },
  bitrix2: {
    label: 'Дакар',
    domain: 'dakar.bitrix24.ru',
    color: '#1D9E75',
    readOnly: false,
    portalType: 'task',
    description: 'Портал Дакар',
  },
};

// Normalized message format - ALL sources convert to this
export interface NormalizedMessage {
  source: string;
  channelExternalId: string;
  channelName?: string;
  senderName: string;
  senderType: 'client' | 'operator';
  text: string;
  timestamp: Date;
  externalMessageId?: string;
}
