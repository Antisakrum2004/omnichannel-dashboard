import { NextResponse } from 'next/server';
import { deleteTelegramWebhook, getTelegramUpdates, setTelegramWebhook, getTelegramMe } from '@/lib/telegram';
import { upsertChannel, addMessage } from '@/lib/telegram-store';

export async function POST() {
  try {
    // 1. Get bot info
    const botInfo = await getTelegramMe();
    if (!botInfo) {
      return NextResponse.json({ error: 'Бот не найден — проверьте токен' }, { status: 400 });
    }

    // 2. Delete webhook temporarily
    await deleteTelegramWebhook();

    // 3. Pull all pending updates
    let allUpdates: any[] = [];
    let offset = 0;
    let hasMore = true;
    
    while (hasMore) {
      const updates = await getTelegramUpdates(offset, 100);
      if (!updates || updates.length === 0) {
        hasMore = false;
        break;
      }
      allUpdates = allUpdates.concat(updates);
      offset = updates[updates.length - 1].update_id + 1;
      if (updates.length < 100) hasMore = false;
    }

    // 4. Process messages from updates
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
      const text = message.text || message.caption || '';

      if (!text && !message.caption) continue;

      const channel = upsertChannel({
        chatId,
        chatType,
        name: channelName,
        lastMessage: text,
        isFromClient: !isFromBot,
      });

      const msg = addMessage({
        channelId: channel.id,
        senderName,
        senderType: isFromBot ? 'operator' : 'client',
        text,
        externalId: `tg_${message.message_id}`,
        senderId: message.from?.id,
      });

      if (msg) newMessages++;
    }

    // 5. Re-set webhook
    const webhookUrl = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}/api/webhook/telegram`
      : 'https://my-project-eta-lemon.vercel.app/api/webhook/telegram';
    
    await setTelegramWebhook(webhookUrl, 'omni_tg_secret_2024');

    return NextResponse.json({
      ok: true,
      updatesProcessed: allUpdates.length,
      newMessages,
      botName: botInfo.username,
    });
  } catch (error: any) {
    console.error('[TG Fetch History] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
