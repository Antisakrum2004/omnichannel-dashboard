// Bitrix24 API adapter - reads dialogs, messages, sends replies
import { BITRIX_PORTALS } from './sources';

interface BitrixPortal {
  label: string;
  domain: string;
  webhookUrl: string;
  outgoingToken: string;
  color: string;
  readOnly: boolean;
}

async function bitrixApi(portalKey: string, method: string, params: Record<string, any> = {}): Promise<any> {
  const portal = BITRIX_PORTALS[portalKey as keyof typeof BITRIX_PORTALS] as BitrixPortal | undefined;
  if (!portal) throw new Error(`Unknown portal: ${portalKey}`);

  const url = `${portal.webhookUrl}${method}`;
  
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

// List recent dialogs
export async function getBitrixDialogs(portalKey: string, limit = 50) {
  return bitrixApi(portalKey, 'im.recent.list', {
    SKIP_OPENLINES: 'N',
    LIMIT: limit,
    PARSE_TEXT: 'Y',
  });
}

// Get messages from a dialog
export async function getBitrixMessages(portalKey: string, dialogId: string, limit = 20) {
  return bitrixApi(portalKey, 'im.dialog.messages.get', {
    DIALOG_ID: dialogId,
    LIMIT: limit,
  });
}

// Send a message (only for non-readOnly portals!)
export async function sendBitrixMessage(portalKey: string, dialogId: string, text: string) {
  const portal = BITRIX_PORTALS[portalKey as keyof typeof BITRIX_PORTALS] as BitrixPortal | undefined;
  if (!portal) throw new Error(`Unknown portal: ${portalKey}`);
  if (portal.readOnly) {
    console.warn(`Portal ${portalKey} is read-only, not sending message`);
    return { error: 'Portal is read-only' };
  }
  return bitrixApi(portalKey, 'im.message.add', {
    DIALOG_ID: dialogId,
    MESSAGE: text,
  });
}

// Get dialog info
export async function getBitrixDialoInfo(portalKey: string, dialogId: string) {
  return bitrixApi(portalKey, 'im.dialog.get', {
    DIALOG_ID: dialogId,
  });
}

// Mark dialog as read
export async function markBitrixDialogRead(portalKey: string, dialogId: string) {
  return bitrixApi(portalKey, 'im.dialog.read', {
    DIALOG_ID: dialogId,
  });
}

// Get open lines session history
export async function getBitrixOpenLineHistory(portalKey: string, chatId: string | number) {
  return bitrixApi(portalKey, 'imopenlines.session.history.get', {
    CHAT_ID: typeof chatId === 'string' ? parseInt(chatId.replace('chat', '')) : chatId,
  });
}

// Verify outgoing webhook token
export function verifyBitrixWebhookToken(portalKey: string, token: string): boolean {
  const portal = BITRIX_PORTALS[portalKey as keyof typeof BITRIX_PORTALS] as BitrixPortal | undefined;
  if (!portal) return false;
  return portal.outgoingToken === token;
}
