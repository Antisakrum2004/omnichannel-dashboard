// Bitrix24 API adapter - reads dialogs, messages, sends replies
// ALL webhook URLs come from the user's configuration (passed via X-Bitrix-Webhooks header)
// No hardcoded webhooks — fully dynamic per-user
import { WebhookConfig, getWebhookForPortal, extractWebhookUserId } from './webhook-config';

// Task-related methods use the tasks webhook
const TASK_METHODS = [
  'tasks.task.list',
  'tasks.task.get',
  'task.commentitem.getlist',
  'task.commentitem.add',
  'task.elogs.getlist',
];

function isTaskMethod(method: string): boolean {
  return TASK_METHODS.some(m => method.startsWith(m.split('.')[0]));
}

// Core API call — uses webhook URL from user config
async function bitrixApi(
  portalKey: string,
  method: string,
  params: Record<string, any> = {},
  webhookConfig: WebhookConfig | null = null
): Promise<any> {
  // Determine which webhook URL to use
  const methodType = isTaskMethod(method) ? 'tasks' : 'im';
  const baseUrl = getWebhookForPortal(webhookConfig, portalKey, methodType);

  if (!baseUrl) {
    console.warn(`[BitrixAPI] No webhook configured for portal "${portalKey}" (${methodType})`);
    return null;
  }

  const url = `${baseUrl}${method}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      console.error(`Bitrix API error [${portalKey}]: ${response.status} ${response.statusText}`);
      return null;
    }

    const data = await response.json();
    if (data.error) {
      console.error(`Bitrix API error [${portalKey}]:`, data.error_description || data.error);
      return null;
    }

    return data.result;
  } catch (err) {
    console.error(`Bitrix API fetch error [${portalKey}]:`, err);
    return null;
  }
}

// Get the webhook user ID for a given portal from user config
export function getWebhookUserId(webhookConfig: WebhookConfig | null, portalKey: string): number {
  if (!webhookConfig || !webhookConfig[portalKey]) return 0;
  const url = webhookConfig[portalKey].webhookUrl;
  return extractWebhookUserId(url) || 0;
}

// List recent dialogs
export async function getBitrixDialogs(portalKey: string, limit = 50, webhookConfig: WebhookConfig | null = null) {
  return bitrixApi(portalKey, 'im.recent.list', {
    SKIP_OPENLINES: 'N',
    LIMIT: limit,
    PARSE_TEXT: 'Y',
  }, webhookConfig);
}

// Get messages from a dialog
export async function getBitrixMessages(portalKey: string, dialogId: string, limit = 20, webhookConfig: WebhookConfig | null = null) {
  return bitrixApi(portalKey, 'im.dialog.messages.get', {
    DIALOG_ID: dialogId,
    LIMIT: limit,
  }, webhookConfig);
}

// Send a message
export async function sendBitrixMessage(portalKey: string, dialogId: string, text: string, webhookConfig: WebhookConfig | null = null) {
  return bitrixApi(portalKey, 'im.message.add', {
    DIALOG_ID: dialogId,
    MESSAGE: text,
  }, webhookConfig);
}

// Get dialog info
export async function getBitrixDialoInfo(portalKey: string, dialogId: string, webhookConfig: WebhookConfig | null = null) {
  return bitrixApi(portalKey, 'im.dialog.get', {
    DIALOG_ID: dialogId,
  }, webhookConfig);
}

// Mark dialog as read
export async function markBitrixDialogRead(portalKey: string, dialogId: string, webhookConfig: WebhookConfig | null = null) {
  return bitrixApi(portalKey, 'im.dialog.read', {
    DIALOG_ID: dialogId,
  }, webhookConfig);
}

// Get open lines session history
export async function getBitrixOpenLineHistory(portalKey: string, chatId: string | number, webhookConfig: WebhookConfig | null = null) {
  return bitrixApi(portalKey, 'imopenlines.session.history.get', {
    CHAT_ID: typeof chatId === 'string' ? parseInt(chatId.replace('chat', '')) : chatId,
  }, webhookConfig);
}

// Get open line sessions
export async function getBitrixOpenLineSessions(portalKey: string, operatorId?: number, limit = 50, webhookConfig: WebhookConfig | null = null) {
  const params: Record<string, any> = { LIMIT: limit };
  if (operatorId) {
    params.FILTER = { OPERATOR_ID: operatorId };
  }
  return bitrixApi(portalKey, 'imopenlines.session.list', params, webhookConfig);
}

// Get open line session details
export async function getBitrixOpenLineSessionDetails(portalKey: string, sessionId: number | string, webhookConfig: WebhookConfig | null = null) {
  return bitrixApi(portalKey, 'imopenlines.session.get', {
    SESSION_ID: sessionId,
  }, webhookConfig);
}

// Get chat members
export async function getBitrixChatMembers(portalKey: string, chatId: string | number, webhookConfig: WebhookConfig | null = null) {
  return bitrixApi(portalKey, 'im.chat.user.list', {
    CHAT_ID: typeof chatId === 'string' ? parseInt(chatId) : chatId,
  }, webhookConfig);
}

// Get task comments
export async function getBitrixTaskComments(portalKey: string, taskId: string | number, webhookConfig: WebhookConfig | null = null) {
  return bitrixApi(portalKey, 'task.commentitem.getlist', {
    TASKID: taskId,
    PARAMS: { NAV_PARAMS: { nPageSize: 20, iNumPage: 1 } },
  }, webhookConfig);
}

// Get list of tasks
export async function getBitrixTasks(portalKey: string, limit = 50, webhookConfig: WebhookConfig | null = null) {
  const params: Record<string, any> = {
    select: ['ID', 'TITLE', 'RESPONSIBLE_NAME', 'DATE_ACTIVITY', 'STATUS'],
    order: { DATE_ACTIVITY: 'DESC' },
    start: 0,
  };
  return bitrixApi(portalKey, 'tasks.task.list', params, webhookConfig);
}
