# Fishing Project

## Structure
- `client/` - Next.js frontend (deployed to Vercel)
- `server/` - Node.js WebSocket server (deployed to VPS)

## Environment Variables

### Client (.env.local)
```
NEXT_PUBLIC_SIGNALING_SERVER=wss://your-domain:4000
NEXT_PUBLIC_WS_TOKEN=your_ws_token
NEXT_PUBLIC_API_TOKEN=your_api_token
API_SECRET_TOKEN=your_api_token
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id
```

### Server (.env)
```
PORT=4000
USE_SSL=true
SSL_CERT_PATH=/etc/letsencrypt/live/your-domain
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id
WS_SECRET_TOKEN=your_ws_token
```

## Deployment

See deployment instructions below.
