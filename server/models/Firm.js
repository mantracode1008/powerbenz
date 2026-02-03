const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Firm = sequelize.define('Firm', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true
    },
    shortCode: {
        type: DataTypes.STRING
    },
    notes: {
        type: DataTypes.TEXT
    }
});

module.exports = Firm;
