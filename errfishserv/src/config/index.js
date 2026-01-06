require('dotenv').config();

module.exports = {
    // Server
    PORT: process.env.PORT || 4000,
    USE_SSL: process.env.USE_SSL === 'true',
    SSL_CERT_PATH: process.env.SSL_CERT_PATH || '/etc/letsencrypt/live/errfishserv.duckdns.org',
    SERVER_URL: process.env.SERVER_URL || 'http://localhost:4000',

    // Telegram
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID,
    ADMIN_TELEGRAM_CHAT_ID: process.env.ADMIN_TELEGRAM_CHAT_ID,

    // Auth
    WS_SECRET_TOKEN: process.env.WS_SECRET_TOKEN,
    API_SECRET_TOKEN: process.env.API_SECRET_TOKEN,

    // Rate Limiting
    RATE_LIMIT_WINDOW: 60 * 1000, // 1 minute
    MAX_REQUESTS_PER_WINDOW: 100,
    MAX_WS_CONNECTIONS_PER_IP: 5,
    MAX_MESSAGES_PER_MINUTE: 200
};
