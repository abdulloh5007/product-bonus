const config = require('../config');

function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    const token = authHeader?.replace('Bearer ', '');

    if (config.API_SECRET_TOKEN && token !== config.API_SECRET_TOKEN) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    next();
}

module.exports = authMiddleware;
