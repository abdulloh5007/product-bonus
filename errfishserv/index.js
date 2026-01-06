const express = require('express');
const http = require('http');
const https = require('https');
const fs = require('fs');
const WebSocket = require('ws');
const cors = require('cors');
const path = require('path');

// Import modules
const config = require('./src/config');
const { rateLimiter } = require('./src/middleware/rateLimiter');
const { router: apiRouter, setRooms } = require('./src/routes/api');
const { setupWebSocket, rooms } = require('./src/websocket');
const { startPolling } = require('./src/services/bot');

// Initialize Express
const app = express();

// Create server (HTTP or HTTPS)
let server;
if (config.USE_SSL && fs.existsSync(`${config.SSL_CERT_PATH}/fullchain.pem`)) {
    server = https.createServer({
        key: fs.readFileSync(`${config.SSL_CERT_PATH}/privkey.pem`),
        cert: fs.readFileSync(`${config.SSL_CERT_PATH}/fullchain.pem`)
    }, app);
    console.log('🔒 Running with HTTPS/WSS (SSL enabled)');
} else {
    server = http.createServer(app);
    console.log('🔓 Running with HTTP/WS (no SSL)');
}

// Initialize WebSocket
const wss = new WebSocket.Server({ server });
const wsHandler = setupWebSocket(wss);
setRooms(wsHandler.rooms);

// Middleware
app.use(cors());
app.use(express.json());
app.use(rateLimiter);
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use('/api', apiRouter);

// Viewer page
app.get('/view/:roomId', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'viewer.html'));
});

// Start bot polling
startPolling();

// Start server
server.listen(config.PORT, () => {
    console.log(`\n🚀 Signaling server running on port ${config.PORT}`);
    console.log(`📹 Viewer URL pattern: ${config.SERVER_URL}/view/{roomId}`);

    if (config.TELEGRAM_BOT_TOKEN && config.TELEGRAM_CHAT_ID) {
        console.log('✅ Telegram bot configured');
    } else {
        console.log('⚠️ Telegram not configured');
    }
    console.log('');
});

module.exports = { app, server };
