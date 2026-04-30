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
// We use TWO webhook URLs per portal:
//   webhookUrl (IM)  — has im/imconnector/imopenlines scope for chat operations
//   tasksWebhookUrl  — has task/tasks scope for task operations
export const BITRIX_PORTALS = {
  bitrix1: {
    label: 'Наш Битрикс',
    domain: '1c-cms.bitrix24.ru',
    // IM webhook — has im, imconnector, imopenlines scope
    webhookUrl: 'https://1c-cms.bitrix24.ru/rest/116/962u568uyeakin6y/',
    // Tasks webhook — has task, tasks, tasks_extended, disk, lists scope
    tasksWebhookUrl: 'https://1c-cms.bitrix24.ru/rest/116/es8z4taxj1hzlp8b/',
    webhookUserId: 116, // Webhook user ID — messages from this user are "our" operator messages
    outgoingToken: 'e3ecp1omrqwo75qqe2nng9e3m9y1xiym',
    color: '#3B8BD4',
    readOnly: false, // Full access - testing portal
    portalType: 'task', // Include task chats
  },
  bitrix2: {
    label: 'Дакар',
    domain: 'dakar.bitrix24.ru',
    // IM webhook — has im, imconnector, imopenlines scope
    webhookUrl: 'https://dakar.bitrix24.ru/rest/103557/bkc0fjrp9nagpj10/',
    // Tasks webhook — has crm, task, tasks, tasks_extended, lists scope
    tasksWebhookUrl: 'https://dakar.bitrix24.ru/rest/103557/7vdwpqb1buur4j0x/',
    webhookUserId: 103557, // Webhook user ID — messages from this user are "our" operator messages
    outgoingToken: '9xwao4exygd6pm2b699qma5ouvfkuw8i',
    color: '#1D9E75',
    readOnly: false, // Full access - can send messages
    portalType: 'task', // Include task chats
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
