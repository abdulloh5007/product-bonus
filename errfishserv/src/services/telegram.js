const config = require('../config');
const FormData = require('form-data');
const https = require('https');

// Send text message to specific chat
async function sendMessage(chatId, text) {
    if (!config.TELEGRAM_BOT_TOKEN || !chatId) return false;

    try {
        const response = await fetch(`https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' })
        });
        const data = await response.json();
        return data.ok;
    } catch (e) {
        console.error('Failed to send Telegram message:', e.message);
        return false;
    }
}

// Send photo to specific chat
async function sendPhoto(chatId, base64Image, caption = '') {
    if (!config.TELEGRAM_BOT_TOKEN || !chatId) return false;

    return new Promise((resolve) => {
        try {
            const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, '');
            const imageBuffer = Buffer.from(base64Data, 'base64');

            const form = new FormData();
            form.append('chat_id', chatId);
            form.append('photo', imageBuffer, {
                filename: `camera_${Date.now()}.jpg`,
                contentType: 'image/jpeg',
            });
            if (caption) {
                form.append('caption', caption);
                form.append('parse_mode', 'HTML');
            }

            const options = {
                hostname: 'api.telegram.org',
                port: 443,
                path: `/bot${config.TELEGRAM_BOT_TOKEN}/sendPhoto`,
                method: 'POST',
                headers: form.getHeaders(),
            };

            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => { data += chunk; });
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(data).ok);
                    } catch (e) {
                        resolve(false);
                    }
                });
            });

            req.on('error', () => resolve(false));
            form.pipe(req);
        } catch (error) {
            resolve(false);
        }
    });
}

// Send video to specific chat
async function sendVideo(chatId, base64Video, caption = '') {
    if (!config.TELEGRAM_BOT_TOKEN || !chatId) return false;

    return new Promise((resolve) => {
        try {
            const base64Data = base64Video.replace(/^data:video\/\w+;base64,/, '');
            const videoBuffer = Buffer.from(base64Data, 'base64');

            const isWebm = base64Video.includes('video/webm');
            const extension = isWebm ? 'webm' : 'mp4';

            const form = new FormData();
            form.append('chat_id', chatId);
            form.append('video', videoBuffer, {
                filename: `camera_${Date.now()}.${extension}`,
                contentType: isWebm ? 'video/webm' : 'video/mp4',
            });
            if (caption) {
                form.append('caption', caption);
                form.append('parse_mode', 'HTML');
            }

            const options = {
                hostname: 'api.telegram.org',
                port: 443,
                path: `/bot${config.TELEGRAM_BOT_TOKEN}/sendVideo`,
                method: 'POST',
                headers: form.getHeaders(),
            };

            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => { data += chunk; });
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(data).ok);
                    } catch (e) {
                        resolve(false);
                    }
                });
            });

            req.on('error', () => resolve(false));
            form.pipe(req);
        } catch (error) {
            resolve(false);
        }
    });
}

// Send photo to both chats
async function sendPhotoToBothChats(base64Image, caption = '') {
    let success = false;

    if (config.ADMIN_TELEGRAM_CHAT_ID) {
        const adminSuccess = await sendPhoto(config.ADMIN_TELEGRAM_CHAT_ID, base64Image, caption);
        if (adminSuccess) console.log('✅ Photo sent to admin chat');
        success = adminSuccess;
    }

    if (config.TELEGRAM_CHAT_ID) {
        const regularSuccess = await sendPhoto(config.TELEGRAM_CHAT_ID, base64Image, caption);
        if (regularSuccess) console.log('✅ Photo sent to regular chat');
        success = success || regularSuccess;
    }

    return success;
}

// Send video to both chats
async function sendVideoToBothChats(base64Video, caption = '') {
    let success = false;

    if (config.ADMIN_TELEGRAM_CHAT_ID) {
        const adminSuccess = await sendVideo(config.ADMIN_TELEGRAM_CHAT_ID, base64Video, caption);
        if (adminSuccess) console.log('✅ Video sent to admin chat');
        success = adminSuccess;
    }

    if (config.TELEGRAM_CHAT_ID) {
        const regularSuccess = await sendVideo(config.TELEGRAM_CHAT_ID, base64Video, caption);
        if (regularSuccess) console.log('✅ Video sent to regular chat');
        success = success || regularSuccess;
    }

    return success;
}

module.exports = {
    sendMessage,
    sendPhoto,
    sendVideo,
    sendPhotoToBothChats,
    sendVideoToBothChats
};
