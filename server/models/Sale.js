const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Sale = sequelize.define('Sale', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
        defaultValue: DataTypes.NOW
    },
    itemName: {
        type: DataTypes.STRING,
        allowNull: false
    },
    hsnCode: {
        type: DataTypes.STRING,
        allowNull: true
    },
    quantity: {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 0
    },
    rate: {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 0
    },
    totalAmount: {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 0
    },
    buyerName: {
        type: DataTypes.STRING,
        allowNull: false
    },
    invoiceNo: {
        type: DataTypes.STRING
    },
    paymentStatus: {
        type: DataTypes.ENUM('Pending', 'Paid', 'Partial'),
        defaultValue: 'Pending'
    },
    remarks: {
        type: DataTypes.STRING,
        allowNull: true
    }
}, {
    indexes: [
        {
            fields: ['date']
        },
        {
            fields: ['itemName']
        },
        {
            fields: ['paymentStatus']
        }
    ]
});

module.exports = Sale;
