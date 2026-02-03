const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const Container = require('./Container');

const ContainerItem = sequelize.define('ContainerItem', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    itemName: {
        type: DataTypes.STRING,
        allowNull: false
    },
    quantity: {
        type: DataTypes.FLOAT,
        defaultValue: 0,
        validate: {
            min: 0
        }
    },
    rate: {
        type: DataTypes.FLOAT,
        defaultValue: 0,
        validate: {
            min: 0
        }
    },
    amount: {
        type: DataTypes.FLOAT,
        defaultValue: 0,
        validate: {
            min: 0
        }
    },
    remainingQuantity: {
        type: DataTypes.FLOAT,
        defaultValue: 0,
        validate: {
            min: 0
        }
    },
    unloadDate: {
        type: DataTypes.DATE,
        allowNull: true
    }
}, {
    indexes: [
        {
            fields: ['itemName']
        },
        {
            fields: ['containerId']
        },
        {
            fields: ['unloadDate']
        }
    ]
});

// Associations
Container.hasMany(ContainerItem, { as: 'items', foreignKey: 'containerId', onDelete: 'CASCADE' });
ContainerItem.belongsTo(Container, { foreignKey: 'containerId' });

module.exports = ContainerItem;
