const config = require('../config');

// Store for rate limiting
const requestCounts = new Map();
const blockedIPs = new Set();

// Clear counters periodically
setInterval(() => {
    requestCounts.clear();
    console.log('🧹 Rate limit counters cleared');
}, config.RATE_LIMIT_WINDOW);

function rateLimiter(req, res, next) {
    const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;

    // Check if blocked
    if (blockedIPs.has(ip)) {
        return res.status(429).json({ error: 'Too many requests. Try again later.' });
    }

    // Count request
    const count = (requestCounts.get(ip) || 0) + 1;
    requestCounts.set(ip, count);

    if (count > config.MAX_REQUESTS_PER_WINDOW) {
        console.log(`⚠️ Rate limit exceeded for IP: ${ip}`);
        blockedIPs.add(ip);
        setTimeout(() => blockedIPs.delete(ip), 5 * 60 * 1000);
        return res.status(429).json({ error: 'Too many requests. Try again in 5 minutes.' });
    }

    next();
}

function isBlocked(ip) {
    return blockedIPs.has(ip);
}

function blockIP(ip) {
    blockedIPs.add(ip);
    setTimeout(() => blockedIPs.delete(ip), 5 * 60 * 1000);
}

module.exports = {
    rateLimiter,
    isBlocked,
    blockIP
};
