const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const AuditLog = sequelize.define('AuditLog', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    staffId: {
        type: DataTypes.STRING, // Changed from INTEGER to match Staff UUID and prevent type errors
        allowNull: true
    },
    staffName: {
        type: DataTypes.STRING,
        allowNull: true
    },
    action: {
        type: DataTypes.STRING,
        allowNull: false
    },
    entityType: {
        type: DataTypes.STRING, // 'Container', 'Staff', 'Auth'
        allowNull: true
    },
    entityId: {
        type: DataTypes.STRING,
        allowNull: true
    },
    details: {
        type: DataTypes.TEXT, // JSON string or text description
        allowNull: true
    },
    ipAddress: {
        type: DataTypes.STRING,
        allowNull: true
    }
});

module.exports = AuditLog;
