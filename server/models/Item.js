const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Item = sequelize.define('Item', {
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
    defaultRate: {
        type: DataTypes.FLOAT,
        defaultValue: 0,
        validate: {
            min: 0
        }
    },
    category: {
        type: DataTypes.STRING,
        defaultValue: 'General'
    },
    hsnCode: {
        type: DataTypes.STRING,
        allowNull: true
    },
    order: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    }
});

module.exports = Item;
