// Send a message from operator to a channel - reads webhook config from header
import { NextRequest, NextResponse } from 'next/server';
import { sendBitrixMessage } from '@/lib/bitrix';
import { sendTelegramMessage } from '@/lib/telegram';
import { addMessage, flushToBlob } from '@/lib/telegram-store';
import { parseWebhookHeader } from '@/lib/webhook-config';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { channelId, text, operatorId } = body;

  // Read webhook config from header
  const webhookHeader = request.headers.get('X-Bitrix-Webhooks');
  const webhookConfig = parseWebhookHeader(webhookHeader);

  if (!channelId || !text) {
    return NextResponse.json({ error: 'channelId и text обязательны' }, { status: 400 });
  }

  try {
    let source = '';
    let sent = false;
    let errorMessage = '';

    // ─── Telegram channel ───
    if (channelId.startsWith('tg_')) {
      source = 'telegram';
      const chatId = channelId.replace('tg_', '');
      const result = await sendTelegramMessage(chatId, text);
      sent = !!result;
      if (!sent) errorMessage = 'Не удалось отправить в Telegram';

      if (sent) {
        await addMessage({
          channelId,
          senderName: operatorId || 'Оператор',
          senderType: 'operator',
          text,
          externalId: `tg_sent_${Date.now()}`,
        });
        flushToBlob().catch(() => {});
      }
    }
    // ─── Bitrix24 channel ───
    else {
      const bitrixMatch = channelId.match(/^bx_(bitrix\d+)_(.+)$/);
      if (bitrixMatch) {
        source = bitrixMatch[1];

        // Check if this portal has a configured webhook
        if (!webhookConfig?.[source]?.webhookUrl?.trim()) {
          return NextResponse.json({
            error: `Портал ${source} не настроен — введите вебхук в настройках`
          }, { status: 403 });
        }

        const dialogId = channelId.replace(`bx_${source}_`, '');
        const result = await sendBitrixMessage(source, dialogId, text, webhookConfig);

        if (result && !result.error) {
          sent = true;
        } else {
          errorMessage = result?.error || 'Ошибка отправки в Битрикс';
        }
      }
    }

    return NextResponse.json({
      ok: sent,
      source,
      error: sent ? undefined : errorMessage
    });
  } catch (error) {
    console.error('[Send API] Error:', error);
    return NextResponse.json({ error: 'Ошибка отправки' }, { status: 500 });
  }
}
