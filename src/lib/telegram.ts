// Telegram Bot API adapter

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

export async function telegramApi(method: string, params: Record<string, any> = {}): Promise<any> {
  if (!TELEGRAM_TOKEN) {
    console.warn('TELEGRAM_BOT_TOKEN not set');
    return null;
  }

  try {
    const response = await fetch(`${TELEGRAM_API}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    const data = await response.json();
    if (!data.ok) {
      console.error(`Telegram API error:`, data.description);
      return null;
    }
    return data.result;
  } catch (err) {
    console.error('Telegram API fetch error:', err);
    return null;
  }
}

// Send a message to a Telegram chat
export async function sendTelegramMessage(chatId: string | number, text: string) {
  return telegramApi('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
  });
}

// Get chat info
export async function getTelegramChat(chatId: string | number) {
  return telegramApi('getChat', { chat_id: chatId });
}

// Get chat member count
export async function getTelegramChatMembersCount(chatId: string | number) {
  return telegramApi('getChatMemberCount', { chat_id: chatId });
}

// Get my bot info
export async function getTelegramMe() {
  return telegramApi('getMe');
}

// Set webhook
export async function setTelegramWebhook(url: string, secretToken: string) {
  return telegramApi('setWebhook', {
    url,
    secret_token: secretToken,
    allowed_updates: ['message', 'edited_message', 'channel_post', 'edited_channel_post'],
  });
}

// Delete webhook (needed for getUpdates to work)
export async function deleteTelegramWebhook() {
  return telegramApi('deleteWebhook');
}

// Get pending updates (for historical message fetching)
export async function getTelegramUpdates(offset = 0, limit = 100) {
  return telegramApi('getUpdates', {
    offset,
    limit,
    allowed_updates: ['message', 'edited_message', 'channel_post', 'edited_channel_post'],
    timeout: 0,
  });
}

// Verify Telegram webhook secret
export function verifyTelegramWebhook(secret: string): boolean {
  return secret === (process.env.TELEGRAM_WEBHOOK_SECRET || 'omni_tg_secret_2024');
}
