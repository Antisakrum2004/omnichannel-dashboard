// Bitrix24 API adapter - reads dialogs, messages, sends replies
// Uses IM webhook for chat operations and Tasks webhook for task operations
// Supports per-user webhooks via userSlug parameter
import { BITRIX_PORTALS, DASHBOARD_USERS } from './sources';

interface BitrixPortal {
  label: string;
  domain: string;
  webhookUrl: string;
  tasksWebhookUrl: string;
  webhookUserId: number;
  outgoingToken: string;
  color: string;
  readOnly: boolean;
}

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

// Determine which webhook URL to use based on the API method and user
function getWebhookUrl(portal: BitrixPortal, method: string): string {
  if (isTaskMethod(method)) {
    return portal.tasksWebhookUrl || portal.webhookUrl;
  }
  return portal.webhookUrl;
}

// Get webhook URL for a specific user and portal
function getUserWebhookUrl(userSlug: string, portalKey: string, method: string): string | null {
  const user = DASHBOARD_USERS[userSlug];
  if (!user) return null;
  const portalConfig = user.portals[portalKey];
  if (!portalConfig) return null;
  return isTaskMethod(method) ? portalConfig.tasksWebhookUrl : portalConfig.webhookUrl;
}

async function bitrixApi(portalKey: string, method: string, params: Record<string, any> = {}, userSlug?: string): Promise<any> {
  let baseUrl: string;

  // If a userSlug is provided, use that user's webhooks
  if (userSlug && DASHBOARD_USERS[userSlug]) {
    const userUrl = getUserWebhookUrl(userSlug, portalKey, method);
    if (!userUrl) {
      console.error(`No portal config for ${portalKey} in user ${userSlug}`);
      return null;
    }
    baseUrl = userUrl;
  } else {
    // Default: use BITRIX_PORTALS
    const portal = BITRIX_PORTALS[portalKey as keyof typeof BITRIX_PORTALS] as BitrixPortal | undefined;
    if (!portal) {
      console.error(`Unknown portal: ${portalKey}`);
      return null;
    }
    baseUrl = getWebhookUrl(portal, method);
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

// Get the webhookUserId for a given user slug and portal
export function getWebhookUserId(userSlug: string | undefined, portalKey: string): number {
  if (userSlug && DASHBOARD_USERS[userSlug]) {
    // For the user-specific view, use the user's own Bitrix ID
    return DASHBOARD_USERS[userSlug].bitrixUserId;
  }
  // Default: use portal's webhookUserId
  const portal = BITRIX_PORTALS[portalKey as keyof typeof BITRIX_PORTALS] as BitrixPortal | undefined;
  return portal?.webhookUserId || 0;
}

// List recent dialogs
export async function getBitrixDialogs(portalKey: string, limit = 50, userSlug?: string) {
  return bitrixApi(portalKey, 'im.recent.list', {
    SKIP_OPENLINES: 'N',
    LIMIT: limit,
    PARSE_TEXT: 'Y',
  }, userSlug);
}

// Get messages from a dialog
export async function getBitrixMessages(portalKey: string, dialogId: string, limit = 20, userSlug?: string) {
  return bitrixApi(portalKey, 'im.dialog.messages.get', {
    DIALOG_ID: dialogId,
    LIMIT: limit,
  }, userSlug);
}

// Send a message (only for non-readOnly portals!)
export async function sendBitrixMessage(portalKey: string, dialogId: string, text: string, userSlug?: string) {
  const portal = BITRIX_PORTALS[portalKey as keyof typeof BITRIX_PORTALS] as BitrixPortal | undefined;
  if (!portal) throw new Error(`Unknown portal: ${portalKey}`);
  if (portal.readOnly) {
    console.warn(`Portal ${portalKey} is read-only, not sending message`);
    return { error: 'Portal is read-only' };
  }
  return bitrixApi(portalKey, 'im.message.add', {
    DIALOG_ID: dialogId,
    MESSAGE: text,
  }, userSlug);
}

// Get dialog info
export async function getBitrixDialoInfo(portalKey: string, dialogId: string, userSlug?: string) {
  return bitrixApi(portalKey, 'im.dialog.get', {
    DIALOG_ID: dialogId,
  }, userSlug);
}

// Mark dialog as read
export async function markBitrixDialogRead(portalKey: string, dialogId: string, userSlug?: string) {
  return bitrixApi(portalKey, 'im.dialog.read', {
    DIALOG_ID: dialogId,
  }, userSlug);
}

// Get open lines session history
export async function getBitrixOpenLineHistory(portalKey: string, chatId: string | number, userSlug?: string) {
  return bitrixApi(portalKey, 'imopenlines.session.history.get', {
    CHAT_ID: typeof chatId === 'string' ? parseInt(chatId.replace('chat', '')) : chatId,
  }, userSlug);
}

// Verify outgoing webhook token
export function verifyBitrixWebhookToken(portalKey: string, token: string): boolean {
  const portal = BITRIX_PORTALS[portalKey as keyof typeof BITRIX_PORTALS] as BitrixPortal | undefined;
  if (!portal) return false;
  return portal.outgoingToken === token;
}

// Get task comments (tasks have their own chat channels)
export async function getBitrixTaskComments(portalKey: string, taskId: string | number, userSlug?: string) {
  return bitrixApi(portalKey, 'task.commentitem.getlist', {
    TASKID: taskId,
    PARAMS: { NAV_PARAMS: { nPageSize: 20, iNumPage: 1 } },
  }, userSlug);
}

// Get list of tasks (most recently active, all statuses)
export async function getBitrixTasks(portalKey: string, limit = 50, userSlug?: string) {
  return bitrixApi(portalKey, 'tasks.task.list', {
    select: ['ID', 'TITLE', 'RESPONSIBLE_NAME', 'DATE_ACTIVITY', 'STATUS'],
    order: { DATE_ACTIVITY: 'DESC' },
    start: 0,
  }, userSlug);
}
