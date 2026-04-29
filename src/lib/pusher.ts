// Pusher configuration for real-time messaging
// Free tier: 200K messages/day, 100 concurrent connections

export const PUSHER_CONFIG = {
  appId: process.env.PUSHER_APP_ID || '',
  key: process.env.PUSHER_KEY || '',
  secret: process.env.PUSHER_SECRET || '',
  cluster: process.env.PUSHER_CLUSTER || 'eu',
};

export const PUSHER_CHANNELS = {
  MESSAGES: 'omnichannel-messages',
  PRESENCE: 'omnichannel-presence',
};

export const PUSHER_EVENTS = {
  NEW_MESSAGE: 'new-message',
  CHANNEL_UPDATED: 'channel-updated',
  MESSAGE_READ: 'message-read',
  OPERATOR_TYPING: 'operator-typing',
};
