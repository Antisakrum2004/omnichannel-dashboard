// Get messages for a specific channel - reads webhook config from header
import { NextRequest, NextResponse } from 'next/server';
import { getBitrixMessages, getBitrixTaskComments, getWebhookUserId } from '@/lib/bitrix';
import { parseWebhookHeader } from '@/lib/webhook-config';
import { getMessages as getTgMessages, resetUnread } from '@/lib/telegram-store';

export async function GET(
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
      const tgMsgs = await getTgMessages(id, 50);
      await resetUnread(id);
      return NextResponse.json(tgMsgs);
    }

    // ─── Bitrix24 task channel ───
    const taskMatch = id.match(/^bx_(bitrix\d+)_task_(\d+)$/);
    if (taskMatch) {
      const portalKey = taskMatch[1];
      const taskId = taskMatch[2];
      const webhookUserId = getWebhookUserId(webhookConfig, portalKey);

      try {
        const result = await getBitrixTaskComments(portalKey, taskId, webhookConfig);
        if (result && Array.isArray(result)) {
          const messages = result.map((comment: any) => {
            const authorId = comment.AUTHOR_ID || comment.authorId || 0;
            const senderType = authorId === 0
              ? 'system'
              : (webhookUserId && authorId === webhookUserId) ? 'operator' : 'client';

            return {
              id: `bx_task_c_${comment.ID || comment.id}`,
              channelId: id,
              senderName: comment.AUTHOR_NAME || comment.authorName || `User ${authorId}`,
              senderType,
              senderId: authorId,
              senderAvatar: null,
              text: comment.POST_MESSAGE || comment.postMessage || '',
              timestamp: new Date(comment.POST_DATE || comment.postDate || new Date().toISOString()).toISOString(),
              isRead: true,
              operatorId: null,
              externalId: `bx_task_c_${comment.ID || comment.id}`,
            };
          });
          return NextResponse.json(messages);
        }
        return NextResponse.json([]);
      } catch (e) {
        console.error(`[Messages API] Failed to fetch task comments from ${portalKey}:`, e);
        return NextResponse.json([]);
      }
    }

    // ─── Bitrix24 regular chat channel ───
    const bitrixMatch = id.match(/^bx_(bitrix\d+)_(.+)$/);
    if (bitrixMatch) {
      const portalKey = bitrixMatch[1];
      const dialogPart = bitrixMatch[2];
      const webhookUserId = getWebhookUserId(webhookConfig, portalKey);
      let dialogId = dialogPart;
      if (!isNaN(Number(dialogPart))) dialogId = dialogPart;

      try {
        const result = await getBitrixMessages(portalKey, dialogId, 30, webhookConfig);
        if (result?.messages) {
          const filesLookup: Record<number, any> = {};
          if (Array.isArray(result.files)) {
            for (const f of result.files) filesLookup[f.id] = f;
          }

          const messages = result.messages.map((msg: any) => {
            const author = result.users?.find((u: any) => u.id === msg.author_id);
            const senderType = msg.author_id === 0
              ? 'system'
              : (webhookUserId && msg.author_id === webhookUserId) ? 'operator' : 'client';

            const fileIds: number[] = msg.params?.FILE_ID || [];
            const msgFiles = fileIds
              .map((fid: number) => {
                const f = filesLookup[fid];
                if (!f) return null;
                return { id: f.id, type: f.type || 'file', name: f.name || `file_${fid}`,
                  urlPreview: f.urlPreview || f.urlShow || '', urlShow: f.urlShow || '',
                  urlDownload: f.urlDownload || '', image: f.image || undefined };
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
