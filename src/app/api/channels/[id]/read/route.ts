// Mark channel as read — clears unread counter, NEVER deletes the chat
// Reads webhook config from header for Bitrix24 operations
import { NextRequest, NextResponse } from 'next/server';
import { resetUnread } from '@/lib/telegram-store';
import { markBitrixDialogRead } from '@/lib/bitrix';
import { parseWebhookHeader } from '@/lib/webhook-config';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Read webhook config from header
  const webhookHeader = request.headers.get('X-Bitrix-Webhooks');
  const webhookConfig = parseWebhookHeader(webhookHeader);

  try {
    // ─── Telegram channel ───
    if (id.startsWith('tg_')) {
      await resetUnread(id);
      return NextResponse.json({ ok: true, source: 'telegram' });
    }

    // ─── Bitrix24 channel ───
    const bitrixMatch = id.match(/^bx_(bitrix\d+)_(.+)$/);
    if (bitrixMatch) {
      const portalKey = bitrixMatch[1];
      const dialogId = bitrixMatch[2];

      // Mark dialog as read in Bitrix24
      try {
        await markBitrixDialogRead(portalKey, dialogId, webhookConfig);
      } catch (e) {
        console.error(`[Read API] Failed to mark ${portalKey} dialog as read:`, e);
      }

      return NextResponse.json({ ok: true, source: portalKey });
    }

    return NextResponse.json({ ok: true, message: 'Unknown channel type' });
  } catch (error) {
    console.error('[Read API] Error:', error);
    return NextResponse.json({ error: 'Failed to mark as read' }, { status: 500 });
  }
}
