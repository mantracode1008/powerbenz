const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const Item = require('./Item');

const ItemRateHistory = sequelize.define('ItemRateHistory', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    itemId: {
        type: DataTypes.UUID, // Or Integer depending on Item.id type, usually UUID in this project
        allowNull: false
    },
    itemName: {
        type: DataTypes.STRING,
        allowNull: false
    },
    oldRate: {
        type: DataTypes.FLOAT,
        defaultValue: 0
    },
    newRate: {
        type: DataTypes.FLOAT,
        allowNull: false
    },
    effectiveDate: {
        type: DataTypes.DATE, // The date this rate was applied
        defaultValue: DataTypes.NOW
    },
    changedBy: {
        type: DataTypes.STRING, // Admin's name
        allowNull: true
    }
});

// Association
Item.hasMany(ItemRateHistory, { foreignKey: 'itemId' });
ItemRateHistory.belongsTo(Item, { foreignKey: 'itemId' });

module.exports = ItemRateHistory;
