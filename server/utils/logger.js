const AuditLog = require('../models/AuditLog');

const logAction = async (req, action, entityType, entityId, details) => {
    try {
        const staffId = (req.user && req.user.id) ? req.user.id : null;
        const staffName = (req.user && req.user.name) ? req.user.name : ((req.body && req.body.email) || 'System (Public Action)');
        const ipAddress = (req.headers && req.headers['x-forwarded-for']) || (req.socket ? req.socket.remoteAddress : '0.0.0.0');

        // Ensure details is a string if it's an object
        const detailsStr = typeof details === 'object' ? JSON.stringify(details) : details;

        console.log(`[LOGGER] Attempting to log: ${action} on ${entityType} by ${staffName} (${staffId})`);

        const newLog = await AuditLog.create({
            staffId,
            staffName,
            action,
            entityType,
            entityId: String(entityId),
            details: detailsStr,
            ipAddress
        });

    } catch (error) {
        console.error('Audit Log Error:', error);
        // Don't crash the app if logging fails
    }
};

module.exports = logAction;
