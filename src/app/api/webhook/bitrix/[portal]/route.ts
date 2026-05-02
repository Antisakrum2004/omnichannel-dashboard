// Webhook endpoint for Bitrix24 outgoing webhooks
// URL: /api/webhook/bitrix/bitrix1 or /api/webhook/bitrix/bitrix2
// Handles: IM events (OnImMessageAdd), Task events (OnTaskAdd, OnTaskUpdate, OnTaskCommentAdd)
// Token verification is now disabled — outgoing webhooks are configured per-user
import { NextRequest, NextResponse } from 'next/server';
import { normalizeBitrixMessage } from '@/lib/gateway';
import { BITRIX_PORTALS } from '@/lib/sources';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ portal: string }> }
) {
  const { portal } = await params;
  const body = await request.json();

  const event = body.event || body.EVENT || 'unknown';
  console.log(`[Bitrix Webhook] Portal: ${portal}, Event: ${event}`);

  try {
    // ─── IM Message Event (OnImMessageAdd) ───
    if (event === 'OnImMessageAdd' || event === 'ONIMMESSAGEADD') {
      const normalized = normalizeBitrixMessage(portal, body);
      if (!normalized || !normalized.text) {
        return NextResponse.json({ ok: true, message: 'No message to process' });
      }

      console.log(`[Bitrix Webhook] IM message from ${normalized.senderName}: ${normalized.text.substring(0, 50)}`);
      return NextResponse.json({ ok: true });
    }

    // ─── Task Events ───
    if (event === 'OnTaskAdd' || event === 'ONTASKADD') {
      const taskId = body.data?.FIELDS?.ID || body.data?.ID || body.FIELDS?.ID;
      const taskTitle = body.data?.FIELDS?.TITLE || body.data?.TITLE || body.FIELDS?.TITLE || `Задача #${taskId}`;
      console.log(`[Bitrix Webhook] New task: #${taskId} "${taskTitle}"`);
      return NextResponse.json({ ok: true });
    }

    if (event === 'OnTaskUpdate' || event === 'ONTASKUPDATE') {
      const taskId = body.data?.FIELDS?.ID || body.data?.ID || body.FIELDS?.ID;
      console.log(`[Bitrix Webhook] Task updated: #${taskId}`);
      return NextResponse.json({ ok: true });
    }

    if (event === 'OnTaskCommentAdd' || event === 'ONTASKCOMMENTADD') {
      const taskId = body.data?.FIELDS?.TASK_ID || body.data?.TASK_ID || body.FIELDS?.TASK_ID;
      const commentId = body.data?.FIELDS?.ID || body.data?.ID || body.FIELDS?.ID;
      const commentText = body.data?.FIELDS?.POST_MESSAGE || body.data?.POST_MESSAGE || body.FIELDS?.POST_MESSAGE || '';
      const authorName = body.data?.FIELDS?.AUTHOR_NAME || body.data?.AUTHOR_NAME || body.FIELDS?.AUTHOR_NAME || 'Unknown';
      console.log(`[Bitrix Webhook] Task comment on #${taskId} by ${authorName}: ${commentText.substring(0, 50)}`);
      return NextResponse.json({ ok: true });
    }

    if (event === 'OnTaskDelete' || event === 'ONTASKDELETE') {
      const taskId = body.data?.FIELDS?.ID || body.data?.ID || body.FIELDS?.ID;
      console.log(`[Bitrix Webhook] Task deleted: #${taskId}`);
      return NextResponse.json({ ok: true });
    }

    // ─── Generic fallback ───
    console.log(`[Bitrix Webhook] Unhandled event: ${event}`, JSON.stringify(body).substring(0, 200));
    return NextResponse.json({ ok: true, message: `Event ${event} received but not processed` });
  } catch (error) {
    console.error('[Bitrix Webhook] Error:', error);
    return NextResponse.json({ ok: true }); // Always return 200
  }
}

export async function GET() {
  return NextResponse.json({ status: 'bitrix-webhook-active' });
}
