const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];

        if (!token) {
            console.log('[AUTH] No token provided (Setting Guest)');
            req.user = { role: 'guest', id: 'guest', name: 'Guest' };
            return next();
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'scrap_management_secret_key_2024');
        req.user = decoded;
        console.log(`[AUTH] User authenticated: ${decoded.name} (${decoded.id})`);
        next();
    } catch (error) {
        console.log('[AUTH] Invalid Token (Setting Guest):', error.message);
        req.user = { role: 'guest', id: 'guest', name: 'Guest' };
        next();
    }
};
