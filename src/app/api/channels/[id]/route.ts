// Get messages for a specific channel - supports Bitrix API and Telegram persistent store
import { NextRequest, NextResponse } from 'next/server';
import { getBitrixMessages } from '@/lib/bitrix';
import { BITRIX_PORTALS } from '@/lib/sources';
import { getMessages as getTgMessages, resetUnread } from '@/lib/telegram-store';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    // ─── Telegram channel ───
    if (id.startsWith('tg_')) {
      const tgMsgs = await getTgMessages(id, 50);
      await resetUnread(id);
      return NextResponse.json(tgMsgs);
    }

    // ─── Bitrix24 channel ───
    const bitrixMatch = id.match(/^bx_(bitrix\d+)_(.+)$/);
    if (bitrixMatch) {
      const portalKey = bitrixMatch[1];
      const dialogPart = bitrixMatch[2];

      const portal = BITRIX_PORTALS[portalKey as keyof typeof BITRIX_PORTALS];
      const webhookUserId = portal?.webhookUserId;

      let dialogId = dialogPart;
      if (!isNaN(Number(dialogPart))) {
        dialogId = dialogPart;
      }

      try {
        const result = await getBitrixMessages(portalKey, dialogId, 30);
        if (result?.messages) {
          const filesLookup: Record<number, any> = {};
          if (Array.isArray(result.files)) {
            for (const f of result.files) {
              filesLookup[f.id] = f;
            }
          }

          const messages = result.messages.map((msg: any) => {
            const author = result.users?.find((u: any) => u.id === msg.author_id);
            const senderType = msg.author_id === 0
              ? 'system'
              : (webhookUserId && msg.author_id === webhookUserId)
                ? 'operator'
                : 'client';

            const fileIds: number[] = msg.params?.FILE_ID || [];
            const msgFiles = fileIds
              .map((fid: number) => {
                const f = filesLookup[fid];
                if (!f) return null;
                return {
                  id: f.id,
                  type: f.type || 'file',
                  name: f.name || `file_${fid}`,
                  urlPreview: f.urlPreview || f.urlShow || '',
                  urlShow: f.urlShow || '',
                  urlDownload: f.urlDownload || '',
                  image: f.image || undefined,
                };
              })
              .filter(Boolean);

            return {
              id: `bx_${msg.id}`,
              channelId: id,
              senderName: author?.name || `User ${msg.author_id}`,
              senderType,
              senderId: msg.author_id,
              senderAvatar: author?.avatar || null,
              text: msg.text || '',
              timestamp: new Date(msg.date).toISOString(),
              isRead: !msg.unread,
              operatorId: null,
              externalId: `bx_${msg.id}`,
              files: msgFiles.length > 0 ? msgFiles : undefined,
            };
          });

          return NextResponse.json(messages.reverse());
        }
      } catch (e) {
        console.error(`[Messages API] Failed to fetch from ${portalKey}:`, e);
      }
    }

    return NextResponse.json([]);
  } catch (error) {
    console.error('[Messages API] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 });
  }
}
