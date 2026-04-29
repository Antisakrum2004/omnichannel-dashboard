// Setup Telegram webhook — call this after deploying to register the webhook URL
import { NextRequest, NextResponse } from 'next/server';
import { setTelegramWebhook } from '@/lib/telegram';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const baseUrl = body.url || (process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : null);

  if (!baseUrl) {
    return NextResponse.json({
      error: 'No base URL provided. Pass { "url": "https://your-app.vercel.app" } in the request body.',
    }, { status: 400 });
  }

  const webhookUrl = `${baseUrl}/api/webhook/telegram`;
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET || 'omni_tg_secret_2024';

  try {
    const result = await setTelegramWebhook(webhookUrl, secret);

    if (result) {
      return NextResponse.json({
        ok: true,
        webhookUrl,
        message: 'Webhook registered successfully',
        result,
      });
    } else {
      return NextResponse.json({
        error: 'Failed to set webhook. Check TELEGRAM_BOT_TOKEN.',
      }, { status: 500 });
    }
  } catch (error: any) {
    return NextResponse.json({
      error: error.message || 'Unknown error',
    }, { status: 500 });
  }
}

export async function GET() {
  // Check webhook status
  const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  if (!TELEGRAM_TOKEN) {
    return NextResponse.json({ status: 'no-token', message: 'TELEGRAM_BOT_TOKEN not configured' });
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/getWebhookInfo`);
    const data = await res.json();
    return NextResponse.json({
      status: 'active',
      tokenSet: true,
      webhookInfo: data.result || null,
    });
  } catch (e) {
    return NextResponse.json({ status: 'error', message: 'Failed to check webhook info' });
  }
}
