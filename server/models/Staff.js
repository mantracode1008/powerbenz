const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Staff = sequelize.define('Staff', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false
    },
    workerNo: {
        type: DataTypes.STRING,
        // unique: true // Temporarily disabled to allow startup with duplicate data
    },
    email: {
        type: DataTypes.STRING,
        allowNull: true
    },
    googleId: {
        type: DataTypes.STRING,
        allowNull: true
    },
    password: {
        type: DataTypes.STRING,
        allowNull: true
    },
    pin: {
        type: DataTypes.STRING, // Hashed PIN (or plain if requested simple)
        allowNull: true
    },
    otp: {
        type: DataTypes.STRING, // Hashed or plain? Plain for simplicity now (expired quickly)
        allowNull: true
    },
    otpExpires: {
        type: DataTypes.DATE,
        allowNull: true
    },
    role: {
        type: DataTypes.STRING,
        defaultValue: 'Worker'
    },
    phone: {
        type: DataTypes.STRING
    },
    dailyWage: {
        type: DataTypes.FLOAT,
        defaultValue: 0
    },
    isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    },
    permissions: {
        type: DataTypes.JSON, // Stores array of allowed paths/module names e.g. ['/dashboard', '/sales']
        defaultValue: null
    }
});

module.exports = Staff;
