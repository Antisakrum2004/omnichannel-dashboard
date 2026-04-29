// Source configuration for all connected platforms

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

// Bitrix24 portal configurations
export const BITRIX_PORTALS = {
  bitrix1: {
    label: 'Наш Битрикс',
    domain: '1c-cms.bitrix24.ru',
    webhookUrl: 'https://1c-cms.bitrix24.ru/rest/116/962u568uyeakin6y/',
    outgoingToken: 'e3ecp1omrqwo75qqe2nng9e3m9y1xiym',
    color: '#3B8BD4',
    readOnly: false, // Full access - testing portal
  },
  bitrix2: {
    label: 'Дакар',
    domain: 'dakar.bitrix24.ru',
    webhookUrl: 'https://dakar.bitrix24.ru/rest/103557/bkc0fjrp9nagpj10/',
    outgoingToken: '9xwao4exygd6pm2b699qma5ouvfkuw8i',
    color: '#1D9E75',
    readOnly: true, // Stealth mode - read only, no messages!
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
