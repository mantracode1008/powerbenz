const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ScrapType = sequelize.define('ScrapType', {
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
    description: {
        type: DataTypes.TEXT
    }
});

module.exports = ScrapType;
