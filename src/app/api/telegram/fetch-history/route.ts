// Fetch Telegram chat history by temporarily switching to getUpdates mode
import { NextResponse } from 'next/server';
import { telegramApi, setTelegramWebhook } from '@/lib/telegram';
import { upsertChannel, addMessage, getAllChannels } from '@/lib/telegram-store';

export async function POST() {
  const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  if (!TELEGRAM_TOKEN) {
    return NextResponse.json({ error: 'TELEGRAM_BOT_TOKEN not set' }, { status: 500 });
  }

  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'https://my-project-eta-lemon.vercel.app';
  const webhookUrl = `${baseUrl}/api/webhook/telegram`;
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET || 'omni_tg_secret_2024';

  try {
    // Step 1: Get current webhook info
    const webhookInfo = await telegramApi('getWebhookInfo');
    const currentWebhookUrl = webhookInfo?.url || '';

    // Step 2: Delete webhook temporarily to enable getUpdates
    await telegramApi('deleteWebhook', { drop_pending_updates: false });

    // Step 3: Fetch recent updates via getUpdates
    let allUpdates: any[] = [];
    let offset = 0;

    for (let i = 0; i < 5; i++) {
      const updates = await telegramApi('getUpdates', {
        offset,
        limit: 100,
        timeout: 0,
        allowed_updates: ['message'],
      });

      if (!updates || !Array.isArray(updates) || updates.length === 0) break;

      allUpdates = allUpdates.concat(updates);
      offset = updates[updates.length - 1].update_id + 1;

      if (updates.length < 100) break;
    }

    // Step 4: Process updates into the store
    let newMessages = 0;

    for (const update of allUpdates) {
      const message = update.message || update.edited_message;
      if (!message) continue;

      const chatId = String(message.chat.id);
      const chatType = message.chat.type || 'private';
      const isGroup = chatType === 'group' || chatType === 'supergroup';
      const channelName = isGroup
        ? message.chat.title || 'Telegram Group'
        : `${message.chat.first_name || ''} ${message.chat.last_name || ''}`.trim() || 'Telegram User';

      const isFromBot = message.from?.is_bot === true;
      const senderName = message.from
        ? `${message.from.first_name || ''} ${message.from.last_name || ''}`.trim() || 'Unknown'
        : 'Unknown';
      const messageText = message.text || message.caption || '';

      if (!messageText) continue;

      upsertChannel({
        chatId,
        chatType,
        name: channelName,
        lastMessage: messageText,
        isFromClient: !isFromBot,
      });

      addMessage({
        channelId: `tg_${chatId}`,
        senderName,
        senderType: isFromBot ? 'operator' : 'client',
        text: messageText,
        externalId: `tg_${message.message_id}`,
        senderId: message.from?.id,
      });

      newMessages++;
    }

    // Step 5: Re-register webhook
    await setTelegramWebhook(currentWebhookUrl || webhookUrl, secret);

    return NextResponse.json({
      ok: true,
      updatesProcessed: allUpdates.length,
      newMessages,
      webhookRestored: true,
    });
  } catch (error) {
    console.error('[Fetch TG History] Error:', error);
    try { await setTelegramWebhook(webhookUrl, secret); } catch (e) { /* ignore */ }
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
