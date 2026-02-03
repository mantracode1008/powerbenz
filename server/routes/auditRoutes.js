const express = require('express');
const router = express.Router();
const AuditLog = require('../models/AuditLog');
const protect = require('../middleware/auth');

router.use(protect);

router.get('/', async (req, res) => {
    // Check for Admin Role OR Explicit Permission
    const hasPermission = req.user.role === 'Admin' || (req.user.permissions && req.user.permissions.includes('/logs'));

    if (!req.user || !hasPermission) {
        return res.status(403).json({ message: 'Access denied. Admin rights or explicit permission required.' });
    }

    try {
        const { search, limit } = req.query;
        const { Op } = require('sequelize');

        const whereClause = {};

        if (search) {
            const searchLower = `%${search.toLowerCase()}%`;
            // Use generic Op.like for compatibility (SQLite handles case-insensitivity on ASCII, Postgres requires ILIKE usually but we can use Op.iLike check or just raw WHERE if needed, but let's try Op.like or implicit)
            // Ideally check dialect.
            const sequelize = require('../config/database');
            const isPostgres = sequelize.getDialect() === 'postgres';
            const likeOp = isPostgres ? Op.iLike : Op.like;

            whereClause[Op.or] = [
                { staffName: { [likeOp]: `%${search}%` } },
                { action: { [likeOp]: `%${search}%` } },
                { entityType: { [likeOp]: `%${search}%` } },
                { details: { [likeOp]: `%${search}%` } }
            ];
        }

        const logs = await AuditLog.findAll({
            where: whereClause,
            order: [['createdAt', 'DESC']],
            limit: parseInt(limit) || 100
        });
        res.json(logs);
    } catch (error) {
        console.error('Fetch Logs Error:', error);
        res.status(500).json({ message: 'Failed to fetch audit logs' });
    }
});

module.exports = router;
