const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const Sale = require('./Sale');
const ContainerItem = require('./ContainerItem');

const SaleAllocation = sequelize.define('SaleAllocation', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    quantity: {
        type: DataTypes.FLOAT,
        allowNull: false,
        validate: {
            min: 0
        }
    },
    gain: {
        type: DataTypes.FLOAT,
        defaultValue: 0,
        validate: {
            min: 0
        }
    }
});

// Associations
Sale.hasMany(SaleAllocation, { as: 'allocations', foreignKey: 'saleId', onDelete: 'CASCADE' });
SaleAllocation.belongsTo(Sale, { foreignKey: 'saleId' });

ContainerItem.hasMany(SaleAllocation, { as: 'salesAllocations', foreignKey: 'containerItemId' });
SaleAllocation.belongsTo(ContainerItem, { foreignKey: 'containerItemId' });

module.exports = SaleAllocation;
